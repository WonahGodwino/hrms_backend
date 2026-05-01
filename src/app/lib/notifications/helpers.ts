// /src/app/lib/notifications/helpers.ts - COMPLETE WORKING VERSION
import { prisma } from '@/app/lib/prisma'

// Notification types
export const NOTIFICATION_TYPES = {
  LEAVE_REQUEST_SUBMITTED: 'LEAVE_REQUEST_SUBMITTED',
  LEAVE_APPROVAL_NEEDED: 'LEAVE_APPROVAL_NEEDED',
  LEAVE_HR_APPROVAL_NEEDED: 'LEAVE_HR_APPROVAL_NEEDED',
  LEAVE_MANAGER_APPROVED: 'LEAVE_MANAGER_APPROVED',
  LEAVE_APPROVED: 'LEAVE_APPROVED',
  LEAVE_REJECTED: 'LEAVE_REJECTED',
  LEAVE_CANCELLED: 'LEAVE_CANCELLED',
  LEAVE_REMINDER: 'LEAVE_REMINDER',
  LEAVE_BALANCE_LOW: 'LEAVE_BALANCE_LOW',
  LEAVE_UPCOMING: 'LEAVE_UPCOMING',
  WELCOME_STAFF: 'WELCOME_STAFF',
  PAYSLIP_UPLOADED: 'PAYSLIP_UPLOADED',
  COMPANY_ANNOUNCEMENT: 'COMPANY_ANNOUNCEMENT',
  GLOBAL_ANNOUNCEMENT: 'GLOBAL_ANNOUNCEMENT'
} as const

export type NotificationType = keyof typeof NOTIFICATION_TYPES

// Create a notification
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, any> = {},
  companyId: string
) {
  try {
    const notificationData: any = {
      userId,
      type,
      title,
      message,
      companyId,
      read: false
    }
    
    // Only add data field if we have data
    if (Object.keys(data).length > 0) {
      notificationData.data = JSON.stringify(data)
    }
    
    return await prisma.notification.create({
      data: notificationData
    })
  } catch (error) {
    console.error('Error creating notification:', error)
    return null
  }
}

// Create leave-specific notification (includes leaveRequestId in data)
export async function createLeaveNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  leaveRequestId: string,
  additionalData: Record<string, any> = {},
  companyId: string
) {
  const data = {
    leaveRequestId,
    ...additionalData
  }
  
  return createNotification(userId, type, title, message, data, companyId)
}

// Get notifications for a specific leave request
export async function getNotificationsForLeaveRequest(leaveRequestId: string, companyId: string) {
  try {
    // Get all LEAVE notifications for the company
    const notifications = await prisma.notification.findMany({
      where: {
        companyId,
        type: { contains: 'LEAVE' },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
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
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    
    // Filter client-side to get only notifications for this leave request
    const filteredNotifications = notifications.filter(notification => {
      if (!notification.data) return false
      try {
        const parsedData = JSON.parse(notification.data as string)
        return parsedData?.leaveRequestId === leaveRequestId
      } catch (e) {
        return false
      }
    })
    
    return filteredNotifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data as string) : null
    }))
  } catch (error) {
    console.error('Error getting leave request notifications:', error)
    return []
  }
}

// Get user notifications
export async function getUserNotifications(
  userId: string,
  companyId: string,
  options: {
    page?: number
    limit?: number
    read?: boolean
    type?: string
  } = {}
) {
  try {
    const { page = 1, limit = 20, read, type } = options
    const skip = (page - 1) * limit
    
    const where: any = {
      userId,
      companyId
    }
    
    if (read !== undefined) {
      where.read = read
    }
    
    if (type) {
      where.type = type
    }
    
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
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  } catch (error) {
    console.error('Error getting user notifications:', error)
    return { notifications: [], total: 0, page: 1, limit: 20, totalPages: 0 }
  }
}

// Mark notifications as read
export async function markNotificationsAsRead(
  userId: string,
  companyId: string,
  notificationIds?: string[],
  markAll: boolean = false
) {
  try {
    let result
    
    if (markAll) {
      result = await prisma.notification.updateMany({
        where: {
          userId,
          companyId,
          read: false
        },
        data: {
          read: true,
          updatedAt: new Date()
        }
      })
    } else if (notificationIds && notificationIds.length > 0) {
      result = await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId,
          companyId
        },
        data: {
          read: true,
          updatedAt: new Date()
        }
      })
    } else {
      return { success: false, message: 'No notifications to mark as read' }
    }
    
    return {
      success: true,
      updatedCount: result.count
    }
  } catch (error) {
    console.error('Error marking notifications as read:', error)
    return { success: false, error: String(error) }
  }
}

// Get unread count for user
export async function getUnreadNotificationCount(userId: string, companyId: string) {
  try {
    return await prisma.notification.count({
      where: {
        userId,
        companyId,
        read: false
      }
    })
  } catch (error) {
    console.error('Error getting unread count:', error)
    return 0
  }
}

// Delete notifications
export async function deleteNotifications(
  userId: string,
  companyId: string,
  notificationIds?: string[],
  deleteAllRead: boolean = false
) {
  try {
    let result
    
    if (deleteAllRead) {
      result = await prisma.notification.deleteMany({
        where: {
          userId,
          companyId,
          read: true
        }
      })
    } else if (notificationIds && notificationIds.length > 0) {
      result = await prisma.notification.deleteMany({
        where: {
          id: { in: notificationIds },
          userId,
          companyId
        }
      })
    } else {
      return { success: false, message: 'No notifications to delete' }
    }
    
    return {
      success: true,
      deletedCount: result.count
    }
  } catch (error) {
    console.error('Error deleting notifications:', error)
    return { success: false, error: String(error) }
  }
}

// Send notification to multiple users
export async function broadcastNotification(
  userIds: string[],
  type: NotificationType,
  title: string,
  message: string,
  data: Record<string, any> = {},
  companyId: string
) {
  try {
    const results = await Promise.all(
      userIds.map(userId =>
        createNotification(userId, type, title, message, data, companyId)
      )
    )
    
    const successful = results.filter(r => r !== null).length
    const failed = results.filter(r => r === null).length
    
    return {
      success: true,
      sentCount: successful,
      failedCount: failed,
      totalRecipients: userIds.length
    }
  } catch (error) {
    console.error('Error broadcasting notification:', error)
    return {
      success: false,
      error: String(error),
      sentCount: 0,
      failedCount: userIds.length
    }
  }
}