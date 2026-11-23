const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');
const { PrismaPg } = require('../node_modules/@prisma/adapter-pg');
const { Pool } = require('../node_modules/pg');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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

async function main() {
  const companyId = 'SEED-ORG-01';
  const ownerId = 'SEED-USR-02'; // QA Chioma Okonkwo
  const defaultScaleId = 'cmvp9f916000czww8434z72p3'; // Global Proficiency Scale

  // Check if already exists
  const existing = await prisma.reviewTemplate.findFirst({
    where: { companyId, type: 'FEEDBACK_360' },
    include: { versions: true }
  });

  if (existing) {
    console.log(`FEEDBACK_360 template already exists: ID=${existing.id}, Name="${existing.name}"`);
    const activeVersion = existing.versions.find(v => v.status === 'ACTIVE');
    if (!activeVersion) {
      const v1 = existing.versions[0];
      if (v1) {
        await prisma.reviewTemplateVersion.update({
          where: { id: v1.id },
          data: { status: 'ACTIVE', publishedAt: new Date() }
        });
        await prisma.reviewTemplate.update({
          where: { id: existing.id },
          data: { currentVersionId: v1.id }
        });
        console.log(`Activated version ${v1.versionNumber} for existing template.`);
      }
    } else {
      console.log(`Active version already exists: ${activeVersion.versionNumber}`);
    }
    return;
  }

  console.log('Creating new published FEEDBACK_360 template...');
  const template = await prisma.$transaction(async (tx) => {
    // 1. Create template
    const t = await tx.reviewTemplate.create({
      data: {
        companyId,
        name: 'Standard 360 Peer Feedback Template',
        description: 'Comprehensive 360 peer review template assessing cross-functional collaboration, technical communication, and team impact.',
        type: 'FEEDBACK_360',
        ownerId,
      }
    });

    // 2. Create version 1 (ACTIVE)
    const v = await tx.reviewTemplateVersion.create({
      data: {
        templateId: t.id,
        versionNumber: 1,
        status: 'ACTIVE',
        description: 'Initial published peer review form',
        publishedAt: new Date(),
        publishedBy: ownerId,
        audienceScopes: {
          create: [{ audienceType: 'PEER' }]
        },
        sections: {
          create: [
            {
              title: 'Peer Collaboration & Team Impact',
              description: 'Evaluate peer contributions, communication quality, and cross-functional support.',
              weight: 100,
              displayOrder: 1,
              questions: {
                create: [
                  {
                    prompt: "How effectively does this peer collaborate with team members and communicate technical decisions?",
                    questionType: "RATING_SCALE",
                    required: true,
                    displayOrder: 1,
                    proficiencyScaleId: defaultScaleId,
                  },
                  {
                    prompt: "What are this peer's greatest strengths, and what actionable suggestions do you have for their growth?",
                    questionType: "TEXT",
                    required: true,
                    displayOrder: 2,
                  }
                ]
              }
            }
          ]
        }
      }
    });

    // 3. Link currentVersionId
    const updated = await tx.reviewTemplate.update({
      where: { id: t.id },
      data: { currentVersionId: v.id },
      include: {
        currentVersion: {
          include: {
            sections: {
              include: { questions: true }
            }
          }
        }
      }
    });

    return updated;
  });

  console.log(`Successfully seeded published FEEDBACK_360 template: "${template.name}" (ID: ${template.id}) with version 1 ACTIVE.`);
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
