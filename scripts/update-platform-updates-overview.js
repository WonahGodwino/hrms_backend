const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = path.resolve(__dirname, '../../docs/Platform Updates Overview.pdf');
const fontDir = 'C:/Windows/Fonts';
const regularFont = fs.existsSync(`${fontDir}/segoeui.ttf`) ? `${fontDir}/segoeui.ttf` : 'Helvetica';
const boldFont = fs.existsSync(`${fontDir}/segoeuib.ttf`) ? `${fontDir}/segoeuib.ttf` : 'Helvetica-Bold';
const C = {
	ink: '#101820',
	body: '#42536b',
	muted: '#8fa3bf',
	line: '#d9e2ee',
	blue: '#147ff5',
	tint: '#e8f2ff',
	green: '#18a957',
	greenTint: '#e4f8ed',
	dark: '#101820',
};
const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false, info: { Title: 'Beyond Payroll Generation', Author: '247HR' } });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
doc.pipe(fs.createWriteStream(outputPath));
doc.registerFont('regular', regularFont);
doc.registerFont('bold', boldFont);
const left = 65,
	right = 547,
	width = right - left,
	footerY = 738;
function page(n) {
	doc.addPage({ size: 'LETTER', margin: 0 });
	if (!n) return;
	doc
		.strokeColor(C.line)
		.lineWidth(0.8)
		.moveTo(left, footerY - 22)
		.lineTo(right, footerY - 22)
		.stroke();
	doc
		.font('regular')
		.fontSize(7.5)
		.fillColor(C.muted)
		.text('Beyond Payroll Generation', left, footerY - 10);
	doc.text(`Page ${n}`, right - 32, footerY - 10, { width: 32, align: 'right' });
}
function text(s, y, o = {}) {
	if (!Number.isFinite(y)) y = doc.y;
	const size = o.size || 10.5,
		w = o.width || width;
	doc
		.font(o.bold ? 'bold' : 'regular')
		.fontSize(size)
		.fillColor(o.color || C.body);
	const h = doc.heightOfString(s, { width: w, lineGap: o.lineGap || 5 });
	doc.text(s, o.x || left, y, { width: w, lineGap: o.lineGap || 5 });
	return y + h + (o.gap ?? 10);
}
function title(s, y) {
	doc.font('bold').fontSize(19).fillColor(C.ink);
	const h = doc.heightOfString(s, { width, lineGap: 3 });
	doc.text(s, left, y, { width, lineGap: 3 });
	const lineY = y + h + 10;
	doc.strokeColor(C.ink).lineWidth(1.5).moveTo(left, lineY).lineTo(right, lineY).stroke();
	return lineY + 60;
}
function callout(head, s, y, green = false) {
	const fill = green ? C.greenTint : C.tint,
		accent = green ? C.green : C.blue;
	doc.font('bold').fontSize(10.5);
	const h1 = doc.heightOfString(head, { width: width - 34, lineGap: 4 });
	doc.font('regular').fontSize(10.5);
	const h2 = doc.heightOfString(s, { width: width - 34, lineGap: 4 });
	const h = h1 + h2 + 24;
	doc.roundedRect(left, y, width, h, 6).fillColor(fill).fill();
	doc.roundedRect(left, y, 4, h, 2).fillColor(accent).fill();
	doc
		.font('bold')
		.fontSize(10.5)
		.fillColor(C.ink)
		.text(head, left + 18, y + 11, { width: width - 34, lineGap: 4 });
	doc
		.font('regular')
		.fontSize(10.5)
		.fillColor(C.body)
		.text(s, left + 18, y + 11 + h1, { width: width - 34, lineGap: 4 });
	return y + h + 18;
}
function bullet(s, y) {
	doc.font('bold').fontSize(10).fillColor(C.body).text('-', left, y);
	return text(s, y, { x: left + 15, width: width - 15, gap: 8 });
}
function card(x, y, w, h, label, body, dark = false) {
	doc
		.roundedRect(x, y, w, h, 7)
		.fillColor(dark ? C.dark : '#fff')
		.fill();
	doc
		.roundedRect(x, y, w, h, 7)
		.strokeColor(dark ? C.dark : C.line)
		.lineWidth(0.8)
		.stroke();
	doc
		.font('regular')
		.fontSize(7.5)
		.fillColor(dark ? '#aab5c5' : C.muted)
		.text(label.toUpperCase(), x, y + 17, { width: w, align: 'center' });
	doc
		.font('bold')
		.fontSize(10)
		.fillColor(dark ? '#fff' : C.body)
		.text(body, x + 10, y + 38, { width: w - 20, align: 'center', lineGap: 3 });
}
function faq(q, a, y) {
	doc.font('bold').fontSize(10).fillColor(C.ink).text(q, left, y, { width: 155, lineGap: 4 });
	doc
		.font('regular')
		.fontSize(10)
		.fillColor(C.body)
		.text(a, left + 170, y, { width: width - 170, lineGap: 4 });
	const h = Math.max(doc.heightOfString(q, { width: 155, lineGap: 4 }), doc.heightOfString(a, { width: width - 170, lineGap: 4 }));
	y += h + 17;
	doc
		.strokeColor(C.line)
		.lineWidth(0.6)
		.moveTo(left, y - 8)
		.lineTo(right, y - 8)
		.stroke();
	return y;
}

