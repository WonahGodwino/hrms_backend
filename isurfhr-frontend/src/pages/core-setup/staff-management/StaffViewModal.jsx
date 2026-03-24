import { Dialog, DialogTitle, DialogActions, Grid, Button, IconButton, Typography, Box, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

// export default function StaffViewModal({ open, user, onClose }) {
// 	if (!user) return null;

// 	// Format the createdAt date
// 	const formatDate = (dateString) => {
// 		const date = new Date(dateString);
// 		return date.toLocaleDateString('en-US', {
// 			year: 'numeric',
// 			month: 'long',
// 			day: 'numeric',
// 		});
// 	};

// 	const pageAnimations = {
// 		'@keyframes fadeIn': {
// 			'0%': { opacity: 0 },
// 			'100%': { opacity: 1 },
// 		},
// 		'@keyframes slideInUp': {
// 			'0%': {
// 				transform: 'translateY(30px)',
// 				opacity: 0,
// 			},
// 			'100%': {
// 				transform: 'translateY(0)',
// 				opacity: 1,
// 			},
// 		},
// 		'@keyframes slideInDown': {
// 			'0%': {
// 				transform: 'translateY(-30px)',
// 				opacity: 0,
// 			},
// 			'100%': {
// 				transform: 'translateY(0)',
// 				opacity: 1,
// 			},
// 		},
// 		'@keyframes slideInLeft': {
// 			'0%': {
// 				transform: 'translateX(-30px)',
// 				opacity: 0,
// 			},
// 			'100%': {
// 				transform: 'translateX(0)',
// 				opacity: 1,
// 			},
// 		},
// 		'@keyframes slideInRight': {
// 			'0%': {
// 				transform: 'translateX(30px)',
// 				opacity: 0,
// 			},
// 			'100%': {
// 				transform: 'translateX(0)',
// 				opacity: 1,
// 			},
// 		},
// 		'@keyframes scaleIn': {
// 			'0%': {
// 				transform: 'scale(0.95)',
// 				opacity: 0,
// 			},
// 			'100%': {
// 				transform: 'scale(1)',
// 				opacity: 1,
// 			},
// 		},
// 		'@keyframes float': {
// 			'0%': { transform: 'translateY(0px)' },
// 			'50%': { transform: 'translateY(-5px)' },
// 			'100%': { transform: 'translateY(0px)' },
// 		},
// 		'@keyframes pulse-glow': {
// 			'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
// 			'70%': { boxShadow: '0 0 0 10px rgba(33, 150, 243, 0)' },
// 			'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
// 		},
// 		'@keyframes shimmer': {
// 			'0%': { backgroundPosition: '-1000px 0' },
// 			'100%': { backgroundPosition: '1000px 0' },
// 		},
// 		'@keyframes rowEnter': {
// 			'0%': {
// 				transform: 'translateX(-10px)',
// 				opacity: 0,
// 			},
// 			'100%': {
// 				transform: 'translateX(0)',
// 				opacity: 1,
// 			},
// 		},
// 		'@keyframes bounce': {
// 			'0%, 100%': { transform: 'translateY(0)' },
// 			'50%': { transform: 'translateY(-8px)' },
// 		},
// 	};

// 	return (
// 		<Dialog
// 			open={open}
// 			onClose={onClose}
// 			maxWidth="md"
// 			fullWidth
// 			PaperProps={{
// 				sx: {
// 					borderRadius: 3,
// 					display: 'flex',
// 					flexDirection: 'column',
// 					maxHeight: '90vh', // Limit dialog height
// 				},
// 			}}>
// 			{/* Header - Fixed */}
// 			<DialogTitle
// 				sx={{
// 					display: 'flex',
// 					justifyContent: 'space-between',
// 					alignItems: 'center',
// 					borderBottom: '1px solid #e0e0e0',
// 					p: 3,
// 					flexShrink: 0, // Prevent header from shrinking
// 				}}>
// 				<Typography
// 					variant="h6"
// 					fontWeight={600}>
// 					Staff Details
// 				</Typography>
// 				<IconButton onClick={onClose}>
// 					<CloseIcon />
// 				</IconButton>
// 			</DialogTitle>

// 			{/* Scrollable Content */}
// 			<Box
// 				sx={{
// 					'overflowX': 'auto', // Enable horizontal scrolling
// 					'overflowY': 'auto', // Enable vertical scrolling if needed
// 					'flexGrow': 1, // Take remaining space
// 					'&::-webkit-scrollbar': {
// 						height: 8, // Horizontal scrollbar height
// 						width: 8, // Vertical scrollbar width
// 					},
// 					'&::-webkit-scrollbar-track': {
// 						backgroundColor: '#f1f1f1',
// 						borderRadius: 4,
// 					},
// 					'&::-webkit-scrollbar-thumb': {
// 						'backgroundColor': '#888',
// 						'borderRadius': 4,
// 						'&:hover': {
// 							backgroundColor: '#666',
// 						},
// 					},
// 				}}>
// 				<Box sx={{ px: 3, py: 3, minWidth: '600px' }}>
// 					{' '}
// 					{/* Set minimum width to trigger horizontal scroll */}
// 					<Grid
// 						container
// 						spacing={3}>
// 						{/* First Name */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								First Name
// 							</Typography>
// 							<Typography
// 								variant="body1"
// 								fontWeight={500}>
// 								{user.firstName || 'N/A'}
// 							</Typography>
// 						</Grid>

// 						{/* Last Name */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								Last Name
// 							</Typography>
// 							<Typography
// 								variant="body1"
// 								fontWeight={500}>
// 								{user.lastName || 'N/A'}
// 							</Typography>
// 						</Grid>

// 						{/* Email */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								Email Address
// 							</Typography>
// 							<Typography
// 								variant="body1"
// 								fontWeight={500}>
// 								{user.email || 'N/A'}
// 							</Typography>
// 						</Grid>

// 						{/* Phone */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								Phone Number
// 							</Typography>
// 							<Typography
// 								variant="body1"
// 								fontWeight={500}>
// 								{user.phone || 'N/A'}
// 							</Typography>
// 						</Grid>

// 						{/* Department */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								Department
// 							</Typography>
// 							<Typography
// 								variant="body1"
// 								fontWeight={500}>
// 								{user.department || 'N/A'}
// 							</Typography>
// 						</Grid>

// 						{/* Position */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								Position
// 							</Typography>
// 							<Typography
// 								variant="body1"
// 								fontWeight={500}>
// 								{user.position || 'N/A'}
// 							</Typography>
// 						</Grid>

// 						{/* Account Status */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								Account Status
// 							</Typography>
// 							<Box
// 								sx={{
// 									display: 'inline-flex',
// 									alignItems: 'center',
// 									px: 1.5,
// 									py: 0.5,
// 									borderRadius: 1,
// 									bgcolor: user.isActive ? '#e8f5e9' : '#ffebee',
// 									color: user.isActive ? '#2e7d32' : '#c62828',
// 								}}>
// 								<Box
// 									sx={{
// 										width: 8,
// 										height: 8,
// 										borderRadius: '50%',
// 										bgcolor: user.isActive ? '#4caf50' : '#f44336',
// 										mr: 1,
// 									}}
// 								/>
// 								<Typography
// 									variant="caption"
// 									fontWeight={600}>
// 									{user.isActive ? 'Active' : 'Inactive'}
// 								</Typography>
// 							</Box>
// 						</Grid>

// 						{/* Join Date */}
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block', mb: 0.5 }}>
// 								Join Date
// 							</Typography>
// 							<Typography
// 								variant="body1"
// 								fontWeight={500}>
// 								{user.createdAt ? formatDate(user.createdAt) : 'N/A'}
// 							</Typography>
// 						</Grid>
// 					</Grid>
// 					{/* Divider before metadata */}
// 					<Divider sx={{ my: 4 }} />
// 					{/* Additional Info */}
// 					<Grid
// 						container
// 						spacing={2}>
// 						<Grid
// 							item
// 							size={6}>
// 							<Typography
// 								variant="caption"
// 								color="text.secondary"
// 								sx={{ display: 'block' }}>
// 								Company
// 							</Typography>
// 							<Typography
// 								variant="caption"
// 								fontWeight={500}>
// 								{user.companyName || 'Master Company'}
// 							</Typography>
// 						</Grid>
// 					</Grid>
// 				</Box>
// 			</Box>

// 			{/* Actions - Fixed */}
// 			<DialogActions
// 				sx={{
// 					borderTop: '1px solid #e0e0e0',
// 					p: 3,
// 					display: 'flex',
// 					justifyContent: 'flex-end',
// 					flexShrink: 0, // Prevent footer from shrinking
// 				}}>
// 				<Button
// 					onClick={onClose}
// 					variant="contained"
// 					sx={{
// 						'bgcolor': '#135bec',
// 						'textTransform': 'none',
// 						'fontWeight': 500,
// 						'minWidth': 120,
// 						'&:hover': {
// 							bgcolor: '#0d4bd1',
// 						},
// 					}}>
// 					Close
// 				</Button>
// 			</DialogActions>
// 		</Dialog>
// 	);
// }

export default function StaffViewModal({ open, user, onClose }) {
	if (!user) return null;

	// Format the createdAt date
	const formatDate = (dateString) => {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
	};

	const pageAnimations = {
		'@keyframes fadeIn': {
			'0%': { opacity: 0 },
			'100%': { opacity: 1 },
		},
		'@keyframes slideInUp': {
			'0%': {
				transform: 'translateY(30px)',
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
		'@keyframes float': {
			'0%': { transform: 'translateY(0px)' },
			'50%': { transform: 'translateY(-5px)' },
			'100%': { transform: 'translateY(0px)' },
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
		'@keyframes rowEnter': {
			'0%': {
				transform: 'translateX(-10px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes bounce': {
			'0%, 100%': { transform: 'translateY(0)' },
			'50%': { transform: 'translateY(-8px)' },
		},
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="md"
			fullWidth
			PaperProps={{
				sx: {
					borderRadius: 3,
					display: 'flex',
					flexDirection: 'column',
					maxHeight: '90vh',
					animation: 'scaleIn 0.3s ease-out',
					...pageAnimations,
				},
			}}>
			<DialogTitle
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					borderBottom: '1px solid #e0e0e0',
					p: 3,
					flexShrink: 0,
					animation: 'slideInDown 0.3s ease-out',
					...pageAnimations,
				}}>
				<Typography
					variant="h6"
					fontWeight={600}>
					Staff Details
				</Typography>
				<IconButton
					onClick={onClose}
					sx={{
						'transition': 'all 0.2s ease',
						'&:hover': {
							transform: 'rotate(90deg)',
						},
					}}>
					<CloseIcon />
				</IconButton>
			</DialogTitle>

			{/* Scrollable Content */}
			<Box
				sx={{
					'overflowX': 'auto',
					'overflowY': 'auto',
					'flexGrow': 1,
					'&::-webkit-scrollbar': {
						height: 8,
						width: 8,
					},
					'&::-webkit-scrollbar-track': {
						backgroundColor: '#f1f1f1',
						borderRadius: 4,
					},
					'&::-webkit-scrollbar-thumb': {
						'backgroundColor': '#888',
						'borderRadius': 4,
						'&:hover': {
							backgroundColor: '#666',
						},
					},
				}}>
				<Box sx={{ px: 3, py: 3, minWidth: '600px' }}>
					<Grid
						container
						spacing={3}>
						{/* First Name */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'slideInLeft 0.3s ease-out',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								First Name
							</Typography>
							<Typography
								variant="body1"
								fontWeight={500}>
								{user.firstName || 'N/A'}
							</Typography>
						</Grid>

						{/* Last Name */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'slideInRight 0.3s ease-out',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								Last Name
							</Typography>
							<Typography
								variant="body1"
								fontWeight={500}>
								{user.lastName || 'N/A'}
							</Typography>
						</Grid>

						{/* Email */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'slideInLeft 0.3s ease-out 0.1s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								Email Address
							</Typography>
							<Typography
								variant="body1"
								fontWeight={500}>
								{user.email || 'N/A'}
							</Typography>
						</Grid>

						{/* Phone */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'slideInRight 0.3s ease-out 0.1s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								Phone Number
							</Typography>
							<Typography
								variant="body1"
								fontWeight={500}>
								{user.phone || 'N/A'}
							</Typography>
						</Grid>

						{/* Department */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'slideInLeft 0.3s ease-out 0.2s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								Department
							</Typography>
							<Typography
								variant="body1"
								fontWeight={500}>
								{user.department || 'N/A'}
							</Typography>
						</Grid>

						{/* Position */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'slideInRight 0.3s ease-out 0.2s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								Position
							</Typography>
							<Typography
								variant="body1"
								fontWeight={500}>
								{user.position || 'N/A'}
							</Typography>
						</Grid>

						{/* Account Status */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'fadeIn 0.3s ease-out 0.3s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								Account Status
							</Typography>
							<Box
								sx={{
									display: 'inline-flex',
									alignItems: 'center',
									px: 1.5,
									py: 0.5,
									borderRadius: 1,
									bgcolor: user.isActive ? '#e8f5e9' : '#ffebee',
									color: user.isActive ? '#2e7d32' : '#c62828',
								}}>
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										bgcolor: user.isActive ? '#4caf50' : '#f44336',
										mr: 1,
										animation: user.isActive ? 'pulse-glow 2s infinite' : 'none',
										...pageAnimations,
									}}
								/>
								<Typography
									variant="caption"
									fontWeight={600}>
									{user.isActive ? 'Active' : 'Inactive'}
								</Typography>
							</Box>
						</Grid>

						{/* Join Date */}
						<Grid
							item
							size={6}
							sx={{
								animation: 'fadeIn 0.3s ease-out 0.3s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mb: 0.5 }}>
								Join Date
							</Typography>
							<Typography
								variant="body1"
								fontWeight={500}>
								{user.createdAt ? formatDate(user.createdAt) : 'N/A'}
							</Typography>
						</Grid>
					</Grid>

					{/* Divider before metadata */}
					<Divider
						sx={{
							my: 4,
							animation: 'fadeIn 0.3s ease-out 0.35s both',
							...pageAnimations,
						}}
					/>

					{/* Additional Info */}
					<Grid
						container
						spacing={2}
						sx={{
							animation: 'fadeIn 0.3s ease-out 0.4s both',
							...pageAnimations,
						}}>
						<Grid
							item
							size={6}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block' }}>
								Company
							</Typography>
							<Typography
								variant="caption"
								fontWeight={500}>
								{user.companyName || 'Master Company'}
							</Typography>
						</Grid>
					</Grid>
				</Box>
			</Box>

			{/* Actions - Fixed */}
			<DialogActions
				sx={{
					borderTop: '1px solid #e0e0e0',
					p: 3,
					display: 'flex',
					justifyContent: 'flex-end',
					flexShrink: 0,
					animation: 'slideInUp 0.3s ease-out 0.45s both',
					...pageAnimations,
				}}>
				<Button
					onClick={onClose}
					variant="contained"
					sx={{
						'bgcolor': '#135bec',
						'textTransform': 'none',
						'fontWeight': 500,
						'minWidth': 120,
						'transition': 'all 0.2s ease',
						'&:hover': {
							bgcolor: '#0d4bd1',
							transform: 'scale(1.02)',
						},
					}}>
					Close
				</Button>
			</DialogActions>
		</Dialog>
	);
}
