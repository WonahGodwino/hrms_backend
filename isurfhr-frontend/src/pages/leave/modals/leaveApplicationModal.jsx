import React, { useState } from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	IconButton,
	Typography,
	TextField,
	MenuItem,
	FormControlLabel,
	Switch,
	Button,
	CircularProgress,
	Alert,
	Grid,
	Divider,
	InputAdornment,
	Stack,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import { validateLeaveApplication } from '@/lib/validation';

const LeaveApplicationModal = ({ open, onClose, onSuccess }) => {
	const [formData, setFormData] = useState({
		leaveTypeId: '',
		startDate: null,
		endDate: null,
		reason: '',
		emergencyContact: '',
		contactPhone: '',
		handoverTo: '',
		handoverNotes: '',
		isHalfDay: false,
		halfDayPart: 'FIRST_HALF',
		attachmentUrl: '',
		fileName: '',
		medicalCertificateNumber: '',
		medicalCertificateDate: null,
		medicalCertificateIssuer: '',
	});

	const [file, setFile] = useState(null);
	const [fileError, setFileError] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [fieldErrors, setFieldErrors] = useState({});

	// Allowed file types
	const allowedFileTypes = [
		'application/pdf',
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/webp',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	];

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: type === 'checkbox' ? checked : value,
		}));
	};

	const handleDateChange = (name, date) => {
		setFormData((prev) => ({
			...prev,
			[name]: date,
		}));
	};

	const handleFileChange = (e) => {
		const selectedFile = e.target.files[0];
		setFileError('');

		if (selectedFile) {
			if (!allowedFileTypes.includes(selectedFile.type)) {
				setFileError('Invalid file type. Please upload PDF, images (JPG, PNG, WEBP), or DOC files.');
				setFile(null);
				setFormData((prev) => ({
					...prev,
					fileName: '',
				}));
				return;
			}

			if (selectedFile.size > 5 * 1024 * 1024) {
				setFileError('File size exceeds 5MB limit.');
				setFile(null);
				setFormData((prev) => ({
					...prev,
					fileName: '',
				}));
				return;
			}

			setFile(selectedFile);
			setFormData((prev) => ({
				...prev,
				fileName: selectedFile.name,
			}));
		}
	};

	const handleSubmit = async () => {
		setError(''); // clear global error
		setFileError(''); // clear file error if needed

		const validation = validateLeaveApplication(formData, {
			requireMedicalForSick: true, // ← change based on your policy
		});

		if (!validation.isValid) {
			setFieldErrors(validation.errors);
			setError('Please correct the errors in the form.');
			return;
		} else {
			setFieldErrors({});
		}

		// If we reach here → form is valid
		setLoading(true);

		try {
			// Your submit logic (API call)
			await new Promise((resolve) => setTimeout(resolve, 1800)); // mock delay

			const mockResponse = {
				success: true,
				message: 'Leave application submitted successfully',
				data: {
					leaveRequestId: 'clxyz456...',
					referenceNumber: 'LR-ABC-123XYZ',
					status: 'PENDING',
					requestedDays: 5,
				},
			};

			onSuccess?.(mockResponse.data);
			onClose();
		} catch (err) {
			setError('Failed to submit leave request. Please try again.');
		} finally {
			setLoading(false);
		}
	};

	return (
		<LocalizationProvider dateAdapter={AdapterDateFns}>
			<Dialog
				open={open}
				onClose={!loading ? onClose : undefined}
				maxWidth="md"
				fullWidth
				TransitionProps={{
					timeout: 500,
				}}
				PaperProps={{
					sx: {
						borderRadius: 3,
						bgcolor: '#0f172a',
						color: '#e5e7eb',
						border: '1px solid rgba(255,255,255,0.08)',
						boxShadow: 24,
						animation: 'slideInUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
						...modalAnimations,
					},
				}}>
				{/* Header with slide in animation */}
				<DialogTitle
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						borderBottom: '1px solid rgba(255,255,255,0.08)',
						p: 3,
					}}>
					<Typography
						variant="h6"
						component="span"
						fontWeight={700}
						color="white"
						sx={{
							'animation': 'slideInLeft 0.4s ease-out',
							'position': 'relative',
							'&::after': {
								content: '""',
								position: 'absolute',
								bottom: -4,
								left: 0,
								width: '40px',
								height: '3px',
								background: 'linear-gradient(90deg, #2196f3, #64b5f6, #2196f3)',
								borderRadius: '2px',
								animation: 'shimmer 2s infinite',
							},
							...modalAnimations,
						}}>
						Apply for Leave
					</Typography>
					<IconButton
						onClick={onClose}
						disabled={loading}
						sx={{
							'color': 'rgba(255,255,255,0.7)',
							'animation': 'slideInRight 0.4s ease-out',
							'transition': 'all 0.2s ease',
							'&:hover': {
								transform: 'rotate(90deg) scale(1.1)',
								color: '#f44336',
								bgcolor: 'rgba(244, 67, 54, 0.1)',
							},
							...modalAnimations,
						}}>
						<CloseIcon />
					</IconButton>
				</DialogTitle>

				{/* Content with staggered animations */}
				<DialogContent sx={{ p: 4 }}>
					{error && (
						<Alert
							severity="error"
							sx={{
								mb: 3,
								animation: 'shake 0.5s ease-in-out',
								...modalAnimations,
							}}>
							{error}
						</Alert>
					)}

					<Grid
						container
						spacing={3}
						columns={12}
						sx={{ py: 2 }}>
						{/* Leave Type */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInRight 0.4s ease-out',
								...modalAnimations,
							}}>
							<TextField
								select
								fullWidth
								label="Leave Type"
								name="leaveTypeId"
								value={formData.leaveTypeId}
								onChange={handleChange}
								variant="outlined"
								size="small"
								error={!!fieldErrors.leaveTypeId}
								helperText={fieldErrors.leaveTypeId || ' '}
								disabled={loading}
								sx={{
									'& .MuiOutlinedInput-root': {
										'color': 'white',
										'height': '45px',
										'transition': 'all 0.2s ease',
										'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused fieldset': { borderColor: '#2196f3' },
										'&.Mui-focused': {
											animation: 'pulse-glow 1.5s infinite',
											...modalAnimations,
										},
									},
									'& .MuiInputLabel-root': {
										'color': 'rgba(255,255,255,0.7)',
										'&.Mui-focused': { color: '#2196f3' },
									},
									'& .MuiSelect-icon': {
										color: 'rgba(255,255,255,0.5)',
									},
								}}>
								<MenuItem value="">Select leave type</MenuItem>
								<MenuItem value="annual">Annual Leave</MenuItem>
								<MenuItem value="sick">Sick Leave</MenuItem>
								<MenuItem value="personal">Personal Leave</MenuItem>
								<MenuItem value="maternity">Maternity Leave</MenuItem>
							</TextField>
						</Grid>

						{/* Half Day */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInLeft 0.4s ease-out 0.05s both',
								...modalAnimations,
							}}>
							<Stack
								direction="row"
								alignItems="center"
								spacing={2}
								sx={{
									height: '100%',
									width: '100%',
								}}>
								<FormControlLabel
									control={
										<Switch
											checked={formData.isHalfDay}
											onChange={handleChange}
											name="isHalfDay"
											color="primary"
											disabled={loading}
											sx={{
												'& .MuiSwitch-switchBase.Mui-checked': {
													color: '#2196f3',
												},
												'& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
													backgroundColor: '#2196f3',
												},
											}}
										/>
									}
									label="Half Day"
									sx={{
										'm': 0,
										'& .MuiFormControlLabel-label': {
											color: 'white',
										},
									}}
								/>
								{formData.isHalfDay && (
									<TextField
										select
										size="small"
										name="halfDayPart"
										error={!!fieldErrors.halfDayPart}
										helperText={fieldErrors.halfDayPart || ' '}
										value={formData.halfDayPart}
										onChange={handleChange}
										disabled={loading}
										variant="outlined"
										sx={{
											'flex': 1,
											'& .MuiOutlinedInput-root': {
												'color': 'white',
												'height': '45px',
												'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
												'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
												'&.Mui-focused fieldset': { borderColor: '#2196f3' },
											},
											'& .MuiSelect-icon': {
												color: 'rgba(255,255,255,0.5)',
											},
										}}>
										<MenuItem value="FIRST_HALF">First Half</MenuItem>
										<MenuItem value="SECOND_HALF">Second Half</MenuItem>
									</TextField>
								)}
							</Stack>
						</Grid>

						{/* Start Date */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInRight 0.4s ease-out 0.1s both',
								...modalAnimations,
							}}>
							<DatePicker
								label="Start Date"
								value={formData.startDate}
								onChange={(newValue) => handleDateChange('startDate', newValue)}
								disabled={loading}
								error={!!fieldErrors.startDate}
								helperText={fieldErrors.startDate || ' '}
								slotProps={{
									textField: {
										fullWidth: true,
										size: 'small',
										required: true,
										InputProps: {
											sx: {
												height: '45px',
											},
										},
										sx: {
											'& .MuiOutlinedInput-root': {
												'color': 'white',
												'height': '45px',
												'transition': 'all 0.2s ease',
												'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
												'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
												'&.Mui-focused fieldset': { borderColor: '#2196f3' },
											},
											'& .MuiInputLabel-root': {
												'color': 'rgba(255,255,255,0.7)',
												'transform': 'translate(14px, 14px) scale(1)',
												'&.Mui-focused': { color: '#2196f3' },
												'&.MuiInputLabel-shrink': {
													transform: 'translate(14px, -9px) scale(0.75)',
												},
											},
											'& .MuiInputAdornment-root .MuiSvgIcon-root': {
												color: '#2196f3',
												transition: 'transform 0.2s ease',
											},
											'&:hover .MuiInputAdornment-root .MuiSvgIcon-root': {
												transform: 'scale(1.1)',
											},
										},
									},
									popper: {
										sx: {
											'& .MuiPaper-root': {
												bgcolor: '#1e293b',
												color: 'white',
												border: '1px solid rgba(255,255,255,0.08)',
												animation: 'fadeIn 0.2s ease-out',
												...modalAnimations,
											},
											'& .MuiPickersDay-root': {
												'color': 'white',
												'transition': 'all 0.2s ease',
												'&:hover': {
													bgcolor: 'rgba(33, 150, 243, 0.2)',
													transform: 'scale(1.1)',
												},
												'&.Mui-selected': {
													'bgcolor': '#2196f3',
													'&:hover': {
														bgcolor: '#1976d2',
													},
												},
											},
										},
									},
								}}
							/>
						</Grid>

						{/* End Date */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInLeft 0.4s ease-out 0.15s both',
								...modalAnimations,
							}}>
							<DatePicker
								label="End Date"
								value={formData.endDate}
								onChange={(newValue) => handleDateChange('endDate', newValue)}
								disabled={loading}
								error={!!fieldErrors.endDate}
								helperText={fieldErrors.endDate || ' '}
								slotProps={{
									textField: {
										fullWidth: true,
										size: 'small',
										required: true,
										InputProps: {
											sx: {
												height: '45px',
											},
										},
										sx: {
											'& .MuiOutlinedInput-root': {
												'color': 'white',
												'height': '45px',
												'transition': 'all 0.2s ease',
												'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
												'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
												'&.Mui-focused fieldset': { borderColor: '#2196f3' },
											},
											'& .MuiInputLabel-root': {
												'color': 'rgba(255,255,255,0.7)',
												'transform': 'translate(14px, 14px) scale(1)',
												'&.Mui-focused': { color: '#2196f3' },
												'&.MuiInputLabel-shrink': {
													transform: 'translate(14px, -9px) scale(0.75)',
												},
											},
											'& .MuiInputAdornment-root .MuiSvgIcon-root': {
												color: '#2196f3',
												transition: 'transform 0.2s ease',
											},
											'&:hover .MuiInputAdornment-root .MuiSvgIcon-root': {
												transform: 'scale(1.1)',
											},
										},
									},
									popper: {
										sx: {
											'& .MuiPaper-root': {
												bgcolor: '#1e293b',
												color: 'white',
												border: '1px solid rgba(255,255,255,0.08)',
												animation: 'fadeIn 0.2s ease-out',
												...modalAnimations,
											},
											'& .MuiPickersDay-root': {
												'color': 'white',
												'transition': 'all 0.2s ease',
												'&:hover': {
													bgcolor: 'rgba(33, 150, 243, 0.2)',
													transform: 'scale(1.1)',
												},
												'&.Mui-selected': {
													'bgcolor': '#2196f3',
													'&:hover': {
														bgcolor: '#1976d2',
													},
												},
											},
										},
									},
								}}
							/>
						</Grid>

						{/* Reason */}
						<Grid
							item
							size={{ xs: 12 }}
							sx={{
								animation: 'fadeIn 0.5s ease-out 0.2s both',
								...modalAnimations,
							}}>
							<TextField
								fullWidth
								label="Reason"
								name="reason"
								value={formData.reason}
								onChange={handleChange}
								required
								multiline
								rows={3}
								minRows={3}
								error={!!fieldErrors.reason}
								helperText={fieldErrors.reason || ' '}
								variant="outlined"
								disabled={loading}
								sx={{
									'& .MuiOutlinedInput-root': {
										'color': 'white',
										'minHeight': '70px',
										'alignItems': 'flex-start',
										'transition': 'all 0.2s ease',
										'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused fieldset': { borderColor: '#2196f3' },
										'&.Mui-focused': {
											animation: 'pulse-glow 1.5s infinite',
											...modalAnimations,
										},
									},
									'& .MuiInputLabel-root': {
										'color': 'rgba(255,255,255,0.7)',
										'&.Mui-focused': { color: '#2196f3' },
										'&.MuiInputLabel-shrink': {
											transform: 'translate(14px, -9px) scale(0.75)',
										},
									},
									'& .MuiFormHelperText-root': {
										color: 'rgba(255,255,255,0.5)',
									},
								}}
							/>
						</Grid>

						{/* Emergency Contact */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInRight 0.4s ease-out 0.25s both',
								...modalAnimations,
							}}>
							<TextField
								fullWidth
								label="Emergency Contact Name"
								name="emergencyContact"
								value={formData.emergencyContact}
								onChange={handleChange}
								error={!!fieldErrors.emergencyContact}
								helperText={fieldErrors.emergencyContact || ' '}
								disabled={loading}
								InputProps={{
									startAdornment: (
										<InputAdornment position="start">
											<PersonIcon
												fontSize="small"
												sx={{
													color: '#2196f3',
													transition: 'transform 0.2s ease',
												}}
											/>
										</InputAdornment>
									),
								}}
								variant="outlined"
								sx={{
									'& .MuiOutlinedInput-root': {
										'color': 'white',
										'height': '45px',
										'transition': 'all 0.2s ease',
										'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused fieldset': { borderColor: '#2196f3' },
										'&:hover .MuiInputAdornment-root .MuiSvgIcon-root': {
											transform: 'scale(1.2) rotate(5deg)',
										},
									},
									'& .MuiInputLabel-root': {
										'color': 'rgba(255,255,255,0.7)',
										'&.Mui-focused': { color: '#2196f3' },
									},
								}}
							/>
						</Grid>

						{/* Contact Phone */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInLeft 0.4s ease-out 0.3s both',
								...modalAnimations,
							}}>
							<TextField
								fullWidth
								label="Contact Phone"
								name="contactPhone"
								value={formData.contactPhone}
								onChange={handleChange}
								disabled={loading}
								error={!!fieldErrors.contactPhone}
								helperText={fieldErrors.contactPhone || ' '}
								InputProps={{
									startAdornment: (
										<InputAdornment position="start">
											<PhoneIcon
												fontSize="small"
												sx={{
													color: '#2196f3',
													transition: 'transform 0.2s ease',
												}}
											/>
										</InputAdornment>
									),
								}}
								variant="outlined"
								sx={{
									'& .MuiOutlinedInput-root': {
										'color': 'white',
										'height': '45px',
										'transition': 'all 0.2s ease',
										'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused fieldset': { borderColor: '#2196f3' },
										'&:hover .MuiInputAdornment-root .MuiSvgIcon-root': {
											transform: 'scale(1.2) rotate(-5deg)',
										},
									},
									'& .MuiInputLabel-root': {
										'color': 'rgba(255,255,255,0.7)',
										'&.Mui-focused': { color: '#2196f3' },
									},
								}}
							/>
						</Grid>

						{/* Handover */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInRight 0.4s ease-out 0.35s both',
								...modalAnimations,
							}}>
							<TextField
								fullWidth
								label="Handover To (Staff Name or ID)"
								name="handoverTo"
								value={formData.handoverTo}
								onChange={handleChange}
								disabled={loading}
								error={!!fieldErrors.handoverTo}
								helperText={fieldErrors.handoverTo || ' '}
								variant="outlined"
								sx={{
									'& .MuiOutlinedInput-root': {
										'color': 'white',
										'height': '45px',
										'transition': 'all 0.2s ease',
										'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused fieldset': { borderColor: '#2196f3' },
									},
									'& .MuiInputLabel-root': {
										'color': 'rgba(255,255,255,0.7)',
										'&.Mui-focused': { color: '#2196f3' },
									},
								}}
							/>
						</Grid>

						{/* Handover Notes */}
						<Grid
							item
							size={{ xs: 12, md: 6 }}
							sx={{
								animation: 'slideInLeft 0.4s ease-out 0.4s both',
								...modalAnimations,
							}}>
							<TextField
								fullWidth
								label="Handover Notes"
								name="handoverNotes"
								value={formData.handoverNotes}
								onChange={handleChange}
								multiline
								rows={2}
								error={!!fieldErrors.handoverNotes}
								helperText={fieldErrors.handoverNotes || ' '}
								disabled={loading}
								variant="outlined"
								sx={{
									'& .MuiOutlinedInput-root': {
										'color': 'white',
										'height': '45px',
										'transition': 'all 0.2s ease',
										'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused fieldset': { borderColor: '#2196f3' },
									},
									'& .MuiInputLabel-root': {
										'color': 'rgba(255,255,255,0.7)',
										'&.Mui-focused': { color: '#2196f3' },
									},
								}}
							/>
						</Grid>

						{/* Attachment */}
						<Grid
							item
							size={{ xs: 12 }}
							sx={{
								animation: 'fadeIn 0.5s ease-out 0.45s both',
								...modalAnimations,
							}}>
							<Button
								variant="contained"
								component="label"
								fullWidth
								startIcon={<AttachFileIcon sx={{ transition: 'transform 0.2s ease' }} />}
								disabled={loading}
								error={!!fieldErrors.handoverNotes}
								helperText={fieldErrors.handoverNotes || ' '}
								color={fileError ? 'error' : 'primary'}
								sx={{
									'py': 1.5,
									'color': 'white',
									'border': '1px solid rgba(255,255,255,0.1)',
									'transition': 'all 0.3s ease',
									'&:hover': {
										'backgroundColor': fileError ? '#d32f2f' : '#1976d2',
										'transform': 'scale(1.01)',
										'& .MuiSvgIcon-root': {
											transform: 'rotate(15deg) scale(1.1)',
										},
									},
								}}>
								{file ? file.name : fileError ? 'Invalid file. Try again.' : 'Upload Attachment (PDF, JPG, PNG, WEBP, DOC)'}
								<input
									type="file"
									hidden
									accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
									onChange={handleFileChange}
								/>
							</Button>
							{fileError && (
								<Typography
									variant="caption"
									color="error"
									sx={{
										mt: 1,
										display: 'block',
										animation: 'shake 0.3s ease-in-out',
										...modalAnimations,
									}}>
									{fileError}
								</Typography>
							)}
						</Grid>

						{/* Medical Certificate Section */}
						<Grid
							item
							size={{ xs: 12 }}
							sx={{
								animation: 'fadeIn 0.5s ease-out 0.5s both',
								...modalAnimations,
							}}>
							<Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.12)' }} />
							<Typography
								variant="subtitle1"
								color="white"
								gutterBottom
								sx={{
									animation: 'slideInLeft 0.4s ease-out',
									...modalAnimations,
								}}>
								Medical Certificate (if applicable)
							</Typography>
							<Grid
								container
								columns={12}
								spacing={2}
								sx={{ pt: 2 }}>
								{/* Certificate Number */}
								<Grid
									item
									size={{ xs: 12, md: 6 }}
									sx={{
										animation: 'slideInRight 0.4s ease-out 0.55s both',
										...modalAnimations,
									}}>
									<TextField
										fullWidth
										label="Certificate Number"
										name="medicalCertificateNumber"
										value={formData.medicalCertificateNumber}
										error={!!fieldErrors.medicalCertificateNumber}
										helperText={fieldErrors.medicalCertificateNumber || ' '}
										onChange={handleChange}
										disabled={loading}
										variant="outlined"
										sx={{
											'& .MuiOutlinedInput-root': {
												'color': 'white',
												'height': '45px',
												'transition': 'all 0.2s ease',
												'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
												'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
												'&.Mui-focused fieldset': { borderColor: '#2196f3' },
											},
											'& .MuiInputLabel-root': {
												'color': 'rgba(255,255,255,0.7)',
												'&.Mui-focused': { color: '#2196f3' },
											},
										}}
									/>
								</Grid>

								{/* Issue Date */}
								<Grid
									item
									size={{ xs: 12, md: 6 }}
									sx={{
										animation: 'slideInLeft 0.4s ease-out 0.6s both',
										...modalAnimations,
									}}>
									<DatePicker
										label="Issue Date"
										value={formData.medicalCertificateDate}
										onChange={(newValue) => handleDateChange('medicalCertificateDate', newValue)}
										disabled={loading}
										error={!!fieldErrors.medicalCertificateDate}
										helperText={fieldErrors.medicalCertificateDate || ' '}
										slotProps={{
											textField: {
												fullWidth: true,
												size: 'small',
												required: true,
												InputProps: {
													sx: {
														height: '45px',
													},
												},
												sx: {
													'& .MuiOutlinedInput-root': {
														'color': 'white',
														'height': '45px',
														'transition': 'all 0.2s ease',
														'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
														'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
														'&.Mui-focused fieldset': { borderColor: '#2196f3' },
													},
													'& .MuiInputLabel-root': {
														'color': 'rgba(255,255,255,0.7)',
														'transform': 'translate(14px, 14px) scale(1)',
														'&.Mui-focused': { color: '#2196f3' },
														'&.MuiInputLabel-shrink': {
															transform: 'translate(14px, -9px) scale(0.75)',
														},
													},
												},
											},
											popper: {
												sx: {
													'& .MuiPaper-root': {
														bgcolor: '#1e293b',
														color: 'white',
														border: '1px solid rgba(255,255,255,0.08)',
														animation: 'fadeIn 0.2s ease-out',
														...modalAnimations,
													},
												},
											},
										}}
									/>
								</Grid>

								{/* Issuer */}
								<Grid
									item
									size={{ xs: 12, md: 6 }}
									sx={{
										animation: 'slideInRight 0.4s ease-out 0.65s both',
										...modalAnimations,
									}}>
									<TextField
										fullWidth
										label="Issuer"
										name="medicalCertificateIssuer"
										value={formData.medicalCertificateIssuer}
										error={!!fieldErrors.medicalCertificateIssuer}
										helperText={fieldErrors.medicalCertificateIssuer || ' '}
										onChange={handleChange}
										disabled={loading}
										variant="outlined"
										sx={{
											'& .MuiOutlinedInput-root': {
												'color': 'white',
												'height': '45px',
												'transition': 'all 0.2s ease',
												'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
												'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
												'&.Mui-focused fieldset': { borderColor: '#2196f3' },
											},
											'& .MuiInputLabel-root': {
												'color': 'rgba(255,255,255,0.7)',
												'&.Mui-focused': { color: '#2196f3' },
											},
										}}
									/>
								</Grid>
							</Grid>
						</Grid>
					</Grid>
				</DialogContent>

				{/* Actions */}
				<DialogActions
					sx={{
						p: 3,
						borderTop: '1px solid rgba(255,255,255,0.08)',
						gap: 2,
						justifyContent: 'flex-end',
						animation: 'fadeIn 0.5s ease-out 0.7s both',
						...modalAnimations,
					}}>
					<Button
						onClick={onClose}
						disabled={loading}
						sx={{
							'height': 40,
							'px': 3,
							'borderRadius': 1,
							'bgcolor': '#374151',
							'color': '#ffffff',
							'fontWeight': 700,
							'textTransform': 'none',
							'letterSpacing': '0.015em',
							'boxShadow': 'none',
							'transition': 'all 0.2s ease',
							'&:hover': {
								bgcolor: '#4b5563',
								transform: 'scale(1.02)',
							},
							'&:active': {
								transform: 'scale(0.98)',
							},
						}}>
						Cancel
					</Button>

					<Button
						variant="contained"
						onClick={handleSubmit}
						disabled={loading || !!fileError}
						startIcon={
							loading ? (
								<CircularProgress
									size={20}
									color="inherit"
									sx={{
										'animation': 'spin 1s linear infinite, pulse-glow 1.5s infinite',
										'@keyframes spin': {
											'0%': { transform: 'rotate(0deg)' },
											'100%': { transform: 'rotate(360deg)' },
										},
										...modalAnimations,
									}}
								/>
							) : null
						}
						sx={{
							'height': 40,
							'px': 4,
							'borderRadius': 1,
							'bgcolor': '#2196f3',
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
							'&:hover:not(:disabled)': {
								'bgcolor': '#1976d2',
								'transform': 'scale(1.02) translateY(-2px)',
								'&::before': {
									width: '200px',
									height: '200px',
								},
							},
							'&:active:not(:disabled)': {
								transform: 'scale(0.98)',
							},
							'&:disabled': { bgcolor: '#4b5563' },
						}}>
						{loading ? 'Submitting...' : 'Submit Request'}
					</Button>
				</DialogActions>
			</Dialog>
		</LocalizationProvider>
	);
};

