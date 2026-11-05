// src/app/lib/attendance/reverse-geocode.ts
//
// Turns a clock-in / clock-out coordinate into a readable street address.
//
// Why this is pluggable: the original implementation only talked to
// OpenStreetMap's PUBLIC Nominatim server (nominatim.openstreetmap.org).
// That server's usage policy blocks datacenter/cloud IPs and heavy /
// server-side bulk traffic, so from a deployed backend the reverse lookup
// is frequently refused (connection reset / 403 / 429). The lookup then
// returns null and the UI falls back to raw coordinates ("Address not
// available yet") — which is exactly the bug this module exists to fix.
//
// So the provider is now selected by environment:
//   GEOCODER_PROVIDER = nominatim (default) | locationiq | google
//   - auto-detected: if LOCATIONIQ_API_KEY is set → locationiq,
//     else if GOOGLE_MAPS_API_KEY is set → google, else nominatim.
//   NOMINATIM_ENDPOINT   override the Nominatim base URL (e.g. a self-hosted
//                        instance) — lets you keep OSM data without the
//                        public server's blocking.
//   LOCATIONIQ_API_KEY   LocationIQ key (Nominatim-compatible data, works
//                        from servers; generous free tier).
//   GOOGLE_MAPS_API_KEY  Google Geocoding key (very reliable from servers).
//   NOMINATIM_CONTACT_EMAIL  identifying contact for the Nominatim UA.
//
// Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
//   - at most 1 request per second       → requests are serialised + spaced
//   - an identifying User-Agent/contact   → NOMINATIM_CONTACT_EMAIL (default below)
//   - cache results                       → in-memory cache on ~11 m cells,
//                                           and the address is stored on the
//                                           attendance row, so each clock
//                                           action is looked up once.
// Never throws: returns null on any failure (timeout, rate limit, no result),
// and callers fall back to showing the coordinates.

const CONTACT = process.env.NOMINATIM_CONTACT_EMAIL || 'support@isurfglobal.com'
const USER_AGENT = `247HR-attendance/1.0 (${CONTACT})`
const TIMEOUT_MS = 5000
const CACHE_MAX = 2000

const NOMINATIM_ENDPOINT = (process.env.NOMINATIM_ENDPOINT || 'https://nominatim.openstreetmap.org/reverse').replace(/\/+$/, '')
const LOCATIONIQ_KEY = process.env.LOCATIONIQ_API_KEY || ''
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || ''

type Provider = 'nominatim' | 'locationiq' | 'google'

function selectedProvider(): Provider {
  const explicit = (process.env.GEOCODER_PROVIDER || '').trim().toLowerCase()
  if (explicit === 'locationiq' || explicit === 'google' || explicit === 'nominatim') return explicit
  if (LOCATIONIQ_KEY) return 'locationiq'
  if (GOOGLE_KEY) return 'google'
  return 'nominatim'
}

const PROVIDER = selectedProvider()

// Public Nominatim demands ~1 req/s. Keyed providers (LocationIQ/Google)
// allow far more, so lazy-fill and the backfill script run much faster.
const MIN_INTERVAL_MS = PROVIDER === 'nominatim' ? 1100 : 200

const cache = new Map<string, string | null>()
let queue: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

