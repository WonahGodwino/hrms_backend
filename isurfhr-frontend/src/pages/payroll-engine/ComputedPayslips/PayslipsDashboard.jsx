// src/pages/payroll-engine/ComputedPayslips/PayslipsDashboard.jsx
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
	CircularProgress,
	Alert,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Chip,
	TextField,
	InputAdornment,
	Drawer,
	Divider,
	Grid,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { getPayPeriods, getPayslipsByPeriod, getSpecificPayslip } from '@/services/PayrollEngineService';
import { formatCurrency, PayPeriodStatusChip } from '@/components/payroll-engine';

const PAYMENT_STATUS_CONFIG = {
	PENDING: { label: 'Pending', color: '#f59e0b', bg: '#fef3c7' },
	ACTIVE: { label: 'Active', color: '#22c55e', bg: '#dcfce7' },
	WITHHELD: { label: 'Withheld', color: '#ef4444', bg: '#fee2e2' },
	PAID: { label: 'Paid', color: '#3b82f6', bg: '#dbeafe' },
};

const PayslipsDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Data State
	const [periods, setPeriods] = useState([]);
	const [selectedPeriodId, setSelectedPeriodId] = useState('');
	const [payslips, setPayslips] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Filter State
	const [statusFilter, setStatusFilter] = useState('all');
	const [searchQuery, setSearchQuery] = useState('');

	// Pagination
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const rowsPerPage = 10;

	// Drawer State
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [selectedPayslip, setSelectedPayslip] = useState(null);
	const [payslipLoading, setPayslipLoading] = useState(false);

	// Fetch periods
	useEffect(() => {
		const fetchPeriods = async () => {
			try {
				const response = await getPayPeriods({ limit: 20 });
				const allPeriods = response.data?.data || [];
				setPeriods(allPeriods);
				// Select first period with computed payslips (review/approved/paid)
				const computedPeriod = allPeriods.find(p => ['REVIEW', 'APPROVED', 'PAID'].includes(p.status));
				if (computedPeriod) {
					setSelectedPeriodId(computedPeriod.id || computedPeriod._id);
				} else if (allPeriods.length > 0) {
					setSelectedPeriodId(allPeriods[0].id || allPeriods[0]._id);
				}
			} catch (err) {
				console.error('Failed to fetch periods:', err);
			} finally {
				setLoading(false);
			}
		};
		fetchPeriods();
	}, []);

	// Fetch payslips when period changes
	useEffect(() => {
		const fetchPayslips = async () => {
			if (!selectedPeriodId) return;
			setLoading(true);
			try {
				const params = { page, limit: rowsPerPage };
				if (statusFilter !== 'all') params.paymentStatus = statusFilter;

				const response = await getPayslipsByPeriod(selectedPeriodId, params);
				setPayslips(response.data?.data || []);
				setTotalCount(response.data?.total || 0);
			} catch (err) {
				console.error('Failed to fetch payslips:', err);
				setError('Unable to load payslips.');
			} finally {
				setLoading(false);
			}
		};
		fetchPayslips();
	}, [selectedPeriodId, page, statusFilter]);

	const handleViewPayslip = useCallback(async (staffId) => {
		if (!selectedPeriodId || !staffId) return;
		setPayslipLoading(true);
		setDrawerOpen(true);
		try {
			const response = await getSpecificPayslip(selectedPeriodId, staffId);
			setSelectedPayslip(response.data?.data || response.data);
		} catch (err) {
			console.error('Failed to fetch payslip:', err);
			setError('Failed to load payslip details.');
		} finally {
			setPayslipLoading(false);
		}
	}, [selectedPeriodId]);

	const handleCloseDrawer = () => {
		setDrawerOpen(false);
		setSelectedPayslip(null);
	};

	const filteredPayslips = payslips.filter(p => {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			p.employeeName?.toLowerCase().includes(query) ||
			p.employeeEmail?.toLowerCase().includes(query) ||
			p.departmentName?.toLowerCase().includes(query)
		);
	});

	const getPaymentStatusChip = (status) => {
		const config = PAYMENT_STATUS_CONFIG[status] || PAYMENT_STATUS_CONFIG.PENDING;
		return (
			<Chip
				label={config.label}
				size="small"
				sx={{
					bgcolor: isDarkMode ? `${config.color}20` : config.bg,
					color: config.color,
					fontWeight: 600,
					fontSize: '0.7rem',
				}}
			/>
		);
	};

	const selectedPeriod = periods.find(p => (p.id || p._id) === selectedPeriodId);

	return (
		<Box sx={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: { xs: 2, sm: 3, lg: 4 }, backgroundColor: isDarkMode ? '#101922' : '#f6f7f8' }}>
			<Box sx={{ width: '100%', maxWidth: '1200px' }}>
				{error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

				{/* Summary Header */}
				{selectedPeriod && (
					<Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 3, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#ffffff' }}>
						<Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
							<Box>
								<Typography variant="h5" sx={{ fontWeight: 800, color: isDarkMode ? '#fff' : '#0f172a', mb: 0.5 }}>
									{selectedPeriod.periodName}
								</Typography>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<PayPeriodStatusChip status={selectedPeriod.status} />
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
										{totalCount} payslips
									</Typography>
								</Box>
							</Box>
						</Box>
					</Paper>
				)}

				<Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#ffffff', overflow: 'hidden' }}>
					{/* Header */}
					<Box sx={{ p: { xs: 3, md: 4 }, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}` }}>
						<Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
							<Box>
								<Typography variant="h4" sx={{ fontWeight: 900, fontSize: '1.875rem', color: isDarkMode ? '#ffffff' : '#0f172a', letterSpacing: '-0.025em', mb: 0.5 }}>
									Computed Payslips
								</Typography>
								<Typography variant="body1" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
									View and manage employee payslips
								</Typography>
							</Box>
						</Box>
					</Box>

					{/* Toolbar */}
					<Box sx={{ px: { xs: 3, md: 4 }, py: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
						<FormControl size="small" sx={{ minWidth: 200 }}>
							<InputLabel>Pay Period</InputLabel>
							<Select value={selectedPeriodId} label="Pay Period" onChange={(e) => setSelectedPeriodId(e.target.value)} sx={{ bgcolor: isDarkMode ? '#1e293b' : '#f8fafc' }}>
								{periods.map((p) => <MenuItem key={p.id || p._id} value={p.id || p._id}>{p.periodName}</MenuItem>)}
							</Select>
						</FormControl>
						<FormControl size="small" sx={{ minWidth: 140 }}>
							<InputLabel>Status</InputLabel>
							<Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)} sx={{ bgcolor: isDarkMode ? '#1e293b' : '#f8fafc' }}>
								<MenuItem value="all">All Status</MenuItem>
								<MenuItem value="ACTIVE">Active</MenuItem>
								<MenuItem value="WITHHELD">Withheld</MenuItem>
								<MenuItem value="PAID">Paid</MenuItem>
							</Select>
						</FormControl>
						<TextField
							size="small"
							placeholder="Search employee..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							InputProps={{
								startAdornment: (
									<InputAdornment position="start">
										<SearchIcon sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }} />
									</InputAdornment>
								),
							}}
							sx={{ minWidth: 200, bgcolor: isDarkMode ? '#1e293b' : '#f8fafc', borderRadius: 1 }}
						/>
						<Box sx={{ flex: 1 }} />
						<Tooltip title="Refresh">
							<IconButton onClick={() => setPage(1)} sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
								<RefreshIcon />
							</IconButton>
						</Tooltip>
					</Box>

					{/* Table */}
					<TableContainer>
						<Table sx={{ minWidth: 800 }}>
							<TableHead>
								<TableRow sx={{ bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc', borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
									{['Employee', 'Department', 'Gross Salary', 'Deductions', 'Net Salary', 'Status', 'Actions'].map((head) => (
										<TableCell key={head} sx={{ py: 2, px: 3, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: isDarkMode ? '#94a3b8' : '#64748b' }}>
											{head}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
								) : filteredPayslips.length === 0 ? (
									<TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No payslips found.</Typography></TableCell></TableRow>
								) : (
									filteredPayslips.map((item) => (
										<TableRow key={item.id || item._id} sx={{ '&:hover': { bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc' }, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}` }}>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Box>
													<Typography variant="body2" sx={{ fontWeight: 600, color: isDarkMode ? '#fff' : '#0f172a' }}>{item.employeeName || '--'}</Typography>
													<Typography variant="caption" sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }}>{item.employeeEmail}</Typography>
												</Box>
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{item.departmentName || '--'}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(item.grossSalary)}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', fontWeight: 600, color: '#ef4444' }}>{formatCurrency(item.totalDeductions)}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', fontWeight: 700, color: '#22c55e' }}>{formatCurrency(item.netSalary)}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>{getPaymentStatusChip(item.paymentStatus)}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Tooltip title="View Details">
													<IconButton size="small" onClick={() => handleViewPayslip(item.staffId)} sx={{ color: '#137fec' }}>
														<VisibilityIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{/* Pagination */}
					<Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
						<Pagination count={Math.ceil(totalCount / rowsPerPage) || 1} page={page} onChange={(e, v) => setPage(v)} renderItem={(item) => <PaginationItem slots={{ previous: ChevronLeftIcon, next: ChevronRightIcon }} {...item} />} />
					</Box>
				</Paper>

				{/* Payslip Detail Drawer */}
				<Drawer
					anchor="right"
					open={drawerOpen}
					onClose={handleCloseDrawer}
					PaperProps={{
						sx: {
							width: { xs: '100%', sm: 500 },
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						}
					}}
				>
					<Box sx={{ p: 3 }}>
						<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
							<Typography variant="h6" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>
								Payslip Details
							</Typography>
							<IconButton onClick={handleCloseDrawer}>
								<CloseIcon />
							</IconButton>
						</Box>

						{payslipLoading ? (
							<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
								<CircularProgress />
							</Box>
						) : selectedPayslip ? (
							<Box>
								{/* Employee Info */}
								<Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: isDarkMode ? '#0f172a' : '#f8fafc', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
									<Typography variant="subtitle2" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a', mb: 1 }}>{selectedPayslip.employeeName}</Typography>
									<Typography variant="caption" sx={{ display: 'block', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{selectedPayslip.employeeEmail}</Typography>
									<Typography variant="caption" sx={{ display: 'block', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{selectedPayslip.departmentName}</Typography>
								</Paper>

								{/* Earnings */}
								<Typography variant="overline" sx={{ fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#64748b', letterSpacing: '0.1em' }}>Earnings</Typography>
								<Paper elevation={0} sx={{ p: 2, mb: 3, mt: 1, borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
									<Grid container spacing={1}>
										<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Basic Salary</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.basicSalary)}</Typography></Grid>
										<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Housing Allowance</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.housingAllowance)}</Typography></Grid>
										<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Transport Allowance</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.transportAllowance)}</Typography></Grid>
										{parseFloat(selectedPayslip.dressingAllowance) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Dressing Allowance</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.dressingAllowance)}</Typography></Grid>
										</>)}
										{parseFloat(selectedPayslip.leaveAllowance) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Leave Allowance</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.leaveAllowance)}</Typography></Grid>
										</>)}
										{parseFloat(selectedPayslip.entertainmentAllowance) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Entertainment Allowance</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.entertainmentAllowance)}</Typography></Grid>
										</>)}
										{parseFloat(selectedPayslip.utilityAllowance) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Utility Allowance</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.utilityAllowance)}</Typography></Grid>
										</>)}
										{parseFloat(selectedPayslip.otherAllowances) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Other Allowances</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.otherAllowances)}</Typography></Grid>
										</>)}
										{parseFloat(selectedPayslip.overtimeEarnings) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Overtime Earnings</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#22c55e' }}>{formatCurrency(selectedPayslip.overtimeEarnings)}</Typography></Grid>
										</>)}
										{parseFloat(selectedPayslip.bonusKpi) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Bonus/KPI</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#22c55e' }}>{formatCurrency(selectedPayslip.bonusKpi)}</Typography></Grid>
										</>)}
									</Grid>
									<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
									<Grid container>
										<Grid item xs={8}><Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>Gross Salary</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'right', color: isDarkMode ? '#fff' : '#0f172a' }}>{formatCurrency(selectedPayslip.grossSalary)}</Typography></Grid>
									</Grid>
								</Paper>

								{/* Statutory Deductions */}
								<Typography variant="overline" sx={{ fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#64748b', letterSpacing: '0.1em' }}>Statutory Deductions</Typography>
								<Paper elevation={0} sx={{ p: 2, mb: 3, mt: 1, borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
									<Grid container spacing={1}>
										<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Pension (Employee)</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.pensionEmployee)}</Typography></Grid>
										<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>NHF (2.5%)</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.nhf)}</Typography></Grid>
										{parseFloat(selectedPayslip.nhis) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>NHIS</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.nhis)}</Typography></Grid>
										</>)}
										<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>PAYE Tax</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.monthlyPAYE)}</Typography></Grid>
									</Grid>
									<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
									<Grid container>
										<Grid item xs={8}><Typography variant="body2" sx={{ fontWeight: 600, color: isDarkMode ? '#94a3b8' : '#64748b' }}>Total Statutory</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.totalStatutoryDeductions)}</Typography></Grid>
									</Grid>
								</Paper>

								{/* Other Deductions */}
								{(parseFloat(selectedPayslip.unionDues) > 0 || parseFloat(selectedPayslip.cooperativeDeduction) > 0 || parseFloat(selectedPayslip.loanRepayment) > 0 || parseFloat(selectedPayslip.otherDeductions) > 0) && (
									<>
										<Typography variant="overline" sx={{ fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#64748b', letterSpacing: '0.1em' }}>Other Deductions</Typography>
										<Paper elevation={0} sx={{ p: 2, mb: 3, mt: 1, borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
											<Grid container spacing={1}>
												{parseFloat(selectedPayslip.unionDues) > 0 && (<>
													<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Union Dues</Typography></Grid>
													<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.unionDues)}</Typography></Grid>
												</>)}
												{parseFloat(selectedPayslip.cooperativeDeduction) > 0 && (<>
													<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Cooperative</Typography></Grid>
													<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.cooperativeDeduction)}</Typography></Grid>
												</>)}
												{parseFloat(selectedPayslip.loanRepayment) > 0 && (<>
													<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Loan Repayment</Typography></Grid>
													<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.loanRepayment)}</Typography></Grid>
												</>)}
												{parseFloat(selectedPayslip.otherDeductions) > 0 && (<>
													<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Other Deductions</Typography></Grid>
													<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.otherDeductions)}</Typography></Grid>
												</>)}
											</Grid>
										</Paper>
									</>
								)}

								{/* Total Deductions */}
								<Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: isDarkMode ? '#ef444410' : '#fee2e2', border: `1px solid #ef4444` }}>
									<Grid container>
										<Grid item xs={8}><Typography variant="body2" sx={{ fontWeight: 700, color: '#ef4444' }}>Total Deductions</Typography></Grid>
										<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'right', color: '#ef4444' }}>{formatCurrency(selectedPayslip.totalDeductions)}</Typography></Grid>
									</Grid>
								</Paper>

								{/* Net Salary */}
								<Paper elevation={0} sx={{ p: 3, borderRadius: 2, bgcolor: isDarkMode ? '#22c55e10' : '#dcfce7', border: `2px solid #22c55e` }}>
									<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
										<Typography variant="h6" sx={{ fontWeight: 700, color: '#22c55e' }}>Net Salary</Typography>
										<Typography variant="h5" sx={{ fontWeight: 800, color: '#22c55e' }}>{formatCurrency(selectedPayslip.netSalary)}</Typography>
									</Box>
								</Paper>

								{/* Bank Details */}
								<Typography variant="overline" sx={{ fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#64748b', letterSpacing: '0.1em', display: 'block', mt: 3 }}>Payment Details</Typography>
								<Paper elevation={0} sx={{ p: 2, mt: 1, borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mb: 0.5 }}>Bank: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.bankName || '--'}</strong></Typography>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mb: 0.5 }}>Account: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.accountNumber || '--'}</strong></Typography>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Name: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.accountName || '--'}</strong></Typography>
								</Paper>

								{/* Pension Details */}
								{(selectedPayslip.pensionFundAdministrator || selectedPayslip.pensionPin) && (
									<>
										<Typography variant="overline" sx={{ fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#64748b', letterSpacing: '0.1em', display: 'block', mt: 3 }}>Pension Details</Typography>
										<Paper elevation={0} sx={{ p: 2, mt: 1, borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
											<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mb: 0.5 }}>PFA: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.pensionFundAdministrator || '--'}</strong></Typography>
											<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mb: 0.5 }}>PIN: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.pensionPin || '--'}</strong></Typography>
											<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Employer Contribution: <strong style={{ color: '#22c55e' }}>{formatCurrency(selectedPayslip.pensionEmployer)}</strong></Typography>
										</Paper>
									</>
								)}
							</Box>
						) : (
							<Typography color="text.secondary">No payslip data available.</Typography>
						)}
					</Box>
				</Drawer>
			</Box>
		</Box>
	);
};

export default PayslipsDashboard;
