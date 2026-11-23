const fs = require('fs')
const path = require('path')
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} = require('docx')

const outputDir = path.join(process.cwd(), '..', 'docs')
const outputPath = path.join(outputDir, 'PHED_User_Guide.docx')

function heading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } })
}

function body(text) {
  return new Paragraph({ text, spacing: { after: 100 } })
}

function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } })
}

function step(num, text) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${num}. `, bold: true }),
      new TextRun({ text }),
    ],
    spacing: { after: 80 },
  })
}

const children = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: 'PHED Payroll Module',
        bold: true,
        size: 56,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: 'User Guide',
        bold: true,
        size: 40,
        color: '137fec',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({
        text: `Pay period management, validation, payroll approval and payslip dispatch  ·  Generated ${new Date().toLocaleDateString('en-NG', { dateStyle: 'long' })}`,
        italics: true,
      }),
    ],
  }),

  heading('1. Overview', HeadingLevel.HEADING_1),
  body('The PHED Payroll module (Payroll Engine) runs the complete monthly payroll cycle for the Port Harcourt Electricity Distribution (PHED) organisation. A pay period moves through a fixed lifecycle from creation to paid, with staff validation, payroll computation, a five-stage approval chain, and finally payslip dispatch.'),

  heading('2. Roles and Permissions'),
  body('Access to the module is controlled by PHED access roles. The roles are grouped into two categories:'),
  bullet('Payroll Approval desks (5): Manager, Compensation & Benefits · Head, Internal Audit · Chief People Officer · Chief Finance Officer · MD/CEO.'),
  bullet('Operational / reporting desks (3): Treasury Team · Financial Reporting Team · Tax Team.'),
  body('HR, Admin and Super Admin keep full, unrestricted access for setup and management. They do not hold an approval desk, so they cannot act in the approval chain — but they can view the pipeline, approve the pay period itself, and dispatch payslips.'),

  heading('3. The Five-Stage Approval Chain'),
  body('When a pay period is submitted for approval, an Approval Memo moves through these five desks in order:'),
  step(1, 'Manager, Compensation & Benefits — submits the period for approval.'),
  step(2, 'Head, Internal Audit — reviews and recommends for approval.'),
  step(3, 'Chief People Officer — first-level executive approval.'),
  step(4, 'Chief Finance Officer — second-level approval and financial endorsement.'),
  step(5, 'MD/CEO — final approval and release authorisation.'),
  body('At any stage from 2 to 5, the memo can be flagged back to Stage 1 for correction. Once the memo completes all five stages, the pay period itself must still be approved by HR/Admin before payslips can be sent.'),

  heading('4. Pay Period Lifecycle'),
  body('A pay period moves through these statuses in order:'),
  bullet('DRAFT — just created; can be edited or deleted.'),
  bullet('VALIDATION OPEN — staff confirm their details; HR/Admin record Yes/No for payment.'),
  bullet('VALIDATION CLOSED — validation locked; overtime can still be entered.'),
  bullet('TEMPLATE ISSUED — the payroll computation template is issued.'),
  bullet('PROCESSING — ready to compute.'),
  bullet('REVIEW — payroll computed; ready for approval.'),
  bullet('APPROVED — period approved; payslips can be sent.'),
  bullet('PAID — payslips dispatched.'),

  heading('5. Step-by-Step Workflow', HeadingLevel.HEADING_1),

  heading('5.1 Create a Pay Period'),
  body('On the Pay Periods page, click New Pay Period, choose the year and month, and save. The period is created in DRAFT status and appears in the list. While in DRAFT it can be edited or deleted.'),

  heading('5.2 Configure Grades and Allowances'),
  body('On the Configuration page, define grades and their allowance templates (housing, transport, meal subsidy, etc.). Allowances can be a percentage of basic salary or a fixed amount.'),

  heading('5.3 Add Staff'),
  body('On the Staff page, add staff individually or via bulk upload, assign grades, and set up union/cooperative memberships as needed.'),

  heading('5.4 Open Validation'),
  body('Open the pay period and click Open Validation. This moves the period to VALIDATION OPEN and makes the staff list available for validation.'),

  heading('5.5 Mark Validations'),
  body('For each staff member, record one of:'),
  bullet('YES for Payment — included in payroll and will be paid.'),
  bullet('NO for Payment — gross is calculated but excluded from the bank schedule. A reason is required.'),
  body('You can download the validation template, fill the Yes/No column and reasons, then upload. Re-uploading is safe — each upload overwrites that staff member\u2019s previous response. You can also correct individual rows directly:'),
  bullet('Edit — change a staff member\u2019s status or reason.'),
  bullet('Delete — remove a staff member\u2019s validation entry (clears their Yes/No status).'),
  body('Editing and deleting is only available while the period is in VALIDATION OPEN or VALIDATION CLOSED.'),

  heading('5.6 Close Validation'),
  body('Click Close Validation once all staff responses are recorded. The period moves to VALIDATION CLOSED.'),

  heading('5.7 Enter Overtime'),
  body('Download the overtime template, enter overtime hours per staff, and upload. Overtime is computed as hours × 1.5, with hourly pay = monthly gross ÷ 730. Individual overtime rows can also be edited while the period has not been approved or paid.'),

  heading('5.8 Compute Payroll'),
  body('Click Compute Payroll to run the computation. The period moves to REVIEW with the full payroll calculated. Review the summary and staff-level figures before approving.'),

  heading('5.9 Submit for Approval or Quick Approve'),
  body('There are two ways a period can be approved:'),
  bullet('Full chain — the Manager, Compensation & Benefits submits the period from My Approval Queue. It then moves through the five desks before final release.'),
  bullet('Quick approve — HR/Admin/SUPER_ADMIN can approve a REVIEW period directly from the pay period screen, bypassing the five-stage chain.'),
  body('Note: a period approved via quick approve does not create an Approval Memo, so the Approval Tracker will show that no pipeline memo exists for it.'),

  heading('5.10 Approve the Pay Period'),
  body('After the memo completes the five stages (or directly, for quick approve), HR/Admin clicks Approve on the period. The period moves to APPROVED, which unlocks payslip generation.'),

  heading('5.11 Dispatch Payslips'),
  body('On the approved period, click Send Payslips. Staff receives their payslip by email and the period moves to PAID. Individual payslips can also be downloaded.'),

  heading('6. Approval Screens'),
  bullet('My Approval Queue — visible only to the five approval desks. Shows the memo awaiting the current user\u2019s action and lets the Manager submit a period for approval.'),
  bullet('Approval Tracker — pick any pay period to view its approval pipeline.'),
  bullet('Memo Archive — every approval memo, past and present, with its stage, status and date of final approval.'),

  heading('7. Reports'),
  body('Reports are available per pay period (JSON, Excel and PDF where supported), including:'),
  bullet('Aggregate Payroll Report — current period vs the previous period, by staff category.'),
  bullet('Bank Schedule, Pension Schedule, PAYE Schedule, NSITF / ITF / NHF schedules.'),
  bullet('Union & Cooperative deductions, Liabilities to PHED.'),
  bullet('Internal Audit reports (IAD summary, changes, exits, new hires).'),

  heading('8. Treasury, Financial Reporting and Tax'),
  body('After final approval, the operational desks can access their pages:'),
  bullet('Treasury Team — Bank Page, Pension, PAYE, NSITF/ITF/NHF, Unions & Cooperatives, Liabilities.'),
  bullet('Financial Reporting Team — Cost Centre Report.'),
  bullet('Tax Team — PAYE Schedule.'),

  heading('9. Utility Allowance'),
  body('Utility allowance is not defined in the PHED business rules. Its value does not reflect in gross salary or net pay. If utility allowance is required for your organisation, contact your System Focal Person.'),

  heading('10. Support'),
  body('For questions or changes to the workflow, contact your System Focal Person or the 24/7HR support team.'),
]

const doc = new Document({
  sections: [{ children }],
})

fs.mkdirSync(outputDir, { recursive: true })
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer)
  console.log(`User guide written to ${outputPath}`)
})
