// src/pages/payroll-engine/TaxFiling/TaxProfileFormModal.jsx
import React, { useState, useEffect } from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	TextField,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Box,
	Typography,
	CircularProgress,
	Alert,
	useTheme,
	FormHelperText,
	Autocomplete,
} from '@mui/material';

import { createTaxProfile, updateTaxProfile, getStaffForDropdown, NIGERIA_STATES } from '@/services/TaxFilingService';

const TaxProfileFormModal = ({ open, onClose, profile, companyId, onSuccess }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	const isEdit = profile && profile.id;

	const [formData, setFormData] = useState({
		staffId: '',
		stateOfResidence: '',
		jtbTin: '',
		pfaName: '',
	});
	const [errors, setErrors] = useState({});
	const [loading, setLoading] = useState(false);
	const [apiError, setApiError] = useState(null);
	const [staffList, setStaffList] = useState([]);
	const [staffLoading, setStaffLoading] = useState(false);
	const [selectedStaff, setSelectedStaff] = useState(null);

	// Fetch staff list when modal opens for new profile
	useEffect(() => {
		const fetchStaffList = async () => {
			if (!open || isEdit) return;

			setStaffLoading(true);
			try {
				const response = await getStaffForDropdown({
					companyId,
					withoutProfile: true,
					limit: 500,
				});
				if (response.data?.success) {
					setStaffList(response.data.data?.staff || []);
				}
			} catch (err) {
				console.error('Failed to fetch staff list:', err);
			} finally {
				setStaffLoading(false);
			}
		};

		fetchStaffList();
	}, [open, isEdit, companyId]);

	// Initialize form data when profile changes
	useEffect(() => {
		if (profile) {
			setFormData({
				staffId: profile.staffId || profile.id || '',
				stateOfResidence: profile.stateOfResidence || '',
				jtbTin: profile.jtbTin?.replace(/[-\s]/g, '') || '',
				pfaName: profile.pfaName || '',
			});
			setSelectedStaff(null);
		} else {
			setFormData({
				staffId: '',
				stateOfResidence: '',
				jtbTin: '',
				pfaName: '',
			});
			setSelectedStaff(null);
		}
		setErrors({});
		setApiError(null);
	}, [profile, open]);

	// Validate TIN format
	const validateTIN = (tin) => {
		if (!tin) return true; // TIN is optional
		const cleaned = tin.replace(/\D/g, '');
		return cleaned.length === 13;
	};

	// Handle staff selection - use UUID (id) for API calls
	const handleStaffSelect = (event, staff) => {
		setSelectedStaff(staff);
		if (staff) {
			setFormData((prev) => ({
				...prev,
				staffId: staff.id, // Use UUID for API calls
			}));
			setErrors((prev) => ({ ...prev, staffId: null }));
		} else {
			setFormData((prev) => ({ ...prev, staffId: '' }));
		}
	};

	// Handle form change
	const handleChange = (field) => (e) => {
		let value = e.target.value;

		// Clean TIN input
		if (field === 'jtbTin') {
			value = value.replace(/\D/g, '').slice(0, 13);
		}

		setFormData((prev) => ({ ...prev, [field]: value }));
		setErrors((prev) => ({ ...prev, [field]: null }));
	};

	// Validate form
	const validateForm = () => {
		const newErrors = {};

		if (!isEdit && !formData.staffId) {
			newErrors.staffId = 'Please select an employee';
		}

		if (!formData.stateOfResidence) {
			newErrors.stateOfResidence = 'State of residence is required';
		}

		if (formData.jtbTin && !validateTIN(formData.jtbTin)) {
			newErrors.jtbTin = 'JTB TIN must be exactly 13 digits';
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	// Handle submit
	const handleSubmit = async () => {
		if (!validateForm()) return;

		setLoading(true);
		setApiError(null);

		try {
			const payload = {
				stateOfResidence: formData.stateOfResidence,
				companyId,
			};

			if (formData.jtbTin) {
				payload.jtbTin = formData.jtbTin;
			}
			if (formData.pfaName) {
				payload.pfaName = formData.pfaName;
			}

			if (isEdit) {
				await updateTaxProfile(formData.staffId, payload);
			} else {
				payload.staffId = formData.staffId;
				await createTaxProfile(payload);
			}

			onSuccess();
		} catch (err) {
			console.error('Failed to save tax profile:', err);
			setApiError(err.response?.data?.message || 'Failed to save tax profile');
		} finally {
			setLoading(false);
		}
	};

	// Format TIN for display (format: 1234-567-8901-23)
	const formatTINDisplay = (tin) => {
		if (!tin) return '';
		const cleaned = tin.replace(/\D/g, '');
		if (cleaned.length <= 4) {
			return cleaned;
		}
		let formatted = cleaned.slice(0, 4);
		if (cleaned.length <= 7) {
			formatted += '-' + cleaned.slice(4);
		} else if (cleaned.length <= 11) {
			formatted += '-' + cleaned.slice(4, 7) + '-' + cleaned.slice(7);
		} else {
			formatted += '-' + cleaned.slice(4, 7) + '-' + cleaned.slice(7, 11) + '-' + cleaned.slice(11);
		}
		return formatted;
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: {
					bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
					borderRadius: 3,
				},
			}}>
			<DialogTitle sx={{ fontWeight: 700 }}>
				{isEdit ? 'Edit Tax Profile' : 'Add Tax Profile'}
			</DialogTitle>

			<DialogContent>
				{apiError && (
					<Alert severity="error" sx={{ mb: 2 }}>
						{apiError}
					</Alert>
				)}

				{/* Employee Info (for new profile from missing list) */}
				{profile?.staff && !isEdit && (
					<Box
						sx={{
							p: 2,
							mb: 3,
							borderRadius: 2,
							bgcolor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						}}>
						<Typography variant="subtitle2" color="text.secondary">
							Employee
						</Typography>
						<Typography variant="body1" sx={{ fontWeight: 600 }}>
							{profile.staff.firstName} {profile.staff.lastName}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{profile.staff.email} | {profile.staff.staffId}
						</Typography>
					</Box>
				)}

				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
					{/* Employee Selection (only for new profiles without pre-selected staff) */}
					{!isEdit && !profile?.staff && (
						<Autocomplete
							options={staffList}
							value={selectedStaff}
							onChange={handleStaffSelect}
							loading={staffLoading}
							getOptionLabel={(option) => option?.label || ''}
							isOptionEqualToValue={(option, value) => option?.id === value?.id}
							renderOption={(props, option) => {
								const { key, ...restProps } = props;
								return (
									<Box component="li" key={option.id} {...restProps}>
										<Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
											<Box>
												<Typography variant="body2" sx={{ fontWeight: 600 }}>
													{option.label}
												</Typography>
												<Typography variant="caption" color="text.secondary">
													{option.email} | {option.department}
												</Typography>
											</Box>
											{option.hasTaxProfile && (
												<Typography
													variant="caption"
													sx={{
														bgcolor: 'success.light',
														color: 'success.dark',
														px: 1,
														py: 0.5,
														borderRadius: 1,
														fontSize: '0.65rem',
													}}>
													Has Profile
												</Typography>
											)}
										</Box>
									</Box>
								);
							}}
							renderInput={(params) => (
								<TextField
									{...params}
									label="Select Employee *"
									placeholder="Search by name, ID, or email..."
									error={!!errors.staffId}
									helperText={errors.staffId}
									InputProps={{
										...params.InputProps,
										endAdornment: (
											<>
												{staffLoading ? <CircularProgress size={20} /> : null}
												{params.InputProps.endAdornment}
											</>
										),
									}}
								/>
							)}
						/>
					)}

					{/* State of Residence */}
					<FormControl fullWidth error={!!errors.stateOfResidence}>
						<InputLabel>State of Residence *</InputLabel>
						<Select
							value={formData.stateOfResidence}
							label="State of Residence *"
							onChange={handleChange('stateOfResidence')}>
							{NIGERIA_STATES.map((state) => (
								<MenuItem key={state.code} value={state.name}>
									{state.name} ({state.irsName})
								</MenuItem>
							))}
						</Select>
						{errors.stateOfResidence && <FormHelperText>{errors.stateOfResidence}</FormHelperText>}
					</FormControl>

					{/* JTB TIN */}
					<TextField
						label="JTB TIN"
						value={formatTINDisplay(formData.jtbTin)}
						onChange={handleChange('jtbTin')}
						error={!!errors.jtbTin}
						helperText={errors.jtbTin || '13-digit Tax Identification Number (optional)'}
						placeholder="1234-567-8901-3"
						inputProps={{ maxLength: 16 }}
					/>

					{/* PFA Name */}
					<TextField
						label="Pension Fund Administrator (PFA)"
						value={formData.pfaName}
						onChange={handleChange('pfaName')}
						placeholder="e.g., ARM Pension, Stanbic IBTC Pension"
						helperText="Optional"
					/>
				</Box>
			</DialogContent>

			<DialogActions sx={{ p: 3, pt: 0 }}>
				<Button onClick={onClose} disabled={loading}>
					Cancel
				</Button>
				<Button
					variant="contained"
					onClick={handleSubmit}
					disabled={loading}
					sx={{ bgcolor: '#137fec', '&:hover': { bgcolor: '#1d4ed8' } }}>
					{loading ? <CircularProgress size={20} color="inherit" /> : isEdit ? 'Update' : 'Create'}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default TaxProfileFormModal;