// Add these animations at the top of your component
const modalAnimations = {
	'@keyframes slideInUp': {
		'0%': {
			transform: 'translateY(100px) scale(0.8)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateY(0) scale(1)',
			opacity: 1,
		},
	},
	'@keyframes fadeIn': {
		'0%': { opacity: 0 },
		'100%': { opacity: 1 },
	},
	'@keyframes slideInRight': {
		'0%': {
			transform: 'translateX(50px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0)',
			opacity: 1,
		},
	},
	'@keyframes slideInLeft': {
		'0%': {
			transform: 'translateX(-50px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0)',
			opacity: 1,
		},
	},
	'@keyframes pulse-glow': {
		'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
		'70%': { boxShadow: '0 0 0 10px rgba(33, 150, 243, 0)' },
		'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
	},
	'@keyframes shake': {
		'0%, 100%': { transform: 'translateX(0)' },
		'25%': { transform: 'translateX(-5px)' },
		'75%': { transform: 'translateX(5px)' },
	},
	'@keyframes float': {
		'0%': { transform: 'translateY(0px)' },
		'50%': { transform: 'translateY(-5px)' },
		'100%': { transform: 'translateY(0px)' },
	},
};

export default LeaveApplicationModal;

// import React, { useState } from 'react';
// import {
// 	Dialog,
// 	DialogTitle,
// 	DialogContent,
// 	DialogActions,
// 	IconButton,
// 	Typography,
// 	TextField,
// 	MenuItem,
// 	FormControlLabel,
// 	Switch,
// 	Button,
// 	CircularProgress,
// 	Alert,
// 	Grid,
// 	Divider,
// 	InputAdornment,
// 	Stack,
// } from '@mui/material';

