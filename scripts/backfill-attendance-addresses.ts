// scripts/backfill-attendance-addresses.ts
//
// One-off: fill the readable clock-in / clock-out addresses for attendance
// rows that have coordinates but no address yet (rows recorded before
// reverse geocoding existed, or whose lookup failed at clock time).
//
// Uses the same geocoder as the app (src/app/lib/attendance/
// reverse-geocode.ts), so it honours GEOCODER_PROVIDER / the *_API_KEY env
// vars, is throttled to the provider's rate limit, and nearby points
// (~11 m) share one lookup. NOTE: with the default public Nominatim provider
// this will fail from most servers (that's the whole reason the lookups are
// empty) — set LOCATIONIQ_API_KEY or GOOGLE_MAPS_API_KEY before running.
// Safe to re-run: only empty addresses are filled, nothing else is changed.
//
//   npx tsx --env-file=.env scripts/backfill-attendance-addresses.ts            # dry run (counts + samples)
//   npx tsx --env-file=.env scripts/backfill-attendance-addresses.ts --apply    # write addresses
//   ... --apply --limit=500                                                     # cap rows this run
import { prisma } from '../src/app/lib/db'
import { reverseGeocode } from '../src/app/lib/attendance/reverse-geocode'

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10)) : undefined

async function main() {
  const rows = await prisma.attendance.findMany({
    where: {
      OR: [
        { signInLatitude: { not: null }, signInLongitude: { not: null }, signInAddress: null },
        { signOutLatitude: { not: null }, signOutLongitude: { not: null }, signOutAddress: null },
      ],
    },
    select: {
      id: true,
      signInLatitude: true,
      signInLongitude: true,
      signInAddress: true,
      signOutLatitude: true,
      signOutLongitude: true,
      signOutAddress: true,
    },
    orderBy: { date: 'desc' },
    ...(limit ? { take: limit } : {}),
  })

  console.log(`${rows.length} attendance row(s) need an address${apply ? '' : ' (dry run — pass --apply to write)'}`)
  let filled = 0
  let failed = 0

  for (const [i, r] of rows.entries()) {
    const data: { signInAddress?: string; signOutAddress?: string } = {}
    if (r.signInAddress == null && r.signInLatitude != null && r.signInLongitude != null) {
      const a = await reverseGeocode(r.signInLatitude, r.signInLongitude)
      if (a) data.signInAddress = a
      else failed++
    }
    if (r.signOutAddress == null && r.signOutLatitude != null && r.signOutLongitude != null) {
      const a = await reverseGeocode(r.signOutLatitude, r.signOutLongitude)
      if (a) data.signOutAddress = a
      else failed++
    }
    if (Object.keys(data).length === 0) continue

    if (i < 5 || !apply) console.log(`  ${r.id}: ${data.signInAddress ?? '—'} | ${data.signOutAddress ?? '—'}`)
    if (apply) {
      // Only fill fields that are still empty (another clock action may have set them meanwhile).
      await prisma.attendance.updateMany({
        where: { id: r.id, ...(data.signInAddress ? { signInAddress: null } : {}), ...(data.signOutAddress ? { signOutAddress: null } : {}) },
        data,
      })
      filled++
    }
    if (!apply && i >= 4) break // dry run: a few samples are enough
  }

  console.log(apply ? `Done: ${filled} row(s) updated, ${failed} lookup(s) failed (re-run to retry those).` : 'Dry run complete.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
