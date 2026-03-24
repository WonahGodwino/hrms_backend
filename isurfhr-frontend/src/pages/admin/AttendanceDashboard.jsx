import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
	Box,
	// Container,
	Paper,
	Typography,
	Button,
	Tabs,
	Tab,
	TextField,
	InputAdornment,
	// IconButton,
	CircularProgress,
	// Chip,
	Stack,
	Alert,
	Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import TodayIcon from '@mui/icons-material/Today';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useAuth } from '@/lib/context/AuthContext';
import { generateCSV, generateExcelCSV, generateJSON, generatePDFInfo } from '@/lib/export';
// getDailyAttendance, // For Daily View (using filter with period='day')
// fetchWeeklyAttendance, // For Weekly View
// fetchMonthlyAttendance, // For Monthly View
// recordDailyAttendance, // For recording attendance (we'll do this later)
import {
	filterAttendance, // For advanced filtering
} from '@/services/AttendanceService';
import { formatDateForAPI } from '@/lib/constants';
// import AttendanceFilter from '@/pages/attendance/AttendanceFilter';
import AttendanceFilter from '../attendance/AttendanceFilter';
import AttendanceRecorder from '@/pages/attendance/AttendanceRecorder';
import DailyView from '@/pages/attendance/DailyView';
import WeeklyView from '@/pages/attendance/WeeklyView';
import MonthlyView from '@/pages/attendance/MonthlyView';
import SummaryCards from '@/pages/attendance/SummaryCards';
import DateNavigator from '@/pages/attendance/DateNavigator';
import AttendanceExport from '@/pages/attendance/AttendanceExport';

// Mock data based on API response structure
const mockDailyData = [
	// Current date (Feb 2, 2026)
	{
		id: 'att001',
		staffId: 'EMP001',
		signInAt: '2026-02-02T08:05:00Z',
		signOutAt: '2026-02-02T17:15:00Z',
		status: 'PRESENT',
		method: 'staff_id',
		staff: {
			staffId: 'EMP001',
			firstName: 'John',
			lastName: 'Doe',
			email: 'john.doe@company.com',
			position: 'Manager',
			department: 'HR',
		},
	},
	{
		id: 'att002',
		staffId: 'EMP002',
		signInAt: '2026-02-02T09:30:00Z',
		signOutAt: '2026-02-02T17:00:00Z',
		status: 'LATE',
		method: 'email',
		staff: {
			staffId: 'EMP002',
			firstName: 'Jane',
			lastName: 'Smith',
			email: 'jane.smith@company.com',
			position: 'Developer',
			department: 'IT',
		},
	},
	{
		id: 'att003',
		staffId: 'EMP003',
		signInAt: null,
		signOutAt: null,
		status: 'ABSENT',
		method: null,
		staff: {
			staffId: 'EMP003',
			firstName: 'Mike',
			lastName: 'Johnson',
			email: 'mike.johnson@company.com',
			position: 'Sales Executive',
			department: 'Sales',
		},
	},
	{
		id: 'att004',
		staffId: 'EMP004',
		signInAt: '2026-02-02T08:00:00Z',
		signOutAt: null,
		status: 'PRESENT',
		method: 'staff_id',
		staff: {
			staffId: 'EMP004',
			firstName: 'Sarah',
			lastName: 'Williams',
			email: 'sarah.williams@company.com',
			position: 'Designer',
			department: 'Design',
		},
	},
];