// import { DatePicker } from '@mui/x-date-pickers/DatePicker';
// import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
// import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
// import CloseIcon from '@mui/icons-material/Close';
// import AttachFileIcon from '@mui/icons-material/AttachFile';
// import PersonIcon from '@mui/icons-material/Person';
// import PhoneIcon from '@mui/icons-material/Phone';
// import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

// const LeaveApplicationModal = ({ open, onClose, onSuccess }) => {
// 	const [formData, setFormData] = useState({
// 		leaveTypeId: '',
// startDate: null,
// 		endDate: null,
// 		reason: '',
// 		emergencyContact: '',
// 		contactPhone: '',
// 		handoverTo: '',
// 		handoverNotes: '',
// 		isHalfDay: false,
// 		halfDayPart: 'FIRST_HALF',
// 		attachmentUrl: '',
// 		fileName: '',
// 		medicalCertificateNumber: '',
// 		medicalCertificateDate: '',
// 		medicalCertificateIssuer: '',
// 	});

// 	const [file, setFile] = useState(null);
// 	const [fileError, setFileError] = useState('');
// 	const [loading, setLoading] = useState(false);
// 	const [error, setError] = useState('');

// 	// Allowed file types
// 	const allowedFileTypes = [
// 		'application/pdf',
// 		'image/jpeg',
// 		'image/jpg',
// 		'image/png',
// 		'image/webp',
// 		'application/msword',
// 		'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
// 	];

