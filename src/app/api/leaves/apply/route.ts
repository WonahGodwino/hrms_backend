// /src/app/api/leaves/apply/route.ts - PRIMARY APPLICATION ENDPOINT
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import { prisma } from '@/app/lib/db'
import { sendLeaveNotificationEmail } from '@/app/lib/email'
import { ensureStaffLeaveBalances } from '@/app/lib/leaves/balance-engine'
import { 
  createLeaveNotification, 
  NOTIFICATION_TYPES,
  getNotificationsForLeaveRequest 
} from '@/app/lib/notifications/helpers'

const cuidOrUuidSchema = z.union([z.string().cuid(), z.string().uuid()])
const optionalIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  cuidOrUuidSchema.optional()
)
const optionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional()
)

// Validation schema for leave application
const leaveApplicationSchema = z.object({
  leaveTypeId: cuidOrUuidSchema,
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format. Use YYYY-MM-DD',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end date format. Use YYYY-MM-DD',
  }),
  reason: z.string().min(5).max(500),
  emergencyContact: z.string().optional(),
  contactPhone: z.string().optional(),
  handoverTo: optionalNonEmptyStringSchema,
  handoverNotes: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  isHalfDay: z.boolean().optional().default(false),
  halfDayPart: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional(),
  medicalCertificateNumber: z.string().optional(),
  medicalCertificateDate: z.string().optional(),
  medicalCertificateIssuer: z.string().optional(),
  // Optional: for HR/Admin to apply on behalf of others
  staffRecordId: optionalIdSchema
})

// Helper function to parse work week pattern
function parseWorkWeekPattern(pattern: string | null): number[] {
  const defaultPattern = [1, 2, 3, 4, 5]
  if (!pattern) return defaultPattern
  
  try {
    if (pattern.startsWith('[')) {
      const parsed = JSON.parse(pattern)
      if (Array.isArray(parsed) && parsed.every(d => typeof d === 'number')) {
        return parsed
      }
    }
    
    if (/^[1-7]+$/.test(pattern)) {
      return pattern.split('').map(d => parseInt(d))
    }
    
    if (pattern.includes(',')) {
      return pattern.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d))
    }
    
    return defaultPattern
  } catch (error) {
    console.warn('Invalid workWeekPattern format, using default:', pattern)
    return defaultPattern
  }
}

// Helper function to calculate working days
async function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  companyId: string,
  isHalfDay: boolean = false
): Promise<number> {
  if (isHalfDay) return 0.5
  
  let count = 0
  const current = new Date(startDate)
  const end = new Date(endDate)
  
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { workWeekPattern: true }
  })
  
  const workDays = parseWorkWeekPattern(company?.workWeekPattern || null)
  
  const holidays = await prisma.publicHoliday.findMany({
    where: {
      companyId,
      OR: [
        { date: { gte: startDate, lte: endDate } },
        { isRecurring: true }
      ]
    }
  })
  
  const holidaySet = new Set<string>()
  holidays.forEach(holiday => {
    if (holiday.isRecurring) {
      holidaySet.add(`${holiday.date.getMonth() + 1}-${holiday.date.getDate()}`)
    } else {
      holidaySet.add(holiday.date.toISOString().split('T')[0])
    }
  })
  
  while (current <= end) {
    const dayOfWeek = current.getDay()
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek
    
    if (workDays.includes(adjustedDay)) {
      const dateString = current.toISOString().split('T')[0]
      const monthDay = `${current.getMonth() + 1}-${current.getDate()}`
      
      if (!holidaySet.has(dateString) && !holidaySet.has(monthDay)) {
        count++
      }
    }
    
    current.setDate(current.getDate() + 1)
  }
  
  return count
}