// Cover
page(0);
doc.font('bold').fontSize(9).fillColor(C.blue).text('247HR · PLATFORM UPDATES', left, 345);
doc.font('bold').fontSize(32).fillColor(C.ink).text('Beyond Payroll\nGeneration', left, 375, { lineGap: 4 });
text(
	'A plain-language look at the platform updates shipped alongside Payroll Generation, including company data access, payroll visibility, dependable Departments, synchronized organization records, functional grade-based pay, and a complete Employee 360 view.',
	470,
	{ size: 13, width: 455, lineGap: 7, gap: 28 }
);
doc.strokeColor(C.line).lineWidth(0.8).moveTo(left, 575).lineTo(right, 575).stroke();
doc.font('regular').fontSize(9).fillColor(C.muted).text('Prepared for ', left, 590);
doc
	.font('bold')
	.fillColor(C.body)
	.text('247HR', left + 50, 590);
doc
	.font('regular')
	.fillColor(C.muted)
	.text(' · September 2026', left + 82, 590);

// 1 Company export
page(1);
let y = title('Company Data Export', 65);
y = text(
	"Until now, pulling together a full picture of a company's data meant going module by module and exporting each piece on its own. HR, Admin, and Super Admin users can now export a company's records into a single downloadable file in one step.",
	y
);
card(left, 210, 130, 70, 'Step 1', 'Choose a\nCompany');
doc
	.fontSize(18)
	.fillColor(C.muted)
	.text('→', left + 140, 232);
card(left + 175, 210, 130, 70, 'Step 2', 'Export');
doc.fontSize(18).text('→', left + 315, 232);
card(left + 350, 210, 132, 70, 'Step 3', 'Download\nthe File');
y = text('Access remains scoped to the companies a user is authorized to work with. Super Admins retain visibility across all companies.', 325);
y = title('Why it matters', y + 8);
text(
	'Reporting, audits, and moving data between systems no longer require stitching several exports together by hand. The result is one action, correctly scoped from the start, with less manual work and less room for someone to see data they should not.',
	y
);

// 2 dashboard
page(2);
y = title('A Real Payroll Dashboard', 65);
y = text(
	'The Payroll Dashboard now opens with summary cards so HR can see the health of payroll processing at a glance, followed by a simple view of successful and failed records. The familiar upload history remains underneath as Recent Uploads.',
	y
);
y = callout(
	'Company data is shown correctly.',
	'The dashboard always follows the company selected at the top of the screen. It no longer blends uploads from other companies a user may also be allowed to access.',
	y
);
const labels = ['TOTAL\nUPLOADS', 'RECORDS\nPROCESSED', 'SUCCESSFUL', 'FAILED', 'SUCCESS\nRATE'];
labels.forEach((l, i) => card(left + i * 97, 330, 86, 65, ['↑', '≡', '✓', '!', '%'][i], l));
y = title('What changed for HR', 445);
bullet('The dashboard gives an immediate summary before the detailed upload list.');
bullet('Payroll activity is presented in the context of the selected company.');
bullet('Success and failure are easier to compare without opening every upload.');

