// /src/app/lib/notifications/helpers.ts - REUSABLE NOTIFICATION HELPERS
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
  LEAVE_UPCOMING: 'LEAVE_UPCOMING'
} as const

// Create a notification
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data: any,
  companyId: string,
  leaveRequestId?: string
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
        leaveRequestId,
        read: false
      }
    })
  } catch (error) {
    console.error('Error creating notification:', error)
    return null
  }
}

// Get notifications for a specific leave request
export async function getNotificationsForLeaveRequest(leaveRequestId: string, companyId: string) {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { leaveRequestId },
          {
            data: {
              path: ['leaveRequestId'],
              equals: leaveRequestId
            }
          }
        ],
        companyId
      },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        read: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffId: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    
    return notifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data as string) : null
    }))
  } catch (error) {
    console.error('Error getting leave request notifications:', error)
    return []
  }
}

// Mark notifications as read for a leave request
export async function markLeaveRequestNotificationsAsRead(leaveRequestId: string, userId: string) {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        OR: [
          { leaveRequestId },
          {
            data: {
              path: ['leaveRequestId'],
              equals: leaveRequestId
            }
          }
        ],
        userId,
        read: false
      },
      data: {
        read: true,
        updatedAt: new Date()
      }
    })
    
    return { success: true, updatedCount: result.count }
  } catch (error) {
    console.error('Error marking notifications as read:', error)
    return { success: false, error }
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

// Send notification to multiple users
export async function broadcastNotification(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  data: any,
  companyId: string,
  leaveRequestId?: string
) {
  try {
    const notifications = await Promise.all(
      userIds.map(userId =>
        createNotification(userId, type, title, message, data, companyId, leaveRequestId)
      )
    )
    
    return {
      success: true,
      sentCount: notifications.filter(n => n !== null).length,
      failedCount: notifications.filter(n => n === null).length
    }
  } catch (error) {
    console.error('Error broadcasting notification:', error)
    return { success: false, error }
  }
}