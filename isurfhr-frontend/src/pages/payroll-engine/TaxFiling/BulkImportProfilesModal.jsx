// src/pages/payroll-engine/TaxFiling/BulkImportProfilesModal.jsx
import React, { useState, useRef } from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	Box,
	Typography,
	CircularProgress,
	Alert,
	useTheme,
	List,
	ListItem,
	ListItemIcon,
	ListItemText,
	LinearProgress,
	Chip,
	Divider,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import DownloadIcon from '@mui/icons-material/Download';

import { bulkImportProfiles, downloadProfileTemplate } from '@/services/TaxFilingService';

const BulkImportProfilesModal = ({ open, onClose, companyId, onSuccess }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const fileInputRef = useRef(null);

	const [file, setFile] = useState(null);
	const [uploading, setUploading] = useState(false);
	const [result, setResult] = useState(null);
	const [error, setError] = useState(null);

	// Handle file selection
	const handleFileSelect = (e) => {
		const selectedFile = e.target.files?.[0];
		if (selectedFile) {
			// Validate file type
			const validTypes = [
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'application/vnd.ms-excel',
				'text/csv',
			];
			if (!validTypes.includes(selectedFile.type)) {
				setError('Please upload an Excel (.xlsx, .xls) or CSV file');
				return;
			}
			setFile(selectedFile);
			setError(null);
			setResult(null);
		}
	};

	// Handle drag and drop
	const handleDrop = (e) => {
		e.preventDefault();
		const droppedFile = e.dataTransfer.files?.[0];
		if (droppedFile) {
			setFile(droppedFile);
			setError(null);
			setResult(null);
		}
	};

	const handleDragOver = (e) => {
		e.preventDefault();
	};

	// Handle upload
	const handleUpload = async () => {
		if (!file || !companyId) return;

		setUploading(true);
		setError(null);
		setResult(null);

		try {
			const response = await bulkImportProfiles(file, companyId);
			if (response.data?.success) {
				setResult(response.data.data);
			}
		} catch (err) {
			console.error('Failed to import profiles:', err);
			setError(err.response?.data?.message || 'Failed to import profiles');
		} finally {
			setUploading(false);
		}
	};

	// Handle download template
	const handleDownloadTemplate = async () => {
		try {
			const response = await downloadProfileTemplate(companyId);
			const blob = new Blob([response.data], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'Tax-Profiles-Template.xlsx';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to download template:', err);
			setError('Failed to download template');
		}
	};

	// Handle close
	const handleClose = () => {
		setFile(null);
		setResult(null);
		setError(null);
		onClose();
	};

	// Handle done (after successful import)
	const handleDone = () => {
		handleClose();
		onSuccess();
	};

	// Format file size
	const formatFileSize = (bytes) => {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	};

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: {
					bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
					borderRadius: 3,
				},
			}}>
			<DialogTitle sx={{ fontWeight: 700 }}>Import Tax Profiles</DialogTitle>

			<DialogContent>
				{error && (
					<Alert severity="error" sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}

				{!result ? (
					<>
						{/* Download Template */}
						<Box
							sx={{
								p: 2,
								mb: 3,
								borderRadius: 2,
								bgcolor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							}}>
							<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
								Need a template?
							</Typography>
							<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
								Download our Excel template with the correct column headers and sample data.
							</Typography>
							<Button
								size="small"
								variant="outlined"
								startIcon={<DownloadIcon />}
								onClick={handleDownloadTemplate}>
								Download Template
							</Button>
						</Box>

						{/* File Drop Zone */}
						<Box
							onDrop={handleDrop}
							onDragOver={handleDragOver}
							onClick={() => fileInputRef.current?.click()}
							sx={{
								'p': 4,
								'border': `2px dashed ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								'borderRadius': 2,
								'textAlign': 'center',
								'cursor': 'pointer',
								'transition': 'all 0.2s',
								'&:hover': {
									borderColor: '#137fec',
									bgcolor: isDarkMode ? 'rgba(19, 127, 236, 0.05)' : 'rgba(19, 127, 236, 0.02)',
								},
							}}>
							<input
								ref={fileInputRef}
								type="file"
								accept=".xlsx,.xls,.csv"
								onChange={handleFileSelect}
								style={{ display: 'none' }}
							/>
							<CloudUploadIcon sx={{ fontSize: 48, color: '#137fec', mb: 2 }} />
							<Typography variant="body1" sx={{ fontWeight: 500, mb: 0.5 }}>
								Drag and drop your file here
							</Typography>
							<Typography variant="body2" color="text.secondary">
								or click to browse (Excel or CSV)
							</Typography>
						</Box>

						{/* Selected File */}
						{file && (
							<Box
								sx={{
									mt: 2,
									p: 2,
									borderRadius: 2,
									bgcolor: isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)',
									border: '1px solid #22c55e',
									display: 'flex',
									alignItems: 'center',
									gap: 2,
								}}>
								<InsertDriveFileIcon sx={{ color: '#22c55e' }} />
								<Box sx={{ flex: 1 }}>
									<Typography variant="body2" sx={{ fontWeight: 500 }}>
										{file.name}
									</Typography>
									<Typography variant="caption" color="text.secondary">
										{formatFileSize(file.size)}
									</Typography>
								</Box>
								<Button size="small" color="error" onClick={() => setFile(null)}>
									Remove
								</Button>
							</Box>
						)}

						{/* Expected Columns */}
						<Box sx={{ mt: 3 }}>
							<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
								Expected Columns
							</Typography>
							<List dense>
								<ListItem sx={{ py: 0.5 }}>
									<ListItemText
										primary="staffId"
										secondary="Employee staff ID (required)"
										primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
									/>
								</ListItem>
								<ListItem sx={{ py: 0.5 }}>
									<ListItemText
										primary="stateOfResidence"
										secondary="State name e.g., Lagos, FCT (required)"
										primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
									/>
								</ListItem>
								<ListItem sx={{ py: 0.5 }}>
									<ListItemText
										primary="jtbTin"
										secondary="13-digit JTB TIN (optional)"
										primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
									/>
								</ListItem>
								<ListItem sx={{ py: 0.5 }}>
									<ListItemText
										primary="pfaName"
										secondary="Pension Fund Administrator (optional)"
										primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
									/>
								</ListItem>
							</List>
						</Box>
					</>
				) : (
					/* Import Results */
					<Box>
						{/* Summary */}
						<Box
							sx={{
								p: 3,
								borderRadius: 2,
								bgcolor:
									result.failed > 0
										? isDarkMode
											? 'rgba(245, 158, 11, 0.1)'
											: 'rgba(245, 158, 11, 0.05)'
										: isDarkMode
											? 'rgba(34, 197, 94, 0.1)'
											: 'rgba(34, 197, 94, 0.05)',
								border: `1px solid ${result.failed > 0 ? '#f59e0b' : '#22c55e'}`,
								textAlign: 'center',
								mb: 3,
							}}>
							{result.failed > 0 ? (
								<ErrorIcon sx={{ fontSize: 48, color: '#f59e0b', mb: 1 }} />
							) : (
								<CheckCircleIcon sx={{ fontSize: 48, color: '#22c55e', mb: 1 }} />
							)}
							<Typography variant="h6" sx={{ fontWeight: 700 }}>
								Import {result.failed > 0 ? 'Completed with Errors' : 'Successful'}
							</Typography>
							<Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
								<Chip
									icon={<CheckCircleIcon />}
									label={`${result.successful} Successful`}
									color="success"
									variant="outlined"
								/>
								{result.failed > 0 && (
									<Chip
										icon={<ErrorIcon />}
										label={`${result.failed} Failed`}
										color="warning"
										variant="outlined"
									/>
								)}
							</Box>
						</Box>

						{/* Progress Bar */}
						<Box sx={{ mb: 3 }}>
							<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
								<Typography variant="body2" color="text.secondary">
									Success Rate
								</Typography>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{Math.round((result.successful / result.total) * 100)}%
								</Typography>
							</Box>
							<LinearProgress
								variant="determinate"
								value={(result.successful / result.total) * 100}
								sx={{
									height: 8,
									borderRadius: 4,
									bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
									'& .MuiLinearProgress-bar': {
										bgcolor: '#22c55e',
									},
								}}
							/>
						</Box>

						{/* Errors List */}
						{result.errors && result.errors.length > 0 && (
							<Box>
								<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
									Errors ({result.errors.length})
								</Typography>
								<Box
									sx={{
										maxHeight: 200,
										overflow: 'auto',
										borderRadius: 2,
										border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									<List dense>
										{result.errors.map((err, index) => (
											<React.Fragment key={index}>
												<ListItem>
													<ListItemIcon sx={{ minWidth: 36 }}>
														<ErrorIcon fontSize="small" sx={{ color: '#ef4444' }} />
													</ListItemIcon>
													<ListItemText
														primary={`Row ${err.row}: ${err.staffId || 'Unknown'}`}
														secondary={err.error}
														primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
														secondaryTypographyProps={{ variant: 'caption' }}
													/>
												</ListItem>
												{index < result.errors.length - 1 && <Divider />}
											</React.Fragment>
										))}
									</List>
								</Box>
							</Box>
						)}
					</Box>
				)}

				{/* Uploading State */}
				{uploading && (
					<Box sx={{ mt: 3, textAlign: 'center' }}>
						<CircularProgress size={40} />
						<Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
							Importing profiles...
						</Typography>
					</Box>
				)}
			</DialogContent>

			<DialogActions sx={{ p: 3, pt: 0 }}>
				{!result ? (
					<>
						<Button onClick={handleClose} disabled={uploading}>
							Cancel
						</Button>
						<Button
							variant="contained"
							onClick={handleUpload}
							disabled={!file || uploading}
							startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />}
							sx={{ bgcolor: '#137fec', '&:hover': { bgcolor: '#1d4ed8' } }}>
							{uploading ? 'Uploading...' : 'Upload & Import'}
						</Button>
					</>
				) : (
					<Button variant="contained" onClick={handleDone} sx={{ bgcolor: '#137fec' }}>
						Done
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
};

export default BulkImportProfilesModal;
