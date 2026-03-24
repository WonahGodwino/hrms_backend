import React, { useState } from 'react';
import {
	Box,
	Button,
	Modal,
	Typography,
	IconButton,
	CircularProgress,
	Paper,
	Table,
	TableHead,
	TableRow,
	TableCell,
	TableBody,
	Accordion,
	AccordionSummary,
	AccordionDetails,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import * as XLSX from 'xlsx';

const toast = {
	error: (msg) => console.error(msg),
	success: (msg) => console.log(msg),
};

/**
 * Reusable Excel Upload Component
 *
 * @param {boolean} open - Controls modal visibility
 * @param {function} onClose - Callback when modal closes
 * @param {function} onUpload - Upload handler function(file) => Promise<{apiSuccess, summary, errors, uploadId}>
 * @param {string} title - Modal title (e.g., "Upload Staff Excel")
 * @param {string} dragPlaceholder - Placeholder text in drag zone
 * @param {string[]} requiredColumns - Array of required column names
 * @param {function} onUploadSuccess - Optional callback after successful upload
 */
const ExcelUploadModal = ({ open, onClose, onUpload, title = 'Upload Excel File', dragPlaceholder = 'staff_data.xlsx', requiredColumns = [], onUploadSuccess }) => {
	const [selectedFile, setSelectedFile] = useState(null);
	const [dragActive, setDragActive] = useState(false);
	const [excelPreview, setExcelPreview] = useState(null);
	const [uploading, setUploading] = useState(false);
	const [uploadComplete, setUploadComplete] = useState(false);
	const [uploadResult, setUploadResult] = useState(null);
	const [showPreviewModal, setShowPreviewModal] = useState(false);
	const [showSuccessModal, setShowSuccessModal] = useState(false);

	const parseExcelPreview = async (file) => {
		const buffer = await file.arrayBuffer();
		const workbook = XLSX.read(buffer, { type: 'array' });
		const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('staff')) || workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheetName];

		const jsonData = XLSX.utils.sheet_to_json(worksheet, {
			defval: '',
		});

		if (!jsonData.length) {
			setExcelPreview(null);
			return;
		}

		const headers = Object.keys(jsonData[0]);
		const rows = jsonData.slice(0, 150);
		setExcelPreview({ headers, rows });
	};

	const handleFileSelect = async (file) => {
		if (!file) return;
		setSelectedFile(file);
		await parseExcelPreview(file);
	};

	const validateColumns = () => {
		if (requiredColumns.length === 0) return true;

		const missing = requiredColumns.filter((col) => !excelPreview.headers.includes(col));

		if (missing.length) {
			toast.error(`Missing columns: ${missing.join(', ')}`);
			return false;
		}

		return true;
	};

	const uploadFile = async () => {
		if (!selectedFile || !validateColumns()) return;

		setUploading(true);

		const result = await onUpload(selectedFile);

		if (result.apiSuccess) {
			setUploadResult({
				total: result.summary.totalRecords,
				success: result.summary.successful,
				failed: result.summary.failed,
				errors: result.errors,
				uploadId: result.uploadId,
			});

			handleCloseUploadModal();
			setShowSuccessModal(true);

			if (onUploadSuccess && result.summary.successful > 0) {
				onUploadSuccess(result);
			}
		} else {
			console.error('Upload failed', result.error);
		}

		setUploading(false);
	};

	const handleCloseUploadModal = () => {
		if (uploading) return;
		onClose();
		setSelectedFile(null);
		setExcelPreview(null);
		setUploadComplete(false);
	};

	const handleOpenPreview = () => {
		if (excelPreview) {
			setShowPreviewModal(true);
		}
	};

	const handleDragOver = (e) => {
		e.preventDefault();
		setDragActive(true);
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		setDragActive(false);
	};

	const handleDrop = async (e) => {
		e.preventDefault();
		setDragActive(false);
		const file = e.dataTransfer.files?.[0];
		await handleFileSelect(file);
	};

	return (
		<>
			{/* ==================== UPLOAD MODAL ==================== */}
			<Modal
				open={open}
				onClose={handleCloseUploadModal}
				closeAfterTransition
				BackdropProps={{
					sx: {
						backdropFilter: 'blur(10px)',
						backgroundColor: 'rgba(0,0,0,0.7)',
					},
				}}>
				<Box
					sx={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						transform: 'translate(-50%, -50%)',
						width: { xs: '95%', sm: 520 },
						bgcolor: '#0f172a',
						border: '1px solid rgba(255,255,255,0.12)',
						borderRadius: 3,
						boxShadow: 24,
						p: 4,
						outline: 'none',
					}}>
					<IconButton
						onClick={handleCloseUploadModal}
						sx={{
							position: 'absolute',
							right: 8,
							top: 8,
							color: 'rgba(255,255,255,0.7)',
							opacity: uploading ? 0.5 : 1,
						}}
						disabled={uploading}>
						<CloseIcon />
					</IconButton>

					{/* UPLOADING STATE */}
					{uploading && !uploadComplete && (
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
						</Box>
					)}

					{/* DEFAULT UPLOAD UI */}
					{!uploading && !uploadComplete && (
						<>
							<Box sx={{ textAlign: 'center' }}>
								<CloudUploadIcon sx={{ fontSize: 80, color: '#2196f3', mb: 2 }} />
								<Typography
									variant="h6"
									fontWeight={600}
									color="white"
									gutterBottom>
									{title}
								</Typography>

								{/* Drop Zone */}
								<Box
									onDragOver={handleDragOver}
									onDragEnter={handleDragOver}
									onDragLeave={handleDragLeave}
									onDrop={handleDrop}
									sx={{
										border: `2px dashed ${dragActive ? '#2196f3' : 'rgba(255,255,255,0.3)'}`,
										borderRadius: 2,
										padding: 4,
										bgcolor: dragActive ? 'rgba(33,150,243,0.1)' : 'transparent',
										minHeight: 120,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										position: 'relative',
										cursor: 'pointer',
										mt: 2,
									}}>
									<input
										type="file"
										accept=".xlsx,.xls"
										onChange={async (e) => {
											const file = e.target.files?.[0];
											await handleFileSelect(file);
										}}
										style={{
											opacity: 0,
											position: 'absolute',
											inset: 0,
											cursor: 'pointer',
										}}
									/>

									{/* File Preview */}
									{selectedFile ? (
										<Box
											sx={{
												display: 'inline-flex',
												alignItems: 'center',
												bgcolor: 'rgba(30,41,59,0.8)',
												border: '1px solid rgba(100,116,139,0.4)',
												borderRadius: 2,
												px: 2,
												py: 1.5,
												gap: 1.5,
											}}>
											<Box
												sx={{
													bgcolor: '#16a34a',
													borderRadius: 1,
													width: 36,
													height: 36,
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
												}}>
												<DescriptionIcon sx={{ color: 'white', fontSize: 26 }} />
											</Box>
											<Typography
												variant="body2"
												sx={{
													color: '#e2e8f0',
													fontWeight: 500,
													maxWidth: 260,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}>
												{selectedFile.name}
											</Typography>
											<IconButton
												size="small"
												onClick={(e) => {
													e.stopPropagation();
													setSelectedFile(null);
													setExcelPreview(null);
												}}>
												<CloseIcon
													fontSize="small"
													sx={{ color: 'rgba(255,255,255,0.6)' }}
												/>
											</IconButton>
										</Box>
									) : (
										<Typography
											variant="body2"
											color="rgba(255,255,255,0.6)">
											{dragPlaceholder}
										</Typography>
									)}
								</Box>

								{/* Action Buttons */}
								<Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'center' }}>
									<Button
										variant="outlined"
										disabled={!selectedFile || !excelPreview}
										startIcon={<VisibilityIcon />}
										onClick={handleOpenPreview}
										sx={{
											'px': 4,
											'borderRadius': 2,
											'textTransform': 'none',
											'fontWeight': 600,
											'borderColor': '#2196f3',
											'color': '#2196f3',
											'&:hover': {
												borderColor: '#1976d2',
												bgcolor: 'rgba(33, 150, 243, 0.08)',
											},
											'&.Mui-disabled': {
												borderColor: 'rgba(255,255,255,0.12)',
												color: 'rgba(255,255,255,0.3)',
											},
										}}>
										Preview
									</Button>
									<Button
										variant="contained"
										disabled={!selectedFile || !excelPreview || uploading}
										onClick={uploadFile}
										sx={{
											'px': 6,
											'borderRadius': 2,
											'textTransform': 'none',
											'fontWeight': 600,
											'bgcolor': '#2196f3',
											'&:hover': { bgcolor: '#1976d2' },
											'&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)' },
										}}>
										{uploading ? 'Uploading...' : 'Upload File'}
									</Button>
								</Box>
							</Box>
						</>
					)}
				</Box>
			</Modal>

			{/* ==================== PREVIEW MODAL ==================== */}
			<Modal
				open={showPreviewModal}
				onClose={() => setShowPreviewModal(false)}
				closeAfterTransition
				BackdropProps={{
					sx: {
						backdropFilter: 'blur(10px)',
						backgroundColor: 'rgba(0,0,0,0.8)',
					},
				}}>
				<Box
					sx={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						transform: 'translate(-50%, -50%)',
						width: { xs: '95%', md: '90%', lg: '85%' },
						maxWidth: 1400,
						maxHeight: '90vh',
						bgcolor: '#0f172a',
						border: '1px solid rgba(255,255,255,0.12)',
						borderRadius: 3,
						boxShadow: 24,
						outline: 'none',
						display: 'flex',
						flexDirection: 'column',
					}}>
					{/* Header */}
					<Box
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
								{selectedFile?.name} • {excelPreview?.rows?.length || 0} rows
							</Typography>
						</Box>
						<IconButton
							onClick={() => setShowPreviewModal(false)}
							sx={{ color: 'rgba(255,255,255,0.7)' }}>
							<CloseIcon />
						</IconButton>
					</Box>

					{/* Table Container */}
					<Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
						<Paper
							sx={{
								bgcolor: '#0b1220',
								border: '1px solid rgba(255,255,255,0.12)',
								borderRadius: 2,
								overflow: 'hidden',
							}}>
							<Box sx={{ overflow: 'auto', maxHeight: 'calc(90vh - 200px)' }}>
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
					</Box>

					{/* Footer */}
					<Box
						sx={{
							p: 3,
							borderTop: '1px solid rgba(255,255,255,0.12)',
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
						}}>
						<Typography
							variant="body2"
							color="rgba(255,255,255,0.6)">
							Showing {Math.min(150, excelPreview?.rows?.length || 0)} of {excelPreview?.rows?.length || 0} rows
						</Typography>
						<Button
							variant="contained"
							onClick={() => setShowPreviewModal(false)}
							sx={{
								'px': 4,
								'borderRadius': 2,
								'textTransform': 'none',
								'fontWeight': 600,
								'bgcolor': '#2196f3',
								'&:hover': { bgcolor: '#1976d2' },
							}}>
							Close
						</Button>
					</Box>
				</Box>
			</Modal>

			{/* ==================== UPLOAD SUCCESS MODAL ==================== */}
			<Modal
				open={showSuccessModal}
				onClose={() => {
					setShowSuccessModal(false);
					setUploadResult(null);
				}}
				closeAfterTransition
				BackdropProps={{
					sx: {
						backdropFilter: 'blur(10px)',
						backgroundColor: 'rgba(0,0,0,0.8)',
					},
				}}>
				<Box
					sx={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						transform: 'translate(-50%, -50%)',
						width: { xs: '95%', sm: 460 },
						maxHeight: '90vh',
						bgcolor: '#101922',
						border: '1px solid #1c252e',
						borderRadius: 2,
						boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
						outline: 'none',
						overflow: 'hidden',
						display: 'flex',
						flexDirection: 'column',
					}}>
					<Box
						sx={{
							'maxWidth': 400,
							'mx': 'auto',
							'width': '100%',
							'p': 5,
							'overflowY': 'auto',
							'overflowX': 'hidden',
							'&::-webkit-scrollbar': {
								width: '8px',
							},
							'&::-webkit-scrollbar-track': {
								background: '#1c252e',
							},
							'&::-webkit-scrollbar-thumb': {
								background: '#283138',
								borderRadius: '4px',
							},
							'&::-webkit-scrollbar-thumb:hover': {
								background: '#3a4a54',
							},
						}}>
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
							gutterBottom
							textAlign="center">
							Upload Complete
						</Typography>
						<Typography
							variant="body2"
							color="rgba(255,255,255,0.7)"
							sx={{ mb: 4, textAlign: 'center' }}>
							Your data file has been processed successfully.
						</Typography>

						{/* Stats Cards */}
						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: 'repeat(3, 1fr)',
								gap: 2,
								mb: 4,
							}}>
							{[
								{
									label: 'Total Processed',
									value: uploadResult?.total || 0,
									color: '#60a5fa',
									captionOpacity: 0.6,
								},
								{
									label: 'Successful',
									value: uploadResult?.success || 0,
									color: '#4ade80',
									captionOpacity: 0.8,
								},
								{
									label: 'Failed',
									value: uploadResult?.failed || 0,
									color: '#f87171',
									captionOpacity: 0.8,
								},
							].map((stat) => (
								<Box
									key={stat.label}
									sx={{
										border: '1px solid #283138',
										borderRadius: 1,
										backdropFilter: 'blur(10px)',
										px: 3,
										py: 3,
										textAlign: 'center',
									}}>
									<Typography
										variant="caption"
										color={`rgba(255,255,255,${stat.captionOpacity})`}
										display="block"
										fontSize="0.9rem"
										fontWeight={500}>
										{stat.label}
									</Typography>
									<Typography
										variant="h4"
										fontWeight={700}
										color={stat.color}
										mt={0.5}>
										{stat.value}
									</Typography>
								</Box>
							))}
						</Box>

						{/* Error Details */}
						{uploadResult && uploadResult.failed > 0 && (
							<Accordion
								sx={{
									'bgcolor': '#1c252e',
									'border': '1px solid #1c252e',
									'borderRadius': 1,
									'mb': 4,
									'&:before': { display: 'none' },
								}}>
								<AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}>
									<Typography
										variant="subtitle2"
										color="white">
										Error Details ({uploadResult.failed} issues)
									</Typography>
								</AccordionSummary>
								<AccordionDetails>
									<Box sx={{ textAlign: 'left', maxHeight: 150, overflow: 'auto' }}>
										{uploadResult.errors.length > 0 ? (
											uploadResult.errors.map((err, i) => {
												const errorText = err.row ? `Row ${err.row}: ${err.message}` : err.message;
												return (
													<Typography
														key={i}
														variant="body2"
														color="#fca5a5"
														sx={{ mb: 1 }}>
														• {errorText}
													</Typography>
												);
											})
										) : (
											<Typography
												variant="body2"
												color="#fca5a5"
												sx={{ mb: 1 }}>
												There was no error message sent at the moment
											</Typography>
										)}
									</Box>
								</AccordionDetails>
							</Accordion>
						)}

						{/* Action Button */}
						<Box sx={{ display: 'flex', justifyContent: 'center' }}>
							<Button
								variant="contained"
								onClick={() => {
									setShowSuccessModal(false);
									setUploadResult(null);
								}}
								sx={{
									'bgcolor': '#137eeb',
									'px': 5,
									'borderRadius': 1,
									'textTransform': 'none',
									'fontWeight': 600,
									'&:hover': { bgcolor: '#1976d2' },
								}}>
								Done
							</Button>
						</Box>
					</Box>
				</Box>
			</Modal>
		</>
	);
};

export default ExcelUploadModal;
