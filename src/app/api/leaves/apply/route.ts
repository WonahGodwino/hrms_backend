// /src/app/api/leaves/apply/route.ts - COMPLETE DEPLOYMENT READY VERSION
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import { sendLeaveNotificationEmail } from '@/app/lib/email'
import { 
  createLeaveNotification, 
  NOTIFICATION_TYPES,
  getNotificationsForLeaveRequest 
} from '@/app/lib/notifications/helpers'

// Validation schema for leave application
const leaveApplicationSchema = z.object({
  leaveTypeId: z.string().cuid(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format. Use YYYY-MM-DD',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end date format. Use YYYY-MM-DD',
  }),
  reason: z.string().min(5).max(500),
  emergencyContact: z.string().optional(),
  contactPhone: z.string().optional(),
  handoverTo: z.string().cuid().optional(),
  handoverNotes: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  isHalfDay: z.boolean().optional().default(false),
  halfDayPart: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional(),
  medicalCertificateNumber: z.string().optional(),
  medicalCertificateDate: z.string().optional(),
  medicalCertificateIssuer: z.string().optional(),
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

// ================= NOTIFICATION FUNCTIONS =================

async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data: any,
  companyId: string
) {
  try {
    return await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: JSON.stringify(data),
        companyId,
        read: false
      }
    })
  } catch (error) {
    console.error('Error creating notification:', error)
    return null
  }
}

async function notifyLeaveSubmission(leaveRequest: any, staff: any, leaveType: any, manager: any = null) {
  try {
    // 1. Notify Applicant
    await createNotification(
      staff.id,
      'LEAVE_REQUEST_SUBMITTED',
      'Leave Application Submitted',
      `Your ${leaveType.name} leave request has been submitted successfully`,
      {
        leaveRequestId: leaveRequest.id,
        referenceNumber: leaveRequest.referenceNumber || undefined,
        leaveType: leaveType.name,
        startDate: leaveRequest.startDate.toISOString(),
        endDate: leaveRequest.endDate.toISOString(),
        days: leaveRequest.totalDays,
        status: leaveRequest.status,
        currentStep: leaveRequest.currentStep
      },
      staff.companyId
    )

    // Email to applicant - FIXED: referenceNumber || undefined
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
        id: leaveRequest.id,
        referenceNumber: leaveRequest.referenceNumber || undefined,
        leaveType: leaveType.name,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        totalDays: leaveRequest.totalDays,
        status: leaveRequest.status,
        currentStep: leaveRequest.currentStep
      },
      'SUBMITTED'
    )

    // 2. Notify Manager (if required)
    if (manager && (leaveRequest.status === 'PENDING' || leaveRequest.currentStep === 'MANAGER')) {
      await createNotification(
        manager.id,
        'LEAVE_APPROVAL_NEEDED',
        'Leave Request Requires Approval',
        `${staff.firstName} ${staff.lastName} has submitted a ${leaveType.name} leave request`,
        {
          leaveRequestId: leaveRequest.id,
          referenceNumber: leaveRequest.referenceNumber || undefined,
          staffName: `${staff.firstName} ${staff.lastName}`,
          leaveType: leaveType.name,
          startDate: leaveRequest.startDate.toISOString(),
          endDate: leaveRequest.endDate.toISOString(),
          days: leaveRequest.totalDays
        },
        staff.companyId
      )

      // Email to manager - FIXED: referenceNumber || undefined
      await sendLeaveNotificationEmail(
        {
          id: manager.id,
          companyId: staff.companyId,
          firstName: manager.firstName,
          lastName: manager.lastName,
          email: manager.email,
          staffId: manager.staffId || '',
          department: manager.department,
          position: manager.position,
          isRegistered: manager.isRegistered || true
        },
        {
          id: leaveRequest.id,
          referenceNumber: leaveRequest.referenceNumber || undefined,
          leaveType: leaveType.name,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
          totalDays: leaveRequest.totalDays,
          status: leaveRequest.status,
          currentStep: leaveRequest.currentStep
        },
        'MANAGER_APPROVAL'
      )
    }

    // 3. Notify HR (if HR approval workflow)
    if (leaveRequest.currentStep === 'HR') {
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
        await createNotification(
          hrUser.id,
          'LEAVE_HR_APPROVAL_NEEDED',
          'Leave Request Pending HR Approval',
          `${staff.firstName} ${staff.lastName} has submitted a ${leaveType.name} leave request`,
          {
            leaveRequestId: leaveRequest.id,
            referenceNumber: leaveRequest.referenceNumber || undefined,
            staffName: `${staff.firstName} ${staff.lastName}`,
            leaveType: leaveType.name,
            startDate: leaveRequest.startDate.toISOString(),
            endDate: leaveRequest.endDate.toISOString(),
            days: leaveRequest.totalDays
          },
          staff.companyId
        )

        // Email to HR - FIXED: referenceNumber || undefined
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
            id: leaveRequest.id,
            referenceNumber: leaveRequest.referenceNumber || undefined,
            leaveType: leaveType.name,
            startDate: leaveRequest.startDate,
            endDate: leaveRequest.endDate,
            totalDays: leaveRequest.totalDays,
            status: leaveRequest.status,
            currentStep: leaveRequest.currentStep
          },
          'HR_APPROVAL'
        )
      }
    }

    console.log('✅ Notifications sent successfully for leave request:', leaveRequest.id)
  } catch (error) {
    console.error('Error sending notifications:', error)
    // Don't fail the whole request if notifications fail
  }
}

