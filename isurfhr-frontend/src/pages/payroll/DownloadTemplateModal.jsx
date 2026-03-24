import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, useTheme, Typography } from '@mui/material';
import { TemplateSelectField } from '@/components/SelectTemplate';

// const DownloadTemplateModal = ({ open, onClose, selectedTemplate, onTemplateChange, onConfirm, isDownloading }) => {
// 	const theme = useTheme();
// 	const isDarkMode = theme.palette.mode === 'dark';
// 	return (
// 		<Dialog
// 			open={open}
// 			onClose={onClose}
// 			maxWidth="sm"
// 			fullWidth
// 			PaperProps={{
// 				sx: {
// 					borderRadius: 3,
// 					backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
// 					color: isDarkMode ? '#ffffff' : '#1f2937',
// 					boxShadow: 24,
// 				},
// 			}}>
// 			<DialogTitle
// 				sx={{
// 					display: 'flex',
// 					justifyContent: 'space-between',
// 					alignItems: 'center',
// 					p: 3,
// 					borderBottom: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
// 				}}>
// 				<Typography
// 					variant="h6"
// 					component="span"
// 					sx={{
// 						fontWeight: 700,
// 						fontSize: '1.25rem',
// 						color: isDarkMode ? '#ffffff' : '#1f2937',
// 					}}>
// 					Select Template to Download
// 				</Typography>
// 			</DialogTitle>

// 			<DialogContent>
// 				<Box sx={{ mt: 1 }}>
// 					<TemplateSelectField
// 						required
// 						label="Template"
// 						value={selectedTemplate}
// 						onChange={onTemplateChange}
// 						placeholder="Choose a template"
// 					/>
// 				</Box>
// 			</DialogContent>

// 			<DialogActions sx={{ px: 3, pb: 2 }}>
// 				<Button
// 					onClick={onClose}
// 					disabled={isDownloading}
// 					sx={{
// 						'minWidth': 84,
// 						'height': 40,
// 						'px': 2,
// 						'borderRadius': 3,
// 						'bgcolor': isDarkMode ? '#374151' : '#f3f4f6',
// 						'color': isDarkMode ? '#ffffff' : '#1f2937',
// 						'fontWeight': 700,
// 						'fontSize': '0.875rem',
// 						'textTransform': 'none',
// 						'letterSpacing': '0.015em',
// 						'&:hover': {
// 							bgcolor: isDarkMode ? '#4b5563' : '#e5e7eb',
// 						},
// 					}}>
// 					Cancel
// 				</Button>
// 				<Button
// 					variant="contained"
// 					onClick={onConfirm}
// 					disabled={!selectedTemplate || isDownloading}
// 					sx={{
// 						'minWidth': 84,
// 						'height': 40,
// 						'px': 2,
// 						'borderRadius': 3,
// 						'bgcolor': '#137fec',
// 						'color': '#ffffff',
// 						'fontWeight': 700,
// 						'fontSize': '0.875rem',
// 						'textTransform': 'none',
// 						'letterSpacing': '0.015em',
// 						'&:hover': {
// 							bgcolor: 'rgba(19, 127, 236, 0.9)',
// 						},
// 						'&.Mui-disabled': {
// 							bgcolor: isDarkMode ? '#374151' : '#e5e7eb',
// 							color: isDarkMode ? '#6b7280' : '#9ca3af',
// 						},
// 					}}>
// 					{isDownloading ? 'Downloading…' : 'Download'}
// 				</Button>
// 			</DialogActions>
// 		</Dialog>
// 	);
// };
const DownloadTemplateModal = ({ open, onClose, selectedTemplate, onTemplateChange, onConfirm, isDownloading }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Animation keyframes
	const modalAnimations = {
		'@keyframes slideInUp': {
			'0%': {
				transform: 'translateY(50px) scale(0.95)',
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
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0.4)' },
			'70%': { boxShadow: '0 0 0 8px rgba(19, 127, 236, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0)' },
		},
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth
			TransitionProps={{
				timeout: 300,
			}}
			PaperProps={{
				sx: {
					borderRadius: 3,
					backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
					color: isDarkMode ? '#ffffff' : '#1f2937',
					boxShadow: 24,
					animation: 'slideInUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
					...modalAnimations,
				},
			}}>
			{/* Header with fade in */}
			<DialogTitle
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					p: 3,
					borderBottom: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
					animation: 'fadeIn 0.3s ease-out 0.1s both',
					...modalAnimations,
				}}>
				<Typography
					variant="h6"
					component="span"
					sx={{
						'fontWeight': 700,
						'fontSize': '1.25rem',
						'color': isDarkMode ? '#ffffff' : '#1f2937',
						'position': 'relative',
						'display': 'inline-block',
						'&::after': {
							content: '""',
							position: 'absolute',
							bottom: -4,
							left: 0,
							width: '40px',
							height: '3px',
						},
					}}>
					Select Template to Download
				</Typography>
			</DialogTitle>

			{/* Content with slide in */}
			<DialogContent
				sx={{
					animation: 'fadeIn 0.3s ease-out 0.15s both',
					...modalAnimations,
				}}>
				<Box sx={{ mt: 1 }}>
					<TemplateSelectField
						required
						label="Template"
						value={selectedTemplate}
						onChange={onTemplateChange}
						placeholder="Choose a template"
						sx={{
							'& .MuiOutlinedInput-root': {
								'transition': 'all 0.2s ease',
								'&:hover': {
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...modalAnimations,
								},
							},
						}}
					/>
				</Box>
			</DialogContent>

			{/* Actions with staggered entrance */}
			<DialogActions
				sx={{
					px: 3,
					pb: 2,
					animation: 'fadeIn 0.3s ease-out 0.2s both',
					...modalAnimations,
				}}>
				<Button
					onClick={onClose}
					disabled={isDownloading}
					sx={{
						'minWidth': 84,
						'height': 40,
						'px': 2,
						'borderRadius': 3,
						'bgcolor': isDarkMode ? '#374151' : '#f3f4f6',
						'color': isDarkMode ? '#ffffff' : '#1f2937',
						'fontWeight': 700,
						'fontSize': '0.875rem',
						'textTransform': 'none',
						'letterSpacing': '0.015em',
						'transition': 'all 0.2s ease',
						'&:hover': {
							bgcolor: isDarkMode ? '#4b5563' : '#e5e7eb',
							transform: 'scale(1.02)',
						},
					}}>
					Cancel
				</Button>
				<Button
					variant="contained"
					onClick={onConfirm}
					disabled={!selectedTemplate || isDownloading}
					sx={{
						'minWidth': 84,
						'height': 40,
						'px': 2,
						'borderRadius': 3,
						'bgcolor': '#137fec',
						'color': '#ffffff',
						'fontWeight': 700,
						'fontSize': '0.875rem',
						'textTransform': 'none',
						'letterSpacing': '0.015em',
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
							'bgcolor': 'rgba(19, 127, 236, 0.9)',
							'transform': 'scale(1.02)',
							'&::before': {
								width: '200px',
								height: '200px',
							},
						},
						'&.Mui-disabled': {
							bgcolor: isDarkMode ? '#374151' : '#e5e7eb',
							color: isDarkMode ? '#6b7280' : '#9ca3af',
						},
					}}>
					{isDownloading ? 'Downloading…' : 'Download'}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default DownloadTemplateModal;