// Validate against company's leave policy
async function validateAgainstCompanyPolicy(
  policy: any,
  leaveType: any,
  staff: any,
  startDate: Date,
  endDate: Date,
  requestedDays: number,
  isHalfDay: boolean,
  medicalData: any
): Promise<{ 
  isValid: boolean; 
  errors: string[];
  warnings: string[];
  policyDetails: any;
}> {
  const errors: string[] = []
  const warnings: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const policyDetails = {
    name: policy.name,
    maxDays: policy.maxDays,
    noticePeriod: policy.noticePeriod,
    minEmploymentMonths: policy.minEmploymentMonths,
    requiresApproval: policy.requiresApproval,
    approvalWorkflow: policy.approvalWorkflow,
    isPaid: policy.isPaid,
    documentationRequired: policy.documentationRequired,
    carryOver: policy.carryOver,
    accrualRate: policy.accrualRate
  }

  if (policy.maxDays && requestedDays > policy.maxDays) {
    errors.push(
      `Maximum ${policy.maxDays} days allowed for ${leaveType.name}. ` +
      `You requested ${requestedDays} days.`
    )
  }

  if (policy.noticePeriod > 0) {
    const noticeDays = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (noticeDays < policy.noticePeriod) {
      errors.push(
        `${policy.noticePeriod} days advance notice required for ${leaveType.name}. ` +
        `You gave ${noticeDays} days notice.`
      )
    }
  }

  if (policy.minEmploymentMonths > 0) {
    const employmentDate = new Date(staff.createdAt)
    const monthsEmployed = (today.getFullYear() - employmentDate.getFullYear()) * 12 + 
                         (today.getMonth() - employmentDate.getMonth())
    
    if (monthsEmployed < policy.minEmploymentMonths) {
      errors.push(
        `${policy.minEmploymentMonths} months of employment required for ${leaveType.name}. ` +
        `You have ${monthsEmployed} months.`
      )
    }
  }

  if (policy.documentationRequired) {
    const hasDocumentation = medicalData.medicalCertificateNumber && 
                           medicalData.medicalCertificateDate && 
                           medicalData.medicalCertificateIssuer
    
    if (!hasDocumentation) {
      errors.push(
        `${leaveType.name} requires supporting documentation. ` +
        `Please provide medical certificate number, date, and issuer.`
      )
    }
  }

  if (policy.accrualRate && policy.accrualRate > 0) {
    const employmentDate = new Date(staff.createdAt)
    const totalMonths = (today.getFullYear() - employmentDate.getFullYear()) * 12 + 
                       (today.getMonth() - employmentDate.getMonth())
    const accruedDays = totalMonths * policy.accrualRate
    
    if (requestedDays > accruedDays) {
      warnings.push(
        `Based on accrual rate of ${policy.accrualRate} days/month, ` +
        `you have approximately ${accruedDays.toFixed(1)} accrued days.`
      )
    }
  }

  if (!policy.isPaid) {
    warnings.push(`${leaveType.name} is unpaid leave according to company policy.`)
  }

  return { isValid: errors.length === 0, errors, warnings, policyDetails }
}

// Helper function to describe work week
function getWorkWeekDescription(workDays: number[]): string {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const sortedDays = [...workDays].sort((a, b) => a - b)
  const dayNamesList = sortedDays.map(day => dayNames[day - 1])
  
  if (dayNamesList.length === 0) return 'No work days defined'
  if (dayNamesList.length === 1) return dayNamesList[0]
  
  const lastDay = dayNamesList.pop()
  return `${dayNamesList.join(', ')} and ${lastDay}`
}

// Helper function for next steps
function getNextSteps(status: string, currentStep: string, policy: any): string[] {
  const steps = []
  
  if (status === 'APPROVED') {
    steps.push('✓ Leave automatically approved per company policy')
    steps.push('• Balance updated: Pending → Used')
    steps.push('• You may proceed with your leave plans')
    return steps
  }
  
  if (currentStep === 'MANAGER') {
    if (policy.approvalWorkflow === 'MANAGER_ONLY') {
      steps.push('⏳ Waiting for manager approval')
      steps.push('• Manager will review your request')
    } else if (policy.approvalWorkflow === 'MANAGER_THEN_HR') {
      steps.push('⏳ Waiting for manager approval (first step)')
      steps.push('• After manager approval, request moves to HR')
    }
  }
  
  if (currentStep === 'HR') {
    steps.push('⏳ Waiting for HR approval')
    steps.push('• HR will review your request')
  }
  
  steps.push('• You will be notified at each approval stage')
  steps.push('• Pending days reserved in your balance')
  
  return steps
}

