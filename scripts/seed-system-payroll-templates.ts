// scripts/seed-system-payroll-templates.ts
//
// Optional manual trigger. The built-in ISURF_STANDARD / BLUERIDGE system
// templates are normally seeded automatically the first time templates are
// listed (see src/app/lib/payroll/seed-system-payroll-templates.ts); this just
// runs the same idempotent seed on demand, e.g. right after a deploy.
//
// Usage: npm run db:seed:payroll-templates
import 'dotenv/config'
import { prisma } from '../src/app/lib/db'
import { seedSystemPayrollTemplates } from '../src/app/lib/payroll/seed-system-payroll-templates'

seedSystemPayrollTemplates('SCRIPT')
  .then((created) => console.log(created.length ? `Created: ${created.join(', ')}` : 'System payroll templates already present (or no company exists yet).'))
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
