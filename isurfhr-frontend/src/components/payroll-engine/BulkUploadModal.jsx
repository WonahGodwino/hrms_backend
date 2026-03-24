// src/components/payroll-engine/BulkUploadModal.jsx
import React, { useState, useCallback } from 'react';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	Box,
	Typography,
	Alert,
	CircularProgress,
	useTheme,
	IconButton,
	LinearProgress,
	Accordion,
	AccordionSummary,
	AccordionDetails,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { downloadTemplate } from '@/services/PayrollEngineService';

/**
 * Reusable Bulk Upload Modal for Payroll Engine
 *
 * @param {boolean} open - Controls modal visibility
 * @param {function} onClose - Callback when modal closes
 * @param {function} onUpload - Upload handler function(file, options) => Promise<response>
 * @param {string} title - Modal title
 * @param {string} description - Modal description
 * @param {string} templateType - Template type for download: EMPLOYEE_SALARY, OVERTIME, DEDUCTIONS, VALIDATIONS
 * @param {Array} deductionTypes - Optional array of deduction types for DEDUCTIONS template
 * @param {string} selectedDeductionType - Currently selected deduction type
 * @param {function} onDeductionTypeChange - Callback when deduction type changes
 * @param {Array} requiredColumns - Array of required column names
 * @param {Array} optionalColumns - Array of optional column names
 * @param {function} onSuccess - Optional callback after successful upload
 */
