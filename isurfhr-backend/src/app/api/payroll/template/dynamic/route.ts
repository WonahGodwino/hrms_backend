// src/app/api/payroll/templates/dynamic/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Get all dynamic templates for a company
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const includeSystem = searchParams.get('includeSystem') === 'true'

    if (!companyId) {
      return withCors(ApiResponse.error('Company ID is required', 400), origin)
    }

    // Verify user has access to this company
    if (user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this company', 403), origin)
      }
    }

    // Build where clause
    const where: any = {
      OR: [{ companyId }]
    }

    // Include system templates if requested (available to all companies)
    if (includeSystem) {
      where.OR.push({ isSystem: true })
    }

    const templates = await prisma.payrollTemplate.findMany({
      where,
      include: {
        fields: {
          orderBy: { order: 'asc' }
        },
        _count: {
          select: {
            payrolls: true,
            payrollData: true
          }
        }
      },
      orderBy: [
        { isSystem: 'desc' }, // System templates first
        { createdAt: 'desc' }
      ]
    })

    return withCors(
      ApiResponse.success(templates, 'Templates retrieved successfully'),
      origin
    )

  } catch (error) {
    console.error('Error fetching templates:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// Create new dynamic template
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const body = await request.json()
    const { 
      companyId, 
      templateName,
      sections,
      isSystem = false 
    } = body

    // Validation
    if (!companyId) {
      return withCors(ApiResponse.error('Company ID is required', 400), origin)
    }

    if (!templateName || templateName.trim().length === 0) {
      return withCors(ApiResponse.error('Template name is required', 400), origin)
    }

    if (!sections || typeof sections !== 'object') {
      return withCors(ApiResponse.error('Template sections are required', 400), origin)
    }

    // Only SUPER_ADMIN can create system templates
    if (isSystem && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Only SUPER_ADMIN can create system templates', 403), origin)
    }

    // Verify user has access to this company (unless it's a system template)
    if (!isSystem && user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this company', 403), origin)
      }
    }

    // Check if template already exists for this company
    const existingTemplate = await prisma.payrollTemplate.findFirst({
      where: {
        companyId: isSystem ? undefined : companyId,
        templateName: {
          equals: templateName,
          mode: 'insensitive'
        },
        ...(isSystem ? { isSystem: true } : {})
      }
    })

    if (existingTemplate) {
      return withCors(
        ApiResponse.error(`Template with name "${templateName}" already exists`, 400),
        origin
      )
    }

    // Create template with fields in a transaction
    const template = await prisma.$transaction(async (tx) => {
      // Create the template
      const newTemplate = await tx.payrollTemplate.create({
        data: {
          companyId: isSystem ? 'SYSTEM' : companyId, // Use 'SYSTEM' as placeholder for system templates
          templateName,
          sections,
          isSystem,
          createdBy: user.userId
        }
      })

      // Create fields
      const fields: any[] = []
      let order = 0

      // Expected sections
      const sectionOrder = ['STAFF_DETAILS', 'FIXED_EARNINGS', 'EARNINGS', 'DEDUCTIONS']

      for (const sectionName of sectionOrder) {
        const sectionFields = sections[sectionName] || []
        
        for (const field of sectionFields) {
          // Validate required field properties
          if (!field.displayName) {
            throw new Error(`Field display name is required in section ${sectionName}`)
          }

          if (!field.systemField) {
            // Generate system field from display name if not provided
            field.systemField = field.displayName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
          }

          fields.push({
            templateId: newTemplate.id,
            section: sectionName,
            displayName: field.displayName,
            systemField: field.systemField,
            dataType: field.dataType || 'Text',
            required: field.required || false,
            aliases: field.aliases || [],
            showOnPayslip: field.showOnPayslip || false,
            order: order++,
            createdBy: user.userId
          })
        }
      }

      if (fields.length > 0) {
        await tx.payrollTemplateField.createMany({
          data: fields
        })
      }

      // Return template with fields
      return await tx.payrollTemplate.findUnique({
        where: { id: newTemplate.id },
        include: {
          fields: {
            orderBy: { order: 'asc' }
          }
        }
      })
    })

    return withCors(
      ApiResponse.success(template, 'Template created successfully'),
      origin
    )

  } catch (error) {
    console.error('Error creating template:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// Update existing template
export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const body = await request.json()
    const { 
      templateId,
      templateName,
      sections
    } = body

    if (!templateId) {
      return withCors(ApiResponse.error('Template ID is required', 400), origin)
    }

    // Get existing template
    const existingTemplate = await prisma.payrollTemplate.findUnique({
      where: { id: templateId },
      include: { fields: true }
    })

    if (!existingTemplate) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    // Check permissions
    if (!existingTemplate.isSystem && user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, existingTemplate.companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this template', 403), origin)
      }
    }

    // Update template in transaction
    const template = await prisma.$transaction(async (tx) => {
      // Delete existing fields
      await tx.payrollTemplateField.deleteMany({
        where: { templateId }
      })

      // Update template
      const updatedTemplate = await tx.payrollTemplate.update({
        where: { id: templateId },
        data: {
          templateName: templateName || existingTemplate.templateName,
          sections: sections || existingTemplate.sections,
          updatedBy: user.userId,
          updatedAt: new Date()
        }
      })

      // Create new fields if provided
      if (sections) {
        const fields: any[] = []
        let order = 0

        const sectionOrder = ['STAFF_DETAILS', 'FIXED_EARNINGS', 'EARNINGS', 'DEDUCTIONS']

        for (const sectionName of sectionOrder) {
          const sectionFields = sections[sectionName] || []
          
          for (const field of sectionFields) {
            fields.push({
              templateId: updatedTemplate.id,
              section: sectionName,
              displayName: field.displayName,
              systemField: field.systemField || field.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
              dataType: field.dataType || 'Text',
              required: field.required || false,
              aliases: field.aliases || [],
              showOnPayslip: field.showOnPayslip || false,
              order: order++,
              createdBy: user.userId
            })
          }
        }

        if (fields.length > 0) {
          await tx.payrollTemplateField.createMany({
            data: fields
          })
        }
      }

      return await tx.payrollTemplate.findUnique({
        where: { id: templateId },
        include: {
          fields: {
            orderBy: { order: 'asc' }
          }
        }
      })
    })

    return withCors(
      ApiResponse.success(template, 'Template updated successfully'),
      origin
    )

  } catch (error) {
    console.error('Error updating template:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// Delete template
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')

    if (!templateId) {
      return withCors(ApiResponse.error('Template ID is required', 400), origin)
    }

    // Get template
    const template = await prisma.payrollTemplate.findUnique({
      where: { id: templateId },
      include: {
        _count: {
          select: {
            payrolls: true,
            payrollData: true
          }
        }
      }
    })

    if (!template) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    // Check if template is in use
    if (template._count.payrolls > 0 || template._count.payrollData > 0) {
      return withCors(
        ApiResponse.error('Cannot delete template that has been used for payroll processing', 400),
        origin
      )
    }

    // Check permissions
    if (!template.isSystem && user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, template.companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this template', 403), origin)
      }
    }

    // Delete template (cascades to fields)
    await prisma.payrollTemplate.delete({
      where: { id: templateId }
    })

    return withCors(
      ApiResponse.success(null, 'Template deleted successfully'),
      origin
    )

  } catch (error) {
    console.error('Error deleting template:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

async function verifyCompanyAccess(user: any, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  
  try {
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId: companyId,
        OR: [
          { role: user.role },
          { role: 'ALL' }
        ]
      }
    })
    return !!userCompany
  } catch {
    return user.companyId === companyId
  }
}