// Additional mock data for testing - just add more records with different staffIds
const mockAttendanceData = [
	...mockDailyData,
	// More staff for comprehensive view
	{
		id: 'att005',
		staffId: 'EMP005',
		signInAt: '2026-02-02T08:10:00Z',
		signOutAt: '2026-02-02T17:05:00Z',
		status: 'PRESENT',
		method: 'staff_id',
		staff: {
			staffId: 'EMP005',
			firstName: 'Robert',
			lastName: 'Brown',
			email: 'robert.brown@company.com',
			position: 'Marketing Specialist',
			department: 'Marketing',
		},
	},
	{
		id: 'att006',
		staffId: 'EMP006',
		signInAt: '2026-02-02T08:25:00Z',
		signOutAt: '2026-02-02T17:05:00Z',
		status: 'LATE',
		method: 'staff_id',
		staff: {
			staffId: 'EMP006',
			firstName: 'David',
			lastName: 'Wilson',
			email: 'david.wilson@company.com',
			position: 'QA Engineer',
			department: 'IT',
		},
	},
	{
		id: 'att007',
		staffId: 'EMP007',
		signInAt: '2026-02-02T07:45:00Z',
		signOutAt: '2026-02-02T16:30:00Z',
		status: 'PRESENT',
		method: 'staff_id',
		staff: {
			staffId: 'EMP007',
			firstName: 'Emily',
			lastName: 'Davis',
			email: 'emily.davis@company.com',
			position: 'Accountant',
			department: 'Finance',
		},
	},
	{
		id: 'att008',
		staffId: 'EMP008',
		signInAt: null,
		signOutAt: null,
		status: 'ABSENT',
		method: null,
		staff: {
			staffId: 'EMP008',
			firstName: 'Michael',
			lastName: 'Taylor',
			email: 'michael.taylor@company.com',
			position: 'Operations Manager',
			department: 'Operations',
		},
	},
	{
		id: 'att009',
		staffId: 'EMP009',
		signInAt: '2026-02-02T08:50:00Z',
		signOutAt: '2026-02-02T17:15:00Z',
		status: 'LATE',
		method: 'email',
		staff: {
			staffId: 'EMP009',
			firstName: 'Lisa',
			lastName: 'Anderson',
			email: 'lisa.anderson@company.com',
			position: 'HR Specialist',
			department: 'HR',
		},
	},
	{
		id: 'att010',
		staffId: 'EMP010',
		signInAt: '2026-02-02T08:00:00Z',
		signOutAt: '2026-02-02T17:00:00Z',
		status: 'PRESENT',
		method: 'staff_id',
		staff: {
			staffId: 'EMP010',
			firstName: 'James',
			lastName: 'Thomas',
			email: 'james.thomas@company.com',
			position: 'Sales Manager',
			department: 'Sales',
		},
	},
];

// Filter function for development - filters data based on date and staffId
const filterMockData = (params = {}) => {
	const {
		period = 'day',
		date, // We'll ignore period filtering for mock data simplicity
		staffId,
		department,
		status,
		search,
	} = params;

	let filteredData = [...mockAttendanceData];

	// Filter by date if provided
	if (date) {
		// filteredData = filteredData.filter((item) => {
		// 	if (!item.signInAt) return false;
		// 	const itemDate = new Date(item.signInAt).toISOString().split('T')[0];
		// 	return itemDate === date;
		// });
	}

	// Filter by staffId (for STAFF role)
	if (staffId) {
		// filteredData = filteredData.filter((item) => item.staffId === staffId);
	}

	// Additional filters
	if (department) {
		// filteredData = filteredData.filter((item) => item.staff?.department?.toLowerCase() === department.toLowerCase());
	}

	if (status) {
		filteredData = filteredData.filter((item) => item.status?.toLowerCase() === status.toLowerCase());
	}

	if (search) {
		const searchLower = search.toLowerCase();
		filteredData = filteredData.filter((item) => {
			const staff = item.staff || {};
			return (
				staff.firstName?.toLowerCase().includes(searchLower) ||
				staff.lastName?.toLowerCase().includes(searchLower) ||
				staff.email?.toLowerCase().includes(searchLower) ||
				staff.department?.toLowerCase().includes(searchLower) ||
				staff.position?.toLowerCase().includes(searchLower) ||
				item.staffId?.toLowerCase().includes(searchLower)
			);
		});
	}

	return filteredData;
};

