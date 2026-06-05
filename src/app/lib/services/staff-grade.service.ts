// src/app/lib/services/staff-grade.service.ts
import { prisma } from '@/app/lib/db'
import { AllowanceCalculatorService, AllowanceCalculationContext } from './allowance-calculator.service'

export class StaffGradeService {
  private companyId: string
  private userId: string
  private userRole: string
  private allowanceCalculator: AllowanceCalculatorService

  constructor(companyId: string, userId: string, userRole: string) {
    this.companyId = companyId
    this.userId = userId
    this.userRole = userRole
    this.allowanceCalculator = new AllowanceCalculatorService(companyId)
  }

  /**
   * Assign a staff member to a grade level and step
   */
  async assignStaffToGrade(
    staffId: string,
    gradeLevelId: string,
    stepNumber: number,
    effectiveDate: Date = new Date(),
    reason: string = 'NEW_ASSIGNMENT',
    customAllowanceParams?: Record<string, any>
  ) {
    // Validate access
    if (!['SUPER_ADMIN', 'HR', 'ADMIN'].includes(this.userRole)) {
      throw new Error('Access denied. Only HR and Admin can assign grades.')
    }

    // Get staff member
    const staff = await prisma.staffRecord.findFirst({
      where: {
        id: staffId,
        companyId: this.companyId
      },
      include: {
        currentGrade: true
      }
    })

    if (!staff) {
      throw new Error('Staff member not found')
    }

    // Get grade level with steps
    const gradeLevel = await prisma.gradeLevel.findFirst({
      where: {
        id: gradeLevelId,
        companyId: this.companyId
      },
      include: {
        steps: true
      }
    })

    if (!gradeLevel) {
      throw new Error('Grade level not found')
    }

    if (gradeLevel.status !== 'Active') {
      throw new Error('Cannot assign to inactive grade level')
    }

    // Validate step
    const step = gradeLevel.steps.find(s => s.stepNumber === stepNumber)
    if (!step) {
      throw new Error(`Step ${stepNumber} not found in grade level ${gradeLevel.name}`)
    }

    // Get base salary
    const baseSalary = step.calculatedPay || gradeLevel.basePay || 0

    // Calculate allowances dynamically
    const allowanceContext: AllowanceCalculationContext = {
      staffId,
      companyId: this.companyId,
      gradeLevelId,
      stepNumber,
      basicSalary: baseSalary,
      effectiveDate,
      customParams: customAllowanceParams
    }

    const calculatedAllowances = await this.allowanceCalculator.calculateAllowances(allowanceContext)
    
    // Calculate totals
    const totalAllowances = calculatedAllowances.reduce((sum, a) => sum + a.amount, 0)
    const totalTaxableAllowances = calculatedAllowances
      .filter(a => a.isTaxable)
      .reduce((sum, a) => sum + a.amount, 0)

    // Get current grade if exists
    const currentGradeId = staff.currentGradeId
    const currentStep = staff.currentGradeStep

    // Start transaction
    return await prisma.$transaction(async (tx) => {
      // End current grade history if exists
      if (currentGradeId) {
        await tx.staffGradeHistory.updateMany({
          where: {
            staffId,
            endDate: null
          },
          data: {
            endDate: effectiveDate
          }
        })
      }

      // Create new grade history entry
      await tx.staffGradeHistory.create({
        data: {
          staffId,
          gradeLevelId,
          stepNumber,
          companyId: this.companyId,
          effectiveDate,
          reason,
          previousGradeId: currentGradeId,
          previousStep: currentStep,
          createdBy: this.userId
        }
      })

      // Store allowance configuration
      const allowanceConfig = {
        rules: calculatedAllowances.map(a => ({
          code: a.code,
          amount: a.amount,
          isTaxable: a.isTaxable,
          calculationMethod: a.calculationMethod
        })),
        totalAllowances,
        totalTaxableAllowances,
        calculatedAt: new Date().toISOString()
      }

      // Update staff record
      const updatedStaff = await tx.staffRecord.update({
        where: { id: staffId },
        data: {
          currentGradeId: gradeLevelId,
          currentGradeStep: stepNumber,
          gradeLevelStartDate: effectiveDate,
          gradeBasicSalary: baseSalary,
          gradeAllowances: allowanceConfig as any, // Store as JSON
          // Update employee salary records
          employeeSalaries: {
            updateMany: {
              where: { isActive: true },
              data: {
                basicSalary: baseSalary,
                housingAllowance: this.findAllowanceAmount(calculatedAllowances, 'HOUSING'),
                transportAllowance: this.findAllowanceAmount(calculatedAllowances, 'TRANSPORT'),
                utilityAllowance: this.findAllowanceAmount(calculatedAllowances, 'UTILITY'),
                dressingAllowance: this.findAllowanceAmount(calculatedAllowances, 'DRESSING'),
                otherAllowances: this.findOtherAllowances(calculatedAllowances)
              }
            }
          }
        },
        include: {
          currentGrade: {
            include: {
              steps: true
            }
          }
        }
      })

      // Create salary history entry
      await tx.staffSalaryHistory.create({
        data: {
          staffId,
          companyId: this.companyId,
          gradeLevelId,
          stepNumber: stepNumber,
          basicSalary: baseSalary,
          totalAllowances,
          grossSalary: baseSalary + totalAllowances,
          effectiveDate,
          reason: 'GRADE_ASSIGNMENT',
          approvedBy: this.userId,
          notes: `Assigned to grade ${gradeLevel.name} step ${stepNumber}\nAllowances: ${JSON.stringify(allowanceConfig)}`
        }
      })

      return {
        staff: updatedStaff,
        allowances: calculatedAllowances,
        totalAllowances,
        grossSalary: baseSalary + totalAllowances
      }
    })
  }

