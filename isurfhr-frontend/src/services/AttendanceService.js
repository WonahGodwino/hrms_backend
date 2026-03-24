import API from './axios';
import { formatDateForAPI } from '@/lib/constants';

/**
 * Updated AttendanceService based on new API documentation
 */

/* ========== Daily Attendance Recording ========== */

/**
 * Record daily attendance (sign-in/sign-out)
 * @param {Object} data - { companyId, identifier, method? }
 */
export const recordDailyAttendance = (data) => API.post('/api/attendance/daily', data);

/* ========== Attendance Views ========== */

/**
 * Fetch weekly attendance
 * @param {string} companyId
 * @param {string} date - ISO date string (YYYY-MM-DD)
 */
export const fetchWeeklyAttendance = (companyId, date) =>
	API.get('/api/attendance/weekly', {
		params: { companyId, date },
	});

/**
 * Fetch monthly attendance
 * @param {string} companyId
 * @param {string} date - ISO date string (YYYY-MM-DD)
 */
export const fetchMonthlyAttendance = (companyId, date) =>
	API.get('/api/attendance/monthly', {
		params: { companyId, date },
	});

/**
 * Filter attendance by day, week, or month
 * @param {Object} params - { companyId, staffId?, period, date }
 * period: 'day' | 'week' | 'month'
 */
export const filterAttendance = (params) => API.get('/api/attendance/views/', { params });

/**
 * Get daily attendance (for today)
 * Note: Based on docs, might use the filter endpoint with period='day'
 */
export const getDailyAttendance = (companyId, date) =>
	API.get('/api/attendance/views/', {
		params: {
			companyId,
			period: 'day',
			date: date || new Date().toISOString().split('T')[0],
		},
	});

/* ========== Legacy endpoints (if still needed) ========== */

/**
 * Clock in for a staff member (legacy)
 * payload: { staff: string }
 */
export const clockIn = (payload) => API.post('/attendance/clock-in', payload);

/**
 * Clock out for a staff member (legacy)
 * payload: { staff: string }
 */
export const clockOut = (payload) => API.post('/attendance/clock-out', payload);

/**
 * Get attendance stats (legacy)
 */
export const getAttendanceStats = (params = {}) => API.get('/attendance/attendance-stats', { params });

const handleActualExport = async (exportConfig) => {
	try {
		const { type } = exportConfig;

		// Generate filename
		const dateRange = exportConfig.startDate && exportConfig.endDate ? `${exportConfig.startDate}_to_${exportConfig.endDate}` : formatDateForAPI(selectedDate);

		let filename = '';
		let dataStr = '';
		let mimeType = '';

		switch (type) {
			case 'csv':
				filename = `attendance_report_${dateRange}.csv`;
				mimeType = 'text/csv';
				dataStr = generateCSVData(attendanceData, summaryStats, exportConfig.filters);
				break;

			case 'json':
				filename = `attendance_report_${dateRange}.json`;
				mimeType = 'application/json';
				dataStr = JSON.stringify(
					{
						metadata: {
							generated: new Date().toISOString(),
							companyId,
							filters: exportConfig.filters,
							type: 'attendance_report',
						},
						summary: summaryStats,
						data: attendanceData,
					},
					null,
					2
				);
				break;

			default:
				// For PDF and Excel, suggest backend implementation
				setNotification({
					open: true,
					message: `${type.toUpperCase()} export requires backend support. Please contact your administrator.`,
					severity: 'warning',
				});
				return;
		}

		// Create and download the file
		const blob = new Blob([dataStr], { type: mimeType });
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		window.URL.revokeObjectURL(url);

		setNotification({
			open: true,
			message: `${type.toUpperCase()} report exported successfully!`,
			severity: 'success',
		});
	} catch (err) {
		setNotification({
			open: true,
			message: err.message || 'Failed to export report',
			severity: 'error',
		});
	}
};

// CSV generator helper function
const generateCSVData = (attendanceData, summaryStats, filters) => {
	// CSV headers
	const headers = ['Staff ID', 'First Name', 'Last Name', 'Department', 'Position', 'Email', 'Date', 'Sign In', 'Sign Out', 'Status', 'Method'];

	// Convert data to CSV rows
	const rows = attendanceData.map((record) => {
		const staff = record.staff || {};
		const date = record.date || (record.signInAt ? new Date(record.signInAt).toLocaleDateString() : '');
		const signIn = record.signInAt ? new Date(record.signInAt).toLocaleTimeString() : '';
		const signOut = record.signOutAt ? new Date(record.signOutAt).toLocaleTimeString() : '';

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
		]
			.map((cell) => {
				// Escape quotes and wrap in quotes if contains comma
				const escaped = String(cell).replace(/"/g, '""');
				return escaped.includes(',') ? `"${escaped}"` : escaped;
			})
			.join(',');
	});

	// Add summary section
	const summaryRows = [
		'',
		'SUMMARY',
		`Total Staff,${summaryStats.total}`,
		`Present,${summaryStats.present}`,
		`Late,${summaryStats.late}`,
		`Absent,${summaryStats.absent}`,
		'',
		`Generated,${new Date().toLocaleString()}`,
	];

	return [headers.join(','), ...rows, ...summaryRows].join('\n');
};