// 3 downloads
page(3);
y = title('Payroll and Staff Downloads, Fixed', 65);
y = text(
	'HR, Admin, and Super Admin users were sometimes unable to download the original uploaded sheet or the list of failed records, particularly when an Admin oversaw more than one company.',
	y
);
y = callout(
	'This has been fixed.',
	'Authorized users can now reliably download both the original sheet and the failed-records sheet for any company they are genuinely allowed to access, in both Payroll and Staff Management.',
	y
);
text(
	'This was an access-check fix. Nothing changed about what the files contain or how they are generated; the right people are simply no longer incorrectly blocked from reaching them.',
	y + 5
);

// 4 departments
page(4);
y = title('Departments: Staff Now Show Up Correctly', 65);
y = text(
	'Departments could already be created and staff could already be assigned, but the department screens did not always show the result correctly. Cards could show zero active staff, rosters could appear empty, and some role displays could crash.',
	y
);
card(left, 225, 190, 92, 'Before', '0\nActive staff shown', false);
doc
	.font('bold')
	.fontSize(23)
	.fillColor(C.muted)
	.text('→', left + 207, 255);
card(left + 245, 225, 237, 92, 'After', '✓  Accurate current headcount\nand a working staff roster', true);
y = title('What was fixed', 370);
y = bullet('Department cards and details now show the true current number of active staff.');
y = bullet('Department rosters list everyone actually assigned to that department.');
y = bullet('The Assign Staff screen loads both assigned staff and staff available to assign.');
bullet('Staff role information no longer causes crashes in roster, designation, or assignment screens.');

// 5 assignment screen
page(5);
y = title('A Cleaner Assign Staff Screen', 65);
y = text(
	"The Assign Staff screen now uses small, easy-to-scan cards for staff already assigned to a department and for people found through the search dropdown. The grid layout replaces one long list and makes it easier to see a department's people at a glance.",
	y
);
const gridTop = y + 15;
for (let i = 0; i < 6; i++) {
	const x = left + (i % 3) * 161,
		yy = gridTop + Math.floor(i / 3) * 100;
	card(x, yy, 150, 82, String.fromCharCode(65 + i), 'Staff Name\nRole');
}
doc
	.font('regular')
	.fontSize(9)
	.fillColor(C.muted)
	.text('Illustrative layout of the new card grid', left + 190, gridTop + 220);
text("The goal is simple: less scrolling, and a faster way to scan a department's people at a glance.", gridTop + 255);

// 6 synchronization
page(6);
y = title('Staff, Designation, and Department Synchronization', 65);
y = text(
	"Staff Management, Designations, and Departments are now connected so updates stay consistent across the platform. HR and authorized administrators can edit a staff member's department, position, or designation from Staff Management, while department teams can update a designation from the department roster.",
	y
);
y = callout(
	'Updates flow both ways.',
	'Renaming a designation updates the affected staff positions. Changing a department updates the staff department information. When a position has no matching designation, the system creates and links one automatically.',
	y
);
const syncCardY = y + 10;
card(left, syncCardY, 145, 72, 'Staff Management', 'Department\nPosition\nDesignation');
doc
	.fontSize(18)
	.fillColor(C.muted)
	.text('↔', left + 158, syncCardY + 25);
card(left + 185, syncCardY, 145, 72, 'Department Roster', 'Staff\nDesignation');
doc.fontSize(18).text('↔', left + 342, syncCardY + 25);
card(left + 370, syncCardY, 112, 72, 'Shared records', 'One\nconsistent view', true);
y = title('Why it matters', syncCardY + 130);
text(
	'These links reduce duplicate entry, prevent conflicting staff information, improve reporting, and give HR a dependable organizational structure regardless of where an update is made.',
	y
);

