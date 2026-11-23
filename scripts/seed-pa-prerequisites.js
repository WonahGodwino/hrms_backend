/**
 * seed-pa-prerequisites.js
 * 
 * Seeds foundational prerequisite records for the Performance & Appraisal (P&A) Module:
 * - 2 Tenant Organizations (SEED-ORG-01 and SEED-ORG-02)
 * - 4 Departments (Engineering, Product Design, Human Resources, Operations)
 * - 25 Designations mapped to Departments
 * - 26 User Personas (Staff Records) with exact roles, hierarchy, and credentials
 * - UserCompany mappings and Company Module Access
 * 
 * LEAVES ALL PERFORMANCE & APPRAISAL DATA (competencies, templates, cycles, goals,
 * self-appraisals, reviews, calibration, PIPs) UNTOUCHED FOR MANUAL TESTING.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('c:/Users/bukky/Documents/Projects/247hr/backend/node_modules/bcryptjs');
const { PrismaClient } = require('c:/Users/bukky/Documents/Projects/247hr/backend/node_modules/@prisma/client');
const { PrismaPg } = require('c:/Users/bukky/Documents/Projects/247hr/backend/node_modules/@prisma/adapter-pg');
const { Pool } = require('c:/Users/bukky/Documents/Projects/247hr/backend/node_modules/pg');

// 1. Load backend/.env
const envPath = path.resolve('c:/Users/bukky/Documents/Projects/247hr/backend/.env');
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

// 2. Initialize Prisma with PG adapter
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = 'Password123!';
const HASHED_PASSWORD = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

async function main() {
  console.log('================================================================');
  console.log('🚀 SEEDING PERFORMANCE & APPRAISAL PREREQUISITE DATA');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. ORGANIZATIONS / COMPANIES
    // -------------------------------------------------------------------------
    console.log('1. Seeding Organizations...');
    const companies = [
      {
        id: 'SEED-ORG-01',
        companyName: 'QA Enterprise Ltd',
        tradingName: 'QA Enterprise',
        email: 'contact@qaenterprise.test',
        baseCurrency: 'NGN',
        status: 'Active',
        createdBy: 'system'
      },
      {
        id: 'SEED-ORG-02',
        companyName: 'QA Beta Corp',
        tradingName: 'QA Beta',
        email: 'contact@qabeta.test',
        baseCurrency: 'NGN',
        status: 'Active',
        createdBy: 'system'
      }
    ];

    for (const c of companies) {
      await prisma.company.upsert({
        where: { id: c.id },
        update: {
          companyName: c.companyName,
          tradingName: c.tradingName,
          email: c.email,
          baseCurrency: c.baseCurrency,
          status: c.status
        },
        create: c
      });
      console.log(`   ✓ Company: ${c.id} (${c.companyName})`);
    }

    // -------------------------------------------------------------------------
    // 3. DEPARTMENTS
    // -------------------------------------------------------------------------
    console.log('\n3. Seeding Departments...');
    const deptDefs = [
      { id: 'SEED-DEP-01', companyId: 'SEED-ORG-01', code: 'ENG', name: 'Engineering' },
      { id: 'SEED-DEP-02', companyId: 'SEED-ORG-01', code: 'PROD', name: 'Product Design' },
      { id: 'SEED-DEP-03', companyId: 'SEED-ORG-01', code: 'HR', name: 'Human Resources' },
      { id: 'SEED-DEP-05', companyId: 'SEED-ORG-01', code: 'EXEC', name: 'Executive Office' },
      { id: 'SEED-DEP-04', companyId: 'SEED-ORG-02', code: 'OPS', name: 'Operations' }
    ];

    for (const d of deptDefs) {
      await prisma.department.upsert({
        where: { id: d.id },
        update: { name: d.name, code: d.code, companyId: d.companyId, status: 'Active' },
        create: { id: d.id, name: d.name, code: d.code, companyId: d.companyId, status: 'Active' }
      });
      console.log(`   ✓ Department: ${d.id} (${d.name} - ${d.code})`);
    }

    // -------------------------------------------------------------------------
    // 4. DESIGNATIONS
    // -------------------------------------------------------------------------
    console.log('\n4. Seeding Designations...');
    const desigDefs = [
      { id: 'SEED-DES-01', companyId: 'SEED-ORG-01', code: 'GLB-ADM', title: 'Global Administrator', deptId: 'SEED-DEP-05' },
      { id: 'SEED-DES-02', companyId: 'SEED-ORG-01', code: 'COO', title: 'Chief Operating Officer', deptId: 'SEED-DEP-05' },
      { id: 'SEED-DES-03', companyId: 'SEED-ORG-01', code: 'CEO', title: 'Chief Executive Officer', deptId: 'SEED-DEP-05' },
      { id: 'SEED-DES-04', companyId: 'SEED-ORG-01', code: 'HR-DIR', title: 'HR Director', deptId: 'SEED-DEP-03' },
      { id: 'SEED-DES-05', companyId: 'SEED-ORG-01', code: 'ENG-DIR', title: 'Engineering Director', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-06', companyId: 'SEED-ORG-01', code: 'PROD-HEAD', title: 'Head of Product Design', deptId: 'SEED-DEP-02' },
      { id: 'SEED-DES-07', companyId: 'SEED-ORG-01', code: 'LEAD-ARCH', title: 'Lead Architect', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-08', companyId: 'SEED-ORG-01', code: 'STAFF-INFRA', title: 'Staff Infrastructure Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-09', companyId: 'SEED-ORG-01', code: 'SR-SWE', title: 'Senior Software Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-10', companyId: 'SEED-ORG-01', code: 'SWE-II', title: 'Software Engineer II', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-11', companyId: 'SEED-ORG-01', code: 'QA-AUT', title: 'QA Automation Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-12', companyId: 'SEED-ORG-01', code: 'DEVOPS', title: 'DevOps Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-13', companyId: 'SEED-ORG-01', code: 'FE-ENG', title: 'Frontend Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-14', companyId: 'SEED-ORG-01', code: 'BE-ENG', title: 'Backend Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-15', companyId: 'SEED-ORG-01', code: 'JR-ENG', title: 'Junior Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-16', companyId: 'SEED-ORG-01', code: 'UIUX-DES', title: 'UI/UX Designer', deptId: 'SEED-DEP-02' },
      { id: 'SEED-DES-17', companyId: 'SEED-ORG-01', code: 'JR-PROD-DES', title: 'Junior Product Designer', deptId: 'SEED-DEP-02' },
      { id: 'SEED-DES-18', companyId: 'SEED-ORG-01', code: 'DES-RES', title: 'Design Researcher', deptId: 'SEED-DEP-02' },
      { id: 'SEED-DES-19', companyId: 'SEED-ORG-01', code: 'GRAPH-DES', title: 'Graphic Designer', deptId: 'SEED-DEP-02' },
      { id: 'SEED-DES-20', companyId: 'SEED-ORG-01', code: 'OPS-ANL', title: 'Operations Analyst', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-21', companyId: 'SEED-ORG-01', code: 'FRM-ENG', title: 'Former Engineer', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-22', companyId: 'SEED-ORG-01', code: 'SUSP-ASC', title: 'Suspended Associate', deptId: 'SEED-DEP-01' },
      { id: 'SEED-DES-23', companyId: 'SEED-ORG-01', code: 'IND-CONTR', title: 'Independent Contractor', deptId: 'SEED-DEP-03' },
      { id: 'SEED-DES-24', companyId: 'SEED-ORG-01', code: 'UNLNK-ADM', title: 'Unlinked Admin', deptId: null },
      { id: 'SEED-DES-25', companyId: 'SEED-ORG-02', code: 'BETA-SPEC', title: 'Beta Specialist', deptId: 'SEED-DEP-04' }
    ];

    for (const d of desigDefs) {
      await prisma.designation.upsert({
        where: { id: d.id },
        update: {
          title: d.title,
          code: d.code,
          companyId: d.companyId,
          departmentId: d.deptId,
          status: 'Active'
        },
        create: {
          id: d.id,
          title: d.title,
          code: d.code,
          companyId: d.companyId,
          departmentId: d.deptId,
          status: 'Active'
        }
      });
      console.log(`   ✓ Designation: ${d.id} (${d.title} - ${d.code})`);
    }

    // -------------------------------------------------------------------------
    // 5. STAFF RECORDS / PERSONAS (Phase 1: Basic Records without Managers)
    // -------------------------------------------------------------------------
    console.log('\n5. Seeding User Personas / Staff Records (Phase 1: Accounts & Profiles)...');
    const personas = [
      { id: 'SEED-USR-01', staffId: 'EMP-001', firstName: 'Adebayo', lastName: 'Adeleke', email: 'qa.superadmin@example.test', role: 'SUPER_ADMIN', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-05', deptName: 'Executive Office', desigId: 'SEED-DES-01', position: 'Global Administrator' },
      { id: 'SEED-USR-02', staffId: 'EMP-002', firstName: 'Chioma', lastName: 'Okonkwo', email: 'qa.hr@example.test', role: 'HR', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-03', deptName: 'Human Resources', desigId: 'SEED-DES-04', position: 'HR Director' },
      { id: 'SEED-USR-03', staffId: 'EMP-003', firstName: 'Babatunde', lastName: 'Lawal', email: 'qa.admin@example.test', role: 'ADMIN', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-05', deptName: 'Executive Office', desigId: 'SEED-DES-02', position: 'Chief Operating Officer' },
      { id: 'SEED-USR-04', staffId: 'EMP-004', firstName: 'Victoria', lastName: 'Alabi', email: 'qa.exec@example.test', role: 'ADMIN', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-05', deptName: 'Executive Office', desigId: 'SEED-DES-03', position: 'Chief Executive Officer' },
      { id: 'SEED-USR-05', staffId: 'EMP-005', firstName: 'Emeka', lastName: 'Nwosu', email: 'qa.manager.eng@example.test', role: 'MANAGER', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-05', position: 'Engineering Director' },
      { id: 'SEED-USR-06', staffId: 'EMP-006', firstName: 'Fatima', lastName: 'Bello', email: 'qa.manager.prod@example.test', role: 'MANAGER', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-02', deptName: 'Product Design', desigId: 'SEED-DES-06', position: 'Head of Product Design' },
      { id: 'SEED-USR-07', staffId: 'EMP-007', firstName: 'Dayo', lastName: 'Adeleke', email: 'qa.dayo@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-09', position: 'Senior Software Engineer' },
      { id: 'SEED-USR-08', staffId: 'EMP-008', firstName: 'Ngozi', lastName: 'Eze', email: 'qa.ngozi@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-10', position: 'Software Engineer II' },
      { id: 'SEED-USR-09', staffId: 'EMP-009', firstName: 'Ibrahim', lastName: 'Musa', email: 'qa.ibrahim@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-10', position: 'Software Engineer II' },
      { id: 'SEED-USR-10', staffId: 'EMP-010', firstName: 'Kemi', lastName: 'Oladipo', email: 'qa.kemi@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-11', position: 'QA Automation Engineer' },
      { id: 'SEED-USR-11', staffId: 'EMP-011', firstName: 'Tunde', lastName: 'Bakare', email: 'qa.tunde@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-12', position: 'DevOps Engineer' },
      { id: 'SEED-USR-12', staffId: 'EMP-012', firstName: 'Zainab', lastName: 'Haruna', email: 'qa.zainab@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-13', position: 'Frontend Engineer' },
      { id: 'SEED-USR-13', staffId: 'EMP-013', firstName: 'Samuel', lastName: 'Ojo', email: 'qa.samuel@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-02', deptName: 'Product Design', desigId: 'SEED-DES-16', position: 'UI/UX Designer' },
      { id: 'SEED-USR-14', staffId: 'EMP-014', firstName: 'Amaka', lastName: 'Obi', email: 'qa.amaka@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-02', deptName: 'Product Design', desigId: 'SEED-DES-17', position: 'Junior Product Designer' },
      { id: 'SEED-USR-15', staffId: 'EMP-015', firstName: 'Segun', lastName: 'Arinze', email: 'qa.segun@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-02', deptName: 'Product Design', desigId: 'SEED-DES-18', position: 'Design Researcher' },
      { id: 'SEED-USR-16', staffId: 'EMP-016', firstName: 'Maryam', lastName: 'Danjuma', email: 'qa.maryam@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-02', deptName: 'Product Design', desigId: 'SEED-DES-19', position: 'Graphic Designer' },
      { id: 'SEED-USR-17', staffId: 'EMP-017', firstName: 'Chinedu', lastName: 'Ibe', email: 'qa.chinedu@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-14', position: 'Backend Engineer' },
      { id: 'SEED-USR-18', staffId: 'EMP-018', firstName: 'Blessing', lastName: 'Okoro', email: 'qa.blessing@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-15', position: 'Junior Engineer' },
      { id: 'SEED-USR-19', staffId: 'EMP-019', firstName: 'Halima', lastName: 'Usman', email: 'qa.halima@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-07', position: 'Lead Architect' },
      { id: 'SEED-USR-20', staffId: 'EMP-020', firstName: 'Victor', lastName: 'Bassey', email: 'qa.victor@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-08', position: 'Staff Infrastructure Engineer' },
      { id: 'SEED-USR-21', staffId: 'EMP-021', firstName: 'Ghost', lastName: 'Admin', email: 'qa.ghost.admin@example.test', role: 'HR', companyId: 'SEED-ORG-01', deptId: null, deptName: null, desigId: 'SEED-DES-24', position: 'Unlinked Admin' },
      { id: 'SEED-USR-22', staffId: 'EMP-022', firstName: 'Elevate', lastName: 'Tester', email: 'qa.elevate@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-20', position: 'Operations Analyst' },
      { id: 'SEED-USR-23', staffId: 'EMP-023', firstName: 'Inactive', lastName: 'User', email: 'qa.inactive@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-21', position: 'Former Engineer', isActive: false },
      { id: 'SEED-USR-24', staffId: 'EMP-024', firstName: 'Blocked', lastName: 'User', email: 'qa.blocked@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-01', deptName: 'Engineering', desigId: 'SEED-DES-22', position: 'Suspended Associate', isBlocked: true, blockReason: 'Suspended for compliance testing' },
      { id: 'SEED-USR-25', staffId: 'EMP-025', firstName: 'Orphan', lastName: 'Staff', email: 'qa.orphan@example.test', role: 'STAFF', companyId: 'SEED-ORG-01', deptId: 'SEED-DEP-03', deptName: 'Human Resources', desigId: 'SEED-DES-23', position: 'Independent Contractor' },
      { id: 'SEED-USR-26', staffId: 'EMP-026', firstName: 'Beta', lastName: 'Specialist', email: 'qa.beta.user@example.test', role: 'STAFF', companyId: 'SEED-ORG-02', deptId: 'SEED-DEP-04', deptName: 'Operations', desigId: 'SEED-DES-25', position: 'Beta Specialist' }
    ];

    for (const p of personas) {
      await prisma.staffRecord.upsert({
        where: { id: p.id },
        update: {
          staffId: p.staffId,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email.toLowerCase().trim(),
          role: p.role,
          companyId: p.companyId,
          departmentId: p.deptId,
          department: p.deptName,
          designationId: p.desigId,
          position: p.position,
          password: HASHED_PASSWORD,
          isRegistered: true,
          isActive: p.isActive !== undefined ? p.isActive : true,
          isBlocked: p.isBlocked !== undefined ? p.isBlocked : false,
          blockedAt: p.isBlocked ? new Date() : null,
          blockReason: p.blockReason || null,
          createdBy: 'system'
        },
        create: {
          id: p.id,
          staffId: p.staffId,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email.toLowerCase().trim(),
          role: p.role,
          companyId: p.companyId,
          departmentId: p.deptId,
          department: p.deptName,
          designationId: p.desigId,
          position: p.position,
          password: HASHED_PASSWORD,
          isRegistered: true,
          isActive: p.isActive !== undefined ? p.isActive : true,
          isBlocked: p.isBlocked !== undefined ? p.isBlocked : false,
          blockedAt: p.isBlocked ? new Date() : null,
          blockReason: p.blockReason || null,
          createdBy: 'system'
        }
      });
      console.log(`   ✓ Staff Account: ${p.id} (${p.firstName} ${p.lastName} <${p.email}> - Role: ${p.role})`);
    }

    // -------------------------------------------------------------------------
    // 6. REPORTING HIERARCHY (Phase 2: Link Managers)
    // -------------------------------------------------------------------------
    console.log('\n6. Configuring Manager Reporting Lines...');
    const managerMappings = [
      // Top management reporting to Babatunde Lawal (COO)
      { id: 'SEED-USR-02', managerId: 'SEED-USR-03' }, // Chioma (HR) -> Babatunde (COO)
      { id: 'SEED-USR-05', managerId: 'SEED-USR-03' }, // Emeka (Eng Dir) -> Babatunde (COO)
      { id: 'SEED-USR-06', managerId: 'SEED-USR-03' }, // Fatima (Prod Head) -> Babatunde (COO)

      // Engineering team reporting to Emeka Nwosu (SEED-USR-05)
      { id: 'SEED-USR-07', managerId: 'SEED-USR-05' }, // Dayo Adeleke
      { id: 'SEED-USR-08', managerId: 'SEED-USR-05' }, // Ngozi Eze
      { id: 'SEED-USR-09', managerId: 'SEED-USR-05' }, // Ibrahim Musa
      { id: 'SEED-USR-10', managerId: 'SEED-USR-05' }, // Kemi Oladipo
      { id: 'SEED-USR-11', managerId: 'SEED-USR-05' }, // Tunde Bakare
      { id: 'SEED-USR-12', managerId: 'SEED-USR-05' }, // Zainab Haruna
      { id: 'SEED-USR-17', managerId: 'SEED-USR-05' }, // Chinedu Ibe
      { id: 'SEED-USR-18', managerId: 'SEED-USR-05' }, // Blessing Okoro
      { id: 'SEED-USR-19', managerId: 'SEED-USR-05' }, // Halima Usman
      { id: 'SEED-USR-20', managerId: 'SEED-USR-05' }, // Victor Bassey
      { id: 'SEED-USR-22', managerId: 'SEED-USR-05' }, // Elevate Tester
      { id: 'SEED-USR-23', managerId: 'SEED-USR-05' }, // Inactive User
      { id: 'SEED-USR-24', managerId: 'SEED-USR-05' }, // Blocked User

      // Product team reporting to Fatima Bello (SEED-USR-06)
      { id: 'SEED-USR-13', managerId: 'SEED-USR-06' }, // Samuel Ojo
      { id: 'SEED-USR-14', managerId: 'SEED-USR-06' }, // Amaka Obi
      { id: 'SEED-USR-15', managerId: 'SEED-USR-06' }, // Segun Arinze
      { id: 'SEED-USR-16', managerId: 'SEED-USR-06' }  // Maryam Danjuma
    ];

    for (const m of managerMappings) {
      await prisma.staffRecord.update({
        where: { id: m.id },
        data: { managerId: m.managerId }
      });
    }
    console.log(`   ✓ Configured reporting lines for ${managerMappings.length} employee-manager pairs.`);

    // -------------------------------------------------------------------------
    // 7. DEPARTMENT HEADS
    // -------------------------------------------------------------------------
    console.log('\n7. Updating Department Heads...');
    await prisma.department.update({ where: { id: 'SEED-DEP-01' }, data: { headId: 'SEED-USR-05' } }); // Eng Head = Emeka
    await prisma.department.update({ where: { id: 'SEED-DEP-02' }, data: { headId: 'SEED-USR-06' } }); // Prod Head = Fatima
    await prisma.department.update({ where: { id: 'SEED-DEP-03' }, data: { headId: 'SEED-USR-02' } }); // HR Head = Chioma
    await prisma.department.update({ where: { id: 'SEED-DEP-04' }, data: { headId: 'SEED-USR-26' } }); // Ops Head = Beta
    console.log('   ✓ Updated department heads for Engineering, Product, HR, and Operations.');

    // -------------------------------------------------------------------------
    // 8. USER-COMPANY MAPPINGS
    // -------------------------------------------------------------------------
    console.log('\n8. Seeding UserCompany Role Mappings...');
    for (const p of personas) {
      await prisma.userCompany.upsert({
        where: { userId_companyId: { userId: p.id, companyId: p.companyId } },
        update: { role: p.role },
        create: {
          userId: p.id,
          companyId: p.companyId,
          role: p.role,
          createdBy: 'system'
        }
      });
    }

    // Super Admin SEED-USR-01 also gets mapping to SEED-ORG-02
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: 'SEED-USR-01', companyId: 'SEED-ORG-02' } },
      update: { role: 'SUPER_ADMIN' },
      create: {
        userId: 'SEED-USR-01',
        companyId: 'SEED-ORG-02',
        role: 'SUPER_ADMIN',
        createdBy: 'system'
      }
    });
    console.log('   ✓ UserCompany mappings configured for all personas (including SuperAdmin multi-tenant mapping).');

    // -------------------------------------------------------------------------
    // 9. PLATFORM MODULE ACCESS
    // -------------------------------------------------------------------------
    console.log('\n9. Ensuring Platform Module Access for Test Organizations...');
    const allPlatformModules = await prisma.platformModule.findMany();
    for (const companyId of ['SEED-ORG-01', 'SEED-ORG-02']) {
      for (const mod of allPlatformModules) {
        await prisma.companyModuleAccess.upsert({
          where: {
            companyId_moduleId: {
              companyId: companyId,
              moduleId: mod.id
            }
          },
          update: { enabled: true },
          create: {
            companyId: companyId,
            moduleId: mod.id,
            enabled: true
          }
        });
      }
    }
    console.log(`   ✓ All ${allPlatformModules.length} platform modules enabled for SEED-ORG-01 and SEED-ORG-02.`);

    console.log('\n================================================================');
    console.log('✅ SEEDING COMPLETE! ALL PREREQUISITE DATA READY FOR TESTING.');
    console.log('================================================================');

  } catch (error) {
    console.error('\n❌ ERROR DURING SEEDING:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
