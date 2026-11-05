// src/app/api/attendance/holidays/shared.ts — input parsing + response shape
// shared by the holidays collection and item routes.
import { businessDateKey, startOfBusinessDay } from '@/app/lib/attendance/business-day'
import { HOLIDAY_TYPES, type HolidayType } from '@/app/lib/attendance/work-calendar'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type HolidayRow = { id: string; name: string; date: Date; type: string; isRecurring: boolean; description: string | null }

export function holidayView(h: HolidayRow) {
  return { id: h.id, name: h.name, date: businessDateKey(h.date), type: h.type, isRecurring: h.isRecurring, description: h.description }
}

// "YYYY-MM-DD" → Lagos start of that day (how attendance days are keyed).
export function lagosDay(value: string): Date {
  return startOfBusinessDay(new Date(`${value}T12:00:00+01:00`))
}

export function parseHolidayInput(
  body: Record<string, unknown>,
  { partial = false } = {}
): { data: { name?: string; date?: Date; type?: HolidayType; isRecurring?: boolean; description?: string | null } } | { error: string } {
  const data: { name?: string; date?: Date; type?: HolidayType; isRecurring?: boolean; description?: string | null } = {}

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return { error: 'Holiday name is required.' }
    if (name.length > 120) return { error: 'Holiday name is too long.' }
    data.name = name
  }
  if (body.date !== undefined || !partial) {
    if (typeof body.date !== 'string' || !DATE_RE.test(body.date) || Number.isNaN(Date.parse(body.date))) {
      return { error: 'Holiday date must be a valid date (YYYY-MM-DD).' }
    }
    data.date = lagosDay(body.date)
  }
  if (body.type !== undefined || !partial) {
    const type = typeof body.type === 'string' ? body.type.toUpperCase() : 'PUBLIC'
    if (!(HOLIDAY_TYPES as readonly string[]).includes(type)) return { error: 'Holiday type must be PUBLIC, COMPANY or OTHER.' }
    data.type = type as HolidayType
  }
  if (body.isRecurring !== undefined) data.isRecurring = Boolean(body.isRecurring)
  if (body.description !== undefined) data.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  return { data }
}
