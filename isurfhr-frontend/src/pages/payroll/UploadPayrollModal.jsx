import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Modal,
	Box,
	Paper,
	Table,
	TableHead,
	TableRow,
	TableCell,
	TableBody,
	Typography,
	Button,
	IconButton,
	Switch,
	FormControlLabel,
	useTheme,
	styled,
	Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VisibilityIcon from '@mui/icons-material/Visibility';
// Local component imports
import PayrollProcessingOverlay from './PayrollProcessingOverlay';
import PayrollUploadSuccessModal from './PayrollUploadSuccessModal';
// Service import with corrected relative path to src/services
import { uploadPayroll } from '../../services/PayrollService';
import { getAccessibleCompany } from '../../services/CompanyService';
import { CompanySelectField } from '@/components/SelectCompany';
import { TemplateSelectField } from '@/components/SelectTemplate';
import { TEMPLATE_LABEL_MAP } from '@/lib/utils';
import * as XLSX from 'xlsx';

// Custom IOS-style Switch
const IOSSwitch = styled((props) => (
	<Switch
		focusVisibleClassName=".Mui-focusVisible"
		disableRipple
		{...props}
	/>
))(({ theme }) => ({
	'width': 56,
	'height': 32,
	'padding': 0,
	'& .MuiSwitch-switchBase': {
		'padding': 0,
		'margin': 4,
		'transitionDuration': '300ms',
		'&.Mui-checked': {
			'transform': 'translateX(24px)',
			'color': '#fff',
			'& + .MuiSwitch-track': {
				backgroundColor: '#137fec',
				opacity: 1,
				border: 0,
			},
			'&.Mui-disabled + .MuiSwitch-track': {
				opacity: 0.5,
			},
		},
		'&.Mui-focusVisible .MuiSwitch-thumb': {
			color: '#33cf4d',
			border: '6px solid #fff',
		},
		'&.Mui-disabled .MuiSwitch-thumb': {
			color: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[600],
		},
		'&.Mui-disabled + .MuiSwitch-track': {
			opacity: theme.palette.mode === 'light' ? 0.7 : 0.3,
		},
	},
	'& .MuiSwitch-thumb': {
		boxSizing: 'border-box',
		width: 24,
		height: 24,
		boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.15), 0px 3px 1px rgba(0, 0, 0, 0.06)',
	},
	'& .MuiSwitch-track': {
		borderRadius: 32 / 2,
		backgroundColor: theme.palette.mode === 'light' ? '#E9E9EA' : '#39393D',
		opacity: 1,
		transition: theme.transitions.create(['background-color'], {
			duration: 500,
		}),
	},
}));

