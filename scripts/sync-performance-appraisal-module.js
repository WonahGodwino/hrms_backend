const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');
const { PrismaPg } = require('../node_modules/@prisma/adapter-pg');
const { Pool } = require('../node_modules/pg');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  });
}

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function sync() {
  try {
    console.log('Finding or creating Workforce nav section...');
    let workforceSection = await prisma.navSection.findFirst({
      where: { label: 'Workforce' },
    });

    if (!workforceSection) {
      workforceSection = await prisma.navSection.create({
        data: { label: 'Workforce', sortOrder: 10, isSystem: true },
      });
    }

    console.log('Upserting PlatformModule: PERFORMANCE_APPRAISAL...');
    const perfModule = await prisma.platformModule.upsert({
      where: { key: 'PERFORMANCE_APPRAISAL' },
      update: {
        name: 'Performance and Appraisal',
        description:
          'Appraisal cycles, review templates, competency frameworks, goals, 360 reviews, PIPs, and performance operations',
        navSectionId: workforceSection.id,
        navOrder: 4,
        navIcon: 'BookOpen',
        archived: false,
      },
      create: {
        key: 'PERFORMANCE_APPRAISAL',
        name: 'Performance and Appraisal',
        description:
          'Appraisal cycles, review templates, competency frameworks, goals, 360 reviews, PIPs, and performance operations',
        navSectionId: workforceSection.id,
        navOrder: 4,
        navIcon: 'BookOpen',
        archived: false,
      },
    });

    console.log('Module registered:', perfModule.key, perfModule.id);

    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      select: { id: true, companyName: true },
    });

    console.log(`Found ${companies.length} active company/companies.`);

    for (const company of companies) {
      const access = await prisma.companyModuleAccess.upsert({
        where: {
          companyId_moduleId: {
            companyId: company.id,
            moduleId: perfModule.id,
          },
        },
        update: { enabled: true },
        create: {
          companyId: company.id,
          moduleId: perfModule.id,
          enabled: true,
        },
      });
      console.log(`Enabled PERFORMANCE_APPRAISAL for company ${company.companyName} (${company.id}) - status: ${access.enabled}`);
    }

    console.log('PERFORMANCE_APPRAISAL sync completed successfully!');
  } catch (err) {
    console.error('Error during sync:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

sync();
