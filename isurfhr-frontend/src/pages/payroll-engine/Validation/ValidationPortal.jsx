// src/pages/payroll-engine/Validation/ValidationPortal.jsx
import React, { useState, useEffect } from 'react';
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
	useTheme,
	CircularProgress,
	Alert,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	TextField,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	LinearProgress,
	Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useAuth } from '@/lib/context/AuthContext';
import {
	getPayPeriods,
	getCurrentPayPeriod,
	getTeamForValidation,
	bulkValidateStaff,
	bulkValidateFromFile,
	getValidationSummary,
} from '@/services/PayrollEngineService';
import { BulkUploadModal } from '@/components/payroll-engine';

const ValidationPortal = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const { user } = useAuth();

	const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

	// Data State
	const [periods, setPeriods] = useState([]);
	const [selectedPeriodId, setSelectedPeriodId] = useState('');
	const [teamData, setTeamData] = useState(null);
	const [validationSummary, setValidationSummary] = useState(null);
	const [loading, setLoading] = useState(true);
	const [teamLoading, setTeamLoading] = useState(false);
	const [error, setError] = useState(null);
	const [successMessage, setSuccessMessage] = useState(null);

	// Selection State
	const [validationStatus, setValidationStatus] = useState({}); // { staffId: { status, reason } }

	// Dialog State
	const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
	const [currentStaffForReason, setCurrentStaffForReason] = useState(null);
	const [reason, setReason] = useState('');

	// Submitting State
	const [submitting, setSubmitting] = useState(false);

	// Upload Modal State
	const [uploadModalOpen, setUploadModalOpen] = useState(false);

	// Fetch periods
	useEffect(() => {
		const fetchPeriods = async () => {
			try {
				const [periodsRes, currentRes] = await Promise.all([
					getPayPeriods({ status: 'VALIDATION_OPEN', limit: 20 }),
					getCurrentPayPeriod().catch(() => null),
				]);

				const allPeriods = periodsRes.data?.data || [];
				setPeriods(allPeriods);

				// Auto-select current period or first VALIDATION_OPEN period
				if (currentRes?.data?.status === 'VALIDATION_OPEN') {
					setSelectedPeriodId(currentRes.data.id || currentRes.data._id);
				} else if (allPeriods.length > 0) {
					setSelectedPeriodId(allPeriods[0].id || allPeriods[0]._id);
				}
			} catch (err) {
				console.error('Failed to fetch periods:', err);
				setError('Unable to load pay periods.');
			} finally {
				setLoading(false);
			}
		};

		fetchPeriods();
	}, []);

	// Fetch team when period changes
	useEffect(() => {
		const fetchTeamData = async () => {
			if (!selectedPeriodId) return;

			setTeamLoading(true);
			setError(null);

			try {
				const [teamRes, summaryRes] = await Promise.all([
					getTeamForValidation(selectedPeriodId),
					isAdmin ? getValidationSummary(selectedPeriodId).catch(() => null) : Promise.resolve(null),
				]);

				if (teamRes.data) {
					// API returns data array directly or nested in teamMembers for backward compatibility
					const teamMembers = teamRes.data.data || teamRes.data.teamMembers || teamRes.data;
					const teamDataStructure = Array.isArray(teamMembers)
						? { teamMembers, summary: null }
						: teamRes.data;
					setTeamData(teamDataStructure);
					// Initialize validation status from existing data
					const initialStatus = {};
					const membersArray = Array.isArray(teamMembers) ? teamMembers : [];
					membersArray.forEach((member) => {
						const staffIdValue = member.staffId?._id || member.staffId;
						if (member.status !== 'PENDING' && staffIdValue) {
							initialStatus[staffIdValue] = {
								status: member.status,
								reason: member.reason || '',
							};
						}
					});
					setValidationStatus(initialStatus);
				}

				if (summaryRes?.data) {
					setValidationSummary(summaryRes.data);
				}
			} catch (err) {
				console.error('Failed to fetch team data:', err);
				setError('Unable to load team validation data.');
			} finally {
				setTeamLoading(false);
			}
		};

		fetchTeamData();
	}, [selectedPeriodId, isAdmin]);

	// Handle status change
	const handleStatusChange = (staffId, status) => {
		if (status === 'NO_FOR_PAYMENT') {
			setCurrentStaffForReason(staffId);
			setReasonDialogOpen(true);
		} else {
			setValidationStatus((prev) => ({
				...prev,
				[staffId]: { status, reason: '' },
			}));
		}
	};

	// Handle reason confirmation
	const handleReasonConfirm = () => {
		if (!reason.trim()) {
			return;
		}
		setValidationStatus((prev) => ({
			...prev,
			[currentStaffForReason]: { status: 'NO_FOR_PAYMENT', reason: reason.trim() },
		}));
		setReasonDialogOpen(false);
		setReason('');
		setCurrentStaffForReason(null);
	};

	// Handle bulk yes
	const handleBulkYes = () => {
		const newStatus = { ...validationStatus };
		teamData?.teamMembers?.forEach((member) => {
			const staffObj = member.staff || member.staffId || {};
			const staffId = staffObj._id || staffObj.id || member.staffId;
			if (staffId && (!newStatus[staffId] || newStatus[staffId].status === 'PENDING')) {
				newStatus[staffId] = { status: 'YES_FOR_PAYMENT', reason: '' };
			}
		});
		setValidationStatus(newStatus);
	};

	// Submit validations
	const handleSubmit = async () => {
		const validations = Object.entries(validationStatus)
			.filter(([_, val]) => val.status && val.status !== 'PENDING')
			.map(([staffId, val]) => ({
				staffId,
				status: val.status,
				...(val.reason && { reason: val.reason }),
			}));

		if (validations.length === 0) {
			setError('Please validate at least one staff member.');
			return;
		}

		setSubmitting(true);
		setError(null);

		try {
			await bulkValidateStaff({
				payPeriodId: selectedPeriodId,
				validations,
			});

			setSuccessMessage(`Successfully validated ${validations.length} staff member(s).`);

			// Refresh data
			const [teamRes, summaryRes] = await Promise.all([
				getTeamForValidation(selectedPeriodId),
				isAdmin ? getValidationSummary(selectedPeriodId).catch(() => null) : Promise.resolve(null),
			]);

			if (teamRes.data) {
				setTeamData(teamRes.data);
			}
			if (summaryRes?.data) {
				setValidationSummary(summaryRes.data);
			}

			setTimeout(() => setSuccessMessage(null), 3000);
		} catch (err) {
			console.error('Failed to submit validations:', err);
			setError(err.response?.data?.message || 'Failed to submit validations.');
		} finally {
			setSubmitting(false);
		}
	};

	// Handle bulk upload
	const handleBulkUpload = async (file) => {
		if (!selectedPeriodId) {
			throw new Error('Please select a pay period first.');
		}
		return bulkValidateFromFile(selectedPeriodId, file);
	};

	// Handle upload success
	const handleUploadSuccess = async () => {
		setUploadModalOpen(false);
		setSuccessMessage('Validations uploaded successfully.');

		// Refresh data
		const [teamRes, summaryRes] = await Promise.all([
			getTeamForValidation(selectedPeriodId),
			isAdmin ? getValidationSummary(selectedPeriodId).catch(() => null) : Promise.resolve(null),
		]);

		if (teamRes.data) {
			const teamMembers = teamRes.data.data || teamRes.data.teamMembers || teamRes.data;
			const teamDataStructure = Array.isArray(teamMembers)
				? { teamMembers, summary: null }
				: teamRes.data;
			setTeamData(teamDataStructure);
			// Update validation status from refreshed data
			const newStatus = {};
			const membersArray = Array.isArray(teamMembers) ? teamMembers : [];
			membersArray.forEach((member) => {
				const staffIdValue = member.staffId?._id || member.staffId;
				if (member.status !== 'PENDING' && staffIdValue) {
					newStatus[staffIdValue] = {
						status: member.status,
						reason: member.reason || '',
					};
				}
			});
			setValidationStatus(newStatus);
		}
		if (summaryRes?.data) {
			setValidationSummary(summaryRes.data);
		}

		setTimeout(() => setSuccessMessage(null), 3000);
	};

	// Get validation chip color
	const getValidationChipProps = (status) => {
		switch (status) {
			case 'YES_FOR_PAYMENT':
				return {
					bgcolor: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : '#d1fae5',
					color: isDarkMode ? '#22c55e' : '#047857',
					label: 'Yes',
				};
			case 'NO_FOR_PAYMENT':
				return {
					bgcolor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
					color: isDarkMode ? '#ef4444' : '#b91c1c',
					label: 'No',
				};
			default:
				return {
					bgcolor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9',
					color: isDarkMode ? '#94a3b8' : '#475569',
					label: 'Pending',
				};
		}
	};

	// Progress percentage
	const progressPercent = validationSummary?.percentageCompleted || teamData?.summary
		? Math.round(((teamData?.summary?.yesForPayment || 0) + (teamData?.summary?.noForPayment || 0)) / (teamData?.summary?.total || 1) * 100)
		: 0;

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
				{/* Alerts */}
				{error && (
					<Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}
				{successMessage && (
					<Alert severity="success" sx={{ mb: 2 }}>
						{successMessage}
					</Alert>
				)}

				{/* Summary Card */}
				{(validationSummary || teamData?.summary) && (
					<Paper
						elevation={0}
						sx={{
							p: 3,
							mb: 3,
							borderRadius: 3,
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						}}>
						<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
							<Typography variant="h6" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>
								Validation Progress
							</Typography>
							<Typography variant="h4" sx={{ fontWeight: 700, color: '#137fec' }}>
								{progressPercent}%
							</Typography>
						</Box>
						<LinearProgress
							variant="determinate"
							value={progressPercent}
							sx={{
								height: 8,
								borderRadius: 4,
								bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
								'& .MuiLinearProgress-bar': {
									bgcolor: progressPercent === 100 ? '#22c55e' : '#137fec',
									borderRadius: 4,
								},
							}}
						/>
						<Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
							<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
								Total: <strong>{teamData?.summary?.total || validationSummary?.total || 0}</strong>
							</Typography>
							<Typography variant="body2" sx={{ color: '#22c55e' }}>
								Yes: <strong>{teamData?.summary?.yesForPayment || validationSummary?.yesForPayment || 0}</strong>
							</Typography>
							<Typography variant="body2" sx={{ color: '#ef4444' }}>
								No: <strong>{teamData?.summary?.noForPayment || validationSummary?.noForPayment || 0}</strong>
							</Typography>
							<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
								Pending: <strong>{teamData?.summary?.pending || validationSummary?.pending || 0}</strong>
							</Typography>
						</Box>
					</Paper>
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
						<Typography
							variant="h4"
							sx={{
								fontWeight: 900,
								fontSize: '1.875rem',
								color: isDarkMode ? '#ffffff' : '#0f172a',
								letterSpacing: '-0.025em',
								mb: 0.5,
							}}>
							Validation Portal
						</Typography>
						<Typography
							variant="body1"
							sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', fontSize: '1rem' }}>
							Validate team members for payment - "Yes for Payment" or "No for Payment"
						</Typography>
					</Box>

					{/* Toolbar */}
					<Box
						sx={{
							px: { xs: 3, md: 4 },
							py: 2,
							display: 'flex',
							flexDirection: { xs: 'column', sm: 'row' },
							gap: 2,
							alignItems: 'center',
						}}>
						{/* Period Selector */}
						<FormControl size="small" sx={{ minWidth: 240 }}>
							<InputLabel>Pay Period</InputLabel>
							<Select
								value={selectedPeriodId}
								label="Pay Period"
								onChange={(e) => setSelectedPeriodId(e.target.value)}
								sx={{
									'bgcolor': isDarkMode ? '#1e293b' : '#f8fafc',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: isDarkMode ? '#334155' : '#e2e8f0',
									},
								}}>
								{periods.map((period) => (
									<MenuItem key={period.id || period._id} value={period.id || period._id}>
										{period.periodName}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						<Box sx={{ flex: 1 }} />

						{/* Bulk Actions */}
						{isAdmin && (
							<Button
								variant="outlined"
								startIcon={<CloudUploadIcon />}
								onClick={() => setUploadModalOpen(true)}
								disabled={!selectedPeriodId}
								sx={{
									borderColor: isDarkMode ? '#334155' : '#e2e8f0',
									color: isDarkMode ? '#e2e8f0' : '#334155',
									fontWeight: 600,
									textTransform: 'none',
									'&:hover': { borderColor: '#137fec', color: '#137fec' },
								}}>
								Bulk Upload
							</Button>
						)}

						<Button
							variant="outlined"
							startIcon={<CheckCircleIcon />}
							onClick={handleBulkYes}
							disabled={teamLoading || !teamData?.teamMembers?.length}
							sx={{
								borderColor: '#22c55e',
								color: '#22c55e',
								fontWeight: 600,
								textTransform: 'none',
								'&:hover': { bgcolor: 'rgba(34, 197, 94, 0.1)', borderColor: '#22c55e' },
							}}>
							Approve All Pending
						</Button>

						<Button
							variant="contained"
							onClick={handleSubmit}
							disabled={submitting || Object.keys(validationStatus).length === 0}
							sx={{
								bgcolor: '#137fec',
								fontWeight: 700,
								textTransform: 'none',
								'&:hover': { bgcolor: '#1d4ed8' },
							}}>
							{submitting ? <CircularProgress size={20} color="inherit" /> : 'Submit Validations'}
						</Button>
					</Box>

					{/* Table */}
					<TableContainer>
						<Table sx={{ minWidth: 700 }}>
							<TableHead>
								<TableRow
									sx={{
										bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
										borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									{['Employee', 'Department', 'Current Status', 'Action'].map((head) => (
										<TableCell
											key={head}
											sx={{
												py: 2,
												px: 3,
												fontSize: '0.75rem',
												fontWeight: 600,
												textTransform: 'uppercase',
												letterSpacing: '0.05em',
												color: isDarkMode ? '#94a3b8' : '#64748b',
											}}>
											{head}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading || teamLoading ? (
									<TableRow>
										<TableCell colSpan={4} align="center" sx={{ py: 6 }}>
											<CircularProgress size={30} />
											<Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
												Loading team members...
											</Typography>
										</TableCell>
									</TableRow>
								) : !teamData?.teamMembers?.length ? (
									<TableRow>
										<TableCell colSpan={4} align="center" sx={{ py: 6 }}>
											<Typography variant="body1" sx={{ color: 'text.secondary' }}>
												No team members to validate for this period.
											</Typography>
										</TableCell>
									</TableRow>
								) : (
									teamData.teamMembers.map((member) => {
										// Handle both populated staffId object and separate staff object structures
										const staffObj = member.staff || member.staffId || {};
										const staffId = staffObj._id || staffObj.id || member.staffId;
										const staffName = staffObj.fullName || (staffObj.firstName && staffObj.lastName ? `${staffObj.firstName} ${staffObj.lastName}` : '--');
										const staffEmail = staffObj.email || '--';
										const staffDept = staffObj.department || staffObj.departmentName || '--';
										const currentValidation = validationStatus[staffId] || { status: member.status };
										const chipProps = getValidationChipProps(currentValidation.status);

										return (
											<TableRow
												key={staffId}
												sx={{
													'&:hover': {
														bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
													},
													borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`,
												}}>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<Typography
														variant="body2"
														sx={{ fontWeight: 600, color: isDarkMode ? '#fff' : '#0f172a' }}>
														{staffName}
													</Typography>
													<Typography
														variant="caption"
														sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }}>
														{staffEmail}
													</Typography>
												</TableCell>
												<TableCell
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														color: isDarkMode ? '#cbd5e1' : '#475569',
													}}>
													{staffDept}
												</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<Chip
														label={chipProps.label}
														size="small"
														sx={{
															bgcolor: chipProps.bgcolor,
															color: chipProps.color,
															fontWeight: 600,
															height: 24,
														}}
													/>
													{currentValidation.reason && (
														<Typography
															variant="caption"
															sx={{
																display: 'block',
																color: '#ef4444',
																mt: 0.5,
																fontStyle: 'italic',
															}}>
															{currentValidation.reason}
														</Typography>
													)}
												</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<Box sx={{ display: 'flex', gap: 1 }}>
														<Button
															size="small"
															variant={currentValidation.status === 'YES_FOR_PAYMENT' ? 'contained' : 'outlined'}
															startIcon={<CheckCircleIcon />}
															onClick={() => handleStatusChange(staffId, 'YES_FOR_PAYMENT')}
															sx={{
																'bgcolor': currentValidation.status === 'YES_FOR_PAYMENT' ? '#22c55e' : 'transparent',
																'borderColor': '#22c55e',
																'color': currentValidation.status === 'YES_FOR_PAYMENT' ? '#fff' : '#22c55e',
																'fontWeight': 600,
																'textTransform': 'none',
																'fontSize': '0.75rem',
																'&:hover': {
																	bgcolor: currentValidation.status === 'YES_FOR_PAYMENT' ? '#16a34a' : 'rgba(34, 197, 94, 0.1)',
																},
															}}>
															Yes
														</Button>
														<Button
															size="small"
															variant={currentValidation.status === 'NO_FOR_PAYMENT' ? 'contained' : 'outlined'}
															startIcon={<CancelIcon />}
															onClick={() => handleStatusChange(staffId, 'NO_FOR_PAYMENT')}
															sx={{
																'bgcolor': currentValidation.status === 'NO_FOR_PAYMENT' ? '#ef4444' : 'transparent',
																'borderColor': '#ef4444',
																'color': currentValidation.status === 'NO_FOR_PAYMENT' ? '#fff' : '#ef4444',
																'fontWeight': 600,
																'textTransform': 'none',
																'fontSize': '0.75rem',
																'&:hover': {
																	bgcolor: currentValidation.status === 'NO_FOR_PAYMENT' ? '#dc2626' : 'rgba(239, 68, 68, 0.1)',
																},
															}}>
															No
														</Button>
													</Box>
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</TableContainer>
				</Paper>

				{/* Reason Dialog */}
				<Dialog open={reasonDialogOpen} onClose={() => setReasonDialogOpen(false)} maxWidth="sm" fullWidth>
					<DialogTitle>Reason for No Payment</DialogTitle>
					<DialogContent>
						<Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
							Please provide a reason why this employee should not receive payment this period.
						</Typography>
						<TextField
							fullWidth
							multiline
							rows={3}
							placeholder="e.g., Employee on unpaid leave, Absent without leave, etc."
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							autoFocus
						/>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setReasonDialogOpen(false)}>Cancel</Button>
						<Button
							variant="contained"
							onClick={handleReasonConfirm}
							disabled={!reason.trim()}
							sx={{ bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}>
							Confirm
						</Button>
					</DialogActions>
				</Dialog>

				{/* Bulk Upload Modal */}
				<BulkUploadModal
					open={uploadModalOpen}
					onClose={() => setUploadModalOpen(false)}
					onUpload={handleBulkUpload}
					title="Bulk Validate Staff"
					description="Upload a CSV or Excel file with validation data"
					templateType="VALIDATIONS"
					requiredColumns={['staffId', 'status']}
					optionalColumns={['reason']}
					onSuccess={handleUploadSuccess}
				/>
			</Box>
		</Box>
	);
};

export default ValidationPortal;
