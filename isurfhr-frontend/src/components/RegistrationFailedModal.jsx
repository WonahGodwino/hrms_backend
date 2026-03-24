import React from 'react';
import { Box, Typography, Button, Paper, Modal, Fade, Backdrop, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const RegistrationFailedModal = ({ open, onClose, onTryAgain, isCompany }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	return (
		<Modal
			open={open}
			onClose={onClose}
			closeAfterTransition
			slots={{ backdrop: Backdrop }}
			slotProps={{
				backdrop: {
					timeout: 500,
					sx: {
						backgroundColor: 'rgba(17, 24, 39, 0.5)', // bg-gray-900/50
						backdropFilter: 'blur(4px)',
					},
				},
			}}>
			<Fade in={open}>
				<Box
					sx={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						transform: 'translate(-50%, -50%)',
						width: '100%',
						maxWidth: 448, // max-w-md
						p: 2, // padding wrapper
						outline: 'none',
					}}>
					<Paper
						elevation={24}
						sx={{
							position: 'relative',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							textAlign: 'center',
							p: 3, // p-6
							borderRadius: 3, // rounded-xl
							backgroundColor: isDarkMode ? '#1a0e0e' : '#ffffff',
							color: isDarkMode ? '#ffffff' : '#111827', // gray-900
							gap: 2, // gap-4
						}}>
						{/* Error Icon */}
						<Box
							sx={{
								position: 'relative',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 64, // h-16
								height: 64, // w-16
								borderRadius: '50%',
								bgcolor: 'rgba(236, 19, 19, 0.2)', // bg-primary/20
							}}>
							{/* Pulse Animation */}
							<Box
								sx={{
									'position': 'absolute',
									'inset': 0,
									'borderRadius': '50%',
									'bgcolor': 'rgba(236, 19, 19, 0.1)', // bg-primary/10
									'animation': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
									'@keyframes pulse': {
										'0%, 100%': { opacity: 1 },
										'50%': { opacity: 0.5 },
									},
								}}
							/>

							{/* Inner Circle */}
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									width: 48, // h-12
									height: 48, // w-12
									borderRadius: '50%',
									bgcolor: '#ec1313', // primary
								}}>
								<CloseIcon sx={{ color: '#ffffff', fontSize: 30 }} />
							</Box>
						</Box>

						{/* Text Content */}
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
							<Typography
								variant="h5"
								component="h1"
								sx={{
									fontWeight: 700,
									letterSpacing: '-0.025em', // tracking-tight
									lineHeight: 1.25, // leading-tight
									color: isDarkMode ? '#ffffff' : '#111827', // gray-900
									fontSize: '1.5rem', // text-2xl
								}}>
								Registration Failed
							</Typography>
							<Typography
								variant="body1"
								sx={{
									color: isDarkMode ? '#9ca3af' : '#4b5563', // gray-400 : gray-600
									fontSize: '1rem', // text-base
									fontWeight: 400,
									lineHeight: 1.5,
								}}>
								We couldn’t create the {isCompany ? 'company' : 'user'}. Please review the form and try again.
							</Typography>
						</Box>

						{/* Button Group */}
						<Box
							sx={{
								display: 'flex',
								width: '100%',
								justifyContent: 'flex-end',
								gap: 1.5, // gap-3
								pt: 2, // pt-4
							}}>
							<Button
								variant="text"
								onClick={onClose}
								sx={{
									'minWidth': 84,
									'height': 40,
									'px': 2,
									'borderRadius': 2, // rounded-lg
									'color': isDarkMode ? '#d1d5db' : '#1f2937', // gray-300 : gray-800
									'fontWeight': 700,
									'textTransform': 'none',
									'letterSpacing': '0.015em',
									'bgcolor': 'transparent',
									'&:hover': {
										backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#f3f4f6', // hover:bg-white/10 : hover:bg-gray-100
									},
								}}>
								Close
							</Button>
							<Button
								variant="contained"
								onClick={onTryAgain}
								sx={{
									'minWidth': 84,
									'height': 40,
									'px': 2,
									'borderRadius': 2, // rounded-lg
									'bgcolor': '#ec1313', // primary
									'color': '#ffffff',
									'fontWeight': 700,
									'textTransform': 'none',
									'letterSpacing': '0.015em',
									'boxShadow': '0 4px 6px -1px rgba(236, 19, 19, 0.3), 0 2px 4px -1px rgba(236, 19, 19, 0.06)', // shadow-md shadow-primary/30
									'&:hover': {
										bgcolor: 'rgba(236, 19, 19, 0.9)', // hover:bg-primary/90
									},
								}}>
								Try Again
							</Button>
						</Box>
					</Paper>
				</Box>
			</Fade>
		</Modal>
	);
};

export default RegistrationFailedModal;
