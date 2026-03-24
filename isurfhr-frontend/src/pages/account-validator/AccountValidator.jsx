import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
	Box,
	Typography,
	Button,
	Stack,
	Alert,
	Snackbar,
	Paper,
	CircularProgress,
	LinearProgress,
	IconButton,
	Chip,
	TextField,
	useMediaQuery,
	useTheme,
	Grid,
	Divider,
	Autocomplete,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	TableContainer,
	TableBody,
	TableCell,
	Table,
	TableHead,
	TableRow,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import HistoryIcon from '@mui/icons-material/History';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import VerifiedIcon from '@mui/icons-material/Verified';
import ClearIcon from '@mui/icons-material/Clear';
import { toast } from 'sonner';
import Tooltip from '@mui/material/Tooltip';
import { CloudDownload, CheckCircle, Cancel, ErrorOutline, Visibility, Description, Close, FilterList, ChevronLeft, ChevronRight } from '@mui/icons-material';
import ExcelJS from 'exceljs';
import { PreviewModal } from '@/components/PreviewModal';
import { verifySingle, uploadBulk, getBanks } from '@/services/ValidatorService';

// Constants
const ALLOWED_FILE_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Mock bank data
const BANKS = [
	{ code: '044', name: 'Access Bank' },
	{ code: '023', name: 'Citibank' },
	{ code: '063', name: 'Diamond Bank' },
	{ code: '050', name: 'Ecobank' },
	{ code: '058', name: 'Guaranty Trust Bank' },
	{ code: '030', name: 'First Bank' },
	{ code: '032', name: 'Union Bank' },
	{ code: '033', name: 'United Bank for Africa' },
	{ code: '035', name: 'Wema Bank' },
	{ code: '057', name: 'Zenith Bank' },
];

const STATUS_CONFIG = {
	MATCH: { color: 'success', icon: <CheckCircle fontSize="small" /> },
	PARTIAL_MATCH: { color: 'warning', icon: <CheckCircle fontSize="small" /> },
	MISMATCH: { color: 'error', icon: <Cancel fontSize="small" /> },
	INVALID_ACCOUNT: { color: 'error', icon: <ErrorOutline fontSize="small" /> },
	UNKNOWN_BANK: { color: 'default', icon: <ErrorOutline fontSize="small" /> },
	MISSING_ACCOUNT: { color: 'default', icon: <ErrorOutline fontSize="small" /> },
};

