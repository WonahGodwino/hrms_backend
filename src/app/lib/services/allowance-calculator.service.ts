// src/app/lib/services/allowance-calculator.service.ts
import { prisma } from '@/app/lib/db'

export interface AllowanceCalculationContext {
  staffId: string
  companyId: string
  gradeLevelId: string
  stepNumber: number
  basicSalary: number
  effectiveDate: Date
  customParams?: Record<string, any>
}

export interface AllowanceResult {
  code: string
  name: string
  amount: number
  isTaxable: boolean
  calculationMethod: string
  breakdown?: string
}

export class AllowanceCalculatorService {
  private companyId: string

  constructor(companyId: string) {
    this.companyId = companyId
  }

  /**
   * Calculate all allowances for a staff member based on company rules
   */
  async calculateAllowances(context: AllowanceCalculationContext): Promise<AllowanceResult[]> {
    // Get company allowance rules
    const companyRules = await prisma.companyAllowanceRule.findMany({
      where: {
        companyId: this.companyId,
        isActive: true,
        OR: [
          { gradeLevelId: null },
          { gradeLevelId: context.gradeLevelId }
        ]
      },
      orderBy: {
        priority: 'asc'
      }
    })

    // Get grade-specific step allowances
    const stepAllowances = await prisma.gradeStepAllowance.findMany({
      where: {
        companyId: this.companyId,
        gradeLevelId: context.gradeLevelId,
        stepNumber: context.stepNumber
      }
    })

    // Get grade allowance templates
    const gradeTemplates = await prisma.gradeAllowanceTemplate.findMany({
      where: {
        companyId: this.companyId,
        gradeLevelId: context.gradeLevelId
      }
    })

    // Combine all rules (company rules override grade rules, step allowances override all)
    const allRules = this.mergeAllowanceRules(companyRules, gradeTemplates, stepAllowances)

    // Calculate each allowance
    const calculatedAllowances: AllowanceResult[] = []
    
    for (const rule of allRules) {
      const amount = await this.calculateAllowanceAmount(rule, context)
      if (amount > 0) {
        calculatedAllowances.push({
          code: rule.code,
          name: rule.name,
          amount,
          isTaxable: rule.isTaxable || false,
          calculationMethod: `${rule.type} - ${rule.value}${rule.type === 'PERCENTAGE' ? '%' : ''}`,
          breakdown: this.generateBreakdown(rule, context, amount)
        })
      }
    }

    return calculatedAllowances
  }

  /**
   * Calculate a single allowance amount based on rule type
   */
  private async calculateAllowanceAmount(rule: any, context: AllowanceCalculationContext): Promise<number> {
    let baseAmount = 0

    switch (rule.type) {
      case 'PERCENTAGE':
        const percentageBase = rule.appliesTo === 'BASIC_SALARY' 
          ? context.basicSalary 
          : context.basicSalary // Could be gross salary or other
        baseAmount = (percentageBase * (rule.value || 0)) / 100
        
        // Apply min/max limits
        if (rule.minAmount && baseAmount < rule.minAmount) baseAmount = rule.minAmount
        if (rule.maxAmount && baseAmount > rule.maxAmount) baseAmount = rule.maxAmount
        break

      case 'FIXED':
        baseAmount = rule.value || 0
        break

      case 'TIERED':
        baseAmount = await this.calculateTieredAllowance(rule, context)
        break

      case 'FORMULA':
        baseAmount = await this.calculateFormulaAllowance(rule, context)
        break

      default:
        baseAmount = 0
    }

    return Math.round(baseAmount * 100) / 100
  }

  /**
   * Calculate tiered allowance (e.g., different rates for different salary brackets)
   */
  private async calculateTieredAllowance(rule: any, context: AllowanceCalculationContext): Promise<number> {
    // Expected rule.tiers format: [{ min: 0, max: 500000, percentage: 10, fixed: 0 }, ...]
    if (!rule.tiers || !Array.isArray(rule.tiers)) return 0

    const applicableTier = rule.tiers.find((tier: any) => {
      const salary = context.basicSalary
      const meetsMin = !tier.min || salary >= tier.min
      const meetsMax = !tier.max || salary <= tier.max
      return meetsMin && meetsMax
    })

    if (!applicableTier) return 0

    if (applicableTier.percentage) {
      return (context.basicSalary * applicableTier.percentage) / 100
    } else if (applicableTier.fixed) {
      return applicableTier.fixed
    }

    return 0
  }

