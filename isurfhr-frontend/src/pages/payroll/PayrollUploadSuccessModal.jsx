import React, { useState } from 'react';
import {
	Dialog,
	DialogContent,
	Box,
	Typography,
	Button,
	useTheme,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	CircularProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import { downloadFailedRecords } from '../../services/PayrollService';

const PayrollUploadSuccessModal = ({ open, onClose, stats, failedRecords = [], uploadId }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const [isDownloading, setIsDownloading] = useState(false);

	// Default stats if not provided
	const { processed = 100, successful = 98, failed = 2, generated = 98, updated = 0, sent = 98 } = stats || {};

	// Default failed records if not provided
	const records =
		failedRecords.length > 0
			? failedRecords
			: [
					{ row: 15, error: 'Invalid employee ID' },
					{ row: 42, error: 'Missing bank account number' },
			  ];

	const handleDownloadFailed = async () => {
		// If no uploadId passed or no failed records, ignore or handle gracefully
		// Assuming uploadId comes from parent or is part of stats object (adjust based on actual data flow)
		const activeUploadId = uploadId || stats?.uploadId;

		if (!activeUploadId) {
			console.warn('No upload ID available to download failed records.');
			return;
		}

		setIsDownloading(true);
		try {
			const response = await downloadFailedRecords(activeUploadId);

			const blob = new Blob([response.data], {
				type: response.headers['content-type'] || 'text/csv',
			});

			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', `failed_records_${activeUploadId}.csv`);

			document.body.appendChild(link);
			link.click();

			link.parentNode.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to download error records:', err);
		} finally {
			setIsDownloading(false);
		}
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="md" // max-w-2xl approx
			fullWidth
			PaperProps={{
				sx: {
					borderRadius: 3, // rounded-xl
					backgroundColor: isDarkMode ? '#1f2937' : '#ffffff', // bg-gray-800 / white
					color: isDarkMode ? '#ffffff' : '#0d1b12',
					boxShadow: 24,
					overflow: 'hidden',
				},
			}}>
			<DialogContent
				sx={{
					p: { xs: 3, sm: 4 },
					display: 'flex',
					flexDirection: 'column',
					gap: 2,
				}}>
				{/* Success Icon - Fixed Flex Shrink */}
				<Box
					sx={{
						mx: 'auto',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 64,
						height: 64,
						borderRadius: '50%',
						bgcolor: isDarkMode ? 'rgba(17, 212, 82, 0.3)' : 'rgba(17, 212, 82, 0.2)', // bg-primary/20
						color: isDarkMode ? '#a0f2b9' : '#11d452', // text-primary
						flexShrink: 0, // Prevent skewing
					}}>
					<CheckCircleIcon sx={{ fontSize: 36 }} />
				</Box>

				{/* Headline */}
				<Typography
					variant="h5"
					component="h3"
					align="center"
					sx={{
						fontWeight: 700,
						fontSize: '1.875rem', // text-3xl
						lineHeight: 1.25,
						letterSpacing: '-0.025em',
						color: isDarkMode ? '#f3f4f6' : '#0d1b12',
						pb: 1,
					}}>
					Payroll Upload Processed
				</Typography>

				{/* Stats Grid */}
				<Box
					sx={{
						display: 'flex',
						// flexWrap: 'wrap',
						gap: 2,
						p: 2,
						borderRadius: 2, // rounded-lg
						bgcolor: isDarkMode ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb', // bg-gray-700/50 / bg-gray-50
						border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`, // border-gray-700 / border-gray-200
					}}>
					{[
						{
							label: 'Total Processed',
							value: processed,
							color: isDarkMode ? '#ffffff' : '#0d1b12',
						},
						{
							label: 'Successful',
							value: successful,
							color: isDarkMode ? '#4ade80' : '#16a34a',
						}, // green-400 / green-600
						{
							label: 'Failed',
							value: failed,
							color: isDarkMode ? '#f87171' : '#dc2626',
						}, // red-400 / red-600
						{
							label: 'Payslips Generated',
							value: generated,
							color: isDarkMode ? '#ffffff' : '#0d1b12',
						},
						{
							label: 'Payslips Updated',
							value: updated,
							color: isDarkMode ? '#ffffff' : '#0d1b12',
						},

						{
							label: 'Emails Sent',
							value: sent,
							color: isDarkMode ? '#ffffff' : '#0d1b12',
						},
					].map((stat, index) => (
						<Box
							key={index}
							sx={{
								flex: '1 1 120px', // min-w-[120px] flex-1
								display: 'flex',
								flexDirection: 'column',
								gap: 0.5,
								p: 2,
								borderRadius: 3, // rounded-xl
							}}>
							<Typography
								variant="body2"
								sx={{
									fontWeight: 500,
									minHeight: 30,
									color: isDarkMode ? '#9ca3af' : '#4b5563',
								}}>
								{stat.label}
							</Typography>
							<Typography
								variant="h5"
								sx={{ fontWeight: 700, color: stat.color }}>
								{stat.value}
							</Typography>
						</Box>
					))}
				</Box>

				{/* Failed Records Section */}
				{/* {records.length > 0 && (
					<>
						<Box sx={{ pt: 2, px: 2 }}>
							<Typography
								variant="h6"
								sx={{
									fontWeight: 700,
									fontSize: '1.125rem', // text-lg
									color: isDarkMode ? '#f3f4f6' : '#0d1b12',
								}}>
								Failed Records
							</Typography>
						</Box>

						<Box sx={{ px: 2, pb: 1 }}>
							<TableContainer
								component={Paper}
								elevation={0}
								sx={{
									borderRadius: 3, // rounded-xl
									border: `1px solid ${isDarkMode ? '#374151' : '#cfe7d7'}`,
									bgcolor: isDarkMode ? '#1f2937' : '#f8fcf9',
									overflow: 'hidden',
									maxHeight: 200, // Make table scrollable if many errors
								}}>
								<Table
									size="small"
									stickyHeader>
									<TableHead>
										<TableRow
											sx={{
												bgcolor: isDarkMode ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
											}}>
											<TableCell
												sx={{
													width: 150,
													color: isDarkMode ? '#9ca3af' : '#4b5563',
													fontWeight: 500,
													bgcolor: 'inherit',
												}}>
												Row Number
											</TableCell>
											<TableCell
												sx={{
													color: isDarkMode ? '#9ca3af' : '#4b5563',
													fontWeight: 500,
													bgcolor: 'inherit',
												}}>
												Error Message
											</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{records.map((record, idx) => (
											<TableRow
												key={idx}
												sx={{
													'borderTop': `1px solid ${isDarkMode ? '#374151' : '#cfe7d7'}`,
													'&:first-of-type': { borderTop: 0 },
												}}>
												<TableCell
													sx={{
														height: 56,
														color: isDarkMode ? '#d1d5db' : '#1f2937',
													}}>
													{record.row}
												</TableCell>
												<TableCell
													sx={{
														height: 56,
														color: isDarkMode ? '#d1d5db' : '#1f2937',
													}}>
													{record.error}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</TableContainer>
						</Box>
					</>
				)} */}

				{/* Footer Buttons */}
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row-reverse' },
						gap: 1.5,
						pt: 2,
						mt: 2,
						borderTop: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
					}}>
					<Button
						variant="contained"
						onClick={handleDownloadFailed}
						disabled={isDownloading || failed === 0} // Disable if no failed records
						startIcon={!isDownloading && <DownloadIcon />}
						sx={{
							'bgcolor': '#11d452', // primary green
							'color': '#ffffff',
							'fontWeight': 600,
							'textTransform': 'none',
							'borderRadius': 2,
							'py': 1.25,
							'&:hover': {
								bgcolor: 'rgba(17, 212, 82, 0.8)', // hover:bg-primary/80
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
							'Download Failed Records (.csv)'
						)}
					</Button>
					<Button
						onClick={onClose}
						sx={{
							'bgcolor': isDarkMode ? '#4b5563' : '#e5e7eb', // bg-gray-600 / bg-gray-200
							'color': isDarkMode ? '#f3f4f6' : '#1f2937', // text-gray-100 / text-gray-800
							'fontWeight': 600,
							'textTransform': 'none',
							'borderRadius': 2,
							'py': 1.25,
							'px': 3,
							'&:hover': {
								bgcolor: isDarkMode ? '#6b7280' : '#d1d5db', // hover:bg-gray-500 / hover:bg-gray-300
							},
						}}>
						Close
					</Button>
				</Box>
			</DialogContent>
		</Dialog>
	);
};

export default PayrollUploadSuccessModal;
