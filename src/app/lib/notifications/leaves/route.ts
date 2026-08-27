// /src/app/api/notifications/leaves/route.ts - COMPLETE WORKING VERSION
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'

// Validation schemas
const getNotificationsSchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
  read: z.enum(['true', 'false', 'all']).optional().default('all'),
  type: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

const markAsReadSchema = z.object({
  notificationIds: z.array(z.string().cuid()).optional(),
  markAll: z.boolean().optional().default(false)
})

const createNotificationSchema = z.object({
  userId: z.string().cuid(),
  type: z.string(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  data: z.record(z.any()).optional(),
  companyId: z.string().cuid()
})

// Helper function to get manager's team staff IDs
async function getManagedStaffIds(managerId: string, companyId: string) {
  const managedStaff = await prisma.staffRecord.findMany({
    where: {
      managerId,
      companyId,
      isActive: true
    },
    select: { id: true }
  })
  
  return managedStaff.map(staff => staff.id)
}

// Helper to get HR/Admin staff IDs
async function getHRAdminStaffIds(companyId: string) {
  const hrAdmins = await prisma.staffRecord.findMany({
    where: {
      companyId,
      role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] },
      isActive: true
    },
    select: { id: true }
  })
  
  return hrAdmins.map(staff => staff.id)
}

// ==================== HELPER FUNCTIONS ====================

async function getUserNotificationsData(userId: string, companyId: string, filters: any) {
  const { page = 1, limit = 20, read = 'all', type, startDate, endDate } = filters
  
  const where: any = {
    userId,
    companyId
  }
  
  if (read !== 'all') {
    where.read = read === 'true'
  }
  
  if (type) {
    where.type = type
  }
  
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = new Date(startDate)
    if (endDate) where.createdAt.lte = new Date(endDate)
  }
  
  const skip = (page - 1) * limit
  
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        read: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.notification.count({ where })
  ])
  
  return {
    notifications: notifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data as string) : null
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  }
}

async function getManagerNotificationsData(managerId: string, companyId: string, filters: any) {
  const managedStaffIds = await getManagedStaffIds(managerId, companyId)
  
  const where: any = {
    companyId,
    OR: [
      // Notifications directly to manager
      { userId: managerId },
      // Notifications about leave requests from managed staff
      {
        userId: { in: managedStaffIds },
        type: { contains: 'LEAVE' }
      }
    ]
  }
  
  if (filters.read !== 'all') {
    where.read = filters.read === 'true'
  }
  
  if (filters.type) {
    where.type = filters.type
  }
  
  const skip = (filters.page - 1) * filters.limit
  
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        read: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffId: true,
            department: true,
            position: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: filters.limit
    }),
    prisma.notification.count({ where })
  ])
  
  return {
    notifications: notifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data as string) : null,
      isDirect: notification.userId === managerId
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasNext: filters.page * filters.limit < total,
      hasPrev: filters.page > 1
    }
  }
}

async function getHRNotificationsData(companyId: string, filters: any) {
  const hrAdminIds = await getHRAdminStaffIds(companyId)
  
  const where: any = {
    companyId,
    OR: [
      // Notifications to HR/Admin users
      { userId: { in: hrAdminIds } },
      // Leave notifications that HR should see
      {
        type: {
          in: [
            'LEAVE_HR_APPROVAL_NEEDED',
            'LEAVE_REQUEST_SUBMITTED',
            'LEAVE_APPROVED',
            'LEAVE_REJECTED',
            'LEAVE_CANCELLED'
          ]
        }
      }
    ]
  }
  
  if (filters.read !== 'all') {
    where.read = filters.read === 'true'
  }
  
  if (filters.type) {
    where.type = filters.type
  }
  
  const skip = (filters.page - 1) * filters.limit
  
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        read: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffId: true,
            department: true,
            position: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: filters.limit
    }),
    prisma.notification.count({ where })
  ])
  
  return {
    notifications: notifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data as string) : null,
      isHRAdmin: hrAdminIds.includes(notification.userId)
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasNext: filters.page * filters.limit < total,
      hasPrev: filters.page > 1
    }
  }
}

