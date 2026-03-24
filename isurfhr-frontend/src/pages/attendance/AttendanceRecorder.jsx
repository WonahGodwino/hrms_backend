// components/AttendanceRecorder.jsx - Updated with real API
import React, { useState } from 'react';
import { Modal, Box, Typography, TextField, Button, FormControl, InputLabel, Select, MenuItem, IconButton, CircularProgress, Alert, InputAdornment } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { recordDailyAttendance } from '@/services/AttendanceService';

const AttendanceRecorder = ({ open, onClose, companyId, onSuccess, onError }) => {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [formData, setFormData] = useState({
		identifier: '',
		method: 'staff_id',
	});

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		setError('');
		setSuccess('');

		try {
			// Validate input
			if (!formData.identifier.trim()) {
				throw new Error('Please enter an identifier');
			}

			if (!companyId) {
				throw new Error('Company ID is required');
			}

			// Prepare API payload according to API documentation
			const payload = {
				companyId: companyId,
				identifier: formData.identifier.trim(),
				method: formData.method,
			};

			// Make API call
			const response = await recordDailyAttendance(payload);

			if (response.data.success) {
				const responseData = response.data;

				// Format success message based on action
				const action = responseData.data?.action || 'Attendance recorded';
				const staffName = responseData.data?.staff?.name || `${responseData.data?.staff?.firstName || ''} ${responseData.data?.staff?.lastName || ''}`.trim();

				const message = staffName ? `${staffName} ${action === 'SIGN_IN' ? 'signed in' : 'signed out'} successfully!` : 'Attendance recorded successfully!';

				setSuccess(message);

				// Reset form
				setFormData({
					identifier: '',
					method: 'staff_id',
				});

				// Call success callback
				if (onSuccess) {
					onSuccess(responseData);
				}

				// Close modal after 2 seconds
				setTimeout(() => {
					onClose();
					setSuccess('');
				}, 2000);
			} else {
				throw new Error(response.data.message || 'Failed to record attendance');
			}
		} catch (err) {
			const errorMessage = err.response?.data?.message || err.message || 'Failed to record attendance. Please try again.';
			setError(errorMessage);

			// Call error callback if provided
			if (onError) {
				onError(err);
			}
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	// Clear form and errors when modal closes
	const handleClose = () => {
		if (!loading) {
			setFormData({
				identifier: '',
				method: 'staff_id',
			});
			setError('');
			setSuccess('');
			onClose();
		}
	};

	const modalAnimations = {
		'@keyframes slideInFromBottomRight': {
			'0%': {
				transform: 'translate(calc(-50% + 100px), calc(-50% + 100px)) scale(0.7)',
				opacity: 0,
			},
			'100%': {
				transform: 'translate(-50%, -50%) scale(1)',
				opacity: 1,
			},
		},
		'@keyframes slideOutToBottomRight': {
			'0%': {
				transform: 'translate(-50%, -50%) scale(1)',
				opacity: 1,
			},
			'100%': {
				transform: 'translate(calc(-50% + 100px), calc(-50% + 100px)) scale(0.7)',
				opacity: 0,
			},
		},
		'@keyframes fadeIn': {
			'0%': { opacity: 0 },
			'100%': { opacity: 1 },
		},
		'@keyframes fadeOut': {
			'0%': { opacity: 1 },
			'100%': { opacity: 0 },
		},
		'@keyframes slideInDown': {
			'0%': {
				transform: 'translateY(-40px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInRight': {
			'0%': {
				transform: 'translateX(40px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInLeft': {
			'0%': {
				transform: 'translateX(-40px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInUp': {
			'0%': {
				transform: 'translateY(40px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
				opacity: 1,
			},
		},
		'@keyframes scaleIn': {
			'0%': {
				transform: 'scale(0.9)',
				opacity: 0,
			},
			'100%': {
				transform: 'scale(1)',
				opacity: 1,
			},
		},
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
			'70%': { boxShadow: '0 0 0 10px rgba(33, 150, 243, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
		},
		'@keyframes shimmer': {
			'0%': { backgroundPosition: '-1000px 0' },
			'100%': { backgroundPosition: '1000px 0' },
		},
		'@keyframes shake': {
			'0%, 100%': { transform: 'translateX(0)' },
			'25%': { transform: 'translateX(-5px)' },
			'75%': { transform: 'translateX(5px)' },
		},
	};

	return (
		<Modal
			open={open}
			onClose={handleClose}
			closeAfterTransition
			slots={{ backdrop: 'div' }}
			slotProps={{
				backdrop: {
					sx: {
						backdropFilter: 'blur(10px)',
						backgroundColor: 'rgba(0,0,0,0.7)',
						animation: open ? 'fadeIn 0.4s ease-out forwards' : 'fadeOut 0.3s ease-in forwards',
						...modalAnimations,
					},
				},
			}}>
			<Box
				sx={{
					position: 'absolute',
					top: '50%',
					left: '50%',
					width: { xs: '95%', sm: 500 },
					bgcolor: '#0f172a',
					border: '1px solid rgba(255,255,255,0.12)',
					borderRadius: 3,
					boxShadow: 24,
					p: 4,
					outline: 'none',
					animation: open ? 'slideInFromBottomRight 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' : 'slideOutToBottomRight 0.3s ease-out forwards',
					...modalAnimations,
				}}>
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						mb: 3,
						opacity: 0,
						animation: open ? 'fadeIn 0.3s ease-out 0.2s forwards' : 'none',
						...modalAnimations,
					}}>
					<Typography
						variant="h5"
						fontWeight={600}
						sx={{
							'color': '#fff',
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
								animation: open ? 'shimmer 2s infinite' : 'none',
								...modalAnimations,
							},
						}}>
						Record Attendance
					</Typography>
					<IconButton
						onClick={handleClose}
						disabled={loading}
						sx={{
							'color': 'rgba(255,255,255,0.7)',
							'transition': 'all 0.2s ease',
							'&:hover': {
								transform: 'rotate(90deg) scale(1.1)',
								color: '#f44336',
								bgcolor: 'rgba(244, 67, 54, 0.1)',
							},
						}}>
						<CloseIcon />
					</IconButton>
				</Box>

				<form onSubmit={handleSubmit}>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
						<FormControl
							fullWidth
							size="small"
							sx={{
								opacity: 0,
								animation: open ? 'slideInRight 0.3s ease-out 0.25s forwards' : 'none',
								...modalAnimations,
							}}>
							<InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Identification Method</InputLabel>
							<Select
								name="method"
								value={formData.method}
								onChange={handleChange}
								label="Identification Method"
								disabled={loading}
								sx={{
									'bgcolor': '#222b3f',
									'color': '#fff',
									'transition': 'all 0.2s ease',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
										borderColor: '#2196f3',
									},
									'&:hover': {
										bgcolor: '#2a3a54',
									},
								}}>
								<MenuItem value="staff_id">Staff ID</MenuItem>
								<MenuItem value="email">Email</MenuItem>
								<MenuItem
									value="barcode"
									disabled>
									Barcode (Coming Soon)
								</MenuItem>
							</Select>
						</FormControl>

						<TextField
							fullWidth
							label={formData.method === 'staff_id' ? 'Staff ID' : formData.method === 'email' ? 'Email Address' : 'Identifier'}
							name="identifier"
							value={formData.identifier}
							onChange={handleChange}
							placeholder={formData.method === 'staff_id' ? 'Enter staff ID (e.g., EMP001)' : formData.method === 'email' ? 'Enter email address' : 'Enter identifier'}
							required
							disabled={loading}
							autoFocus
							InputProps={{
								startAdornment: (
									<InputAdornment position="start">
										<PersonSearchIcon
											sx={{
												mr: 1,
												opacity: 0.7,
												color: 'rgba(255,255,255,0.5)',
												transition: 'transform 0.2s ease',
											}}
										/>
									</InputAdornment>
								),
							}}
							sx={{
								'opacity': 0,
								'animation': open ? 'slideInLeft 0.3s ease-out 0.3s forwards' : 'none',
								'& .MuiInputLabel-root': {
									color: 'rgba(255,255,255,0.7)',
								},
								'& .MuiOutlinedInput-root': {
									'bgcolor': '#222b3f',
									'color': '#fff',
									'transition': 'all 0.2s ease',
									'& fieldset': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&:hover': {
										'bgcolor': '#2a3a54',
										'& fieldset': {
											borderColor: 'rgba(255,255,255,0.3)',
										},
										'& .MuiInputAdornment-root .MuiSvgIcon-root': {
											transform: 'scale(1.1)',
										},
									},
									'&.Mui-focused fieldset': {
										borderColor: '#2196f3',
									},
									'&.Mui-focused': {
										animation: open ? 'pulse-glow 1.5s infinite' : 'none',
										...modalAnimations,
									},
								},
								...modalAnimations,
							}}
						/>

						{error && (
							<Alert
								severity="error"
								sx={{
									bgcolor: 'rgba(220, 38, 38, 0.1)',
									color: '#fca5a5',
									animation: 'shake 0.3s ease-out',
									...modalAnimations,
								}}
								onClose={() => setError('')}>
								{error}
							</Alert>
						)}

						{success && (
							<Alert
								severity="success"
								sx={{
									bgcolor: 'rgba(34, 197, 94, 0.1)',
									color: '#86efac',
									animation: 'slideInUp 0.3s ease-out',
									...modalAnimations,
								}}>
								{success}
							</Alert>
						)}

						<Box
							sx={{
								display: 'flex',
								gap: 2,
								justifyContent: 'flex-end',
								mt: 2,
								opacity: 0,
								animation: open ? 'slideInUp 0.3s ease-out 0.35s forwards' : 'none',
								...modalAnimations,
							}}>
							<Button
								variant="outlined"
								onClick={handleClose}
								disabled={loading}
								sx={{
									'color': '#fff',
									'borderColor': 'rgba(255,255,255,0.2)',
									'transition': 'all 0.2s ease',
									'&:hover': {
										borderColor: 'rgba(255,255,255,0.3)',
										transform: 'scale(1.02)',
									},
								}}>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="contained"
								disabled={loading || !formData.identifier.trim()}
								sx={{
									'bgcolor': '#2196f3',
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
										'transform': 'scale(1.02)',
										'&::before': {
											width: '200px',
											height: '200px',
										},
									},
									'&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)' },
								}}>
								{loading ? (
									<CircularProgress
										size={24}
										sx={{
											'color': '#fff',
											'animation': 'spin 1s linear infinite, pulse-glow 1.5s infinite',
											'@keyframes spin': {
												'0%': { transform: 'rotate(0deg)' },
												'100%': { transform: 'rotate(360deg)' },
											},
											...modalAnimations,
										}}
									/>
								) : (
									'Record Attendance'
								)}
							</Button>
						</Box>
					</Box>
				</form>

				<Typography
					variant="caption"
					sx={{
						'display': 'block',
						'mt': 3,
						'textAlign': 'center',
						'color': 'rgba(255,255,255,0.4)',
						'opacity': 0,
						'animation': open ? 'fadeIn 0.3s ease-out 0.4s forwards' : 'none',
						'transition': 'color 0.2s ease',
						'&:hover': {
							color: 'rgba(255,255,255,0.6)',
						},
						...modalAnimations,
					}}>
					The system will automatically detect whether to sign in or sign out based on the staff's current status.
				</Typography>
			</Box>
		</Modal>
	);
};

export default AttendanceRecorder;
