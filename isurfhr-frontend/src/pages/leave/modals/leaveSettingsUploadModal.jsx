import React, { useState } from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	IconButton,
	Typography,
	Box,
	Button,
	CircularProgress,
	Alert,
	LinearProgress,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Paper,
	Stack,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckIcon from '@mui/icons-material/Check';
import * as XLSX from 'xlsx'; // Make sure this is installed

const LeaveSettingsUploadModal = ({ open, onClose, onUploadSuccess }) => {
	const [file, setFile] = useState(null);
	const [dragActive, setDragActive] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState('');
	const [uploadResult, setUploadResult] = useState(null);
	const [showSuccessModal, setShowSuccessModal] = useState(false);
	const [excelPreview, setExcelPreview] = useState(null);
	const [showPreviewModal, setShowPreviewModal] = useState(false);

	// Drag & Drop Handlers
	const handleDragOver = (e) => {
		e.preventDefault();
		setDragActive(true);
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		setDragActive(false);
	};

	const handleDrop = (e) => {
		e.preventDefault();
		setDragActive(false);
		const droppedFile = e.dataTransfer.files[0];
		if (droppedFile) handleFileSelect(droppedFile);
	};

	const handleFileChange = (e) => {
		const selected = e.target.files[0];
		if (selected) handleFileSelect(selected);
	};

	const handleFileSelect = (selectedFile) => {
		const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/csv'];
		if (!validTypes.includes(selectedFile.type)) {
			setError('Only .xlsx or .csv files are allowed');
			return;
		}
		setFile(selectedFile);
		setError('');
		parseExcelPreview(selectedFile);
	};

	const parseExcelPreview = async (file) => {
		try {
			const buffer = await file.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: 'array' });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

			if (!jsonData.length) {
				setExcelPreview(null);
				return;
			}

			const headers = Object.keys(jsonData[0]);
			const rows = jsonData.slice(0, 150); // preview first 150 rows
			setExcelPreview({ headers, rows });
		} catch (err) {
			console.error('Preview parse error:', err);
			setExcelPreview(null);
		}
	};

	const handleUpload = async () => {
		if (!file) return setError('Please select a file');

		setUploading(true);
		setProgress(0);
		setError('');

		const interval = setInterval(() => {
			setProgress((prev) => Math.min(prev + Math.random() * 20 + 10, 90));
		}, 400);

		try {
			await new Promise((resolve) => setTimeout(resolve, 3000));
			clearInterval(interval);
			setProgress(100);

			// Mock result — replace with real API
			const result = {
				total: 25,
				success: 22,
				failed: 3,
				uploadId: 'upl_leave_789',
				errors: [
					{ row: 15, message: 'Invalid leave type code' },
					{ row: 18, message: 'Missing accrual rate' },
					{ row: 23, message: 'Duplicate leave type name' },
				],
			};

			setUploadResult(result);
			onUploadSuccess?.();

			setTimeout(() => {
				setUploading(false);
				onClose();
				setShowSuccessModal(true);
			}, 800);
		} catch (err) {
			clearInterval(interval);
			setError('Upload failed. Please try again.');
			setUploading(false);
		}
	};

	const handleSuccessClose = () => {
		setShowSuccessModal(false);
		setFile(null);
		setUploadResult(null);
		setExcelPreview(null);
	};

	const handleDownloadFailed = () => {
		// TODO: real download (use uploadResult.uploadId)
		alert('Downloading failed records report...');
	};

	return (
		<>
			{/* Main Upload Dialog */}
			<Dialog
				open={open}
				onClose={!uploading ? onClose : undefined}
				maxWidth="sm"
				fullWidth
				PaperProps={{
					sx: {
						borderRadius: 3,
						bgcolor: '#0f172a',
						color: '#e5e7eb',
						border: '1px solid rgba(255,255,255,0.08)',
					},
				}}>
				<DialogTitle
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						borderBottom: '1px solid rgba(255,255,255,0.08)',
						p: 3,
					}}>
					<Typography
						variant="h6"
						fontWeight={700}
						color="white">
						Upload Leave Policy File
					</Typography>
					<IconButton
						onClick={onClose}
						disabled={uploading}
						sx={{ color: 'rgba(255,255,255,0.7)' }}>
						<CloseIcon />
					</IconButton>
				</DialogTitle>

				<DialogContent sx={{ p: 4 }}>
					{error && (
						<Alert
							severity="error"
							sx={{ mb: 3 }}>
							{error}
						</Alert>
					)}

					{uploading ? (
						<Box sx={{ textAlign: 'center', py: 8 }}>
							<CircularProgress
								size={60}
								sx={{ color: '#2196f3', mb: 3 }}
							/>
							<Typography
								variant="h6"
								color="white"
								fontWeight={600}>
								Processing your file...
							</Typography>
							<Typography
								variant="body2"
								color="rgba(255,255,255,0.6)"
								mt={1}>
								This may take a few seconds.
							</Typography>
							<Box sx={{ mt: 3 }}>
								<LinearProgress
									variant="determinate"
									value={progress}
								/>
								<Typography
									variant="body2"
									color="text.secondary"
									align="center"
									sx={{ mt: 1 }}>
									{progress}%
								</Typography>
							</Box>
						</Box>
					) : (
						<Box
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
							onDrop={handleDrop}
							sx={{
								border: `2px dashed ${dragActive || file ? '#2196f3' : 'rgba(255,255,255,0.3)'}`,
								borderRadius: 2,
								p: 6,
								textAlign: 'center',
								bgcolor: dragActive || file ? 'rgba(33,150,243,0.08)' : 'transparent',
								transition: 'all 0.2s',
								cursor: 'pointer',
							}}>
							<CloudUploadIcon
								sx={{
									fontSize: 80,
									color: dragActive || file ? '#2196f3' : 'rgba(255,255,255,0.5)',
									mb: 2,
								}}
							/>
							<Typography
								variant="h6"
								color="white"
								gutterBottom>
								{file ? file.name : 'Drag & drop or click to select file'}
							</Typography>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mb: 3 }}>
								Supported: .xlsx, .csv • Max 5MB
							</Typography>

							<Stack
								direction="row"
								spacing={2}
								justifyContent="center">
								<Button
									variant="outlined"
									disabled={uploading}
									startIcon={<VisibilityIcon />}
									onClick={() => file && setShowPreviewModal(true)}
									sx={{
										'px': 3,
										'borderColor': '#2196f3',
										'color': '#2196f3',
										'&:hover': { bgcolor: 'rgba(33,150,243,0.08)' },
									}}>
									Preview
								</Button>

								<Button
									variant="contained"
									component="label"
									disabled={uploading}
									sx={{
										'height': 40,
										'px': 4,
										'bgcolor': '#2196f3',
										'&:hover': { bgcolor: '#1976d2' },
									}}>
									Select File
									<input
										type="file"
										hidden
										accept=".xlsx,.csv"
										onChange={handleFileChange}
									/>
								</Button>
							</Stack>
						</Box>
					)}
				</DialogContent>

				<DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
					<Button
						onClick={onClose}
						disabled={uploading}
						sx={{
							'height': 40,
							'px': 3,
							'bgcolor': '#374151',
							'color': 'white',
							'&:hover': { bgcolor: '#4b5563' },
						}}>
						Cancel
					</Button>

					<Button
						variant="contained"
						onClick={handleUpload}
						disabled={uploading || !file}
						startIcon={
							uploading ? (
								<CircularProgress
									size={20}
									color="inherit"
								/>
							) : null
						}
						sx={{
							'height': 40,
							'px': 4,
							'bgcolor': '#2196f3',
							'&:hover': { bgcolor: '#1976d2' },
						}}>
						{uploading ? 'Uploading...' : 'Upload File'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Preview Modal (copied & tweaked from staff) */}
			<Dialog
				open={showPreviewModal}
				onClose={() => setShowPreviewModal(false)}
				maxWidth="lg"
				fullWidth
				PaperProps={{
					sx: {
						borderRadius: 3,
						bgcolor: '#0f172a',
						border: '1px solid rgba(255,255,255,0.12)',
						boxShadow: 24,
					},
				}}>
				<DialogTitle
					sx={{
						p: 3,
						borderBottom: '1px solid rgba(255,255,255,0.12)',
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
					}}>
					<Box>
						<Typography
							variant="h5"
							fontWeight={700}
							color="white">
							Excel Preview
						</Typography>
						<Typography
							variant="body2"
							color="rgba(255,255,255,0.6)"
							mt={0.5}>
							{file?.name} • {excelPreview?.rows?.length || 0} rows shown (first 150)
						</Typography>
					</Box>
					<IconButton
						onClick={() => setShowPreviewModal(false)}
						sx={{ color: 'rgba(255,255,255,0.7)' }}>
						<CloseIcon />
					</IconButton>
				</DialogTitle>

				<DialogContent sx={{ p: 0 }}>
					<Paper sx={{ bgcolor: '#0b1220', borderRadius: 0, overflow: 'hidden' }}>
						<Box sx={{ overflow: 'auto', maxHeight: '60vh' }}>
							<Table stickyHeader>
								<TableHead>
									<TableRow>
										<TableCell
											sx={{
												color: 'rgba(255,255,255,0.5)',
												fontWeight: 600,
												bgcolor: '#162033',
												fontSize: '0.75rem',
												borderRight: '1px solid rgba(255,255,255,0.08)',
												minWidth: 60,
												textAlign: 'center',
											}}>
											#
										</TableCell>
										{excelPreview?.headers.map((h) => (
											<TableCell
												key={h}
												sx={{
													color: 'rgba(255,255,255,0.9)',
													fontWeight: 700,
													bgcolor: '#162033',
													fontSize: '0.8rem',
													textTransform: 'uppercase',
													letterSpacing: '0.5px',
													minWidth: 150,
													whiteSpace: 'nowrap',
												}}>
												{h}
											</TableCell>
										))}
									</TableRow>
								</TableHead>
								<TableBody>
									{excelPreview?.rows.map((row, i) => (
										<TableRow
											key={i}
											sx={{
												'&:hover': { bgcolor: '#1a2332' },
												'bgcolor': i % 2 === 0 ? '#0f172a' : '#0b1220',
											}}>
											<TableCell
												sx={{
													color: 'rgba(255,255,255,0.4)',
													fontSize: '0.75rem',
													borderRight: '1px solid rgba(255,255,255,0.08)',
													textAlign: 'center',
													fontWeight: 600,
												}}>
												{i + 1}
											</TableCell>
											{excelPreview.headers.map((h) => (
												<TableCell
													key={h}
													sx={{
														color: '#e5e7eb',
														fontSize: '0.85rem',
														borderBottom: '1px solid rgba(255,255,255,0.05)',
													}}>
													{String(row[h] ?? '')}
												</TableCell>
											))}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</Box>
					</Paper>
				</DialogContent>

				<DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
					<Typography
						variant="body2"
						color="rgba(255,255,255,0.6)">
						Preview of first 150 rows
					</Typography>
					<Button
						variant="contained"
						onClick={() => setShowPreviewModal(false)}
						sx={{
							'px': 4,
							'bgcolor': '#2196f3',
							'&:hover': { bgcolor: '#1976d2' },
						}}>
						Close Preview
					</Button>
				</DialogActions>
			</Dialog>

			{/* Success Modal */}
			<Dialog
				open={showSuccessModal}
				onClose={handleSuccessClose}
				maxWidth="xs"
				fullWidth
				PaperProps={{
					sx: {
						borderRadius: 3,
						bgcolor: '#101922',
						border: '1px solid #1c252e',
						boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
					},
				}}>
				<DialogContent sx={{ p: 5, textAlign: 'center' }}>
					<Box
						sx={{
							width: 80,
							height: 80,
							borderRadius: '50%',
							bgcolor: '#113727',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							mx: 'auto',
							mb: 3,
						}}>
						<CheckIcon sx={{ fontSize: 48, color: '#4fca7b' }} />
					</Box>

					<Typography
						variant="h5"
						fontWeight={700}
						color="white"
						gutterBottom>
						Upload Complete
					</Typography>

					<Typography
						variant="body2"
						color="rgba(255,255,255,0.7)"
						sx={{ mb: 4 }}>
						Your leave policy file has been processed successfully.
					</Typography>

					<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 4 }}>
						{[
							{ label: 'Total Processed', value: uploadResult?.total || 0 },
							{ label: 'Successful', value: uploadResult?.success || 0, color: '#4ade80' },
							{ label: 'Failed', value: uploadResult?.failed || 0, color: '#f87171' },
						].map((stat) => (
							<Box
								key={stat.label}
								sx={{
									border: '1px solid #283138',
									borderRadius: 1,
									p: 3,
									textAlign: 'center',
								}}>
								<Typography
									variant="caption"
									color="rgba(255,255,255,0.7)"
									display="block">
									{stat.label}
								</Typography>
								<Typography
									variant="h4"
									fontWeight={700}
									color={stat.color || '#e2e8f0'}
									mt={0.5}>
									{stat.value}
								</Typography>
							</Box>
						))}
					</Box>

					{uploadResult?.failed > 0 && (
						<Button
							fullWidth
							variant="outlined"
							onClick={handleDownloadFailed}
							sx={{
								'bgcolor': '#283138',
								'borderColor': '#283138',
								'color': '#fff',
								'px': 4,
								'py': 1,
								'borderRadius': 1,
								'textTransform': 'none',
								'&:hover': {
									borderColor: '#283138',
									bgcolor: 'rgba(255,255,255,0.08)',
								},
							}}>
							Download Report
						</Button>
					)}
				</DialogContent>

				<DialogActions sx={{ p: 3, justifyContent: 'center' }}>
					<Button
						fullWidth
						variant="contained"
						onClick={handleSuccessClose}
						sx={{
							'height': 48,
							'bgcolor': '#137eeb',
							'&:hover': { bgcolor: '#1976d2' },
						}}>
						Done
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

export default LeaveSettingsUploadModal;

// const LeaveSettingsUploadModal = ({ open, onClose, onUploadSuccess }) => {
// 	const [file, setFile] = useState(null);
// 	const [dragActive, setDragActive] = useState(false);
// 	const [uploading, setUploading] = useState(false);
// 	const [progress, setProgress] = useState(0);
// 	const [error, setError] = useState('');
// 	const [uploadResult, setUploadResult] = useState(null);
// 	const [showSuccessModal, setShowSuccessModal] = useState(true);

// 	const handleDragOver = (e) => {
// 		e.preventDefault();
// 		setDragActive(true);
// 	};

// 	const handleDragLeave = (e) => {
// 		e.preventDefault();
// 		setDragActive(false);
// 	};

// 	const handleDrop = (e) => {
// 		e.preventDefault();
// 		setDragActive(false);
// 		const droppedFile = e.dataTransfer.files[0];
// 		if (droppedFile) handleFileSelect(droppedFile);
// 	};

// 	const handleFileChange = (e) => {
// 		const selected = e.target.files[0];
// 		if (selected) handleFileSelect(selected);
// 	};

// 	const handleFileSelect = (selectedFile) => {
// 		const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/csv'];
// 		if (!validTypes.includes(selectedFile.type)) {
// 			setError('Only .xlsx or .csv files are allowed');
// 			return;
// 		}
// 		setFile(selectedFile);
// 		setError('');
// 	};

// 	const handleUpload = async () => {
// 		if (!file) {
// 			setError('Please select a file');
// 			return;
// 		}

// 		setUploading(true);
// 		setProgress(0);
// 		setError('');

// 		// Simulate progress
// 		const interval = setInterval(() => {
// 			setProgress((prev) => {
// 				if (prev >= 90) return prev;
// 				return Math.min(prev + Math.random() * 20 + 10, 90);
// 			});
// 		}, 400);

// 		try {
// 			// Simulate API delay
// 			await new Promise((resolve) => setTimeout(resolve, 3000));

// 			clearInterval(interval);
// 			setProgress(100);

// 			// Mock result — replace with real API response later
// 			const result = {
// 				total: 25,
// 				success: 22,
// 				failed: 3,
// 				uploadId: 'upl_leave_789',
// 				errors: [
// 					{ row: 15, message: 'Invalid leave type code' },
// 					{ row: 18, message: 'Missing accrual rate' },
// 					{ row: 23, message: 'Duplicate leave type name' },
// 				],
// 			};

// 			setUploadResult(result);

// 			// Trigger success callback (refresh history)
// 			onUploadSuccess?.();

// 			// Close upload modal and show success
// 			setTimeout(() => {
// 				setUploading(false);
// 				onClose();
// 				setShowSuccessModal(true);
// 			}, 800);
// 		} catch (err) {
// 			clearInterval(interval);
// 			setError('Upload failed. Please try again.');
// 			setUploading(false);
// 		}
// 	};

// 	const handleSuccessClose = () => {
// 		setShowSuccessModal(false);
// 		setFile(null);
// 		setUploadResult(null);
// 	};

// 	const handleDownloadFailed = () => {
// 		// TODO: real download
// 		alert('Downloading failed records... (implement real download)');
// 	};

// 	return (
// 		<>
// 			{/* Main Upload Modal */}
// 			<Dialog
// 				open={open}
// 				onClose={!uploading ? onClose : undefined}
// 				maxWidth="sm"
// 				fullWidth
// 				PaperProps={{
// 					sx: {
// 						borderRadius: 3,
// 						bgcolor: '#0f172a',
// 						color: '#e5e7eb',
// 						border: '1px solid rgba(255,255,255,0.08)',
// 						outline: 'none',
// 					},
// 				}}>
// 				<DialogTitle
// 					sx={{
// 						display: 'flex',
// 						justifyContent: 'space-between',
// 						alignItems: 'center',
// 						borderBottom: '1px solid rgba(255,255,255,0.08)',
// 						p: 3,
// 					}}>
// 					<Typography
// 						variant="h6"
// 						component={'span'}
// 						fontWeight={700}
// 						color="white">
// 						Upload Leave Policy File
// 					</Typography>
// 					<IconButton
// 						onClick={onClose}
// 						disabled={uploading}
// 						sx={{ color: 'rgba(255,255,255,0.7)' }}>
// 						<CloseIcon />
// 					</IconButton>
// 				</DialogTitle>

// 				<DialogContent sx={{ p: 4 }}>
// 					{error && (
// 						<Alert
// 							severity="error"
// 							sx={{ mb: 3 }}>
// 							{error}
// 						</Alert>
// 					)}

// 					{/* Uploading State */}
// 					{uploading && (
// 						<Box sx={{ textAlign: 'center', py: 8, mt: 2 }}>
// 							<CircularProgress
// 								size={60}
// 								sx={{ color: '#2196f3', mb: 3 }}
// 							/>
// 							<Typography
// 								variant="h6"
// 								color="white"
// 								fontWeight={600}>
// 								Processing your file...
// 							</Typography>
// 							<Typography
// 								variant="body2"
// 								color="rgba(255,255,255,0.6)"
// 								mt={1}>
// 								This may take a few seconds.
// 							</Typography>
// 							<Box sx={{ mt: 3, width: '100%' }}>
// 								<LinearProgress
// 									variant="determinate"
// 									value={progress}
// 								/>
// 								<Typography
// 									variant="body2"
// 									color="text.secondary"
// 									align="center"
// 									sx={{ mt: 1 }}>
// 									{progress}%
// 								</Typography>
// 							</Box>
// 						</Box>
// 					)}

// 					{/* Default Upload UI */}
// 					{!uploading && (
// 						<Box
// 							onDragOver={handleDragOver}
// 							onDragLeave={handleDragLeave}
// 							onDrop={handleDrop}
// 							sx={{
// 								border: `2px dashed ${dragActive || file ? '#2196f3' : 'rgba(255,255,255,0.3)'}`,
// 								borderRadius: 2,
// 								mt: 2,
// 								p: 6,
// 								textAlign: 'center',
// 								bgcolor: dragActive || file ? 'rgba(33,150,243,0.08)' : 'transparent',
// 								transition: 'all 0.2s',
// 								cursor: 'pointer',
// 							}}>
// 							<CloudUploadIcon
// 								sx={{
// 									fontSize: 80,
// 									color: dragActive || file ? '#2196f3' : 'rgba(255,255,255,0.5)',
// 									mb: 2,
// 								}}
// 							/>
// 							<Typography
// 								variant="h6"
// 								color="white"
// 								gutterBottom>
// 								{file ? file.name : 'Drag & drop or click to select file'}
// 							</Typography>
// 							<Typography
// 								variant="body2"
// 								color="text.secondary"
// 								sx={{ mb: 3 }}>
// 								Supported: .xlsx, .csv • Max 5MB
// 							</Typography>

// 							<Button
// 								variant="contained"
// 								component="label"
// 								disabled={uploading}
// 								sx={{
// 									'height': 40,
// 									'px': 4,
// 									'bgcolor': '#2196f3',
// 									'&:hover': { bgcolor: '#1976d2' },
// 								}}>
// 								Select File
// 								<input
// 									type="file"
// 									hidden
// 									accept=".xlsx,.csv"
// 									onChange={handleFileChange}
// 								/>
// 							</Button>
// 						</Box>
// 					)}
// 				</DialogContent>

// 				<DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
// 					<Button
// 						onClick={onClose}
// 						disabled={uploading}
// 						sx={{
// 							'height': 40,
// 							'px': 3,
// 							'bgcolor': '#374151',
// 							'color': 'white',
// 							'&:hover': { bgcolor: '#4b5563' },
// 						}}>
// 						Cancel
// 					</Button>

// 					<Button
// 						variant="contained"
// 						onClick={handleUpload}
// 						disabled={uploading || !file}
// 						startIcon={
// 							uploading ? (
// 								<CircularProgress
// 									size={20}
// 									color="inherit"
// 								/>
// 							) : null
// 						}
// 						sx={{
// 							'height': 40,
// 							'px': 4,
// 							'bgcolor': '#2196f3',
// 							'&:hover': { bgcolor: '#1976d2' },
// 						}}>
// 						{uploading ? 'Uploading...' : 'Upload File'}
// 					</Button>
// 				</DialogActions>
// 			</Dialog>

// 			{/* Success Modal */}
// 			<Dialog
// 				open={showSuccessModal}
// 				onClose={handleSuccessClose}
// 				maxWidth="xs"
// 				fullWidth
// 				PaperProps={{
// 					sx: {
// 						borderRadius: 3,
// 						bgcolor: '#101922',
// 						border: '1px solid #1c252e',
// 						boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
// 					},
// 				}}>
// 				<DialogContent sx={{ p: 5, textAlign: 'center' }}>
// 					<Box
// 						sx={{
// 							width: 80,
// 							height: 80,
// 							borderRadius: '50%',
// 							bgcolor: '#113727',
// 							display: 'flex',
// 							alignItems: 'center',
// 							justifyContent: 'center',
// 							mx: 'auto',
// 							mb: 3,
// 						}}>
// 						<CheckIcon sx={{ fontSize: 48, color: '#4fca7b' }} />
// 					</Box>

// 					<Typography
// 						variant="h5"
// 						fontWeight={700}
// 						color="white"
// 						gutterBottom>
// 						Upload Complete
// 					</Typography>

// 					<Typography
// 						variant="body2"
// 						color="rgba(255,255,255,0.7)"
// 						sx={{ mb: 4 }}>
// 						Your leave policy file has been processed successfully.
// 					</Typography>

// 					{/* Stats */}
// 					<Box
// 						sx={{
// 							display: 'grid',
// 							gridTemplateColumns: 'repeat(3, 1fr)',
// 							gap: 2,
// 							mb: 4,
// 						}}>
// 						{[
// 							{ label: 'Total Processed', value: uploadResult?.total || 0 },
// 							{ label: 'Successful', value: uploadResult?.success || 0, color: '#4ade80' },
// 							{ label: 'Failed', value: uploadResult?.failed || 0, color: '#f87171' },
// 						].map((stat) => (
// 							<Box
// 								key={stat.label}
// 								sx={{
// 									border: '1px solid #283138',
// 									borderRadius: 1,
// 									p: 3,
// 									textAlign: 'center',
// 								}}>
// 								<Typography
// 									variant="caption"
// 									color="rgba(255,255,255,0.7)"
// 									display="block">
// 									{stat.label}
// 								</Typography>
// 								<Typography
// 									variant="h4"
// 									fontWeight={700}
// 									color={stat.color || '#e2e8f0'}
// 									mt={0.5}>
// 									{stat.value}
// 								</Typography>
// 							</Box>
// 						))}
// 					</Box>

// 					{/* Failed Records Button */}
// 					{uploadResult?.failed > 0 && (
// 						<Button
// 							fullWidth
// 							variant="contained"
// 							color="error"
// 							onClick={handleDownloadFailed}
// 							sx={{
// 								'height': 48,
// 								'mb': 2,
// 								'bgcolor': '#f44336',
// 								'&:hover': { bgcolor: '#e53935' },
// 							}}>
// 							Download Failed Records
// 						</Button>
// 					)}
// 				</DialogContent>

// 				<DialogActions sx={{ p: 3, justifyContent: 'center' }}>
// 					<Button
// 						fullWidth
// 						variant="contained"
// 						onClick={handleSuccessClose}
// 						sx={{
// 							'height': 48,
// 							'bgcolor': '#137eeb',
// 							'&:hover': { bgcolor: '#1976d2' },
// 						}}>
// 						Done
// 					</Button>
// 				</DialogActions>
// 			</Dialog>
// 		</>
// 	);
// };

// export default LeaveSettingsUploadModal;
