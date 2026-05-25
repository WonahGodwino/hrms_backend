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
    const { rows, errors: parseErrors } = await parseStaffCsv(buffer, ext)

    if (rows.length === 0)
      return withCors(ApiResponse.error('No valid rows found in file', 400), origin)

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
            staffId:    r.staffId,
            firstName:  r.firstName,
            lastName:   r.lastName,
            email:      cleanEmail,
            phone:      r.phone    || null,
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
            annualRent:          r.annualRent  ? Number(r.annualRent)  : null,
            basicSalary:         r.basicSalary ? Number(r.basicSalary) : null,
            hasLifeAssurance:    hasLA,
            lifeAssuranceAmount: hasLA ? laAmount : null,
            createdBy: user.userId,
          },
          update: {
            firstName:  r.firstName,
            lastName:   r.lastName,
            email:      cleanEmail,
            phone:      r.phone    || null,
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
            annualRent:          r.annualRent  ? Number(r.annualRent)  : null,
            basicSalary:         r.basicSalary ? Number(r.basicSalary) : null,
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

    if (successful === 0 && rows.length > 0)
      return withCors(ApiResponse.error(`All ${rows.length} row(s) failed. Errors: ${rowErrors.slice(0, 3).join('; ')}`, 400), origin)

    const message = failed > 0
      ? `${successful} staff uploaded, ${failed} failed`
      : `${successful} staff uploaded successfully`

    return withCors(
      ApiResponse.success({ successful, failed, errors: rowErrors }, message),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

