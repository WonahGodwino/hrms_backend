// src/app/lib/device/device-utils.ts
// Small helpers for Device Management: IP/User-Agent extraction (cosmetic +
// audit fields only, never used as device identity — see Device.deviceKey)
// and the non-fatal StaffActivityLog write pattern mirrored from
// department-utils.ts's logDepartmentAction.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return '127.0.0.1'
}

export function parseUserAgent(userAgent: string | null): { deviceName: string; deviceType: string } {
  if (!userAgent) return { deviceName: 'Unknown device', deviceType: 'OTHER' }

  const ua = userAgent

  let browser = 'Unknown browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\//.test(ua)) browser = 'Opera'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = 'Unknown OS'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  let deviceType = 'DESKTOP'
  if (/iPad|Tablet/.test(ua)) deviceType = 'TABLET'
  else if (/Mobi|Android.*Mobile|iPhone/.test(ua)) deviceType = 'MOBILE'

  return { deviceName: `${browser} on ${os}`, deviceType }
}

export type StaffActivityAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_BLOCKED_ATTEMPT'
  | 'DEVICE_REGISTERED'
  | 'DEVICE_EVICTED'
  | 'DEVICE_CLEARED'
  | 'LOGOUT'
  | 'STAFF_BLOCKED'
  | 'STAFF_UNBLOCKED'
  | 'PASSWORD_RESET_BY_ADMIN'
  | 'ACCOUNT_UNREGISTERED'
  // Staff Loans & Benefits
  | 'LOAN_APPLIED'
  | 'LOAN_APPROVAL_STEP_ACTED'
  | 'LOAN_REJECTED'
  | 'LOAN_DISBURSED'
  | 'LOAN_INSTALLMENT_RECORDED'
  | 'GUARANTOR_CONSENT_GIVEN'
  | 'GUARANTOR_CONSENT_DECLINED'
  | 'BENEFIT_REQUESTED'
  | 'BENEFIT_REQUEST_DECIDED'
  | 'BENEFIT_ALLOCATED'
  | 'BENEFIT_CLAIM_SUBMITTED'
  | 'BENEFIT_CLAIM_DECIDED'
  | 'LOANS_BENEFITS_ACCESS_CONFIG_UPDATED'
  // Recruitment
  | 'RECRUITMENT_ACCESS_CONFIG_UPDATED'
  // Pension Fund Administrators
  | 'PFA_COMPANY_ACCESS_UPDATED'

export async function logStaffActivity(params: {
  staffRecordId: string
  companyId: string
  action: StaffActivityAction
  performedById: string
  performedByName: string
  performedByRole: string
  details?: Record<string, any>
}) {
  try {
    await prisma.staffActivityLog.create({
      data: {
        staffRecordId: params.staffRecordId,
        companyId: params.companyId,
        action: params.action,
        performedById: params.performedById,
        performedByName: params.performedByName,
        performedByRole: params.performedByRole,
        details: params.details || {},
      },
    })
  } catch (error) {
    // Must never fail the parent action — same convention as
    // reconcileStaffDepartmentLink in admin/staff/edit/[id]/route.ts.
    console.error('Failed to write StaffActivityLog:', error)
  }
}
