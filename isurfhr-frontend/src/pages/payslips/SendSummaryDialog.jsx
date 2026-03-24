// SendSummaryDialog.jsx
import React from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Box,
	Typography,
	IconButton,
	Button,
	Paper,
	Grid,
	Chip,
	Avatar,
	Divider,
	Alert,
	CircularProgress,
} from '@mui/material';
import {
	Close as CloseIcon,
	CheckCircle as SuccessIcon,
	Error as ErrorIcon,
	Info as InfoIcon,
	Download as DownloadIcon,
	Business as BusinessIcon,
	Send as SendIcon,
	People as PeopleIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

const StatusChip = styled(Chip)(({ theme, success, failure }) => ({
	...(success && {
		'backgroundColor': 'rgba(16, 185, 129, 0.1)',
		'color': '#10b981',
		'borderColor': '#10b981',
		'& .MuiChip-icon': {
			color: '#10b981',
		},
	}),
	...(failure && {
		'backgroundColor': 'rgba(239, 68, 68, 0.1)',
		'color': '#ef4444',
		'borderColor': '#ef4444',
		'& .MuiChip-icon': {
			color: '#ef4444',
		},
	}),
}));

const SendSummaryDialog = ({ open, onClose, summaryData, isDarkMode }) => {
	if (!summaryData) return null;

	const { companyName, summary, details, message } = summaryData;
	const successRate = parseFloat(summary.successRate);

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="md"
			fullWidth
			PaperProps={{
				sx: {
					borderRadius: 3,
					bgcolor: isDarkMode ? '#1f2937' : '#ffffff',
					backgroundImage: 'none',
				},
			}}>
			<DialogTitle
				sx={{
					p: 3,
					pb: 2,
					borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
					<Box
						sx={{
							width: 40,
							height: 40,
							borderRadius: '50%',
							bgcolor: summary.failed === 0 ? 'rgba(16, 185, 129, 0.1)' : summary.successful === 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						{summary.failed === 0 ? (
							<SuccessIcon sx={{ color: '#10b981' }} />
						) : summary.successful === 0 ? (
							<ErrorIcon sx={{ color: '#ef4444' }} />
						) : (
							<InfoIcon sx={{ color: '#f59e0b' }} />
						)}
					</Box>
					<Box>
						<Typography
							variant="h6"
							sx={{
								fontWeight: 700,
								color: isDarkMode ? '#fff' : '#0f172a',
							}}>
							Send Operation Complete
						</Typography>
						<Typography
							variant="body2"
							sx={{
								color: isDarkMode ? '#94a3b8' : '#64748b',
								mt: 0.5,
							}}>
							{message || 'Payslip sending process completed'}
						</Typography>
					</Box>
				</Box>
				<IconButton
					onClick={onClose}
					size="small"
					sx={{
						'transition': 'all 0.2s ease',
						'&:hover': {
							transform: 'rotate(90deg) scale(1.1)',
							color: '#f44336',
						},
					}}>
					<CloseIcon />
				</IconButton>
			</DialogTitle>

			<DialogContent sx={{ p: 3 }}>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
					{/* Company Info */}
					<Paper
						elevation={0}
						sx={{
							p: 2.5,
							borderRadius: 2,
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
						}}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
							<BusinessIcon sx={{ color: '#137fec' }} />
							<Typography
								variant="subtitle1"
								sx={{
									fontWeight: 600,
									color: isDarkMode ? '#fff' : '#0f172a',
								}}>
								{companyName || 'Selected Company'}
							</Typography>
						</Box>

						{/* Summary Stats */}
						<Grid
							container
							spacing={2}>
							<Grid
								item
								xs={12}
								sm={4}>
								<Box sx={{ textAlign: 'center' }}>
									<Typography
										variant="h4"
										sx={{
											fontWeight: 700,
											color: isDarkMode ? '#fff' : '#0f172a',
											mb: 0.5,
										}}>
										{summary.total}
									</Typography>
									<Typography
										variant="caption"
										sx={{
											color: isDarkMode ? '#94a3b8' : '#64748b',
											textTransform: 'uppercase',
											fontWeight: 600,
										}}>
										Total Processed
									</Typography>
								</Box>
							</Grid>

							<Grid
								item
								xs={12}
								sm={4}>
								<Box sx={{ textAlign: 'center' }}>
									<Typography
										variant="h4"
										sx={{
											fontWeight: 700,
											color: '#10b981',
											mb: 0.5,
										}}>
										{summary.successful}
									</Typography>
									<Typography
										variant="caption"
										sx={{
											color: isDarkMode ? '#94a3b8' : '#64748b',
											textTransform: 'uppercase',
											fontWeight: 600,
										}}>
										Successful
									</Typography>
								</Box>
							</Grid>

							<Grid
								item
								xs={12}
								sm={4}>
								<Box sx={{ textAlign: 'center' }}>
									<Typography
										variant="h4"
										sx={{
											fontWeight: 700,
											color: '#ef4444',
											mb: 0.5,
										}}>
										{summary.failed}
									</Typography>
									<Typography
										variant="caption"
										sx={{
											color: isDarkMode ? '#94a3b8' : '#64748b',
											textTransform: 'uppercase',
											fontWeight: 600,
										}}>
										Failed
									</Typography>
								</Box>
							</Grid>
						</Grid>

						{/* Success Rate Bar */}
						<Box sx={{ mt: 3 }}>
							<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
								<Typography
									variant="body2"
									sx={{
										fontWeight: 600,
										color: isDarkMode ? '#e2e8f0' : '#1e293b',
									}}>
									Success Rate
								</Typography>
								<Typography
									variant="body2"
									sx={{
										fontWeight: 700,
										color: successRate === 100 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444',
									}}>
									{summary.successRate}
								</Typography>
							</Box>
							<Box
								sx={{
									width: '100%',
									height: 8,
									bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
									borderRadius: 4,
									overflow: 'hidden',
								}}>
								<Box
									sx={{
										width: `${successRate}%`,
										height: '100%',
										bgcolor: successRate === 100 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444',
										borderRadius: 4,
										transition: 'width 1s ease-in-out',
									}}
								/>
							</Box>
						</Box>
					</Paper>

					{/* Detailed Results */}
					<Box>
						<Typography
							variant="subtitle2"
							sx={{
								fontWeight: 600,
								color: isDarkMode ? '#e2e8f0' : '#1e293b',
								mb: 2,
								display: 'flex',
								alignItems: 'center',
								gap: 1,
							}}>
							<PeopleIcon sx={{ fontSize: 20, color: '#137fec' }} />
							Detailed Results ({details.length} {details.length === 1 ? 'employee' : 'employees'})
						</Typography>

						<Box
							sx={{
								maxHeight: 300,
								overflowY: 'auto',
								borderRadius: 2,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1e293b' : '#ffffff',
							}}>
							{details.map((item, index) => (
								<Box
									key={item.payslipId || index}
									sx={{
										'p': 2,
										'borderBottom': index < details.length - 1 ? `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` : 'none',
										'display': 'flex',
										'alignItems': 'center',
										'justifyContent': 'space-between',
										'transition': 'background-color 0.2s ease',
										'&:hover': {
											bgcolor: isDarkMode ? '#334155' : '#f8fafc',
										},
									}}>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
										<Avatar
											sx={{
												width: 36,
												height: 36,
												bgcolor: item.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
												color: item.success ? '#10b981' : '#ef4444',
											}}>
											{item.staffName?.charAt(0) || '?'}
										</Avatar>
										<Box sx={{ flex: 1 }}>
											<Typography
												variant="body2"
												sx={{
													fontWeight: 600,
													color: isDarkMode ? '#fff' : '#0f172a',
												}}>
												{item.staffName || 'Unknown'}
											</Typography>
											<Typography
												variant="caption"
												sx={{
													color: isDarkMode ? '#94a3b8' : '#64748b',
													display: 'block',
												}}>
												ID: {item.staffId || 'N/A'} • {item.email || 'No email'}
											</Typography>
											{item.errorMessage && (
												<Typography
													variant="caption"
													sx={{
														color: '#ef4444',
														display: 'block',
														mt: 0.5,
														fontStyle: 'italic',
													}}>
													Error: {item.errorMessage}
												</Typography>
											)}
										</Box>
									</Box>

									<StatusChip
										size="small"
										icon={item.success ? <SuccessIcon /> : <ErrorIcon />}
										label={item.success ? 'Sent' : 'Failed'}
										success={item.success}
										failure={!item.success}
										variant="outlined"
										sx={{ minWidth: 80 }}
									/>
								</Box>
							))}
						</Box>
					</Box>

					{/* Summary Alert */}
					{summary.failed > 0 && (
						<Alert
							severity={summary.successful === 0 ? 'error' : 'warning'}
							sx={{
								'borderRadius': 2,
								'& .MuiAlert-icon': {
									alignItems: 'center',
								},
							}}>
							{summary.successful === 0
								? 'All sends failed. Please check the error details above and try again.'
								: `${summary.failed} out of ${summary.total} sends failed. Some employees may not have received their payslips.`}
						</Alert>
					)}
				</Box>
			</DialogContent>

			<DialogActions
				sx={{
					p: 3,
					pt: 2,
					borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					gap: 1,
				}}>
				<Button
					onClick={onClose}
					variant="contained"
					sx={{
						'bgcolor': '#137fec',
						'&:hover': {
							bgcolor: '#1170d0',
						},
						'textTransform': 'none',
						'fontWeight': 600,
						'borderRadius': 2,
						'px': 4,
					}}>
					Close
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default SendSummaryDialog;