  /**
   * Update allowance rules for a company
   */
  async updateAllowanceRules(rules: Array<{
    code: string
    name: string
    type: string
    value: number
    appliesTo?: string
    gradeLevelId?: string
    minAmount?: number
    maxAmount?: number
    isTaxable?: boolean
    priority?: number
  }>) {
    if (!['SUPER_ADMIN', 'HR', 'ADMIN'].includes(this.userRole)) {
      throw new Error('Access denied. Only HR and Admin can update allowance rules.')
    }

    const results = []
    
    for (const rule of rules) {
      const appliesTo = rule.appliesTo ?? 'BASIC_SALARY'

      const result = await prisma.companyAllowanceRule.upsert({
        where: {
          companyId_code: {
            companyId: this.companyId,
            code: rule.code
          }
        },
        update: {
          name: rule.name,
          type: rule.type as any,
          value: rule.value,
          appliesTo: rule.appliesTo,
          gradeLevelId: rule.gradeLevelId,
          minAmount: rule.minAmount,
          maxAmount: rule.maxAmount,
          isTaxable: rule.isTaxable,
          priority: rule.priority,
          updatedBy: this.userId
        },
        create: {
          companyId: this.companyId,
          code: rule.code,
          name: rule.name,
          type: rule.type as any,
          value: rule.value,
          appliesTo,
          gradeLevelId: rule.gradeLevelId,
          minAmount: rule.minAmount,
          maxAmount: rule.maxAmount,
          isTaxable: rule.isTaxable,
          priority: rule.priority,
          createdBy: this.userId
        }
      })
      results.push(result)
    }

    return results
  }

  /**
   * Get all allowance rules for a company
   */
  async getAllowanceRules(gradeLevelId?: string) {
    const where: any = {
      companyId: this.companyId,
      isActive: true
    }
    
    if (gradeLevelId) {
      where.OR = [
        { gradeLevelId: null },
        { gradeLevelId }
      ]
    }

    const rules = await prisma.companyAllowanceRule.findMany({
      where,
      orderBy: [
        { priority: 'asc' },
        { code: 'asc' }
      ]
    })

    return rules
  }

  /**
   * Configure grade-specific step allowances
   */
  async configureStepAllowances(
    gradeLevelId: string,
    stepNumber: number,
    allowances: Array<{
      allowanceCode: string
      allowanceType: string
      value: number
      isTaxable?: boolean
    }>
  ) {
    if (!['SUPER_ADMIN', 'HR', 'ADMIN'].includes(this.userRole)) {
      throw new Error('Access denied. Only HR and Admin can configure step allowances.')
    }

    const results = []
    
    for (const allowance of allowances) {
      const result = await prisma.gradeStepAllowance.upsert({
        where: {
          gradeLevelId_stepNumber_allowanceCode: {
            gradeLevelId,
            stepNumber,
            allowanceCode: allowance.allowanceCode
          }
        },
        update: {
          allowanceType: allowance.allowanceType as any,
          value: allowance.value,
          isTaxable: allowance.isTaxable || false
        },
        create: {
          companyId: this.companyId,
          gradeLevelId,
          stepNumber,
          allowanceCode: allowance.allowanceCode,
          allowanceType: allowance.allowanceType as any,
          value: allowance.value,
          isTaxable: allowance.isTaxable || false
        }
      })
      results.push(result)
    }

    return results
  }

  private findAllowanceAmount(allowances: any[], code: string): number {
    const allowance = allowances.find(a => a.code === code)
    return allowance?.amount || 0
  }

  private findOtherAllowances(allowances: any[]): number {
    const standardCodes = ['HOUSING', 'TRANSPORT', 'UTILITY', 'DRESSING']
    return allowances
      .filter(a => !standardCodes.includes(a.code))
      .reduce((sum, a) => sum + a.amount, 0)
  }
}