// Get important policy notes
function getImportantNotes(policy: any): string[] {
  const notes = []
  notes.push(`Policy: ${policy.name}`)
  if (!policy.isPaid) notes.push('⚠️ Unpaid leave')
  if (policy.documentationRequired) notes.push('📋 Documentation required')
  if (policy.carryOver > 0) notes.push(`♻️ Up to ${policy.carryOver} days can be carried over`)
  if (policy.accrualRate) notes.push(`📊 Accrual rate: ${policy.accrualRate} days/month`)
  if (policy.minEmploymentMonths > 0) notes.push(`⏳ Minimum employment: ${policy.minEmploymentMonths} months`)
  if (policy.noticePeriod > 0) notes.push(`📅 Advance notice: ${policy.noticePeriod} days`)
  notes.push(`✅ Maximum days per request: ${policy.maxDays}`)
  return notes
}

// Safe reference number helper
function getSafeReferenceNumber(refNumber: string | null): string | undefined {
  return refNumber || undefined
}

// Generate reference number
function generateReferenceNumber(companyId: string, leaveRequestId: string): string {
  const companyPrefix = companyId.substring(0, 4).toUpperCase()
  const leaveSuffix = leaveRequestId.substring(0, 8).toUpperCase()
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4)
  return `LR-${companyPrefix}-${timestamp}-${leaveSuffix}`
}

