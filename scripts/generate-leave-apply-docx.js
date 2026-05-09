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

const outputPath = path.join(process.cwd(), 'docs', 'LEAVE_APPLY_API_USAGE.docx')

function heading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
  })
}

function body(text) {
  return new Paragraph({ text, spacing: { after: 80 } })
}

function codeBlock(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: 'Consolas',
        size: 20,
      }),
    ],
    spacing: { after: 120 },
  })
}

function bullet(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 60 },
  })
}

const sections = [
  heading('Leave Apply API - Sample Usage, Payload, and Response', HeadingLevel.HEADING_1),
  new Paragraph({
    children: [
      new TextRun({
        text: `Generated on ${new Date().toISOString()}`,
        italics: true,
      }),
    ],
    alignment: AlignmentType.LEFT,
    spacing: { after: 200 },
  }),

  heading('1. Endpoint Overview'),
  bullet('Method: POST'),
  bullet('Path: /api/leaves/apply'),
  bullet('Auth: Bearer token required'),
  bullet('Roles: STAFF, MANAGER, HR, ADMIN, SUPER_ADMIN'),
  body('This endpoint creates a leave request, validates leave policy, checks balance, and routes the request through approval workflow.'),

  heading('2. Request Headers'),
  codeBlock('Content-Type: application/json\nAuthorization: Bearer <JWT_TOKEN>'),

  heading('3. Payload Fields'),
  bullet('leaveTypeId (required): Leave type ID. Accepts CUID or UUID.'),
  bullet('startDate (required): Date string, e.g., 2026-05-20.'),
  bullet('endDate (required): Date string and must be after startDate.'),
  bullet('reason (required): Between 5 and 500 characters.'),
  bullet('handoverTo (optional): Can be staff internal ID, employee staffId, email, or full name.'),
  bullet('handoverNotes (optional): Notes for handover person.'),
  bullet('isHalfDay (optional): true or false. Default is false.'),
  bullet('halfDayPart (optional): FIRST_HALF or SECOND_HALF.'),
  bullet('staffRecordId (optional): For HR/Admin to apply on behalf of another staff member.'),

  heading('4. Sample Payloads'),
  body('4.1 Standard Leave Application'),
  codeBlock('{\n  "leaveTypeId": "cmab12cd30001xyz123456789",\n  "startDate": "2026-05-20",\n  "endDate": "2026-05-23",\n  "reason": "I need annual leave for personal commitments.",\n  "handoverTo": "STF-1024",\n  "handoverNotes": "Please monitor support tickets while I am away.",\n  "isHalfDay": false\n}'),
  body('4.2 Using Handover Full Name'),
  codeBlock('{\n  "leaveTypeId": "cmab12cd30001xyz123456789",\n  "startDate": "2026-06-10",\n  "endDate": "2026-06-12",\n  "reason": "Family event leave request.",\n  "handoverTo": "John Doe"\n}'),
  body('4.3 HR/Admin Applying On Behalf'),
  codeBlock('{\n  "leaveTypeId": "4a1d9f85-8b89-4b2c-a7a7-3f13d2ed9ab1",\n  "staffRecordId": "cmzz88klm0007abc123456789",\n  "startDate": "2026-06-03",\n  "endDate": "2026-06-07",\n  "reason": "Approved annual leave by HR."\n}'),

  heading('5. Sample Usage'),
  body('5.1 JavaScript Fetch Example'),
  codeBlock('const payload = {\n  leaveTypeId: "cmab12cd30001xyz123456789",\n  startDate: "2026-05-20",\n  endDate: "2026-05-23",\n  reason: "I need annual leave for personal commitments.",\n  handoverTo: "STF-1024"\n};\n\nconst res = await fetch("/api/leaves/apply", {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "Authorization": `Bearer ${token}`\n  },\n  body: JSON.stringify(payload)\n});\n\nconst data = await res.json();'),
  body('5.2 cURL Example'),
  codeBlock('curl -X POST "https://your-domain.com/api/leaves/apply" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\\n  -d "{\n    \"leaveTypeId\":\"cmab12cd30001xyz123456789\",\n    \"startDate\":\"2026-05-20\",\n    \"endDate\":\"2026-05-23\",\n    \"reason\":\"Annual leave request\",\n    \"handoverTo\":\"John Doe\"\n  }"'),

  heading('6. Success Response Example (200)'),
  codeBlock('{\n  "success": true,\n  "message": "Leave application submitted successfully",\n  "data": {\n    "leaveRequestId": "cmrqabcde0001xyz12345",\n    "referenceNumber": "LR-COMP-AB12-CMRQABCD",\n    "status": "PENDING",\n    "currentStep": "MANAGER",\n    "requestedDays": 3,\n    "leaveType": {\n      "id": "cmab12cd30001xyz123456789",\n      "name": "Annual Leave",\n      "code": "AL",\n      "policy": "Standard Annual Leave Policy"\n    },\n    "leaveBalance": {\n      "total": 21,\n      "used": 8,\n      "pending": 3,\n      "available": 10,\n      "carriedOver": 3\n    },\n    "nextSteps": [\n      "Waiting for manager approval",\n      "You will be notified at each approval stage"\n    ]\n  }\n}'),

  heading('7. Validation and Error Response Examples'),
  body('Invalid ID format (400)'),
  codeBlock('{\n  "success": false,\n  "message": "Invalid identifier format in request",\n  "details": "Please provide valid IDs for leave type, handover staff, and staff record."\n}'),
  body('Multiple handover matches (400)'),
  codeBlock('{\n  "success": false,\n  "message": "Multiple staff matched handoverTo. Please provide exact staff ID or email.",\n  "matches": [\n    {\n      "id": "cmrqa111...",\n      "staffId": "STF-1024",\n      "name": "John Doe",\n      "email": "john.doe@company.com"\n    }\n  ]\n}'),
  body('Handover not found (400)'),
  codeBlock('{\n  "success": false,\n  "message": "Handover staff not found. Provide a valid staff ID, email, or full name.",\n  "matches": []\n}')
]

const doc = new Document({
  sections: [
    {
      properties: {},
      children: sections,
    },
  ],
})

Packer.toBuffer(doc)
  .then((buffer) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, buffer)
    console.log(`DOCX generated successfully: ${outputPath}`)
  })
  .catch((error) => {
    console.error('Error generating DOCX:', error)
    process.exit(1)
  })
