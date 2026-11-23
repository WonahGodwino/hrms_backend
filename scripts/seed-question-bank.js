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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedQuestionBank() {
  console.log('Seeding Question Bank for SEED-ORG-01...');
  const companyId = 'SEED-ORG-01';

  // Check scale & competency
  const defaultScale = await prisma.proficiencyScale.findFirst({
    where: { companyId, isDefault: true }
  });
  const strategicThinking = await prisma.competency.findFirst({
    where: { companyId, name: 'Strategic Thinking', status: 'ACTIVE' }
  });

  const questionsToSeed = [
    {
      prompt: 'How effectively does the employee design scalable system architectures and enforce engineering standards?',
      category: 'Technical',
      questionType: 'RATING_SCALE',
      proficiencyScaleId: defaultScale?.id || null,
      config: { max: 5 },
      helpText: 'Evaluate architectural robustness, scalability decisions, and adherence to team coding standards.',
      createdBy: 'SEED-USER-HR-01',
    },
    {
      prompt: 'Demonstrates strategic vision, cross-functional collaboration, and mentorship across the engineering team.',
      category: 'Leadership',
      questionType: 'RATING_SCALE',
      proficiencyScaleId: defaultScale?.id || null,
      config: { max: 5 },
      helpText: 'Assess mentorship impact, proactive communication, and leadership initiative.',
      createdBy: 'SEED-USER-HR-01',
    },
    {
      prompt: 'Describe key technical milestones and delivery obstacles overcome during this quarter.',
      category: 'Technical',
      questionType: 'TEXT',
      helpText: 'Provide concrete examples of deliverables, sprint velocity, and roadblocks resolved.',
      createdBy: 'SEED-USER-HR-01',
    },
    {
      prompt: 'Rate the employee\'s strategic thinking and foresight in resolving complex technical challenges.',
      category: 'Competencies',
      questionType: 'COMPETENCY_RATING',
      competencyId: strategicThinking?.id || null,
      proficiencyScaleId: strategicThinking?.scaleId || defaultScale?.id || null,
      helpText: 'Aligned with the Strategic Thinking organizational competency framework.',
      createdBy: 'SEED-USER-HR-01',
    },
    {
      prompt: 'Which engineering practice best characterizes the employee\'s primary workflow focus?',
      category: 'Process',
      questionType: 'MULTIPLE_CHOICE',
      config: { allowMultiple: false },
      helpText: 'Select the primary technical practice demonstrated consistently.',
      createdBy: 'SEED-USER-HR-01',
      options: [
        { label: 'Test-Driven Development (TDD)', value: 'TDD', displayOrder: 0 },
        { label: 'Continuous Integration & Delivery (CI/CD)', value: 'CICD', displayOrder: 1 },
        { label: 'Agile Sprint Iteration & Planning', value: 'AGILE', displayOrder: 2 },
        { label: 'Production Reliability & Incident Response', value: 'SRE', displayOrder: 3 },
      ]
    },
    {
      prompt: 'Evaluate the overall achievement and quality of assigned key results and sprint commitments.',
      category: 'Goals',
      questionType: 'GOAL_ASSESSMENT',
      config: { goalScope: 'ALL_ACTIVE', showProgress: true, requireComment: true, max: 5 },
      helpText: 'Reflects delivery accuracy against committed quarterly goal metrics.',
      createdBy: 'SEED-USER-HR-01',
    },
    {
      prompt: 'How clearly does the employee communicate complex technical designs and trade-offs to stakeholders?',
      category: 'Communication',
      questionType: 'RATING_SCALE',
      proficiencyScaleId: defaultScale?.id || null,
      config: { max: 5 },
      helpText: 'Assess clarity in technical design docs, stakeholder reviews, and PR descriptions.',
      createdBy: 'SEED-USER-HR-01',
    },
    {
      prompt: 'Temporary Test Question: Evaluate legacy deployment script maintenance (to be archived).',
      category: 'DevOps',
      questionType: 'TEXT',
      helpText: 'This question is designated for RTF-014 archive verification.',
      createdBy: 'SEED-USER-HR-01',
    }
  ];

  for (const q of questionsToSeed) {
    const existing = await prisma.questionBankItem.findFirst({
      where: {
        companyId,
        prompt: q.prompt,
      }
    });

    if (existing) {
      await prisma.questionBankItem.update({
        where: { id: existing.id },
        data: {
          category: q.category,
          questionType: q.questionType,
          competencyId: q.competencyId || null,
          proficiencyScaleId: q.proficiencyScaleId || null,
          config: q.config || {},
          helpText: q.helpText,
          isActive: true,
        }
      });
      console.log(`Updated: ${q.prompt.substring(0, 50)}...`);
    } else {
      const created = await prisma.questionBankItem.create({
        data: {
          companyId,
          prompt: q.prompt,
          category: q.category,
          questionType: q.questionType,
          competencyId: q.competencyId || null,
          proficiencyScaleId: q.proficiencyScaleId || null,
          config: q.config || {},
          helpText: q.helpText,
          isActive: true,
          createdBy: q.createdBy,
          options: q.options ? {
            create: q.options
          } : undefined
        }
      });
      console.log(`Created (${created.id}): ${q.prompt.substring(0, 50)}...`);
    }
  }

  const finalCount = await prisma.questionBankItem.count({ where: { companyId, isActive: true } });
  console.log(`\nQuestion Bank seeding complete! Active questions for ${companyId}: ${finalCount}`);
}

seedQuestionBank()
  .catch(err => {
    console.error('Error seeding question bank:', err);
  })
  .finally(() => pool.end());
