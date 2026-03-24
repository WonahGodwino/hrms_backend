// src/pages/payroll-engine/Reports/ReportsDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
	Box,
	Typography,
	Paper,
	Button,
	useTheme,
	CircularProgress,
	Alert,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Grid,
	Card,
	CardContent,
	CardActions,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	IconButton,
	Chip,
	Tabs,
	Tab,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SavingsIcon from '@mui/icons-material/Savings';
import HomeIcon from '@mui/icons-material/Home';
import BusinessIcon from '@mui/icons-material/Business';
import SecurityIcon from '@mui/icons-material/Security';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BlockIcon from '@mui/icons-material/Block';
import CloseIcon from '@mui/icons-material/Close';
import {
	getPayPeriods,
	getBankSchedule,
	getWithheldSchedule,
	getPAYESchedule,
	getPensionSchedule,
	getNHFSchedule,
	getITFSchedule,
	getNSITFSchedule,
	getCostCentreSummary,
	downloadReport,
} from '@/services/PayrollEngineService';
import { formatCurrency, PayPeriodStatusChip } from '@/components/payroll-engine';

const REPORT_TYPES = [
	{
		id: 'BANK_SCHEDULE',
		title: 'Bank Schedule',
		description: 'Net salary payments to employee bank accounts',
		icon: AccountBalanceIcon,
		color: '#3b82f6',
		fetchFn: getBankSchedule,
	},
	{
		id: 'WITHHELD_SALARIES',
		title: 'Withheld Schedule',
		description: 'Employees with withheld payments',
		icon: BlockIcon,
		color: '#ef4444',
		fetchFn: getWithheldSchedule,
	},
	{
		id: 'PAYE_SCHEDULE',
		title: 'PAYE Schedule',
		description: 'Pay As You Earn tax deductions for FIRS/LIRS',
		icon: ReceiptIcon,
		color: '#f59e0b',
		fetchFn: getPAYESchedule,
	},
	{
		id: 'PENSION_SCHEDULE',
		title: 'Pension Schedule',
		description: 'Employee & employer pension contributions',
		icon: SavingsIcon,
		color: '#22c55e',
		fetchFn: getPensionSchedule,
	},
	{
		id: 'NHF_SCHEDULE',
		title: 'NHF Schedule',
		description: 'National Housing Fund contributions',
		icon: HomeIcon,
		color: '#8b5cf6',
		fetchFn: getNHFSchedule,
	},
	{
		id: 'ITF_SCHEDULE',
		title: 'ITF Schedule',
		description: 'Industrial Training Fund (1% employer)',
		icon: BusinessIcon,
		color: '#06b6d4',
		fetchFn: getITFSchedule,
	},
	{
		id: 'NSITF_SCHEDULE',
		title: 'NSITF Schedule',
		description: 'Employee Compensation Scheme (1% employer)',
		icon: SecurityIcon,
		color: '#ec4899',
		fetchFn: getNSITFSchedule,
	},
	{
		id: 'COST_CENTRE_SUMMARY',
		title: 'Cost Centre Summary',
		description: 'Payroll breakdown by department',
		icon: AssessmentIcon,
		color: '#64748b',
		fetchFn: getCostCentreSummary,
	},
];

const ReportsDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// State
	const [periods, setPeriods] = useState([]);
	const [selectedPeriodId, setSelectedPeriodId] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Report Preview State
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewReport, setPreviewReport] = useState(null);
	const [previewData, setPreviewData] = useState(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [downloading, setDownloading] = useState({});

	// Fetch periods
	useEffect(() => {
		const fetchPeriods = async () => {
			try {
				const response = await getPayPeriods({ limit: 20 });
				const allPeriods = response.data?.data || [];
				setPeriods(allPeriods);
				// Select first period with computed payslips
				const computedPeriod = allPeriods.find(p => ['REVIEW', 'APPROVED', 'PAID'].includes(p.status));
				if (computedPeriod) {
					setSelectedPeriodId(computedPeriod.id || computedPeriod._id);
				} else if (allPeriods.length > 0) {
					setSelectedPeriodId(allPeriods[0].id || allPeriods[0]._id);
				}
			} catch (err) {
				console.error('Failed to fetch periods:', err);
				setError('Failed to load pay periods.');
			} finally {
				setLoading(false);
			}
		};
		fetchPeriods();
	}, []);

	const handlePreview = useCallback(async (reportType) => {
		if (!selectedPeriodId) {
			setError('Please select a pay period first.');
			return;
		}
		setPreviewReport(reportType);
		setPreviewOpen(true);
		setPreviewLoading(true);

		try {
			const response = await reportType.fetchFn(selectedPeriodId);
			setPreviewData(response.data?.data || response.data);
		} catch (err) {
			console.error('Failed to fetch report:', err);
			setError(`Failed to load ${reportType.title}.`);
			setPreviewData(null);
		} finally {
			setPreviewLoading(false);
		}
	}, [selectedPeriodId]);

	const handleDownload = useCallback(async (reportId) => {
		if (!selectedPeriodId) {
			setError('Please select a pay period first.');
			return;
		}

		setDownloading(prev => ({ ...prev, [reportId]: true }));

		try {
			const response = await downloadReport(selectedPeriodId, reportId);
			const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			const period = periods.find(p => (p.id || p._id) === selectedPeriodId);
			link.download = `${reportId}-${period?.periodName || selectedPeriodId}.xlsx`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to download report:', err);
			setError('Failed to download report.');
		} finally {
			setDownloading(prev => ({ ...prev, [reportId]: false }));
		}
	}, [selectedPeriodId, periods]);

	const handleClosePreview = () => {
		setPreviewOpen(false);
		setPreviewReport(null);
		setPreviewData(null);
	};

	const selectedPeriod = periods.find(p => (p.id || p._id) === selectedPeriodId);

	const renderPreviewContent = () => {
		if (previewLoading) {
			return (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
					<CircularProgress />
				</Box>
			);
		}

		if (!previewData) {
			return (
				<Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
					No data available for this report.
				</Typography>
			);
		}

		const reportId = previewReport?.id;

		// Bank Schedule
		if (reportId === 'BANK_SCHEDULE') {
			return (
				<Box>
					<Box sx={{ mb: 2, p: 2, bgcolor: isDarkMode ? '#0f172a' : '#f8fafc', borderRadius: 2 }}>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Total Records: <strong>{previewData.totals?.totalRecords || 0}</strong> | Total Amount: <strong style={{ color: '#22c55e' }}>{formatCurrency(previewData.totals?.totalAmount || 0)}</strong>
						</Typography>
					</Box>
					<TableContainer sx={{ maxHeight: 400 }}>
						<Table size="small" stickyHeader>
							<TableHead>
								<TableRow>
									<TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
									<TableCell sx={{ fontWeight: 600 }}>Bank</TableCell>
									<TableCell sx={{ fontWeight: 600 }}>Account No.</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Net Salary</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{(previewData.schedule || []).map((item, idx) => (
									<TableRow key={idx}>
										<TableCell>{item.employeeName}</TableCell>
										<TableCell>{item.bankName}</TableCell>
										<TableCell>{item.accountNumber}</TableCell>
										<TableCell align="right" sx={{ fontWeight: 600, color: '#22c55e' }}>{formatCurrency(item.netSalary)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</Box>
			);
		}

		// Withheld Schedule
		if (reportId === 'WITHHELD_SALARIES') {
			return (
				<TableContainer sx={{ maxHeight: 400 }}>
					<Table size="small" stickyHeader>
						<TableHead>
							<TableRow>
								<TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
								<TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
								<TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{(previewData.schedule || previewData || []).map((item, idx) => (
								<TableRow key={idx}>
									<TableCell>{item.employeeName || item.staffId?.fullName}</TableCell>
									<TableCell>{item.departmentName || '--'}</TableCell>
									<TableCell sx={{ color: '#ef4444' }}>{item.reason || 'No reason provided'}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			);
		}

		// PAYE Schedule
		if (reportId === 'PAYE_SCHEDULE') {
			return (
				<Box>
					<Box sx={{ mb: 2, p: 2, bgcolor: isDarkMode ? '#0f172a' : '#f8fafc', borderRadius: 2 }}>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Total Gross: <strong>{formatCurrency(previewData.totals?.totalGrossIncome || 0)}</strong> | Total PAYE: <strong style={{ color: '#ef4444' }}>{formatCurrency(previewData.totals?.totalPAYE || 0)}</strong>
						</Typography>
					</Box>
					<TableContainer sx={{ maxHeight: 400 }}>
						<Table size="small" stickyHeader>
							<TableHead>
								<TableRow>
									<TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
									<TableCell sx={{ fontWeight: 600 }}>TIN</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Gross Income</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">PAYE</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{(previewData.schedule || []).map((item, idx) => (
									<TableRow key={idx}>
										<TableCell>{item.employeeName}</TableCell>
										<TableCell>{item.tin || '--'}</TableCell>
										<TableCell align="right">{formatCurrency(item.grossIncome)}</TableCell>
										<TableCell align="right" sx={{ fontWeight: 600, color: '#ef4444' }}>{formatCurrency(item.paye)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</Box>
			);
		}

		// Pension Schedule
		if (reportId === 'PENSION_SCHEDULE') {
			return (
				<Box>
					<Box sx={{ mb: 2, p: 2, bgcolor: isDarkMode ? '#0f172a' : '#f8fafc', borderRadius: 2 }}>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Employee: <strong>{formatCurrency(previewData.totals?.totalEmployeeContribution || 0)}</strong> | Employer: <strong>{formatCurrency(previewData.totals?.totalEmployerContribution || 0)}</strong> | Total: <strong style={{ color: '#22c55e' }}>{formatCurrency(previewData.totals?.grandTotal || 0)}</strong>
						</Typography>
					</Box>
					<TableContainer sx={{ maxHeight: 400 }}>
						<Table size="small" stickyHeader>
							<TableHead>
								<TableRow>
									<TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
									<TableCell sx={{ fontWeight: 600 }}>PFA</TableCell>
									<TableCell sx={{ fontWeight: 600 }}>PIN</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Employee</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Employer</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Total</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{(previewData.schedule || []).map((item, idx) => (
									<TableRow key={idx}>
										<TableCell>{item.employeeName}</TableCell>
										<TableCell>{item.pfa}</TableCell>
										<TableCell>{item.pensionPin}</TableCell>
										<TableCell align="right">{formatCurrency(item.employeeContribution)}</TableCell>
										<TableCell align="right">{formatCurrency(item.employerContribution)}</TableCell>
										<TableCell align="right" sx={{ fontWeight: 600, color: '#22c55e' }}>{formatCurrency(item.totalContribution)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</Box>
			);
		}

		// NHF Schedule
		if (reportId === 'NHF_SCHEDULE') {
			return (
				<Box>
					<Box sx={{ mb: 2, p: 2, bgcolor: isDarkMode ? '#0f172a' : '#f8fafc', borderRadius: 2 }}>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Total NHF: <strong style={{ color: '#8b5cf6' }}>{formatCurrency(previewData.totals?.totalNHF || 0)}</strong>
						</Typography>
					</Box>
					<TableContainer sx={{ maxHeight: 400 }}>
						<Table size="small" stickyHeader>
							<TableHead>
								<TableRow>
									<TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Basic Salary</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">NHF (2.5%)</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{(previewData.schedule || []).map((item, idx) => (
									<TableRow key={idx}>
										<TableCell>{item.employeeName}</TableCell>
										<TableCell align="right">{formatCurrency(item.basicSalary)}</TableCell>
										<TableCell align="right" sx={{ fontWeight: 600, color: '#8b5cf6' }}>{formatCurrency(item.nhf)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</Box>
			);
		}

		// Cost Centre
		if (reportId === 'COST_CENTRE_SUMMARY') {
			return (
				<Box>
					<Box sx={{ mb: 2, p: 2, bgcolor: isDarkMode ? '#0f172a' : '#f8fafc', borderRadius: 2 }}>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Total Gross: <strong>{formatCurrency(previewData.grandTotals?.totalGross || 0)}</strong> | Total Deductions: <strong>{formatCurrency(previewData.grandTotals?.totalDeductions || 0)}</strong> | Total Net: <strong style={{ color: '#22c55e' }}>{formatCurrency(previewData.grandTotals?.totalNet || 0)}</strong>
						</Typography>
					</Box>
					<TableContainer sx={{ maxHeight: 400 }}>
						<Table size="small" stickyHeader>
							<TableHead>
								<TableRow>
									<TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="center">Employees</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Gross</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Deductions</TableCell>
									<TableCell sx={{ fontWeight: 600 }} align="right">Net</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{(previewData.departments || []).map((dept, idx) => (
									<TableRow key={idx}>
										<TableCell>{dept.departmentName}</TableCell>
										<TableCell align="center">{dept.employeeCount}</TableCell>
										<TableCell align="right">{formatCurrency(dept.totalGross)}</TableCell>
										<TableCell align="right" sx={{ color: '#ef4444' }}>{formatCurrency(dept.totalDeductions)}</TableCell>
										<TableCell align="right" sx={{ fontWeight: 600, color: '#22c55e' }}>{formatCurrency(dept.totalNet)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</Box>
			);
		}

		// Generic fallback for ITF/NSITF
		return (
			<TableContainer sx={{ maxHeight: 400 }}>
				<Table size="small" stickyHeader>
					<TableHead>
						<TableRow>
							<TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
							<TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{(previewData.schedule || previewData || []).map((item, idx) => (
							<TableRow key={idx}>
								<TableCell>{item.employeeName || item.name}</TableCell>
								<TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(item.amount || item.contribution || 0)}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>
		);
	};

	return (
		<Box sx={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: { xs: 2, sm: 3, lg: 4 }, backgroundColor: isDarkMode ? '#101922' : '#f6f7f8' }}>
			<Box sx={{ width: '100%', maxWidth: '1200px' }}>
				{error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

				<Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#ffffff', overflow: 'hidden' }}>
					{/* Header */}
					<Box sx={{ p: { xs: 3, md: 4 }, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}` }}>
						<Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
							<Box>
								<Typography variant="h4" sx={{ fontWeight: 900, fontSize: '1.875rem', color: isDarkMode ? '#ffffff' : '#0f172a', letterSpacing: '-0.025em', mb: 0.5 }}>
									Payroll Reports
								</Typography>
								<Typography variant="body1" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
									Generate and download statutory reports
								</Typography>
							</Box>
							<FormControl size="small" sx={{ minWidth: 220 }}>
								<InputLabel>Pay Period</InputLabel>
								<Select value={selectedPeriodId} label="Pay Period" onChange={(e) => setSelectedPeriodId(e.target.value)} sx={{ bgcolor: isDarkMode ? '#1e293b' : '#f8fafc' }}>
									{periods.map((p) => <MenuItem key={p.id || p._id} value={p.id || p._id}>{p.periodName}</MenuItem>)}
								</Select>
							</FormControl>
						</Box>

						{selectedPeriod && (
							<Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
								<PayPeriodStatusChip status={selectedPeriod.status} />
								{!['REVIEW', 'APPROVED', 'PAID'].includes(selectedPeriod.status) && (
									<Chip label="Reports not yet available" size="small" sx={{ bgcolor: '#f59e0b20', color: '#f59e0b', fontWeight: 600 }} />
								)}
							</Box>
						)}
					</Box>

					{/* Report Cards Grid */}
					<Box sx={{ p: { xs: 3, md: 4 } }}>
						{loading ? (
							<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
								<CircularProgress />
							</Box>
						) : (
							<Grid container spacing={3}>
								{REPORT_TYPES.map((report) => {
									const Icon = report.icon;
									const isDisabled = !selectedPeriod || !['REVIEW', 'APPROVED', 'PAID'].includes(selectedPeriod.status);

									return (
										<Grid item xs={12} sm={6} md={4} lg={3} key={report.id}>
											<Card
												elevation={0}
												sx={{
													height: '100%',
													borderRadius: 3,
													border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
													bgcolor: isDarkMode ? '#0f172a' : '#ffffff',
													opacity: isDisabled ? 0.5 : 1,
													transition: 'all 0.2s ease',
													'&:hover': isDisabled ? {} : {
														borderColor: report.color,
														transform: 'translateY(-4px)',
														boxShadow: isDarkMode ? '0 12px 32px rgba(0,0,0,0.4)' : '0 12px 32px rgba(0,0,0,0.1)',
													}
												}}
											>
												<CardContent sx={{ pb: 1 }}>
													<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
														<Box sx={{ p: 1.5, borderRadius: 2, bgcolor: `${report.color}15` }}>
															<Icon sx={{ color: report.color, fontSize: 24 }} />
														</Box>
													</Box>
													<Typography variant="subtitle1" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a', mb: 0.5 }}>
														{report.title}
													</Typography>
													<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', fontSize: '0.8rem' }}>
														{report.description}
													</Typography>
												</CardContent>
												<CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
													<Button
														size="small"
														startIcon={<VisibilityIcon />}
														onClick={() => handlePreview(report)}
														disabled={isDisabled}
														sx={{ color: report.color, fontWeight: 600, textTransform: 'none' }}
													>
														Preview
													</Button>
													<Button
														size="small"
														startIcon={downloading[report.id] ? <CircularProgress size={16} /> : <DownloadIcon />}
														onClick={() => handleDownload(report.id)}
														disabled={isDisabled || downloading[report.id]}
														sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 600, textTransform: 'none' }}
													>
														Download
													</Button>
												</CardActions>
											</Card>
										</Grid>
									);
								})}
							</Grid>
						)}
					</Box>
				</Paper>

				{/* Preview Dialog */}
				<Dialog
					open={previewOpen}
					onClose={handleClosePreview}
					maxWidth="md"
					fullWidth
					PaperProps={{
						sx: {
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							borderRadius: 3,
						}
					}}
				>
					<DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
							{previewReport && (
								<Box sx={{ p: 1, borderRadius: 1.5, bgcolor: `${previewReport.color}15` }}>
									{React.createElement(previewReport.icon, { sx: { color: previewReport.color, fontSize: 20 } })}
								</Box>
							)}
							<Typography variant="h6" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>
								{previewReport?.title} - {selectedPeriod?.periodName}
							</Typography>
						</Box>
						<IconButton onClick={handleClosePreview} size="small">
							<CloseIcon />
						</IconButton>
					</DialogTitle>
					<DialogContent sx={{ p: 3 }}>
						{renderPreviewContent()}
					</DialogContent>
					<DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
						<Button onClick={handleClosePreview} sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Close
						</Button>
						<Button
							variant="contained"
							startIcon={downloading[previewReport?.id] ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
							onClick={() => handleDownload(previewReport?.id)}
							disabled={downloading[previewReport?.id]}
							sx={{ bgcolor: '#137fec', fontWeight: 600, textTransform: 'none', '&:hover': { bgcolor: '#1d4ed8' } }}
						>
							Download Excel
						</Button>
					</DialogActions>
				</Dialog>
			</Box>
		</Box>
	);
};

export default ReportsDashboard;