async function notifyLeaveStatusChange(leaveRequest: any, staff: any, leaveType: any, action: string, actionBy: any) {
  try {
    const actionByUser = await prisma.staffRecord.findUnique({
      where: { id: actionBy.userId },
      select: { firstName: true, lastName: true, role: true }
    })

    const actionByName = actionByUser ? `${actionByUser.firstName} ${actionByUser.lastName} (${actionByUser.role})` : 'System'

    let notificationType = ''
    let emailNotificationType: 'APPROVED' | 'REJECTED' | 'CANCELLED'

    switch (action) {
      case 'APPROVE':
        notificationType = 'LEAVE_APPROVED'
        emailNotificationType = 'APPROVED'
        break
      case 'REJECT':
        notificationType = 'LEAVE_REJECTED'
        emailNotificationType = 'REJECTED'
        break
      case 'CANCEL':
        notificationType = 'LEAVE_CANCELLED'
        emailNotificationType = 'CANCELLED'
        break
      default:
        return
    }

    // Notify Applicant
    await createNotification(
      staff.id,
      notificationType,
      `Leave Request ${action}`,
      `Your ${leaveType.name} leave request has been ${action.toLowerCase()}ed by ${actionByName}`,
      {
        leaveRequestId: leaveRequest.id,
        referenceNumber: leaveRequest.referenceNumber || undefined,
        leaveType: leaveType.name,
        startDate: leaveRequest.startDate.toISOString(),
        endDate: leaveRequest.endDate.toISOString(),
        days: leaveRequest.totalDays,
        status: leaveRequest.status,
        actionBy: actionByName,
        actionAt: new Date().toISOString()
      },
      staff.companyId
    )

    // Email to applicant - FIXED: referenceNumber || undefined
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
        id: leaveRequest.id,
        referenceNumber: leaveRequest.referenceNumber || undefined,
        leaveType: leaveType.name,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        totalDays: leaveRequest.totalDays,
        status: leaveRequest.status,
        currentStep: leaveRequest.currentStep
      },
      emailNotificationType
    )

    console.log(`✅ Status change notification sent for leave request: ${leaveRequest.id}, action: ${action}`)
  } catch (error) {
    console.error('Error sending status change notifications:', error)
  }
}

