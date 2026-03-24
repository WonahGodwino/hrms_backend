import React, { useState } from 'react';
import {
	Drawer,
	Box,
	Typography,
	IconButton,
	Button,
	useTheme,
	Grid,
	Paper,
	Divider,
	CircularProgress, // Import for loading state
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { downloadFailedRecords } from '../../services/PayrollService'; // Import service

const PayslipDetailsDrawer = ({ open, onClose, payslip }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const [isDownloading, setIsDownloading] = useState(false);

	// Default data if payslip prop is missing
	const { month = 'January', year = 2023, gross = 0, net = 0, date = 'N/A', fileName = '', downloadUrl = '', id = '' } = payslip || {};

	const handleDownloadPayslip = async () => {
		if (!downloadUrl && !id) return;

		setIsDownloading(true);
		try {
			// You'll need to implement or import your downloadPayslip function
			// For now, create a direct download link
			if (downloadUrl) {
				window.open(downloadUrl, '_blank');
			} else if (id) {
				// Call your download API function here
				// await downloadPayslip(id);
			}
		} catch (err) {
			console.error('Failed to download payslip:', err);
		} finally {
			setIsDownloading(false);
		}
	};

	// Format currency
	const formatCurrency = (amount) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
		}).format(amount);
	};

	// Calculate deductions (gross - net)
	const deductions = gross - net;

	return (
		<Drawer
			anchor="right"
			open={open}
			onClose={onClose}
			PaperProps={{
				sx: {
					width: '100%',
					maxWidth: 480,
					backgroundColor: isDarkMode ? '#101622' : '#ffffff',
					color: isDarkMode ? '#f3f4f6' : '#0f172a',
				},
			}}>
			<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
				{/* Header */}
				<Box
					sx={{
						height: 60,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						px: 3,
						borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`,
						flexShrink: 0,
					}}>
					<Typography
						variant="h6"
						sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
						Payslip Details - {month} {year}
					</Typography>
					<IconButton
						onClick={onClose}
						sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
						<CloseIcon />
					</IconButton>
				</Box>

				{/* Scrollable Body */}
				<Box
					sx={{
						flex: 1,
						overflowY: 'auto',
						p: 3,
						display: 'flex',
						flexDirection: 'column',
						gap: 3,
					}}>
					{/* Period and Date Information */}
					<Box>
						<Typography
							variant="subtitle1"
							sx={{ fontWeight: 600, mb: 2 }}>
							Pay Period Information
						</Typography>
						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: '40% 1fr',
								border: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`,
								borderRadius: 2,
								overflow: 'hidden',
							}}>
							{[
								{ label: 'Pay Month', value: month },
								{ label: 'Pay Year', value: year },
								{ label: 'Date Generated', value: date },
								{ label: 'Payslip ID', value: id || 'N/A' },
							].map((item, index) => (
								<React.Fragment key={index}>
									<Box
										sx={{
											px: 2,
											py: 1.5,
											borderTop: index > 0 ? `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}` : 'none',
											color: isDarkMode ? '#94a3b8' : '#64748b',
											fontSize: '0.875rem',
										}}>
										{item.label}
									</Box>
									<Box
										sx={{
											px: 2,
											py: 1.5,
											borderTop: index > 0 ? `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}` : 'none',
											fontWeight: 500,
											fontSize: '0.875rem',
											color: isDarkMode ? '#e2e8f0' : '#1e293b',
										}}>
										{item.value}
									</Box>
								</React.Fragment>
							))}
						</Box>
					</Box>

					{/* Earnings and Deductions */}
					<Box>
						<Typography
							variant="subtitle1"
							sx={{ fontWeight: 600, mb: 2 }}>
							Earnings & Deductions
						</Typography>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
							{/* Gross Pay */}
							<Box
								sx={{
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									p: 2,
									borderRadius: 2,
									border: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.2)' : 'rgba(248, 250, 252, 0.5)',
								}}>
								<Typography sx={{ color: isDarkMode ? '#94a3b8' : '#475569' }}>Gross Pay</Typography>
								<Typography sx={{ fontWeight: 600, color: isDarkMode ? '#22c55e' : '#16a34a' }}>{formatCurrency(gross)}</Typography>
							</Box>

							{/* Deductions */}
							<Box
								sx={{
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									p: 2,
									borderRadius: 2,
									border: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? 'rgba(127, 29, 29, 0.2)' : 'rgba(254, 226, 226, 0.5)',
								}}>
								<Typography sx={{ color: isDarkMode ? '#94a3b8' : '#475569' }}>Total Deductions</Typography>
								<Typography sx={{ fontWeight: 600, color: isDarkMode ? '#ef4444' : '#dc2626' }}>-{formatCurrency(deductions)}</Typography>
							</Box>

							{/* Net Pay */}
							<Box
								sx={{
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									p: 2,
									borderRadius: 2,
									border: `2px solid ${isDarkMode ? '#135bec' : '#135bec'}`,
									bgcolor: isDarkMode ? 'rgba(19, 91, 236, 0.1)' : 'rgba(19, 91, 236, 0.05)',
								}}>
								<Typography sx={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>Net Pay</Typography>
								<Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: isDarkMode ? '#135bec' : '#135bec' }}>{formatCurrency(net)}</Typography>
							</Box>
						</Box>
					</Box>

					{/* Breakdown (Optional - you can expand this) */}
					<Box>
						<Typography
							variant="subtitle1"
							sx={{ fontWeight: 600, mb: 1.5 }}>
							Summary
						</Typography>
						<Typography
							variant="body2"
							sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							This payslip for {month} {year} shows a gross payment of {formatCurrency(gross)} with total deductions of {formatCurrency(deductions)}, resulting in a net
							payment of {formatCurrency(net)}. The payslip was generated on {date}.
						</Typography>
					</Box>
				</Box>

				{/* Sticky Footer */}
				<Box
					sx={{
						p: 2,
						borderTop: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`,
						bgcolor: isDarkMode ? '#101622' : '#ffffff',
						flexShrink: 0,
					}}>
					<Box sx={{ display: 'flex', gap: 1.5 }}>
						<Button
							fullWidth
							variant="contained"
							startIcon={<DownloadIcon />}
							onClick={handleDownloadPayslip}
							disabled={isDownloading || (!downloadUrl && !id)}
							sx={{
								'bgcolor': '#135bec',
								'textTransform': 'none',
								'fontWeight': 500,
								'&:hover': {
									bgcolor: 'rgba(19, 91, 236, 0.9)',
								},
							}}>
							{isDownloading ? (
								<>
									<CircularProgress
										size={20}
										sx={{ color: 'white', mr: 1 }}
									/>
									Downloading...
								</>
							) : (
								'Download Payslip'
							)}
						</Button>
						<Button
							fullWidth
							variant="outlined"
							onClick={onClose}
							sx={{
								'borderColor': isDarkMode ? '#334155' : '#cbd5e1',
								'color': isDarkMode ? '#e2e8f0' : '#334155',
								'textTransform': 'none',
								'fontWeight': 500,
								'&:hover': {
									borderColor: isDarkMode ? '#475569' : '#94a3b8',
									bgcolor: isDarkMode ? '#1e293b' : '#f1f5f9',
								},
							}}>
							Close
						</Button>
					</Box>
				</Box>
			</Box>
		</Drawer>
	);
};

export default PayslipDetailsDrawer;