export default function AccountValidatorPage() {
	const theme = useTheme();
	const navigate = useNavigate();
	const fileInputRef = useRef(null);
	const isMobile = useMediaQuery(theme.breakpoints.down('md')); // md and below

	// State management for bulk upload
	const [selectedFile, setSelectedFile] = useState(null);
	const [dragActive, setDragActive] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [validationResults, setValidationResults] = useState(null);
	const [error, setError] = useState(null);
	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

	// State management for single validation
	const [singleValidation, setSingleValidation] = useState({
		fullName: '',
		accountNumber: '',
		bank: '',
	});
	const [bulkStats, setBulkStats] = useState({
		total: 0,
		match: 0,
		partial: 0,
		issues: 0,
	});
	const [singleResult, setSingleResult] = useState(null);
	const [isValidating, setIsValidating] = useState(false);
	const [previewData, setPreviewData] = useState(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [banks, setBanks] = useState([]);
	const [banksLoading, setBanksLoading] = useState(true);

	// Add these near your other state declarations
	const [filterStatus, setFilterStatus] = useState('ALL');
	const [filterSearch, setFilterSearch] = useState('');
	const [page, setPage] = useState(0);
	const [rowsPerPage, setRowsPerPage] = useState(10);
	const [duration, setDuration] = useState(null);

	useEffect(() => {
		const loadBanks = async () => {
			try {
				const response = await getBanks();
				if (response?.data?.status === 'success') {
					setBanks(
						response.data.data.map((b) => ({
							code: String(b.code),
							name: b.name,
						}))
					);
				}
			} catch (err) {
				setSnackbar({
					open: true,
					message: 'Failed to load Banks',
					severity: 'error',
				});
				// Optional fallback
				setBanks([
					{ code: '044', name: 'Access Bank' },
					{ code: '023', name: 'Citibank' },
					{ code: '063', name: 'Diamond Bank' },
					{ code: '050', name: 'Ecobank' },
					{ code: '058', name: 'Guaranty Trust Bank' },
					{ code: '030', name: 'First Bank' },
					{ code: '032', name: 'Union Bank' },
					{ code: '033', name: 'United Bank for Africa' },
					{ code: '035', name: 'Wema Bank' },
					{ code: '057', name: 'Zenith Bank' },
				]);
			} finally {
				setBanksLoading(false);
			}
		};
		loadBanks();
	}, []);

	// Add this after your state declarations
	const filteredResults = useMemo(() => {
		if (!validationResults) return [];
		return validationResults.filter((r) => {
			const matchStatus = filterStatus === 'ALL' || r.status === filterStatus;
			const matchSearch =
				!filterSearch ||
				r.excel_name?.toLowerCase().includes(filterSearch.toLowerCase()) ||
				r.account_no?.includes(filterSearch) ||
				r.bank_verified_name?.toLowerCase().includes(filterSearch.toLowerCase());
			return matchStatus && matchSearch;
		});
	}, [validationResults, filterStatus, filterSearch]);

	// File validation
	const validateFile = (file) => {
		if (!file) return 'No file selected';
		if (!ALLOWED_FILE_TYPES.includes(file.type)) {
			return 'Invalid file type. Please upload an Excel or CSV file.';
		}
		if (file.size > MAX_FILE_SIZE) {
			return `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.`;
		}
		return null;
	};

	// Handle file selection
	const handleFileSelect = (event) => {
		const file = event.target.files?.[0];
		if (file) {
			const validationError = validateFile(file);
			if (validationError) {
				setError(validationError);
				setSnackbar({
					open: true,
					message: validationError,
					severity: 'error',
				});
				return;
			}

			setSelectedFile(file);
			setError(null);
			setValidationResults(null);
			toast.success(`File "${file.name}" selected successfully`);
		}
	};

	// Handle file drop
	const handleDrop = useCallback((event) => {
		event.preventDefault();
		setDragActive(false);

		const file = event.dataTransfer.files?.[0];
		if (file) {
			const validationError = validateFile(file);
			if (validationError) {
				setError(validationError);
				setSnackbar({
					open: true,
					message: validationError,
					severity: 'error',
				});
				return;
			}

			setSelectedFile(file);
			setError(null);
			setValidationResults(null);
			toast.success(`File "${file.name}" dropped successfully`);
		}
	}, []);

	// Validate single account
	const handleValidateSingle = async () => {
		// Basic validation
		if (!singleValidation.fullName || !singleValidation.accountNumber || !singleValidation.bank) {
			toast.error('Please fill in all fields');
			return;
		}

		setIsValidating(true);
		setSingleResult(null); // Clear previous results

		try {
			// Find the selected bank
			const selectedBank = BANKS.find((b) => b.code === singleValidation.bank);

			// Prepare payload
			const payload = {
				name: singleValidation.fullName.trim(),
				account_no: singleValidation.accountNumber.trim(),
				bank_code: selectedBank.code,
			};

			// Make API call
			const response = await verifySingle(payload);

			// Check if response is successful
			if (response?.data) {
				const result = response.data;

				// Map the response exactly as the working implementation expects
				setSingleResult({
					// These come from the API response
					nameInExcel: result.excel_name, // The name you sent
					bankVerifiedName: result.bank_verified_name || '—', // Name from bank
					accountNumber: result.account_no, // Account number you sent
					bankCode: result.bank_code, // Bank code you sent
					bankName: selectedBank.name, // From your BANKS array
					matchScore: result.match_score, // Number 0-100
					status: result.status, // One of: MATCH, PARTIAL_MATCH, MISMATCH, INVALID_ACCOUNT, UNKNOWN_BANK, MISSING_ACCOUNT

					// Optional fields (keep if your API returns them)
					message: result.message,
					reference: result.reference,
				});

				// Show success message
				toast.success('Account verified successfully', {
					description: `${result.match_score || 0}% match - ${result.status.replace(/_/g, ' ')}`,
				});
			} else {
				throw new Error('Invalid response from server');
			}
		} catch (err) {
			// Handle error
			const errorMessage = err.response?.data?.message || err.message || 'Failed to verify account';

			toast.error('Verification failed', {
				description: errorMessage,
			});

			setSnackbar({
				open: true,
				message: errorMessage,
				severity: 'error',
			});
		} finally {
			setIsValidating(false);
		}
	};

	// Handle drag events
	const handleDragOver = useCallback((event) => {
		event.preventDefault();
		setDragActive(true);
	}, []);

	const handleDragLeave = useCallback((event) => {
		event.preventDefault();
		setDragActive(false);
	}, []);

	// Trigger file input click
	const handleUploadClick = () => {
		fileInputRef.current?.click();
	};

	// Clear selected file
	const handleClearFile = () => {
		setSelectedFile(null);
		setError(null);
		setValidationResults(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleProcessFile = async () => {
		if (!selectedFile) {
			toast.error('Please select a file first');
			return;
		}

		setUploading(true);
		setUploadProgress(0);
		setError(null);
		setValidationResults(null);
		setBulkStats({ total: 0, match: 0, partial: 0, issues: 0 });
		setDuration(null);
		setPage(0);

		const startTime = performance.now();

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);

			const response = await uploadBulk(formData, (progress) => {
				setUploadProgress(progress);
			});

			if (response?.data) {
				const results = response.data.data || response.data;

				// Handle different response formats
				let parsedResults = [];

				if (Array.isArray(results)) {
					// If it's an array, parse each item if needed
					parsedResults = results
						.map((item) => {
							if (typeof item === 'string') {
								try {
									return JSON.parse(item);
								} catch {
									return null;
								}
							}
							return item;
						})
						.filter(Boolean);
				} else if (typeof results === 'string') {
					// If it's a single string, try to parse it
					try {
						const parsed = JSON.parse(results);
						parsedResults = Array.isArray(parsed) ? parsed : [parsed];
					} catch {
						parsedResults = [];
					}
				}

				if (parsedResults.length === 0) {
					toast.warning('No valid data found in the file');
					return;
				}

				const stats = {
					total: parsedResults.length,
					match: parsedResults.filter((r) => r.status === 'MATCH').length,
					partial: parsedResults.filter((r) => r.status === 'PARTIAL_MATCH').length,
					issues: parsedResults.filter((r) => ['MISMATCH', 'INVALID_ACCOUNT', 'UNKNOWN_BANK', 'MISSING_ACCOUNT'].includes(r.status)).length,
				};

				const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
				setDuration(elapsed);
				setValidationResults(parsedResults);
				setBulkStats(stats);
				setUploadProgress(100);

				toast.success('File processed successfully!', {
					description: `${stats.match} matched · ${stats.partial} partial · ${stats.issues} issues in ${elapsed}s`,
				});
			}
		} catch (err) {
			const errorMessage = err.response?.data?.message || err.message || 'Failed to process file';
			setError(errorMessage);
			setSnackbar({
				open: true,
				message: errorMessage,
				severity: 'error',
			});
		} finally {
			setUploading(false);
		}
	};

	// Handle single validation input changes
	const handleSingleInputChange = (field) => (event) => {
		setSingleValidation((prev) => ({
			...prev,
			[field]: event.target.value,
		}));
	};

	// Clear single validation form
	const handleClearSingle = () => {
		setSingleValidation({
			fullName: '',
			accountNumber: '',
			bank: '',
		});
		setSingleResult(null);
	};

	// Handle navigation to history
	const handleViewHistory = () => {
		navigate('/account-validator/history');
	};

	// Handle snackbar close
	const handleSnackbarClose = () => {
		setSnackbar((prev) => ({ ...prev, open: false }));
	};

	// Generate preview from uploaded file
	const generatePreview = async (file) => {
		try {
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(await file.arrayBuffer());

			const worksheet = workbook.getWorksheet(1);
			const previewRows = [];
			const headers = [];

			// Get headers (first row)
			const headerRow = worksheet.getRow(1);
			headerRow.eachCell((cell, colNumber) => {
				headers.push(cell.value || `Column ${colNumber}`);
			});

			// Get all data rows (from row 2 onwards)
			worksheet.eachRow((row, rowNumber) => {
				if (rowNumber > 1) {
					// Skip header row
					const rowData = {};
					row.eachCell((cell, colNumber) => {
						rowData[headers[colNumber - 1] || `Column ${colNumber}`] = cell.value;
					});
					previewRows.push(rowData);
				}
			});

			setPreviewData({
				headers,
				rows: previewRows,
				totalRows: previewRows.length,
			});

			setPreviewOpen(true);
			toast.success(`Loaded ${previewRows.length} rows for preview`);
		} catch (error) {
			console.error('Preview generation failed:', error);
			toast.error('Failed to generate preview. Please check the file format.');
		}
	};

	const downloadTemplate = async (filename = 'account_verification_template.xlsx') => {
		try {
			const workbook = new ExcelJS.Workbook();
			const worksheet = workbook.addWorksheet('Template');

			// Just headers - no data rows
			worksheet.columns = [
				{ header: 'Name', key: 'name', width: 30 },
				{ header: 'Account Number', key: 'accountNumber', width: 20 },
				{ header: 'Bank', key: 'bank', width: 30 },
			];

			// Style the header row
			const headerRow = worksheet.getRow(1);
			headerRow.font = { bold: true };
			headerRow.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFE0E0E0' }, // Light grey header
			};

			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});

			const link = document.createElement('a');
			link.href = URL.createObjectURL(blob);
			link.download = filename;
			link.click();

			URL.revokeObjectURL(link.href);
			toast.success('Template downloaded successfully!');
		} catch (error) {
			void error;
			toast.error('Failed to download template');
		}
	};

	// Add these animation styles to your component
	const animations = {
		'@keyframes float': {
			'0%': { transform: 'translateY(0px)' },
			'50%': { transform: 'translateY(-8px)' },
			'100%': { transform: 'translateY(0px)' },
		},
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
			'70%': { boxShadow: '0 0 0 12px rgba(33, 150, 243, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
		},
		'@keyframes shimmer': {
			'0%': { backgroundPosition: '-1000px 0' },
			'100%': { backgroundPosition: '1000px 0' },
		},
		'@keyframes slideInUp': {
			'0%': { transform: 'translateY(20px)', opacity: 0 },
			'100%': { transform: 'translateY(0)', opacity: 1 },
		},
		'@keyframes slideInRight': {
			'0%': { transform: 'translateX(20px)', opacity: 0 },
			'100%': { transform: 'translateX(0)', opacity: 1 },
		},
		'@keyframes fadeIn': {
			'0%': { opacity: 0 },
			'100%': { opacity: 1 },
		},
		'@keyframes scaleIn': {
			'0%': { transform: 'scale(0.9)', opacity: 0 },
			'100%': { transform: 'scale(1)', opacity: 1 },
		},
		'@keyframes bounce-in': {
			'0%': { transform: 'scale(0.3)', opacity: 0 },
			'50%': { transform: 'scale(1.05)' },
			'70%': { transform: 'scale(0.9)' },
			'100%': { transform: 'scale(1)', opacity: 1 },
		},
	};

	return (
		<Box
			component="main"
			sx={{
				width: '100%',
				minHeight: '100vh',
				px: { xs: 2, sm: 4, md: 6 },
				py: 4,
			}}>
			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept=".xlsx,.xls,.csv"
				onChange={handleFileSelect}
				style={{ display: 'none' }}
			/>

			{/* Header */}
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				justifyContent="space-between"
				alignItems={{ xs: 'flex-start', sm: 'center' }}
				spacing={2}
				sx={{
					mb: 4,
					animation: 'slideInUp 0.5s ease-out',
					...animations,
				}}>
				<Typography
					variant="h4"
					fontWeight={700}
					color="white"
					sx={{
						'position': 'relative',
						'&::after': {
							content: '""',
							position: 'absolute',
							bottom: -8,
							left: 0,
							width: '60px',
							height: '4px',
							background: 'linear-gradient(90deg, #2196f3, #64b5f6, #2196f3)',
							borderRadius: '2px',
							animation: 'shimmer 2s infinite',
							...animations,
						},
						'&:hover': {
							'&::after': {
								width: '80px',
								transition: 'width 0.3s ease',
							},
						},
					}}>
					Account Validator
				</Typography>

				<Box
					sx={{
						display: 'flex',
						gap: 1,
					}}>
					{/* <Tooltip title="View validation history">
						<Button
							variant="contained"
							startIcon={<HistoryIcon />}
							onClick={handleViewHistory}
							sx={{
								'height': 40,
								'px': 2,
								'borderRadius': 1,
								'backgroundColor': '#334155',
								'textTransform': 'none',
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
								'&:hover': {
									'bgcolor': '#1976d2',
									'transform': 'scale(1.02)',
									'& .MuiSvgIcon-root': {
										transform: 'translateY(-2px)',
									},
									'&::before': {
										width: '200px',
										height: '200px',
									},
								},
							}}>
							History
						</Button>
					</Tooltip> */}
					<Tooltip title="Download template for HR to fill">
						<Button
							variant="contained"
							startIcon={<CloudDownload sx={{ transition: 'transform 0.2s ease' }} />}
							onClick={() => downloadTemplate()}
							sx={{
								'height': 40,
								'fontWeight': 600,
								'borderRadius': 1,
								'bgcolor': '#2196f3',
								'textTransform': 'none',
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
								'&:hover': {
									'bgcolor': '#1976d2',
									'transform': 'scale(1.02)',
									'& .MuiSvgIcon-root': {
										transform: 'translateY(-2px)',
									},
									'&::before': {
										width: '200px',
										height: '200px',
									},
								},
							}}>
							Download Template
						</Button>
					</Tooltip>
				</Box>
			</Stack>

			<Paper
				elevation={0}
				sx={{
					p: { xs: 1.5, sm: 2 },
					borderRadius: 2,
					bgcolor: '#0f172a',
					border: '1px solid rgba(255,255,255,0.08)',
					mb: 3,
					animation: 'slideInUp 0.5s ease-out 0.1s both',
					...animations,
				}}>
				{/* Section Title */}
				<Typography
					variant={{ xs: 'subtitle1', sm: 'h6' }}
					fontWeight={600}
					sx={{ color: '#fff', mb: 2 }}>
					Bulk Account Validation
				</Typography>

				{/* Upload Area */}
				<Box
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					sx={{
						'border': '2px dashed',
						'borderColor': dragActive ? '#2196f3' : error ? '#f44336' : 'rgba(255,255,255,0.2)',
						'borderRadius': 2,
						'p': { xs: 3, sm: 4, md: 6 },
						'textAlign': 'center',
						'transition': 'all 0.3s ease',
						'backgroundColor': dragActive ? 'rgba(33, 150, 243, 0.05)' : 'transparent',
						'cursor': 'pointer',
						'&:hover': {
							borderColor: '#2196f3',
							backgroundColor: 'rgba(33, 150, 243, 0.05)',
						},
					}}
					onClick={handleUploadClick}>
					{!selectedFile ? (
						<>
							<Box>
								<CloudUploadIcon
									sx={{
										fontSize: { xs: 48, sm: 56, md: 64 }, // Smaller icon on mobile
										mb: 2,
										mx: 'auto',
										color: dragActive ? '#2196f3' : '#fff',
										opacity: dragActive ? 1 : 0.5,
									}}
								/>
							</Box>

							<Typography
								variant={{ xs: 'body1', sm: 'h6' }} // Responsive text size
								fontWeight={600}
								sx={{ color: '#fff', mb: 0.5 }}>
								Bulk Upload — Bank Account Excel File
							</Typography>

							<Typography
								variant="caption" // Smaller on mobile
								sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>
								Drag and drop or click to browse
							</Typography>

							<Typography
								variant="caption"
								sx={{ color: 'rgba(255,255,255,0.3)' }}>
								Supports .xlsx, .xls, .csv
							</Typography>
						</>
					) : (
						<Box>
							{/* File info chip - Responsive */}
							<Box
								sx={{
									'display': 'inline-flex',
									'flexDirection': { xs: 'column', sm: 'row' }, // Stack on mobile
									'alignItems': 'center',
									'bgcolor': 'rgba(30,41,59,0.8)',
									'border': '1px solid rgba(100,116,139,0.4)',
									'borderRadius': 2,
									'px': { xs: 1.5, sm: 2 },
									'py': { xs: 1, sm: 1.5 },
									'gap': { xs: 1, sm: 1.5 },
									'width': { xs: '100%', sm: 'auto' },
									'maxWidth': { xs: '100%', sm: 400 },
									'mx': 'auto',
									'animation': 'popIn 0.2s ease-out',
									'@keyframes popIn': {
										'0%': { transform: 'scale(0.95)', opacity: 0 },
										'100%': { transform: 'scale(1)', opacity: 1 },
									},
								}}>
								<Box
									sx={{
										bgcolor: '#16a34a',
										borderRadius: 1,
										width: { xs: 32, sm: 36 },
										height: { xs: 32, sm: 36 },
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										flexShrink: 0,
									}}>
									<Description sx={{ color: 'white', fontSize: { xs: 20, sm: 26 } }} />
								</Box>

								<Typography
									variant="body2"
									sx={{
										color: '#e2e8f0',
										fontWeight: 500,
										maxWidth: { xs: '100%', sm: 260 },
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
										wordBreak: 'break-all',
									}}>
									{selectedFile.name}
								</Typography>

								<IconButton
									size="small"
									onClick={(e) => {
										e.stopPropagation();
										handleClearFile();
									}}
									sx={{
										'transition': 'all 0.2s ease',
										'&:hover': {
											transform: 'rotate(90deg)',
											color: '#f44336',
										},
										'flexShrink': 0,
									}}>
									<Close
										fontSize="small"
										sx={{ color: 'rgba(255,255,255,0.6)' }}
									/>
								</IconButton>
							</Box>

							<Typography
								variant="caption"
								sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 1, mb: 2 }}>
								{(selectedFile.size / 1024).toFixed(2)} KB
							</Typography>

							{/* Button Stack - Responsive */}
							<Stack
								direction={{ xs: 'column', sm: 'row' }} // Stack on mobile, row on desktop
								spacing={1}
								justifyContent="center"
								alignItems="center"
								sx={{ width: '100%' }}>
								{/* Preview Button */}
								{selectedFile && (
									<Button
										variant="outlined"
										startIcon={<Visibility />}
										onClick={(e) => {
											e.stopPropagation();
											generatePreview(selectedFile);
										}}
										fullWidth={true} // Full width on mobile
										sx={{
											'borderColor': 'rgba(255,255,255,0.3)',
											'color': '#fff',
											'textTransform': 'none',
											'width': { xs: '100%', sm: 'auto' },
											'minWidth': { sm: 100 },
											'&:hover': {
												borderColor: '#2196f3',
												backgroundColor: 'rgba(33, 150, 243, 0.1)',
											},
										}}>
										Preview
									</Button>
								)}

								{/* Process Button */}
								<Button
									variant="contained"
									startIcon={<UploadFileIcon />}
									onClick={(e) => {
										e.stopPropagation();
										handleProcessFile();
									}}
									disabled={uploading || !selectedFile}
									fullWidth={true} // Full width on mobile
									sx={{
										'bgcolor': '#2196f3',
										'&:hover': { bgcolor: '#1976d2' },
										'textTransform': 'none',
										'width': { xs: '100%', sm: 'auto' },
										'minWidth': { sm: 120 },
										'animation': selectedFile && !uploading ? 'pulse-glow 2s infinite' : 'none',
										...animations,
									}}>
									Process File
								</Button>
							</Stack>
						</Box>
					)}
				</Box>

				{/* Upload Progress */}
				{uploading && (
					<Box sx={{ width: '100%', mt: 2, px: { xs: 1, sm: 0 } }}>
						<LinearProgress
							variant="determinate"
							value={uploadProgress}
							sx={{
								'height': 6,
								'borderRadius': 3,
								'backgroundColor': 'rgba(255,255,255,0.1)',
								'& .MuiLinearProgress-bar': {
									backgroundColor: '#2196f3',
									transition: 'transform 0.2s linear',
								},
							}}
						/>
						<Typography
							variant="caption"
							sx={{
								color: '#fff',
								mt: 0.5,
								display: 'block',
								textAlign: 'center',
								animation: 'pulse-glow 1.5s infinite',
								...animations,
							}}>
							Processing... {uploadProgress}%
						</Typography>
					</Box>
				)}

				{/* Statistics Cards */}
				{validationResults && validationResults.length > 0 && !uploading && (
					<Box
						sx={{
							display: 'flex',
							gap: 2,
							mt: 3,
							flexWrap: 'wrap',
							justifyContent: 'center',
							animation: 'fadeIn 0.5s ease-out',
							...animations,
						}}>
						{/* Total Processed Card */}
						<Paper
							elevation={0}
							sx={{
								'p': 2,
								'flex': 1,
								'minWidth': { xs: '100%', sm: 150 },
								'textAlign': 'center',
								'bgcolor': '#1e293b',
								'borderRadius': 2,
								'border': '1px solid rgba(255,255,255,0.08)',
								'transition': 'all 0.3s ease',
								'animation': 'scaleIn 0.3s ease-out',
								'&:hover': {
									transform: 'translateY(-4px)',
									boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
									borderColor: '#2196f3',
								},
								...animations,
							}}>
							<Typography
								variant="h4"
								fontWeight="bold"
								sx={{
									color: '#fff',
									animation: 'float 3s ease-in-out infinite',
									...animations,
								}}>
								{bulkStats.total}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: 'rgba(255,255,255,0.5)' }}>
								Total Processed
							</Typography>
						</Paper>

						{/* Matched Card */}
						<Paper
							elevation={0}
							sx={{
								'p': 2,
								'flex': 1,
								'minWidth': { xs: '100%', sm: 150 },
								'textAlign': 'center',
								'bgcolor': 'rgba(76, 175, 80, 0.1)',
								'borderRadius': 2,
								'border': '1px solid rgba(76, 175, 80, 0.3)',
								'transition': 'all 0.3s ease',
								'animation': 'scaleIn 0.3s ease-out 0.05s both',
								'&:hover': {
									transform: 'translateY(-4px)',
									boxShadow: '0 8px 16px rgba(76, 175, 80, 0.2)',
									bgcolor: 'rgba(76, 175, 80, 0.15)',
								},
								...animations,
							}}>
							<Typography
								variant="h4"
								fontWeight="bold"
								sx={{
									color: '#4caf50',
									animation: 'float 3s ease-in-out infinite',
									animationDelay: '0.2s',
									...animations,
								}}>
								{bulkStats.match}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: 'rgba(255,255,255,0.5)' }}>
								Matched
							</Typography>
						</Paper>

						{/* Partial Match Card */}
						<Paper
							elevation={0}
							sx={{
								'p': 2,
								'flex': 1,
								'minWidth': { xs: '100%', sm: 150 },
								'textAlign': 'center',
								'bgcolor': 'rgba(255, 152, 0, 0.1)',
								'borderRadius': 2,
								'border': '1px solid rgba(255, 152, 0, 0.3)',
								'transition': 'all 0.3s ease',
								'animation': 'scaleIn 0.3s ease-out 0.1s both',
								'&:hover': {
									transform: 'translateY(-4px)',
									boxShadow: '0 8px 16px rgba(255, 152, 0, 0.2)',
									bgcolor: 'rgba(255, 152, 0, 0.15)',
								},
								...animations,
							}}>
							<Typography
								variant="h4"
								fontWeight="bold"
								sx={{
									color: '#ff9800',
									animation: 'float 3s ease-in-out infinite',
									animationDelay: '0.4s',
									...animations,
								}}>
								{bulkStats.partial}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: 'rgba(255,255,255,0.5)' }}>
								Partial Match
							</Typography>
						</Paper>

						{/* Issues Card */}
						<Paper
							elevation={0}
							sx={{
								'p': 2,
								'flex': 1,
								'minWidth': { xs: '100%', sm: 150 },
								'textAlign': 'center',
								'bgcolor': 'rgba(244, 67, 54, 0.1)',
								'borderRadius': 2,
								'border': '1px solid rgba(244, 67, 54, 0.3)',
								'transition': 'all 0.3s ease',
								'animation': 'scaleIn 0.3s ease-out 0.15s both',
								'&:hover': {
									transform: 'translateY(-4px)',
									boxShadow: '0 8px 16px rgba(244, 67, 54, 0.2)',
									bgcolor: 'rgba(244, 67, 54, 0.15)',
								},
								...animations,
							}}>
							<Typography
								variant="h4"
								fontWeight="bold"
								sx={{
									color: '#f44336',
									animation: 'float 3s ease-in-out infinite',
									animationDelay: '0.6s',
									...animations,
								}}>
								{bulkStats.issues}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: 'rgba(255,255,255,0.5)' }}>
								Issues
							</Typography>
						</Paper>
					</Box>
				)}

				{/* Filter Bar */}
				{validationResults && validationResults.length > 0 && !uploading && (
					<Paper
						elevation={0}
						sx={{
							'p': 2,
							'mt': 3,
							'borderRadius': 2,
							'bgcolor': '#1e293b',
							'border': '1px solid rgba(255,255,255,0.08)',
							'display': 'flex',
							'gap': 2,
							'alignItems': 'center',
							'flexWrap': 'wrap',
							'animation': 'slideInRight 0.4s ease-out',
							'transition': 'all 0.3s ease',
							'&:hover': {
								borderColor: '#2196f3',
							},
							...animations,
						}}>
						<FilterList sx={{ color: 'rgba(255,255,255,0.5)' }} />

						<TextField
							size="small"
							placeholder="Search name, account…"
							value={filterSearch}
							onChange={(e) => {
								setFilterSearch(e.target.value);
								setPage(0);
							}}
							sx={{
								'width': { xs: '100%', sm: 220 },
								'& .MuiOutlinedInput-root': {
									'color': '#fff',
									'& fieldset': {
										borderColor: 'rgba(255,255,255,0.23)',
									},
									'&:hover fieldset': {
										borderColor: 'rgba(255,255,255,0.4)',
									},
								},
								'& .MuiInputLabel-root': {
									color: 'rgba(255,255,255,0.5)',
								},
							}}
						/>

						<FormControl
							size="small"
							sx={{ minWidth: { xs: '100%', sm: 160 } }}>
							<InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Status</InputLabel>
							<Select
								value={filterStatus}
								label="Status"
								onChange={(e) => {
									setFilterStatus(e.target.value);
									setPage(0);
								}}
								sx={{
									'color': '#fff',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.23)',
									},
									'&:hover .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.4)',
									},
									'& .MuiSvgIcon-root': {
										color: 'rgba(255,255,255,0.5)',
									},
								}}>
								<MenuItem value="ALL">All Statuses</MenuItem>
								<MenuItem value="MATCH">Match</MenuItem>
								<MenuItem value="PARTIAL_MATCH">Partial Match</MenuItem>
								<MenuItem value="MISMATCH">Mismatch</MenuItem>
								<MenuItem value="INVALID_ACCOUNT">Invalid Account</MenuItem>
								<MenuItem value="UNKNOWN_BANK">Unknown Bank</MenuItem>
							</Select>
						</FormControl>

						{(filterStatus !== 'ALL' || filterSearch) && (
							<>
								<Chip
									label={`${filteredResults.length} results`}
									size="small"
									sx={{
										bgcolor: '#2196f3',
										color: '#fff',
									}}
								/>
								<Button
									size="small"
									onClick={() => {
										setFilterStatus('ALL');
										setFilterSearch('');
										setPage(0);
									}}
									sx={{
										color: '#fff',
										borderColor: 'rgba(255,255,255,0.3)',
									}}>
									Clear
								</Button>
							</>
						)}
					</Paper>
				)}

				{/* Results Table */}
				{filteredResults.length > 0 && !uploading && (
					<Box sx={{ mt: 3, animation: 'fadeIn 0.6s ease-out', ...animations }}>
						<TableContainer
							component={Paper}
							sx={{
								'bgcolor': '#1e293b',
								'borderRadius': 2,
								'border': '1px solid rgba(255,255,255,0.08)',
								'maxHeight': 500,
								'overflow': 'auto',
								'&::-webkit-scrollbar': {
									width: '8px',
									height: '8px',
								},
								'&::-webkit-scrollbar-track': {
									background: 'rgba(255,255,255,0.05)',
								},
								'&::-webkit-scrollbar-thumb': {
									background: 'rgba(255,255,255,0.2)',
									borderRadius: '4px',
								},
								...animations,
							}}>
							<Table
								size="small"
								stickyHeader>
								<TableHead>
									<TableRow>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>#</TableCell>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>Excel Name</TableCell>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>Account No.</TableCell>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>Verified Name</TableCell>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>Bank</TableCell>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>Bank Code</TableCell>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>Score</TableCell>
										<TableCell sx={{ bgcolor: '#334155', color: '#fff', fontWeight: 600 }}>Status</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{filteredResults.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row, index) => {
										const config = STATUS_CONFIG[row.status] || STATUS_CONFIG.UNKNOWN_BANK;
										const bank = banks.find((b) => b.code === row.bank_code);
										const bankName = bank ? bank.name : row.bank_code || 'Unknown';

										return (
											<TableRow
												key={index}
												hover
												sx={{
													'animation': 'slideInRight 0.3s ease-out',
													'animationDelay': `${index * 0.03}s`,
													'animationFillMode': 'both',
													'&:hover': {
														bgcolor: '#334155',
														transform: 'scale(1.001)',
														transition: 'all 0.2s ease',
													},
													'&:last-child td': { borderBottom: 'none' },
													...animations,
												}}>
												<TableCell sx={{ color: 'rgba(255,255,255,0.7)' }}>{row.row || page * rowsPerPage + index + 1}</TableCell>
												<TableCell sx={{ color: '#fff', fontWeight: 500 }}>{row.excel_name || '—'}</TableCell>
												<TableCell sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>{row.account_no || '—'}</TableCell>
												<TableCell sx={{ color: 'rgba(255,255,255,0.9)' }}>{row.bank_verified_name || '—'}</TableCell>
												<TableCell sx={{ color: 'rgba(255,255,255,0.7)' }}>{bankName}</TableCell>
												<TableCell sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>{row.bank_code || '—'}</TableCell>
												<TableCell>
													<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
														<Box sx={{ width: 50 }}>
															<LinearProgress
																variant="determinate"
																value={row.match_score || 0}
																sx={{
																	'height': 6,
																	'borderRadius': 3,
																	'backgroundColor': 'rgba(255,255,255,0.1)',
																	'& .MuiLinearProgress-bar': {
																		backgroundColor: row.match_score >= 80 ? '#4caf50' : row.match_score >= 50 ? '#ff9800' : '#f44336',
																	},
																}}
															/>
														</Box>
														<Typography
															variant="caption"
															sx={{ color: 'rgba(255,255,255,0.7)', minWidth: 35 }}>
															{row.match_score || 0}%
														</Typography>
													</Box>
												</TableCell>
												<TableCell>
													<Chip
														icon={config.icon}
														label={row.status?.replace(/_/g, ' ') || 'UNKNOWN'}
														size="small"
														sx={{
															'bgcolor':
																row.status === 'MATCH' ? 'rgba(76, 175, 80, 0.1)' : row.status === 'PARTIAL_MATCH' ? 'rgba(255, 152, 0, 0.1)' : 'rgba(244, 67, 54, 0.1)',
															'color': row.status === 'MATCH' ? '#4caf50' : row.status === 'PARTIAL_MATCH' ? '#ff9800' : '#f44336',
															'border': '1px solid',
															'borderColor':
																row.status === 'MATCH' ? 'rgba(76, 175, 80, 0.3)' : row.status === 'PARTIAL_MATCH' ? 'rgba(255, 152, 0, 0.3)' : 'rgba(244, 67, 54, 0.3)',
															'fontWeight': 500,
															'& .MuiChip-icon': {
																color: 'inherit',
															},
														}}
													/>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</TableContainer>

						{/* Pagination */}
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								mt: 2,
								px: 1,
							}}>
							<Typography
								variant="caption"
								sx={{ color: 'rgba(255,255,255,0.5)' }}>
								Showing {Math.min(filteredResults.length, rowsPerPage)} of {filteredResults.length} results
							</Typography>

							<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
								<FormControl
									size="small"
									sx={{ minWidth: 80 }}>
									<Select
										value={rowsPerPage}
										onChange={(e) => {
											setRowsPerPage(parseInt(e.target.value, 10));
											setPage(0);
										}}
										sx={{
											'color': '#fff',
											'height': 32,
											'& .MuiOutlinedInput-notchedOutline': {
												borderColor: 'rgba(255,255,255,0.23)',
											},
										}}>
										<MenuItem value={10}>10</MenuItem>
										<MenuItem value={25}>25</MenuItem>
										<MenuItem value={50}>50</MenuItem>
										<MenuItem value={100}>100</MenuItem>
									</Select>
								</FormControl>

								<IconButton
									size="small"
									onClick={() => setPage(Math.max(0, page - 1))}
									disabled={page === 0}
									sx={{ color: 'rgba(255,255,255,0.5)' }}>
									<ChevronLeft />
								</IconButton>

								<Typography
									variant="caption"
									sx={{ color: '#fff' }}>
									{page + 1} / {Math.ceil(filteredResults.length / rowsPerPage)}
								</Typography>

								<IconButton
									size="small"
									onClick={() => setPage(Math.min(Math.ceil(filteredResults.length / rowsPerPage) - 1, page + 1))}
									disabled={page >= Math.ceil(filteredResults.length / rowsPerPage) - 1}
									sx={{ color: 'rgba(255,255,255,0.5)' }}>
									<ChevronRight />
								</IconButton>
							</Box>
						</Box>
					</Box>
				)}
			</Paper>

			{/* Single Account Verification Section */}
			<Paper
				elevation={0}
				sx={{
					p: 3,
					borderRadius: 2,
					bgcolor: '#0f172a',
					border: '1px solid rgba(255,255,255,0.08)',
					mb: 3,
				}}>
				{/* Section Title */}
				<Typography
					variant="h6"
					fontWeight={600}
					sx={{ color: '#fff', mb: 2 }}>
					Single Account Check
				</Typography>

				<Typography
					variant="body2"
					sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>
					Verify one account without uploading a file.
				</Typography>

				{/* Input Form */}
				<Grid
					container
					spacing={2}
					sx={{ mb: 3, width: '100%' }}>
					<Grid
						item
						size={{ xs: 12, md: 3 }}>
						<TextField
							fullWidth
							label="Full Name"
							value={singleValidation.fullName}
							onChange={handleSingleInputChange('fullName')}
							variant="outlined"
							size="small"
							sx={{
								'& .MuiOutlinedInput-root': {
									'color': '#fff',
									'& fieldset': {
										borderColor: 'rgba(255,255,255,0.23)',
									},
									'&:hover fieldset': {
										borderColor: 'rgba(255,255,255,0.4)',
									},
									'&.Mui-focused fieldset': {
										borderColor: '#2196f3',
									},
								},
								'& .MuiInputLabel-root': {
									color: 'rgba(255,255,255,0.5)',
								},
							}}
						/>
					</Grid>

					<Grid
						item
						size={{ xs: 12, md: 3 }}>
						<TextField
							fullWidth
							label="Account Number"
							value={singleValidation.accountNumber}
							onChange={handleSingleInputChange('accountNumber')}
							variant="outlined"
							size="small"
							sx={{
								'& .MuiOutlinedInput-root': {
									'color': '#fff',
									'& fieldset': {
										borderColor: 'rgba(255,255,255,0.23)',
									},
									'&:hover fieldset': {
										borderColor: 'rgba(255,255,255,0.4)',
									},
									'&.Mui-focused fieldset': {
										borderColor: '#2196f3',
									},
								},
								'& .MuiInputLabel-root': {
									color: 'rgba(255,255,255,0.5)',
								},
							}}
						/>
					</Grid>

					<Grid
						item
						size={{ xs: 12, md: 3 }}>
						{/* <Autocomplete
							fullWidth
							options={BANKS}
							getOptionLabel={(option) => `${option.name} (${option.code})`}
							value={BANKS.find((bank) => bank.code === singleValidation.bank) || null}
							onChange={(event, newValue) => {
								handleSingleInputChange('bank')({
									target: { value: newValue?.code || '' },
								});
							}}
							isOptionEqualToValue={(option, value) => option.code === value.code}
							renderInput={(params) => (
								<TextField
									{...params}
									label="Bank"
									variant="outlined"
									size="small"
									sx={{
										'& .MuiOutlinedInput-root': {
											'color': '#fff',
											'& fieldset': {
												borderColor: 'rgba(255,255,255,0.23)',
											},
											'&:hover fieldset': {
												borderColor: 'rgba(255,255,255,0.4)',
											},
											'&.Mui-focused fieldset': {
												borderColor: '#2196f3',
											},
										},
										'& .MuiInputLabel-root': {
											color: 'rgba(255,255,255,0.5)',
										},
										'& .MuiAutocomplete-popupIndicator': {
											color: 'rgba(255,255,255,0.5)',
										},
										'& .MuiAutocomplete-clearIndicator': {
											color: 'rgba(255,255,255,0.5)',
										},
									}}
								/>
							)}
							ListboxProps={{
								sx: {
									'maxHeight': 250,
									'bgcolor': '#1e293b',
									'& .MuiAutocomplete-option': {
										'color': '#fff',
										'&:hover': {
											bgcolor: 'rgba(33, 150, 243, 0.1)',
										},
										'&[aria-selected="true"]': {
											bgcolor: 'rgba(33, 150, 243, 0.3)',
										},
									},
								},
							}}
							PaperComponent={({ children }) => (
								<Paper
									sx={{
										bgcolor: '#1e293b',
										border: '1px solid rgba(255,255,255,0.08)',
										boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
									}}>
									{children}
								</Paper>
							)}
							noOptionsText={<Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>No banks found</Typography>}
						/> */}

						<Autocomplete
							fullWidth
							options={banks}
							getOptionLabel={(option) => `${option.name} (${option.code})`}
							value={banks.find((bank) => bank.code === singleValidation.bank) || null}
							onChange={(event, newValue) => {
								handleSingleInputChange('bank')({
									target: { value: newValue?.code || '' },
								});
							}}
							loading={banksLoading}
							renderInput={(params) => (
								<TextField
									{...params}
									label="Bank"
									variant="outlined"
									size="small"
									InputProps={{
										...params.InputProps,
										endAdornment: (
											<>
												{banksLoading ? <CircularProgress size={20} /> : null}
												{params.InputProps.endAdornment}
											</>
										),
									}}
									sx={{
										'& .MuiOutlinedInput-root': {
											'color': '#fff',
											'& fieldset': { borderColor: 'rgba(255,255,255,0.23)' },
											'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
										},
										'& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
									}}
								/>
							)}
						/>
					</Grid>

					<Grid
						item
						size={{ xs: 12, md: 3 }}>
						<Stack
							direction="row"
							spacing={2}
							sx={{
								width: '100%',
							}}>
							<Button
								variant="contained"
								onClick={handleValidateSingle}
								disabled={isValidating}
								sx={{
									'bgcolor': '#2196f3',
									'&:hover': { bgcolor: '#1976d2' },
									'textTransform': 'none',
									'fontWeight': 600,
									'flex': 1,
									'minWidth': { xs: 'auto', md: '64px' },
								}}>
								{isValidating ? (
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
										<CircularProgress
											size={20}
											sx={{ color: '#fff' }}
										/>
										{!isMobile && 'Verifying...'}
									</Box>
								) : (
									<>
										<VerifiedIcon sx={{ mr: isMobile ? 0 : 1 }} />
										{!isMobile && 'CHECK'}
									</>
								)}
							</Button>

							<Button
								variant="outlined"
								startIcon={<ClearIcon />}
								onClick={handleClearSingle}
								sx={{
									'borderColor': 'rgba(255,255,255,0.3)',
									'color': '#fff',
									'textTransform': 'none',
									'fontWeight': 600,
									'flex': 1,
									'minWidth': { xs: 'auto', md: '64px' },
									'&:hover': {
										borderColor: 'rgba(255,255,255,0.5)',
										backgroundColor: 'rgba(255,255,255,0.05)',
									},
								}}>
								{isMobile ? '' : 'CLEAR'}
							</Button>
						</Stack>
					</Grid>
				</Grid>

				{/* Single Validation Result */}
				{singleResult && (
					<>
						<Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />

						<Box
							sx={{
								mt: 3,
								animation: 'bounce-in 0.5s ease-out',
								...animations,
							}}>
							<Typography
								variant="subtitle1"
								fontWeight={600}
								sx={{ color: '#fff', mb: 2 }}>
								Verification Result
							</Typography>

							<Grid
								container
								spacing={3}>
								{/* Left Column - Names */}
								<Grid
									item
									size={{ xs: 12, md: 3 }}>
									<Stack spacing={2}>
										<Box>
											<Typography
												variant="caption"
												sx={{ color: 'rgba(255,255,255,0.5)' }}>
												Name in Excel
											</Typography>
											<Typography
												variant="body2"
												sx={{ color: '#fff', fontWeight: 500 }}>
												{singleResult.nameInExcel}
											</Typography>
										</Box>
										<Box>
											<Typography
												variant="caption"
												sx={{ color: 'rgba(255,255,255,0.5)' }}>
												Bank Verified Name
											</Typography>
											<Typography
												variant="body2"
												sx={{ color: '#fff', fontWeight: 500 }}>
												{singleResult.bankVerifiedName}
											</Typography>
										</Box>
									</Stack>
								</Grid>

								{/* Middle Column - Account Details */}
								<Grid
									item
									size={{ xs: 12, md: 3 }}>
									<Stack spacing={2}>
										<Box>
											<Typography
												variant="caption"
												sx={{ color: 'rgba(255,255,255,0.5)' }}>
												Account No.
											</Typography>
											<Typography
												variant="body2"
												sx={{ color: '#fff', fontWeight: 500 }}>
												{singleResult.accountNumber}
											</Typography>
										</Box>
										<Box>
											<Typography
												variant="caption"
												sx={{ color: 'rgba(255,255,255,0.5)' }}>
												Bank Code
											</Typography>
											<Typography
												variant="body2"
												sx={{ color: '#fff', fontWeight: 500 }}>
												{singleResult.bankCode}
											</Typography>
										</Box>
									</Stack>
								</Grid>

								{/* Right Column - Match Score & Status */}
								<Grid
									item
									size={{ xs: 12, md: 3 }}>
									<Stack spacing={2}>
										<Box>
											<Typography
												variant="caption"
												sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>
												Match Score
											</Typography>
											<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
												<Box sx={{ flex: 1 }}>
													<LinearProgress
														variant="determinate"
														value={singleResult.matchScore}
														sx={{
															'height': 8,
															'borderRadius': 4,
															'backgroundColor': 'rgba(255,255,255,0.1)',
															'& .MuiLinearProgress-bar': {
																backgroundColor: singleResult.matchScore >= 80 ? '#4caf50' : '#f44336',
															},
														}}
													/>
												</Box>
												<Typography
													variant="body2"
													sx={{ color: '#fff', minWidth: 45 }}>
													{singleResult.matchScore}%
												</Typography>
											</Box>
										</Box>

										<Box>
											<Typography
												variant="caption"
												sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>
												Status
											</Typography>
											{(() => {
												const config = STATUS_CONFIG[singleResult.status] || STATUS_CONFIG.UNKNOWN_BANK;
												return (
													<Chip
														icon={config.icon}
														label={singleResult.status.replace(/_/g, ' ')}
														sx={{
															'bgcolor':
																singleResult.status === 'MATCH'
																	? 'rgba(76, 175, 80, 0.1)'
																	: singleResult.status === 'PARTIAL_MATCH'
																	? 'rgba(255, 152, 0, 0.1)'
																	: 'rgba(244, 67, 54, 0.1)',
															'color': singleResult.status === 'MATCH' ? '#4caf50' : singleResult.status === 'PARTIAL_MATCH' ? '#ff9800' : '#f44336',
															'border': '1px solid',
															'borderColor':
																singleResult.status === 'MATCH'
																	? 'rgba(76, 175, 80, 0.3)'
																	: singleResult.status === 'PARTIAL_MATCH'
																	? 'rgba(255, 152, 0, 0.3)'
																	: 'rgba(244, 67, 54, 0.3)',
															'fontWeight': 600,
															'& .MuiChip-icon': {
																color: 'inherit',
															},
														}}
													/>
												);
											})()}
										</Box>
									</Stack>
								</Grid>
							</Grid>
						</Box>
					</>
				)}
			</Paper>

			{/* Snackbar for notifications */}
			<Snackbar
				open={snackbar.open}
				autoHideDuration={6000}
				onClose={handleSnackbarClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				sx={{
					'& .MuiAlert-root': {
						animation: 'slideInRight 0.3s ease-out',
						...animations,
					},
				}}>
				<Alert
					onClose={handleSnackbarClose}
					severity={snackbar.severity}
					sx={{ width: '100%' }}>
					{snackbar.message}
				</Alert>
			</Snackbar>

			<PreviewModal
				open={previewOpen}
				onClose={() => setPreviewOpen(false)}
				previewData={previewData}
			/>
		</Box>
	);
}
