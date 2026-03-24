import { format } from 'date-fns';

export const generatePDFInfo = (data, stats, filters, companyId) => {
	const infoContent = `
ATTENDANCE REPORT - PDF EXPORT INFORMATION

================================================================================
PDF EXPORT REQUIREMENTS
================================================================================

This system currently does not support direct PDF generation from the frontend.
To enable PDF export, please consider the following options:

1. BACKEND IMPLEMENTATION (Recommended)
   - Add a PDF export endpoint to your backend API
   - Use libraries like: pdfkit, puppeteer, or wkhtmltopdf
   - Endpoint example: POST /api/attendance/export/pdf

2. THIRD-PARTY SERVICES
   - Use services like: PDF.co, DocRaptor, or PDFShift
   - Send JSON data to their API and receive PDF

3. FRONTEND LIBRARIES (Limited)
   - Install jsPDF library: npm install jspdf jspdf-autotable
   - May have limitations with complex formatting

================================================================================
EXPORT DATA (JSON Format)
================================================================================

Below is your attendance data in JSON format which can be imported into
PDF generation tools or sent to a PDF service:

${JSON.stringify(
	{
		metadata: {
			type: 'attendance_data_for_pdf',
			generated: new Date().toISOString(),
			companyId: companyId,
			recordCount: data.length,
			filters: filters,
		},
		summary: {
			total: data.length,
			present: data.filter((d) => d.status === 'PRESENT').length,
			late: data.filter((d) => d.status === 'LATE').length,
			absent: data.filter((d) => d.status === 'ABSENT').length,
		},
		// Include first 5 records as sample
		sampleData: data.slice(0, 5).map((r) => ({
			staffId: r.staffId,
			name: r.staff ? `${r.staff.firstName} ${r.staff.lastName}` : '',
			department: r.staff?.department || '',
			date: r.date || (r.signInAt ? format(new Date(r.signInAt), 'yyyy-MM-dd') : ''),
			signIn: r.signInAt ? format(new Date(r.signInAt), 'HH:mm') : '',
			signOut: r.signOutAt ? format(new Date(r.signOutAt), 'HH:mm') : '',
			status: r.status,
		})),
	},
	null,
	2
)}

================================================================================
TOTAL RECORDS: ${data.length}
GENERATED: ${new Date().toLocaleString()}
================================================================================
`;

	return {
		fileContent: infoContent,
		mimeType: 'text/plain',
		fileExtension: 'txt',
	};
};

export const generateExcelCSV = (data, stats, filters) => {
	const { fileContent } = generateCSV(data, stats, filters);

	return {
		fileContent: fileContent,
		mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		fileExtension: 'xlsx', // Users can open CSV in Excel with this extension
	};
};

export const generateJSON = (data, stats, filters, companyId) => {
	const jsonData = {
		metadata: {
			exportType: 'attendance_report',
			generated: new Date().toISOString(),
			companyId: companyId,
			filters: filters,
			recordCount: data.length,
		},
		summary: {
			total: data.length,
			present: data.filter((d) => d.status === 'PRESENT').length,
			late: data.filter((d) => d.status === 'LATE').length,
			absent: data.filter((d) => d.status === 'ABSENT').length,
			calculated: stats, // Include the calculated stats too
		},
		data: data.map((record) => ({
			id: record.id,
			staffId: record.staffId,
			staff: record.staff,
			date: record.date || (record.signInAt ? format(new Date(record.signInAt), 'yyyy-MM-dd') : null),
			signInAt: record.signInAt,
			signOutAt: record.signOutAt,
			status: record.status,
			method: record.method,
			// Calculate duration if possible
			duration: record.signInAt && record.signOutAt ? ((new Date(record.signOutAt) - new Date(record.signInAt)) / (1000 * 60 * 60)).toFixed(2) + ' hours' : null,
		})),
	};

	return {
		fileContent: JSON.stringify(jsonData, null, 2),
		mimeType: 'application/json',
		fileExtension: 'json',
	};
};

export const formatType = (type) => {
	switch (type) {
		case 'pdf':
			return 'PDF Document (.pdf) - Info file will be provided';
		case 'excel':
			return 'Excel Spreadsheet (.xlsx) - CSV format, opens in Excel';
		case 'csv':
			return 'CSV File (.csv)';
		case 'json':
			return 'JSON Data (.json)';
		default:
			return `${type.toUpperCase()} Document`;
	}
};

export const generateCSV = (data, stats, filters) => {
	// CSV headers
	const headers = [
		'Staff ID',
		'First Name',
		'Last Name',
		'Department',
		'Position',
		'Email',
		'Date',
		'Sign In Time',
		'Sign Out Time',
		'Status',
		'Method',
		'Duration (hours)',
	];

	// Convert data to CSV rows
	const rows = data.map((record) => {
		const staff = record.staff || {};
		const date = record.date || (record.signInAt ? format(new Date(record.signInAt), 'yyyy-MM-dd') : '');

		// Calculate duration if both sign in and sign out exist
		let duration = '';
		if (record.signInAt && record.signOutAt) {
			const start = new Date(record.signInAt);
			const end = new Date(record.signOutAt);
			const hours = ((end - start) / (1000 * 60 * 60)).toFixed(2);
			duration = hours;
		}

		const signIn = record.signInAt ? format(new Date(record.signInAt), 'HH:mm') : '';
		const signOut = record.signOutAt ? format(new Date(record.signOutAt), 'HH:mm') : '';

		return [
			record.staffId || '',
			staff.firstName || '',
			staff.lastName || '',
			staff.department || '',
			staff.position || '',
			staff.email || '',
			date,
			signIn,
			signOut,
			record.status || '',
			record.method || '',
			duration,
		]
			.map((cell) => {
				// Escape quotes and wrap in quotes if contains comma or quotes
				const cellStr = String(cell);
				const escaped = cellStr.replace(/"/g, '""');
				return escaped.includes(',') || escaped.includes('"') ? `"${escaped}"` : escaped;
			})
			.join(',');
	});

	// Add summary section
	const summaryRows = [
		'',
		'SUMMARY',
		`Total Records,${data.length}`,
		`Present,${data.filter((d) => d.status === 'PRESENT').length}`,
		`Late,${data.filter((d) => d.status === 'LATE').length}`,
		`Absent,${data.filter((d) => d.status === 'ABSENT').length}`,
		'',
		'EXPORT INFORMATION',
		`Generated,${new Date().toLocaleString()}`,
		`Period,${filters.period || 'day'}`,
		`Date Range,${filters.startDate || filters.date || ''}${filters.endDate ? ` to ${filters.endDate}` : ''}`,
		...(filters.department ? [`Department,${filters.department}`] : []),
		...(filters.status ? [`Status Filter,${filters.status}`] : []),
	];

	const csvContent = [headers.join(','), ...rows, ...summaryRows].join('\n');

	return {
		fileContent: csvContent,
		mimeType: 'text/csv',
		fileExtension: 'csv',
	};
};
