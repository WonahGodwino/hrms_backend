// Helpers for app/api/leaves/apply/route.ts (CODE-004: moved out of the route file).
import { prisma } from '@/app/lib/db'
import { forCompany } from '@/app/lib/data/tenant'

// Helper function to parse work week pattern
export function parseWorkWeekPattern(pattern: string | null): number[] {
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
  } catch (_error) {
    console.warn('Invalid workWeekPattern format, using default:', pattern)
    return defaultPattern
  }
}

// Helper function to calculate working days
export async function calculateWorkingDays(
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
  
  const holidays = await forCompany(companyId).publicHoliday.findMany({
    where: {
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

export function formatEmploymentDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Helper function to describe work week
export function getWorkWeekDescription(workDays: number[]): string {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const sortedDays = [...workDays].sort((a, b) => a - b)
  const dayNamesList = sortedDays.map(day => dayNames[day - 1])
  
  if (dayNamesList.length === 0) return 'No work days defined'
  if (dayNamesList.length === 1) return dayNamesList[0]
  
  const lastDay = dayNamesList.pop()
  return `${dayNamesList.join(', ')} and ${lastDay}`
}

// Safe reference number helper
export function getSafeReferenceNumber(refNumber: string | null): string | undefined {
  return refNumber || undefined
}

// Generate reference number
export function generateReferenceNumber(companyId: string, leaveRequestId: string): string {
  const companyPrefix = companyId.substring(0, 4).toUpperCase()
  const leaveSuffix = leaveRequestId.substring(0, 8).toUpperCase()
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4)
  return `LR-${companyPrefix}-${timestamp}-${leaveSuffix}`
}
