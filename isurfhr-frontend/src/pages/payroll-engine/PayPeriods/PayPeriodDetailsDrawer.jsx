// src/pages/payroll-engine/PayPeriods/PayPeriodDetailsDrawer.jsx
import React, { useState, useEffect } from 'react';
import {
	Drawer,
	Box,
	Typography,
	IconButton,
	Button,
	Divider,
	CircularProgress,
	Alert,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	FormControlLabel,
	Checkbox,
	useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import CalculateIcon from '@mui/icons-material/Calculate';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PaidIcon from '@mui/icons-material/Paid';
import {
	getPayPeriodById,
	getPayrollSummary,
	openValidation,
	closeValidation,
	computePayroll,
	approvePayroll,
	markPayrollAsPaid,
} from '@/services/PayrollEngineService';
import {
	PayPeriodStatusChip,
	PayrollStatsCards,
	WorkflowProgressBar,
	formatCurrency,
} from '@/components/payroll-engine';

const PayPeriodDetailsDrawer = ({ open, onClose, period, onActionComplete }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// State
	const [periodDetails, setPeriodDetails] = useState(null);
	const [summary, setSummary] = useState(null);
	const [loading, setLoading] = useState(false);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState(null);
	const [successMessage, setSuccessMessage] = useState(null);

	// Compute Dialog State
	const [computeDialogOpen, setComputeDialogOpen] = useState(false);
	const [nhisApplicable, setNhisApplicable] = useState(true);

	// Confirm Dialog State
	const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, title: '', message: '' });

	// Get period ID (handle both 'id' and '_id' field names)
	const getPeriodId = () => period?.id || period?._id;

	// Fetch period details
	useEffect(() => {
		const fetchDetails = async () => {
			const periodId = getPeriodId();
			if (!open || !periodId) return;

			setLoading(true);
			setError(null);

			try {
				const [detailsRes, summaryRes] = await Promise.all([
					getPayPeriodById(periodId),
					getPayrollSummary(periodId).catch(() => null),
				]);

				if (detailsRes.data) {
					setPeriodDetails(detailsRes.data);
				}

				if (summaryRes?.data) {
					setSummary(summaryRes.data);
				}
			} catch (err) {
				console.error('Failed to fetch period details:', err);
				setError('Failed to load period details.');
			} finally {
				setLoading(false);
			}
		};

		fetchDetails();
	}, [open, period?.id, period?._id]);

	// Action handlers
	const handleOpenValidation = async () => {
		setActionLoading(true);
		setError(null);

		try {
			const response = await openValidation(getPeriodId());
			setSuccessMessage(response.data?.message || 'Validation window opened successfully.');
			setTimeout(() => {
				onActionComplete();
			}, 1500);
		} catch (err) {
			console.error('Failed to open validation:', err);
			setError(err.response?.data?.message || 'Failed to open validation window.');
		} finally {
			setActionLoading(false);
		}
	};

	const handleCloseValidation = async () => {
		setActionLoading(true);
		setError(null);

		try {
			await closeValidation(getPeriodId());
			setSuccessMessage('Validation window closed successfully.');
			setTimeout(() => {
				onActionComplete();
			}, 1500);
		} catch (err) {
			console.error('Failed to close validation:', err);
			setError(err.response?.data?.message || 'Failed to close validation window.');
		} finally {
			setActionLoading(false);
		}
	};

	const handleComputePayroll = async () => {
		setComputeDialogOpen(false);
		setActionLoading(true);
		setError(null);

		try {
			const response = await computePayroll(getPeriodId(), { nhisApplicable });
			const data = response.data;
			setSuccessMessage(
				`Payroll computed successfully! ${data.activePayments} active, ${data.withheldPayments} withheld.`
			);
			setTimeout(() => {
				onActionComplete();
			}, 2000);
		} catch (err) {
			console.error('Failed to compute payroll:', err);
			setError(err.response?.data?.message || 'Failed to compute payroll.');
		} finally {
			setActionLoading(false);
		}
	};

	const handleApprovePayroll = async () => {
		setConfirmDialog({ ...confirmDialog, open: false });
		setActionLoading(true);
		setError(null);

		try {
			await approvePayroll(getPeriodId());
			setSuccessMessage('Payroll approved successfully!');
			setTimeout(() => {
				onActionComplete();
			}, 1500);
		} catch (err) {
			console.error('Failed to approve payroll:', err);
			setError(err.response?.data?.message || 'Failed to approve payroll.');
		} finally {
			setActionLoading(false);
		}
	};

	const handleMarkAsPaid = async () => {
		setConfirmDialog({ ...confirmDialog, open: false });
		setActionLoading(true);
		setError(null);

		try {
			await markPayrollAsPaid(getPeriodId());
			setSuccessMessage('Payroll marked as paid! Payment completed.');
			setTimeout(() => {
				onActionComplete();
			}, 1500);
		} catch (err) {
			console.error('Failed to mark payroll as paid:', err);
			setError(err.response?.data?.message || 'Failed to mark payroll as paid.');
		} finally {
			setActionLoading(false);
		}
	};

	const confirmAction = (action, title, message) => {
		setConfirmDialog({ open: true, action, title, message });
	};

	const executeConfirmedAction = () => {
		const { action } = confirmDialog;
		setConfirmDialog({ ...confirmDialog, open: false });

		switch (action) {
			case 'openValidation':
				handleOpenValidation();
				break;
			case 'closeValidation':
				handleCloseValidation();
				break;
			case 'approve':
				handleApprovePayroll();
				break;
			case 'markPaid':
				handleMarkAsPaid();
				break;
			default:
				break;
		}
	};

	// Format date
	const formatDate = (dateString) => {
		if (!dateString) return '--';
		return new Date(dateString).toLocaleDateString('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	// Build stats for display
	const buildStats = () => {
		if (!summary) return [];

		// Handle both nested (summary.data) and flat response structures
		const data = summary.data || summary;

		return [
			{
				title: 'Total Employees',
				value: data.totalStaff || data.totalEmployees || 0,
				icon: 'users',
				color: 'primary',
			},
			{
				title: 'Active Payments',
				value: data.activeCount || data.activePayments || 0,
				icon: 'userCheck',
				color: 'success',
			},
			{
				title: 'Withheld',
				value: data.withheldCount || data.withheldPayments || 0,
				icon: 'userX',
				color: 'error',
			},
			{
				title: 'Net Salary',
				value: data.totalNet || data.totals?.netSalary || 0,
				icon: 'wallet',
				color: 'info',
				isCurrency: true,
			},
		];
	};

	const currentStatus = periodDetails?.status || period?.status || 'DRAFT';

	return (
		<>
			<Drawer
				anchor="right"
				open={open}
				onClose={onClose}
				PaperProps={{
					sx: {
						width: { xs: '100%', sm: 480 },
						bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
					},
				}}>
				{/* Header */}
				<Box
					sx={{
						p: 3,
						bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					}}>
					<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
						<Box>
							<Typography variant="h6" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>
								{periodDetails?.periodName || period?.periodName || 'Pay Period'}
							</Typography>
							<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mt: 0.5 }}>
								{formatDate(periodDetails?.startDate || period?.startDate)} -{' '}
								{formatDate(periodDetails?.endDate || period?.endDate)}
							</Typography>
						</Box>
						<IconButton onClick={onClose}>
							<CloseIcon sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
						</IconButton>
					</Box>

					<Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
						<PayPeriodStatusChip status={currentStatus} isDarkMode={isDarkMode} />
					</Box>
				</Box>

				{/* Content */}
				<Box sx={{ p: 3, overflowY: 'auto', flex: 1 }}>
					{/* Messages */}
					{error && (
						<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
							{error}
						</Alert>
					)}
					{successMessage && (
						<Alert severity="success" sx={{ mb: 2 }}>
							{successMessage}
						</Alert>
					)}

					{loading ? (
						<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<>
							{/* Workflow Progress */}
							<Box sx={{ mb: 4 }}>
								<Typography
									variant="subtitle2"
									sx={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#334155', mb: 2 }}>
									Workflow Progress
								</Typography>
								<WorkflowProgressBar currentStatus={currentStatus} isDarkMode={isDarkMode} />
							</Box>

							{/* Stats */}
							{summary && (
								<Box sx={{ mb: 4 }}>
									<Typography
										variant="subtitle2"
										sx={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#334155', mb: 2 }}>
										Payroll Summary
									</Typography>
									<PayrollStatsCards stats={buildStats()} columns={2} isDarkMode={isDarkMode} />
								</Box>
							)}

							{/* Period Details */}
							<Box sx={{ mb: 4 }}>
								<Typography
									variant="subtitle2"
									sx={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#334155', mb: 2 }}>
									Period Details
								</Typography>
								<Box
									sx={{
										p: 2,
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
										border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									<DetailRow
										label="Standard Monthly Hours"
										value={periodDetails?.standardMonthlyHours || 176}
										isDarkMode={isDarkMode}
									/>
									<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
									<DetailRow
										label="Validation Window"
										value={`${formatDate(periodDetails?.validationWindowStart)} - ${formatDate(periodDetails?.validationWindowEnd)}`}
										isDarkMode={isDarkMode}
									/>
									<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
									<DetailRow
										label="Created By"
										value={periodDetails?.createdBy?.fullName || '--'}
										isDarkMode={isDarkMode}
									/>
									<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
									<DetailRow
										label="Created At"
										value={formatDate(periodDetails?.createdAt)}
										isDarkMode={isDarkMode}
									/>
								</Box>
							</Box>

							{/* Financial Summary */}
							{summary && (
								<Box sx={{ mb: 4 }}>
									<Typography
										variant="subtitle2"
										sx={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#334155', mb: 2 }}>
										Financial Summary
									</Typography>
									{(() => {
										const data = summary.data || summary;
										return (
											<Box
												sx={{
													p: 2,
													borderRadius: 2,
													bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
													border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
												}}>
												<DetailRow
													label="Gross Salary"
													value={formatCurrency(data.totalGross || data.totals?.grossSalary || 0)}
													isDarkMode={isDarkMode}
												/>
												<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
												<DetailRow
													label="Total PAYE"
													value={formatCurrency(data.totalPAYE || data.totals?.totalPAYE || 0)}
													isDarkMode={isDarkMode}
													valueColor="#ef4444"
												/>
												<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
												<DetailRow
													label="Total Pension"
													value={formatCurrency(data.totalPension || data.totals?.totalPension || 0)}
													isDarkMode={isDarkMode}
													valueColor="#ef4444"
												/>
												<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
												<DetailRow
													label="Total NHF"
													value={formatCurrency(data.totalNHF || data.totals?.totalNHF || 0)}
													isDarkMode={isDarkMode}
													valueColor="#ef4444"
												/>
												<Divider sx={{ my: 1.5, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
												<DetailRow
													label="Net Salary"
													value={formatCurrency(data.totalNet || data.totals?.netSalary || 0)}
													isDarkMode={isDarkMode}
													valueColor="#22c55e"
													bold
												/>
											</Box>
										);
									})()}
								</Box>
							)}
						</>
					)}
				</Box>

				{/* Actions Footer */}
				<Box
					sx={{
						p: 3,
						bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					}}>
					{actionLoading ? (
						<Box sx={{ display: 'flex', justifyContent: 'center' }}>
							<CircularProgress size={24} />
						</Box>
					) : (
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
							{currentStatus === 'DRAFT' && (
								<Button
									fullWidth
									variant="contained"
									startIcon={<PlayArrowIcon />}
									onClick={() =>
										confirmAction(
											'openValidation',
											'Open Validation Window',
											'This will allow supervisors to validate their team members for payment. Continue?'
										)
									}
									sx={{
										bgcolor: '#22c55e',
										'&:hover': { bgcolor: '#16a34a' },
										fontWeight: 600,
										textTransform: 'none',
									}}>
									Open Validation Window
								</Button>
							)}

							{currentStatus === 'VALIDATION_OPEN' && (
								<Button
									fullWidth
									variant="contained"
									startIcon={<StopIcon />}
									onClick={() =>
										confirmAction(
											'closeValidation',
											'Close Validation Window',
											'No more validations can be made after this. Continue?'
										)
									}
									sx={{
										bgcolor: '#f59e0b',
										'&:hover': { bgcolor: '#d97706' },
										fontWeight: 600,
										textTransform: 'none',
									}}>
									Close Validation Window
								</Button>
							)}

							{currentStatus === 'VALIDATION_CLOSED' && (
								<Button
									fullWidth
									variant="contained"
									startIcon={<CalculateIcon />}
									onClick={() => setComputeDialogOpen(true)}
									sx={{
										bgcolor: '#3b82f6',
										'&:hover': { bgcolor: '#2563eb' },
										fontWeight: 600,
										textTransform: 'none',
									}}>
									Compute Payroll
								</Button>
							)}

							{currentStatus === 'REVIEW' && (
								<>
									<Button
										fullWidth
										variant="contained"
										startIcon={<CalculateIcon />}
										onClick={() => setComputeDialogOpen(true)}
										sx={{
											bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
											color: isDarkMode ? '#e2e8f0' : '#334155',
											'&:hover': { bgcolor: isDarkMode ? '#475569' : '#cbd5e1' },
											fontWeight: 600,
											textTransform: 'none',
										}}>
										Re-compute Payroll
									</Button>
									<Button
										fullWidth
										variant="contained"
										startIcon={<CheckCircleIcon />}
										onClick={() =>
											confirmAction(
												'approve',
												'Approve Payroll',
												'This will mark the payroll as approved and ready for payment. Continue?'
											)
										}
										sx={{
											bgcolor: '#22c55e',
											'&:hover': { bgcolor: '#16a34a' },
											fontWeight: 600,
											textTransform: 'none',
										}}>
										Approve Payroll
									</Button>
								</>
							)}

							{currentStatus === 'APPROVED' && (
								<Button
									fullWidth
									variant="contained"
									startIcon={<PaidIcon />}
									onClick={() =>
										confirmAction(
											'markPaid',
											'Mark Payroll as Paid',
											'This confirms that bank transfers have been completed and finalizes the payroll period. This action cannot be undone. Continue?'
										)
									}
									sx={{
										bgcolor: '#3b82f6',
										'&:hover': { bgcolor: '#2563eb' },
										fontWeight: 600,
										textTransform: 'none',
									}}>
									Mark as Paid
								</Button>
							)}

							{currentStatus === 'PAID' && (
								<Box
									sx={{
										p: 2,
										borderRadius: 2,
										bgcolor: isDarkMode ? 'rgba(34, 197, 94, 0.1)' : '#dcfce7',
										border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : '#86efac'}`,
										textAlign: 'center',
									}}>
									<CheckCircleIcon sx={{ color: '#22c55e', fontSize: 32, mb: 1 }} />
									<Typography variant="body2" sx={{ fontWeight: 600, color: '#22c55e' }}>
										Payroll Completed
									</Typography>
									<Typography variant="caption" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
										This payroll period has been finalized
									</Typography>
								</Box>
							)}
						</Box>
					)}
				</Box>
			</Drawer>

			{/* Compute Dialog */}
			<Dialog open={computeDialogOpen} onClose={() => setComputeDialogOpen(false)}>
				<DialogTitle>Compute Payroll</DialogTitle>
				<DialogContent>
					<Typography variant="body2" sx={{ mb: 2 }}>
						Configure payroll computation options:
					</Typography>
					<FormControlLabel
						control={
							<Checkbox
								checked={nhisApplicable}
								onChange={(e) => setNhisApplicable(e.target.checked)}
								color="primary"
							/>
						}
						label="Apply NHIS (National Health Insurance Scheme) deduction"
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setComputeDialogOpen(false)}>Cancel</Button>
					<Button variant="contained" onClick={handleComputePayroll} sx={{ bgcolor: '#137fec' }}>
						Compute
					</Button>
				</DialogActions>
			</Dialog>

			{/* Confirm Dialog */}
			<Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}>
				<DialogTitle>{confirmDialog.title}</DialogTitle>
				<DialogContent>
					<Typography>{confirmDialog.message}</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>Cancel</Button>
					<Button variant="contained" onClick={executeConfirmedAction} sx={{ bgcolor: '#137fec' }}>
						Confirm
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

// Helper component for detail rows
const DetailRow = ({ label, value, isDarkMode, valueColor, bold }) => (
	<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
		<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
			{label}
		</Typography>
		<Typography
			variant="body2"
			sx={{
				fontWeight: bold ? 700 : 500,
				color: valueColor || (isDarkMode ? '#e2e8f0' : '#0f172a'),
			}}>
			{value}
		</Typography>
	</Box>
);

export default PayPeriodDetailsDrawer;