const BulkUploadModal = ({
	open,
	onClose,
	onUpload,
	title = 'Bulk Upload',
	description = 'Upload a CSV or Excel file',
	templateType,
	deductionTypes = [],
	selectedDeductionType,
	onDeductionTypeChange,
	requiredColumns = [],
	optionalColumns = [],
	onSuccess,
}) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// State
	const [file, setFile] = useState(null);
	const [loading, setLoading] = useState(false);
	const [downloadingTemplate, setDownloadingTemplate] = useState(false);
	const [error, setError] = useState(null);
	const [result, setResult] = useState(null);
	const [dragActive, setDragActive] = useState(false);

	// Handle drag events
	const handleDrag = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === 'dragenter' || e.type === 'dragover') {
			setDragActive(true);
		} else if (e.type === 'dragleave') {
			setDragActive(false);
		}
	}, []);

	// Handle drop
	const handleDrop = useCallback((e) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);

		if (e.dataTransfer.files && e.dataTransfer.files[0]) {
			const droppedFile = e.dataTransfer.files[0];
			if (validateFile(droppedFile)) {
				setFile(droppedFile);
				setError(null);
				setResult(null);
			}
		}
	}, []);

	// Handle file input
	const handleFileChange = (e) => {
		if (e.target.files && e.target.files[0]) {
			const selectedFile = e.target.files[0];
			if (validateFile(selectedFile)) {
				setFile(selectedFile);
				setError(null);
				setResult(null);
			}
		}
	};

	// Validate file type
	const validateFile = (file) => {
		const validTypes = [
			'text/csv',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		];
		const validExtensions = ['.csv', '.xls', '.xlsx'];

		const hasValidType = validTypes.includes(file.type);
		const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

		if (!hasValidType && !hasValidExtension) {
			setError('Please upload a CSV or Excel file (.csv, .xls, .xlsx)');
			return false;
		}
		return true;
	};

	// Handle template download
	const handleDownloadTemplate = async () => {
		setDownloadingTemplate(true);
		try {
			const response = await downloadTemplate(templateType, selectedDeductionType);
			const blob = new Blob([response.data], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			const templateName = selectedDeductionType
				? `${templateType.toLowerCase()}-${selectedDeductionType.toLowerCase()}-template.xlsx`
				: `${templateType.toLowerCase()}-template.xlsx`;
			a.download = templateName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to download template:', err);
			setError('Failed to download template. Please try again.');
		} finally {
			setDownloadingTemplate(false);
		}
	};

	// Handle upload
	const handleUpload = async () => {
		if (!file) return;

		setLoading(true);
		setError(null);

		try {
			const response = await onUpload(file, { deductionType: selectedDeductionType });
			const data = response.data || response;

			setResult({
				success: data.success,
				message: data.message,
				created: data.data?.created || 0,
				updated: data.data?.updated || 0,
				totalProcessed: data.data?.totalProcessed || 0,
				errors: data.data?.errors || [],
			});

			if (data.success && onSuccess) {
				setTimeout(() => {
					onSuccess(data);
				}, 2000);
			}
		} catch (err) {
			console.error('Upload failed:', err);
			const errorMessage = err.response?.data?.message || 'Upload failed. Please check your file format.';
			const errors = err.response?.data?.data?.errors || [];
			setError(errorMessage);
			if (errors.length > 0) {
				setResult({
					success: false,
					message: errorMessage,
					errors,
					created: err.response?.data?.data?.created || 0,
					updated: err.response?.data?.data?.updated || 0,
					totalProcessed: err.response?.data?.data?.totalProcessed || 0,
				});
			}
		} finally {
			setLoading(false);
		}
	};

	// Handle close
	const handleClose = () => {
		if (!loading) {
			setFile(null);
			setError(null);
			setResult(null);
			onClose();
		}
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
			<DialogTitle
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					pb: 2,
				}}>
				<Box>
					<Typography variant="h6" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>
						{title}
					</Typography>
					<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
						{description}
					</Typography>
				</Box>
				<IconButton onClick={handleClose} disabled={loading}>
					<CloseIcon sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
				</IconButton>
			</DialogTitle>

			<DialogContent sx={{ py: 3 }}>
				{error && !result && (
					<Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
						{error}
					</Alert>
				)}

				{result && (
					<Alert
						severity={result.success ? 'success' : result.errors?.length > 0 ? 'warning' : 'error'}
						sx={{ mb: 3 }}
						icon={result.success ? <CheckCircleIcon /> : undefined}>
						<Typography variant="body2" fontWeight={600}>
							{result.success ? 'Upload completed!' : 'Upload completed with issues'}
						</Typography>
						<Typography variant="body2">
							{result.message}
							{result.totalProcessed > 0 && (
								<>
									{' '}
									| Total: {result.totalProcessed}
									{result.created > 0 && ` | Created: ${result.created}`}
									{result.updated > 0 && ` | Updated: ${result.updated}`}
								</>
							)}
						</Typography>
					</Alert>
				)}

				{/* Error Details Accordion */}
				{result?.errors?.length > 0 && (
					<Accordion
						sx={{
							'mb': 3,
							'bgcolor': isDarkMode ? '#0f172a' : '#fef2f2',
							'border': `1px solid ${isDarkMode ? '#334155' : '#fecaca'}`,
							'borderRadius': 2,
							'&:before': { display: 'none' },
						}}>
						<AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: isDarkMode ? '#f87171' : '#b91c1c' }} />}>
							<Typography variant="subtitle2" sx={{ color: isDarkMode ? '#f87171' : '#b91c1c', fontWeight: 600 }}>
								Error Details ({result.errors.length} issues)
							</Typography>
						</AccordionSummary>
						<AccordionDetails>
							<Box sx={{ maxHeight: 200, overflow: 'auto' }}>
								{result.errors.map((err, i) => (
									<Typography
										key={i}
										variant="body2"
										sx={{ color: isDarkMode ? '#fca5a5' : '#b91c1c', mb: 0.5, fontSize: '0.8rem' }}>
										{typeof err === 'string' ? err : err.message || JSON.stringify(err)}
									</Typography>
								))}
							</Box>
						</AccordionDetails>
					</Accordion>
				)}

				{/* Deduction Type Selector */}
				{templateType === 'DEDUCTIONS' && deductionTypes.length > 0 && (
					<FormControl fullWidth sx={{ mb: 3 }}>
						<InputLabel>Deduction Type</InputLabel>
						<Select
							value={selectedDeductionType || ''}
							label="Deduction Type"
							onChange={(e) => onDeductionTypeChange?.(e.target.value)}
							sx={{ bgcolor: isDarkMode ? '#0f172a' : '#f8fafc' }}>
							{deductionTypes.map((type) => (
								<MenuItem key={type.value} value={type.value}>
									{type.label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				)}

				{/* Download Template Button */}
				{templateType && (
					<Button
						variant="outlined"
						startIcon={downloadingTemplate ? <CircularProgress size={16} /> : <DownloadIcon />}
						onClick={handleDownloadTemplate}
						disabled={downloadingTemplate || (templateType === 'DEDUCTIONS' && !selectedDeductionType)}
						fullWidth
						sx={{
							'mb': 3,
							'py': 1.5,
							'borderColor': isDarkMode ? '#334155' : '#e2e8f0',
							'color': isDarkMode ? '#94a3b8' : '#64748b',
							'fontWeight': 600,
							'textTransform': 'none',
							'&:hover': {
								borderColor: '#137fec',
								color: '#137fec',
							},
						}}>
						{downloadingTemplate ? 'Downloading...' : 'Download Template'}
					</Button>
				)}

				{/* Drop Zone */}
				<Box
					onDragEnter={handleDrag}
					onDragLeave={handleDrag}
					onDragOver={handleDrag}
					onDrop={handleDrop}
					sx={{
						'border': `2px dashed ${dragActive ? '#137fec' : isDarkMode ? '#334155' : '#e2e8f0'}`,
						'borderRadius': 3,
						'p': 4,
						'textAlign': 'center',
						'bgcolor': dragActive
							? isDarkMode
								? 'rgba(19, 127, 236, 0.1)'
								: '#eff6ff'
							: isDarkMode
								? '#0f172a'
								: '#f8fafc',
						'transition': 'all 0.2s ease',
						'cursor': 'pointer',
						'&:hover': {
							borderColor: '#137fec',
							bgcolor: isDarkMode ? 'rgba(19, 127, 236, 0.05)' : '#f0f7ff',
						},
					}}
					onClick={() => document.getElementById('bulk-upload-file-input').click()}>
					<input
						id="bulk-upload-file-input"
						type="file"
						accept=".csv,.xls,.xlsx"
						onChange={handleFileChange}
						style={{ display: 'none' }}
					/>

					{file ? (
						<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
							<InsertDriveFileIcon sx={{ fontSize: 40, color: '#137fec' }} />
							<Box sx={{ textAlign: 'left' }}>
								<Typography variant="body1" sx={{ fontWeight: 600, color: isDarkMode ? '#fff' : '#0f172a' }}>
									{file.name}
								</Typography>
								<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
									{formatFileSize(file.size)}
								</Typography>
							</Box>
							<IconButton
								size="small"
								onClick={(e) => {
									e.stopPropagation();
									setFile(null);
									setResult(null);
								}}
								sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
								<CloseIcon fontSize="small" />
							</IconButton>
						</Box>
					) : (
						<>
							<CloudUploadIcon sx={{ fontSize: 48, color: isDarkMode ? '#64748b' : '#94a3b8', mb: 2 }} />
							<Typography variant="body1" sx={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#334155', mb: 1 }}>
								Drag & drop your file here
							</Typography>
							<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
								or click to browse (CSV, Excel)
							</Typography>
						</>
					)}
				</Box>

				{/* Loading Progress */}
				{loading && (
					<Box sx={{ mt: 3 }}>
						<LinearProgress />
						<Typography variant="body2" sx={{ mt: 1, textAlign: 'center', color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Processing your file...
						</Typography>
					</Box>
				)}

				{/* Required Columns Info */}
				{requiredColumns.length > 0 && (
					<Box
						sx={{
							mt: 3,
							p: 2,
							borderRadius: 2,
							bgcolor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff',
							border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe'}`,
						}}>
						<Typography
							variant="subtitle2"
							sx={{ fontWeight: 600, color: isDarkMode ? '#60a5fa' : '#1d4ed8', mb: 1 }}>
							Required Columns
						</Typography>
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#475569', fontSize: '0.75rem' }}>
							{requiredColumns.join(', ')}
						</Typography>
						{optionalColumns.length > 0 && (
							<Typography variant="body2" sx={{ color: isDarkMode ? '#64748b' : '#94a3b8', fontSize: '0.7rem', mt: 1 }}>
								Optional: {optionalColumns.join(', ')}
							</Typography>
						)}
					</Box>
				)}
			</DialogContent>

			<DialogActions
				sx={{
					px: 3,
					py: 2,
					borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					gap: 1,
				}}>
				<Button
					onClick={handleClose}
					disabled={loading}
					sx={{
						color: isDarkMode ? '#94a3b8' : '#64748b',
						fontWeight: 600,
						textTransform: 'none',
					}}>
					Cancel
				</Button>
				<Button
					variant="contained"
					onClick={handleUpload}
					disabled={!file || loading}
					sx={{
						'bgcolor': '#137fec',
						'fontWeight': 700,
						'textTransform': 'none',
						'px': 3,
						'&:hover': { bgcolor: '#1d4ed8' },
					}}>
					{loading ? <CircularProgress size={20} color="inherit" /> : 'Upload'}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default BulkUploadModal;
