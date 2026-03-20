// prisma/seed-payroll-templates.ts
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const loadEnv = () => {
  try {
    require('dotenv').config({ path: '.env.production' })
  } catch {
    require('dotenv').config()
  }
}
loadEnv()

const buildConnectionString = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
  }

  const databaseUrl = new URL(process.env.DATABASE_URL)
  databaseUrl.searchParams.delete('sslmode')
  databaseUrl.searchParams.delete('ssl')
  databaseUrl.searchParams.delete('sslinline')

  return databaseUrl.toString()
}

const caPath = path.join(process.cwd(), 'certs', 'aiven-ca.pem')

const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: fs.existsSync(caPath)
    ? {
        ca: fs.readFileSync(caPath, 'utf8'),
        rejectUnauthorized: false,
      }
    : {
        rejectUnauthorized: false,
      },
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
const ACTOR = 'Wonah Godwin'

const args = process.argv.slice(2)
const forceUpdate = args.includes('--force') || args.includes('-f')

// Template name MUST match exactly with the type used in upload endpoint
// In upload endpoint: templateType = 'ISURF_STANDARD' or 'BLUERIDGE'
const ISURF_STANDARD_TEMPLATE = {
  systemCompanyId: 'SYSTEM_PAYROLL_ISURF_STANDARD',
  templateName: 'ISURF_STANDARD', // EXACT match to PAYROLL_TEMPLATES.ISURF_STANDARD
  isSystem: true,
  sections: {
    STAFF_DETAILS: [
      {
        displayName: 'Name',
        systemField: 'name',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Email',
        systemField: 'email',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Month',
        systemField: 'month',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Year',
        systemField: 'year',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'No of Working Days in the Month',
        systemField: 'workingDays',
        dataType: 'Number',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'No of days Worked',
        systemField: 'daysWorked',
        dataType: 'Number',
        required: true,
        showOnPayslip: false
      }
    ],
    FIXED_EARNINGS: [
      {
        displayName: 'Basic Salary',
        systemField: 'basic',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Housing Allowance',
        systemField: 'housing',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Transport Allowance',
        systemField: 'transport',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Dressing Allowance',
        systemField: 'dressing',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Leave Allowance',
        systemField: 'leaveAllowance',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Entertainment Allowance',
        systemField: 'entertainment',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Utility Allowance',
        systemField: 'utility',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Other Allowance',
        systemField: 'otherAllowance',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      }
    ],
    EARNINGS: [
      {
        displayName: 'Performance Bonus (PB)',
        systemField: 'bonusKPI',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Overtime Income',
        systemField: 'overtimeIncome',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      }
    ],
    DEDUCTIONS: [
      {
        displayName: 'PAYE Tax',
        systemField: 'payee',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Pension Contribution',
        systemField: 'pension',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Other Deductions',
        systemField: 'deductions',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Medical Contribution',
        systemField: 'medicalContribution',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Employer Pension',
        systemField: 'employerPension',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'NSITF',
        systemField: 'nsitf',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      }
    ]
  }
}

const BLUERIDGE_TEMPLATE = {
  systemCompanyId: 'SYSTEM_PAYROLL_BLUERIDGE',
  templateName: 'BLUERIDGE', // EXACT match to PAYROLL_TEMPLATES.BLUERIDGE
  isSystem: true,
  sections: {
    STAFF_DETAILS: [
      {
        displayName: 'Staff ID',
        systemField: 'staffId',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Name',
        systemField: 'name',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Email',
        systemField: 'email',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Position',
        systemField: 'position',
        dataType: 'Text',
        required: false,
        showOnPayslip: false
      },
      {
        displayName: 'Month',
        systemField: 'month',
        dataType: 'Text',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Working Days',
        systemField: 'workingDays',
        dataType: 'Number',
        required: true,
        showOnPayslip: false
      },
      {
        displayName: 'Worked Days',
        systemField: 'workedDays',
        dataType: 'Number',
        required: true,
        showOnPayslip: false
      }
    ],
    FIXED_EARNINGS: [
      {
        displayName: 'Basic Salary',
        systemField: 'basicSalary',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Housing Allowance',
        systemField: 'housing',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Transport Allowance',
        systemField: 'transport',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Other Allowance',
        systemField: 'otherAllowance',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      }
    ],
    EARNINGS: [
      {
        displayName: 'Overtime Income (OI)',
        systemField: 'overtimeIncome',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Communication Allowance (CA)',
        systemField: 'communicationAllowance',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Transportation Allowance (TA)',
        systemField: 'transportationAllowance',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Outstanding Income (OI)',
        systemField: 'outstandingIncome',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Performance Bonus (PB)',
        systemField: 'bonusKPI',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      }
    ],
    DEDUCTIONS: [
      {
        displayName: 'PAYE Tax',
        systemField: 'payee',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Pension Contribution',
        systemField: 'pension',
        dataType: 'Number',
        required: true,
        showOnPayslip: true
      },
      {
        displayName: 'Penalty & Deductions',
        systemField: 'deductions',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Employer Pension Contribution',
        systemField: 'employerPension',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Management Fees',
        systemField: 'managementFee',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'VAT on Management Fees',
        systemField: 'vatOnManagementFee',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      },
      {
        displayName: 'Total Cost',
        systemField: 'totalInvoiceValue',
        dataType: 'Number',
        required: false,
        showOnPayslip: true
      }
    ]
  }
}

const TEMPLATE_SECTIONS = ['STAFF_DETAILS', 'FIXED_EARNINGS', 'EARNINGS', 'DEDUCTIONS'] as const

