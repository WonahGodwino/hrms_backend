import React from 'react';
import { Modal, Box, Typography, Button, IconButton, CircularProgress } from '@mui/material';
import { Close as CloseIcon, WarningAmber as WarningIcon } from '@mui/icons-material';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

const ConfirmationModal = ({
	open,
	onClose,
	onConfirm,
	title = 'Confirm Action',
	message = 'Are you sure you want to proceed with this action?',
	confirmText = 'Confirm',
	cancelText = 'Cancel',
	type = 'warning', // 'warning', 'danger', 'info', 'success'
	loading = false,
	disabled = false,
	size = 'md', // 'sm', 'md', 'lg'
	icon = null,
	confirmButtonProps = {},
	cancelButtonProps = {},
}) => {
	// Define styles based on type
	const typeStyles = {
		warning: {
			icon: <WarningIcon sx={{ fontSize: 48, color: '#f59e0b' }} />,
			iconBg: 'rgba(245, 158, 11, 0.1)',
			confirmColor: '#f59e0b',
			confirmHover: '#d97706',
		},
		danger: {
			icon: (
				<AlertTriangle
					size={48}
					color="#ef4444"
				/>
			),
			iconBg: 'rgba(239, 68, 68, 0.1)',
			confirmColor: '#ef4444',
			confirmHover: '#dc2626',
		},
		info: {
			icon: (
				<Info
					size={48}
					color="#3b82f6"
				/>
			),
			iconBg: 'rgba(59, 130, 246, 0.1)',
			confirmColor: '#3b82f6',
			confirmHover: '#2563eb',
		},
		success: {
			icon: (
				<Info
					size={48}
					color="#10b981"
				/>
			),
			iconBg: 'rgba(16, 185, 129, 0.1)',
			confirmColor: '#10b981',
			confirmHover: '#059669',
		},
	};

	// Size configurations
	const sizeStyles = {
		sm: { width: { xs: '95%', sm: 360 }, p: 3 },
		md: { width: { xs: '95%', sm: 440 }, p: 4 },
		lg: { width: { xs: '95%', sm: 520 }, p: 5 },
	};

	const currentType = typeStyles[type] || typeStyles.warning;
	const currentSize = sizeStyles[size] || sizeStyles.md;

	const handleConfirm = async () => {
		if (onConfirm) {
			await onConfirm();
		}
	};

	const handleClose = () => {
		if (!loading && onClose) {
			onClose();
		}
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
						backdropFilter: 'blur(8px)',
						backgroundColor: 'rgba(0,0,0,0.7)',
						transition: 'opacity 0.3s ease-in-out',
						opacity: open ? 1 : 0,
					},
				},
			}}>
			<Box
				sx={{
					position: 'absolute',
					top: '50%',
					left: '50%',
					transform: open ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -40%) scale(0.9)',
					opacity: open ? 1 : 0,
					transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
					bgcolor: '#0f172a',
					border: '1px solid rgba(255,255,255,0.12)',
					borderRadius: 3,
					boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
					outline: 'none',
					...currentSize,
				}}>
				{/* Close Button */}
				<IconButton
					onClick={handleClose}
					disabled={loading}
					sx={{
						'position': 'absolute',
						'right': 8,
						'top': 8,
						'color': 'rgba(255,255,255,0.5)',
						'transition': 'all 0.2s ease',
						'&:hover:not(:disabled)': {
							transform: 'rotate(90deg) scale(1.1)',
							color: '#f44336',
							bgcolor: 'rgba(244, 67, 54, 0.1)',
						},
						'&.Mui-disabled': {
							opacity: 0.3,
						},
					}}>
					<CloseIcon />
				</IconButton>

				{/* Content */}
				<Box sx={{ textAlign: 'center' }}>
					{/* Icon */}
					<Box
						sx={{
							'width': 80,
							'height': 80,
							'borderRadius': '50%',
							'bgcolor': currentType.iconBg,
							'display': 'flex',
							'alignItems': 'center',
							'justifyContent': 'center',
							'mx': 'auto',
							'mb': 2,
							'animation': open ? 'popIn 0.4s ease-out' : 'none',
							'@keyframes popIn': {
								'0%': { transform: 'scale(0.5)', opacity: 0 },
								'50%': { transform: 'scale(1.1)' },
								'100%': { transform: 'scale(1)', opacity: 1 },
							},
						}}>
						{icon || currentType.icon}
					</Box>

					{/* Title */}
					<Typography
						variant="h5"
						fontWeight={700}
						color="white"
						gutterBottom
						sx={{
							'animation': open ? 'fadeSlideUp 0.3s ease-out 0.1s both' : 'none',
							'@keyframes fadeSlideUp': {
								'0%': { opacity: 0, transform: 'translateY(10px)' },
								'100%': { opacity: 1, transform: 'translateY(0)' },
							},
						}}>
						{title}
					</Typography>

					{/* Message */}
					<Typography
						variant="body2"
						color="rgba(255,255,255,0.7)"
						sx={{
							'mb': 4,
							'whiteSpace': 'pre-line',
							'animation': open ? 'fadeSlideUp 0.3s ease-out 0.15s both' : 'none',
							'@keyframes fadeSlideUp': {
								'0%': { opacity: 0, transform: 'translateY(10px)' },
								'100%': { opacity: 1, transform: 'translateY(0)' },
							},
						}}>
						{message}
					</Typography>

					{/* Action Buttons */}
					<Box
						sx={{
							'display': 'flex',
							'gap': 2,
							'justifyContent': 'center',
							'animation': open ? 'fadeSlideUp 0.3s ease-out 0.2s both' : 'none',
							'@keyframes fadeSlideUp': {
								'0%': { opacity: 0, transform: 'translateY(10px)' },
								'100%': { opacity: 1, transform: 'translateY(0)' },
							},
						}}>
						{/* Cancel Button */}
						<Button
							variant="outlined"
							onClick={handleClose}
							disabled={loading}
							sx={{
								'flex': 1,
								'borderColor': 'rgba(255,255,255,0.2)',
								'color': '#e2e8f0',
								'textTransform': 'none',
								'fontWeight': 600,
								'borderRadius': 2,
								'py': 1.5,
								'transition': 'all 0.3s ease',
								'&:hover:not(:disabled)': {
									borderColor: '#94a3b8',
									bgcolor: 'rgba(255,255,255,0.05)',
									transform: 'scale(1.02)',
								},
								'&.Mui-disabled': {
									borderColor: 'rgba(255,255,255,0.1)',
									color: 'rgba(255,255,255,0.3)',
								},
								...cancelButtonProps?.sx,
							}}
							{...cancelButtonProps}>
							{cancelText}
						</Button>

						{/* Confirm Button */}
						<Button
							variant="contained"
							onClick={handleConfirm}
							disabled={loading || disabled}
							sx={{
								'flex': 1,
								'bgcolor': currentType.confirmColor,
								'textTransform': 'none',
								'fontWeight': 600,
								'borderRadius': 2,
								'py': 1.5,
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
									'bgcolor': currentType.confirmHover,
									'transform': 'scale(1.02)',
									'&::before': {
										width: '300px',
										height: '300px',
									},
								},
								'&:disabled': {
									bgcolor: 'rgba(255,255,255,0.12)',
									color: 'rgba(255,255,255,0.3)',
								},
								...confirmButtonProps?.sx,
							}}
							{...confirmButtonProps}>
							{loading ? (
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<CircularProgress
										size={20}
										sx={{
											'color': 'white',
											'animation': 'spin 1s linear infinite',
											'@keyframes spin': {
												'0%': { transform: 'rotate(0deg)' },
												'100%': { transform: 'rotate(360deg)' },
											},
										}}
									/>
									<span>Processing...</span>
								</Box>
							) : (
								confirmText
							)}
						</Button>
					</Box>
				</Box>
			</Box>
		</Modal>
	);
};

export default ConfirmationModal;
