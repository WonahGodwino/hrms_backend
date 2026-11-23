const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');
const { PrismaPg } = require('../node_modules/@prisma/adapter-pg');
const { Pool } = require('../node_modules/pg');

// 1. Load backend/.env
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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const companyId = 'SEED-ORG-01';
  console.log(`Setting up ACM-016 Preconditions for company: ${companyId}...`);

  // 1. Find active templates for assignment
  const perfTemplate = await prisma.reviewTemplate.findFirst({
    where: {
      companyId,
      type: 'PERFORMANCE_REVIEW',
      versions: { some: { status: 'ACTIVE' } }
    },
    include: { versions: { where: { status: 'ACTIVE' } } }
  });
  const peerTemplate = await prisma.reviewTemplate.findFirst({
    where: {
      companyId,
      type: 'FEEDBACK_360',
      versions: { some: { status: 'ACTIVE' } }
    },
    include: { versions: { where: { status: 'ACTIVE' } } }
  });

  console.log(`Found Performance Template: ${perfTemplate?.name} (${perfTemplate?.id})`);
  console.log(`Found Peer Template: ${peerTemplate?.name} (${peerTemplate?.id})`);

  // 2. Fetch eligible staff in SEED-ORG-01
  const staffMembers = await prisma.staffRecord.findMany({
    where: { companyId, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, departmentId: true, locationId: true }
  });
  console.log(`Found ${staffMembers.length} eligible active staff members.`);

  // 3. Find or create the target cycle: "H1 2026 Performance Review"
  let cycle = await prisma.appraisalCycle.findFirst({
    where: { companyId, name: 'H1 2026 Performance Review' },
    include: { phases: true, participants: true }
  });

  const cycleStartDate = new Date('2026-10-01T00:00:00.000Z');
  const cycleEndDate = new Date('2026-12-31T00:00:00.000Z');
  const activatedAt = new Date('2026-10-01T08:00:00.000Z');

  // Elapsed phase deadline (past relative to current Nov 2, 2026)
  const selfAppraisalDeadline = new Date('2026-10-25T00:00:00.000Z');
  // Future phase deadlines
  const managerReviewDeadline = new Date('2026-11-30T00:00:00.000Z');
  const peerReviewDeadline = new Date('2026-11-20T00:00:00.000Z');
  const calibrationDeadline = new Date('2026-12-15T00:00:00.000Z');
  const hrValidationDeadline = new Date('2026-12-24T00:00:00.000Z');

  if (!cycle) {
    cycle = await prisma.appraisalCycle.create({
      data: {
        companyId,
        name: 'H1 2026 Performance Review',
        description: 'Mid-year performance evaluation cycle for all departments with elapsed self-appraisal deadline.',
        type: 'ANNUAL',
        scopeType: 'ALL_DEPARTMENTS',
        status: 'ACTIVE',
        startDate: cycleStartDate,
        endDate: cycleEndDate,
        activatedAt,
        ownerId: 'SEED-USR-02',
        approvalRouting: 'PARALLEL_CALIBRATION',
        remindersEnabled: true,
        reminderLeadHours: 48,
        escalationThresholdHours: 72,
      },
      include: { phases: true, participants: true }
    });
    console.log(`Created cycle: ${cycle.name} (${cycle.id})`);
  } else {
    cycle = await prisma.appraisalCycle.update({
      where: { id: cycle.id },
      data: {
        status: 'ACTIVE',
        startDate: cycleStartDate,
        endDate: cycleEndDate,
        activatedAt,
        ownerId: 'SEED-USR-02',
      },
      include: { phases: true, participants: true }
    });
    console.log(`Updated cycle: ${cycle.name} (${cycle.id}) to ACTIVE.`);
  }

  // 4. Configure phases
  const phaseConfigs = [
    { phaseType: 'SELF_APPRAISAL', enabled: true, deadline: selfAppraisalDeadline, displayOrder: 1 },
    { phaseType: 'MANAGER_REVIEW', enabled: true, deadline: managerReviewDeadline, displayOrder: 2 },
    { phaseType: 'PEER_REVIEW', enabled: true, deadline: peerReviewDeadline, displayOrder: 3 },
    { phaseType: 'LEADERSHIP_CALIBRATION', enabled: true, deadline: calibrationDeadline, displayOrder: 4 },
    { phaseType: 'HR_VALIDATION', enabled: true, deadline: hrValidationDeadline, displayOrder: 5 },
  ];

  for (const pc of phaseConfigs) {
    await prisma.appraisalCyclePhase.upsert({
      where: {
        cycleId_phaseType: {
          cycleId: cycle.id,
          phaseType: pc.phaseType,
        }
      },
      update: {
        enabled: pc.enabled,
        deadline: pc.deadline,
        displayOrder: pc.displayOrder,
      },
      create: {
        cycleId: cycle.id,
        phaseType: pc.phaseType,
        enabled: pc.enabled,
        deadline: pc.deadline,
        displayOrder: pc.displayOrder,
      }
    });
  }
  console.log('Upserted 5 cycle phases with Self Appraisal deadline set to 2026-10-25 (ELAPSED).');

  // 5. Template assignments
  if (perfTemplate) {
    const perfVersionId = perfTemplate.versions[0]?.id;
    for (const phaseType of ['SELF_APPRAISAL', 'MANAGER_REVIEW']) {
      const existing = await prisma.templateAssignment.findFirst({
        where: { cycleId: cycle.id, phaseType }
      });
      if (existing) {
        await prisma.templateAssignment.update({
          where: { id: existing.id },
          data: { templateId: perfTemplate.id, versionId: perfVersionId, status: 'ACTIVE' }
        });
      } else {
        await prisma.templateAssignment.create({
          data: {
            cycleId: cycle.id,
            phaseType,
            templateId: perfTemplate.id,
            versionId: perfVersionId,
            status: 'ACTIVE',
            assignedBy: 'SEED-USR-02'
          }
        });
      }
    }
  }

  if (peerTemplate) {
    const peerVersionId = peerTemplate.versions[0]?.id;
    const existing = await prisma.templateAssignment.findFirst({
      where: { cycleId: cycle.id, phaseType: 'PEER_REVIEW' }
    });
    if (existing) {
      await prisma.templateAssignment.update({
        where: { id: existing.id },
        data: { templateId: peerTemplate.id, versionId: peerVersionId, status: 'ACTIVE' }
      });
    } else {
      await prisma.templateAssignment.create({
        data: {
          cycleId: cycle.id,
          phaseType: 'PEER_REVIEW',
          templateId: peerTemplate.id,
          versionId: peerVersionId,
          status: 'ACTIVE',
          assignedBy: 'SEED-USR-02'
        }
      });
    }
  }
  console.log('Verified template assignments for phases.');

  // 6. Enroll participants
  for (let i = 0; i < staffMembers.length; i++) {
    const s = staffMembers[i];
    let participant = await prisma.appraisalCycleParticipant.findUnique({
      where: {
        cycleId_staffRecordId: {
          cycleId: cycle.id,
          staffRecordId: s.id,
        }
      }
    });

    if (!participant) {
      participant = await prisma.appraisalCycleParticipant.create({
        data: {
          cycleId: cycle.id,
          companyId,
          staffRecordId: s.id,
          departmentId: s.departmentId,
          locationId: s.locationId,
          enrolledVia: 'ACTIVATION',
        }
      });
    }

    // Set 2 participants as COMPLETED for Self Appraisal, and the rest as NOT_STARTED (overdue)
    const isCompleted = i < 2;

    for (const pc of phaseConfigs) {
      const existingPhase = await prisma.appraisalParticipantPhase.findFirst({
        where: {
          participantId: participant.id,
          phaseType: pc.phaseType,
        }
      });

      let status = 'NOT_STARTED';
      let completedAt = null;
      let startedAt = null;

      if (pc.phaseType === 'SELF_APPRAISAL' && isCompleted) {
        status = 'COMPLETED';
        startedAt = new Date('2026-10-10T09:00:00.000Z');
        completedAt = new Date('2026-10-20T16:00:00.000Z');
      }

      if (existingPhase) {
        await prisma.appraisalParticipantPhase.update({
          where: { id: existingPhase.id },
          data: {
            status,
            startedAt,
            completedAt,
            deadlineOverride: null,
          }
        });
      } else {
        await prisma.appraisalParticipantPhase.create({
          data: {
            participantId: participant.id,
            cycleId: cycle.id,
            phaseType: pc.phaseType,
            status,
            startedAt,
            completedAt,
            deadlineOverride: null,
          }
        });
      }
    }
  }

  console.log(`Enrolled ${staffMembers.length} participants with participant phase rows.`);

  // 7. Verify overdue calculation directly using the route's logic
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const overdueCount = await prisma.appraisalParticipantPhase.count({
    where: {
      cycleId: cycle.id,
      phaseType: 'SELF_APPRAISAL',
      status: { not: 'COMPLETED' },
      OR: [
        { deadlineOverride: { lt: cutoff } },
        { deadlineOverride: null },
      ]
    }
  });

  const totalSelf = await prisma.appraisalParticipantPhase.count({
    where: { cycleId: cycle.id, phaseType: 'SELF_APPRAISAL' }
  });
  const completedSelf = await prisma.appraisalParticipantPhase.count({
    where: { cycleId: cycle.id, phaseType: 'SELF_APPRAISAL', status: 'COMPLETED' }
  });

  console.log('\n=============================================');
  console.log('--- VERIFICATION OF ACM-016 PRECONDITIONS ---');
  console.log(`Cycle Name: ${cycle.name}`);
  console.log(`Cycle ID: ${cycle.id}`);
  console.log(`Company ID: ${companyId}`);
  console.log(`Cycle Status: ${cycle.status}`);
  console.log(`Cycle Window: ${cycle.startDate.toISOString().slice(0, 10)} to ${cycle.endDate.toISOString().slice(0, 10)}`);
  console.log(`Self Appraisal Deadline: ${selfAppraisalDeadline.toISOString().slice(0, 10)} (ELAPSED: ${selfAppraisalDeadline < cutoff})`);
  console.log(`Self Appraisal Stats:`);
  console.log(`  Total Enrolled: ${totalSelf}`);
  console.log(`  Completed: ${completedSelf}`);
  console.log(`  Overdue (Pending Incomplete): ${overdueCount}`);
  console.log('=============================================\n');

  await prisma.$disconnect();
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