const UploadPayrollModal = ({ open, onClose, onUpload }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const { user } = useAuth();
	const role = (user?.role || '').toString();
	// Determine which roles can select companies
	const canSelectCompany = role === 'SUPER_ADMIN' || role === 'ADMIN';
	// State variables
	const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [selectedFile, setSelectedFile] = useState(null);
	const [sendEmails, setSendEmails] = useState(false); // Track toggle state
	const [uploadError, setUploadError] = useState(''); // Track API errors
	const [isDragging, setIsDragging] = useState(false); // Track drag state
	const [selectedCompany, setSelectedCompany] = useState('');
	const [selectedTemplate, setSelectedTemplate] = useState('ISURF_STANDARD');
	const [companies, setCompanies] = useState([]);
	const [excelPreview, setExcelPreview] = useState(null);
	const [showPreviewModal, setShowPreviewModal] = useState(false);

	// State for Success Modal Data
	const [showSuccessModal, setShowSuccessModal] = useState(false);
	const [successStats, setSuccessStats] = useState(null);
	const [failedRecords, setFailedRecords] = useState([]);
	const [createdUploadId, setCreatedUploadId] = useState(null);

	// Reset state when upload modal opens/closes
	useEffect(() => {
		if (!open) {
			setSelectedFile(null);
			setUploadError('');
			setProgress(0);
			setSendEmails(false);
			setIsDragging(false);
			setSelectedTemplate('ISURF_STANDARD');
			setExcelPreview(null);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const fetchAccessibleCompany = async () => {
			try {
				setIsLoadingCompanies(true);
				const response = await getAccessibleCompany();
				const result = response.data;
				if (result.success) {
					const transformedCompanies = result.data.map((company) => ({
						id: company.id,
						name: company.companyName || 'Unknown Company',
						code: company.companyName || '',
						status: company.status || 'active',
						address: company.address,
						phone: company.phone,
						taxId: company.taxId,
						email: company.email,
					}));
					setCompanies(transformedCompanies);

					if (!canSelectCompany && transformedCompanies.length === 1) {
						setSelectedCompany(transformedCompanies[0].id);
					}
				}
			} catch (error) {
				void error;
			} finally {
				setIsLoadingCompanies(false);
			}
		};

		fetchAccessibleCompany();
	}, [open, canSelectCompany]);

	const parseExcelPreview = async (file) => {
		try {
			const buffer = await file.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: 'array' });

			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];

			// Convert to JSON (array of objects)
			const jsonData = XLSX.utils.sheet_to_json(worksheet, {
				defval: '',
			});

			if (!jsonData.length) {
				setExcelPreview(null);
				return;
			}

			const headers = Object.keys(jsonData[0]);
			const rows = jsonData.slice(0, 150); // preview first 150 rows

			setExcelPreview({ headers, rows });
		} catch (error) {
			console.error('Error parsing Excel file:', error);
			setExcelPreview(null);
		}
	};

	const handleFileChange = async (event) => {
		const file = event.target.files[0];
		if (file) {
			// Validation logic for browse button
			const validTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
			// Check extension as fallback since some CSVs have varying mime types
			const isExcel = file.name.match(/\.(xlsx|xls)$/i);
			const isCsv = file.name.match(/\.(csv)$/i);

			if (!validTypes.includes(file.type) && !isExcel && !isCsv) {
				setUploadError('Invalid file type. Please upload a CSV or Excel file.');
				return;
			}

			setSelectedFile(file);
			setUploadError(''); // Clear previous errors

			// Parse Excel preview
			if (isExcel) {
				await parseExcelPreview(file);
			}
		}
	};

	// --- Drag and Drop Handlers ---
	const handleDragEnter = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDragOver = (e) => {
		e.preventDefault();
		e.stopPropagation();
		// Maintain dragging state while hovering
		if (!isDragging) setIsDragging(true);
	};

	const handleDrop = async (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		const files = e.dataTransfer.files;
		if (files && files.length > 0) {
			const file = files[0];

			const validTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

			// Robust check: MIME type OR file extension
			const isExcel = file.name.match(/\.(xlsx|xls)$/i);
			const isCsv = file.name.match(/\.(csv)$/i);

			if (!validTypes.includes(file.type) && !isExcel && !isCsv) {
				setUploadError('Invalid file type. Please upload a CSV or Excel file.');
				return;
			}

			setSelectedFile(file);
			setUploadError('');

			// Parse Excel preview
			if (isExcel) {
				await parseExcelPreview(file);
			}
		}
	};

	const handleOpenPreview = () => {
		if (excelPreview) {
			setShowPreviewModal(true);
		}
	};

	const handleUploadClick = async () => {
		if (!selectedFile) return;

		const template = TEMPLATE_LABEL_MAP[selectedTemplate];
		setIsProcessing(true);
		setUploadError('');
		setProgress(10); // Start progress

		// Simulated progress timer to show activity while awaiting API
		const progressInterval = setInterval(() => {
			setProgress((old) => {
				if (old >= 90) return old;
				return Math.min(old + Math.random() * 15, 90);
			});
		}, 400);

		try {
			console.log({
				selectedCompany,
				template,
			});

			// Call the API
			const response = await uploadPayroll(selectedFile, sendEmails, selectedCompany, template);
			// Stop the simulation
			clearInterval(progressInterval);
			setProgress(100);

			const apiData = response.data; // Axios response data

			if (apiData.success) {
				// Prepare data for Success Modal
				const summary = apiData.data.summary || {};
				const results = apiData.data.results || {};
				const newUploadId = apiData.data.uploadId;

				setSuccessStats({
					processed: summary.totalProcessed || 0,
					successful: summary.successful || 0,
					failed: summary.failed || 0,
					generated: summary.payslipsGenerated || 0,
					updated: summary.payslipsUpdated || 0,
					sent: summary.emailsSent || 0,
				});

				setCreatedUploadId(newUploadId);

				const errors = results.errors || [];

				const formattedErrors = errors.map((msg) => ({
					row: msg.match(/Row\s+(\d+)/)?.[1] || null, // Clean extraction of row number
					error: msg,
				}));

				setFailedRecords(formattedErrors);

				// Small delay to show 100% completion before switching modals
				setTimeout(() => {
					setIsProcessing(false);
					onClose(); // Close upload modal
					setShowSuccessModal(true); // Open success modal
					if (onUpload) onUpload(); // Refresh parent data
				}, 500);
			} else {
				throw new Error(apiData.message || 'Upload failed');
			}
		} catch (err) {
			clearInterval(progressInterval);
			setIsProcessing(false);
			setProgress(0);

			const errorMessage = err.response?.data?.message || err.message || 'An unexpected error occurred.';
			setUploadError(errorMessage);
		}
	};

	const handleSuccessClose = () => {
		setShowSuccessModal(false);
		setSelectedFile(null);
		setSuccessStats(null);
		setFailedRecords([]);
		setCreatedUploadId(null);
		setSelectedTemplate('ISURF_STANDARD');
		setExcelPreview(null);
	};

	const onSelectCompany = (companyId) => {
		setSelectedCompany(companyId);
	};

	// Add these animations at the top of UploadPayrollModal component
	const uploadModalAnimations = {
		'@keyframes slideInUp': {
			'0%': {
				transform: 'translateY(50px) scale(0.95)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0) scale(1)',
				opacity: 1,
			},
		},
		'@keyframes slideInRight': {
			'0%': {
				transform: 'translateX(30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInLeft': {
			'0%': {
				transform: 'translateX(-30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes fadeIn': {
			'0%': { opacity: 0 },
			'100%': { opacity: 1 },
		},
		'@keyframes scaleIn': {
			'0%': {
				transform: 'scale(0.95)',
				opacity: 0,
			},
			'100%': {
				transform: 'scale(1)',
				opacity: 1,
			},
		},
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0.4)' },
			'70%': { boxShadow: '0 0 0 8px rgba(19, 127, 236, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0)' },
		},
		'@keyframes shimmer': {
			'0%': { backgroundPosition: '-1000px 0' },
			'100%': { backgroundPosition: '1000px 0' },
		},
		'@keyframes shake': {
			'0%, 100%': { transform: 'translateX(0)' },
			'25%': { transform: 'translateX(-5px)' },
			'75%': { transform: 'translateX(5px)' },
		},
		'@keyframes bounce': {
			'0%, 100%': { transform: 'translateY(0)' },
			'50%': { transform: 'translateY(-5px)' },
		},
	};

	return (
		<>
			<Dialog
				open={open}
				onClose={!isProcessing ? onClose : undefined}
				maxWidth="sm"
				fullWidth
				TransitionProps={{
					timeout: 300,
				}}
				PaperProps={{
					sx: {
						borderRadius: 3,
						backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
						color: isDarkMode ? '#ffffff' : '#1f2937',
						boxShadow: 24,
						animation: 'slideInUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
						...uploadModalAnimations,
					},
				}}>
				{/* Header */}
				<DialogTitle
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						p: 3,
						borderBottom: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
						animation: 'slideInLeft 0.3s ease-out 0.1s both',
						...uploadModalAnimations,
					}}>
					<Typography
						variant="h6"
						component="span"
						sx={{
							'fontWeight': 700,
							'fontSize': '1.25rem',
							'color': isDarkMode ? '#ffffff' : '#1f2937',
							'position': 'relative',
							'display': 'inline-block',
							'&::after': {
								content: '""',
								position: 'absolute',
								bottom: -4,
								left: 0,
								width: '40px',
								height: '3px',
								...uploadModalAnimations,
							},
						}}>
						Upload Payroll File
					</Typography>
					<IconButton
						onClick={onClose}
						disabled={isProcessing}
						sx={{
							'color': '#9ca3af',
							'transition': 'all 0.2s ease',
							'&:hover': {
								color: isDarkMode ? '#e5e7eb' : '#4b5563',
								transform: 'rotate(90deg) scale(1.1)',
							},
						}}>
						<CloseIcon />
					</IconButton>
				</DialogTitle>

				{/* Body */}
				<DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
					{/* Error Alert with shake animation */}
					{uploadError && (
						<Alert
							severity="error"
							sx={{
								mb: 0,
								animation: 'shake 0.3s ease-out',
								...uploadModalAnimations,
							}}>
							{uploadError}
						</Alert>
					)}

					{/* Company Select with slide in */}
					<Box sx={{ animation: 'slideInRight 0.3s ease-out 0.15s both', ...uploadModalAnimations }}>
						<CompanySelectField
							required={true}
							sx={{ mt: 2, mb: 0 }}
							companies={companies}
							label="Select Company"
							value={selectedCompany}
							loading={isLoadingCompanies}
							onChange={onSelectCompany}
							placeholder="Choose a company"
							disabled={!canSelectCompany}
							searchPlaceholder="Search companies..."
						/>
					</Box>

					{/* Template Selection with slide in */}
					<Box sx={{ animation: 'slideInLeft 0.3s ease-out 0.2s both', ...uploadModalAnimations }}>
						<TemplateSelectField
							required={true}
							sx={{ mt: 2, mb: 0 }}
							label="Select Template"
							value={selectedTemplate}
							onChange={(value) => setSelectedTemplate(value)}
							placeholder="Choose a template"
							disabled={isProcessing}
						/>
					</Box>

					{/* Drag & Drop Area with pulse on drag */}
					<Box
						onDragEnter={handleDragEnter}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						sx={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 3,
							px: 3,
							py: 6,
							borderRadius: 3,
							border: `2px dashed ${
								isDragging
									? '#137fec' // Highlight color on drag
									: selectedFile
									? '#137fec'
									: isDarkMode
									? '#4b5563'
									: '#d1d5db'
							}`,
							bgcolor: isDragging || selectedFile ? (isDarkMode ? 'rgba(19, 127, 236, 0.1)' : 'rgba(19, 127, 236, 0.05)') : 'transparent',
							transition: 'all 0.3s ease-in-out',
							cursor: 'pointer',
							animation: isDragging ? 'pulse-glow 1s infinite' : 'scaleIn 0.3s ease-out 0.25s both',
							...uploadModalAnimations,
						}}>
						<Box
							sx={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								gap: 1,
								textAlign: 'center',
								pointerEvents: 'none',
							}}>
							{selectedFile ? (
								<>
									<InsertDriveFileIcon
										sx={{
											fontSize: 48,
											color: '#137fec',
											animation: 'bounce 2s infinite',
											...uploadModalAnimations,
										}}
									/>
									<Typography
										variant="body1"
										sx={{
											fontWeight: 700,
											fontSize: '1.125rem',
											color: isDarkMode ? '#ffffff' : '#1f2937',
											wordBreak: 'break-all',
										}}>
										{selectedFile.name}
									</Typography>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
										<CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} />
										<Typography
											variant="body2"
											sx={{
												fontSize: '0.875rem',
												color: isDarkMode ? '#22c55e' : '#16a34a',
												fontWeight: 500,
											}}>
											Ready to upload
										</Typography>
									</Box>
								</>
							) : (
								<>
									<UploadFileIcon
										sx={{
											fontSize: 48,
											color: isDragging ? '#137fec' : isDarkMode ? '#6b7280' : '#9ca3af',
											transition: 'transform 0.3s ease',
											...(isDragging && {
												transform: 'scale(1.1)',
												animation: 'bounce 1s infinite',
											}),
										}}
									/>
									<Typography
										variant="body1"
										sx={{
											fontWeight: 700,
											fontSize: '1.125rem',
											color: isDarkMode ? '#ffffff' : '#1f2937',
										}}>
										{isDragging ? 'Drop file here' : 'Drag & Drop or Click to Upload'}
									</Typography>
									<Typography
										variant="body2"
										sx={{
											fontSize: '0.875rem',
											color: isDarkMode ? '#9ca3af' : '#6b7280',
										}}>
										Supports: CSV, XLSX
									</Typography>
								</>
							)}
						</Box>

						<Button
							component="label"
							disabled={isProcessing}
							sx={{
								'minWidth': 84,
								'height': 40,
								'px': 2,
								'borderRadius': 3,
								'bgcolor': isDarkMode ? '#374151' : '#f3f4f6',
								'color': isDarkMode ? '#ffffff' : '#1f2937',
								'fontWeight': 700,
								'fontSize': '0.875rem',
								'textTransform': 'none',
								'letterSpacing': '0.015em',
								'transition': 'all 0.2s ease',
								'&:hover': {
									bgcolor: isDarkMode ? '#4b5563' : '#e5e7eb',
									transform: 'scale(1.02)',
								},
								'pointerEvents': 'auto',
							}}>
							{selectedFile ? 'Change File' : 'Browse File'}
							<input
								type="file"
								hidden
								accept=".csv, .xlsx"
								onChange={handleFileChange}
							/>
						</Button>
					</Box>

					{/* Action Panel with slide in */}
					<Box
						sx={{
							'display': 'flex',
							'flexDirection': { xs: 'column', sm: 'row' },
							'alignItems': { xs: 'flex-start', sm: 'center' },
							'justifyContent': 'space-between',
							'gap': 2,
							'p': 2.5,
							'borderRadius': 3,
							'border': `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
							'bgcolor': isDarkMode ? '#1f2937' : '#ffffff',
							'animation': 'slideInUp 0.3s ease-out 0.3s both',
							'transition': 'all 0.2s ease',
							'&:hover': {
								borderColor: '#137fec',
							},
							...uploadModalAnimations,
						}}>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
							<Typography
								variant="body1"
								sx={{
									fontWeight: 700,
									color: isDarkMode ? '#ffffff' : '#1f2937',
								}}>
								Email Payslips to Staff?
							</Typography>
							<Typography
								variant="body2"
								sx={{
									fontSize: '0.875rem',
									color: isDarkMode ? '#9ca3af' : '#6b7280',
								}}>
								Notify all employees by sending their payslips via email.
							</Typography>
						</Box>

						<FormControlLabel
							control={
								<IOSSwitch
									sx={{ m: 1 }}
									checked={sendEmails}
									onChange={(e) => setSendEmails(e.target.checked)}
									disabled={isProcessing}
								/>
							}
							label=""
							sx={{ m: 0 }}
						/>
					</Box>
				</DialogContent>

				{/* Footer */}
				<DialogActions
					sx={{
						p: 3,
						borderTop: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
						gap: 1.5,
						flexWrap: 'wrap',
						animation: 'fadeIn 0.3s ease-out 0.35s both',
						...uploadModalAnimations,
					}}>
					<Button
						onClick={onClose}
						disabled={isProcessing}
						sx={{
							'minWidth': 84,
							'height': 40,
							'px': 2,
							'borderRadius': 3,
							'bgcolor': isDarkMode ? '#374151' : '#f3f4f6',
							'color': isDarkMode ? '#ffffff' : '#1f2937',
							'fontWeight': 700,
							'fontSize': '0.875rem',
							'textTransform': 'none',
							'letterSpacing': '0.015em',
							'transition': 'all 0.2s ease',
							'&:hover': {
								bgcolor: isDarkMode ? '#4b5563' : '#e5e7eb',
								transform: 'scale(1.02)',
							},
						}}>
						Cancel
					</Button>

					{/* Preview Button */}
					<Button
						onClick={handleOpenPreview}
						disabled={!selectedFile || !excelPreview || isProcessing}
						startIcon={<VisibilityIcon sx={{ transition: 'transform 0.2s ease' }} />}
						sx={{
							'minWidth': 84,
							'height': 40,
							'px': 2,
							'borderRadius': 3,
							'bgcolor': 'transparent',
							'color': '#137fec',
							'border': '1px solid #137fec',
							'fontWeight': 700,
							'fontSize': '0.875rem',
							'textTransform': 'none',
							'letterSpacing': '0.015em',
							'transition': 'all 0.3s ease',
							'&:hover': {
								'bgcolor': 'rgba(19, 127, 236, 0.08)',
								'borderColor': '#0e6fd9',
								'transform': 'scale(1.02)',
								'& .MuiSvgIcon-root': {
									transform: 'scale(1.1)',
								},
							},
							'&.Mui-disabled': {
								bgcolor: 'transparent',
								borderColor: isDarkMode ? '#374151' : '#e5e7eb',
								color: isDarkMode ? '#6b7280' : '#9ca3af',
							},
						}}>
						Preview
					</Button>

					<Button
						onClick={handleUploadClick}
						disabled={isProcessing || !selectedFile}
						sx={{
							'minWidth': 84,
							'height': 40,
							'px': 2,
							'borderRadius': 3,
							'bgcolor': '#137fec',
							'color': '#ffffff',
							'fontWeight': 700,
							'fontSize': '0.875rem',
							'textTransform': 'none',
							'letterSpacing': '0.015em',
							'position': 'relative',
							'overflow': 'hidden',
							'transition': 'all 0.3s ease',
							'&::before': {
								content: '""',
								position: 'absolute',
								top: '50%',
								left: '50%',
								width: 0,
								height: 0,
								borderRadius: '50%',
								background: 'rgba(255,255,255,0.3)',
								transform: 'translate(-50%, -50%)',
								transition: 'width 0.6s ease, height 0.6s ease',
							},
							'&:hover:not(:disabled)': {
								'bgcolor': 'rgba(19, 127, 236, 0.9)',
								'transform': 'scale(1.02)',
								'&::before': {
									width: '200px',
									height: '200px',
								},
							},
							'&.Mui-disabled': {
								bgcolor: isDarkMode ? '#374151' : '#e5e7eb',
								color: isDarkMode ? '#6b7280' : '#9ca3af',
							},
						}}>
						{isProcessing ? 'Uploading...' : 'Upload Payroll'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Preview Modal with scale animation */}
			<Modal
				open={showPreviewModal}
				onClose={() => setShowPreviewModal(false)}
				closeAfterTransition
				BackdropProps={{
					sx: {
						backdropFilter: 'blur(10px)',
						backgroundColor: 'rgba(0,0,0,0.8)',
						animation: 'fadeIn 0.3s ease-out',
						...uploadModalAnimations,
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
						bgcolor: isDarkMode ? '#0f172a' : '#ffffff',
						border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
						borderRadius: 3,
						boxShadow: 24,
						outline: 'none',
						display: 'flex',
						flexDirection: 'column',
						animation: 'scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
						...uploadModalAnimations,
					}}>
					{/* Header */}
					<Box
						sx={{
							p: 3,
							borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							animation: 'slideInLeft 0.3s ease-out',
							...uploadModalAnimations,
						}}>
						<Box>
							<Typography
								variant="h5"
								fontWeight={700}
								color={isDarkMode ? 'white' : '#1f2937'}>
								Excel Preview
							</Typography>
							<Typography
								variant="body2"
								color={isDarkMode ? 'rgba(255,255,255,0.6)' : '#6b7280'}
								mt={0.5}>
								{selectedFile?.name} • {excelPreview?.rows?.length || 0} rows
							</Typography>
						</Box>
						<IconButton
							onClick={() => setShowPreviewModal(false)}
							sx={{
								'color': isDarkMode ? 'rgba(255,255,255,0.7)' : '#6b7280',
								'transition': 'all 0.2s ease',
								'&:hover': {
									transform: 'rotate(90deg) scale(1.1)',
									color: '#f44336',
								},
							}}>
							<CloseIcon />
						</IconButton>
					</Box>

					{/* Table Container */}
					<Box
						sx={{
							flex: 1,
							overflow: 'auto',
							p: 3,
						}}>
						<Paper
							sx={{
								bgcolor: isDarkMode ? '#0b1220' : '#f9fafb',
								border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
								borderRadius: 2,
								overflow: 'hidden',
								animation: 'fadeIn 0.3s ease-out 0.1s both',
								...uploadModalAnimations,
							}}>
							<Box sx={{ overflow: 'auto', maxHeight: 'calc(90vh - 200px)' }}>
								<Table stickyHeader>
									<TableHead>
										<TableRow>
											<TableCell
												sx={{
													color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6b7280',
													fontWeight: 600,
													bgcolor: isDarkMode ? '#162033' : '#f3f4f6',
													fontSize: '0.75rem',
													borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
													minWidth: 60,
													textAlign: 'center',
												}}>
												#
											</TableCell>
											{excelPreview?.headers.map((h, index) => (
												<TableCell
													key={h}
													sx={{
														color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#1f2937',
														fontWeight: 700,
														bgcolor: isDarkMode ? '#162033' : '#f3f4f6',
														fontSize: '0.8rem',
														textTransform: 'uppercase',
														letterSpacing: '0.5px',
														minWidth: 150,
														whiteSpace: 'nowrap',
														animation: `slideInDown 0.2s ease-out ${index * 0.02}s both`,
														...uploadModalAnimations,
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
													'&:hover': {
														bgcolor: isDarkMode ? '#1a2332' : '#f3f4f6',
													},
													'bgcolor': i % 2 === 0 ? (isDarkMode ? '#0f172a' : '#ffffff') : isDarkMode ? '#0b1220' : '#f9fafb',
													'animation': `fadeIn 0.2s ease-out ${i * 0.01}s both`,
													...uploadModalAnimations,
												}}>
												<TableCell
													sx={{
														color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#9ca3af',
														fontSize: '0.75rem',
														borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
														textAlign: 'center',
														fontWeight: 600,
													}}>
													{i + 1}
												</TableCell>
												{excelPreview.headers.map((h) => (
													<TableCell
														key={h}
														sx={{
															color: isDarkMode ? '#e5e7eb' : '#1f2937',
															fontSize: '0.85rem',
															borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : '#f3f4f6'}`,
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
							borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							animation: 'slideInUp 0.3s ease-out 0.2s both',
							...uploadModalAnimations,
						}}>
						<Typography
							variant="body2"
							color={isDarkMode ? 'rgba(255,255,255,0.6)' : '#6b7280'}>
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
								'bgcolor': '#137fec',
								'transition': 'all 0.2s ease',
								'&:hover': {
									bgcolor: 'rgba(19, 127, 236, 0.9)',
									transform: 'scale(1.02)',
								},
							}}>
							Close
						</Button>
					</Box>
				</Box>
			</Modal>

			{/* Processing Overlay */}
			<PayrollProcessingOverlay
				open={isProcessing}
				progress={progress}
			/>

			{/* Success Modal */}
			<PayrollUploadSuccessModal
				open={showSuccessModal}
				onClose={handleSuccessClose}
				stats={successStats}
				failedRecords={failedRecords}
				uploadId={createdUploadId}
			/>
		</>
	);

	// return (
	// 	<>
	// 		<Dialog
	// 			open={open}
	// 			onClose={!isProcessing ? onClose : undefined}
	// 			maxWidth="sm"
	// 			fullWidth
	// 			PaperProps={{
	// 				sx: {
	// 					borderRadius: 3,
	// 					backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
	// 					color: isDarkMode ? '#ffffff' : '#1f2937',
	// 					boxShadow: 24,
	// 				},
	// 			}}>
	// 			{/* Header */}
	// 			<DialogTitle
	// 				sx={{
	// 					display: 'flex',
	// 					justifyContent: 'space-between',
	// 					alignItems: 'center',
	// 					p: 3,
	// 					borderBottom: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
	// 				}}>
	// 				<Typography
	// 					variant="h6"
	// 					component="span"
	// 					sx={{
	// 						fontWeight: 700,
	// 						fontSize: '1.25rem',
	// 						color: isDarkMode ? '#ffffff' : '#1f2937',
	// 					}}>
	// 					Upload Payroll File
	// 				</Typography>
	// 				<IconButton
	// 					onClick={onClose}
	// 					disabled={isProcessing}
	// 					sx={{
	// 						'color': '#9ca3af',
	// 						'&:hover': {
	// 							color: isDarkMode ? '#e5e7eb' : '#4b5563',
	// 						},
	// 					}}>
	// 					<CloseIcon />
	// 				</IconButton>
	// 			</DialogTitle>

	// 			{/* Body */}
	// 			<DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
	// 				{/* Error Alert */}
	// 				{uploadError && (
	// 					<Alert
	// 						severity="error"
	// 						sx={{ mb: 0 }}>
	// 						{uploadError}
	// 					</Alert>
	// 				)}

	// 				<CompanySelectField
	// 					required={true}
	// 					sx={{ mt: 2, mb: 0 }}
	// 					companies={companies}
	// 					label="Select Company"
	// 					value={selectedCompany}
	// 					loading={isLoadingCompanies}
	// 					onChange={onSelectCompany}
	// 					placeholder="Choose a company"
	// 					disabled={!canSelectCompany}
	// 					searchPlaceholder="Search companies..."
	// 				/>

	// 				{/* Template Selection */}
	// 				<TemplateSelectField
	// 					required={true}
	// 					sx={{ mt: 2, mb: 0 }}
	// 					label="Select Template"
	// 					value={selectedTemplate}
	// 					onChange={(value) => setSelectedTemplate(value)}
	// 					placeholder="Choose a template"
	// 					disabled={isProcessing}
	// 				/>

	// 				{/* Drag & Drop Area */}
	// 				<Box
	// 					onDragEnter={handleDragEnter}
	// 					onDragOver={handleDragOver}
	// 					onDragLeave={handleDragLeave}
	// 					onDrop={handleDrop}
	// 					sx={{
	// 						display: 'flex',
	// 						flexDirection: 'column',
	// 						alignItems: 'center',
	// 						gap: 3,
	// 						px: 3,
	// 						py: 6,
	// 						borderRadius: 3,
	// 						border: `2px dashed ${
	// 							isDragging
	// 								? '#137fec' // Highlight color on drag
	// 								: selectedFile
	// 								? '#137fec'
	// 								: isDarkMode
	// 								? '#4b5563'
	// 								: '#d1d5db'
	// 						}`,
	// 						bgcolor: isDragging || selectedFile ? (isDarkMode ? 'rgba(19, 127, 236, 0.1)' : 'rgba(19, 127, 236, 0.05)') : 'transparent',
	// 						transition: 'all 0.2s ease-in-out',
	// 						cursor: 'pointer', // Indicate interactivity
	// 					}}>
	// 					<Box
	// 						sx={{
	// 							display: 'flex',
	// 							flexDirection: 'column',
	// 							alignItems: 'center',
	// 							gap: 1,
	// 							textAlign: 'center',
	// 							pointerEvents: 'none', // Allow drops to bubble up to container
	// 						}}>
	// 						{selectedFile ? (
	// 							<>
	// 								<InsertDriveFileIcon sx={{ fontSize: 48, color: '#137fec' }} />
	// 								<Typography
	// 									variant="body1"
	// 									sx={{
	// 										fontWeight: 700,
	// 										fontSize: '1.125rem',
	// 										color: isDarkMode ? '#ffffff' : '#1f2937',
	// 										wordBreak: 'break-all',
	// 									}}>
	// 									{selectedFile.name}
	// 								</Typography>
	// 								<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
	// 									<CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} />
	// 									<Typography
	// 										variant="body2"
	// 										sx={{
	// 											fontSize: '0.875rem',
	// 											color: isDarkMode ? '#22c55e' : '#16a34a',
	// 											fontWeight: 500,
	// 										}}>
	// 										Ready to upload
	// 									</Typography>
	// 								</Box>
	// 							</>
	// 						) : (
	// 							<>
	// 								<UploadFileIcon
	// 									sx={{
	// 										fontSize: 48,
	// 										color: isDragging ? '#137fec' : isDarkMode ? '#6b7280' : '#9ca3af',
	// 									}}
	// 								/>
	// 								<Typography
	// 									variant="body1"
	// 									sx={{
	// 										fontWeight: 700,
	// 										fontSize: '1.125rem',
	// 										color: isDarkMode ? '#ffffff' : '#1f2937',
	// 									}}>
	// 									{isDragging ? 'Drop file here' : 'Drag & Drop or Click to Upload'}
	// 								</Typography>
	// 								<Typography
	// 									variant="body2"
	// 									sx={{
	// 										fontSize: '0.875rem',
	// 										color: isDarkMode ? '#9ca3af' : '#6b7280',
	// 									}}>
	// 									Supports: CSV, XLSX
	// 								</Typography>
	// 							</>
	// 						)}
	// 					</Box>

	// 					<Button
	// 						component="label"
	// 						disabled={isProcessing}
	// 						sx={{
	// 							'minWidth': 84,
	// 							'height': 40,
	// 							'px': 2,
	// 							'borderRadius': 3,
	// 							'bgcolor': isDarkMode ? '#374151' : '#f3f4f6',
	// 							'color': isDarkMode ? '#ffffff' : '#1f2937',
	// 							'fontWeight': 700,
	// 							'fontSize': '0.875rem',
	// 							'textTransform': 'none',
	// 							'letterSpacing': '0.015em',
	// 							'&:hover': {
	// 								bgcolor: isDarkMode ? '#4b5563' : '#e5e7eb',
	// 							},
	// 							// pointerEvents needed for button to work inside drop zone
	// 							'pointerEvents': 'auto',
	// 						}}>
	// 						{selectedFile ? 'Change File' : 'Browse File'}
	// 						<input
	// 							type="file"
	// 							hidden
	// 							accept=".csv, .xlsx"
	// 							onChange={handleFileChange}
	// 						/>
	// 					</Button>
	// 				</Box>

	// 				{/* Action Panel (Toggle) */}
	// 				<Box
	// 					sx={{
	// 						display: 'flex',
	// 						flexDirection: { xs: 'column', sm: 'row' },
	// 						alignItems: { xs: 'flex-start', sm: 'center' },
	// 						justifyContent: 'space-between',
	// 						gap: 2,
	// 						p: 2.5,
	// 						borderRadius: 3,
	// 						border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
	// 						bgcolor: isDarkMode ? '#1f2937' : '#ffffff',
	// 					}}>
	// 					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
	// 						<Typography
	// 							variant="body1"
	// 							sx={{
	// 								fontWeight: 700,
	// 								color: isDarkMode ? '#ffffff' : '#1f2937',
	// 							}}>
	// 							Email Payslips to Staff?
	// 						</Typography>
	// 						<Typography
	// 							variant="body2"
	// 							sx={{
	// 								fontSize: '0.875rem',
	// 								color: isDarkMode ? '#9ca3af' : '#6b7280',
	// 							}}>
	// 							Notify all employees by sending their payslips via email.
	// 						</Typography>
	// 					</Box>

	// 					<FormControlLabel
	// 						control={
	// 							<IOSSwitch
	// 								sx={{ m: 1 }}
	// 								checked={sendEmails}
	// 								onChange={(e) => setSendEmails(e.target.checked)}
	// 								disabled={isProcessing}
	// 							/>
	// 						}
	// 						label=""
	// 						sx={{ m: 0 }}
	// 					/>
	// 				</Box>
	// 			</DialogContent>

	// 			{/* Footer */}
	// 			<DialogActions
	// 				sx={{
	// 					p: 3,
	// 					borderTop: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
	// 					gap: 1.5,
	// 					flexWrap: 'wrap',
	// 				}}>
	// 				<Button
	// 					onClick={onClose}
	// 					disabled={isProcessing}
	// 					sx={{
	// 						'minWidth': 84,
	// 						'height': 40,
	// 						'px': 2,
	// 						'borderRadius': 3,
	// 						'bgcolor': isDarkMode ? '#374151' : '#f3f4f6',
	// 						'color': isDarkMode ? '#ffffff' : '#1f2937',
	// 						'fontWeight': 700,
	// 						'fontSize': '0.875rem',
	// 						'textTransform': 'none',
	// 						'letterSpacing': '0.015em',
	// 						'&:hover': {
	// 							bgcolor: isDarkMode ? '#4b5563' : '#e5e7eb',
	// 						},
	// 					}}>
	// 					Cancel
	// 				</Button>

	// 				{/* Preview Button */}
	// 				<Button
	// 					onClick={handleOpenPreview}
	// 					disabled={!selectedFile || !excelPreview || isProcessing}
	// 					startIcon={<VisibilityIcon />}
	// 					sx={{
	// 						'minWidth': 84,
	// 						'height': 40,
	// 						'px': 2,
	// 						'borderRadius': 3,
	// 						'bgcolor': 'transparent',
	// 						'color': '#137fec',
	// 						'border': '1px solid #137fec',
	// 						'fontWeight': 700,
	// 						'fontSize': '0.875rem',
	// 						'textTransform': 'none',
	// 						'letterSpacing': '0.015em',
	// 						'&:hover': {
	// 							bgcolor: 'rgba(19, 127, 236, 0.08)',
	// 							borderColor: '#0e6fd9',
	// 						},
	// 						'&.Mui-disabled': {
	// 							bgcolor: 'transparent',
	// 							borderColor: isDarkMode ? '#374151' : '#e5e7eb',
	// 							color: isDarkMode ? '#6b7280' : '#9ca3af',
	// 						},
	// 					}}>
	// 					Preview
	// 				</Button>

	// 				<Button
	// 					onClick={handleUploadClick}
	// 					disabled={isProcessing || !selectedFile}
	// 					sx={{
	// 						'minWidth': 84,
	// 						'height': 40,
	// 						'px': 2,
	// 						'borderRadius': 3,
	// 						'bgcolor': '#137fec',
	// 						'color': '#ffffff',
	// 						'fontWeight': 700,
	// 						'fontSize': '0.875rem',
	// 						'textTransform': 'none',
	// 						'letterSpacing': '0.015em',
	// 						'&:hover': {
	// 							bgcolor: 'rgba(19, 127, 236, 0.9)',
	// 						},
	// 						'&.Mui-disabled': {
	// 							bgcolor: isDarkMode ? '#374151' : '#e5e7eb',
	// 							color: isDarkMode ? '#6b7280' : '#9ca3af',
	// 						},
	// 					}}>
	// 					{isProcessing ? 'Uploading...' : 'Upload Payroll'}
	// 				</Button>
	// 			</DialogActions>
	// 		</Dialog>

	// 		{/* ==================== PREVIEW MODAL ==================== */}
	// 		<Modal
	// 			open={showPreviewModal}
	// 			onClose={() => setShowPreviewModal(false)}
	// 			closeAfterTransition
	// 			BackdropProps={{
	// 				sx: {
	// 					backdropFilter: 'blur(10px)',
	// 					backgroundColor: 'rgba(0,0,0,0.8)',
	// 				},
	// 			}}>
	// 			<Box
	// 				sx={{
	// 					position: 'absolute',
	// 					top: '50%',
	// 					left: '50%',
	// 					transform: 'translate(-50%, -50%)',
	// 					width: { xs: '95%', md: '90%', lg: '85%' },
	// 					maxWidth: 1400,
	// 					maxHeight: '90vh',
	// 					bgcolor: isDarkMode ? '#0f172a' : '#ffffff',
	// 					border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
	// 					borderRadius: 3,
	// 					boxShadow: 24,
	// 					outline: 'none',
	// 					display: 'flex',
	// 					flexDirection: 'column',
	// 				}}>
	// 				{/* Header */}
	// 				<Box
	// 					sx={{
	// 						p: 3,
	// 						borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
	// 						display: 'flex',
	// 						justifyContent: 'space-between',
	// 						alignItems: 'center',
	// 					}}>
	// 					<Box>
	// 						<Typography
	// 							variant="h5"
	// 							fontWeight={700}
	// 							color={isDarkMode ? 'white' : '#1f2937'}>
	// 							Excel Preview
	// 						</Typography>
	// 						<Typography
	// 							variant="body2"
	// 							color={isDarkMode ? 'rgba(255,255,255,0.6)' : '#6b7280'}
	// 							mt={0.5}>
	// 							{selectedFile?.name} • {excelPreview?.rows?.length || 0} rows
	// 						</Typography>
	// 					</Box>
	// 					<IconButton
	// 						onClick={() => setShowPreviewModal(false)}
	// 						sx={{ color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#6b7280' }}>
	// 						<CloseIcon />
	// 					</IconButton>
	// 				</Box>

	// 				{/* Table Container */}
	// 				<Box
	// 					sx={{
	// 						flex: 1,
	// 						overflow: 'auto',
	// 						p: 3,
	// 					}}>
	// 					<Paper
	// 						sx={{
	// 							bgcolor: isDarkMode ? '#0b1220' : '#f9fafb',
	// 							border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
	// 							borderRadius: 2,
	// 							overflow: 'hidden',
	// 						}}>
	// 						<Box sx={{ overflow: 'auto', maxHeight: 'calc(90vh - 200px)' }}>
	// 							<Table stickyHeader>
	// 								<TableHead>
	// 									<TableRow>
	// 										<TableCell
	// 											sx={{
	// 												color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6b7280',
	// 												fontWeight: 600,
	// 												bgcolor: isDarkMode ? '#162033' : '#f3f4f6',
	// 												fontSize: '0.75rem',
	// 												borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
	// 												minWidth: 60,
	// 												textAlign: 'center',
	// 											}}>
	// 											#
	// 										</TableCell>
	// 										{excelPreview?.headers.map((h) => (
	// 											<TableCell
	// 												key={h}
	// 												sx={{
	// 													color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#1f2937',
	// 													fontWeight: 700,
	// 													bgcolor: isDarkMode ? '#162033' : '#f3f4f6',
	// 													fontSize: '0.8rem',
	// 													textTransform: 'uppercase',
	// 													letterSpacing: '0.5px',
	// 													minWidth: 150,
	// 													whiteSpace: 'nowrap',
	// 												}}>
	// 												{h}
	// 											</TableCell>
	// 										))}
	// 									</TableRow>
	// 								</TableHead>

	// 								<TableBody>
	// 									{excelPreview?.rows.map((row, i) => (
	// 										<TableRow
	// 											key={i}
	// 											sx={{
	// 												'&:hover': { bgcolor: isDarkMode ? '#1a2332' : '#f3f4f6' },
	// 												'bgcolor': i % 2 === 0 ? (isDarkMode ? '#0f172a' : '#ffffff') : isDarkMode ? '#0b1220' : '#f9fafb',
	// 											}}>
	// 											<TableCell
	// 												sx={{
	// 													color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#9ca3af',
	// 													fontSize: '0.75rem',
	// 													borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
	// 													textAlign: 'center',
	// 													fontWeight: 600,
	// 												}}>
	// 												{i + 1}
	// 											</TableCell>
	// 											{excelPreview.headers.map((h) => (
	// 												<TableCell
	// 													key={h}
	// 													sx={{
	// 														color: isDarkMode ? '#e5e7eb' : '#1f2937',
	// 														fontSize: '0.85rem',
	// 														borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : '#f3f4f6'}`,
	// 													}}>
	// 													{String(row[h] ?? '')}
	// 												</TableCell>
	// 											))}
	// 										</TableRow>
	// 									))}
	// 								</TableBody>
	// 							</Table>
	// 						</Box>
	// 					</Paper>
	// 				</Box>

	// 				{/* Footer */}
	// 				<Box
	// 					sx={{
	// 						p: 3,
	// 						borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
	// 						display: 'flex',
	// 						justifyContent: 'space-between',
	// 						alignItems: 'center',
	// 					}}>
	// 					<Typography
	// 						variant="body2"
	// 						color={isDarkMode ? 'rgba(255,255,255,0.6)' : '#6b7280'}>
	// 						Showing {Math.min(150, excelPreview?.rows?.length || 0)} of {excelPreview?.rows?.length || 0} rows
	// 					</Typography>
	// 					<Button
	// 						variant="contained"
	// 						onClick={() => setShowPreviewModal(false)}
	// 						sx={{
	// 							'px': 4,
	// 							'borderRadius': 2,
	// 							'textTransform': 'none',
	// 							'fontWeight': 600,
	// 							'bgcolor': '#137fec',
	// 							'&:hover': { bgcolor: 'rgba(19, 127, 236, 0.9)' },
	// 						}}>
	// 						Close
	// 					</Button>
	// 				</Box>
	// 			</Box>
	// 		</Modal>

	// 		{/* Processing Overlay */}
	// 		<PayrollProcessingOverlay
	// 			open={isProcessing}
	// 			progress={progress}
	// 		/>

	// 		{/* Success Modal */}
	// 		<PayrollUploadSuccessModal
	// 			open={showSuccessModal}
	// 			onClose={handleSuccessClose}
	// 			stats={successStats}
	// 			failedRecords={failedRecords}
	// 			uploadId={createdUploadId}
	// 		/>
	// 	</>
	// );
};

export default UploadPayrollModal;
