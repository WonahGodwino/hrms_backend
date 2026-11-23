/**
 * backend/scripts/submodule-credentials-map.js
 * 
 * Maps each of the 23 P&A Submodules and 10 E2E Journeys to the exact test
 * personas and credentials needed for execution.
 */

const DEFAULT_PASSWORD = 'Password123!';

const SUBMODULE_CREDENTIALS = {
  1: [
    { role: 'Primary HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Create/manage frameworks, rating scales, proficiency levels, mappings' },
    { role: 'Secondary Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD, purpose: 'Executive admin review & approval path' },
    { role: 'Unauthorized Staff', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify 403 Forbidden / view-only access (CFM-006)' }
  ],
  2: [
    { role: 'Primary HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Build questionnaires, configure section weights (60/40), publish templates' },
    { role: 'Secondary Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD, purpose: 'Preview & clone template drafts' },
    { role: 'Unauthorized Staff', name: 'Ngozi Eze', email: 'qa.ngozi@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify 403 Forbidden / non-admin block (RTF-007)' }
  ],
  3: [
    { role: 'Primary HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Create appraisal cycle, configure phases, enroll participants, activate cycle' },
    { role: 'Manager (Negative test)', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify managers cannot launch or alter cycle schedules' },
    { role: 'Cross-Tenant User', name: 'Beta Specialist', email: 'qa.beta.user@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify multi-tenant isolation; cannot see Org 1 cycles (ACM-022)' }
  ],
  4: [
    { role: 'Primary Staff', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Create individual OKRs, set target metrics & milestone deadlines' },
    { role: 'Secondary Staff', name: 'Ngozi Eze', email: 'qa.ngozi@example.test', password: DEFAULT_PASSWORD, purpose: 'Log progress updates, upload goal completion evidence' },
    { role: 'Peer Staff', name: 'Ibrahim Musa', email: 'qa.ibrahim@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify private vs public goal visibility' }
  ],
  5: [
    { role: 'Primary Manager', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Cascade department objectives, link direct reports goals to org OKRs' },
    { role: 'Secondary Manager', name: 'Fatima Bello', email: 'qa.manager.prod@example.test', password: DEFAULT_PASSWORD, purpose: 'Review Product team goal tree & capacity balance' },
    { role: 'Target Subordinate', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify aligned goals reflect on subordinate workspace' }
  ],
  6: [
    { role: 'Feedback Giver / Peer', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Submit peer kudos, award badges, request 360 feedback' },
    { role: 'Feedback Recipient', name: 'Ngozi Eze', email: 'qa.ngozi@example.test', password: DEFAULT_PASSWORD, purpose: 'View received recognition wall and continuous feedback entries' },
    { role: 'Manager Observer', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Monitor team praise board and feedback trends' }
  ],
  7: [
    { role: 'Primary Staff Subject', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Complete self-assessment ratings, add narrative reflections, submit frozen self-appraisal' },
    { role: 'Secondary Staff Subject', name: 'Samuel Ojo', email: 'qa.samuel@example.test', password: DEFAULT_PASSWORD, purpose: 'Product department self-evaluation path' },
    { role: 'Unauthorized Peer', name: 'Ibrahim Musa', email: 'qa.ibrahim@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify peer cannot edit or view another employee draft self-appraisal' }
  ],
  8: [
    { role: 'Primary Manager Reviewer', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Rate competencies, evaluate goal delivery, submit manager review' },
    { role: 'Secondary Manager', name: 'Fatima Bello', email: 'qa.manager.prod@example.test', password: DEFAULT_PASSWORD, purpose: 'Evaluate Product Design direct reports' },
    { role: 'Subject Employee', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify submitted scores lock and move to calibration' }
  ],
  9: [
    { role: 'Primary HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Committee calibration, score harmonization, rating overrides' },
    { role: 'Executive Reviewer', name: 'Victoria Alabi', email: 'qa.exec@example.test', password: DEFAULT_PASSWORD, purpose: 'View 9-box talent grid and organization distribution curves' },
    { role: 'Line Manager (Negative check)', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify line managers cannot access cross-department calibration panel' }
  ],
  10: [
    { role: 'Primary Staff', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'View finalized past cycles, download appraisal report PDF' },
    { role: 'Secondary Staff', name: 'Ngozi Eze', email: 'qa.ngozi@example.test', password: DEFAULT_PASSWORD, purpose: 'Inspect historical score trends and past manager comments' }
  ],
  11: [
    { role: 'Primary Staff', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Create post-appraisal action items, select target competencies' },
    { role: 'Mentor / Manager', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Approve development activities, track coaching milestone completion' }
  ],
  12: [
    { role: 'Primary Manager', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Initiate PIP, define improvement objectives, schedule check-ins' },
    { role: 'HR Overseer', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Approve PIP initiation, monitor legal compliance and exit/extension' },
    { role: 'Struggling Employee', name: 'Blessing Okoro', email: 'qa.blessing@example.test', password: DEFAULT_PASSWORD, purpose: 'Target employee placed on PIP' }
  ],
  13: [
    { role: 'Employee on PIP', name: 'Blessing Okoro', email: 'qa.blessing@example.test', password: DEFAULT_PASSWORD, purpose: 'View active PIP objectives, submit weekly self-reflections' },
    { role: 'Alternative Employee', name: 'Amaka Obi', email: 'qa.amaka@example.test', password: DEFAULT_PASSWORD, purpose: 'Secondary test case for PIP tracking' },
    { role: 'Unauthorized Peer', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify peer cannot see another staff member PIP' }
  ],
  14: [
    { role: 'Nominating Manager', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Create promotion case, attach justification, submit to HR' },
    { role: 'HR Approver', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Review promotion dossier, verify grade eligibility, approve/reject' },
    { role: 'Nominated Employee', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Subject of nomination (Grade G3 -> G4)' }
  ],
  15: [
    { role: 'Primary HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Monitor cycle submission rates, dispatch bulk reminders' },
    { role: 'System Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD, purpose: 'Track overdue self-reviews and manager evaluations' },
    { role: 'Unauthorized Staff', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify 403 Forbidden / non-admin block' }
  ],
  16: [
    { role: 'Primary Manager', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'View Engineering team completion matrix (13 active reports)' },
    { role: 'Secondary Manager', name: 'Fatima Bello', email: 'qa.manager.prod@example.test', password: DEFAULT_PASSWORD, purpose: 'View Product Design team completion matrix (5 active reports)' }
  ],
  17: [
    { role: 'Primary Manager', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Side-by-side radar comparison of direct report competencies' },
    { role: 'Small Team Manager', name: 'Fatima Bello', email: 'qa.manager.prod@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify small cohort privacy threshold behaviors (PCW-008)' }
  ],
  18: [
    { role: 'Executive Leader', name: 'Victoria Alabi', email: 'qa.exec@example.test', password: DEFAULT_PASSWORD, purpose: 'Organizational macro analytics, BU breakdowns, attrition risk' },
    { role: 'Company Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD, purpose: 'Filter company performance by Business Unit & Department' },
    { role: 'Super Admin', name: 'Adebayo Adeleke', email: 'qa.superadmin@example.test', password: DEFAULT_PASSWORD, purpose: 'Cross-tenant macro overview' },
    { role: 'Line Manager (Negative check)', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify non-executives cannot view executive intelligence metrics' }
  ],
  19: [
    { role: 'Executive Leader', name: 'Victoria Alabi', email: 'qa.exec@example.test', password: DEFAULT_PASSWORD, purpose: 'Leadership succession bench, critical role vacancy risk' },
    { role: 'HR Director', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Manage succession pools, readiness buckets (Ready Now, 1-2 Yrs)' }
  ],
  20: [
    { role: 'Primary HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Inspect immutable audit events, score overrides, deadline extensions' },
    { role: 'Super Admin', name: 'Adebayo Adeleke', email: 'qa.superadmin@example.test', password: DEFAULT_PASSWORD, purpose: 'Filter audit ledger by actor, company, and date range' },
    { role: 'Unauthorized Staff', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify staff cannot access audit logs' }
  ],
  21: [
    { role: 'Primary HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Configure automated alert rules, overdue review notifications' },
    { role: 'Company Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD, purpose: 'Trigger manual rule execution ticks, verify notification queue' }
  ],
  22: [
    { role: 'Executive Leader', name: 'Victoria Alabi', email: 'qa.exec@example.test', password: DEFAULT_PASSWORD, purpose: 'Statistical anomaly scanning, rating inflation/compression flags' },
    { role: 'Super Admin', name: 'Adebayo Adeleke', email: 'qa.superadmin@example.test', password: DEFAULT_PASSWORD, purpose: 'Investigate fraud/bias cases, assign review auditors' },
    { role: 'HR Director', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD, purpose: 'Review department-level distribution variances' }
  ],
  23: [
    { role: 'Primary Staff', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD, purpose: 'View personal goal completion, active appraisal status, peer kudos' },
    { role: 'Secondary Staff', name: 'Ngozi Eze', email: 'qa.ngozi@example.test', password: DEFAULT_PASSWORD, purpose: 'Inspect personal 9-box standing and development objectives' },
    { role: 'Blocked Staff (Negative test)', name: 'Blocked User', email: 'qa.blocked@example.test', password: DEFAULT_PASSWORD, purpose: 'Verify suspended account access denial (isBlocked: true)' }
  ]
};

const JOURNEY_CREDENTIALS = {
  1: [
    { step: 'Setup & Cycle Launch', role: 'HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD },
    { step: 'Goal Setting & Self-Appraisal', role: 'Staff Member', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD },
    { step: 'Manager Evaluation', role: 'Manager Reviewer', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD },
    { step: 'Calibration & Closure', role: 'Committee Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD }
  ],
  2: [
    { step: 'Evaluation & Recommendation', role: 'Manager Reviewer', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD },
    { step: 'PIP Objectives & Reflections', role: 'Staff on PIP', name: 'Blessing Okoro', email: 'qa.blessing@example.test', password: DEFAULT_PASSWORD },
    { step: 'Compliance Sign-off', role: 'HR Director', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD }
  ],
  3: [
    { step: 'Promotion Dossier', role: 'Manager Reviewer', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD },
    { step: 'Nominee Profile', role: 'Top Performer', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD },
    { step: 'HR Validation', role: 'HR Director', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD },
    { step: 'Succession Bench Approval', role: 'CEO', name: 'Victoria Alabi', email: 'qa.exec@example.test', password: DEFAULT_PASSWORD }
  ],
  4: [
    { step: 'Org Goal Definition', role: 'COO / Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD },
    { step: 'Dept Cascading', role: 'Manager Reviewer', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD },
    { step: 'Direct Report Alignment', role: 'Staff Member', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD }
  ],
  5: [
    { step: 'Rule Trigger Config', role: 'HR Admin', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD },
    { step: 'Event Simulation Actor', role: 'Staff Member', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD }
  ],
  6: [
    { step: 'Tenant A Primary Actor', role: 'HR Admin (Org 1)', name: 'Chioma Okonkwo', email: 'qa.hr@example.test', password: DEFAULT_PASSWORD },
    { step: 'Tenant B Isolated Actor', role: 'Staff Member (Org 2)', name: 'Beta Specialist', email: 'qa.beta.user@example.test', password: DEFAULT_PASSWORD }
  ],
  7: [
    { step: 'Large Cohort Inspection', role: 'Eng Director (13 reports)', name: 'Emeka Nwosu', email: 'qa.manager.eng@example.test', password: DEFAULT_PASSWORD },
    { step: 'Small Cohort Inspection', role: 'Product Head (5 reports)', name: 'Fatima Bello', email: 'qa.manager.prod@example.test', password: DEFAULT_PASSWORD }
  ],
  8: [
    { step: 'Target Staff Candidate', role: 'Elevated Staff', name: 'Elevate Tester', email: 'qa.elevate@example.test', password: DEFAULT_PASSWORD },
    { step: 'Elevating Authority', role: 'Company Admin', name: 'Babatunde Lawal', email: 'qa.admin@example.test', password: DEFAULT_PASSWORD }
  ],
  9: [
    { step: 'Continuous Feedback Giver', role: 'Staff Member', name: 'Dayo Adeleke', email: 'qa.dayo@example.test', password: DEFAULT_PASSWORD },
    { step: 'Continuous Feedback Recipient', role: 'Staff Member', name: 'Ngozi Eze', email: 'qa.ngozi@example.test', password: DEFAULT_PASSWORD }
  ],
  10: [
    { step: 'Detection Panel Auditor', role: 'CEO', name: 'Victoria Alabi', email: 'qa.exec@example.test', password: DEFAULT_PASSWORD },
    { step: 'Super Admin Investigator', role: 'Super Admin', name: 'Adebayo Adeleke', email: 'qa.superadmin@example.test', password: DEFAULT_PASSWORD }
  ]
};

module.exports = {
  DEFAULT_PASSWORD,
  SUBMODULE_CREDENTIALS,
  JOURNEY_CREDENTIALS
};
