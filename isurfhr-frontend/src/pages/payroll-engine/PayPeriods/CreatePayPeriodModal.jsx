// src/pages/payroll-engine/PayPeriods/CreatePayPeriodModal.jsx
import React, { useState, useEffect } from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	TextField,
	Box,
	Typography,
	Alert,
	CircularProgress,
	useTheme,
	IconButton,
	Grid,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { createPayPeriod } from '@/services/PayrollEngineService';

const CreatePayPeriodModal = ({ open, onClose, onSuccess }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Get default dates for current month
	const getDefaultDates = () => {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth();

		// Start of month
		const startDate = new Date(year, month, 1);
		// End of month
		const endDate = new Date(year, month + 1, 0);
		// Payment date (last working day or 28th)
		const paymentDate = new Date(year, month, 28);

		const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'];

		return {
			name: `${monthNames[month]} ${year} Payroll`,
			startDate: startDate.toISOString().split('T')[0],
			endDate: endDate.toISOString().split('T')[0],
			paymentDate: paymentDate.toISOString().split('T')[0],
		};
	};

	const defaults = getDefaultDates();

	// Form State
	const [formData, setFormData] = useState({
		name: defaults.name,
		startDate: defaults.startDate,
		endDate: defaults.endDate,
		paymentDate: defaults.paymentDate,
	});

	// UI State
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	// Reset form when modal opens
	useEffect(() => {
		if (open) {
			const defaults = getDefaultDates();
			setFormData({
				name: defaults.name,
				startDate: defaults.startDate,
				endDate: defaults.endDate,
				paymentDate: defaults.paymentDate,
			});
			setError(null);
		}
	}, [open]);

	const handleChange = (field) => (e) => {
		setFormData(prev => ({ ...prev, [field]: e.target.value }));
	};

	const validateForm = () => {
		if (!formData.name.trim()) {
			setError('Period name is required');
			return false;
		}
		if (!formData.startDate) {
			setError('Start date is required');
			return false;
		}
		if (!formData.endDate) {
			setError('End date is required');
			return false;
		}
		if (!formData.paymentDate) {
			setError('Payment date is required');
			return false;
		}
		if (new Date(formData.startDate) >= new Date(formData.endDate)) {
			setError('End date must be after start date');
			return false;
		}
		return true;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError(null);

		if (!validateForm()) return;

		setLoading(true);

		try {
			await createPayPeriod({
				name: formData.name.trim(),
				startDate: formData.startDate,
				endDate: formData.endDate,
				paymentDate: formData.paymentDate,
			});
			onSuccess();
		} catch (err) {
			console.error('Failed to create pay period:', err);
			const errorMessage = err.response?.data?.message || 'Failed to create pay period. Please try again.';
			setError(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		if (!loading) {
			onClose();
		}
	};

	// Format date for display
	const formatDisplayDate = (dateStr) => {
		if (!dateStr) return '';
		return new Date(dateStr).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	};

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: {
					bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
					borderRadius: 3,
				},
			}}>
			<DialogTitle
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					pb: 2,
				}}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
					<Box
						sx={{
							width: 40,
							height: 40,
							borderRadius: 2,
							bgcolor: isDarkMode ? 'rgba(19, 127, 236, 0.15)' : '#eff6ff',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						<CalendarMonthIcon sx={{ color: '#137fec' }} />
					</Box>
					<Box>
						<Typography variant="h6" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>
							Create Pay Period
						</Typography>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Set up a new payroll cycle
						</Typography>
					</Box>
				</Box>
				<IconButton onClick={handleClose} disabled={loading}>
					<CloseIcon sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
				</IconButton>
			</DialogTitle>

			<form onSubmit={handleSubmit}>
				<DialogContent sx={{ py: 3 }}>
					{error && (
						<Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
							{error}
						</Alert>
					)}

					<Grid container spacing={3}>
						{/* Period Name */}
						<Grid item xs={12}>
							<TextField
								fullWidth
								label="Period Name"
								placeholder="e.g., March 2026 Payroll"
								value={formData.name}
								onChange={handleChange('name')}
								disabled={loading}
								required
								sx={{
									'& .MuiOutlinedInput-root': {
										bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
									},
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: isDarkMode ? '#334155' : '#e2e8f0',
									},
								}}
							/>
						</Grid>

						{/* Start Date */}
						<Grid item xs={12} sm={6}>
							<TextField
								fullWidth
								label="Start Date"
								type="date"
								value={formData.startDate}
								onChange={handleChange('startDate')}
								disabled={loading}
								required
								InputLabelProps={{ shrink: true }}
								sx={{
									'& .MuiOutlinedInput-root': {
										bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
									},
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: isDarkMode ? '#334155' : '#e2e8f0',
									},
								}}
							/>
						</Grid>

						{/* End Date */}
						<Grid item xs={12} sm={6}>
							<TextField
								fullWidth
								label="End Date"
								type="date"
								value={formData.endDate}
								onChange={handleChange('endDate')}
								disabled={loading}
								required
								InputLabelProps={{ shrink: true }}
								sx={{
									'& .MuiOutlinedInput-root': {
										bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
									},
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: isDarkMode ? '#334155' : '#e2e8f0',
									},
								}}
							/>
						</Grid>

						{/* Payment Date */}
						<Grid item xs={12}>
							<TextField
								fullWidth
								label="Payment Date"
								type="date"
								value={formData.paymentDate}
								onChange={handleChange('paymentDate')}
								disabled={loading}
								required
								helperText="Expected salary payment date"
								InputLabelProps={{ shrink: true }}
								sx={{
									'& .MuiOutlinedInput-root': {
										bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
									},
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: isDarkMode ? '#334155' : '#e2e8f0',
									},
								}}
							/>
						</Grid>

						{/* Preview Card */}
						<Grid item xs={12}>
							<Box
								sx={{
									p: 2.5,
									borderRadius: 2,
									bgcolor: isDarkMode ? 'rgba(19, 127, 236, 0.1)' : '#eff6ff',
									border: `1px solid ${isDarkMode ? 'rgba(19, 127, 236, 0.3)' : '#bfdbfe'}`,
								}}>
								<Typography
									variant="subtitle2"
									sx={{ fontWeight: 700, color: isDarkMode ? '#60a5fa' : '#1d4ed8', mb: 1.5 }}>
									Period Summary
								</Typography>
								<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#cbd5e1' : '#334155' }}>
										<strong>Name:</strong> {formData.name || '—'}
									</Typography>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
										<strong>Period:</strong> {formatDisplayDate(formData.startDate)} — {formatDisplayDate(formData.endDate)}
									</Typography>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
										<strong>Payment:</strong> {formatDisplayDate(formData.paymentDate)}
									</Typography>
									<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mt: 1 }}>
										<strong>Initial Status:</strong>{' '}
										<Box component="span" sx={{
											px: 1,
											py: 0.25,
											borderRadius: 1,
											bgcolor: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0',
											color: isDarkMode ? '#94a3b8' : '#475569',
											fontSize: '0.75rem',
											fontWeight: 600,
										}}>
											DRAFT
										</Box>
									</Typography>
								</Box>
							</Box>
						</Grid>
					</Grid>
				</DialogContent>

				<DialogActions
					sx={{
						px: 3,
						py: 2,
						borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						gap: 1,
					}}>
					<Button
						onClick={handleClose}
						disabled={loading}
						sx={{
							color: isDarkMode ? '#94a3b8' : '#64748b',
							fontWeight: 600,
							textTransform: 'none',
						}}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={loading}
						sx={{
							bgcolor: '#137fec',
							fontWeight: 700,
							textTransform: 'none',
							px: 3,
							'&:hover': { bgcolor: '#1d4ed8' },
						}}>
						{loading ? <CircularProgress size={20} color="inherit" /> : 'Create Pay Period'}
					</Button>
				</DialogActions>
			</form>
		</Dialog>
	);
};

export default CreatePayPeriodModal;