  /**
   * Calculate formula-based allowance using custom formula
   */
  private async calculateFormulaAllowance(rule: any, context: AllowanceCalculationContext): Promise<number> {
    // Example formula: { operation: "multiply", value: 1.5, base: "basic_salary" }
    // Or more complex: { operation: "add", values: ["basic_salary * 0.1", "fixed_amount"] }
    
    if (!rule.formula) return 0

    try {
      // Simple formula evaluation (in production, use a proper expression evaluator)
      const evaluateExpression = (expr: string, ctx: any): number => {
        // Replace variables with actual values
        let expression = expr
          .replace(/basic_salary/g, ctx.basicSalary.toString())
          .replace(/step_number/g, ctx.stepNumber.toString())
          .replace(/years_of_service/g, ctx.yearsOfService?.toString() || '0')
        
        // Safely evaluate (in production, use a math expression parser)
        return Function(`"use strict"; return (${expression})`)()
      }

      let result = 0
      if (rule.formula.operation === 'multiply') {
        result = context.basicSalary * (rule.formula.value || 1)
      } else if (rule.formula.operation === 'add') {
        result = (rule.formula.values || []).reduce((sum: number, val: string) => {
          return sum + evaluateExpression(val, context)
        }, 0)
      }

      return result
    } catch (error) {
      console.error(`Error calculating formula allowance for ${rule.code}:`, error)
      return 0
    }
  }

  /**
   * Merge rules from different sources with proper precedence
   */
  private mergeAllowanceRules(companyRules: any[], gradeTemplates: any[], stepAllowances: any[]): any[] {
    const ruleMap = new Map()

    // Add grade templates first (lower priority)
    for (const template of gradeTemplates) {
      ruleMap.set(template.allowanceCode, {
        ...template,
        code: template.allowanceCode,
        name: this.getAllowanceName(template.allowanceCode)
      })
    }

    // Company rules override grade templates
    for (const rule of companyRules) {
      ruleMap.set(rule.code, {
        ...rule,
        name: rule.name
      })
    }

    // Step allowances have highest priority
    for (const stepAllowance of stepAllowances) {
      ruleMap.set(stepAllowance.allowanceCode, {
        ...stepAllowance,
        code: stepAllowance.allowanceCode,
        name: this.getAllowanceName(stepAllowance.allowanceCode),
        type: stepAllowance.allowanceType,
        value: stepAllowance.value,
        isTaxable: stepAllowance.isTaxable
      })
    }

    return Array.from(ruleMap.values())
  }

  /**
   * Helper to get readable allowance names
   */
  private getAllowanceName(code: string): string {
    const names: Record<string, string> = {
      'HOUSING': 'Housing Allowance',
      'TRANSPORT': 'Transport Allowance',
      'UTILITY': 'Utility Allowance',
      'MEAL': 'Meal Subsidy',
      'DRESSING': 'Dressing Allowance',
      'ENTERTAINMENT': 'Entertainment Allowance',
      'LEAVE': 'Leave Allowance',
      '13TH_MONTH': '13th Month Salary',
      'PERFORMANCE': 'Performance Bonus',
      'HAZARD': 'Hazard Allowance',
      'SHIFT': 'Shift Allowance',
      'OVERTIME': 'Overtime Pay'
    }
    return names[code] || code
  }

  /**
   * Generate breakdown explanation
   */
  private generateBreakdown(rule: any, context: AllowanceCalculationContext, amount: number): string {
    if (rule.type === 'PERCENTAGE') {
      return `${rule.value}% of ${rule.appliesTo === 'BASIC_SALARY' ? 'basic salary' : 'gross salary'} = ${amount.toFixed(2)}`
    } else if (rule.type === 'FIXED') {
      return `Fixed amount of ${amount.toFixed(2)}`
    } else if (rule.type === 'TIERED') {
      return `Based on salary tier: ${amount.toFixed(2)}`
    } else {
      return `Calculated using company formula: ${amount.toFixed(2)}`
    }
  }
}