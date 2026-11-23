// scripts/backfill-leave-types.ts
//
// Gives every leave policy at least one selectable leave type (policies with
// no type never appear in the apply dropdown). Creates one type named after
// the policy, matching the importer's new behavior (ensureDefaultLeaveTypes).
//
//   npx tsx --env-file=.env scripts/backfill-leave-types.ts --company=<id>   # one company
//   npx tsx --env-file=.env scripts/backfill-leave-types.ts --all            # every company
//   ... add --apply to actually write (otherwise it's a dry run)
import { prisma } from '../src/app/lib/db'

const LEAVE_TYPE_PALETTE = ['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#0EA5E9', '#D946EF']
function autoColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return LEAVE_TYPE_PALETTE[hash % LEAVE_TYPE_PALETTE.length]
}
function deriveCode(name: string): string {
  const words = name.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  let code = words.map((w) => w[0]).join('').toUpperCase()
  if (code.length < 2) code = (name.replace(/[^A-Za-z0-9]/g, '').toUpperCase() + 'XX').slice(0, 2)
  return code.slice(0, 4)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const all = process.argv.includes('--all')
  const companyArg = process.argv.find((a) => a.startsWith('--company='))?.split('=')[1]
  if (!all && !companyArg) {
    console.error('Pass --company=<id> or --all')
    process.exit(1)
  }

  const policies = await prisma.leavePolicy.findMany({
    where: all ? {} : { companyId: companyArg },
    select: { id: true, name: true, companyId: true, leaveTypes: { select: { id: true } } },
  })
  const typeless = policies.filter((p) => p.leaveTypes.length === 0)
  console.log(`${policies.length} policies scanned, ${typeless.length} without a leave type${apply ? '' : ' (dry run — pass --apply to write)'}`)

  let created = 0
  for (const p of typeless) {
    const code = deriveCode(p.name)
    console.log(`  ${apply ? 'creating' : 'would create'} type "${p.name}" (${code}) for policy ${p.id}`)
    if (apply) {
      await prisma.leaveType.create({
        data: { policyId: p.id, name: p.name, code, description: '', color: autoColor(code), isActive: true },
      })
      created++
    }
  }
  console.log(apply ? `Done: ${created} leave type(s) created.` : 'Dry run complete.')
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
