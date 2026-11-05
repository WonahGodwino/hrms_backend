// src/app/lib/attendance/clock-location.ts
//
// Device location attached to every clock-in / clock-out (record only — no
// geofence). Compliance rule: a clock action without a usable location is
// refused, so the client must send { location: { latitude, longitude,
// accuracy } } from the browser's geolocation API. For HR/Admin-recorded
// entries the location is the recorder's device.
import { prisma } from '@/app/lib/db'
import { reverseGeocode } from './reverse-geocode'
export type ClockLocation = { latitude: number; longitude: number; accuracy: number | null }

export const LOCATION_REQUIRED_MESSAGE =
  'Your location is required to clock in or out. Turn on location services and allow location access for this site, then try again.'

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

// Returns the validated location, or null when missing/invalid.
export function parseClockLocation(body: unknown): ClockLocation | null {
  const loc = (body as { location?: Record<string, unknown> } | null)?.location
  if (!loc) return null
  const { latitude, longitude, accuracy } = loc
  if (!finite(latitude) || !finite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  // Exactly 0,0 is a classic "no fix" placeholder from broken providers.
  if (latitude === 0 && longitude === 0) return null
  return { latitude, longitude, accuracy: finite(accuracy) && accuracy >= 0 ? accuracy : null }
}

// Includes the readable address (reverse-geocode.ts; null if the lookup
// fails — the backfill script fills it in later).
export async function signInLocationData(loc: ClockLocation) {
  const signInAddress = await reverseGeocode(loc.latitude, loc.longitude)
  return { signInLatitude: loc.latitude, signInLongitude: loc.longitude, signInAccuracy: loc.accuracy, signInAddress }
}

export async function signOutLocationData(loc: ClockLocation) {
  const signOutAddress = await reverseGeocode(loc.latitude, loc.longitude)
  return { signOutLatitude: loc.latitude, signOutLongitude: loc.longitude, signOutAccuracy: loc.accuracy, signOutAddress }
}

type AddressFields = {
  id?: string
  signInLatitude?: number | null
  signInLongitude?: number | null
  signInAddress?: string | null
  signOutLatitude?: number | null
  signOutLongitude?: number | null
  signOutAddress?: string | null
}

// Rows recorded before reverse geocoding existed, or whose lookup failed at
// clock time, have coordinates but no readable address. Resolve those when
// they are read (bounded per request: Nominatim allows ~1 lookup/second) and
// save the result on the row, so every clock-in AND clock-out location ends
// up as a real address. Mutates the given records; never throws.
export async function fillMissingAddresses(records: AddressFields[], { maxLookups = 6, budgetMs = 8000 } = {}) {
  const startedAt = Date.now()
  let lookups = 0
  const resolve = async (
    record: AddressFields,
    lat: number | null | undefined,
    lng: number | null | undefined,
    current: string | null | undefined,
    field: 'signInAddress' | 'signOutAddress'
  ) => {
    if (current || lat == null || lng == null) return
    if (lookups >= maxLookups || Date.now() - startedAt > budgetMs) return
    lookups++
    const address = await reverseGeocode(lat, lng)
    if (!address) return
    record[field] = address
    if (record.id) {
      await prisma.attendance.update({ where: { id: record.id }, data: { [field]: address } }).catch(() => {})
    }
  }
  try {
    for (const r of records) {
      await resolve(r, r.signInLatitude, r.signInLongitude, r.signInAddress, 'signInAddress')
      await resolve(r, r.signOutLatitude, r.signOutLongitude, r.signOutAddress, 'signOutAddress')
    }
  } catch (e) {
    console.warn('[ATTENDANCE_ADDRESS] lazy fill failed:', e)
  }
  return records
}

// Spreadsheet/text form of a recorded point: "6.52440, 3.37920 (±12 m)" plus
// a map link. Null when nothing was recorded (holiday/system/legacy rows).
export type ExportLocation = { text: string; url: string } | null

// Text is the readable address when known, else the coordinates.
export function exportLocation(lat?: number | null, lng?: number | null, acc?: number | null, address?: string | null): ExportLocation {
  if (lat == null || lng == null) return null
  const accuracy = acc != null ? ` (±${Math.round(acc)} m)` : ''
  const text = address ? address : `${lat.toFixed(5)}, ${lng.toFixed(5)}${accuracy}`
  return { text, url: `https://www.google.com/maps?q=${lat},${lng}` }
}

// Shape returned to clients alongside an attendance record.
export function locationView(record: {
  signInLatitude?: number | null
  signInLongitude?: number | null
  signInAccuracy?: number | null
  signOutLatitude?: number | null
  signOutLongitude?: number | null
  signOutAccuracy?: number | null
  signInAddress?: string | null
  signOutAddress?: string | null
}) {
  const point = (lat?: number | null, lng?: number | null, acc?: number | null, address?: string | null) =>
    lat != null && lng != null ? { latitude: lat, longitude: lng, accuracy: acc ?? null, address: address ?? null } : null
  return {
    signIn: point(record.signInLatitude, record.signInLongitude, record.signInAccuracy, record.signInAddress),
    signOut: point(record.signOutLatitude, record.signOutLongitude, record.signOutAccuracy, record.signOutAddress),
  }
}
