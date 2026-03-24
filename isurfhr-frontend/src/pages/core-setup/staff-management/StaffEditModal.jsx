import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogActions, Grid, TextField, Button, IconButton, Typography, Switch, FormControlLabel, CircularProgress, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function StaffEditModal({ open, user, currentUserRole, onClose, onSave }) {
	const canEditPersonalFields = currentUserRole != 'STAFF';
	const [isLoading, setIsLoading] = useState(false);

	const [form, setForm] = useState({
		firstName: '',
		lastName: '',
		email: '',
		department: '',
		position: '',
		phone: '',
		isActive: true,
	});

	// Track initial values for comparison
	const [initialValues, setInitialValues] = useState({});

	useEffect(() => {
		if (user) {
			const initialForm = {
				firstName: user.firstName || '',
				lastName: user.lastName || '',
				email: user.email || '',
				phone: user.phone || '',
				department: user.department || '',
				position: user.position || '',
				isActive: user.isActive ?? true,
			};

			setForm(initialForm);
			setInitialValues(initialForm);
		}
	}, [user]);

	const handleChange = (key) => (e) => {
		setForm((prev) => ({ ...prev, [key]: e.target.value }));
	};

	const getChangedFields = () => {
		const changes = {};

		Object.keys(form).forEach((key) => {
			// Compare current value with initial value
			if (form[key] !== initialValues[key]) {
				changes[key] = form[key];
			}
		});

		return changes;
	};

	const hasChanges = () => {
		return Object.keys(getChangedFields()).length > 0;
	};

	const handleSave = async () => {
		if (hasChanges()) {
			setIsLoading(true);
			try {
				const changes = getChangedFields();
				await onSave({
					...changes,
				});
			} finally {
				setIsLoading(false);
			}
		} else {
			// Optionally show a message or just close
			onClose();
		}
	};

	// Add these animations at the top of your component
	const modalAnimations = {
		'@keyframes slideInUp': {
			'0%': {
				transform: 'translateY(50px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInDown': {
			'0%': {
				transform: 'translateY(-30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInLeft': {
			'0%': {
				transform: 'translateX(-30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInRight': {
			'0%': {
				transform: 'translateX(30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes fadeIn': {
			'0%': { opacity: 0 },
			'100%': { opacity: 1 },
		},
		'@keyframes scaleIn': {
			'0%': {
				transform: 'scale(0.95)',
				opacity: 0,
			},
			'100%': {
				transform: 'scale(1)',
				opacity: 1,
			},
		},
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(19, 91, 236, 0.4)' },
			'70%': { boxShadow: '0 0 0 8px rgba(19, 91, 236, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(19, 91, 236, 0)' },
		},
		'@keyframes shimmer': {
			'0%': { backgroundPosition: '-1000px 0' },
			'100%': { backgroundPosition: '1000px 0' },
		},
	};

	return (
		<Dialog
			open={open}
			onClose={isLoading ? null : onClose}
			maxWidth="md"
			fullWidth
			TransitionProps={{
				timeout: 300,
			}}
			PaperProps={{
				sx: {
					borderRadius: 3,
					animation: 'scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
					...modalAnimations,
				},
			}}>
			{/* Header */}
			<DialogTitle
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					borderBottom: '1px solid #e0e0e0',
					p: 3,
					animation: 'slideInDown 0.3s ease-out',
					...modalAnimations,
				}}>
				<Typography
					variant="h6"
					fontWeight={600}
					sx={{
						'position': 'relative',
						'display': 'inline-block',
						'&::after': {
							content: '""',
							position: 'absolute',
							bottom: -4,
							left: 0,
							width: '40px',
							height: '3px',
							...modalAnimations,
						},
					}}>
					Edit Staff Details
				</Typography>
				<IconButton
					onClick={onClose}
					disabled={isLoading}
					sx={{
						'transition': 'all 0.2s ease',
						'&:hover:not(:disabled)': {
							transform: 'rotate(90deg) scale(1.1)',
							color: '#f44336',
							bgcolor: 'rgba(244, 67, 54, 0.1)',
						},
					}}>
					<CloseIcon />
				</IconButton>
			</DialogTitle>

			{/* Content */}
			<Grid
				container
				spacing={3}
				sx={{ px: 3, my: 3 }}>
				{/* First Name */}
				<Grid
					item
					size={6}
					sx={{
						animation: 'slideInLeft 0.3s ease-out',
						...modalAnimations,
					}}>
					<TextField
						fullWidth
						label="First Name"
						value={form.firstName}
						disabled={!canEditPersonalFields || isLoading}
						onChange={handleChange('firstName')}
						helperText={!canEditPersonalFields ? 'Insufficient permissions' : ''}
						sx={{
							'& .MuiOutlinedInput-root': {
								'transition': 'all 0.2s ease',
								'&:hover:not(.Mui-disabled)': {
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...modalAnimations,
								},
							},
						}}
					/>
				</Grid>

				{/* Last Name */}
				<Grid
					item
					size={6}
					sx={{
						animation: 'slideInRight 0.3s ease-out',
						...modalAnimations,
					}}>
					<TextField
						fullWidth
						label="Last Name"
						value={form.lastName}
						disabled={!canEditPersonalFields || isLoading}
						onChange={handleChange('lastName')}
						helperText={!canEditPersonalFields ? 'Insufficient permissions' : ''}
						sx={{
							'& .MuiOutlinedInput-root': {
								'transition': 'all 0.2s ease',
								'&:hover:not(.Mui-disabled)': {
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...modalAnimations,
								},
							},
						}}
					/>
				</Grid>

				{/* Email */}
				<Grid
					item
					size={6}
					sx={{
						animation: 'slideInLeft 0.3s ease-out 0.1s both',
						...modalAnimations,
					}}>
					<TextField
						fullWidth
						label="Email Address"
						value={form.email}
						disabled={!canEditPersonalFields || isLoading}
						onChange={handleChange('email')}
						helperText={!canEditPersonalFields ? 'Insufficient permissions' : ''}
						sx={{
							'& .MuiOutlinedInput-root': {
								'transition': 'all 0.2s ease',
								'&:hover:not(.Mui-disabled)': {
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...modalAnimations,
								},
							},
						}}
					/>
				</Grid>

				{/* Department */}
				<Grid
					item
					size={6}
					sx={{
						animation: 'slideInRight 0.3s ease-out 0.1s both',
						...modalAnimations,
					}}>
					<TextField
						fullWidth
						label="Department"
						value={form.department}
						disabled={!canEditPersonalFields || isLoading}
						onChange={handleChange('department')}
						helperText={!canEditPersonalFields ? 'Insufficient permissions' : ''}
						sx={{
							'& .MuiOutlinedInput-root': {
								'transition': 'all 0.2s ease',
								'&:hover:not(.Mui-disabled)': {
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...modalAnimations,
								},
							},
						}}
					/>
				</Grid>

				{/* Position */}
				<Grid
					item
					size={6}
					sx={{
						animation: 'slideInLeft 0.3s ease-out 0.2s both',
						...modalAnimations,
					}}>
					<TextField
						fullWidth
						label="Position"
						value={form.position}
						disabled={!canEditPersonalFields || isLoading}
						onChange={handleChange('position')}
						helperText={!canEditPersonalFields ? 'Insufficient permissions' : ''}
						sx={{
							'& .MuiOutlinedInput-root': {
								'transition': 'all 0.2s ease',
								'&:hover:not(.Mui-disabled)': {
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...modalAnimations,
								},
							},
						}}
					/>
				</Grid>

				{/* Phone */}
				<Grid
					item
					size={6}
					sx={{
						animation: 'slideInRight 0.3s ease-out 0.2s both',
						...modalAnimations,
					}}>
					<TextField
						fullWidth
						label="Phone"
						value={form.phone}
						disabled={!canEditPersonalFields || isLoading}
						onChange={handleChange('phone')}
						helperText={!canEditPersonalFields ? 'Insufficient permissions' : ''}
						sx={{
							'& .MuiOutlinedInput-root': {
								'transition': 'all 0.2s ease',
								'&:hover:not(.Mui-disabled)': {
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...modalAnimations,
								},
							},
						}}
					/>
				</Grid>

				{/* Active Status */}
				<Grid
					item
					size={6}
					sx={{
						animation: 'fadeIn 0.3s ease-out 0.3s both',
						...modalAnimations,
					}}>
					<FormControlLabel
						control={
							<Switch
								checked={form.isActive}
								disabled={!canEditPersonalFields || isLoading}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										isActive: e.target.checked,
									}))
								}
								sx={{
									'& .MuiSwitch-switchBase': {
										transition: 'transform 0.2s ease',
									},
									'& .MuiSwitch-switchBase.Mui-checked': {
										transform: 'translateX(20px) scale(1.1)',
									},
								}}
							/>
						}
						label="Active Account"
					/>
					{!canEditPersonalFields && (
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ display: 'block', ml: 1, animation: 'fadeIn 0.2s ease-out', ...modalAnimations }}>
							Insufficient permissions
						</Typography>
					)}
				</Grid>
			</Grid>

			{/* Actions */}
			<DialogActions
				sx={{
					borderTop: '1px solid #e0e0e0',
					p: 3,
					display: 'flex',
					justifyContent: 'flex-end',
					gap: 1,
					animation: 'slideInUp 0.3s ease-out 0.3s both',
					...modalAnimations,
				}}>
				<Button
					onClick={onClose}
					variant="outlined"
					color="inherit"
					disabled={isLoading}
					sx={{
						'borderColor': '#e0e0e0',
						'color': 'text.secondary',
						'textTransform': 'none',
						'fontWeight': 500,
						'transition': 'all 0.2s ease',
						'&:hover:not(:disabled)': {
							borderColor: '#0d4bd1',
							backgroundColor: '#0d4bd1',
							transform: 'scale(1.02)',
						},
					}}>
					Cancel
				</Button>

				<Button
					onClick={handleSave}
					variant="contained"
					disabled={!hasChanges() || isLoading}
					sx={{
						'bgcolor': '#135bec',
						'textTransform': 'none',
						'fontWeight': 500,
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
							'bgcolor': '#0d4bd1',
							'transform': 'scale(1.02)',
							'&::before': {
								width: '200px',
								height: '200px',
							},
						},
						'&.Mui-disabled': {
							border: '1px solid white',
							bgcolor: isLoading ? '#0d4bd1' : 'inherit',
							color: isLoading ? 'white' : 'text.secondary',
							opacity: isLoading ? 0.7 : 1,
						},
					}}>
					{isLoading ? (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<CircularProgress
								size={20}
								color="inherit"
								sx={{
									'animation': 'spin 1s linear infinite',
									'@keyframes spin': {
										'0%': { transform: 'rotate(0deg)' },
										'100%': { transform: 'rotate(360deg)' },
									},
									...modalAnimations,
								}}
							/>
							<span>Saving...</span>
						</Box>
					) : (
						'Save Changes'
					)}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