// 	const handleChange = (e) => {
// 		const { name, value, type, checked } = e.target;
// 		setFormData((prev) => ({
// 			...prev,
// 			[name]: type === 'checkbox' ? checked : value,
// 		}));
// 	};

// 	const handleFileChange = (e) => {
// 		const selectedFile = e.target.files[0];
// 		setFileError('');

// 		if (selectedFile) {
// 			// Check file type
// 			if (!allowedFileTypes.includes(selectedFile.type)) {
// 				setFileError('Invalid file type. Please upload PDF, images (JPG, PNG, WEBP), or DOC files.');
// 				setFile(null);
// 				setFormData((prev) => ({
// 					...prev,
// 					fileName: '',
// 				}));
// 				return;
// 			}

// 			// Check file size (optional - 5MB limit)
// 			if (selectedFile.size > 5 * 1024 * 1024) {
// 				setFileError('File size exceeds 5MB limit.');
// 				setFile(null);
// 				setFormData((prev) => ({
// 					...prev,
// 					fileName: '',
// 				}));
// 				return;
// 			}

// 			setFile(selectedFile);
// 			setFormData((prev) => ({
// 				...prev,
// 				fileName: selectedFile.name,
// 			}));
// 		}
// 	};

// 	const handleSubmit = async () => {
// 		// Basic client-side validation
// 		if (!formData.leaveTypeId) return setError('Leave type is required');
// 		if (!formData.startDate || !formData.endDate) return setError('Dates are required');
// 		if (formData.reason.length < 5) return setError('Reason must be at least 5 characters');

