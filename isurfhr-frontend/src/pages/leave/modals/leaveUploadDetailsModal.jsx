import React from 'react';
import { Drawer, Box, Typography, IconButton, Button, Divider, Stack, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';

const LeaveUploadDetailsModal = ({ open, onClose, upload, onDownloadFailed }) => {
	if (!upload) return null;

	// Destructure with defaults (safe if data is incomplete)
	const {
		summary = {
			totalRecords: upload.totalRecords || 0,
			successful: upload.successful || 0,
			failed: upload.failed || 0,
		},
		metadata = {
			uploadId: upload.id || 'N/A',
			uploadedBy: upload.uploadedBy || 'N/A',
			uploadedAt: upload.uploadedAt || 'N/A',
			fileName: upload.fileName || 'N/A',
		},
		// You can add errors array later if backend returns it
		errors = upload.failed > 0
			? [
					{ row: 12, message: 'Invalid leave type code' },
					{ row: 45, message: 'Duplicate policy entry' },
					{ row: 88, message: 'Missing blockout date format' },
			  ].slice(0, Math.min(upload.failed, 5))
			: [],
	} = upload || {};

	return (
		<Drawer
			anchor="right"
			open={open}
			onClose={onClose}
			PaperProps={{
				sx: {
					width: '100%',
					maxWidth: 512, // ~32rem / max-w-lg
					bgcolor: '#101622',
					color: '#f3f4f6',
					borderLeft: '1px solid #1e293b',
				},
			}}>
			<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
				{/* Sticky Header */}
				<Box
					sx={{
						height: 60,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						px: 3,
						borderBottom: '1px solid #1e293b',
						flexShrink: 0,
					}}>
					<Typography
						variant="h6"
						sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
						Leave Policy Upload Report
					</Typography>
					<IconButton
						onClick={onClose}
						sx={{ color: '#94a3b8' }}>
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
							{ label: 'Total Processed', value: summary.totalRecords, color: 'inherit' },
							{ label: 'Successful', value: summary.successful, color: 'inherit' },
							{
								label: 'Failed',
								value: summary.failed,
								color: '#ef4444', // red-500
							},
						].map((stat, index) => (
							<Box
								key={index}
								sx={{
									flex: '1 1 140px',
									display: 'flex',
									flexDirection: 'column',
									gap: 0.5,
									p: 2,
									borderRadius: 2,
									border: '1px solid #1e293b',
									bgcolor: 'rgba(30, 41, 59, 0.2)',
								}}>
								<Typography
									variant="body2"
									sx={{
										fontWeight: 500,
										color: '#94a3b8',
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
								border: '1px solid #1e293b',
								borderRadius: 2,
								overflow: 'hidden',
							}}>
							{[
								{ label: 'Upload ID', value: metadata.uploadId },
								{ label: 'Uploaded by', value: metadata.uploadedBy },
								{ label: 'Upload date & time', value: metadata.uploadedAt },
								{ label: 'File name', value: metadata.fileName },
							].map((item, index) => (
								<React.Fragment key={index}>
									<Box
										sx={{
											px: 2,
											py: 1.5,
											borderTop: index > 0 ? '1px solid #1e293b' : 'none',
											color: '#94a3b8',
											fontSize: '0.875rem',
										}}>
										{item.label}
									</Box>
									<Box
										sx={{
											px: 2,
											py: 1.5,
											borderTop: index > 0 ? '1px solid #1e293b' : 'none',
											fontWeight: 500,
											fontSize: '0.875rem',
											color: '#e2e8f0',
										}}>
										{item.value}
									</Box>
								</React.Fragment>
							))}
						</Box>
					</Box>

					{/* Errors List Section */}
					<Box>
						<Typography
							variant="subtitle1"
							sx={{ fontWeight: 600, mb: 1.5 }}>
							Errors List
						</Typography>
						{errors.length > 0 ? (
							<Stack spacing={1.5}>
								{errors.map((error, index) => (
									<Box
										key={index}
										sx={{
											display: 'flex',
											alignItems: 'flex-start',
											gap: 1.5,
											p: 2,
											borderRadius: 2,
											border: '1px solid rgba(127, 29, 29, 0.5)',
											bgcolor: 'rgba(127, 29, 29, 0.2)',
										}}>
										<Box
											sx={{
												mt: 0.75,
												width: 6,
												height: 6,
												borderRadius: '50%',
												bgcolor: '#ef4444',
												flexShrink: 0,
											}}
										/>
										<Box>
											<Typography
												variant="body2"
												sx={{
													fontWeight: 600,
													color: '#fecaca',
												}}>
												Row {error.row || 'N/A'}
											</Typography>
											<Typography
												variant="body2"
												sx={{
													color: '#fca5a5',
													mt: 0.25,
												}}>
												{error.message}
											</Typography>
										</Box>
									</Box>
								))}
							</Stack>
						) : (
							<Typography
								variant="body2"
								sx={{ color: '#94a3b8' }}>
								No errors found in this upload.
							</Typography>
						)}
					</Box>
				</Box>

				{/* Sticky Footer */}
				<Box
					sx={{
						p: 2,
						borderTop: '1px solid #1e293b',
						bgcolor: '#101622',
						flexShrink: 0,
					}}>
					<Stack
						direction="row"
						spacing={1.5}>
						<Button
							fullWidth
							variant="contained"
							disabled={summary.failed === 0}
							startIcon={<DownloadIcon />}
							onClick={() => onDownloadFailed?.(upload.id)}
							sx={{
								'bgcolor': '#135bec',
								'textTransform': 'none',
								'fontWeight': 500,
								'&:hover': {
									bgcolor: 'rgba(19, 91, 236, 0.9)',
								},
								'&.Mui-disabled': {
									bgcolor: '#374151',
									color: '#64748b',
								},
							}}>
							Download Failed Records
						</Button>

						<Button
							fullWidth
							variant="outlined"
							onClick={onClose}
							sx={{
								'borderColor': '#334155',
								'color': '#e2e8f0',
								'textTransform': 'none',
								'fontWeight': 500,
								'&:hover': {
									borderColor: '#475569',
									bgcolor: '#1e293b',
								},
							}}>
							Close
						</Button>
					</Stack>
				</Box>
			</Box>
		</Drawer>
	);
};

export default LeaveUploadDetailsModal;

// const LeaveUploadDetailsModal = ({ open, onClose, upload }) => {
// 	if (!upload) return null;

// 	return (
// 		<Dialog
// 			open={open}
// 			onClose={onClose}
// 			maxWidth="sm"
// 			fullWidth
// 			PaperProps={{
// 				sx: {
// 					borderRadius: 3,
// 					bgcolor: '#0f172a',
// 					color: '#e5e7eb',
// 					border: '1px solid rgba(255,255,255,0.08)',
// 				},
// 			}}>
// 			<DialogTitle
// 				sx={{
// 					display: 'flex',
// 					justifyContent: 'space-between',
// 					alignItems: 'center',
// 					borderBottom: '1px solid rgba(255,255,255,0.08)',
// 					p: 3,
// 				}}>
// 				<Typography
// 					variant="h6"
// 					fontWeight={700}
// 					color="white">
// 					Upload Details
// 				</Typography>
// 				<IconButton
// 					onClick={onClose}
// 					sx={{ color: 'rgba(255,255,255,0.7)' }}>
// 					<CloseIcon />
// 				</IconButton>
// 			</DialogTitle>

// 			<DialogContent sx={{ p: 4 }}>
// 				<Stack spacing={3}>
// 					<Box>
// 						<Typography
// 							variant="subtitle2"
// 							color="text.secondary">
// 							File
// 						</Typography>
// 						<Typography
// 							variant="body1"
// 							color="white">
// 							{upload.fileName}
// 						</Typography>
// 					</Box>

// 					<Box>
// 						<Typography
// 							variant="subtitle2"
// 							color="text.secondary">
// 							Uploaded At
// 						</Typography>
// 						<Typography
// 							variant="body1"
// 							color="white">
// 							{upload.uploadedAt}
// 						</Typography>
// 					</Box>

// 					<Box>
// 						<Typography
// 							variant="subtitle2"
// 							color="text.secondary">
// 							Uploaded By
// 						</Typography>
// 						<Typography
// 							variant="body1"
// 							color="white">
// 							{upload.uploadedBy}
// 						</Typography>
// 					</Box>

// 					<Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />

// 					<Box>
// 						<Typography
// 							variant="subtitle2"
// 							color="text.secondary">
// 							Processing Summary
// 						</Typography>
// 						<Stack
// 							direction="row"
// 							spacing={4}
// 							sx={{ mt: 2 }}>
// 							<Box>
// 								<Typography
// 									variant="caption"
// 									color="text.secondary">
// 									Total Records
// 								</Typography>
// 								<Typography
// 									variant="h6"
// 									color="white">
// 									{upload.totalRecords}
// 								</Typography>
// 							</Box>
// 							<Box>
// 								<Typography
// 									variant="caption"
// 									color="text.secondary">
// 									Successful
// 								</Typography>
// 								<Typography
// 									variant="h6"
// 									color="#5eb183">
// 									{upload.successful}
// 								</Typography>
// 							</Box>
// 							<Box>
// 								<Typography
// 									variant="caption"
// 									color="text.secondary">
// 									Failed
// 								</Typography>
// 								<Typography
// 									variant="h6"
// 									color="#f87171">
// 									{upload.failed}
// 								</Typography>
// 							</Box>
// 						</Stack>
// 					</Box>

// 					{upload.failed > 0 && (
// 						<Button
// 							variant="contained"
// 							color="error"
// 							fullWidth
// 							onClick={() => {
// 								// TODO: real download
// 								onClose();
// 							}}
// 							sx={{
// 								'height': 40,
// 								'bgcolor': '#f44336',
// 								'&:hover': { bgcolor: '#e53935' },
// 							}}>
// 							Download Failed Records
// 						</Button>
// 					)}
// 				</Stack>
// 			</DialogContent>

// 			<DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
// 				<Button
// 					onClick={onClose}
// 					sx={{
// 						'height': 40,
// 						'px': 3,
// 						'bgcolor': '#374151',
// 						'color': 'white',
// 						'&:hover': { bgcolor: '#4b5563' },
// 					}}>
// 					Close
// 				</Button>
// 			</DialogActions>
// 		</Dialog>
// 	);
// };

// export default LeaveUploadDetailsModal;
