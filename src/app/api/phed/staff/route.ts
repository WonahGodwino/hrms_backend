import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { sendPhedWelcomeEmail } from '@/app/lib/phed/email'
import { NOTIFICATION_TYPES, createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/staff?companyId=xxx&category=REGULAR&search=&page=1&limit=50
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const p         = new URL(req.url).searchParams
    const companyId = p.get('companyId')
    const category  = p.get('category')
    const search    = p.get('search') || ''
    const page      = Math.max(1, Number(p.get('page') || 1))
    const limit     = Math.min(100, Math.max(1, Number(p.get('limit') || 50)))

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const where: any = {
      companyId,
      isActive: true,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { firstName:  { contains: search, mode: 'insensitive' } },
              { lastName:   { contains: search, mode: 'insensitive' } },
              { staffId:    { contains: search, mode: 'insensitive' } },
              { email:      { contains: search, mode: 'insensitive' } },
              { department: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    // ── Fetch staff with safe includes (avoid cascading failures from orphaned
    //     union/cooperative join records).  The first attempt includes nested
    //     relations; if Prisma throws because of broken referential integrity,
    //     we fall back to a query without unions/cooperatives and attach them
    //     separately. ─────────────────────────────────────────────────
    let total: number
    let staff: any[]

    const baseQuery = {
      where,
      orderBy: [{ lastName: 'asc' as const }, { firstName: 'asc' as const }],
      skip:  (page - 1) * limit,
      take:  limit,
    }

    try {
      ;[total, staff] = await Promise.all([
        (prisma as any).phedStaff.count({ where }),
        (prisma as any).phedStaff.findMany({
          ...baseQuery,
          include: {
            grade:    true,
            region:   true,
            feeder:   true,
            payPoint: true,
            unions:   { include: { union: true } },
            cooperatives: { include: { cooperative: true } },
          },
        }),
      ])
    } catch (_fullQueryError) {
      // Fallback: query without union/cooperative nested includes, then
      // attach them manually to avoid Prisma-level relation errors.
      console.warn('[PHED staff] Full include query failed, falling back to safe query:', _fullQueryError)

      ;[total, staff] = await Promise.all([
        (prisma as any).phedStaff.count({ where }),
        (prisma as any).phedStaff.findMany({
          ...baseQuery,
          include: {
            grade:    true,
            region:   true,
            feeder:   true,
            payPoint: true,
            // unions + cooperatives fetched separately below
          },
        }),
      ])

      // Attach unions and cooperatives manually
      const staffIds = staff.map((s: any) => s.id)
      if (staffIds.length > 0) {
        const [allUnions, allCooperatives] = await Promise.all([
          (prisma as any).phedStaffUnion.findMany({
            where: { staffId: { in: staffIds } },
            include: { union: true },
          }).catch(() => [] as any[]),
          (prisma as any).phedStaffCooperative.findMany({
            where: { staffId: { in: staffIds } },
            include: { cooperative: true },
          }).catch(() => [] as any[]),
        ])

        const unionMap    = new Map<string, any[]>()
        const coopMap     = new Map<string, any[]>()
        for (const u of allUnions) {
          if (!unionMap.has(u.staffId)) unionMap.set(u.staffId, [])
          unionMap.get(u.staffId)!.push(u)
        }
        for (const c of allCooperatives) {
          if (!coopMap.has(c.staffId)) coopMap.set(c.staffId, [])
          coopMap.get(c.staffId)!.push(c)
        }

        for (const s of staff) {
          s.unions       = unionMap.get(s.id) || []
          s.cooperatives = coopMap.get(s.id) || []
        }
      }
    }

    // Sanitise staff records: null out any union/cooperative join rows whose
    // referenced parent was deleted (prevents JSON-serialisation crashes).
    for (const s of staff) {
      if (s.unions) {
        s.unions = s.unions.filter((su: any) => su.union != null)
      }
      if (s.cooperatives) {
        s.cooperatives = s.cooperatives.filter((sc: any) => sc.cooperative != null)
      }
    }

    return withCors(
      ApiResponse.success({ staff, total, page, limit, pages: Math.ceil(total / limit) }),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/phed/staff — create single staff member
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const {
      companyId, staffId, firstName, lastName, email, phone,
      jobTitle, resumptionDate, level, callCenter,
      category, gradeId, department, unit, regionId, feederId, payPointId,
      bankName, accountNumber, accountName, rsaPin, pfaName, pensionNumber, tin, nhfNumber, annualRent,
      basicSalary, housingAllowance, transportAllowance, furnitureAllowance,
      mealSubsidy, utilityAllowance, leaveAllowance,
      domesticAllowance, hazardAllowance, electricityAllowance, discoveryAllowance,
      carSubsidy, entertainmentAllowance, dataAllowance, nightAllowance, arrears,
      otherAllowances, hasLifeAssurance, lifeAssuranceAmount,
      voluntaryPension, insurance, cashAdvanced, loan, domesticLoan,
    } = body

    if (!companyId || !staffId || !firstName || !lastName || !email)
      return withCors(ApiResponse.error('companyId, staffId, firstName, lastName, email are required', 400), origin)

    if (hasLifeAssurance && (!lifeAssuranceAmount || Number(lifeAssuranceAmount) <= 0))
      return withCors(ApiResponse.error('lifeAssuranceAmount is required and must be greater than 0 when hasLifeAssurance is true', 400), origin)

    // HR/ADMIN can only create staff in their own company; SUPER_ADMIN can use any companyId
    if (user.role !== 'SUPER_ADMIN' && user.companyId && user.companyId !== companyId)
      return withCors(ApiResponse.error('You do not have permission to create staff in this company', 403), origin)

    const cleanEmail = email.toLowerCase().trim()

    // ── Check for duplicates before attempting insert ─────
    const existing = await (prisma as any).phedStaff.findFirst({
      where: {
        companyId,
        OR: [
          { staffId },
          { email: cleanEmail },
        ],
      },
      select: { staffId: true, email: true },
    })

    if (existing) {
      if (existing.staffId === staffId)
        return withCors(ApiResponse.error(`Staff ID "${staffId}" is already registered in this company`, 409), origin)
      if (existing.email === cleanEmail)
        return withCors(ApiResponse.error(`Email "${cleanEmail}" is already registered in this company`, 409), origin)
    }

    // ── Provision password (computed before transaction) ──
    const plainPassword = `${firstName}${lastName}`.toLowerCase().replace(/\s+/g, '')
    const hashedPassword = await bcrypt.hash(plainPassword, 10)

    // ── Get company name for welcome email ────────────────
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { companyName: true },
    })
    const companyName = company?.companyName ?? 'Your Company'

    // ── Atomic: create phedStaff + upsert staffRecord ─────
    // Both writes are in a transaction — if either fails nothing is persisted.
    const [staff] = await prisma.$transaction([
      (prisma as any).phedStaff.create({
        data: {
          companyId, staffId, firstName, lastName,
          email:    cleanEmail,
          phone:    phone || null,
          jobTitle: jobTitle || null,
          level:    level    || null,
          callCenter: callCenter || null,
          resumptionDate: resumptionDate ? (() => { try { const d = new Date(resumptionDate); return isNaN(d.getTime()) ? null : d } catch { return null } })() : null,
          category: ['REGULAR', 'CONTRACT', 'NYSC_IT'].includes(category) ? category : 'REGULAR',
          gradeId:  gradeId  || null,
          department: department || null,
          unit:       unit       || null,
          regionId:   regionId   || null,
          feederId:   feederId   || null,
          payPointId: payPointId || null,
          bankName:      bankName      || null,
          accountNumber: accountNumber || null,
          accountName:   accountName   || null,
          rsaPin:        rsaPin        || null,
          pfaName:       pfaName       || null,
          pensionNumber: pensionNumber || null,
          tin:           tin           || null,
          nhfNumber:     nhfNumber     || null,
          annualRent:    annualRent    ? Number(annualRent)    : null,
          basicSalary:   basicSalary   ? Number(basicSalary)   : null,
          housingAllowance:   housingAllowance   ? Number(housingAllowance)   : null,
          transportAllowance: transportAllowance ? Number(transportAllowance) : null,
          furnitureAllowance: furnitureAllowance ? Number(furnitureAllowance) : null,
          mealSubsidy:        mealSubsidy        ? Number(mealSubsidy)        : null,
          utilityAllowance:   utilityAllowance   ? Number(utilityAllowance)   : null,
          leaveAllowance:     leaveAllowance     ? Number(leaveAllowance)     : null,
          domesticAllowance:      domesticAllowance      ? Number(domesticAllowance)      : null,
          hazardAllowance:        hazardAllowance        ? Number(hazardAllowance)        : null,
          electricityAllowance:   electricityAllowance   ? Number(electricityAllowance)   : null,
          discoveryAllowance:     discoveryAllowance     ? Number(discoveryAllowance)     : null,
          carSubsidy:             carSubsidy             ? Number(carSubsidy)             : null,
          entertainmentAllowance: entertainmentAllowance ? Number(entertainmentAllowance) : null,
          dataAllowance:          dataAllowance          ? Number(dataAllowance)          : null,
          nightAllowance:         nightAllowance         ? Number(nightAllowance)         : null,
          arrears:                arrears                ? Number(arrears)                : null,
          otherAllowances:        otherAllowances        ? Number(otherAllowances)        : null,
          voluntaryPension:       voluntaryPension       ? Number(voluntaryPension)       : null,
          insurance:              insurance              ? Number(insurance)              : null,
          cashAdvanced:           cashAdvanced           ? Number(cashAdvanced)           : null,
          loan:                   loan                   ? Number(loan)                   : null,
          domesticLoan:           domesticLoan           ? Number(domesticLoan)           : null,
          hasLifeAssurance:       Boolean(hasLifeAssurance),
          lifeAssuranceAmount:    hasLifeAssurance && lifeAssuranceAmount ? Number(lifeAssuranceAmount) : null,
          createdBy: user.userId,
        },
        include: { grade: true, region: true, feeder: true, payPoint: true },
      }),
      prisma.staffRecord.upsert({
        where: { staffId_companyId: { staffId, companyId } },
        create: {
          staffId,
          email:                 cleanEmail,
          firstName:             firstName.trim(),
          lastName:              lastName.trim(),
          department:            department?.trim() || 'General',
          position:              'Staff',
          password:              hashedPassword,
          isRegistered:          true,
          role:                  'STAFF',
          isActive:              true,
          requirePasswordChange: true,
          companyId,
          createdBy: user.userId,
        } as any,
        update: {
          email:                 cleanEmail,
          firstName:             firstName.trim(),
          lastName:              lastName.trim(),
          password:              hashedPassword,
          requirePasswordChange: true,
          isActive:              true,
        } as any,
      }),
    ])

    // Welcome notification (same as regular staff onboarding)
    const staffAccountId = await prisma.staffRecord.findUnique({
      where: { email_companyId: { email: cleanEmail, companyId } },
      select: { id: true },
    })
    if (staffAccountId) {
      createNotification(
        staffAccountId.id,
        NOTIFICATION_TYPES.WELCOME_STAFF,
        `Welcome to ${companyName}`,
        `Hi ${firstName} ${lastName}, welcome to ${companyName}. We are glad to have you with us.`,
        { source: 'PHED_STAFF_CREATED', companyName, staffId },
        companyId
      ).catch(err => console.error('PHED welcome notification failed:', err))
    }

    // Send welcome email (fire and forget — don't fail the request if email fails)
    sendPhedWelcomeEmail({
      firstName, lastName,
      email:       cleanEmail,
      staffId,
      password:    plainPassword,
      companyName,
    }).catch(err => console.error('PHED welcome email failed:', err))

    return withCors(ApiResponse.success(staff, 'Staff created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

