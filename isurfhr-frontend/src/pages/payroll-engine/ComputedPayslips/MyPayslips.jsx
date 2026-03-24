// src/pages/payroll-engine/ComputedPayslips/MyPayslips.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
	Box,
	Typography,
	Paper,
	CircularProgress,
	Alert,
	Chip,
	Drawer,
	Divider,
	Grid,
	IconButton,
	useTheme,
	Card,
	CardContent,
	CardActionArea,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { getMyPayslips, getSpecificPayslip } from '@/services/PayrollEngineService';
import { formatCurrency } from '@/components/payroll-engine';

const PAYMENT_STATUS_CONFIG = {
	PENDING: { label: 'Pending', color: '#f59e0b', bg: '#fef3c7' },
	ACTIVE: { label: 'Active', color: '#22c55e', bg: '#dcfce7' },
	WITHHELD: { label: 'Withheld', color: '#ef4444', bg: '#fee2e2' },
	PAID: { label: 'Paid', color: '#3b82f6', bg: '#dbeafe' },
};

const MyPayslips = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Data State
	const [payslips, setPayslips] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Drawer State
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [selectedPayslip, setSelectedPayslip] = useState(null);
	const [payslipLoading, setPayslipLoading] = useState(false);

	// Fetch own payslips
	useEffect(() => {
		const fetchPayslips = async () => {
			setLoading(true);
			try {
				const response = await getMyPayslips();
				setPayslips(response.data?.payslips || response.data?.data || []);
			} catch (err) {
				console.error('Failed to fetch payslips:', err);
				setError('Unable to load your payslips.');
			} finally {
				setLoading(false);
			}
		};
		fetchPayslips();
	}, []);

	const handleViewPayslip = useCallback(async (periodId, staffId) => {
		if (!periodId) return;
		setPayslipLoading(true);
		setDrawerOpen(true);
		try {
			const response = await getSpecificPayslip(periodId, staffId);
			setSelectedPayslip(response.data?.data || response.data);
		} catch (err) {
			console.error('Failed to fetch payslip:', err);
			setError('Failed to load payslip details.');
		} finally {
			setPayslipLoading(false);
		}
	}, []);

	const handleCloseDrawer = () => {
		setDrawerOpen(false);
		setSelectedPayslip(null);
	};

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

	return (
		<Box sx={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: { xs: 2, sm: 3, lg: 4 }, backgroundColor: isDarkMode ? '#101922' : '#f6f7f8' }}>
			<Box sx={{ width: '100%', maxWidth: '1000px' }}>
				{error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

				{/* Header */}
				<Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, mb: 3, borderRadius: 3, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#ffffff' }}>
					<Typography variant="h4" sx={{ fontWeight: 900, fontSize: '1.875rem', color: isDarkMode ? '#ffffff' : '#0f172a', letterSpacing: '-0.025em', mb: 0.5 }}>
						My Payslips
					</Typography>
					<Typography variant="body1" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
						View your payslip history
					</Typography>
				</Paper>

				{/* Payslips Grid */}
				{loading ? (
					<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
						<CircularProgress />
					</Box>
				) : payslips.length === 0 ? (
					<Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: 3, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#ffffff' }}>
						<CalendarTodayIcon sx={{ fontSize: 48, color: isDarkMode ? '#64748b' : '#94a3b8', mb: 2 }} />
						<Typography variant="h6" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>No Payslips Found</Typography>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#64748b' : '#94a3b8', mt: 1 }}>Your payslips will appear here once payroll is processed.</Typography>
					</Paper>
				) : (
					<Grid container spacing={2}>
						{payslips.map((payslip) => (
							<Grid item xs={12} sm={6} md={4} key={payslip.id || payslip._id}>
								<Card
									elevation={0}
									sx={{
										borderRadius: 3,
										border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
										transition: 'all 0.2s ease',
										'&:hover': {
											borderColor: '#137fec',
											transform: 'translateY(-2px)',
											boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.3)' : '0 8px 24px rgba(0,0,0,0.1)',
										}
									}}
								>
									<CardActionArea onClick={() => handleViewPayslip(payslip.payPeriodId, payslip.staffId)}>
										<CardContent sx={{ p: 3 }}>
											<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
												<Box>
													<Typography variant="h6" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a', mb: 0.5 }}>
														{payslip.periodName || payslip.payPeriodId?.periodName || '--'}
													</Typography>
													{getPaymentStatusChip(payslip.paymentStatus)}
												</Box>
												<IconButton size="small" sx={{ color: '#137fec' }}>
													<VisibilityIcon fontSize="small" />
												</IconButton>
											</Box>

											<Divider sx={{ my: 2, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />

											<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
												<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Gross</Typography>
												<Typography variant="body2" sx={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(payslip.grossSalary)}</Typography>
											</Box>
											<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
												<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Deductions</Typography>
												<Typography variant="body2" sx={{ fontWeight: 600, color: '#ef4444' }}>{formatCurrency(payslip.totalDeductions)}</Typography>
											</Box>

											<Divider sx={{ my: 2, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />

											<Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
												<Typography variant="body1" sx={{ fontWeight: 700, color: '#22c55e' }}>Net Salary</Typography>
												<Typography variant="body1" sx={{ fontWeight: 800, color: '#22c55e' }}>{formatCurrency(payslip.netSalary)}</Typography>
											</Box>
										</CardContent>
									</CardActionArea>
								</Card>
							</Grid>
						))}
					</Grid>
				)}

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
								{/* Period Info */}
								<Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: isDarkMode ? '#0f172a' : '#f8fafc', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
									<Typography variant="subtitle2" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a', mb: 0.5 }}>{selectedPayslip.periodName || 'Payslip'}</Typography>
									<Typography variant="caption" sx={{ display: 'block', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{selectedPayslip.employeeName}</Typography>
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
										{parseFloat(selectedPayslip.otherAllowances) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Other Allowances</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{formatCurrency(selectedPayslip.otherAllowances)}</Typography></Grid>
										</>)}
										{parseFloat(selectedPayslip.overtimeEarnings) > 0 && (<>
											<Grid item xs={8}><Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Overtime Earnings</Typography></Grid>
											<Grid item xs={4}><Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', color: '#22c55e' }}>{formatCurrency(selectedPayslip.overtimeEarnings)}</Typography></Grid>
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
								</Paper>

								{/* Other Deductions */}
								{(parseFloat(selectedPayslip.unionDues) > 0 || parseFloat(selectedPayslip.cooperativeDeduction) > 0 || parseFloat(selectedPayslip.loanRepayment) > 0) && (
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
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mb: 0.5 }}>Bank: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.bankName}</strong></Typography>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mb: 0.5 }}>Account: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.accountNumber}</strong></Typography>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Name: <strong style={{ color: isDarkMode ? '#fff' : '#0f172a' }}>{selectedPayslip.accountName}</strong></Typography>
								</Paper>
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

export default MyPayslips;