// ================= API ENDPOINTS =================

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// POST - Apply for leave (PRIMARY APPLICATION ENDPOINT)
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { success: false, message: 'Authorization header missing' },
        { status: 401 }
      )
      return withCors(response, origin)
    }
    
    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['STAFF', 'HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])

    const body = await request.json()
    const validationResult = leaveApplicationSchema.safeParse(body)
    
    if (!validationResult.success) {
      const response = NextResponse.json(
        { 
          success: false,
          message: 'Validation failed', 
          details: validationResult.error.format() 
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const data = validationResult.data

    // Determine which staff record to use
    let targetStaffId = data.staffRecordId || user.userId
    
    // Check permissions for applying on behalf of others
    if (data.staffRecordId && data.staffRecordId !== user.userId) {
      if (!['HR', 'SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
        const response = NextResponse.json(
          { success: false, message: 'Unauthorized to apply leave on behalf of others' },
          { status: 403 }
        )
        return withCors(response, origin)
      }
    }

    // Get staff record
    const staff = await prisma.staffRecord.findUnique({
      where: { 
        id: targetStaffId,
        isActive: true 
      },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        },
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            staffId: true,
            department: true,
            position: true,
            isRegistered: true
          }
        }
      }
    })

    if (!staff || !staff.companyId) {
      const response = NextResponse.json(
        { success: false, message: 'Staff record not found or not associated with a company' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    // Validate leave type
    const leaveType = await prisma.leaveType.findFirst({
      where: {
        id: data.leaveTypeId,
        isActive: true,
        policy: {
          companyId: staff.companyId
        }
      },
      include: {
        policy: true
      }
    })

    if (!leaveType) {
      const response = NextResponse.json(
        { success: false, message: 'Invalid or inactive leave type' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const policy = leaveType.policy

    // Parse dates
    const startDate = new Date(data.startDate)
    const endDate = new Date(data.endDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Basic date validation
    if (startDate >= endDate) {
      const response = NextResponse.json(
        { success: false, message: 'End date must be after start date' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    if (startDate < today) {
      const response = NextResponse.json(
        { success: false, message: 'Start date must be today or in the future' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    // Calculate requested days
    const requestedDays = await calculateWorkingDays(
      startDate, 
      endDate, 
      staff.companyId,
      data.isHalfDay
    )

    if (requestedDays <= 0) {
      const response = NextResponse.json(
        { success: false, message: 'No working days selected. Check weekends and public holidays.' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    // Validate against company policy
    const policyValidation = await validateAgainstCompanyPolicy(
      policy,
      leaveType,
      staff,
      startDate,
      endDate,
      requestedDays,
      data.isHalfDay,
      {
        medicalCertificateNumber: data.medicalCertificateNumber,
        medicalCertificateDate: data.medicalCertificateDate,
        medicalCertificateIssuer: data.medicalCertificateIssuer
      }
    )

    if (!policyValidation.isValid) {
      const response = NextResponse.json(
        { 
          success: false,
          message: 'Leave policy validation failed',
          details: {
            errors: policyValidation.errors,
            warnings: policyValidation.warnings,
            policy: policyValidation.policyDetails
          }
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    // Check leave balance
    const currentYear = new Date().getFullYear()

    await ensureStaffLeaveBalances({
      prisma,
      staffRecordId: staff.id,
      year: currentYear,
    })

    const leaveBalance = await prisma.staffLeaveBalance.findFirst({
      where: {
        staffRecordId: staff.id,
        leaveTypeId: data.leaveTypeId,
        year: currentYear
      }
    })

    if (!leaveBalance) {
      const response = NextResponse.json(
        { success: false, message: `No ${leaveType.name} balance found for this year. Contact HR.` },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const availableBalance = decimalToNumber(leaveBalance.totalDays) - 
                           decimalToNumber(leaveBalance.usedDays) - 
                           decimalToNumber(leaveBalance.pendingDays)
    
    if (availableBalance < requestedDays) {
      const response = NextResponse.json(
        { 
          success: false,
          message: `Insufficient ${leaveType.name} balance`,
          details: {
            requested: requestedDays,
            available: availableBalance,
            totalEntitled: decimalToNumber(leaveBalance.totalDays),
            used: decimalToNumber(leaveBalance.usedDays),
            pending: decimalToNumber(leaveBalance.pendingDays),
            carriedOver: decimalToNumber(leaveBalance.carriedOver),
            policyMaxDays: policy.maxDays
          }
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    // Check overlapping leave requests
    const overlappingLeaves = await prisma.leaveRequest.findMany({
      where: {
        staffRecordId: staff.id,
        status: { in: ['PENDING', 'MANAGER_APPROVED', 'HR_APPROVED', 'APPROVED'] },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate }
          }
        ]
      },
      include: {
        leaveType: true
      }
    })

    if (overlappingLeaves.length > 0) {
      const response = NextResponse.json(
        { 
          success: false,
          message: 'Overlapping leave requests found',
          overlappingLeaves: overlappingLeaves.map(l => ({
            id: l.id,
            leaveType: l.leaveType.name,
            startDate: l.startDate,
            endDate: l.endDate,
            status: l.status,
            totalDays: decimalToNumber(l.totalDays)
          }))
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    // Resolve handover staff from id, staffId, email, or name
    let resolvedHandoverToId: string | undefined
    if (data.handoverTo) {
      const handoverInput = data.handoverTo.trim()
      const nameParts = handoverInput.split(/\s+/).filter(Boolean)
      const firstName = nameParts[0]
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

      const handoverFilters: any[] = [
        { id: handoverInput },
        { staffId: { equals: handoverInput, mode: 'insensitive' } },
        { email: { equals: handoverInput, mode: 'insensitive' } },
        { firstName: { equals: handoverInput, mode: 'insensitive' } },
        { lastName: { equals: handoverInput, mode: 'insensitive' } }
      ]

      if (firstName && lastName) {
        handoverFilters.push({
          AND: [
            { firstName: { equals: firstName, mode: 'insensitive' } },
            { lastName: { equals: lastName, mode: 'insensitive' } }
          ]
        })
      }

      const handoverCandidates = await prisma.staffRecord.findMany({
        where: {
          companyId: staff.companyId,
          isActive: true,
          OR: handoverFilters
        },
        select: {
          id: true,
          staffId: true,
          firstName: true,
          lastName: true,
          email: true
        },
        take: 10
      })

      const normalizedInput = handoverInput.toLowerCase()
      const exactIdMatch = handoverCandidates.find(candidate => candidate.id.toLowerCase() === normalizedInput)
      const exactStaffIdMatch = handoverCandidates.find(candidate => candidate.staffId.toLowerCase() === normalizedInput)
      const exactEmailMatch = handoverCandidates.find(candidate => candidate.email.toLowerCase() === normalizedInput)
      const exactFullNameMatch = handoverCandidates.find(candidate =>
        `${candidate.firstName} ${candidate.lastName}`.trim().toLowerCase() === normalizedInput
      )

      const selectedHandover =
        exactIdMatch ||
        exactStaffIdMatch ||
        exactEmailMatch ||
        exactFullNameMatch ||
        (handoverCandidates.length === 1 ? handoverCandidates[0] : undefined)

      if (!selectedHandover) {
        const response = NextResponse.json(
          {
            success: false,
            message: handoverCandidates.length > 1
              ? 'Multiple staff matched handoverTo. Please provide exact staff ID or email.'
              : 'Handover staff not found. Provide a valid staff ID, email, or full name.',
            matches: handoverCandidates.slice(0, 5).map(candidate => ({
              id: candidate.id,
              staffId: candidate.staffId,
              name: `${candidate.firstName} ${candidate.lastName}`,
              email: candidate.email
            }))
          },
          { status: 400 }
        )
        return withCors(response, origin)
      }

      resolvedHandoverToId = selectedHandover.id
    }

    // Create leave request in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update pending balance
      const updatedBalance = await tx.staffLeaveBalance.update({
        where: { id: leaveBalance.id },
        data: {
          pendingDays: { increment: requestedDays }
        }
      })

      // Determine approval status based on POLICY
      let status = 'PENDING'
      let currentStep = 'MANAGER'
      
      if (!policy.requiresApproval) {
        status = 'APPROVED'
        currentStep = 'COMPLETED'
      } else if (policy.approvalWorkflow === 'HR_ONLY') {
        currentStep = 'HR'
      } else if (policy.approvalWorkflow === 'MANAGER_ONLY') {
        currentStep = 'MANAGER'
      } else if (policy.approvalWorkflow === 'MANAGER_THEN_HR') {
        currentStep = 'MANAGER'
      }

      // Create leave request
      const leaveRequestData: any = {
        staffRecordId: staff.id,
        companyId: staff.companyId,
        leaveTypeId: data.leaveTypeId,
        startDate,
        endDate,
        totalDays: requestedDays,
        reason: data.reason,
        emergencyContact: data.emergencyContact,
        contactPhone: data.contactPhone,
        handoverStaffId: resolvedHandoverToId,
        handoverNotes: data.handoverNotes,
        attachmentUrl: data.attachmentUrl,
        fileName: data.fileName,
        status,
        currentStep,
        managerApproverId: staff.manager?.id || null,
        createdBy: data.staffRecordId || user.userId, // Track who created it
        updatedBy: user.userId
      }

      // Add medical certificate info
      if (data.medicalCertificateNumber) {
        const medicalInfo = `\n\nMedical Certificate Details:\n- Number: ${data.medicalCertificateNumber}\n- Issuer: ${data.medicalCertificateIssuer}\n- Date: ${data.medicalCertificateDate}`
        leaveRequestData.reason = data.reason + medicalInfo
      }

      // Add half-day info
      if (data.isHalfDay) {
        const halfDayInfo = `\n\nLeave Type: Half Day (${data.halfDayPart || 'First Half'})`
        leaveRequestData.reason = (leaveRequestData.reason || data.reason) + halfDayInfo
      }

      const leaveRequest = await tx.leaveRequest.create({
        data: leaveRequestData
      })

      // Generate and update reference number
      const referenceNumber = generateReferenceNumber(staff.companyId, leaveRequest.id)
      const updatedLeaveRequest = await tx.leaveRequest.update({
        where: { id: leaveRequest.id },
        data: { referenceNumber }
      })

      // Handle auto-approval
      if (status === 'APPROVED') {
        await tx.staffLeaveBalance.update({
          where: { id: leaveBalance.id },
          data: {
            pendingDays: { decrement: requestedDays },
            usedDays: { increment: requestedDays }
          }
        })
      }

      return {
        leaveRequest: updatedLeaveRequest,
        balance: updatedBalance,
        policy,
        leaveType,
        staff,
        manager: staff.manager,
        warnings: policyValidation.warnings,
        policyDetails: policyValidation.policyDetails
      }
    })

    // Send notifications
    try {
      // 1. Notify Applicant
      await createLeaveNotification(
        staff.id,
        NOTIFICATION_TYPES.LEAVE_REQUEST_SUBMITTED,
        'Leave Application Submitted',
        `Your ${result.leaveType.name} leave request has been submitted successfully`,
        result.leaveRequest.id,
        {
          referenceNumber: getSafeReferenceNumber(result.leaveRequest.referenceNumber),
          leaveType: result.leaveType.name,
          startDate: result.leaveRequest.startDate.toISOString(),
          endDate: result.leaveRequest.endDate.toISOString(),
          days: decimalToNumber(result.leaveRequest.totalDays),
          status: result.leaveRequest.status,
          currentStep: result.leaveRequest.currentStep,
          appliedBy: data.staffRecordId ? 'HR/Admin' : 'Self'
        },
        staff.companyId
      )

      // Email to applicant
      await sendLeaveNotificationEmail(
        {
          id: staff.id,
          companyId: staff.companyId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          staffId: staff.staffId,
          department: staff.department,
          position: staff.position,
          isRegistered: staff.isRegistered
        },
        {
          id: result.leaveRequest.id,
          referenceNumber: getSafeReferenceNumber(result.leaveRequest.referenceNumber),
          leaveType: result.leaveType.name,
          startDate: result.leaveRequest.startDate,
          endDate: result.leaveRequest.endDate,
          totalDays: decimalToNumber(result.leaveRequest.totalDays),
          status: result.leaveRequest.status,
          currentStep: result.leaveRequest.currentStep
        },
        'SUBMITTED'
      )

      // 2. Notify Manager (if required)
      if (result.manager && (result.leaveRequest.status === 'PENDING' || result.leaveRequest.currentStep === 'MANAGER')) {
        await createLeaveNotification(
          result.manager.id,
          NOTIFICATION_TYPES.LEAVE_APPROVAL_NEEDED,
          'Leave Request Requires Approval',
          `${staff.firstName} ${staff.lastName} has submitted a ${result.leaveType.name} leave request`,
          result.leaveRequest.id,
          {
            referenceNumber: getSafeReferenceNumber(result.leaveRequest.referenceNumber),
            staffName: `${staff.firstName} ${staff.lastName}`,
            leaveType: result.leaveType.name,
            startDate: result.leaveRequest.startDate.toISOString(),
            endDate: result.leaveRequest.endDate.toISOString(),
            days: decimalToNumber(result.leaveRequest.totalDays)
          },
          staff.companyId
        )

        // Email to manager
        await sendLeaveNotificationEmail(
          {
            id: result.manager.id,
            companyId: staff.companyId,
            firstName: result.manager.firstName,
            lastName: result.manager.lastName,
            email: result.manager.email,
            staffId: result.manager.staffId || '',
            department: result.manager.department,
            position: result.manager.position,
            isRegistered: result.manager.isRegistered || true
          },
          {
            id: result.leaveRequest.id,
            referenceNumber: getSafeReferenceNumber(result.leaveRequest.referenceNumber),
            leaveType: result.leaveType.name,
            startDate: result.leaveRequest.startDate,
            endDate: result.leaveRequest.endDate,
            totalDays: decimalToNumber(result.leaveRequest.totalDays),
            status: result.leaveRequest.status,
            currentStep: result.leaveRequest.currentStep
          },
          'MANAGER_APPROVAL'
        )
      }

      // 3. Notify HR (if HR approval workflow)
      if (result.leaveRequest.currentStep === 'HR' || (result.policy?.approvalWorkflow && result.policy.approvalWorkflow.includes('HR'))) {
        const hrUsers = await prisma.staffRecord.findMany({
          where: {
            companyId: staff.companyId,
            role: { in: ['HR', 'SUPER_ADMIN', 'ADMIN'] },
            isActive: true
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            staffId: true,
            department: true,
            position: true,
            isRegistered: true
          }
        })

        for (const hrUser of hrUsers) {
          await createLeaveNotification(
            hrUser.id,
            NOTIFICATION_TYPES.LEAVE_HR_APPROVAL_NEEDED,
            'Leave Request Pending HR Approval',
            `${staff.firstName} ${staff.lastName} has submitted a ${result.leaveType.name} leave request`,
            result.leaveRequest.id,
            {
              referenceNumber: getSafeReferenceNumber(result.leaveRequest.referenceNumber),
              staffName: `${staff.firstName} ${staff.lastName}`,
              leaveType: result.leaveType.name,
              startDate: result.leaveRequest.startDate.toISOString(),
              endDate: result.leaveRequest.endDate.toISOString(),
              days: decimalToNumber(result.leaveRequest.totalDays)
            },
            staff.companyId
          )

          // Email to HR
          await sendLeaveNotificationEmail(
            {
              id: hrUser.id,
              companyId: staff.companyId,
              firstName: hrUser.firstName,
              lastName: hrUser.lastName,
              email: hrUser.email,
              staffId: hrUser.staffId,
              department: hrUser.department,
              position: hrUser.position,
              isRegistered: hrUser.isRegistered
            },
            {
              id: result.leaveRequest.id,
              referenceNumber: getSafeReferenceNumber(result.leaveRequest.referenceNumber),
              leaveType: result.leaveType.name,
              startDate: result.leaveRequest.startDate,
              endDate: result.leaveRequest.endDate,
              totalDays: decimalToNumber(result.leaveRequest.totalDays),
              status: result.leaveRequest.status,
              currentStep: result.leaveRequest.currentStep
            },
            'HR_APPROVAL'
          )
        }
      }

      console.log('✅ Notifications sent successfully for leave request:', result.leaveRequest.id)
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError)
      // Don't fail the whole request if notifications fail
    }

    // Get company work week pattern for response
    const company = await prisma.company.findUnique({
      where: { id: staff.companyId },
      select: { workWeekPattern: true }
    })

    // Return success response
    const response = NextResponse.json({
      success: true,
      message: 'Leave application submitted successfully',
      data: {
        leaveRequestId: result.leaveRequest.id,
        referenceNumber: getSafeReferenceNumber(result.leaveRequest.referenceNumber),
        status: result.leaveRequest.status,
        currentStep: result.leaveRequest.currentStep,
        requestedDays,
        leaveType: {
          id: result.leaveType.id,
          name: result.leaveType.name,
          code: result.leaveType.code,
          policy: result.policy?.name || 'Default'
        },
        policyApplied: result.policyDetails,
        leaveBalance: {
          total: decimalToNumber(result.balance.totalDays),
          used: decimalToNumber(result.balance.usedDays),
          pending: decimalToNumber(result.balance.pendingDays),
          available: decimalToNumber(result.balance.totalDays) - 
                    decimalToNumber(result.balance.usedDays) - 
                    decimalToNumber(result.balance.pendingDays),
          carriedOver: decimalToNumber(result.balance.carriedOver)
        },
        workWeekInfo: {
          pattern: company?.workWeekPattern || "12345",
          workDays: parseWorkWeekPattern(company?.workWeekPattern || null),
          description: getWorkWeekDescription(parseWorkWeekPattern(company?.workWeekPattern || null))
        },
        nextSteps: getNextSteps(result.leaveRequest.status, result.leaveRequest.currentStep, result.policy),
        approvers: {
          manager: result.manager ? {
            id: result.manager.id,
            name: `${result.manager.firstName} ${result.manager.lastName}`,
            email: result.manager.email
          } : null,
          hr: result.policy?.approvalWorkflow && result.policy.approvalWorkflow.includes('HR') ? 'Awaiting HR approval' : null
        },
        notifications: {
          sentToApplicant: true,
          sentToManager: !!result.manager,
          sentToHR: result.policy?.approvalWorkflow && result.policy.approvalWorkflow.includes('HR')
        },
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
        importantNotes: result.policy ? getImportantNotes(result.policy) : ['No policy details available'],
        additionalInfo: {
          isHalfDay: data.isHalfDay,
          halfDayPart: data.halfDayPart,
          medicalCertificate: data.medicalCertificateNumber ? {
            number: data.medicalCertificateNumber,
            date: data.medicalCertificateDate,
            issuer: data.medicalCertificateIssuer
          } : null,
          appliedBy: data.staffRecordId ? {
            userId: user.userId,
            role: user.role
          } : null
        }
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Leave application error:', error)
    
    if (error instanceof z.ZodError) {
      const response = NextResponse.json(
        { success: false, message: 'Validation error', details: error.errors },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    if (error.code === 'P2002') {
      const response = NextResponse.json(
        { success: false, message: 'Duplicate request detected' },
        { status: 409 }
      )
      return withCors(response, origin)
    }

    if (error.code === 'P2025') {
      const response = NextResponse.json(
        { success: false, message: 'Record not found. Please refresh and try again.' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    if (error.code === 'P2023') {
      const response = NextResponse.json(
        {
          success: false,
          message: 'Invalid identifier format in request',
          details: 'Please provide valid IDs for leave type, handover staff, and staff record.'
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to process leave application',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}