async function getAdminNotificationsData(companyId: string, filters: any) {
  // Admins see all notifications in their company
  const where: any = { companyId }
  
  if (filters.read !== 'all') {
    where.read = filters.read === 'true'
  }
  
  if (filters.type) {
    where.type = filters.type
  }
  
  if (filters.userId) {
    where.userId = filters.userId
  }
  
  const skip = (filters.page - 1) * filters.limit
  
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        read: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffId: true,
            department: true,
            position: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: filters.limit
    }),
    prisma.notification.count({ where })
  ])
  
  return {
    notifications: notifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data as string) : null
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasNext: filters.page * filters.limit < total,
      hasPrev: filters.page > 1
    }
  }
}

async function getUnreadCount(userId: string, companyId: string, role: string) {
  let where: any = {
    companyId,
    read: false
  }
  
  switch (role) {
    case 'STAFF':
      where.userId = userId
      break
      
    case 'MANAGER':
      const managedStaffIds = await getManagedStaffIds(userId, companyId)
      where = {
        companyId,
        read: false,
        OR: [
          { userId },
          {
            userId: { in: managedStaffIds },
            type: { contains: 'LEAVE' }
          }
        ]
      }
      break
      
    case 'HR':
      const hrAdminIds = await getHRAdminStaffIds(companyId)
      where = {
        companyId,
        read: false,
        OR: [
          { userId: { in: hrAdminIds } },
          { type: 'LEAVE_HR_APPROVAL_NEEDED' }
        ]
      }
      break
      
    case 'ADMIN':
    case 'SUPER_ADMIN':
      // Admins see all unread
      where = { companyId, read: false }
      break
  }
  
  return await prisma.notification.count({ where })
}

// Same visibility rules as the GET handlers above, factored out so mutations
// (mark-as-read, delete) authorize against everything a role can actually
// see rather than just notifications addressed to their own userId — HR,
// ADMIN, SUPER_ADMIN and MANAGER routinely see notifications belonging to
// other staff, and restricting mutations to `userId: user.userId` silently
// no-ops on all of those rows.
async function getNotificationVisibilityWhere(userId: string, companyId: string, role: string): Promise<any> {
  switch (role) {
    case 'MANAGER': {
      const managedStaffIds = await getManagedStaffIds(userId, companyId)
      return {
        OR: [
          { userId },
          { userId: { in: managedStaffIds }, type: { contains: 'LEAVE' } }
        ]
      }
    }

    case 'HR': {
      const hrAdminIds = await getHRAdminStaffIds(companyId)
      return {
        OR: [
          { userId: { in: hrAdminIds } },
          {
            type: {
              in: [
                'LEAVE_HR_APPROVAL_NEEDED',
                'LEAVE_REQUEST_SUBMITTED',
                'LEAVE_APPROVED',
                'LEAVE_REJECTED',
                'LEAVE_CANCELLED'
              ]
            }
          }
        ]
      }
    }

    case 'ADMIN':
    case 'SUPER_ADMIN':
      // Admins can act on every notification in their company.
      return {}

    case 'STAFF':
    default:
      return { userId }
  }
}