// ~11 m grid (4 decimal places) — nearby clock-ins share one lookup.
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`

type NominatimAddress = Record<string, string | undefined>

// "12 Allen Avenue, Ikeja, Lagos" — most specific first, no country/postcode.
export function formatNominatimAddress(addr: NominatimAddress | undefined, displayName?: string): string | null {
  if (addr) {
    const street = [addr.house_number, addr.road || addr.pedestrian || addr.footway || addr.street].filter(Boolean).join(' ')
    const place = addr.amenity || addr.building || addr.office || addr.shop
    const area = addr.neighbourhood || addr.suburb || addr.quarter || addr.hamlet
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.city_district
    const state = addr.state
    const parts: string[] = []
    for (const p of [place, street, area, city, state]) {
      if (p && !parts.some((q) => q.toLowerCase() === p.toLowerCase())) parts.push(p)
    }
    if (parts.length >= 2) return parts.join(', ')
  }
  if (displayName) {
    // Fallback: Nominatim's full label minus postcode and country.
    const bits = displayName.split(',').map((s) => s.trim()).filter((s) => s && !/^\d{4,}$/.test(s) && s.toLowerCase() !== 'nigeria')
    return bits.length ? bits.slice(0, 5).join(', ') : null
  }
  return null
}

// Google's formatted_address, trimmed of plus-code, postcode and country to
// match the Nominatim style ("12 Allen Avenue, Ikeja, Lagos").
function formatGoogleAddress(formatted?: string): string | null {
  if (!formatted) return null
  const bits = formatted
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/^\d{4,}$/.test(s) && s.toLowerCase() !== 'nigeria' && !/^[A-Z0-9]{4}\+[A-Z0-9]{2,}/.test(s))
  return bits.length ? bits.slice(0, 5).join(', ') : null
}

type FetchResult = { ok: boolean; status: number; data: unknown }

async function fetchJson(url: string, headers: Record<string, string>): Promise<FetchResult> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

async function lookupNominatim(lat: number, lng: number): Promise<string | null> {
  const url = `${NOMINATIM_ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`
  const { ok, status, data } = await fetchJson(url, { 'User-Agent': USER_AGENT })
  if (!ok) {
    console.warn('[REVERSE_GEOCODE] Nominatim responded', status)
    return null
  }
  const d = data as { address?: NominatimAddress; display_name?: string; error?: string } | null
  if (!d || d.error) return null
  return formatNominatimAddress(d.address, d.display_name)
}

async function lookupLocationIQ(lat: number, lng: number): Promise<string | null> {
  const url = `https://us1.locationiq.com/v1/reverse?key=${encodeURIComponent(LOCATIONIQ_KEY)}&lat=${lat}&lon=${lng}&format=json&addressdetails=1&normalizeaddress=1&accept-language=en`
  const { ok, status, data } = await fetchJson(url, {})
  if (!ok) {
    console.warn('[REVERSE_GEOCODE] LocationIQ responded', status)
    return null
  }
  // LocationIQ is Nominatim-compatible: same address object + display_name.
  const d = data as { address?: NominatimAddress; display_name?: string; error?: string } | null
  if (!d || d.error) return null
  return formatNominatimAddress(d.address, d.display_name)
}

async function lookupGoogle(lat: number, lng: number): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&key=${encodeURIComponent(GOOGLE_KEY)}`
  const { ok, status, data } = await fetchJson(url, {})
  const d = data as { status?: string; results?: Array<{ formatted_address?: string }>; error_message?: string } | null
  if (!ok || !d) {
    console.warn('[REVERSE_GEOCODE] Google responded', status)
    return null
  }
  if (d.status !== 'OK') {
    if (d.status !== 'ZERO_RESULTS') console.warn('[REVERSE_GEOCODE] Google status', d.status, d.error_message || '')
    return null
  }
  return formatGoogleAddress(d.results?.[0]?.formatted_address)
}

function lookup(lat: number, lng: number): Promise<string | null> {
  switch (PROVIDER) {
    case 'locationiq':
      return lookupLocationIQ(lat, lng)
    case 'google':
      return lookupGoogle(lat, lng)
    default:
      return lookupNominatim(lat, lng)
  }
}

export async function reverseGeocode(lat: number | null | undefined, lng: number | null | undefined): Promise<string | null> {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const key = cacheKey(lat, lng)
  if (cache.has(key)) return cache.get(key) ?? null

  // Serialise through one queue so concurrent clock-ins never exceed the
  // provider's rate limit.
  const result = (queue = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
    return lookup(lat, lng).catch((err) => {
      if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') console.warn('[REVERSE_GEOCODE] lookup failed:', err?.message || err)
      return null
    })
  }, () => null)) as Promise<string | null>
  const address = await result

  // Only cache real answers, so a transient failure is retried next time.
  if (address) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
    cache.set(key, address)
  }
  return address
}