// 		setLoading(true);
// 		setError('');

// 		try {
// 			// Simulate API POST
// 			await new Promise((resolve) => setTimeout(resolve, 1800));

// 			// Mock success
// 			const mockResponse = {
// 				success: true,
// 				message: 'Leave application submitted successfully',
// 				data: {
// 					leaveRequestId: 'clxyz456...',
// 					referenceNumber: 'LR-ABC-123XYZ',
// 					status: 'PENDING',
// 					requestedDays: 5,
// 				},
// 			};

// 			onSuccess?.(mockResponse.data);
// 			onClose();
// 		} catch (err) {
// 			setError('Failed to submit leave request. Please try again.');
// 		} finally {
// 			setLoading(false);
// 		}
// 	};

// 	return (
// 		<Dialog
// 			open={open}
// 			onClose={!loading ? onClose : undefined}
// 			maxWidth="md"
// 			fullWidth
// 			PaperProps={{
// 				sx: {
// 					borderRadius: 3,
// 					bgcolor: '#0f172a',
// 					color: '#e5e7eb',
// 					border: '1px solid rgba(255,255,255,0.08)',
// 					boxShadow: 24,
// 				},
// 			}}>
// 			{/* Header */}
// 			<DialogTitle
// 				sx={{
// 					display: 'flex',
// 					justifyContent: 'space-between',
// 					alignItems: 'center',
// 					borderBottom: '1px solid rgba(255,255,255,0.08)',
// 					p: 3,
// 				}}>
// 				<Typography
// 					variant="h6"
// 					component="span"
// 					fontWeight={700}
// 					color="white">
// 					Apply for Leave
// 				</Typography>
// 				<IconButton
// 					onClick={onClose}
// 					disabled={loading}
// 					sx={{ color: 'rgba(255,255,255,0.7)' }}>
// 					<CloseIcon />
// 				</IconButton>
// 			</DialogTitle>

