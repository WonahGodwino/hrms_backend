import React from 'react';
import { Drawer, Box, Typography, IconButton, Button, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const StaffUploadReport = ({ open, onClose, details, onDownload }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Default Mock Data if details prop is missing
	const {
		summary = {
			processed: 150,
			successful: 145,
			failed: 5,
			newlyCreated: 140, // Specific to staff upload
			updated: 5, // Specific to staff upload
		},
		metadata = {
			uploadId: 'upl_staff_123',
			uploadedBy: 'John Doe',
			date: 'Oct 26, 2023, 10:15 AM',
			fileName: 'staff_data_q3.xlsx',
		},
		errors = [
			{ row: 12, message: 'Invalid email format: "john..doe@example.com"' },
			{ row: 45, message: 'Duplicate Staff ID: "STF-005"' },
			{ row: 88, message: 'Missing required field: Department' },
		],
	} = details || {};

	return (
		<Drawer
			anchor="right"
			open={open}
			onClose={onClose}
			PaperProps={{
				sx: {
					width: '100%',
					maxWidth: 512, // max-w-lg (32rem)
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
						borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`, // slate-800 / slate-200
						flexShrink: 0,
					}}>
					<Typography
						variant="h6"
						sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
						Staff Upload Report
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
					{/* Stats Section */}
					<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
						{[
							{
								label: 'Total Processed',
								value: summary.processed,
								color: 'inherit',
							},
							{
								label: 'Successful',
								value: summary.successful,
								color: 'inherit',
							},
							{
								label: 'Failed',
								value: summary.failed,
								color: isDarkMode ? '#ef4444' : '#dc2626',
							}, // red-500 / red-600
							{
								label: 'Newly Created',
								value: summary.newlyCreated,
								color: 'inherit',
							},
							{ label: 'Updated', value: summary.updated, color: 'inherit' },
						].map((stat, index) => (
							<Box
								key={index}
								sx={{
									flex: '1 1 140px', // min-w-[140px]
									display: 'flex',
									flexDirection: 'column',
									gap: 0.5,
									p: 2,
									borderRadius: 2,
									border: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.2)' : 'rgba(248, 250, 252, 0.5)', // slate-800/20 / slate-50/50
								}}>
								<Typography
									variant="body2"
									sx={{
										fontWeight: 500,
										color: isDarkMode ? '#94a3b8' : '#475569',
										fontSize: '0.875rem',
									}}>
									{stat.label}
								</Typography>
								<Typography
									variant="h5"
									sx={{
										fontWeight: 700,
										color: stat.color,
										letterSpacing: '-0.025em',
									}}>
									{stat.value}
								</Typography>
							</Box>
						))}
					</Box>

					{/* Upload Metadata Section */}
					<Box>
						<Typography
							variant="subtitle1"
							sx={{ fontWeight: 600, mb: 1.5 }}>
							Upload Metadata
						</Typography>
						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: '35% 1fr',
								border: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`,
								borderRadius: 2,
								overflow: 'hidden',
							}}>
							{[
								{ label: 'Upload ID', value: metadata.uploadId },
								{ label: 'Uploaded by', value: metadata.uploadedBy },
								{ label: 'Upload date & time', value: metadata.date },
								{ label: 'File name', value: metadata.fileName },
							].map((item, index) => (
								<React.Fragment key={index}>
									<Box
										sx={{
											px: 2,
											py: 1.5,
											borderTop: index > 0 ? `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}` : 'none',
											color: isDarkMode ? '#94a3b8' : '#64748b', // slate-400 / slate-500
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
											color: isDarkMode ? '#e2e8f0' : '#1e293b', // slate-200 / slate-800
										}}>
										{item.value}
									</Box>
								</React.Fragment>
							))}
						</Box>
					</Box>

					{/* Errors List Section */}
					{/* <Box>
						<Typography
							variant="subtitle1"
							sx={{ fontWeight: 600, mb: 1.5 }}>
							Errors List
						</Typography>
						{errors.length > 0 ? (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
								{errors.map((error, index) => (
									<Box
										key={index}
										sx={{
											display: 'flex',
											alignItems: 'flex-start',
											gap: 1.5,
											p: 2,
											borderRadius: 2,
											border: `1px solid ${isDarkMode ? 'rgba(127, 29, 29, 0.5)' : '#fecaca'}`, // red-900/50 / red-200
											bgcolor: isDarkMode ? 'rgba(127, 29, 29, 0.2)' : '#fef2f2', // red-900/20 / red-50
										}}>
										<Box
											sx={{
												mt: 0.75,
												width: 6,
												height: 6,
												borderRadius: '50%',
												bgcolor: '#ef4444', // red-500
												flexShrink: 0,
											}}
										/>
										<Box>
											<Typography
												variant="body2"
												sx={{
													fontWeight: 600,
													color: isDarkMode ? '#fecaca' : '#991b1b',
												}}>
												Row {error.row}
											</Typography>
											<Typography
												variant="body2"
												sx={{
													color: isDarkMode ? '#fca5a5' : '#b91c1c',
													mt: 0.25,
												}}>
												{error.message}
											</Typography>
										</Box>
									</Box>
								))}
							</Box>
						) : (
							<Typography
								variant="body2"
								sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
								No errors found in this upload.
							</Typography>
						)}
					</Box> */}
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
							onClick={() => {
								const uploadId = details?.uploadId || details?.metadata?.uploadId;
								if (uploadId) {
									onDownload(uploadId);
								} else {
									console.error('uploadId not found in details:', details);
									// Optionally show an error toast/message
								}
							}}
							disabled={summary.failed === 0}
							sx={{
								'bgcolor': '#135bec', // primary
								'textTransform': 'none',
								'fontWeight': 500,
								'&:hover': {
									bgcolor: 'rgba(19, 91, 236, 0.9)',
								},
							}}>
							Download Failed Records
						</Button>
						<Button
							fullWidth
							variant="outlined"
							onClick={onClose}
							sx={{
								'borderColor': isDarkMode ? '#334155' : '#cbd5e1', // slate-700 / slate-300
								'color': isDarkMode ? '#e2e8f0' : '#334155', // slate-200 / slate-700
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

export default StaffUploadReport;
