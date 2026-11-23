const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = path.resolve(__dirname, '../../docs/Device Management Overview.pdf');
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

const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false, info: { Title: 'Device Management: How It Works', Author: '247HR' } });
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
		.text('Device Management - How It Works', left, bottom - 10);
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
doc.font('bold').fontSize(9).fillColor(colors.blue).text('247HR - SECURITY', left, 345);
doc.font('bold').fontSize(32).fillColor(colors.ink).text('Device Management:\nHow It Works', left, 375, { lineGap: 4 });
body(
	"A plain-language guide to how sign-in devices are tracked, viewed, and controlled across the platform, and what happens when someone's access needs to be restricted.",
	470,
	{ size: 13, width: 440, color: colors.body, lineGap: 7, gap: 28 }
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
	"Until now, once someone signed in there was no record of which device they used, no limit on how many devices could be signed in at once, and no way to immediately cut off access if an account needed to be restricted. A lost phone, a shared computer, or someone who should no longer have access could all quietly keep a valid session going, sometimes for days.",
	y
);
y += 6;
y = heading('What Device Management does', y, 19);
y = body(
	"Every person, regardless of role, can be signed in on up to three devices at a time. Each time someone signs in, the system automatically records that device's name, type, and IP address. HR, Admin, and Super Admin can see and manage these sessions for the people they're responsible for, and everyone can manage their own devices from their Profile page.",
	y
);
y = callout(
	'It works alongside the way sign-in already works.',
	"No extra step is added to a normal sign-in. Device capture happens automatically in the background the moment someone logs in - nothing changes for a person using a device they already sign in from regularly.",
	y
);
y = heading("What's included from day one", y + 4, 19);
y = bullet('Three device slots per person, tracked automatically on every sign-in.');
y = bullet('A quick, one-line view of a session in Staff Management, and a full device history in Employee 360.');
y = bullet("Self-service device management on every person's own Profile page.");
y = bullet("The ability to block a person's access entirely, and to unblock it again under clear rules.");
y = bullet('A recorded history of every sign-in, device change, and block or unblock action.');

// Page 2
addPage(2);
y = heading('The five-step flow', 65);
y = step(
	1,
	'Sign in',
	'Device Capture',
	"The moment someone signs in, the system quietly notes the device's name, type, and IP address. If it recognizes the device from a previous sign-in, it simply marks that session active again rather than treating it as something new.",
	y
);
y = step(
	2,
	'Fourth device',
	'Choose a Device to Replace',
	'Everyone has three device slots. If a person tries to sign in from a fourth, unrecognized device, they are shown their three existing devices and asked to pick one to remove before the new device can be used.',
	y
);
y = step(
	3,
	'Check sessions',
	'View Active Devices',
	"A quick glance in Staff Management shows whether a person has an active device right now. Opening their full Employee 360 profile shows every one of their devices, its status, and when it was last used.",
	y
);
y = step(
	4,
	'Step in when needed',
	'Clear a Session',
	"HR, Admin, and Super Admin can sign a specific device out remotely, and every person can do the same for their own devices from their Profile page. Nobody, at any level, can clear the exact device they are using right now.",
	y
);
y = step(
	5,
	'Restrict access',
	'Block and Unblock',
	"Blocking a person immediately signs out every device they're using and stops them from signing in again, with a clear message pointing them to their HR administrator. Unblocking follows a clear chain of authority, covered on the next page.",
	y,
	true
);

// Page 3
addPage(3);
y = heading('Who can see what', 65);
y = body(
	"Visibility always flows downward, so nobody sees more than the people they're responsible for.",
	y,
	{ gap: 20 }
);
card(left, y, 145, 74, 'Everyone', 'Their Own Devices\n(Profile page)');
doc
	.font('regular')
	.fontSize(17)
	.fillColor(colors.muted)
	.text('->', left + 155, y + 26);
card(left + 170, y, 145, 74, 'Downward visibility', 'HR & Admin see\nStaff Sessions', true);
doc
	.font('regular')
	.fontSize(17)
	.fillColor(colors.muted)
	.text('->', left + 326, y + 26);
card(left + 341, y, 141, 74, 'Widest view', 'Super Admin sees\nEveryone, Every Company');
y = body(
	"HR and Admin can see and manage sessions for the Staff they're responsible for within their own company, but not for other HR or Admin colleagues. Super Admin can see and manage everyone's sessions, in every company.",
	y + 98
);
y = heading("Blocking a person's access", y + 6, 19);
y = body(
	"Blocking is available to HR, Admin, and Super Admin. The moment someone is blocked, every device they're signed in on is immediately deactivated, and any browser they're actively using is signed out shortly after. If they try to sign in again, they see a clear message asking them to contact their HR administrator - not a confusing password error.",
	y
);
y = callout(
	'Unblocking follows the same chain of authority as the block.',
	'If an HR or Admin blocked someone, any HR or Admin in that same company can unblock them. If a Super Admin made the block, only a Super Admin can lift it, regardless of company. Every block and unblock is recorded, including who did it, when, and why.',
	y,
	'green'
);

// Page 4
addPage(4);
y = heading('Good to know', 65);
const faq = [
	[
		'Can I see whose device is active right now?',
		'Yes. Staff Management shows a quick one-line status for each person, and Employee 360 shows the complete device history and last-active time for everyone HR, Admin, or Super Admin is allowed to view.',
	],
	[
		'What happens if I sign in on a fourth device?',
		'You are shown your three existing devices and asked to choose one to remove. Once you pick one, it is removed and your new device takes its place.',
	],
	[
		'Can I accidentally lock myself out by clearing a device?',
		'No. The system never lets you clear the exact device you are currently using, whether you are doing it yourself on your Profile page or viewing your own record as HR, Admin, or Super Admin.',
	],
	[
		'How fast does someone get signed out after being blocked?',
		'Every device is deactivated immediately. An open browser session is checked automatically about once a minute, so it is signed out shortly after - not necessarily the same second.',
	],
	[
		'Who is allowed to unblock someone?',
		'It depends on who blocked them. A block made by HR or Admin can be lifted by any HR or Admin in that same company. A block made by a Super Admin can only be lifted by a Super Admin.',
	],
	[
		'Is any of this written down anywhere?',
		"Yes. Every sign-in, device removal, session clear, block, and unblock is added to that person's activity record, including who performed it.",
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
	'Device Management includes automatic device capture on sign-in, a three-device limit with a replace-a-device flow, role-based visibility in Staff Management and Employee 360, self-service device control on Profile, and full block and unblock authority with activity logging.',
	y + 8,
	'green'
);

doc.end();
console.log(`Wrote ${outputPath}`);
