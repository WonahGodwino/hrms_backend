const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = path.resolve(__dirname, '../../docs/Payroll Generation Overview.pdf');
const fontDir = 'C:/Windows/Fonts';
const regularFont = fs.existsSync(`${fontDir}/segoeui.ttf`) ? `${fontDir}/segoeui.ttf` : 'Helvetica';
const boldFont = fs.existsSync(`${fontDir}/segoeuib.ttf`) ? `${fontDir}/segoeuib.ttf` : 'Helvetica-Bold';

const colors = {
	ink: '#101820',
	body: '#42536b',
	muted: '#8fa3bf',
	line: '#d9e2ee',
	blue: '#147ff5',
	blueTint: '#e8f2ff',
	green: '#18a957',
	greenTint: '#e4f8ed',
	blackBox: '#101820',
};

const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false, info: { Title: 'Payroll Generation: How It Works', Author: '247HR' } });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
doc.pipe(fs.createWriteStream(outputPath));
doc.registerFont('regular', regularFont);
doc.registerFont('bold', boldFont);

const left = 65;
const right = 547;
const contentWidth = right - left;
const bottom = 738;

function addPage(pageNumber) {
	doc.addPage({ size: 'LETTER', margin: 0 });
	if (!pageNumber) return;
	doc
		.strokeColor(colors.line)
		.lineWidth(0.8)
		.moveTo(left, bottom - 22)
		.lineTo(right, bottom - 22)
		.stroke();
	doc
		.font('regular')
		.fontSize(7.5)
		.fillColor(colors.muted)
		.text('Payroll Generation - How It Works', left, bottom - 10);
	doc.text(`Page ${pageNumber}`, right - 32, bottom - 10, { width: 32, align: 'right' });
}

function heading(text, y, size = 19) {
	doc.font('bold').fontSize(size).fillColor(colors.ink).text(text, left, y);
	doc
		.strokeColor(colors.ink)
		.lineWidth(1.5)
		.moveTo(left, y + size + 14)
		.lineTo(right, y + size + 14)
		.stroke();
	return y + size + 31;
}

function body(text, y, options = {}) {
	const size = options.size || 10.5;
	const gap = options.gap ?? 10;
	doc
		.font(options.bold ? 'bold' : 'regular')
		.fontSize(size)
		.fillColor(options.color || colors.body);
	const height = doc.heightOfString(text, { width: options.width || contentWidth, lineGap: options.lineGap || 5 });
	doc.text(text, options.x || left, y, { width: options.width || contentWidth, lineGap: options.lineGap || 5 });
	return y + height + gap;
}

function bullet(text, y) {
	doc.font('bold').fontSize(10).fillColor(colors.body).text('-', left, y);
	return body(text, y, { x: left + 15, width: contentWidth - 15, gap: 8 });
}

function callout(title, text, y, tone = 'blue') {
	const fill = tone === 'green' ? colors.greenTint : colors.blueTint;
	const accent = tone === 'green' ? colors.green : colors.blue;
	doc.font('bold').fontSize(10.5);
	const titleHeight = doc.heightOfString(title, { width: contentWidth - 34, lineGap: 4 });
	doc.font('regular').fontSize(10.5);
	const textHeight = doc.heightOfString(text, { width: contentWidth - 34, lineGap: 4 });
	const height = titleHeight + textHeight + 24;
	doc.roundedRect(left, y, contentWidth, height, 6).fillColor(fill).fill();
	doc.roundedRect(left, y, 4, height, 2).fillColor(accent).fill();
	doc
		.font('bold')
		.fontSize(10.5)
		.fillColor(colors.ink)
		.text(title, left + 18, y + 11, { width: contentWidth - 34, lineGap: 4 });
	doc
		.font('regular')
		.fontSize(10.5)
		.fillColor(colors.body)
		.text(text, left + 18, y + 11 + titleHeight, { width: contentWidth - 34, lineGap: 4 });
	return y + height + 18;
}

function step(number, label, title, text, y, final = false) {
	doc
		.circle(left + 11, y + 11, 11)
		.fillColor(final ? '#d9f8e6' : '#d8eaff')
		.fill();
	doc
		.font('bold')
		.fontSize(10)
		.fillColor(final ? colors.green : colors.blue)
		.text(String(number), left + 7, y + 5, { width: 8, align: 'center' });
	doc
		.roundedRect(left + 31, y, 78, 20, 10)
		.fillColor(final ? '#d9f8e6' : '#d8eaff')
		.fill();
	doc
		.font('bold')
		.fontSize(7)
		.fillColor(final ? colors.green : colors.blue)
		.text(label.toUpperCase(), left + 39, y + 6, { width: 62, align: 'center' });
	doc
		.font('bold')
		.fontSize(11)
		.fillColor(colors.ink)
		.text(title, left + 31, y + 28);
	return body(text, y + 48, { x: left + 31, width: contentWidth - 31, gap: 15 });
}

function card(x, y, width, height, label, title, dark = false) {
	doc
		.roundedRect(x, y, width, height, 7)
		.fillColor(dark ? colors.blackBox : '#ffffff')
		.fill();
	doc
		.roundedRect(x, y, width, height, 7)
		.strokeColor(dark ? colors.blackBox : colors.line)
		.lineWidth(0.8)
		.stroke();
	doc
		.font('regular')
		.fontSize(7.5)
		.fillColor(dark ? '#aab5c5' : colors.muted)
		.text(label.toUpperCase(), x, y + 18, { width, align: 'center' });
	doc
		.font('bold')
		.fontSize(10.5)
		.fillColor(dark ? '#ffffff' : colors.body)
		.text(title, x + 12, y + 39, { width: width - 24, align: 'center', lineGap: 3 });
}

// Cover
addPage(0);
doc.font('bold').fontSize(9).fillColor(colors.blue).text('247HR - PAYROLL', left, 345);
doc.font('bold').fontSize(32).fillColor(colors.ink).text('Payroll Generation:\nHow It Works', left, 375, { lineGap: 4 });
body(
	'A plain-language guide to the automatic payroll feature, what it does, how it fits alongside the way payroll works today, and how large payroll runs are handled.',
	470,
	{ size: 13, width: 430, color: colors.body, lineGap: 7, gap: 28 }
);
doc.strokeColor(colors.line).lineWidth(0.8).moveTo(left, 575).lineTo(right, 575).stroke();
doc.font('regular').fontSize(9).fillColor(colors.muted).text('Prepared for ', left, 590);
doc
	.font('bold')
	.fillColor(colors.body)
	.text('247HR', left + 50, 590);
doc
	.font('regular')
	.fillColor(colors.muted)
	.text(' - September 2026', left + 82, 590);

// Page 1
addPage(1);
let y = heading('The problem this solves', 65);
y = body(
	'Building a monthly payroll can mean collecting the same staff details repeatedly, checking formulas by hand, and waiting while a large spreadsheet is processed. Repeated typing creates room for a figure to land in the wrong row or for a missing value to be noticed too late.',
	y
);
y += 6;
y = heading('What Payroll Generation does', y, 19);
y = body(
	"Payroll Generation creates a working payroll draft from two things your team already manages: each staff member's recurring compensation details and the rules in the selected payroll template. HR then checks the draft, makes any period-specific changes, and approves it when ready.",
	y
);
y = callout(
	'It works alongside Payroll Upload.',
	'The existing spreadsheet upload process is unchanged. Payroll Generation is a separate option for teams that want the system to fill a draft from stored staff information. Both routes lead to the same payslips, reports, and staff views.',
	y
);
y = heading('What is set up before the first run?', y + 4, 19);
y = bullet("A payroll template with the company's pay rules and fields.");
y = bullet('Recurring compensation values for active staff, entered individually or loaded in bulk.');
y = bullet('The working-day count for the pay period, used when the template applies attendance-based proration.');
y = bullet('Optional staff exclusions for people who should not appear in that pay period.');

// Page 2
addPage(2);
y = heading('The five-step flow', 65);
y = step(
	1,
	'Set up once',
	'Compensation Profile',
	"Store each staff member's recurring figures, such as basic salary, housing, transport, or other fixed items. The overview table can be searched by Staff ID, name, or email and is paginated, so it remains practical for large workforces. Upload history shows what was loaded and when.",
	y
);
y = step(
	2,
	'Start a run',
	'Generate',
	'Choose the payroll template, month, year, and working-day count. Before starting, HR can search active staff and select people to exclude from this pay period. The system then builds the draft for the remaining active staff.',
	y
);
y = step(
	3,
	'Check the draft',
	'Review',
	'The current payroll run opens in its own review screen. Search here applies to the staff included in this run, not to the wider company directory. Search by Staff ID, name, or email to find the exact payroll row you are checking.',
	y
);
y = step(
	4,
	'Adjust if needed',
	'Edit and manage',
	'Edit a row directly, select rows for a bulk spreadsheet edit, or re-compute the run from the latest Staff Management and Compensation values. Staff can also be excluded individually or in groups, including by a Staff ID prefix such as BRD.',
	y
);
y = step(
	5,
	'Finish the run',
	'Approve',
	'Approval starts the payslip-generation work. The page remains busy while the system creates or updates the official payroll and payslip records. Nothing is final before approval; after approval, use Edit Payroll to reopen a period before making further changes.',
	y,
	true
);

// Page 3
addPage(3);
y = heading('Where it ends up: Company Payslips', 65);
y = body(
	'Payroll Generation does not create a second payroll destination. Whether a month was built through the traditional spreadsheet upload or through Payroll Generation, approval places the result in the same company payroll and payslip records.',
	y
);
card(left, 190, 145, 70, 'Path A', "Payroll Upload\n(today's process)");
doc
	.font('regular')
	.fontSize(17)
	.fillColor(colors.muted)
	.text('->', left + 155, 214);
card(left + 170, 190, 145, 70, 'Both paths lead here', 'Company Payslips\n& My Payslips', true);
doc
	.font('regular')
	.fontSize(17)
	.fillColor(colors.muted)
	.text('<-', left + 326, 214);
card(left + 341, 190, 141, 70, 'Path B', 'Payroll Generation\n(new process)');
y = body(
	'Staff can find the resulting payslips in the usual places. The payslip design, download experience, email delivery, and reporting destination are shared with the upload process.',
	292
);
y = heading('Built for large payroll runs', y + 8, 19);
y = body(
	'Generating 1,000 staff records can take longer than a normal browser request. To avoid making HR wait on one open request, Generate, Recompute, and Approve start the work and return a Processing status. The review page then checks the run periodically until it becomes Generated, Approved, or Failed.',
	y
);
y = callout(
	'The screen stays clear about what is happening.',
	'While processing, the review page shows a blocking spinner and prevents conflicting actions. Smaller runs are checked more often; large runs are checked less frequently to avoid unnecessary server traffic while the payslips are being created.',
	y,
	'blue'
);
y = heading('What happens if a run fails?', y + 5, 19);
y = body(
	'The run is marked Failed rather than being presented as complete. HR can return to the Payroll Generation area and investigate or retry according to the run status. A partial background operation is not treated as an approved payroll.',
	y
);

// Page 4
addPage(4);
y = heading('Good to know', 65);
const faq = [
	[
		'Can I find one person quickly?',
		'Yes. The Compensation overview and the current payroll review both search by Staff ID, name, or email. The review search only filters staff already included in that payroll run.',
	],
	[
		'Can I exclude people after generation?',
		'Yes, while the run is still being reviewed. Use Exclude staff to open the drawer, view excluded staff, search the included run staff, or find everyone whose Staff ID starts with a chosen prefix. Excluded people can be included again before approval.',
	],
	[
		'Can a 1,000-person run time out?',
		'The user interface should not wait for the full batch in one request. The server starts the work in the background and the page polls the run status. Completion still depends on the server finishing the PDF, payroll, and database work for each staff member.',
	],
	[
		'What if a compensation value is missing?',
		'The draft keeps the value blank and flags the row for review. HR can correct the row, update the compensation profile, re-compute the run, or use the spreadsheet edit path. The system does not silently invent a missing figure.',
	],
	[
		'Does approval send emails automatically?',
		'Email delivery follows the option selected in the approval step. Payslips are still generated as part of approval; email delivery is an additional choice for the run.',
	],
	[
		'Can the traditional upload process still be used?',
		'Yes. Payroll Upload remains available and unchanged. Teams can use either approach for different months, templates, or staff groups.',
	],
];
for (const [question, answer] of faq) {
	doc.font('bold').fontSize(10).fillColor(colors.ink).text(question, left, y, { width: 155, lineGap: 4 });
	doc
		.font('regular')
		.fontSize(10)
		.fillColor(colors.body)
		.text(answer, left + 170, y, { width: contentWidth - 170, lineGap: 4 });
	const qh = doc.heightOfString(question, { width: 155, lineGap: 4 });
	const ah = doc.heightOfString(answer, { width: contentWidth - 170, lineGap: 4 });
	y += Math.max(qh, ah) + 17;
	doc
		.strokeColor(colors.line)
		.lineWidth(0.6)
		.moveTo(left, y - 8)
		.lineTo(right, y - 8)
		.stroke();
}
callout(
	'Current status',
	'Payroll Generation includes compensation setup, searchable and paginated overviews, run-specific review, bulk editing, exclusion controls, background processing, and shared payslip output.',
	650,
	'green'
);

doc.end();
console.log(`Wrote ${outputPath}`);