// 7 synchronization details
page(7);
y = title('A More Reliable Organization Structure', 65);
y = text('The synchronization work also handles the cases that commonly make department and designation records difficult to maintain at scale.', y);
y = bullet('If several active staff members share the same position within a department, that designation is treated as having unlimited capacity for that department.');
y = bullet('A designation rename is reflected in staff position information instead of leaving old names behind.');
y = bullet('Department changes made in Staff Management are reflected in the staff record and department views.');
y = bullet('Department teams can maintain designations from the roster without creating a second, conflicting record.');
y = callout(
	'The result for HR.',
	'The same employee information can be trusted across Staff Management, Department rosters, Designations, dashboards, and reporting. Updates are more efficient, easier to understand, and less likely to drift apart.',
	y + 12,
	true
);
y = title('How this feels in practice', y + 15);
text(
	'A staff member can be moved, renamed, or assigned from the screen that makes the most sense for the person doing the work. The platform keeps the connected records aligned behind the scenes.',
	y
);

// 8 dashboards
page(8);
y = title('Dashboards That Reflect the Current System', 65);
y = text('Admin, HR, and Staff dashboards now show more trustworthy information and connect users directly to the actions they are most likely to need.', y);
y = callout('Admin dashboard', 'Cards now use live, company-scoped information for managed companies, staff members, payslips, and HR managers.', y);
y = callout(
	'HR dashboard',
	'Processed payroll is reported for the previous pay period instead of a fixed month label. Quick actions open Payroll Generation, Staff Management registration, and the Leave Dashboard directly.',
	y
);
y = callout(
	'Staff dashboard',
	'Profile updates connect to the existing profile page. Payslip downloads and leave requests remain available when the relevant module is enabled for the company.',
	y
);
y = title('Clearer access to Leave', y + 4);
text(
	"Leave actions now respect each company's enabled modules. When Leave is unavailable, HR and Staff users see a clear company-specific message instead of entering a feature they cannot use.",
	y
);

// 9 grade levels
page(9);
y = title('Grade Levels, Now Fully Functional', 65);
y = text(
	'Grade Levels already let HR define pay bands and salary steps, but there was no way to actually place a staff member onto one — the feature existed on paper without a way to use it in practice. That gap is now closed.',
	y
);
const gradeCardY = y + 3;
card(left, gradeCardY, 230, 92, 'Before', 'A grade could be built,\nbut never assigned to anyone', false);
doc
	.font('bold')
	.fontSize(23)
	.fillColor(C.muted)
	.text('→', left + 247, gradeCardY + 35);
card(left + 285, gradeCardY, 197, 92, 'After', 'Assigned directly from a\nstaff profile, with real pay attached', true);
y = title('What changed', gradeCardY + 145);
y = bullet("HR can place any staff member on a grade and a specific step directly from that person's own profile.", y);
y = bullet('The pay figure configured for that step is what actually gets attached to the staff member — no more setup that quietly had no effect.', y);
y = bullet("A record is kept every time someone's grade changes, so a staff member's pay history is never lost.", y);
callout(
	'A step configuration issue was also fixed.',
	"Step pay values were sometimes not saved correctly when a grade's steps were configured. Step pay now saves exactly as entered, so every assignment reflects the real number HR set.",
	y + 8
);

// 10 allowance rules
page(10);
y = title('Automatic Allowance Rules', 65);
y = text(
	'Pay bands often come with allowances on top of the base salary — housing, transport, and similar — that should apply automatically based on rules a company sets. That calculation logic already existed behind the scenes, but there was no place for HR to actually configure or see it.',
	y
);
const ruleCardY = y + 3;
card(left, ruleCardY, 150, 78, 'HOUSING', '20% of\nBasic Salary');
card(left + 166, ruleCardY, 150, 78, 'TRANSPORT', 'Fixed\n₦15,000');
card(left + 332, ruleCardY, 150, 78, 'UTILITY', 'Non-taxable');
doc
	.font('regular')
	.fontSize(9)
	.fillColor(C.muted)
	.text('Illustrative examples of configured allowance rules', left, ruleCardY + 94);