function normalizeSectionsWithPayslipTrue(
  sections: typeof ISURF_STANDARD_TEMPLATE.sections | typeof BLUERIDGE_TEMPLATE.sections
) {
  const normalized: Record<string, any[]> = {}

  for (const sectionName of TEMPLATE_SECTIONS) {
    const sectionFields = sections[sectionName] || []
    normalized[sectionName] = sectionFields.map((field) => ({
      ...field,
      showOnPayslip: true,
    }))
  }

  return normalized
}

async function ensureSystemCompany(id: string, companyName: string) {
  return prisma.company.upsert({
    where: { id },
    update: {
      companyName,
      email: `${id.toLowerCase()}@system.local`,
      archived: 0,
    },
    create: {
      id,
      companyName,
      email: `${id.toLowerCase()}@system.local`,
      archived: 0,
      createdBy: ACTOR,
    },
  })
}

async function createOrUpdateTemplate(
  templateDef: typeof ISURF_STANDARD_TEMPLATE | typeof BLUERIDGE_TEMPLATE,
  shouldUpdate: boolean
) {
  await ensureSystemCompany(
    templateDef.systemCompanyId,
    `System Payroll Template - ${templateDef.templateName}`
  )

  const normalizedSections = normalizeSectionsWithPayslipTrue(templateDef.sections)

  const existing = await prisma.payrollTemplate.findFirst({
    where: {
      templateName: templateDef.templateName,
      isSystem: true,
    },
  })

  if (!existing) {
    const createdTemplate = await prisma.$transaction(async (tx) => {
      const template = await tx.payrollTemplate.create({
        data: {
          companyId: templateDef.systemCompanyId,
          templateName: templateDef.templateName,
          sections: normalizedSections,
          isSystem: true,
          createdBy: ACTOR,
        },
      })

      const fields: any[] = []
      let order = 0

      for (const sectionName of TEMPLATE_SECTIONS) {
        const sectionFields = normalizedSections[sectionName] || []

        for (const field of sectionFields) {
          fields.push({
            templateId: template.id,
            section: sectionName,
            displayName: field.displayName,
            systemField: field.systemField,
            dataType: field.dataType,
            required: field.required,
            aliases: 'aliases' in field ? field.aliases || [] : [],
            showOnPayslip: true,
            order: order++,
            createdBy: ACTOR,
          })
        }
      }

      if (fields.length > 0) {
        await tx.payrollTemplateField.createMany({ data: fields })
      }

      return template
    })

    console.log(`✅ ${templateDef.templateName} template created with ID: ${createdTemplate.id}`)
    return
  }

  if (!shouldUpdate) {
    console.log(`⚠️ ${templateDef.templateName} template already exists, skipping update (use --force to update).`)
    return
  }

  const updatedTemplate = await prisma.$transaction(async (tx) => {
    await tx.payrollTemplateField.deleteMany({
      where: { templateId: existing.id },
    })

    const template = await tx.payrollTemplate.update({
      where: { id: existing.id },
      data: {
        companyId: templateDef.systemCompanyId,
        sections: normalizedSections,
        updatedBy: ACTOR,
        updatedAt: new Date(),
      },
    })

    const fields: any[] = []
    let order = 0

    for (const sectionName of TEMPLATE_SECTIONS) {
      const sectionFields = normalizedSections[sectionName] || []

      for (const field of sectionFields) {
        fields.push({
          templateId: template.id,
          section: sectionName,
          displayName: field.displayName,
          systemField: field.systemField,
          dataType: field.dataType,
          required: field.required,
          aliases: 'aliases' in field ? field.aliases || [] : [],
          showOnPayslip: true,
          order: order++,
          createdBy: ACTOR,
        })
      }
    }

    if (fields.length > 0) {
      await tx.payrollTemplateField.createMany({ data: fields })
    }

    return template
  })

  console.log(`🔄 ${templateDef.templateName} template updated with ID: ${updatedTemplate.id}`)
}

async function seedPayrollTemplates() {
  console.log('🌱 Seeding payroll templates...')
  console.log('Note: Template names must match exactly: ISURF_STANDARD and BLUERIDGE')
  console.log(`Mode: ${forceUpdate ? 'UPDATE_EXISTING' : 'CREATE_ONLY'} | Actor: ${ACTOR}`)

  try {
    await createOrUpdateTemplate(ISURF_STANDARD_TEMPLATE, forceUpdate)
    await createOrUpdateTemplate(BLUERIDGE_TEMPLATE, forceUpdate)

    // Verify the seeded templates
    const seededTemplates = await prisma.payrollTemplate.findMany({
      where: {
        isSystem: true,
        templateName: {
          in: ['ISURF_STANDARD', 'BLUERIDGE']
        }
      },
      select: {
        id: true,
        templateName: true,
        isSystem: true,
        _count: {
          select: {
            fields: true
          }
        }
      }
    })

    console.log('\n📋 Seeded templates summary:')
    seededTemplates.forEach(template => {
      console.log(`  - ${template.templateName}: ${template._count.fields} fields`)
    })

    console.log('\n🎉 Payroll templates seeding completed!')
    console.log('\n💡 These templates can now be selected via the payroll upload endpoint:')
    console.log('   POST /api/payroll/upload?type=ISURF_STANDARD')
    console.log('   POST /api/payroll/upload?type=BLUERIDGE')
    
  } catch (error) {
    console.error('❌ Error seeding payroll templates:', error)
    throw error
  }
}

// Run the seed function
seedPayrollTemplates()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })