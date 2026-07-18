// POST /api/recruitment/onboarding/:id/complete
// Completes an onboarding and promotes the person into staff_records (StaffRecord).
// Works for both external hires and recruited candidates whose offer was accepted.
// Sends a congratulatory email with a link to set up their profile/password.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'
import { sign } from 'jsonwebtoken'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

// Derives a job "code" prefix (up to 4 alnum chars) from the job title/department.
function jobCodePrefix(job: { title?: string | null; department?: string | null } | null | undefined): string {
  const source = (job?.title || job?.department || '').replace(/[^a-zA-Z0-9]/g, '')
  const code = source.slice(0, 4).toUpperCase()
  return code || 'EMP'
}

// Auto-generates a unique staff id from the job code + a sequential number,
// e.g. "BUSI-0001". Scans existing ids for the prefix and takes the next number,
// then guards against collisions within the company.
async function generateStaffId(companyId: string, job: any): Promise<string> {
  const prefix = jobCodePrefix(job)
  const existing = await prisma.staffRecord.findMany({
    where: { companyId, staffId: { startsWith: `${prefix}-` } },
    select: { staffId: true },
  })
  let max = 0
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  for (const s of existing) {
    const m = s.staffId.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  let n = max + 1
  let candidate = `${prefix}-${String(n).padStart(4, '0')}`
  // Defensive: ensure the id isn't already taken in this company.
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.staffRecord.findFirst({ where: { companyId, staffId: candidate }, select: { id: true } })) {
    n += 1
    candidate = `${prefix}-${String(n).padStart(4, '0')}`
  }
  return candidate
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const onboarding = await prisma.onboarding.findFirst({
      where: { id, companyId },
      include: {
        offer: {
          include: {
            candidate: true,
            application: { select: { id: true, jobId: true, job: { select: { title: true, department: true } } } },
          },
        },
      },
    })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)
    if (onboarding.staffRecordId) return withCors(ApiResponse.error('This onboarding has already been completed', 409), origin)

    const offer = onboarding.offer
    const candidate = offer?.candidate
    if (!candidate) return withCors(ApiResponse.error('Onboarding has no candidate to promote', 400), origin)

    const body = await request.json().catch(() => ({}))
    const email = candidate.email
    const job = (offer as any).application?.job

    // Guard against promoting someone who is already staff in this company.
    const existing = await prisma.staffRecord.findFirst({ where: { email, companyId }, select: { id: true, staffId: true } })
    if (existing) {
      return withCors(ApiResponse.error(`A staff record already exists for ${email} (staffId ${existing.staffId})`, 409), origin)
    }

    const position = String(body.position || job?.title || 'Staff').trim()
    const department = String(body.department || job?.department || 'General').trim()

    // The hire inherits the designation of the job they were recruited under, so
    // their staff record assumes that designation (and its title as position)
    // until they are later promoted/reassigned.
    const recruitedJobId = (offer as any).application?.jobId as string | undefined
    let designationId: string | null = null
    if (recruitedJobId) {
      const jobRow = await (prisma as any).job.findUnique({
        where: { id: recruitedJobId },
        select: { designationId: true },
      })
      designationId = jobRow?.designationId || null
    }

    // Staff ID priority: explicit (this step) → value captured at intake → auto-
    // generated from the job code + a sequential number.
    const meta = (offer?.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}
    const staffId = String(body.staffId || '').trim()
      || (meta.staffId ? String(meta.staffId).trim() : '')
      || await generateStaffId(companyId, job)

    const created = await prisma.$transaction(async (tx) => {
      const staff = await tx.staffRecord.create({
        data: {
          staffId,
          email,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          department,
          position,
          phone: body.phone ? String(body.phone).trim() : (candidate.phone || undefined),
          bankName: body.bankName ? String(body.bankName).trim() : undefined,
          accountNumber: body.accountNumber ? String(body.accountNumber).trim() : undefined,
          bvn: body.bvn ? String(body.bvn).trim() : undefined,
          companyId,
          createdBy: actor,
          role: 'STAFF',
          isActive: true,
          isRegistered: false,
          requirePasswordChange: true,
          ...(offer?.gradeId ? { currentGradeId: offer.gradeId } : {}),
          ...(designationId ? { designationId } : {}),
        } as any,
      })

      await tx.onboarding.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), staffRecordId: staff.id, updatedBy: actor },
      })

      // Keep the pipeline aligned.
      if ((offer as any).application?.id) {
        await tx.jobApplication.update({ where: { id: (offer as any).application.id }, data: { status: 'HIRED', updatedBy: actor } }).catch(() => {})
      }

      return staff
    })

    // ── Send congratulatory welcome email with profile setup link ───────────
    const comp = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } }).catch(() => null)
    const companyName = comp?.companyName || 'the company'
    const staffName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Valued Staff'
    const setupUrl = `${FRONTEND_URL}/complete-registration?email=${encodeURIComponent(email)}&staffId=${encodeURIComponent(created.staffId)}`

    const welcomeHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 24px; max-width: 560px; margin: 0 auto;">
        <div style="text-align: center; padding: 32px 0 24px; border-bottom: 2px solid #10b981;">
          <h1 style="margin: 0; font-size: 22px; color: #10b981; font-weight: 800;">Welcome to ${companyName}!</h1>
        </div>

        <p style="margin: 24px 0 16px; font-size: 15px;">Dear ${staffName},</p>

        <p style="margin: 12px 0; font-size: 15px; line-height: 1.7;">
          Congratulations on successfully completing your onboarding process.
          We are delighted to officially welcome you to the <strong>${companyName}</strong> team.
        </p>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
            <strong>Your Staff ID:</strong> ${created.staffId}
          </p>
          <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
            Click the button below to set up your profile and create your password.
            You will need to set your password before you can log in to the portal.
          </p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${setupUrl}"
               style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none;
                      font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 8px;">
              Set Up Your Profile
            </a>
          </div>
          <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280; text-align: center;">
            If the button does not work, copy and paste this URL into your browser:<br/>
            <span style="word-break: break-all;">${setupUrl}</span>
          </p>
        </div>

        <p style="margin: 16px 0; font-size: 14px; line-height: 1.6;">
          Once your profile is set up, you will have access to your dashboard, payslips,
          leave management, and other employee resources.
        </p>

        <p style="margin: 20px 0 4px; font-size: 14px;">Best regards,</p>
        <p style="margin: 4px 0; font-size: 14px; font-weight: 700;">The ${companyName} Team</p>

        <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
          <p style="margin: 0;">This is an automated message from the 247HR platform. Please do not reply to this email.</p>
        </div>
      </body>
      </html>
    `

    const welcomeText = `Welcome to ${companyName}!

Dear ${staffName},

Congratulations on successfully completing your onboarding process. We are delighted to officially welcome you to the ${companyName} team.

Your Staff ID: ${created.staffId}

Click the link below to set up your profile and create your password. You will need to set your password before you can log in to the portal.

${setupUrl}

Once your profile is set up, you will have access to your dashboard, payslips, leave management, and other employee resources.

Best regards,
The ${companyName} Team`

    // Fire-and-forget email send — never block the complete response.
    sendEmail({
      to: email,
      subject: `🎉 Welcome to ${companyName} — Set Up Your Profile`,
      html: welcomeHtml,
      text: welcomeText,
    }).then((r) => {
      if (!r.success) console.error('[ONBOARDING_COMPLETE] Welcome email failed:', r.error)
    }).catch((err) => console.error('[ONBOARDING_COMPLETE] Welcome email error:', err))

    return withCors(ApiResponse.success({
      staffRecordId: created.id,
      staffId: created.staffId,
      onboardingId: id,
      status: 'COMPLETED',
    }, 'Onboarding completed. The employee has been added to staff records.'), origin)
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return withCors(ApiResponse.error('A staff record with that staff ID or email already exists', 409), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