const AttendanceDashboard = () => {
	const { user } = useAuth();
	const role = user?.role || '';

	// State
	const [activeTab, setActiveTab] = useState(0);
	const [recorderOpen, setRecorderOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [cardsLoading] = useState(false);
	const [viewDate, setViewDate] = useState(new Date());
	const [attendanceData, setAttendanceData] = useState([]);
	const [filterOpen, setFilterOpen] = useState(false);
	const [activeFilters, setActiveFilters] = useState({});
	const [departments, setDepartments] = useState([]);
	const [exportOpen, setExportOpen] = useState(false);

	// Notification state
	const [notification, setNotification] = useState({
		open: false,
		message: '',
		severity: 'success', // 'success' | 'error' | 'info' | 'warning'
	});

	// Company ID - would come from user context or company selection
	const companyId = user?.companyId || '';

	// Summary stats
	const [summaryStats, setSummaryStats] = useState({
		total: 0,
		present: 0,
		absent: 0,
		late: 0,
	});

	const [staffStats, setStaffStats] = useState({
		todayStatus: 'Not Checked In',
		weeklyHours: '0h',
		monthlyAttendance: '0%',
		onTimeRate: '0%',
	});

	const extractDepartments = (data) => {
		if (!data || !Array.isArray(data)) return [];
		const deptSet = new Set();
		data.forEach((item) => {
			if (item.staff?.department) {
				deptSet.add(item.staff.department);
			}
		});
		return Array.from(deptSet);
	};

	// Update the handleExport function
	const handleExport = () => {
		setExportOpen(true);
	};

	// Handle actual export
	const handleActualExport = async (exportConfig) => {
		try {
			// Show loading state
			setNotification({
				open: true,
				message: `Preparing ${exportConfig.type.toUpperCase()} report...`,
				severity: 'info',
			});

			// Prepare parameters for fetching data
			const fetchParams = {
				companyId,
				period: exportConfig.range === 'current' ? (activeTab === 0 ? 'day' : activeTab === 1 ? 'week' : activeTab === 2 ? 'month' : 'day') : 'custom',
				...exportConfig.filters,
			};

			// If custom range, add start and end dates
			if (exportConfig.range === 'custom') {
				fetchParams.startDate = exportConfig.startDate;
				fetchParams.endDate = exportConfig.endDate;
			} else {
				// For current view, use selected date
				fetchParams.date = formatDateForAPI(selectedDate);
			}

			// Fetch fresh data based on export parameters
			const response = await filterAttendance(fetchParams);

			if (!response.data.success) {
				throw new Error('Failed to fetch data for export');
			}

			const exportData = response.data.data?.attendance || attendanceData; // Fallback to current data

			// Generate the file based on requested type
			let fileContent;
			let mimeType;
			let fileExtension;
			let successMessage;

			switch (exportConfig.type) {
				case 'csv':
					({ fileContent, mimeType, fileExtension } = generateCSV(exportData, summaryStats, fetchParams));
					successMessage = 'CSV report exported successfully!';
					break;

				case 'json':
					({ fileContent, mimeType, fileExtension } = generateJSON(exportData, summaryStats, fetchParams, companyId));
					successMessage = 'JSON report exported successfully!';
					break;

				case 'excel':
					// For Excel, we'll create a CSV with .xlsx extension (can be opened in Excel)
					({ fileContent, mimeType, fileExtension } = generateExcelCSV(exportData, summaryStats, fetchParams));
					successMessage = 'Excel report exported successfully!';
					break;

				case 'pdf':
					// For PDF, show informative message and provide JSON
					({ fileContent, mimeType, fileExtension } = generatePDFInfo(exportData, summaryStats, fetchParams, companyId));
					successMessage = 'PDF requires backend support. JSON report provided instead.';
					break;

				default:
					throw new Error(`Unsupported export type: ${exportConfig.type}`);
			}

			// Create and download the file
			const blob = new Blob([fileContent], { type: mimeType });
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');

			// Generate filename
			const dateStr = exportConfig.startDate && exportConfig.endDate ? `${exportConfig.startDate}_to_${exportConfig.endDate}` : formatDateForAPI(selectedDate);

			link.href = url;
			link.download = `attendance_report_${dateStr}.${fileExtension}`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);

			// Show success notification
			setNotification({
				open: true,
				message: successMessage,
				severity: exportConfig.type === 'pdf' ? 'info' : 'success',
			});
		} catch (err) {
			console.error('Export error:', err);
			setNotification({
				open: true,
				message: err.message || `Failed to export ${exportConfig.type} report`,
				severity: 'error',
			});
		}
	};

	const fetchAttendanceData = async () => {
		if (!companyId) {
			setError('Company ID is required');
			return;
		}

		setLoading(true);
		setError('');

		try {
			const dateStr = formatDateForAPI(selectedDate);
			let params = {
				companyId,
			};

			// Default behavior based on active tab
			switch (activeTab) {
				case 0: // Daily View
					params = { ...params, period: 'day', date: dateStr };
					break;
				case 1: // Weekly View
					params = { ...params, period: 'week', date: dateStr };
					break;
				case 2: // Monthly View
					params = { ...params, period: 'month', date: dateStr };
					break;
			}

			// Add staffId filter if user is STAFF
			if (role === 'STAFF' && user?.staffId) {
				params.staffId = user.staffId;
			}

			// For now, use mock data in development
			// if (process.env.NODE_ENV === 'development') {
			// Simulate API delay
			// await new Promise((resolve) => setTimeout(resolve, 500));

			// Get filtered mock data with proper parameters
			const mockData = filterMockData({
				period: params.period || 'day',
				date: params.date,
				staffId: params.staffId,
			});

			// Set the data directly (since filterMockData returns the array)
			setAttendanceData(mockData || []);
			calculateSummaryStats(mockData || []);

			// Extract departments for filter dropdown (only for ADMIN/HR)
			if (role !== 'STAFF') {
				const extractedDepts = extractDepartments(mockData || []);
				setDepartments(extractedDepts);
			}
			// }
			// } else {
			// 	// Real API call
			const response = await filterAttendance(params);

			// 	if (response.data.success) {
			// 		const data = response.data.data?.attendance || [];
			// 		setAttendanceData(data);
			// 		calculateSummaryStats(data);

			// 		if (role !== 'STAFF') {
			// 			const extractedDepts = extractDepartments(data);
			// 			setDepartments(extractedDepts);
			// 		}
			// 	} else {
			// 		setError(response.data.message || 'Failed to fetch attendance data');
			// 		setAttendanceData([]);
			// 		setSummaryStats({ total: 0, present: 0, absent: 0, late: 0 });
			// 		if (role === 'STAFF') {
			// 			setStaffStats({
			// 				todayStatus: 'No Data',
			// 				weeklyHours: '0h',
			// 				monthlyAttendance: '0%',
			// 				onTimeRate: '0%',
			// 			});
			// 		}
			// 	}
			// }
		} catch (err) {
			console.error('Error fetching attendance data:', err);
			setError(err.message || 'Network error. Please try again.');
		} finally {
			setLoading(false);
		}
	};

	// Handle filter application
	const handleApplyFilters = (filters) => {
		setActiveFilters(filters);
		fetchAttendanceData(filters);
	};

	// Calculate summary statistics from attendance data
	const calculateStaffStats = (data, user) => {
		if (!data || !Array.isArray(data) || !user) {
			return {
				todayStatus: 'No Data',
				weeklyHours: '0h',
				monthlyAttendance: '0%',
				onTimeRate: '0%',
			};
		}

		const today = formatDateForAPI(new Date());
		const userStaffId = user.staffId || user.id;

		// Filter user's records
		const userRecords = data.filter((record) => record.staffId === userStaffId || record.staff?.email === user.email || record.staff?.staffId === userStaffId);

		// Today's status
		const todayRecord = userRecords.find((record) => record.date === today || (record.signInAt && format(new Date(record.signInAt), 'yyyy-MM-dd') === today));

		const todayStatus = todayRecord?.status || 'Not Checked In';

		// Weekly hours (last 7 days)
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

		const weeklyRecords = userRecords.filter((record) => {
			const recordDate = record.date || (record.signInAt ? new Date(record.signInAt) : null);
			return recordDate && recordDate >= oneWeekAgo;
		});

		let weeklyHours = 0;
		weeklyRecords.forEach((record) => {
			if (record.signInAt && record.signOutAt) {
				const start = new Date(record.signInAt);
				const end = new Date(record.signOutAt);
				weeklyHours += (end - start) / (1000 * 60 * 60); // Convert to hours
			}
		});

		// Monthly attendance percentage
		const currentMonth = format(new Date(), 'yyyy-MM');
		const monthlyRecords = userRecords.filter((record) => {
			const recordDate = record.date || (record.signInAt ? format(new Date(record.signInAt), 'yyyy-MM') : null);
			return recordDate === currentMonth;
		});

		const workingDays = 22; // Assuming 22 working days in a month
		const monthlyAttendance = monthlyRecords.length > 0 ? `${Math.round((monthRecords.length / workingDays) * 100)}%` : '0%';

		// On-time rate (percentage of times not late)
		const totalRecords = userRecords.length;
		const onTimeRecords = userRecords.filter((record) => record.status !== 'LATE').length;
		const onTimeRate = totalRecords > 0 ? `${Math.round((onTimeRecords / totalRecords) * 100)}%` : '0%';

		return {
			todayStatus,
			weeklyHours: `${Math.round(weeklyHours)}h`,
			monthlyAttendance,
			onTimeRate,
		};
	};

	const calculateSummaryStats = (data) => {
		if (!data || !Array.isArray(data)) {
			setSummaryStats({ total: 0, present: 0, absent: 0, late: 0 });
			if (role === 'STAFF') {
				setStaffStats({
					todayStatus: 'No Data',
					weeklyHours: '0h',
					monthlyAttendance: '0%',
					onTimeRate: '0%',
				});
			}
			return;
		}

		// Calculate admin stats
		const stats = {
			total: data.length,
			present: data.filter((item) => item.status === 'PRESENT').length,
			absent: data.filter((item) => item.status === 'ABSENT').length,
			late: data.filter((item) => item.status === 'LATE').length,
		};

		setSummaryStats(stats);

		// Calculate staff stats if user is STAFF
		if (role === 'STAFF') {
			const calculatedStaffStats = calculateStaffStats(data, user);
			setStaffStats(calculatedStaffStats);
		}
	};

	// const calculateSummaryStats = (data) => {
	// 	if (!data || !Array.isArray(data)) {
	// 		setSummaryStats({ total: 0, present: 0, absent: 0, late: 0 });
	// 		return;
	// 	}

	// 	const stats = {
	// 		total: data.length,
	// 		present: data.filter((item) => item.status === 'PRESENT').length,
	// 		absent: data.filter((item) => item.status === 'ABSENT').length,
	// 		late: data.filter((item) => item.status === 'LATE').length,
	// 	};

	// 	setSummaryStats(stats);
	// };

	// Filter attendance data based on search term
	const filterDataBySearch = (data) => {
		if (!searchTerm.trim()) return data;

		const searchLower = searchTerm.toLowerCase();
		return data.filter((item) => {
			const staff = item.staff || {};
			return (
				staff.firstName?.toLowerCase().includes(searchLower) ||
				staff.lastName?.toLowerCase().includes(searchLower) ||
				staff.email?.toLowerCase().includes(searchLower) ||
				staff.department?.toLowerCase().includes(searchLower) ||
				staff.position?.toLowerCase().includes(searchLower) ||
				item.staffId?.toLowerCase().includes(searchLower)
			);
		});
	};

	// Handle tab change
	const handleTabChange = (event, newValue) => {
		setActiveTab(newValue);
	};

	// Handle date change
	const handleDateChange = (newDate) => {
		setSelectedDate(newDate);
		setViewDate(newDate);

		// Only fetch data if we're on Monthly View (for week/day views, we should fetch)
		if (activeTab === 2) {
			// For monthly view, we might want to keep existing data
			// and just update the selected date
			return;
		}

		// For daily and weekly views, fetch new data
		fetchAttendanceData();
	};

	// Handle month change from MonthlyView
	const handleMonthChange = (newDate) => {
		setViewDate(newDate);

		// Only update selectedDate if we're changing months
		// This prevents unnecessary API calls for date navigation
		if (format(newDate, 'yyyy-MM') !== format(selectedDate, 'yyyy-MM')) {
			setSelectedDate(newDate);
			// Fetch data for the new month
			fetchAttendanceData();
		}
	};

	// Handle today click from MonthlyView
	const handleTodayClick = () => {
		const today = new Date();
		setViewDate(today);

		// Only update selectedDate and fetch if we're not already on today
		if (format(today, 'yyyy-MM-dd') !== format(selectedDate, 'yyyy-MM-dd')) {
			setSelectedDate(today);
			fetchAttendanceData();
		}
	};

	// Handle successful attendance recording
	const handleRecordSuccess = (response) => {
		setNotification({
			open: true,
			message: response.message || 'Attendance recorded successfully!',
			severity: 'success',
		});

		// Refresh data after successful recording
		fetchAttendanceData();
	};

	// Handle attendance recording error
	const handleRecordError = (error) => {
		setNotification({
			open: true,
			message: error.message || 'Failed to record attendance',
			severity: 'error',
		});
	};

	// Close notification
	const handleCloseNotification = () => {
		setNotification({ ...notification, open: false });
	};

	const handleSearch = async () => {
		if (!searchTerm.trim()) {
			fetchAttendanceData();
			return;
		}

		setLoading(true);
		try {
			const params = {
				companyId,
				period: activeTab === 0 ? 'day' : activeTab === 1 ? 'week' : 'month',
				date: formatDateForAPI(selectedDate),
				search: searchTerm.trim(), // Assuming API supports search parameter
			};

			const response = await filterAttendance(params);

			if (response.data.success) {
				const data = response.data.data?.attendance || [];
				setAttendanceData(data);
				calculateSummaryStats(data);
			}
		} catch (err) {
			// Fallback to client-side filtering
			const filtered = attendanceData.filter((item) => {
				const staff = item.staff || {};
				const searchLower = searchTerm.toLowerCase();
				return (
					staff.firstName?.toLowerCase().includes(searchLower) ||
					staff.lastName?.toLowerCase().includes(searchLower) ||
					staff.email?.toLowerCase().includes(searchLower) ||
					staff.department?.toLowerCase().includes(searchLower) ||
					item.staffId?.toLowerCase().includes(searchLower)
				);
			});
			setAttendanceData(filtered);
			calculateSummaryStats(filtered);
		} finally {
			setLoading(false);
		}
	};

	// Add debounced search effect
	useEffect(() => {
		const timer = setTimeout(() => {
			if (searchTerm.trim() !== '') {
				handleSearch();
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [searchTerm]);

	// Fetch data when date or tab changes
	useEffect(() => {
		fetchAttendanceData();
	}, [activeTab, companyId]);

	// Tab configuration
	const tabs = [
		{ label: 'Daily View', icon: <TodayIcon /> },
		{ label: 'Weekly View', icon: <ViewWeekIcon /> },
		{ label: 'Monthly View', icon: <CalendarMonthIcon /> },
	];

	// Get filtered data for display
	const filteredData = filterDataBySearch(attendanceData);

	return (
		<Box
			component="main"
			sx={{
				width: '100%',
				minHeight: '100vh',
				px: { xs: 2, sm: 4, md: 6 },
				py: 4,
				animation: 'fadeIn 0.5s ease-out',
				...pageAnimations,
			}}>
			{/* ========== ERROR ALERT ========== */}
			{error && (
				<Alert
					severity="error"
					sx={{
						mb: 3,
						animation: 'shake 0.3s ease-out',
						...pageAnimations,
					}}
					onClose={() => setError('')}>
					{error}
				</Alert>
			)}

			{/* ========== NOTIFICATION SNACKBAR ========== */}
			<Snackbar
				open={notification.open}
				autoHideDuration={6000}
				onClose={handleCloseNotification}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				sx={{
					'& .MuiPaper-root': {
						animation: 'slideInRight 0.3s ease-out',
						...pageAnimations,
					},
				}}>
				<Alert
					onClose={handleCloseNotification}
					severity={notification.severity}
					sx={{ width: '100%' }}>
					{notification.message}
				</Alert>
			</Snackbar>

			{/* ========== PAGE HEADER ========== */}
			<Box
				sx={{
					display: 'flex',
					flexDirection: { xs: 'column', md: 'row' },
					justifyContent: 'space-between',
					alignItems: { xs: 'flex-start', md: 'center' },
					gap: 2,
					mb: 4,
				}}>
				<Typography
					variant="h4"
					fontWeight={700}
					sx={{
						'color': '#fff',
						'position': 'relative',
						'animation': 'slideInLeft 0.4s ease-out',
						'&::after': {
							content: '""',
							position: 'absolute',
							bottom: -8,
							left: 0,
							width: '60px',
							height: '4px',
							background: 'linear-gradient(90deg, #2196f3, #64b5f6, #2196f3)',
							borderRadius: '2px',
							animation: 'shimmer 2s infinite',
							...pageAnimations,
						},
						...pageAnimations,
					}}>
					Attendance Management
				</Typography>

				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						alignItems: { sm: 'center' },
						justifyContent: { sm: 'flex-end' },
						gap: 2,
						width: { xs: '100%', md: 'auto' },
						animation: 'slideInRight 0.4s ease-out',
						...pageAnimations,
					}}>
					{['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role) && (
						<>
							<Button
								variant="contained"
								startIcon={<DownloadIcon sx={{ transition: 'transform 0.2s ease' }} />}
								onClick={handleExport}
								sx={{
									'height': 40,
									'px': 2,
									'borderRadius': 1,
									'backgroundColor': '#334155',
									'color': '#ffffff',
									'fontWeight': 700,
									'textTransform': 'none',
									'letterSpacing': '0.015em',
									'boxShadow': 'none',
									'transition': 'all 0.3s ease',
									'&:hover': {
										'backgroundColor': '#475569',
										'transform': 'scale(1.02) translateY(-2px)',
										'& .MuiSvgIcon-root': {
											transform: 'translateY(-2px)',
										},
									},
								}}>
								Export Report
							</Button>

							<Button
								variant="contained"
								startIcon={<PersonAddIcon sx={{ transition: 'transform 0.2s ease' }} />}
								onClick={() => setRecorderOpen(true)}
								sx={{
									'height': 40,
									'px': 2,
									'borderRadius': 1,
									'backgroundColor': '#2196f3',
									'color': '#ffffff',
									'fontWeight': 700,
									'textTransform': 'none',
									'letterSpacing': '0.015em',
									'boxShadow': 'none',
									'position': 'relative',
									'overflow': 'hidden',
									'transition': 'all 0.3s ease',
									'&::before': {
										content: '""',
										position: 'absolute',
										top: '50%',
										left: '50%',
										width: 0,
										height: 0,
										borderRadius: '50%',
										background: 'rgba(255,255,255,0.3)',
										transform: 'translate(-50%, -50%)',
										transition: 'width 0.6s ease, height 0.6s ease',
									},
									'&:hover': {
										'backgroundColor': '#1976d2',
										'transform': 'scale(1.02) translateY(-2px)',
										'& .MuiSvgIcon-root': {
											transform: 'rotate(90deg) scale(1.1)',
										},
										'&::before': {
											width: '200px',
											height: '200px',
										},
									},
								}}>
								Record Attendance
							</Button>
						</>
					)}
				</Box>
			</Box>

			{/* ========== ATTENDANCE RECORDER MODAL ========== */}
			<AttendanceRecorder
				open={recorderOpen}
				onClose={() => setRecorderOpen(false)}
				companyId={companyId}
				onSuccess={handleRecordSuccess}
				onError={handleRecordError}
			/>

			<AttendanceExport
				open={exportOpen}
				onClose={() => setExportOpen(false)}
				companyId={companyId}
				filters={activeFilters}
				onExport={handleActualExport}
			/>

			{/* ========== SUMMARY CARDS ========== */}
			<Box sx={{ animation: 'slideInUp 0.5s ease-out 0.1s both', ...pageAnimations }}>
				<SummaryCards
					stats={role === 'STAFF' ? staffStats : summaryStats}
					loading={cardsLoading}
					role={role}
					userData={user}
				/>
			</Box>

			{/* ========== FILTERS PAPER ========== */}
			<Paper
				elevation={0}
				sx={{
					'p': 2,
					'borderRadius': 2,
					'bgcolor': '#0f172a',
					'border': '1px solid rgba(255,255,255,0.08)',
					'mb': 3,
					'mt': 3,
					'animation': 'slideInUp 0.5s ease-out 0.2s both',
					'transition': 'all 0.3s ease',
					'&:hover': {
						transform: 'translateY(-2px)',
						boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
					},
					...pageAnimations,
				}}>
				<Stack
					direction={{ xs: 'column', md: 'column', lg: 'row' }}
					spacing={2}
					alignItems={{ md: 'stretch', lg: 'center' }}
					justifyContent="space-between">
					<Box sx={{ width: '100%', animation: 'slideInLeft 0.4s ease-out', ...pageAnimations }}>
						<DateNavigator
							selectedDate={selectedDate}
							onDateChange={handleDateChange}
							view={activeTab === 0 ? 'day' : activeTab === 1 ? 'week' : 'month'}
						/>
					</Box>

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1}
						sx={{
							width: '100%',
							animation: 'slideInRight 0.4s ease-out',
							...pageAnimations,
						}}>
						{['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role) && (
							<>
								<TextField
									placeholder="Search by name, department..."
									size="small"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									fullWidth
									InputProps={{
										startAdornment: (
											<InputAdornment position="start">
												<SearchIcon
													sx={{
														opacity: 0.5,
														color: 'rgba(255,255,255,0.5)',
														transition: 'transform 0.2s ease',
													}}
												/>
											</InputAdornment>
										),
										sx: {
											'bgcolor': '#222b3f',
											'borderRadius': 1,
											'transition': 'all 0.2s ease',
											'& .MuiOutlinedInput-notchedOutline': {
												borderColor: 'rgba(255,255,255,0.15)',
											},
											'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
												borderColor: '#2196f3',
											},
											'&:hover': {
												bgcolor: '#2a3a54',
											},
											'color': '#fff',
										},
									}}
									sx={{
										'flex': 1,
										'& .MuiInputBase-input::placeholder': {
											color: 'rgba(255,255,255,0.5)',
											opacity: 1,
										},
									}}
								/>

								<Button
									variant="outlined"
									startIcon={<FilterListIcon sx={{ transition: 'transform 0.2s ease' }} />}
									onClick={() => setFilterOpen(true)}
									sx={{
										'height': 40,
										'minWidth': { xs: '100%', sm: '100px' },
										'borderColor': activeFilters && Object.keys(activeFilters).length > 0 ? '#2196f3' : 'rgba(255,255,255,0.2)',
										'color': activeFilters && Object.keys(activeFilters).length > 0 ? '#2196f3' : '#fff',
										'transition': 'all 0.3s ease',
										'&:hover': {
											'borderColor': activeFilters && Object.keys(activeFilters).length > 0 ? '#1976d2' : 'rgba(255,255,255,0.3)',
											'transform': 'scale(1.02)',
											'& .MuiSvgIcon-root': {
												transform: 'rotate(90deg)',
											},
										},
									}}>
									Filters
									{activeFilters && Object.keys(activeFilters).length > 0 && (
										<Box
											sx={{
												ml: 1,
												width: 20,
												height: 20,
												borderRadius: '50%',
												bgcolor: '#2196f3',
												color: '#fff',
												fontSize: '0.75rem',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												animation: 'pulse-glow 2s infinite',
												...pageAnimations,
											}}>
											{Object.keys(activeFilters).length}
										</Box>
									)}
								</Button>
							</>
						)}
					</Stack>
				</Stack>
			</Paper>

			<AttendanceFilter
				open={filterOpen}
				onClose={() => setFilterOpen(false)}
				onApplyFilters={handleApplyFilters}
				companyId={companyId}
				initialFilters={activeFilters}
				departments={departments}
			/>

			{/* ========== VIEW TABS ========== */}
			<Paper
				elevation={0}
				sx={{
					'borderRadius': 2,
					'bgcolor': '#0f172a',
					'border': '1px solid rgba(255,255,255,0.08)',
					'mb': 3,
					'animation': 'slideInUp 0.5s ease-out 0.3s both',
					'transition': 'all 0.3s ease',
					'&:hover': {
						transform: 'translateY(-2px)',
						boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
					},
					...pageAnimations,
				}}>
				<Tabs
					value={activeTab}
					onChange={handleTabChange}
					variant="fullWidth"
					indicatorColor="primary"
					textColor="primary"
					sx={{
						'& .MuiTab-root': {
							'color': 'rgba(255,255,255,0.7)',
							'textTransform': 'none',
							'fontSize': '0.9rem',
							'fontWeight': 600,
							'transition': 'all 0.2s ease',
							'&:hover': {
								color: '#fff',
								transform: 'scale(1.05)',
							},
						},
						'& .Mui-selected': {
							color: '#2196f3',
						},
						'& .MuiTabs-indicator': {
							backgroundColor: '#2196f3',
						},
					}}>
					{tabs.map((tab, index) => (
						<Tab
							key={index}
							label={tab.label}
							icon={tab.icon}
							iconPosition="start"
							sx={{
								animation: `slideInUp 0.4s ease-out ${index * 0.1}s both`,
								...pageAnimations,
							}}
						/>
					))}
				</Tabs>
			</Paper>

			{/* ========== MAIN CONTENT AREA ========== */}
			<Box
				sx={{
					mt: 2,
					animation: 'fadeIn 0.5s ease-out 0.4s both',
					...pageAnimations,
				}}>
				{loading ? (
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'center',
							alignItems: 'center',
							minHeight: 400,
							bgcolor: '#162033',
							borderRadius: 2,
							border: '1px solid rgba(255,255,255,0.08)',
							animation: 'pulse-glow 2s infinite',
							...pageAnimations,
						}}>
						<CircularProgress
							sx={{
								'color': '#2196f3',
								'animation': 'spin 1s linear infinite, pulse-glow 1.5s infinite',
								'@keyframes spin': {
									'0%': { transform: 'rotate(0deg)' },
									'100%': { transform: 'rotate(360deg)' },
								},
								...pageAnimations,
							}}
						/>
					</Box>
				) : (
					<>
						{activeTab === 0 && (
							<Box sx={{ animation: 'fadeIn 0.4s ease-out', ...pageAnimations }}>
								<DailyView
									data={filteredData}
									date={selectedDate}
									companyId={companyId}
								/>
							</Box>
						)}
						{activeTab === 1 && (
							<Box sx={{ animation: 'fadeIn 0.4s ease-out', ...pageAnimations }}>
								<WeeklyView
									data={filteredData}
									date={viewDate}
									selectedDate={selectedDate}
									onDateChange={handleDateChange}
									onWeekChange={handleMonthChange}
									onTodayClick={handleTodayClick}
									companyId={companyId}
								/>
							</Box>
						)}
						{activeTab === 2 && (
							<Box sx={{ animation: 'fadeIn 0.4s ease-out', ...pageAnimations }}>
								<MonthlyView
									data={filteredData}
									date={viewDate}
									selectedDate={selectedDate}
									onDateChange={handleDateChange}
									onMonthChange={handleMonthChange}
									onTodayClick={handleTodayClick}
									companyId={companyId}
								/>
							</Box>
						)}
					</>
				)}
			</Box>
		</Box>
	);
};

