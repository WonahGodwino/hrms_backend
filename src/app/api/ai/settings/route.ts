// src/app/api/ai/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await getUserFromToken(token) // Added await

    if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'HR' && user.role !== 'ADMIN')) {
      return withCors(
        ApiResponse.error('Insufficient permissions. Required role: SUPER_ADMIN, HR, or ADMIN', 403),
        origin
      )
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    let targetCompanyId: string
    
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can view any company's settings
      targetCompanyId = companyId || user.companyId || ''
    } else {
      // HR/ADMIN can only view their own company's settings
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR/ADMIN user', 400),
          origin
        )
      }
      targetCompanyId = user.companyId
      
      // HR/ADMIN cannot view other companies' settings
      if (companyId && companyId !== user.companyId) {
        return withCors(
          ApiResponse.error('HR/ADMIN users can only view their own company settings', 403),
          origin
        )
      }
    }

    if (!targetCompanyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Get or create AI settings for company
    let aiSettings = await prisma.aISettings.findUnique({
      where: { companyId: targetCompanyId },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    })

    if (!aiSettings) {
      aiSettings = await prisma.aISettings.create({
        data: {
          companyId: targetCompanyId,
          monthlyBudget: 100.00,
          costPerReview: 0.02,
          costAlertThreshold: 80,
          enabled: true,
          defaultService: 'openai',
          defaultModel: 'gpt-3.5-turbo',
          autoShortlistThreshold: 75,
          useForSeniorRoles: true,
          useForTechnicalRoles: true,
          useForManagerRoles: true,
          notifyEmails: [user.email || 'admin@company.com']
        },
        include: {
          company: {
            select: {
              id: true,
              companyName: true
            }
          }
        }
      })
    }

    return withCors(
      ApiResponse.success({
        settings: aiSettings,
        permissions: {
          canEdit: user.role === 'SUPER_ADMIN' || user.role === 'ADMIN',
          canDelete: user.role === 'SUPER_ADMIN'
        },
        currentMonth: new Date().getMonth() + 1,
        currentYear: new Date().getFullYear()
      }, 'AI settings retrieved successfully'),
      origin
    )
  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error fetching AI settings:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await getUserFromToken(token) // Added await

    if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
      return withCors(
        ApiResponse.error('Insufficient permissions. Only SUPER_ADMIN and ADMIN can update settings', 403),
        origin
      )
    }

    const body = await request.json()
    const { companyId, ...settingsData } = body
    
    let targetCompanyId: string
    
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can update any company's settings
      targetCompanyId = companyId || user.companyId || ''
    } else {
      // ADMIN can only update their own company's settings
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for ADMIN user', 400),
          origin
        )
      }
      targetCompanyId = user.companyId
      
      // ADMIN cannot update other companies' settings
      if (companyId && companyId !== user.companyId) {
        return withCors(
          ApiResponse.error('ADMIN users can only update their own company settings', 403),
          origin
        )
      }
    }

    if (!targetCompanyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: targetCompanyId }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found', 404),
        origin
      )
    }

    // Update or create settings
    const aiSettings = await prisma.aISettings.upsert({
      where: { companyId: targetCompanyId },
      update: {
        monthlyBudget: settingsData.monthlyBudget,
        costPerReview: settingsData.costPerReview,
        costAlertThreshold: settingsData.costAlertThreshold,
        enabled: settingsData.enabled,
        defaultService: settingsData.defaultService,
        defaultModel: settingsData.defaultModel,
        autoShortlistThreshold: settingsData.autoShortlistThreshold,
        useForSeniorRoles: settingsData.useForSeniorRoles,
        useForTechnicalRoles: settingsData.useForTechnicalRoles,
        useForManagerRoles: settingsData.useForManagerRoles,
        notifyEmails: settingsData.notifyEmails,
        updatedAt: new Date(),
        updatedBy: user.userId
      },
      create: {
        companyId: targetCompanyId,
        monthlyBudget: settingsData.monthlyBudget || 100.00,
        costPerReview: settingsData.costPerReview || 0.02,
        costAlertThreshold: settingsData.costAlertThreshold || 80,
        enabled: settingsData.enabled !== undefined ? settingsData.enabled : true,
        defaultService: settingsData.defaultService || 'openai',
        defaultModel: settingsData.defaultModel || 'gpt-3.5-turbo',
        autoShortlistThreshold: settingsData.autoShortlistThreshold || 75,
        useForSeniorRoles: settingsData.useForSeniorRoles !== undefined ? settingsData.useForSeniorRoles : true,
        useForTechnicalRoles: settingsData.useForTechnicalRoles !== undefined ? settingsData.useForTechnicalRoles : true,
        useForManagerRoles: settingsData.useForManagerRoles !== undefined ? settingsData.useForManagerRoles : true,
        notifyEmails: settingsData.notifyEmails || [user.email || 'admin@company.com'],
        createdBy: user.userId
      },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    })

    return withCors(
      ApiResponse.success({
        settings: aiSettings,
        message: 'AI settings updated successfully',
        updatedBy: user.userId,
        timestamp: new Date().toISOString()
      }, 'AI settings updated'),
      origin
    )
  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error updating AI settings:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await getUserFromToken(token) // Added await

    if (!user || user.role !== 'SUPER_ADMIN') {
      return withCors(
        ApiResponse.error('Insufficient permissions. Only SUPER_ADMIN can delete settings', 403),
        origin
      )
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Delete settings
    await prisma.aISettings.delete({
      where: { companyId }
    })

    return withCors(
      ApiResponse.success({
        message: 'AI settings deleted successfully',
        companyId,
        deletedBy: user.userId,
        timestamp: new Date().toISOString()
      }, 'AI settings deleted'),
      origin
    )
  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error deleting AI settings:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}