// ==================== API ENDPOINTS ====================

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get notifications for current user based on role
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
    
    // Get query parameters
    const { searchParams } = new URL(request.url)
    const params = Object.fromEntries(searchParams.entries())
    
    // Validate query parameters
    const validationResult = getNotificationsSchema.safeParse(params)
    if (!validationResult.success) {
      const response = NextResponse.json(
        { 
          success: false,
          message: 'Invalid query parameters',
          details: validationResult.error.format() 
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    const filters = validationResult.data
    
    // Get user's staff record to get company
    const staff = await prisma.staffRecord.findUnique({
      where: { 
        id: user.userId,
        isActive: true 
      },
      select: {
        id: true,
        companyId: true,
        role: true
      }
    })
    
    if (!staff || !staff.companyId) {
      const response = NextResponse.json(
        { success: false, message: 'Staff record not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    let result
    
    // Get notifications based on role
    switch (user.role) {
      case 'STAFF':
        result = await getUserNotificationsData(user.userId, staff.companyId, filters)
        break
        
      case 'MANAGER':
        result = await getManagerNotificationsData(user.userId, staff.companyId, filters)
        break
        
      case 'HR':
        result = await getHRNotificationsData(staff.companyId, filters)
        break
        
      case 'ADMIN':
      case 'SUPER_ADMIN':
        result = await getAdminNotificationsData(staff.companyId, filters)
        break
        
      default:
        const response = NextResponse.json(
          { success: false, message: 'Unauthorized role' },
          { status: 403 }
        )
        return withCors(response, origin)
    }
    
    // Get unread count
    const unreadCount = await getUnreadCount(user.userId, staff.companyId, user.role)
    
    const response = NextResponse.json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications: result.notifications,
        pagination: result.pagination,
        unreadCount,
        role: user.role,
        filters: {
          ...filters,
          read: filters.read === 'all' ? undefined : filters.read === 'true'
        }
      }
    })
    
    return withCors(response, origin)
    
  } catch (error: any) {
    console.error('Get notifications error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to fetch notifications',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}

// POST - Mark notifications as read
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
    const validationResult = markAsReadSchema.safeParse(body)
    
    if (!validationResult.success) {
      const response = NextResponse.json(
        { 
          success: false,
          message: 'Invalid request body',
          details: validationResult.error.format() 
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    const { notificationIds, markAll } = validationResult.data
    
    // Get user's company
    const staff = await prisma.staffRecord.findUnique({
      where: { 
        id: user.userId,
        isActive: true 
      },
      select: { companyId: true }
    })
    
    if (!staff || !staff.companyId) {
      const response = NextResponse.json(
        { success: false, message: 'Staff record not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    let updateResult
    const visibilityWhere = await getNotificationVisibilityWhere(user.userId, staff.companyId, user.role)

    if (markAll) {
      // Mark every notification this role can see as read, not just the
      // ones addressed directly to this user (see getNotificationVisibilityWhere).
      updateResult = await prisma.notification.updateMany({
        where: {
          ...visibilityWhere,
          companyId: staff.companyId,
          read: false
        },
        data: {
          read: true,
          updatedAt: new Date()
        }
      })
    } else if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      // First verify the notifications are visible to this user/role
      const notifications = await prisma.notification.findMany({
        where: {
          id: { in: notificationIds },
          ...visibilityWhere,
          companyId: staff.companyId
        },
        select: { id: true }
      })

      const validNotificationIds = notifications.map(n => n.id)

      if (validNotificationIds.length === 0) {
        const response = NextResponse.json(
          { success: false, message: 'No valid notifications found to mark as read' },
          { status: 400 }
        )
        return withCors(response, origin)
      }

      updateResult = await prisma.notification.updateMany({
        where: {
          id: { in: validNotificationIds },
          ...visibilityWhere,
          companyId: staff.companyId
        },
        data: {
          read: true,
          updatedAt: new Date()
        }
      })
    } else {
      const response = NextResponse.json(
        { success: false, message: 'Either notificationIds or markAll is required' },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    const response = NextResponse.json({
      success: true,
      message: markAll ? 'All notifications marked as read' : 'Notifications marked as read',
      data: {
        updatedCount: updateResult.count,
        markedAll: markAll,
        timestamp: new Date().toISOString()
      }
    })
    
    return withCors(response, origin)
    
  } catch (error: any) {
    console.error('Mark notifications as read error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to mark notifications as read',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}

// PUT - Create a notification (for testing or manual notifications)
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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])
    
    const body = await request.json()
    const validationResult = createNotificationSchema.safeParse(body)
    
    if (!validationResult.success) {
      const response = NextResponse.json(
        { 
          success: false,
          message: 'Invalid request body',
          details: validationResult.error.format() 
        },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    const data = validationResult.data
    
    // Verify user exists and belongs to the company
    const targetUser = await prisma.staffRecord.findFirst({
      where: {
        id: data.userId,
        companyId: data.companyId,
        isActive: true
      }
    })
    
    if (!targetUser) {
      const response = NextResponse.json(
        { success: false, message: 'Target user not found or not in company' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    // Prepare notification data - FIXED: don't include leaveRequestId field
    const notificationData: any = {
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      companyId: data.companyId,
      read: false
    }
    
    // Only add data field if we have data
    if (data.data && Object.keys(data.data).length > 0) {
      notificationData.data = JSON.stringify(data.data)
    }
    
    // Create notification
    const notification = await prisma.notification.create({
      data: notificationData,
      include: {
        user: {
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
    
    const response = NextResponse.json({
      success: true,
      message: 'Notification created successfully',
      data: {
        notification: {
          ...notification,
          data: notification.data ? JSON.parse(notification.data as string) : null
        },
        createdBy: {
          id: user.userId,
          role: user.role,
          timestamp: new Date().toISOString()
        }
      }
    })
    
    return withCors(response, origin)
    
  } catch (error: any) {
    console.error('Create notification error:', error)
    
    if (error.code === 'P2003') {
      const response = NextResponse.json(
        { success: false, message: 'Foreign key constraint failed' },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to create notification',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}

// DELETE - Delete notifications
export async function DELETE(request: NextRequest) {
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
    const notificationId = searchParams.get('id')
    const deleteAllRead = searchParams.get('deleteAllRead') === 'true'
    
    if (!notificationId && !deleteAllRead) {
      const response = NextResponse.json(
        { success: false, message: 'Notification ID or deleteAllRead parameter is required' },
        { status: 400 }
      )
      return withCors(response, origin)
    }
    
    // Get user's company
    const staff = await prisma.staffRecord.findUnique({
      where: { 
        id: user.userId,
        isActive: true 
      },
      select: { companyId: true }
    })
    
    if (!staff || !staff.companyId) {
      const response = NextResponse.json(
        { success: false, message: 'Staff record not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    let deleteResult
    const visibilityWhere = await getNotificationVisibilityWhere(user.userId, staff.companyId, user.role)

    if (deleteAllRead) {
      // Delete every read notification this role can see, not just the
      // ones addressed directly to this user.
      deleteResult = await prisma.notification.deleteMany({
        where: {
          ...visibilityWhere,
          companyId: staff.companyId,
          read: true
        }
      })
    } else if (notificationId) {
      // Delete specific notification (verify it's visible to this user/role)
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          ...visibilityWhere,
          companyId: staff.companyId
        }
      })
      
      if (!notification) {
        const response = NextResponse.json(
          { success: false, message: 'Notification not found or unauthorized' },
          { status: 404 }
        )
        return withCors(response, origin)
      }
      
      deleteResult = await prisma.notification.delete({
        where: { id: notificationId }
      })
    }
    
    const response = NextResponse.json({
      success: true,
      message: deleteAllRead ? 'All read notifications deleted' : 'Notification deleted',
      data: {
        deletedCount: deleteAllRead ? (deleteResult as any).count : 1,
        deletedAllRead: deleteAllRead,
        timestamp: new Date().toISOString()
      }
    })
    
    return withCors(response, origin)
    
  } catch (error: any) {
    console.error('Delete notification error:', error)
    
    if (error.code === 'P2025') {
      const response = NextResponse.json(
        { success: false, message: 'Notification not found' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to delete notification',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}