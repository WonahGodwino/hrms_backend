// app/api/leaves/apply/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'

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
  // Default: Monday-Friday (1,2,3,4,5)
  const defaultPattern = [1, 2, 3, 4, 5]
  
  if (!pattern) {
    return defaultPattern
  }
  
  try {
    // Handle JSON array format
    if (pattern.startsWith('[')) {
      const parsed = JSON.parse(pattern)
      if (Array.isArray(parsed) && parsed.every(d => typeof d === 'number')) {
        return parsed
      }
    }
    
    // Handle string format like "12345"
    if (/^[1-7]+$/.test(pattern)) {
      return pattern.split('').map(d => parseInt(d))
    }
    
    // Handle comma-separated format like "1,2,3,4,5"
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
  
  // Get company's work week configuration
  const { prisma } = await import('@/app/lib/prisma')
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { workWeekPattern: true }
  })
  
  // Parse work week pattern with default fallback
  const workDays = parseWorkWeekPattern(company?.workWeekPattern || null)
  
  // Get public holidays for the date range
  const holidays = await prisma.publicHoliday.findMany({
    where: {
      companyId,
      OR: [
        {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        {
          isRecurring: true
        }
      ]
    }
  })
  
  // Create holiday lookup
  const holidaySet = new Set<string>()
  holidays.forEach(holiday => {
    if (holiday.isRecurring) {
      const holidayMonth = holiday.date.getMonth() + 1
      const holidayDay = holiday.date.getDate()
      holidaySet.add(`${holidayMonth}-${holidayDay}`)
    } else {
      holidaySet.add(holiday.date.toISOString().split('T')[0])
    }
  })
  
  // Calculate working days
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

  // Store policy details for response
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

  // 1. Check maximum days per policy
  if (policy.maxDays && requestedDays > policy.maxDays) {
    errors.push(
      `Maximum ${policy.maxDays} days allowed for ${leaveType.name}. ` +
      `You requested ${requestedDays} days.`
    )
  }

  // 2. Check advance notice requirement
  if (policy.noticePeriod > 0) {
    const noticeDays = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (noticeDays < policy.noticePeriod) {
      errors.push(
        `${policy.noticePeriod} days advance notice required for ${leaveType.name}. ` +
        `You gave ${noticeDays} days notice.`
      )
    }
  }

  // 3. Check minimum employment duration
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

  // 4. Check documentation requirements
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

  // 5. Check accrual rate
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

  // 6. Check if leave is paid
  if (!policy.isPaid) {
    warnings.push(`${leaveType.name} is unpaid leave according to company policy.`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    policyDetails
  }
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
  
  if (!policy.isPaid) {
    notes.push('⚠️ Unpaid leave')
  }
  
  if (policy.documentationRequired) {
    notes.push('📋 Documentation required')
  }
  
  if (policy.carryOver > 0) {
    notes.push(`♻️ Up to ${policy.carryOver} days can be carried over`)
  }
  
  if (policy.accrualRate) {
    notes.push(`📊 Accrual rate: ${policy.accrualRate} days/month`)
  }
  
  if (policy.minEmploymentMonths > 0) {
    notes.push(`⏳ Minimum employment: ${policy.minEmploymentMonths} months`)
  }
  
  if (policy.noticePeriod > 0) {
    notes.push(`📅 Advance notice: ${policy.noticePeriod} days`)
  }
  
  notes.push(`✅ Maximum days per request: ${policy.maxDays}`)
  
  return notes
}

// -----------------------------
// OPTIONS - CORS preflight
// -----------------------------
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// -----------------------------
// POST - Apply for leave
// -----------------------------
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

    // Get staff record - user must be an employee applying for themselves
    const { prisma } = await import('@/app/lib/prisma')
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
            email: true
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
          pendingDays: {
            increment: requestedDays
          }
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
      const leaveRequest = await tx.leaveRequest.create({
        data: {
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
          metadata: {
            policyValidation: {
              passed: true,
              warnings: policyValidation.warnings,
              policyName: policy.name,
              maxDays: policy.maxDays,
              noticePeriod: policy.noticePeriod,
              requiresApproval: policy.requiresApproval,
              approvalWorkflow: policy.approvalWorkflow,
              documentationRequired: policy.documentationRequired,
              isPaid: policy.isPaid,
              carryOver: policy.carryOver,
              accrualRate: policy.accrualRate,
              minEmploymentMonths: policy.minEmploymentMonths
            },
            documentation: {
              medicalCertificateNumber: data.medicalCertificateNumber,
              medicalCertificateDate: data.medicalCertificateDate,
              medicalCertificateIssuer: data.medicalCertificateIssuer,
              requiredByPolicy: policy.documentationRequired
            },
            calculatedDays: {
              requested: requestedDays,
              workingDaysExcludingHolidays: requestedDays,
              isHalfDay: data.isHalfDay,
              halfDayPart: data.halfDayPart
            }
          }
        }
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

      // Create notification for manager if required
      if (status === 'PENDING' && staff.manager) {
        await tx.notification.create({
          data: {
            userId: staff.manager.id,
            type: 'LEAVE_REQUEST',
            title: 'New Leave Request for Approval',
            message: `${staff.firstName} ${staff.lastName} has requested ${requestedDays} day(s) of ${leaveType.name} leave`,
            data: {
              leaveRequestId: leaveRequest.id,
              staffName: `${staff.firstName} ${staff.lastName}`,
              leaveType: leaveType.name,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              days: requestedDays
            },
            companyId: staff.companyId,
            read: false
          }
        })
      }

      return {
        leaveRequest,
        balance: updatedBalance,
        policy,
        leaveType,
        manager: staff.manager,
        warnings: policyValidation.warnings,
        policyDetails: policyValidation.policyDetails
      }
    })

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
        referenceNumber: `LR-${staff.companyId.slice(0, 4)}-${result.leaveRequest.id.slice(-6).toUpperCase()}`,
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
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
        importantNotes: getImportantNotes(result.policy)
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