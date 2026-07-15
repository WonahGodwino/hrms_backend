// Minimal iCalendar (.ics) builder for calendar invites with auto-reminders.
//
// Produces a VEVENT the major clients (Google Calendar, Outlook, Apple
// Calendar) understand when delivered as a `text/calendar` email attachment.
// A VALARM block gives the attendee automatic pop-up/email reminders ahead of
// the event — no server-side scheduling needed; the calendar app fires them.
//
// UID must be stable per (event, recipient) so a re-send (reschedule/reminder)
// UPDATES the existing calendar entry instead of creating a duplicate. SEQUENCE
// increases on each send so the newer invite always supersedes the older one.

export interface IcsOptions {
  /** Stable per (event, recipient), e.g. `interview-<assessmentId>-candidate@247hr`. */
  uid: string
  title: string
  description?: string | null
  /** A URL (join link) or a physical address. */
  location?: string | null
  /** Event start. Must be a valid Date. */
  start: Date
  /** Length in minutes; defaults to 60 when missing. */
  durationMins?: number | null
  organizerName?: string
  organizerEmail?: string
  attendeeName?: string | null
  attendeeEmail?: string | null
  /** Optional URL property (join link) surfaced by some clients. */
  url?: string | null
  /** Minutes-before-start reminders; defaults to [1440, 30] (1 day + 30 min). */
  remindersMins?: number[]
  /** REQUEST to add/update, CANCEL to withdraw. Defaults to REQUEST. */
  method?: 'REQUEST' | 'CANCEL'
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Format a Date as a UTC iCalendar timestamp: YYYYMMDDTHHMMSSZ. */
function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** Escape a value for TEXT properties per RFC 5545 (backslash, comma, semicolon, newline). */
function esc(v: string): string {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Fold lines to <=75 octets as recommended by RFC 5545 (continuation lines start with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line
  const out: string[] = []
  let rest = line
  out.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 74) {
    out.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest.length) out.push(' ' + rest)
  return out.join('\r\n')
}

/**
 * Build a complete .ics document string. Returns null if `start` is invalid
 * (an all-day/unscheduled event should not produce a calendar invite).
 */
export function buildIcs(o: IcsOptions): string | null {
  if (!o.start || isNaN(o.start.getTime())) return null

  const method = o.method || 'REQUEST'
  const durationMins = o.durationMins && o.durationMins > 0 ? o.durationMins : 60
  const end = new Date(o.start.getTime() + durationMins * 60_000)
  // Monotonic sequence: each send supersedes the previous invite for this UID.
  const sequence = Math.max(0, Math.floor(Date.now() / 1000) - 1_700_000_000)
  const reminders = (o.remindersMins && o.remindersMins.length ? o.remindersMins : [1440, 30])
    .filter((m) => Number.isFinite(m) && m > 0)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//247HR//Meetings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${esc(o.uid)}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(o.start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SUMMARY:${esc(o.title)}`,
  ]

  if (o.description) lines.push(`DESCRIPTION:${esc(o.description)}`)
  if (o.location) lines.push(`LOCATION:${esc(o.location)}`)
  if (o.url) lines.push(`URL:${esc(o.url)}`)

  if (o.organizerEmail) {
    const cn = o.organizerName ? `;CN=${esc(o.organizerName)}` : ''
    lines.push(`ORGANIZER${cn}:mailto:${o.organizerEmail}`)
  }
  if (o.attendeeEmail) {
    const cn = o.attendeeName ? `;CN=${esc(o.attendeeName)}` : ''
    lines.push(`ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${o.attendeeEmail}`)
  }

  if (method !== 'CANCEL') {
    for (const mins of reminders) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(`Reminder: ${o.title}`)}`,
        `TRIGGER:-PT${mins}M`,
        'END:VALARM',
      )
    }
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}

/** Convenience: build the ics and wrap it as a sendEmail attachment, or null. */
export function buildIcsAttachment(
  o: IcsOptions,
  filename = 'invite.ics',
): { filename: string; data: Buffer; contentType: string } | null {
  const ics = buildIcs(o)
  if (!ics) return null
  return {
    filename,
    data: Buffer.from(ics, 'utf-8'),
    contentType: `text/calendar; charset=utf-8; method=${o.method || 'REQUEST'}`,
  }
}
