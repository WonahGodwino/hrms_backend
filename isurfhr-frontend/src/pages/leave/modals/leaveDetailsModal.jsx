import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Paper, IconButton, Typography, Box, Grid, Chip, Stack, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PersonIcon from '@mui/icons-material/Person';
import DescriptionIcon from '@mui/icons-material/Description';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const LeaveDetailsModal = ({ open, onClose, leaveRecord, role = 'STAFF' }) => {
	if (!leaveRecord) return null;

	const isStaff = role === 'STAFF';
	const isApprover = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role);

	const getStatusColor = (status) => {
		switch (status) {
			case 'Active':
			case 'Approved':
				return 'success';
			case 'Pending':
				return 'warning';
			case 'Inactive':
			case 'Rejected':
				return 'error';
			case 'Cancelled':
				return 'default';
			default:
				return 'default';
		}
	};

	// Map the leaveRecord fields to match what the modal expects
	const mappedRecord = {
		reference: leaveRecord.id,
		status: leaveRecord.status,
		type: leaveRecord.leaveType,
		startDate: leaveRecord.dateCreated,
		endDate: leaveRecord.dateCreated,
		days: leaveRecord.noOfDays,
		reason: leaveRecord.leaveReason,
		staff: leaveRecord.assignedAdmin,
		appliedAt: leaveRecord.dateCreated,
		company: leaveRecord.company,
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
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
			{/* Header with animated entrance */}
			<DialogTitle
				sx={{
					p: 3,
					borderBottom: '1px solid rgba(255,255,255,0.08)',
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}>
				<Box
					sx={{
						animation: 'slideInLeft 0.4s ease-out',
						...modalAnimations,
					}}>
					<Typography
						variant="h6"
						fontWeight={700}
						color="white"
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
								background: 'linear-gradient(90deg, #2196f3, #64b5f6)',
								borderRadius: '2px',
								animation: 'glowPulse 2s infinite',
								...modalAnimations,
							},
						}}>
						Leave Request Details
					</Typography>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{
							'display': 'block',
							'mt': 0.5,
							'transition': 'color 0.3s ease',
							'&:hover': {
								color: '#2196f3',
							},
						}}>
						Reference: {mappedRecord.reference || 'N/A'}
					</Typography>
				</Box>

				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 2,
						animation: 'slideInRight 0.4s ease-out',
						...modalAnimations,
					}}>
					<Chip
						label={mappedRecord.status?.toUpperCase() || 'UNKNOWN'}
						color={getStatusColor(mappedRecord.status)}
						size="medium"
						sx={{
							'fontWeight': 600,
							'minWidth': 100,
							'transition': 'all 0.3s ease',
							'&:hover': {
								transform: 'scale(1.05)',
								boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
							},
						}}
					/>
					<IconButton
						onClick={onClose}
						sx={{
							'color': 'rgba(255,255,255,0.7)',
							'transition': 'all 0.3s ease',
							'&:hover': {
								transform: 'rotate(90deg) scale(1.1)',
								color: '#f44336',
								bgcolor: 'rgba(244, 67, 54, 0.1)',
							},
						}}>
						<CloseIcon />
					</IconButton>
				</Box>
			</DialogTitle>

			{/* Content with staggered animations */}
			<DialogContent sx={{ p: 4 }}>
				<Grid
					container
					spacing={3}
					sx={{ py: 2 }}>
					{/* Left Column - Core Info */}
					<Grid
						item
						xs={12}
						md={5}
						sx={{
							animation: 'slideInLeft 0.5s ease-out',
							...modalAnimations,
						}}>
						<Stack spacing={4}>
							{/* Leave Type */}
							<Box
								sx={{
									'transition': 'all 0.3s ease',
									'&:hover': {
										transform: 'translateX(8px)',
									},
								}}>
								<Typography
									variant="subtitle2"
									color="text.secondary"
									gutterBottom>
									Leave Type
								</Typography>
								<Typography
									variant="h6"
									color="white"
									sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
									<DescriptionIcon
										fontSize="small"
										sx={{
											color: '#2196f3',
											animation: 'rotateIn 0.6s ease-out',
											...modalAnimations,
										}}
									/>
									{mappedRecord.type || 'N/A'}
								</Typography>
							</Box>

							{/* Dates */}
							<Box
								sx={{
									'transition': 'all 0.3s ease',
									'&:hover': {
										transform: 'translateX(8px)',
									},
								}}>
								<Typography
									variant="subtitle2"
									color="text.secondary"
									gutterBottom>
									Dates
								</Typography>
								<Stack
									direction="row"
									spacing={2}
									alignItems="center"
									flexWrap="wrap">
									<CalendarTodayIcon
										fontSize="small"
										sx={{
											color: '#4caf50',
											animation: 'rotateIn 0.6s ease-out 0.1s both',
											...modalAnimations,
										}}
									/>
									<Typography
										variant="body1"
										color="white">
										{mappedRecord.startDate} – {mappedRecord.endDate}
									</Typography>
									<Chip
										label={`${mappedRecord.days} day(s)`}
										size="small"
										sx={{
											'bgcolor': '#2196f3',
											'color': 'white',
											'fontWeight': 600,
											'transition': 'all 0.3s ease',
											'&:hover': {
												transform: 'scale(1.1)',
												bgcolor: '#1976d2',
											},
										}}
									/>
								</Stack>
							</Box>

							{/* Applied On */}
							<Box
								sx={{
									'transition': 'all 0.3s ease',
									'&:hover': {
										transform: 'translateX(8px)',
									},
								}}>
								<Typography
									variant="subtitle2"
									color="text.secondary"
									gutterBottom>
									Applied On
								</Typography>
								<Typography
									variant="body1"
									color="white">
									{mappedRecord.appliedAt || 'N/A'}
								</Typography>
							</Box>

							{/* Company Info */}
							<Box
								sx={{
									'transition': 'all 0.3s ease',
									'&:hover': {
										transform: 'translateX(8px)',
									},
								}}>
								<Typography
									variant="subtitle2"
									color="text.secondary"
									gutterBottom>
									Company
								</Typography>
								<Typography
									variant="body1"
									color="white">
									{mappedRecord.company?.name || 'N/A'}
								</Typography>
								<Typography
									variant="caption"
									color="text.secondary">
									{mappedRecord.company?.department || ''} Department
								</Typography>
							</Box>

							{/* Staff (visible to approvers) */}
							{!isStaff && (
								<Box
									sx={{
										'animation': 'fadeInScale 0.5s ease-out 0.2s both',
										...modalAnimations,
										'transition': 'all 0.3s ease',
										'&:hover': {
											transform: 'translateX(8px)',
										},
									}}>
									<Typography
										variant="subtitle2"
										color="text.secondary"
										gutterBottom>
										Assigned Admin
									</Typography>
									<Typography
										variant="body1"
										color="white"
										sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
										<PersonIcon
											fontSize="small"
											sx={{ color: '#2196f3' }}
										/>
										{mappedRecord.staff || 'Unassigned'}
									</Typography>
								</Box>
							)}
						</Stack>
					</Grid>

					{/* Right Column - Reason */}
					<Grid
						item
						size={{ xs: 12, md: 7 }}
						sx={{
							animation: 'slideInRight 0.5s ease-out 0.1s both',
							...modalAnimations,
						}}>
						<Paper
							sx={{
								'p': 4,
								'bgcolor': '#1e293b',
								'borderRadius': 2,
								'border': '1px solid rgba(255,255,255,0.08)',
								'minHeight': '100%',
								'transition': 'all 0.3s ease',
								'&:hover': {
									transform: 'scale(1.01)',
									borderColor: 'rgba(33, 150, 243, 0.3)',
									boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
								},
							}}>
							<Typography
								variant="subtitle1"
								color="white"
								gutterBottom
								sx={{
									'mb': 2,
									'position': 'relative',
									'display': 'inline-block',
									'&::after': {
										content: '""',
										position: 'absolute',
										bottom: -4,
										left: 0,
										width: '30px',
										height: '2px',
										background: '#2196f3',
										transition: 'width 0.3s ease',
									},
									'&:hover::after': {
										width: '100%',
									},
								}}>
								Reason for Leave
							</Typography>
							<Typography
								variant="body1"
								color="rgba(255,255,255,0.95)"
								sx={{
									'whiteSpace': 'pre-wrap',
									'lineHeight': 1.7,
									'fontSize': '1.05rem',
									'transition': 'color 0.3s ease',
									'&:hover': {
										color: 'white',
									},
								}}>
								{mappedRecord.reason || 'No reason provided.'}
							</Typography>
						</Paper>
					</Grid>
				</Grid>
			</DialogContent>

			{/* Actions with hover animations */}
			<DialogActions
				sx={{
					p: 3,
					borderTop: '1px solid rgba(255,255,255,0.08)',
					gap: 2,
					justifyContent: 'flex-end',
					animation: 'fadeInScale 0.5s ease-out 0.2s both',
					...modalAnimations,
				}}>
				{/* Role-based primary actions */}
				{isStaff && mappedRecord.status === 'Pending' && (
					<Button
						variant="contained"
						startIcon={<CancelIcon sx={{ transition: 'transform 0.3s ease' }} />}
						onClick={() => {
							// TODO: handle cancel logic
							onClose();
						}}
						sx={{
							'height': 40,
							'px': 3,
							'borderRadius': 1,
							'bgcolor': '#f44336',
							'color': '#ffffff',
							'fontWeight': 700,
							'textTransform': 'none',
							'letterSpacing': '0.015em',
							'boxShadow': 'none',
							'position': 'relative',
							'overflow': 'hidden',
							'&::before': {
								content: '""',
								position: 'absolute',
								top: '50%',
								left: '50%',
								width: 0,
								height: 0,
								borderRadius: '50%',
								background: 'rgba(255,255,255,0.2)',
								transform: 'translate(-50%, -50%)',
								transition: 'width 0.6s ease, height 0.6s ease',
							},
							'&:hover': {
								'bgcolor': '#e53935',
								'boxShadow': 'none',
								'transform': 'scale(1.02)',
								'&::before': {
									width: '200px',
									height: '200px',
								},
								'& .MuiSvgIcon-root': {
									animation: 'shake 0.5s ease',
									...modalAnimations,
								},
							},
						}}>
						Cancel Request
					</Button>
				)}

				{isApprover && mappedRecord.status === 'Pending' && (
					<>
						<Button
							variant="contained"
							startIcon={<CheckCircleIcon sx={{ transition: 'transform 0.3s ease' }} />}
							onClick={() => {
								// TODO: handle approve
								onClose();
							}}
							sx={{
								'height': 40,
								'px': 3,
								'borderRadius': 1,
								'bgcolor': '#4caf50',
								'color': '#ffffff',
								'fontWeight': 700,
								'textTransform': 'none',
								'letterSpacing': '0.015em',
								'boxShadow': 'none',
								'position': 'relative',
								'overflow': 'hidden',
								'&::before': {
									content: '""',
									position: 'absolute',
									top: '50%',
									left: '50%',
									width: 0,
									height: 0,
									borderRadius: '50%',
									background: 'rgba(255,255,255,0.2)',
									transform: 'translate(-50%, -50%)',
									transition: 'width 0.6s ease, height 0.6s ease',
								},
								'&:hover': {
									'bgcolor': '#43a047',
									'boxShadow': 'none',
									'transform': 'scale(1.02)',
									'&::before': {
										width: '200px',
										height: '200px',
									},
									'& .MuiSvgIcon-root': {
										transform: 'scale(1.2) rotate(360deg)',
										transition: 'transform 0.5s ease',
									},
								},
							}}>
							Approve
						</Button>

						<Button
							variant="contained"
							startIcon={<CancelIcon sx={{ transition: 'transform 0.3s ease' }} />}
							onClick={() => {
								// TODO: handle reject
								onClose();
							}}
							sx={{
								'height': 40,
								'px': 3,
								'borderRadius': 1,
								'bgcolor': '#f44336',
								'color': '#ffffff',
								'fontWeight': 700,
								'textTransform': 'none',
								'letterSpacing': '0.015em',
								'boxShadow': 'none',
								'position': 'relative',
								'overflow': 'hidden',
								'&::before': {
									content: '""',
									position: 'absolute',
									top: '50%',
									left: '50%',
									width: 0,
									height: 0,
									borderRadius: '50%',
									background: 'rgba(255,255,255,0.2)',
									transform: 'translate(-50%, -50%)',
									transition: 'width 0.6s ease, height 0.6s ease',
								},
								'&:hover': {
									'bgcolor': '#e53935',
									'boxShadow': 'none',
									'transform': 'scale(1.02)',
									'&::before': {
										width: '200px',
										height: '200px',
									},
									'& .MuiSvgIcon-root': {
										animation: 'shake 0.5s ease',
										...modalAnimations,
									},
								},
							}}>
							Reject
						</Button>
					</>
				)}

				{/* Always-visible Close button */}
				<Button
					variant="contained"
					onClick={onClose}
					sx={{
						'height': 40,
						'px': 3,
						'borderRadius': 1,
						'bgcolor': '#137fec',
						'color': '#ffffff',
						'fontWeight': 700,
						'textTransform': 'none',
						'letterSpacing': '0.015em',
						'boxShadow': 'none',
						'position': 'relative',
						'overflow': 'hidden',
						'&::before': {
							content: '""',
							position: 'absolute',
							top: 0,
							left: '-100%',
							width: '100%',
							height: '100%',
							background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
							transition: 'left 0.5s ease',
						},
						'&:hover': {
							'bgcolor': 'rgba(19, 127, 236, 0.9)',
							'boxShadow': 'none',
							'transform': 'scale(1.02)',
							'&::before': {
								left: '100%',
							},
						},
					}}>
					Close
				</Button>
			</DialogActions>
		</Dialog>
	);
};
export default LeaveDetailsModal;

// Add these animation styles at the top of your component
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
	'@keyframes fadeInScale': {
		'0%': {
			transform: 'scale(0.9)',
			opacity: 0,
		},
		'100%': {
			transform: 'scale(1)',
			opacity: 1,
		},
	},
	'@keyframes glowPulse': {
		'0%': {
			boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)',
		},
		'50%': {
			boxShadow: '0 0 20px 10px rgba(33, 150, 243, 0.2)',
		},
		'100%': {
			boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)',
		},
	},
	'@keyframes rotateIn': {
		'0%': {
			transform: 'rotate(-180deg) scale(0.5)',
			opacity: 0,
		},
		'100%': {
			transform: 'rotate(0) scale(1)',
			opacity: 1,
		},
	},
	'@keyframes shake': {
		'0%, 100%': { transform: 'translateX(0)' },
		'10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-2px)' },
		'20%, 40%, 60%, 80%': { transform: 'translateX(2px)' },
	},
};