y = title('What changed', ruleCardY + 140);
y = bullet('HR can define allowance rules that apply company-wide, or scope a rule to one specific grade.', y);
y = bullet('Each rule can be a fixed amount or a percentage, with an optional minimum and maximum.', y);
y = bullet(
	'The moment someone is placed on a grade, every applicable rule is calculated automatically and attached to their pay — nothing needs to be re-entered by hand.',
	y
);
callout(
	'Why it matters.',
	'Allowances stay consistent and predictable instead of being recalculated by hand every time someone changes grade or a rule changes.',
	y + 8,
	true
);

// 11 employee 360
page(11);
y = title('Employee 360: One Person, One Full Picture', 65);
y = text(
	"Opening a staff record used to mean switching between several separate screens to piece together one person's story — their profile here, their attendance there, payroll somewhere else. That is now one place.",
	y
);
const areas = ['Profile', 'Employment', 'Attendance', 'Leave', 'Payroll', 'Loans', 'Benefits'];
const gridTop2 = y + 3;
areas.forEach((a, i) => {
	const col = i % 4,
		row = Math.floor(i / 4);
	const x = left + col * 121,
		yy = gridTop2 + row * 92;
	card(x, yy, 110, 78, String(i + 1).padStart(2, '0'), a);
});
doc
	.font('regular')
	.fontSize(9)
	.fillColor(C.muted)
	.text('The seven areas now brought together in one employee view', left, gridTop2 + 190);
y = title('What changed', gridTop2 + 225);
y = bullet(
	'Opening a staff record now shows a quick-glance summary first — attendance rate, leave balance, current grade, and any outstanding loan balance — before anything else.',
	y
);
y = bullet(
	"A full profile page brings together one person's profile, employment history, attendance, leave, payroll, loans, and benefits in one place, without switching between modules.",
	y
);
bullet(
	"The view only shows the sections a company actually uses. If a feature like Attendance or Loans & Benefits is not switched on for a company, that section is simply left out rather than shown broken or unavailable.",
	y
);

// 12 status
page(12);
y = title('A More Useful Day-to-Day Experience', 65);
y = text(
	"The dashboard changes reduce navigation time and make the platform's information more dependable. HR can move from a payroll summary to Payroll Generation, register a new employee, or open Leave with fewer steps. Staff can update their profile and reach their payslips or leave requests from a clearer starting point.",
	y
);
callout(
	'The Add Employee action is now direct.',
	'It opens the staff registration form automatically and removes the temporary navigation instruction after it has done its job.',
	y
);

// 13 status
page(13);
y = title('Status at a glance', 65);
[
	['Company Data Export', 'Delivered'],
	['Payroll Dashboard redesign', 'Delivered'],
	['Payroll and Staff download fix', 'Delivered'],
	['Departments staff display fixes', 'Delivered'],
	['Assign Staff screen redesign', 'Delivered'],
	['Staff, Designation, and Department synchronization', 'Delivered'],
	['Dashboard integration update', 'Delivered'],
	['Grade assignment and step pay', 'Delivered'],
	['Automatic allowance rules', 'Delivered'],
	['Employee 360 profile view', 'Delivered'],
	['Codebase cleanup', 'In progress'],
].forEach(([a, b], i) => {
	const yy = y + i * 31;
	doc.font('regular').fontSize(10).fillColor(C.body).text(a, left, yy);
	doc
		.font('bold')
		.fontSize(10)
		.fillColor(b === 'Delivered' ? C.green : '#c98900')
		.text(b, right - 70, yy, { width: 70, align: 'right' });
	doc
		.strokeColor(C.line)
		.lineWidth(0.5)
		.moveTo(left, yy + 20)
		.lineTo(right, yy + 20)
		.stroke();
});

doc.end();
console.log(`Wrote ${outputPath}`);
