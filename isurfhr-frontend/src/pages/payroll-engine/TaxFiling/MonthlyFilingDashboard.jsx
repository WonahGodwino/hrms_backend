// src/pages/payroll-engine/TaxFiling/MonthlyFilingDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
	Box,
	Typography,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Button,
	Pagination,
	PaginationItem,
	useTheme,
	IconButton,
	Tooltip,
	Menu,
	MenuItem,
	ListItemIcon,
	ListItemText,
	CircularProgress,
	Alert,
	Select,
	FormControl,
	InputLabel,
	Chip,
	Card,
	CardContent,
	Grid,
	Snackbar,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import WarningIcon from '@mui/icons-material/Warning';
import PeopleIcon from '@mui/icons-material/People';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';

import {
	getMonthlyFilingSummary,
	generateMonthlySchedules,
	downloadStateSchedule,
	markScheduleAsFiled,
	FILING_STATUS,
} from '@/services/TaxFilingService';
import { getPayPeriods } from '@/services/PayrollEngineService';
import { useAuth } from '@/lib/context/AuthContext';
import MonthlyScheduleDetailsDrawer from './MonthlyScheduleDetailsDrawer';

const MonthlyFilingDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const { user } = useAuth();

	const companyId = user?.companyId || user?.company?.id;

	// Data State
	const [payPeriods, setPayPeriods] = useState([]);
	const [selectedPeriod, setSelectedPeriod] = useState(null);
	const [summary, setSummary] = useState(null);
	const [schedules, setSchedules] = useState([]);
	const [missingEmployees, setMissingEmployees] = useState([]);
	const [loading, setLoading] = useState(true);
	const [periodsLoading, setPeriodsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [generating, setGenerating] = useState(false);

	// Pagination
	const [page, setPage] = useState(1);
	const rowsPerPage = 10;

	// Menu State
	const [anchorEl, setAnchorEl] = useState(null);
	const [selectedSchedule, setSelectedSchedule] = useState(null);
	const openMenu = Boolean(anchorEl);

	// Drawer State
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

	// Snackbar State
	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

	// Fetch pay periods
	const fetchPayPeriods = useCallback(async () => {
		setPeriodsLoading(true);
		try {
			const response = await getPayPeriods({ limit: 24, status: '' });
			if (response.data) {
				const periods = response.data.data || [];
				setPayPeriods(periods);
				// Select the most recent period by default
				if (periods.length > 0 && !selectedPeriod) {
					setSelectedPeriod(periods[0]);
				}
			}
		} catch (err) {
			console.error('Failed to fetch pay periods:', err);
		} finally {
			setPeriodsLoading(false);
		}
	}, []);

	// Fetch monthly filing summary
	const fetchSummary = useCallback(async () => {
		if (!selectedPeriod || !companyId) return;

		setLoading(true);
		setError(null);
		try {
			const response = await getMonthlyFilingSummary(selectedPeriod.id, companyId);
			if (response.data?.success) {
				setSummary(response.data.data.summary || null);
				setSchedules(response.data.data.schedules || []);
				setMissingEmployees(response.data.data.missingEmployees || []);
			}
		} catch (err) {
			console.error('Failed to fetch monthly filing summary:', err);
			setError('Unable to load filing data. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [selectedPeriod, companyId]);

	useEffect(() => {
		fetchPayPeriods();
	}, [fetchPayPeriods]);

	useEffect(() => {
		if (selectedPeriod) {
			fetchSummary();
		}
	}, [selectedPeriod, fetchSummary]);

	// Handle generate schedules
	const handleGenerateSchedules = async () => {
		if (!selectedPeriod || !companyId) return;

		setGenerating(true);
		try {
			const response = await generateMonthlySchedules(selectedPeriod.id, companyId);
			if (response.data?.success) {
				setSnackbar({
					open: true,
					message: response.data.message || 'Schedules generated successfully',
					severity: 'success',
				});
				fetchSummary();
			}
		} catch (err) {
			console.error('Failed to generate schedules:', err);
			setSnackbar({
				open: true,
				message: err.response?.data?.message || 'Failed to generate schedules',
				severity: 'error',
			});
		} finally {
			setGenerating(false);
		}
	};

	// Handle download
	const handleDownload = async (schedule, format = 'xlsx') => {
		if (!selectedPeriod || !companyId) return;

		try {
			const response = await downloadStateSchedule(selectedPeriod.id, schedule.stateCode, format, companyId);
			const blob = new Blob([response.data], {
				type:
					format === 'xlsx'
						? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
						: 'text/csv',
			});
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `PAYE-Schedule-${schedule.stateCode}-${selectedPeriod.periodName}.${format}`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to download schedule:', err);
			setSnackbar({
				open: true,
				message: 'Failed to download schedule',
				severity: 'error',
			});
		}
	};

	// Handle mark as filed
	const handleMarkAsFiled = async (schedule) => {
		if (!selectedPeriod || !companyId) return;

		try {
			const response = await markScheduleAsFiled(selectedPeriod.id, schedule.stateCode, { companyId });
			if (response.data?.success) {
				setSnackbar({
					open: true,
					message: 'Schedule marked as filed',
					severity: 'success',
				});
				fetchSummary();
			}
		} catch (err) {
			console.error('Failed to mark as filed:', err);
			setSnackbar({
				open: true,
				message: 'Failed to mark schedule as filed',
				severity: 'error',
			});
		}
		handleCloseMenu();
	};

	// Handlers
	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleActionClick = (event, schedule) => {
		setAnchorEl(event.currentTarget);
		setSelectedSchedule(schedule);
	};

	const handleCloseMenu = () => {
		setAnchorEl(null);
	};

	const handleViewDetails = () => {
		handleCloseMenu();
		setDetailsDrawerOpen(true);
	};

	// Format currency
	const formatCurrency = (amount) => {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			minimumFractionDigits: 2,
		}).format(amount || 0);
	};

	// Get status chip
	const getStatusChip = (status) => {
		const statusConfig = {
			[FILING_STATUS.PENDING]: { color: 'default', label: 'Pending' },
			[FILING_STATUS.GENERATED]: { color: 'info', label: 'Generated' },
			[FILING_STATUS.FILED]: { color: 'success', label: 'Filed' },
			[FILING_STATUS.CONFIRMED]: { color: 'success', label: 'Confirmed' },
		};
		const config = statusConfig[status] || { color: 'default', label: status };
		return <Chip size="small" label={config.label} color={config.color} />;
	};

	// Paginate schedules
	const paginatedSchedules = schedules.slice((page - 1) * rowsPerPage, page * rowsPerPage);

	return (
		<Box
			sx={{
				minHeight: '100vh',
				width: '100%',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				p: { xs: 2, sm: 3, lg: 4 },
				backgroundColor: isDarkMode ? '#101922' : '#f6f7f8',
				fontFamily: '"Inter", sans-serif',
			}}>
			<Box sx={{ width: '100%', maxWidth: '1200px' }}>
				{error && (
					<Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}

				{/* Missing Employees Warning */}
				{missingEmployees.length > 0 && (
					<Alert
						severity="warning"
						icon={<WarningIcon />}
						sx={{ mb: 3 }}
						action={
							<Button color="inherit" size="small" href="/payroll-engine/tax-filing/profiles">
								Manage Profiles
							</Button>
						}>
						{missingEmployees.length} employee(s) are missing tax profiles and won't be included in PAYE
						schedules.
					</Alert>
				)}

				{/* Summary Cards */}
				{summary && (
					<Grid container spacing={3} sx={{ mb: 3 }}>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<AccountBalanceIcon sx={{ color: '#3b82f6', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											States
										</Typography>
									</Box>
									<Typography variant="h4" sx={{ fontWeight: 700 }}>
										{summary.totalStates || 0}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<PeopleIcon sx={{ color: '#22c55e', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											Employees
										</Typography>
									</Box>
									<Typography variant="h4" sx={{ fontWeight: 700 }}>
										{summary.totalEmployees || 0}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<AssessmentIcon sx={{ color: '#f59e0b', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											Total Tax
										</Typography>
									</Box>
									<Typography variant="h5" sx={{ fontWeight: 700, color: '#22c55e' }}>
										{formatCurrency(summary.totalTaxAmount)}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<WarningIcon sx={{ color: '#ef4444', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											Missing Profiles
										</Typography>
									</Box>
									<Typography variant="h4" sx={{ fontWeight: 700, color: summary.missingEmployeesCount > 0 ? '#ef4444' : 'inherit' }}>
										{summary.missingEmployeesCount || 0}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
					</Grid>
				)}

				{/* Main Paper */}
				<Paper
					elevation={0}
					sx={{
						borderRadius: 3,
						border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						overflow: 'hidden',
					}}>
					{/* Header */}
					<Box
						sx={{
							p: { xs: 3, md: 4 },
							borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`,
						}}>
						<Box
							sx={{
								display: 'flex',
								flexDirection: { xs: 'column', md: 'row' },
								justifyContent: 'space-between',
								alignItems: { xs: 'flex-start', md: 'center' },
								gap: 2,
							}}>
							<Box>
								<Typography
									variant="h4"
									sx={{
										fontWeight: 900,
										fontSize: '1.875rem',
										color: isDarkMode ? '#ffffff' : '#0f172a',
									}}>
									Monthly PAYE Filing
								</Typography>
								<Typography variant="body1" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
									Generate and file monthly PAYE schedules by state
								</Typography>
							</Box>

							<Button
								variant="contained"
								startIcon={generating ? <CircularProgress size={20} color="inherit" /> : <AutorenewIcon />}
								onClick={handleGenerateSchedules}
								disabled={generating || !selectedPeriod}
								sx={{
									bgcolor: '#137fec',
									'&:hover': { bgcolor: '#1d4ed8' },
									'&:disabled': { bgcolor: '#94a3b8' },
								}}>
								{generating ? 'Generating...' : 'Generate Schedules'}
							</Button>
						</Box>
					</Box>

					{/* Toolbar */}
					<Box sx={{ px: { xs: 3, md: 4 }, py: 2 }}>
						<Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
							{/* Period Select */}
							<FormControl size="small" sx={{ minWidth: 200 }}>
								<InputLabel>Pay Period</InputLabel>
								<Select
									value={selectedPeriod?.id || ''}
									label="Pay Period"
									onChange={(e) => {
										const period = payPeriods.find((p) => p.id === e.target.value);
										setSelectedPeriod(period);
									}}
									disabled={periodsLoading}
									sx={{
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
									}}>
									{payPeriods.map((period) => (
										<MenuItem key={period.id} value={period.id}>
											{period.periodName}
										</MenuItem>
									))}
								</Select>
							</FormControl>

							{selectedPeriod && (
								<Chip
									label={selectedPeriod.status}
									color={selectedPeriod.status === 'PAID' ? 'success' : 'info'}
									variant="outlined"
								/>
							)}

							<Box sx={{ flex: 1 }} />

							<Tooltip title="Refresh">
								<IconButton onClick={fetchSummary}>
									<RefreshIcon />
								</IconButton>
							</Tooltip>
						</Box>
					</Box>

					{/* Table */}
					<TableContainer>
						<Table sx={{ minWidth: 800 }}>
							<TableHead>
								<TableRow
									sx={{
										bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
										borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									{['State', 'IRS', 'Employees', 'Gross Income', 'Tax Amount', 'Status', 'Actions'].map(
										(head) => (
											<TableCell
												key={head}
												align={head === 'Actions' ? 'right' : 'left'}
												sx={{
													py: 2,
													px: 3,
													fontSize: '0.75rem',
													fontWeight: 600,
													textTransform: 'uppercase',
													color: isDarkMode ? '#94a3b8' : '#64748b',
												}}>
												{head}
											</TableCell>
										)
									)}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={7} align="center" sx={{ py: 6 }}>
											<CircularProgress size={30} />
											<Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
												Loading schedules...
											</Typography>
										</TableCell>
									</TableRow>
								) : paginatedSchedules.length === 0 ? (
									<TableRow>
										<TableCell colSpan={7} align="center" sx={{ py: 6 }}>
											<Typography variant="body1" sx={{ color: 'text.secondary' }}>
												{selectedPeriod
													? 'No schedules generated. Click "Generate Schedules" to create PAYE schedules.'
													: 'Select a pay period to view schedules.'}
											</Typography>
										</TableCell>
									</TableRow>
								) : (
									paginatedSchedules.map((schedule) => (
										<TableRow
											key={schedule.id || schedule.stateCode}
											sx={{
												'&:hover': {
													bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
												},
											}}>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Typography variant="body2" sx={{ fontWeight: 600 }}>
													{schedule.stateName}
												</Typography>
												<Typography variant="caption" color="text.secondary">
													{schedule.stateCode}
												</Typography>
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{schedule.stateIrs}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{schedule.totalEmployees || 0}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{formatCurrency(schedule.totalGrossIncome)}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', fontWeight: 600, color: '#22c55e' }}>
												{formatCurrency(schedule.totalTaxAmount)}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{getStatusChip(schedule.status)}
											</TableCell>
											<TableCell align="right" sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<IconButton size="small" onClick={(e) => handleActionClick(e, schedule)}>
													<MoreVertIcon fontSize="small" />
												</IconButton>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{/* Pagination */}
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							flexDirection: { xs: 'column', sm: 'row' },
							p: 2,
							px: 3,
							borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
						}}>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Showing {paginatedSchedules.length} of {schedules.length} schedules
						</Typography>
						<Pagination
							count={Math.ceil(schedules.length / rowsPerPage) || 1}
							page={page}
							onChange={handlePageChange}
							renderItem={(item) => (
								<PaginationItem slots={{ previous: ChevronLeftIcon, next: ChevronRightIcon }} {...item} />
							)}
						/>
					</Box>
				</Paper>

				{/* Actions Menu */}
				<Menu
					anchorEl={anchorEl}
					open={openMenu}
					onClose={handleCloseMenu}
					PaperProps={{
						sx: {
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							borderRadius: 2,
							minWidth: 180,
						},
					}}>
					<MenuItem onClick={handleViewDetails}>
						<ListItemIcon>
							<VisibilityIcon fontSize="small" />
						</ListItemIcon>
						<ListItemText primary="View Details" />
					</MenuItem>
					<MenuItem onClick={() => handleDownload(selectedSchedule, 'xlsx')}>
						<ListItemIcon>
							<DownloadIcon fontSize="small" sx={{ color: '#3b82f6' }} />
						</ListItemIcon>
						<ListItemText primary="Download Excel" />
					</MenuItem>
					<MenuItem onClick={() => handleDownload(selectedSchedule, 'csv')}>
						<ListItemIcon>
							<DownloadIcon fontSize="small" sx={{ color: '#22c55e' }} />
						</ListItemIcon>
						<ListItemText primary="Download CSV" />
					</MenuItem>
					{selectedSchedule?.status === FILING_STATUS.GENERATED && (
						<MenuItem onClick={() => handleMarkAsFiled(selectedSchedule)}>
							<ListItemIcon>
								<CheckCircleIcon fontSize="small" sx={{ color: '#22c55e' }} />
							</ListItemIcon>
							<ListItemText primary="Mark as Filed" />
						</MenuItem>
					)}
				</Menu>

				{/* Details Drawer */}
				<MonthlyScheduleDetailsDrawer
					open={detailsDrawerOpen}
					onClose={() => {
						setDetailsDrawerOpen(false);
						setSelectedSchedule(null);
					}}
					periodId={selectedPeriod?.id}
					stateCode={selectedSchedule?.stateCode}
					companyId={companyId}
				/>

				{/* Snackbar */}
				<Snackbar
					open={snackbar.open}
					autoHideDuration={6000}
					onClose={() => setSnackbar({ ...snackbar, open: false })}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
					<Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
						{snackbar.message}
					</Alert>
				</Snackbar>
			</Box>
		</Box>
	);
};

export default MonthlyFilingDashboard;