// 			{/* Content */}
// 			<DialogContent sx={{ p: 4 }}>
// 				{error && (
// 					<Alert
// 						severity="error"
// 						sx={{ mb: 3 }}>
// 						{error}
// 					</Alert>
// 				)}

// 				<Grid
// 					container
// 					spacing={3}
// 					columns={12}
// 					sx={{ py: 2 }}>
// 					{/* Leave Type */}
// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							select
// 							fullWidth
// 							label="Leave Type "
// 							name="leaveTypeId"
// 							value={formData.leaveTypeId}
// 							onChange={handleChange}
// 							variant="outlined"
// 							size="small"
// 							disabled={loading}>
// 							<MenuItem value="">Select leave type</MenuItem>
// 							<MenuItem value="annual">Annual Leave</MenuItem>
// 							<MenuItem value="sick">Sick Leave</MenuItem>
// 							<MenuItem value="personal">Personal Leave</MenuItem>
// 							<MenuItem value="maternity">Maternity Leave</MenuItem>
// 						</TextField>
// 					</Grid>

// 					{/* Half Day - Now with select on same row */}
// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<Stack
// 							direction="row"
// 							alignItems="center"
// 							spacing={2}
// 							sx={{
// 								height: '100%',
// 								width: '100%',
// 							}}>
// 							<FormControlLabel
// 								control={
// 									<Switch
// 										checked={formData.isHalfDay}
// 										onChange={handleChange}
// 										name="isHalfDay"
// 										color="primary"
// 										disabled={loading}
// 									/>
// 								}
// 								label="Half Day"
// 								sx={{
// 									flex: formData.isHalfDay ? '0 0 auto' : 1,
// 									m: 0,
// 								}}
// 							/>
// 							{formData.isHalfDay && (
// 								<TextField
// 									select
// 									size="small"
// 									name="halfDayPart"
// 									value={formData.halfDayPart}
// 									onChange={handleChange}
// 									disabled={loading}
// 									variant="outlined"
// 									fullWidth
// 									sx={{
// 										flex: 1,
// 									}}>
// 									<MenuItem value="FIRST_HALF">First Half</MenuItem>
// 									<MenuItem value="SECOND_HALF">Second Half</MenuItem>
// 								</TextField>
// 							)}
// 						</Stack>
// 					</Grid>