const pageAnimations = {
	'@keyframes slideInUp': {
		'0%': {
			transform: 'translateY(40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateY(0)',
			opacity: 1,
		},
	},
	'@keyframes slideInDown': {
		'0%': {
			transform: 'translateY(-40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateY(0)',
			opacity: 1,
		},
	},
	'@keyframes slideInLeft': {
		'0%': {
			transform: 'translateX(-40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0)',
			opacity: 1,
		},
	},
	'@keyframes slideInRight': {
		'0%': {
			transform: 'translateX(40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0)',
			opacity: 1,
		},
	},
	'@keyframes fadeIn': {
		'0%': { opacity: 0 },
		'100%': { opacity: 1 },
	},
	'@keyframes scaleIn': {
		'0%': {
			transform: 'scale(0.9)',
			opacity: 0,
		},
		'100%': {
			transform: 'scale(1)',
			opacity: 1,
		},
	},
	'@keyframes float': {
		'0%': { transform: 'translateY(0px)' },
		'50%': { transform: 'translateY(-5px)' },
		'100%': { transform: 'translateY(0px)' },
	},
	'@keyframes pulse-glow': {
		'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
		'70%': { boxShadow: '0 0 0 10px rgba(33, 150, 243, 0)' },
		'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
	},
	'@keyframes shimmer': {
		'0%': { backgroundPosition: '-1000px 0' },
		'100%': { backgroundPosition: '1000px 0' },
	},
	'@keyframes shake': {
		'0%, 100%': { transform: 'translateX(0)' },
		'25%': { transform: 'translateX(-5px)' },
		'75%': { transform: 'translateX(5px)' },
	},
};

export default AttendanceDashboard;
