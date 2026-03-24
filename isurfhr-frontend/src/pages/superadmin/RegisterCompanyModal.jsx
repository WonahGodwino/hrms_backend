import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField, Button, CircularProgress, IconButton, Box, Typography, Alert } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CompanyCreatedSuccessModal from './CompanyCreatedSuccessModal';
import RegistrationFailedModal from './RegistrationFailedModal';
import { registerCompany } from '@/services/CompanyService';

const CompanyRegistrationModal = ({ open, onClose, onSubmit }) => {
	const [loading, setLoading] = useState(false);
	const [apiError, setApiError] = useState('');
	const [isDragging, setIsDragging] = useState(false);

	// State for modals
	const [showSuccessModal, setShowSuccessModal] = useState(false);
	const [showErrorModal, setShowErrorModal] = useState(false);

	const [form, setForm] = useState({
		companyName: '',
		email: '',
		phone: '',
		address: '',
		taxId: '',
		logo: '', // base64 string - optional
	});

	const [errors, setErrors] = useState({
		companyName: '',
		email: '',
		phone: '',
		address: '',
		taxId: '',
		logo: '',
	});

	const handleLogoChange = (file) => {
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			setErrors((prev) => ({ ...prev, logo: 'Only image files are allowed' }));
			return;
		}

		// Optional: Add file size validation (e.g., max 5MB)
		const maxSize = 5 * 1024 * 1024; // 5MB
		if (file.size > maxSize) {
			setErrors((prev) => ({ ...prev, logo: 'File size should be less than 5MB' }));
			return;
		}

		const reader = new FileReader();
		reader.onloadend = () => {
			setForm((prev) => ({
				...prev,
				logo: reader.result,
			}));
			setErrors((prev) => ({ ...prev, logo: '' }));
		};
		reader.onerror = () => {
			setErrors((prev) => ({ ...prev, logo: 'Failed to read the image file' }));
		};
		reader.readAsDataURL(file);
	};

	const handleDragOver = (e) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = () => {
		setIsDragging(false);
	};

	const handleDrop = (e) => {
		e.preventDefault();
		setIsDragging(false);
		const file = e.dataTransfer.files[0];
		handleLogoChange(file);
	};

	const handleChange = (e) => {
		const { name, value } = e.target;

		// Clear API errors when user starts typing again
		if (apiError) setApiError('');

		setForm((prev) => ({ ...prev, [name]: value }));

		// Clear field-specific errors when user starts typing
		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: '' }));
		}

		// Validation logic
		if (name === 'email') {
			const isValid = /\S+@\S+\.\S+/.test(value);
			setErrors((prev) => ({ ...prev, email: isValid ? '' : 'Email is invalid.' }));
		}

		if (name === 'phone') {
			const isValid = /^[+]?[\d\s-()]*$/.test(value);
			setErrors((prev) => ({ ...prev, phone: isValid ? '' : 'Please enter a valid phone number.' }));
		}
	};

	const removeLogo = (e) => {
		if (e) e.stopPropagation();
		setForm((prev) => ({ ...prev, logo: '' }));
		setErrors((prev) => ({ ...prev, logo: '' }));
	};

	// Success Modal Handlers
	const handleSuccessClose = () => {
		setShowSuccessModal(false);
	};

	const handleViewCompany = () => {
		setShowSuccessModal(false);
		// You can navigate to company details page here
	};

	// Error Modal Handlers
	const handleErrorClose = () => {
		setShowErrorModal(false);
	};

	const handleTryAgain = () => {
		setShowErrorModal(false);
	};

	const validateForm = () => {
		const newErrors = {};

		if (!form.companyName.trim()) newErrors.companyName = 'Company name is required';
		if (!form.taxId.trim()) newErrors.taxId = 'Tax ID is required';

		if (!form.email) {
			newErrors.email = 'Email is required';
		} else if (!/\S+@\S+\.\S+/.test(form.email)) {
			newErrors.email = 'Email is invalid';
		}

		if (!form.phone) {
			newErrors.phone = 'Phone number is required';
		} else if (!/^[+]?[\d\s-()]*$/.test(form.phone)) {
			newErrors.phone = 'Invalid phone number';
		}

		if (!form.address.trim()) newErrors.address = 'Address is required';
		// Logo is now optional, so no validation required

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async () => {
		// Validate form
		if (!validateForm()) {
			setApiError('Please fill in all required fields correctly.');
			return;
		}

		setLoading(true);
		setApiError('');

		try {
			// Prepare payload
			const payload = {
				companyName: form.companyName,
				email: form.email,
				phone: form.phone,
				address: form.address,
				taxId: form.taxId,
			};

			// Only include logo if it exists
			if (form.logo) {
				payload.logo = form.logo;
			}

			// Here you would call your API service
			const response = await registerCompany(payload);

			if (response.data.success) {
				// Reset form
				setForm({
					companyName: '',
					email: '',
					phone: '',
					address: '',
					taxId: '',
					logo: '',
				});
				setErrors({
					companyName: '',
					email: '',
					phone: '',
					address: '',
					taxId: '',
					logo: '',
				});
				setLoading(false);
				onClose();
				setShowSuccessModal(true);
			}
		} catch (err) {
			console.error('Company Registration Error:', err);
			const errorMessage = err.response?.data?.message || err.message || 'Network error. Unable to connect to server.';
			setApiError(errorMessage);
			setShowErrorModal(true);
			setLoading(false);
		}
	};

	const resetFormAndClose = () => {
		setForm({
			companyName: '',
			email: '',
			phone: '',
			address: '',
			taxId: '',
			logo: '',
		});
		setErrors({
			companyName: '',
			email: '',
			phone: '',
			address: '',
			taxId: '',
			logo: '',
		});
		onClose();
	};

	return (
		<>
			{/* Main Company Registration Form Dialog */}
			<Dialog
				open={open}
				onClose={loading ? null : resetFormAndClose}
				maxWidth="md"
				fullWidth
				PaperProps={{
					sx: {
						borderRadius: 3,
					},
				}}>
				<DialogTitle
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						borderBottom: '1px solid #e0e0e0',
						p: 3,
					}}>
					<Typography
						variant="h6"
						component="span"
						fontWeight={600}>
						Register New Company
					</Typography>
					<IconButton
						onClick={resetFormAndClose}
						aria-label="close"
						disabled={loading}>
						<CloseIcon />
					</IconButton>
				</DialogTitle>

				<DialogContent sx={{ p: 3, mt: 1 }}>
					<Box
						component="form"
						noValidate
						autoComplete="off"
						mt={2}>
						<Grid
							container
							spacing={3}>
							<Grid
								item
								size={6}>
								<TextField
									fullWidth
									label="Company Name"
									name="companyName"
									placeholder="Enter company name"
									value={form.companyName}
									onChange={handleChange}
									error={!!errors.companyName}
									helperText={errors.companyName}
									variant="outlined"
									disabled={loading}
									required
								/>
							</Grid>
							<Grid
								item
								size={6}>
								<TextField
									fullWidth
									label="Tax ID"
									name="taxId"
									placeholder="TAX-123456789"
									value={form.taxId}
									onChange={handleChange}
									error={!!errors.taxId}
									helperText={errors.taxId}
									variant="outlined"
									disabled={loading}
									required
								/>
							</Grid>

							<Grid
								item
								size={6}>
								<TextField
									fullWidth
									label="Official Email"
									name="email"
									placeholder="company@example.com"
									value={form.email}
									onChange={handleChange}
									error={!!errors.email}
									helperText={errors.email}
									variant="outlined"
									disabled={loading}
									required
								/>
							</Grid>

							<Grid
								item
								size={6}>
								<TextField
									fullWidth
									label="Mobile Number"
									name="phone"
									placeholder="+1 (555) 123-4567"
									value={form.phone}
									onChange={handleChange}
									error={!!errors.phone}
									helperText={errors.phone}
									variant="outlined"
									disabled={loading}
									required
								/>
							</Grid>

							<Grid
								item
								size={12}>
								<TextField
									fullWidth
									label="Company Address"
									name="address"
									placeholder="123 Tech Street, Silicon Valley, CA"
									value={form.address}
									onChange={handleChange}
									error={!!errors.address}
									helperText={errors.address}
									variant="outlined"
									multiline
									rows={4}
									disabled={loading}
									inputProps={{
										maxLength: 500,
									}}
								/>
							</Grid>

							<Grid
								item
								size={12}>
								<Box
									onDragOver={handleDragOver}
									onDragLeave={handleDragLeave}
									onDrop={handleDrop}
									onClick={() => document.getElementById('logo-upload-input').click()}
									sx={{
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center',
										justifyContent: 'center',
										gap: 2,
										p: 4,
										width: '100%',
										textAlign: 'center',
										borderRadius: 3,
										border: `2px dashed ${isDragging || form.logo ? '#135bec' : '#d1d5db'}`,
										bgcolor: isDragging ? 'rgba(19, 91, 236, 0.08)' : form.logo ? 'rgba(19, 91, 236, 0.04)' : 'transparent',
										cursor: 'pointer',
										transition: 'all 0.2s ease',
									}}>
									<input
										id="logo-upload-input"
										type="file"
										accept="image/*"
										hidden
										onChange={(e) => handleLogoChange(e.target.files[0])}
									/>

									{form.logo ? (
										<>
											<Box
												component="img"
												src={form.logo}
												alt="Company Logo Preview"
												sx={{
													width: '100%',
													maxHeight: 160,
													objectFit: 'contain',
													borderRadius: 2,
													bgcolor: '#fff',
													p: 2,
												}}
											/>

											<Typography
												variant="body2"
												sx={{ fontWeight: 600 }}>
												Logo uploaded (Optional)
											</Typography>

											<Typography
												variant="caption"
												color="text.secondary">
												Click or drop to replace
											</Typography>

											<Button
												size="small"
												color="error"
												onClick={removeLogo}>
												Remove logo
											</Button>
										</>
									) : (
										<>
											<Typography
												variant="body1"
												sx={{ fontWeight: 700 }}>
												Upload Company Logo (Optional)
											</Typography>

											<Typography
												variant="body2"
												color="text.secondary">
												Drag & drop or click to browse (PNG, JPG, SVG)
											</Typography>

											<Button
												variant="contained"
												sx={{
													'mt': 1,
													'textTransform': 'none',
													'bgcolor': '#135bec',
													'&:hover': { bgcolor: '#0d4bd1' },
												}}>
												Choose Image
											</Button>
										</>
									)}

									{errors.logo && (
										<Typography
											variant="caption"
											color="error">
											{errors.logo}
										</Typography>
									)}
								</Box>
							</Grid>
						</Grid>
					</Box>
				</DialogContent>

				<DialogActions
					sx={{
						borderTop: '1px solid #e0e0e0',
						p: 3,
						flexDirection: 'column',
						alignItems: 'flex-end',
						gap: 2,
					}}>
					{apiError && (
						<Alert
							severity="error"
							sx={{ width: '100%', mb: 1 }}>
							{apiError}
						</Alert>
					)}

					<Box sx={{ display: 'flex', gap: 1 }}>
						<Button
							onClick={resetFormAndClose}
							variant="outlined"
							color="inherit"
							disabled={loading}
							sx={{
								'borderColor': '#e0e0e0',
								'color': 'text.secondary',
								'textTransform': 'none',
								'fontWeight': 500,
								'&:hover': {
									borderColor: '#bdbdbd',
									backgroundColor: '#f5f5f5',
								},
							}}>
							Cancel
						</Button>
						<Button
							onClick={handleSubmit}
							variant="contained"
							disabled={loading}
							sx={{
								'bgcolor': '#135bec',
								'textTransform': 'none',
								'fontWeight': 500,
								'&:hover': {
									bgcolor: '#0d4bd1',
								},
							}}>
							{loading ? (
								<>
									<CircularProgress
										size={20}
										sx={{ mr: 1 }}
									/>
									Creating...
								</>
							) : (
								'Create Company'
							)}
						</Button>
					</Box>
				</DialogActions>
			</Dialog>

			{/* Success Modal */}
			<CompanyCreatedSuccessModal
				open={showSuccessModal}
				onClose={handleSuccessClose}
				onViewCompany={handleViewCompany}
			/>

			{/* Error Modal */}
			<RegistrationFailedModal
				isCompany
				open={showErrorModal}
				onClose={handleErrorClose}
				onTryAgain={handleTryAgain}
			/>
		</>
	);
};

export default CompanyRegistrationModal;