// 					{/* Dates */}
// 					{/* <Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="Start Date "
// 							type="date"
// 							name="startDate"
// 							value={formData.startDate}
// 							onChange={handleChange}
// 							required
// 							InputLabelProps={{ shrink: true }}
// 							disabled={loading}
// 							variant="outlined"
// 						/>
// 					</Grid>

// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="End Date "
// 							type="date"
// 							name="endDate"
// 							value={formData.endDate}
// 							onChange={handleChange}
// 							required
// 							InputLabelProps={{ shrink: true }}
// 							disabled={loading}
// 							variant="outlined"
// 						/>
// 					</Grid> */}
// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="Start Date "
// 							type="date"
// 							name="startDate"
// 							value={formData.startDate}
// 							onChange={handleChange}
// 							required
// 							InputLabelProps={{ shrink: true }}
// 							disabled={loading}
// 							variant="outlined"
// 							InputProps={{
// 								startAdornment: (
// 									<InputAdornment position="start">
// 										<CalendarTodayIcon sx={{ color: '#2196f3', fontSize: 20 }} />
// 									</InputAdornment>
// 								),
// 							}}
// 							inputProps={{
// 								sx: {
// 									'&::-webkit-calendar-picker-indicator': {
// 										display: 'none',
// 										opacity: 0,
// 									},
// 								},
// 							}}
// 							sx={{
// 								'& .MuiOutlinedInput-root': {
// 									'color': 'white',
// 									'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
// 									'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
// 									'&.Mui-focused fieldset': { borderColor: '#2196f3' },
// 								},
// 								'& .MuiInputLabel-root': {
// 									'color': 'rgba(255,255,255,0.7)',
// 									'&.Mui-focused': {
// 										color: '#2196f3',
// 									},
// 								},
// 								'& .MuiInputAdornment-root': {
// 									marginRight: 0.5,
// 								},
// 								'& input[type="date"]': {
// 									'&::-webkit-calendar-picker-indicator': {
// 										display: 'none',
// 										opacity: 0,
// 									},
// 								},
// 							}}
// 						/>
// 					</Grid>

// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="End Date "
// 							type="date"
// 							name="endDate"
// 							value={formData.endDate}
// 							onChange={handleChange}
// 							required
// 							InputLabelProps={{ shrink: true }}
// 							disabled={loading}
// 							variant="outlined"
// 							InputProps={{
// 								startAdornment: (
// 									<InputAdornment position="start">
// 										<CalendarTodayIcon sx={{ color: '#2196f3', fontSize: 20 }} />
// 									</InputAdornment>
// 								),
// 							}}
// 							inputProps={{
// 								sx: {
// 									'&::-webkit-calendar-picker-indicator': {
// 										display: 'none',
// 										opacity: 0,
// 									},
// 								},
// 							}}
// 							sx={{
// 								'& .MuiOutlinedInput-root': {
// 									'color': 'white',
// 									'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
// 									'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
// 									'&.Mui-focused fieldset': { borderColor: '#2196f3' },
// 								},
// 								'& .MuiInputLabel-root': {
// 									'color': 'rgba(255,255,255,0.7)',
// 									'&.Mui-focused': {
// 										color: '#2196f3',
// 									},
// 								},
// 								'& .MuiInputAdornment-root': {
// 									marginRight: 0.5,
// 								},
// 								'& input[type="date"]': {
// 									'&::-webkit-calendar-picker-indicator': {
// 										display: 'none',
// 										opacity: 0,
// 									},
// 								},
// 							}}
// 						/>
// 					</Grid>

// 					{/* Reason */}
// 					<Grid
// 						item
// 						size={{ xs: 12 }}>
// 						<TextField
// 							fullWidth
// 							label="Reason "
// 							name="reason"
// 							value={formData.reason}
// 							onChange={handleChange}
// 							required
// 							multiline
// 							rows={4}
// 							variant="outlined"
// 							helperText={`${formData.reason.length}/500 characters`}
// 							disabled={loading}
// 						/>
// 					</Grid>

// 					{/* Emergency Contact */}
// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="Emergency Contact Name"
// 							name="emergencyContact"
// 							value={formData.emergencyContact}
// 							onChange={handleChange}
// 							disabled={loading}
// 							InputProps={{
// 								startAdornment: (
// 									<InputAdornment position="start">
// 										<PersonIcon
// 											fontSize="small"
// 											sx={{ color: 'text.secondary' }}
// 										/>
// 									</InputAdornment>
// 								),
// 							}}
// 							variant="outlined"
// 						/>
// 					</Grid>

// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="Contact Phone"
// 							name="contactPhone"
// 							value={formData.contactPhone}
// 							onChange={handleChange}
// 							disabled={loading}
// 							InputProps={{
// 								startAdornment: (
// 									<InputAdornment position="start">
// 										<PhoneIcon
// 											fontSize="small"
// 											sx={{ color: 'text.secondary' }}
// 										/>
// 									</InputAdornment>
// 								),
// 							}}
// 							variant="outlined"
// 						/>
// 					</Grid>

// 					{/* Handover */}
// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="Handover To (Staff Name or ID)"
// 							name="handoverTo"
// 							value={formData.handoverTo}
// 							onChange={handleChange}
// 							disabled={loading}
// 							variant="outlined"
// 						/>
// 					</Grid>

// 					<Grid
// 						item
// 						size={{ xs: 12, md: 6 }}>
// 						<TextField
// 							fullWidth
// 							label="Handover Notes"
// 							name="handoverNotes"
// 							value={formData.handoverNotes}
// 							onChange={handleChange}
// 							multiline
// 							rows={2}
// 							disabled={loading}
// 							variant="outlined"
// 						/>
// 					</Grid>

// 					{/* Attachment */}
// 					<Grid
// 						item
// 						size={{ xs: 12 }}>
// 						<Button
// 							variant="contained"
// 							component="label"
// 							fullWidth
// 							startIcon={<AttachFileIcon />}
// 							disabled={loading}
// 							color={fileError ? 'error' : 'primary'}
// 							sx={{
// 								'py': 1.5,
// 								'&:hover': {
// 									backgroundColor: fileError ? '#d32f2f' : '#1976d2',
// 									boxShadow: 'none',
// 								},
// 							}}>
// 							{file ? file.name : fileError ? 'Invalid file. Try again.' : 'Upload Attachment (PDF, JPG, PNG, WEBP, DOC)'}
// 							<input
// 								type="file"
// 								hidden
// 								accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
// 								onChange={handleFileChange}
// 							/>
// 						</Button>
// 						{fileError && (
// 							<Typography
// 								variant="caption"
// 								color="error"
// 								sx={{ mt: 1, display: 'block' }}>
// 								{fileError}
// 							</Typography>
// 						)}
// 					</Grid>

// 					{/* Medical Certificate */}
// 					<Grid
// 						item
// 						size={{ xs: 12 }}>
// 						<Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.12)' }} />
// 						<Typography
// 							variant="subtitle1"
// 							color="white"
// 							gutterBottom>
// 							Medical Certificate (if applicable)
// 						</Typography>
// 						<Grid
// 							container
// 							columns={12}
// 							spacing={2}
// 							sx={{ pt: 2 }}>
// 							<Grid
// 								item
// 								size={{ xs: 12, md: 6 }}>
// 								<TextField
// 									fullWidth
// 									label="Certificate Number"
// 									name="medicalCertificateNumber"
// 									value={formData.medicalCertificateNumber}
// 									onChange={handleChange}
// 									disabled={loading}
// 									variant="outlined"
// 								/>
// 							</Grid>
// 							<Grid
// 								item
// 								size={{ xs: 12, md: 6 }}>
// 								<TextField
// 									fullWidth
// 									label="Issue Date"
// 									type="date"
// 									name="medicalCertificateDate"
// 									value={formData.medicalCertificateDate}
// 									onChange={handleChange}
// 									InputLabelProps={{ shrink: true }}
// 									disabled={loading}
// 									variant="outlined"
// 								/>
// 							</Grid>
// 							<Grid
// 								item
// 								size={{ xs: 12, md: 6 }}>
// 								<TextField
// 									fullWidth
// 									label="Issuer"
// 									name="medicalCertificateIssuer"
// 									value={formData.medicalCertificateIssuer}
// 									onChange={handleChange}
// 									disabled={loading}
// 									variant="outlined"
// 								/>
// 							</Grid>
// 						</Grid>
// 					</Grid>
// 				</Grid>
// 			</DialogContent>

// 			{/* Actions */}
// 			<DialogActions
// 				sx={{
// 					p: 3,
// 					borderTop: '1px solid rgba(255,255,255,0.08)',
// 					gap: 2,
// 					justifyContent: 'flex-end',
// 				}}>
// 				<Button
// 					onClick={onClose}
// 					disabled={loading}
// 					sx={{
// 						'height': 40,
// 						'px': 3,
// 						'borderRadius': 1,
// 						'bgcolor': '#374151',
// 						'color': '#ffffff',
// 						'fontWeight': 700,
// 						'textTransform': 'none',
// 						'letterSpacing': '0.015em',
// 						'boxShadow': 'none',
// 						'&:hover': { bgcolor: '#4b5563' },
// 					}}>
// 					Cancel
// 				</Button>

// 				<Button
// 					variant="contained"
// 					onClick={handleSubmit}
// 					disabled={loading || !!fileError}
// 					startIcon={
// 						loading ? (
// 							<CircularProgress
// 								size={20}
// 								color="inherit"
// 							/>
// 						) : null
// 					}
// 					sx={{
// 						'height': 40,
// 						'px': 4,
// 						'borderRadius': 1,
// 						'bgcolor': '#2196f3',
// 						'color': '#ffffff',
// 						'fontWeight': 700,
// 						'textTransform': 'none',
// 						'letterSpacing': '0.015em',
// 						'boxShadow': 'none',
// 						'&:hover': { bgcolor: '#1976d2' },
// 						'&:disabled': { bgcolor: '#4b5563' },
// 					}}>
// 					{loading ? 'Submitting...' : 'Submit Request'}
// 				</Button>
// 			</DialogActions>
// 		</Dialog>
// 	);
// };

// export default LeaveApplicationModal;
