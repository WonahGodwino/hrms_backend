import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseStaffCsv } from '@/app/lib/phed/csv-parser'
import { sendPhedWelcomeEmail } from '@/app/lib/phed/email'
import { NOTIFICATION_TYPES, createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null

    if (!file)      return withCors(ApiResponse.error('file is required', 400), origin)
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'csv'
    if (!['csv', 'xlsx', 'xls'].includes(ext))
      return withCors(ApiResponse.error('Only CSV or Excel files are supported', 400), origin)

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors: parseErrors, errorRows } = await parseStaffCsv(buffer, ext)

    // ── Generate error CSV when there are validation errors ──────
    function buildErrorCsv(errRows: Array<{ rowNum: number; raw: Record<string, string>; error: string }>): string {
      const cols = ['Row', 'Staff ID', 'First Name', 'Last Name', 'Email', 'Error']
      const header = cols.join(',')
      const body = errRows.map(er => {
        const staffId = er.raw['staffid'] || er.raw['employeeid'] || er.raw['staff_id'] || ''
        const firstName = er.raw['firstname'] || er.raw['first_name'] || ''
        const lastName  = er.raw['lastname'] || er.raw['last_name'] || ''
        const email     = er.raw['email'] || ''
        const csvSafe = (v: string) => `"${v.replace(/"/g, '""')}"`
        return [er.rowNum, csvSafe(staffId), csvSafe(firstName), csvSafe(lastName), csvSafe(email), csvSafe(er.error)].join(',')
      }).join('\n')
      return `${header}\n${body}`
    }

    const errorCsv = errorRows.length > 0 ? buildErrorCsv(errorRows) : null

    if (rows.length === 0) {
      console.error(`[PHED upload] No valid rows. File: ${file.name} (${ext}), parseErrors: ${parseErrors.length}`,
        parseErrors.length > 0 ? parseErrors.slice(0, 5) : '(none)')

      // Distinguish: parse errors vs truly empty/blank file
      if (parseErrors.length > 0) {
        const msg = parseErrors.length === 1
          ? parseErrors[0]
          : `${parseErrors.length} rows have errors — ${parseErrors.slice(0, 3).join('; ')}${parseErrors.length > 3 ? ` (+${parseErrors.length - 3} more)` : ''}`
        return withCors(ApiResponse.error(msg, 400, undefined, errorCsv ? { errorCsv, errorFileName: `upload-errors-${file.name.replace(/\.(xlsx|xls|csv)$/i, '')}.csv` } : undefined), origin)
      }

      return withCors(ApiResponse.error('No valid rows found in file — the file may be empty or contain only blank rows. Please fill in at least one staff record.', 400), origin)
    }

    // Load lookup tables and company name in parallel
    const [grades, regions, feeders, payPoints, company] = await Promise.all([
      (prisma as any).phedGrade.findMany({ where: { companyId } }),
      (prisma as any).phedRegion.findMany({ where: { companyId } }),
      (prisma as any).phedFeeder.findMany({ where: { companyId } }),
      (prisma as any).phedPayPoint.findMany({ where: { companyId } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } }),
    ])

    const companyName  = company?.companyName ?? 'Your Company'
    const gradeMap     = new Map(grades.map((g: any) => [g.code.toLowerCase(), g.id]))
    const regionMap    = new Map(regions.map((r: any) => [r.name.toLowerCase(), r.id]))
    const feederMap    = new Map(feeders.map((f: any) => [f.name.toLowerCase(), f.id]))
    const payPointMap  = new Map(payPoints.map((p: any) => [p.name.toLowerCase(), p.id]))

    let successful = 0
    let failed     = 0
    const rowErrors: string[] = [...parseErrors]

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      try {
        const categoryRaw   = (r.category || 'REGULAR').toUpperCase().replace(/[\s/]+/g, '_')
        const categoryUpper = categoryRaw === 'NYSC_IT' || categoryRaw === 'NYSCIT' ? 'NYSC_IT' : categoryRaw
        const category = ['REGULAR', 'CONTRACT', 'NYSC_IT'].includes(categoryUpper) ? categoryUpper : 'REGULAR'
        const cleanEmail = r.email.toLowerCase().trim()

        const hasLA = ['yes', 'true', '1'].includes((r.hasLifeAssurance || '').toLowerCase().trim())
        const laAmount = r.lifeAssuranceAmount ? Number(r.lifeAssuranceAmount) : 0
        if (hasLA && laAmount <= 0) {
          rowErrors.push(`Row ${i + 2}: lifeAssuranceAmount must be greater than 0 when hasLifeAssurance is YES`)
          failed++
          continue
        }

        // ── Upsert PHED staff record ─────────────────────────
        await (prisma as any).phedStaff.upsert({
          where: { companyId_staffId: { companyId, staffId: r.staffId } },
          create: {
            companyId,
            staffId:       r.staffId,
            firstName:     r.firstName,
            lastName:      r.lastName,
            email:         cleanEmail,
            phone:         r.phone    || null,
            jobTitle:      r.jobTitle || null,
            level:         r.level    || null,
            callCenter:    r.callCenter || null,
            resumptionDate: r.resumptionDate ? (() => { try { const d = new Date(r.resumptionDate!); return isNaN(d.getTime()) ? null : d } catch { return null } })() : null,
            category,
            gradeId:    r.gradeCode ? (gradeMap.get(r.gradeCode.toLowerCase()) ?? null) : null,
            department: r.department || null,
            unit:       r.unit       || null,
            regionId:   r.region   ? (regionMap.get(r.region.toLowerCase())     ?? null) : null,
            feederId:   r.feeder   ? (feederMap.get(r.feeder.toLowerCase())     ?? null) : null,
            payPointId: r.payPoint ? (payPointMap.get(r.payPoint.toLowerCase()) ?? null) : null,
            bankName:      r.bankName      || null,
            accountNumber: r.accountNumber || null,
            accountName:   r.accountName   || null,
            rsaPin:        r.rsaPin        || null,
            pfaName:       r.pfaName       || null,
            pensionNumber: r.pensionNumber || null,
            tin:           r.tin           || null,
            nhfNumber:     r.nhfNumber     || null,
            annualRent:            r.annualRent            ? Number(r.annualRent)            : null,
            basicSalary:           r.basicSalary           ? Number(r.basicSalary)           : null,
            housingAllowance:      r.housingAllowance      ? Number(r.housingAllowance)      : null,
            transportAllowance:    r.transportAllowance    ? Number(r.transportAllowance)    : null,
            furnitureAllowance:    r.furnitureAllowance    ? Number(r.furnitureAllowance)    : null,
            domesticAllowance:     r.domesticAllowance     ? Number(r.domesticAllowance)     : null,
            mealSubsidy:           r.mealSubsidy           ? Number(r.mealSubsidy)           : null,
            hazardAllowance:       r.hazardAllowance       ? Number(r.hazardAllowance)       : null,
            leaveAllowance:        r.leaveAllowance        ? Number(r.leaveAllowance)        : null,
            electricityAllowance:  r.electricityAllowance  ? Number(r.electricityAllowance)  : null,
            utilityAllowance:      r.utilityAllowance      ? Number(r.utilityAllowance)      : null,
            discoveryAllowance:    r.discoveryAllowance    ? Number(r.discoveryAllowance)    : null,
            carSubsidy:            r.carSubsidy            ? Number(r.carSubsidy)            : null,
            entertainmentAllowance:r.entertainmentAllowance? Number(r.entertainmentAllowance): null,
            dataAllowance:         r.dataAllowance         ? Number(r.dataAllowance)         : null,
            nightAllowance:        r.nightAllowance        ? Number(r.nightAllowance)        : null,
            otherAllowances:       r.otherAllowances       ? Number(r.otherAllowances)       : null,
            arrears:               r.arrears               ? Number(r.arrears)               : null,
            voluntaryPension:      r.voluntaryPension      ? Number(r.voluntaryPension)      : null,
            insurance:             r.insurance             ? Number(r.insurance)             : null,
            cashAdvanced:          r.cashAdvanced          ? Number(r.cashAdvanced)          : null,
            loan:                  r.loan                  ? Number(r.loan)                  : null,
            domesticLoan:          r.domesticLoan          ? Number(r.domesticLoan)          : null,
            hasLifeAssurance:    hasLA,
            lifeAssuranceAmount: hasLA ? laAmount : null,
            createdBy: user.userId,
          },
          update: {
            firstName:  r.firstName,
            lastName:   r.lastName,
            email:      cleanEmail,
            phone:      r.phone    || null,
            jobTitle:   r.jobTitle || null,
            level:      r.level    || null,
            callCenter: r.callCenter || null,
            resumptionDate: r.resumptionDate ? (() => { try { const d = new Date(r.resumptionDate!); return isNaN(d.getTime()) ? null : d } catch { return null } })() : null,
            category,
            gradeId:    r.gradeCode ? (gradeMap.get(r.gradeCode.toLowerCase()) ?? null) : null,
            department: r.department || null,
            unit:       r.unit       || null,
            regionId:   r.region   ? (regionMap.get(r.region.toLowerCase())     ?? null) : null,
            feederId:   r.feeder   ? (feederMap.get(r.feeder.toLowerCase())     ?? null) : null,
            payPointId: r.payPoint ? (payPointMap.get(r.payPoint.toLowerCase()) ?? null) : null,
            bankName:      r.bankName      || null,
            accountNumber: r.accountNumber || null,
            accountName:   r.accountName   || null,
            rsaPin:        r.rsaPin        || null,
            pfaName:       r.pfaName       || null,
            pensionNumber: r.pensionNumber || null,
            tin:           r.tin           || null,
            nhfNumber:     r.nhfNumber     || null,
            annualRent:            r.annualRent            ? Number(r.annualRent)            : null,
            basicSalary:           r.basicSalary           ? Number(r.basicSalary)           : null,
            housingAllowance:      r.housingAllowance      ? Number(r.housingAllowance)      : null,
            transportAllowance:    r.transportAllowance    ? Number(r.transportAllowance)    : null,
            furnitureAllowance:    r.furnitureAllowance    ? Number(r.furnitureAllowance)    : null,
            domesticAllowance:     r.domesticAllowance     ? Number(r.domesticAllowance)     : null,
            mealSubsidy:           r.mealSubsidy           ? Number(r.mealSubsidy)           : null,
            hazardAllowance:       r.hazardAllowance       ? Number(r.hazardAllowance)       : null,
            leaveAllowance:        r.leaveAllowance        ? Number(r.leaveAllowance)        : null,
            electricityAllowance:  r.electricityAllowance  ? Number(r.electricityAllowance)  : null,
            utilityAllowance:      r.utilityAllowance      ? Number(r.utilityAllowance)      : null,
            discoveryAllowance:    r.discoveryAllowance    ? Number(r.discoveryAllowance)    : null,
            carSubsidy:            r.carSubsidy            ? Number(r.carSubsidy)            : null,
            entertainmentAllowance:r.entertainmentAllowance? Number(r.entertainmentAllowance): null,
            dataAllowance:         r.dataAllowance         ? Number(r.dataAllowance)         : null,
            nightAllowance:        r.nightAllowance        ? Number(r.nightAllowance)        : null,
            otherAllowances:       r.otherAllowances       ? Number(r.otherAllowances)       : null,
            arrears:               r.arrears               ? Number(r.arrears)               : null,
            voluntaryPension:      r.voluntaryPension      ? Number(r.voluntaryPension)      : null,
            insurance:             r.insurance             ? Number(r.insurance)             : null,
            cashAdvanced:          r.cashAdvanced          ? Number(r.cashAdvanced)          : null,
            loan:                  r.loan                  ? Number(r.loan)                  : null,
            domesticLoan:          r.domesticLoan          ? Number(r.domesticLoan)          : null,
            hasLifeAssurance:    hasLA,
            lifeAssuranceAmount: hasLA ? laAmount : null,
          },
        })

        // ── Provision 24/7HR login account ─────────────────
        const plainPassword  = `${r.firstName}${r.lastName}`.toLowerCase().replace(/\s+/g, '')
        const hashedPassword = await bcrypt.hash(plainPassword, 10)

        const existingAccount = await prisma.staffRecord.findUnique({
          where: { staffId_companyId: { staffId: r.staffId, companyId } },
          select: { id: true, password: true },
        })

        if (existingAccount) {
          // Account already exists — do not touch the password or requirePasswordChange flag.
          // Re-uploading staff data (e.g. to update department) must not force existing users
          // to change their password again.
        } else {
          // New account — create with temporary credentials
          await prisma.staffRecord.create({
            data: {
              staffId:               r.staffId,
              email:                 cleanEmail,
              firstName:             r.firstName.trim(),
              lastName:              r.lastName.trim(),
              department:            r.department?.trim() || 'General',
              position:              'Staff',
              password:              hashedPassword,
              isRegistered:          true,
              role:                  'STAFF',
              isActive:              true,
              requirePasswordChange: true,
              companyId,
              createdBy: user.userId,
            } as any,
          })

          // Welcome notification (same as regular staff onboarding)
          const newAccount = await prisma.staffRecord.findUnique({
            where: { staffId_companyId: { staffId: r.staffId, companyId } },
            select: { id: true },
          })
          if (newAccount) {
            createNotification(
              newAccount.id,
              NOTIFICATION_TYPES.WELCOME_STAFF,
              `Welcome to ${companyName}`,
              `Hi ${r.firstName} ${r.lastName}, welcome to ${companyName}. We are glad to have you with us.`,
              { source: 'PHED_STAFF_BULK_UPLOAD', companyName, staffId: r.staffId },
              companyId
            ).catch(err => console.error(`PHED welcome notification failed for ${cleanEmail}:`, err))
          }

          // Send welcome email in background (don't let email failure break the upload)
          sendPhedWelcomeEmail({
            firstName:   r.firstName,
            lastName:    r.lastName,
            email:       cleanEmail,
            staffId:     r.staffId,
            password:    plainPassword,
            companyName,
          }).catch(err => console.error(`PHED welcome email failed for ${cleanEmail}:`, err))
        }

        successful++
      } catch (err: any) {
        failed++
        rowErrors.push(`Row ${i + 2}: ${err.message}`)
      }
    }

    // Track upload
    await (prisma as any).phedBulkUpload.create({
      data: {
        companyId,
        type:         'STAFF',
        fileName:     file.name,
        totalRecords: rows.length,
        successful,
        failed,
        errors:       rowErrors.length > 0 ? rowErrors : undefined,
        uploadedBy:   user.userId,
      },
    })

    // Build combined error CSV from parse + processing errors
    const allErrors = [...rowErrors]
    const finalErrorCsv = allErrors.length > 0
      ? `Row,Error\n${allErrors.map(e => {
          const match = e.match(/^Row (\d+):?\s*(.*)$/)
          const row = match ? match[1] : ''
          const msg = match ? match[2].replace(/"/g, '""') : e.replace(/"/g, '""')
          return `${row},"${msg}"`
        }).join('\n')}`
      : null

    if (successful === 0 && rows.length > 0)
      return withCors(ApiResponse.error(
        `All ${rows.length} row(s) failed. Errors: ${rowErrors.slice(0, 3).join('; ')}`,
        400, undefined,
        finalErrorCsv ? { errorCsv: finalErrorCsv, errorFileName: `upload-errors-${file.name.replace(/\.(xlsx|xls|csv)$/i, '')}.csv` } : undefined
      ), origin)

    const message = failed > 0
      ? `${successful} staff uploaded, ${failed} failed`
      : `${successful} staff uploaded successfully`

    const respData: any = { successful, failed, errors: rowErrors }
    if (finalErrorCsv) {
      respData.errorCsv = finalErrorCsv
      respData.errorFileName = `upload-errors-${file.name.replace(/\.(xlsx|xls|csv)$/i, '')}.csv`
    }
    return withCors(ApiResponse.success(respData, message), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