// ================= API ENDPOINTS =================

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// POST - Apply for leave
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

    // Get staff record
    const staff = await prisma.staffRecord.findUnique({
      where: { 
        id: user.userId,
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

    const availableBalance = leaveBalance.totalDays - leaveBalance.usedDays - leaveBalance.pendingDays
    
    if (availableBalance < requestedDays) {
      const response = NextResponse.json(
        { 
          success: false,
          message: `Insufficient ${leaveType.name} balance`,
          details: {
            requested: requestedDays,
            available: availableBalance,
            totalEntitled: leaveBalance.totalDays,
            used: leaveBalance.usedDays,
            pending: leaveBalance.pendingDays,
            carriedOver: leaveBalance.carriedOver,
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
            totalDays: l.totalDays
          }))
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    // Check handover staff
    if (data.handoverTo) {
      const handoverStaff = await prisma.staffRecord.findFirst({
        where: {
          id: data.handoverTo,
          companyId: staff.companyId,
          isActive: true
        }
      })
      
      if (!handoverStaff) {
        const response = NextResponse.json(
          { success: false, message: 'Handover staff not found or inactive' },
          { status: 400 }
        )
        return withCors(response, origin)
      }
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
        leaveTypeId: data.leaveTypeId,
        startDate,
        endDate,
        totalDays: requestedDays,
        reason: data.reason,
        emergencyContact: data.emergencyContact,
        contactPhone: data.contactPhone,
        handoverTo: data.handoverTo,
        handoverNotes: data.handoverNotes,
        attachmentUrl: data.attachmentUrl,
        fileName: data.fileName,
        status,
        currentStep,
        managerApproverId: staff.manager?.id || null,
        createdBy: staff.id,
        updatedBy: staff.id,
        companyId: staff.companyId
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

      // Generate reference number
      const referenceNumber = `LR-${staff.companyId.slice(0, 4)}-${leaveRequest.id.slice(-6).toUpperCase()}`

      // Update with reference number
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
          referenceNumber: result.leaveRequest.referenceNumber || undefined,
          leaveType: result.leaveType.name,
          startDate: result.leaveRequest.startDate.toISOString(),
          endDate: result.leaveRequest.endDate.toISOString(),
          days: result.leaveRequest.totalDays,
          status: result.leaveRequest.status,
          currentStep: result.leaveRequest.currentStep
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
          referenceNumber: result.leaveRequest.referenceNumber || undefined,
          leaveType: result.leaveType.name,
          startDate: result.leaveRequest.startDate,
          endDate: result.leaveRequest.endDate,
          totalDays: result.leaveRequest.totalDays,
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
           referenceNumber: result.leaveRequest.referenceNumber || undefined,
            staffName: `${staff.firstName} ${staff.lastName}`,
            leaveType: result.leaveType.name,
            startDate: result.leaveRequest.startDate.toISOString(),
            endDate: result.leaveRequest.endDate.toISOString(),
            days: result.leaveRequest.totalDays
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
            referenceNumber: result.leaveRequest.referenceNumber,
            leaveType: result.leaveType.name,
            startDate: result.leaveRequest.startDate,
            endDate: result.leaveRequest.endDate,
            totalDays: result.leaveRequest.totalDays,
            status: result.leaveRequest.status,
            currentStep: result.leaveRequest.currentStep
          },
          'MANAGER_APPROVAL'
        )
      }

      // 3. Notify HR (if HR approval workflow)
      if (result.leaveRequest.currentStep === 'HR' || result.policy.approvalWorkflow.includes('HR')) {
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
              referenceNumber: result.leaveRequest.referenceNumber,
              staffName: `${staff.firstName} ${staff.lastName}`,
              leaveType: result.leaveType.name,
              startDate: result.leaveRequest.startDate.toISOString(),
              endDate: result.leaveRequest.endDate.toISOString(),
              days: result.leaveRequest.totalDays
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
              referenceNumber: result.leaveRequest.referenceNumber,
              leaveType: result.leaveType.name,
              startDate: result.leaveRequest.startDate,
              endDate: result.leaveRequest.endDate,
              totalDays: result.leaveRequest.totalDays,
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
        referenceNumber: result.leaveRequest.referenceNumber,
        status: result.leaveRequest.status,
        currentStep: result.leaveRequest.currentStep,
        requestedDays,
        leaveType: {
          id: result.leaveType.id,
          name: result.leaveType.name,
          code: result.leaveType.code,
          policy: result.policy.name
        },
        policyApplied: result.policyDetails,
        leaveBalance: {
          total: result.balance.totalDays,
          used: result.balance.usedDays,
          pending: result.balance.pendingDays,
          available: result.balance.totalDays - result.balance.usedDays - result.balance.pendingDays,
          carriedOver: result.balance.carriedOver
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
          hr: result.policy.approvalWorkflow.includes('HR') ? 'Awaiting HR approval' : null
        },
        notifications: {
          sentToApplicant: true,
          sentToManager: !!result.manager,
          sentToHR: result.policy.approvalWorkflow.includes('HR')
        },
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
        importantNotes: getImportantNotes(result.policy),
        additionalInfo: {
          isHalfDay: data.isHalfDay,
          halfDayPart: data.halfDayPart,
          medicalCertificate: data.medicalCertificateNumber ? {
            number: data.medicalCertificateNumber,
            date: data.medicalCertificateDate,
            issuer: data.medicalCertificateIssuer
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

// GET - Get leave application by ID
export async function GET(request: NextRequest) {
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
    
    const { searchParams } = new URL(request.url)
    const leaveRequestId = searchParams.get('id')
    
    if (!leaveRequestId) {
      const response = NextResponse.json(
        { success: false, message: 'Leave request ID is required' },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    // Get leave request with details
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: {
        leaveType: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        staffRecord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
            staffId: true,
            companyId: true
          }
        },
        managerApprover: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        handoverStaff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            staffId: true
          }
        }
      }
    })
    
    if (!leaveRequest) {
      const response = NextResponse.json(
        { success: false, message: 'Leave request not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    // Check permissions
    const isOwner = leaveRequest.staffRecordId === user.userId
    const isManager = user.role === 'MANAGER'
    const isHR = ['HR', 'SUPER_ADMIN', 'ADMIN'].includes(user.role)
    
    if (!isOwner && !isManager && !isHR) {
      const response = NextResponse.json(
        { success: false, message: 'Unauthorized to view this leave request' },
        { status: 403 }
      )
      return withCors(response, origin)
    }
    
    // Get leave balance
    const currentYear = new Date().getFullYear()
    const leaveBalance = await prisma.staffLeaveBalance.findFirst({
      where: {
        staffRecordId: leaveRequest.staffRecordId,
        leaveTypeId: leaveRequest.leaveTypeId,
        year: currentYear
      }
    })
    
    // Get notifications for this leave request
    const notifications = await getNotificationsForLeaveRequest(leaveRequestId, leaveRequest.staffRecord.companyId)
    
    const response = NextResponse.json({
      success: true,
      message: 'Leave request retrieved successfully',
      data: {
        leaveRequest: {
          id: leaveRequest.id,
          referenceNumber: leaveRequest.referenceNumber || undefined,
          leaveType: leaveRequest.leaveType,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
          totalDays: leaveRequest.totalDays,
          reason: leaveRequest.reason,
          status: leaveRequest.status,
          currentStep: leaveRequest.currentStep,
          emergencyContact: leaveRequest.emergencyContact,
          contactPhone: leaveRequest.contactPhone,
          handoverTo: leaveRequest.handoverTo,
          handoverStaff: leaveRequest.handoverStaff,
          handoverNotes: leaveRequest.handoverNotes,
          attachmentUrl: leaveRequest.attachmentUrl,
          fileName: leaveRequest.fileName,
          managerApprover: leaveRequest.managerApprover,
          managerApprovedAt: leaveRequest.managerApprovedAt,
          hrApprovedAt: leaveRequest.hrApprovedAt,
          rejectedAt: leaveRequest.rejectedAt,
          cancelledAt: leaveRequest.cancelledAt,
          managerComments: leaveRequest.managerComments,
          hrComments: leaveRequest.hrComments,
          rejectComments: leaveRequest.rejectComments,
          cancelComments: leaveRequest.cancelComments,
          createdAt: leaveRequest.createdAt,
          updatedAt: leaveRequest.updatedAt
        },
        staff: leaveRequest.staffRecord,
        leaveBalance: leaveBalance ? {
          total: leaveBalance.totalDays,
          used: leaveBalance.usedDays,
          pending: leaveBalance.pendingDays,
          available: leaveBalance.totalDays - leaveBalance.usedDays - leaveBalance.pendingDays,
          carriedOver: leaveBalance.carriedOver
        } : null,
        notifications: notifications.map(notification => ({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          read: notification.read,
          createdAt: notification.createdAt,
          isForCurrentUser: notification.userId === user.userId,
          data: notification.data
        }))
      }
    })
    
    return withCors(response, origin)
    
  } catch (error: any) {
    console.error('Get leave request error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to fetch leave request',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}

// PUT - Update leave application status (Approval/Rejection/Cancellation)
export async function PUT(request: NextRequest) {
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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    
    const body = await request.json()
    const { leaveRequestId, action, comments } = body
    
    if (!leaveRequestId || !action) {
      const response = NextResponse.json(
        { success: false, message: 'Leave request ID and action are required' },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    // Validate action
    const validActions = ['APPROVE', 'REJECT', 'CANCEL']
    if (!validActions.includes(action)) {
      const response = NextResponse.json(
        { success: false, message: 'Invalid action. Use APPROVE, REJECT, or CANCEL' },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    // Get leave request with details
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: {
        leaveType: {
          select: {
            id: true,
            name: true,
            policy: true
          }
        },
        staffRecord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyId: true,
            staffId: true,
            department: true,
            position: true,
            isRegistered: true
          }
        }
      }
    })
    
    if (!leaveRequest) {
      const response = NextResponse.json(
        { success: false, message: 'Leave request not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    // Check permissions
    const canApproveAsManager = user.role === 'MANAGER' && 
                               leaveRequest.currentStep === 'MANAGER' &&
                               leaveRequest.managerApproverId === user.userId
    
    const canApproveAsHR = ['HR', 'SUPER_ADMIN', 'ADMIN'].includes(user.role) &&
                          leaveRequest.currentStep === 'HR'
    
    const canCancel = (user.userId === leaveRequest.staffRecordId && 
                      leaveRequest.status === 'PENDING') ||
                     ['HR', 'SUPER_ADMIN', 'ADMIN'].includes(user.role)
    
    if (!canApproveAsManager && !canApproveAsHR && !canCancel) {
      const response = NextResponse.json(
        { success: false, message: 'Unauthorized to perform this action' },
        { status: 403 }
      )
      return withCors(response, origin)
    }
    
    let updatedLeaveRequest: any = null
    let balanceUpdates: Record<string, any> = {}
    
    // Process the action in transaction
    updatedLeaveRequest = await prisma.$transaction(async (tx) => {
      if (action === 'APPROVE') {
        if (leaveRequest.currentStep === 'MANAGER') {
          const nextStep = leaveRequest.leaveType.policy?.approvalWorkflow === 'MANAGER_THEN_HR' 
            ? 'HR' 
            : 'COMPLETED'
          
          const newStatus = nextStep === 'COMPLETED' ? 'APPROVED' : 'MANAGER_APPROVED'
          
          const result = await tx.leaveRequest.update({
            where: { id: leaveRequestId },
            data: {
              status: newStatus,
              currentStep: nextStep,
              managerApprovedAt: new Date(),
              managerComments: comments,
              updatedBy: user.userId
            }
          })
          
          // If manager-only approval, update balance immediately
          if (nextStep === 'COMPLETED') {
            const leaveBalance = await tx.staffLeaveBalance.findFirst({
              where: {
                staffRecordId: leaveRequest.staffRecordId,
                leaveTypeId: leaveRequest.leaveTypeId,
                year: new Date().getFullYear()
              }
            })
            
            if (leaveBalance) {
              await tx.staffLeaveBalance.update({
                where: { id: leaveBalance.id },
                data: {
                  pendingDays: { decrement: leaveRequest.totalDays },
                  usedDays: { increment: leaveRequest.totalDays }
                }
              })
              
              balanceUpdates = {
                pendingDecreased: leaveRequest.totalDays,
                usedIncreased: leaveRequest.totalDays
              }
            }
          }
          
          return result
          
        } else if (leaveRequest.currentStep === 'HR') {
          const result = await tx.leaveRequest.update({
            where: { id: leaveRequestId },
            data: {
              status: 'APPROVED',
              currentStep: 'COMPLETED',
              hrApprovedAt: new Date(),
              hrComments: comments,
              updatedBy: user.userId
            }
          })
          
          // Update leave balance when fully approved
          const leaveBalance = await tx.staffLeaveBalance.findFirst({
            where: {
              staffRecordId: leaveRequest.staffRecordId,
              leaveTypeId: leaveRequest.leaveTypeId,
              year: new Date().getFullYear()
            }
          })
          
          if (leaveBalance) {
            await tx.staffLeaveBalance.update({
              where: { id: leaveBalance.id },
              data: {
                pendingDays: { decrement: leaveRequest.totalDays },
                usedDays: { increment: leaveRequest.totalDays }
              }
            })
            
            balanceUpdates = {
              pendingDecreased: leaveRequest.totalDays,
              usedIncreased: leaveRequest.totalDays
            }
          }
          
          return result
        }
        
      } else if (action === 'REJECT') {
        const result = await tx.leaveRequest.update({
          where: { id: leaveRequestId },
          data: {
            status: 'REJECTED',
            currentStep: 'REJECTED',
            rejectedAt: new Date(),
            rejectComments: comments,
            updatedBy: user.userId
          }
        })
        
        // Return pending days to available balance
        const leaveBalance = await tx.staffLeaveBalance.findFirst({
          where: {
            staffRecordId: leaveRequest.staffRecordId,
            leaveTypeId: leaveRequest.leaveTypeId,
            year: new Date().getFullYear()
          }
        })
        
        if (leaveBalance) {
          await tx.staffLeaveBalance.update({
            where: { id: leaveBalance.id },
            data: {
              pendingDays: { decrement: leaveRequest.totalDays }
            }
          })
          
          balanceUpdates = {
            pendingDecreased: leaveRequest.totalDays
          }
        }
        
        return result
        
      } else if (action === 'CANCEL') {
        const result = await tx.leaveRequest.update({
          where: { id: leaveRequestId },
          data: {
            status: 'CANCELLED',
            currentStep: 'CANCELLED',
            cancelledAt: new Date(),
            cancelComments: comments,
            updatedBy: user.userId
          }
        })
        
        // Return pending days to available balance
        const leaveBalance = await tx.staffLeaveBalance.findFirst({
          where: {
            staffRecordId: leaveRequest.staffRecordId,
            leaveTypeId: leaveRequest.leaveTypeId,
            year: new Date().getFullYear()
          }
        })
        
        if (leaveBalance) {
          await tx.staffLeaveBalance.update({
            where: { id: leaveBalance.id },
            data: {
              pendingDays: { decrement: leaveRequest.totalDays }
            }
          })
          
          balanceUpdates = {
            pendingDecreased: leaveRequest.totalDays
          }
        }
        
        return result
      }
      
      throw new Error('Invalid action or workflow state')
    })
    
    // Send notifications after transaction
    try {
      const actionByUser = await prisma.staffRecord.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, role: true }
      })
      
      const actionByName = actionByUser ? `${actionByUser.firstName} ${actionByUser.lastName} (${actionByUser.role})` : 'System'
      
      let notificationType: keyof typeof NOTIFICATION_TYPES
      let emailNotificationType: 'APPROVED' | 'REJECTED' | 'CANCELLED'
      
      switch (action) {
        case 'APPROVE':
          notificationType = leaveRequest.currentStep === 'HR' ? 'LEAVE_APPROVED' : 'LEAVE_MANAGER_APPROVED'
          emailNotificationType = 'APPROVED'
          break
        case 'REJECT':
          notificationType = 'LEAVE_REJECTED'
          emailNotificationType = 'REJECTED'
          break
        case 'CANCEL':
          notificationType = 'LEAVE_CANCELLED'
          emailNotificationType = 'CANCELLED'
          break
        default:
          throw new Error('Invalid action')
      }
      
      // Notify Applicant
      await createLeaveNotification(
        leaveRequest.staffRecord.id,
        notificationType,
        `Leave Request ${action}`,
        `Your ${leaveRequest.leaveType.name} leave request has been ${action.toLowerCase()}ed by ${actionByName}`,
        leaveRequest.id,
        {
          referenceNumber: leaveRequest.referenceNumber || undefined,
          leaveType: leaveRequest.leaveType.name,
          startDate: leaveRequest.startDate.toISOString(),
          endDate: leaveRequest.endDate.toISOString(),
          days: leaveRequest.totalDays,
          status: updatedLeaveRequest.status,
          actionBy: actionByName,
          actionAt: new Date().toISOString()
        },
        leaveRequest.staffRecord.companyId
      )
      
      // Email to applicant
      await sendLeaveNotificationEmail(
        {
          id: leaveRequest.staffRecord.id,
          companyId: leaveRequest.staffRecord.companyId,
          firstName: leaveRequest.staffRecord.firstName,
          lastName: leaveRequest.staffRecord.lastName,
          email: leaveRequest.staffRecord.email,
          staffId: leaveRequest.staffRecord.staffId,
          department: leaveRequest.staffRecord.department,
          position: leaveRequest.staffRecord.position,
          isRegistered: leaveRequest.staffRecord.isRegistered
        },
        {
          id: leaveRequest.id,
          referenceNumber: leaveRequest.referenceNumber || undefined,
          leaveType: leaveRequest.leaveType.name,
          startDate: leaveRequest.startDate,
          endDate: leaveRequest.endDate,
          totalDays: leaveRequest.totalDays,
          status: updatedLeaveRequest.status,
          currentStep: updatedLeaveRequest.currentStep
        },
        emailNotificationType
      )
      
      // If approved by manager and needs HR approval, notify HR
      if (action === 'APPROVE' && updatedLeaveRequest.currentStep === 'HR') {
        const hrUsers = await prisma.staffRecord.findMany({
          where: {
            companyId: leaveRequest.staffRecord.companyId,
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
            `${leaveRequest.staffRecord.firstName} ${leaveRequest.staffRecord.lastName}'s ${leaveRequest.leaveType.name} leave request needs HR approval`,
            leaveRequest.id,
            {
              leaveRequestId: leaveRequest.id,
              referenceNumber: leaveRequest.referenceNumber || undefined,
              staffName: `${leaveRequest.staffRecord.firstName} ${leaveRequest.staffRecord.lastName}`,
              leaveType: leaveRequest.leaveType.name,
              startDate: leaveRequest.startDate,
              endDate: leaveRequest.endDate,
              days: leaveRequest.totalDays,
              managerApproved: true
            },
            leaveRequest.staffRecord.companyId
          )
          
          // Email to HR
          await sendLeaveNotificationEmail(
            {
              id: hrUser.id,
              companyId: leaveRequest.staffRecord.companyId,
              firstName: hrUser.firstName,
              lastName: hrUser.lastName,
              email: hrUser.email,
              staffId: hrUser.staffId,
              department: hrUser.department,
              position: hrUser.position,
              isRegistered: hrUser.isRegistered
            },
            {
              id: leaveRequest.id,
              referenceNumber: leaveRequest.referenceNumber || undefined,
              leaveType: leaveRequest.leaveType.name,
              startDate: leaveRequest.startDate,
              endDate: leaveRequest.endDate,
              totalDays: leaveRequest.totalDays,
              status: updatedLeaveRequest.status,
              currentStep: updatedLeaveRequest.currentStep
            },
            'HR_APPROVAL'
          )
        }
      }
      
      console.log(`✅ Status change notification sent for leave request: ${leaveRequest.id}, action: ${action}`)
    } catch (notificationError) {
      console.error('Error sending status change notifications:', notificationError)
      // Don't fail the whole request if notifications fail
    }
    
    const response = NextResponse.json({
      success: true,
      message: `Leave request ${action.toLowerCase()}d successfully`,
      data: {
        leaveRequest: updatedLeaveRequest,
        balanceUpdates,
        actionPerformedBy: {
          id: user.userId,
          role: user.role,
          timestamp: new Date().toISOString()
        }
      }
    })
    
    return withCors(response, origin)
    
  } catch (error: any) {
    console.error('Update leave request error:', error)
    
    if (error.code === 'P2025') {
      const response = NextResponse.json(
        { success: false, message: 'Record not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to update leave request',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}