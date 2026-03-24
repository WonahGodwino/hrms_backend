import React, { useState, useEffect } from 'react';
import {
	Box,
	Typography,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Button,
	TextField,
	MenuItem,
	Pagination,
	PaginationItem,
	useTheme,
	InputAdornment,
	Avatar,
	Chip,
	Grid,
	CircularProgress,
	Alert,
	FormControlLabel,
	FormControl,
	Switch,
	Checkbox,
	Fab,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Snackbar,
} from '@mui/material';
import { useAuth } from '@/lib/context/AuthContext';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import BusinessIcon from '@mui/icons-material/Business';
import DescriptionIcon from '@mui/icons-material/Description';
import PeopleIcon from '@mui/icons-material/People';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SendIcon from '@mui/icons-material/Send';
import InfoIcon from '@mui/icons-material/Info';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import IconButton from '@mui/material/IconButton';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
// Import services
import { getPayslips, downloadPayslip, sendOutPayslips } from '../../services/PayslipService';
import { getAccessibleCompany } from '../../services/CompanyService';
import PreviewPayslip from '@/pages/payslips/PreviewPayslip';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

const currentYear = new Date().getFullYear();
const YEARS = [currentYear.toString(), (currentYear - 1).toString(), (currentYear - 2).toString()];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const CompanyPayslips = () => {
	const ALL_COMPANIES = 'ALL';
	const theme = useTheme();
	const { user, currentCompany } = useAuth();
	const isDarkMode = theme.palette.mode === 'dark';

	// Initial Filter State
	const currentMonthIndex = new Date().getMonth();
	const currentMonthName = MONTHS[currentMonthIndex];

	// State
	const [loading, setLoading] = useState(true);
	const [payslips, setPayslips] = useState([]);
	const [companies, setCompanies] = useState([]);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [errorMessage, setErrorMessage] = useState('');
	const [isCompanyLoading, setIsCompanyLoading] = useState(true);
	const [isPreviewPDFModalOpen, setIsPreviewPDFModalOpen] = useState(false);

	// Add these with your other state declarations
	const [selectedPayslips, setSelectedPayslips] = useState(new Set()); // For batch selection
	const [summaryData, setSummaryData] = useState({
		totalStaff: 0,
		monthlyGross: 0,
		monthlyNet: 0,
	});
	// Add these with your other state declarations
	const [isSendModalOpen, setIsSendModalOpen] = useState(false);
	const [modalCompanyId, setModalCompanyId] = useState(ALL_COMPANIES);
	const [modalMonth, setModalMonth] = useState(currentMonthName);
	const [modalYear, setModalYear] = useState(currentYear.toString());
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewSummary, setPreviewSummary] = useState(null);

	const [selectedCompanyId, setSelectedCompanyId] = useState(ALL_COMPANIES);
	const [selectedPayslipsData, setSelectedPayslipsData] = useState([]);

	// Filter States
	const [selectedMonth, setSelectedMonth] = useState(currentMonthName);
	const [selectedYear, setSelectedYear] = useState(currentYear.toString());
	const [searchTerm, setSearchTerm] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [onlyMine, setOnlyMine] = useState(false);

	// Pagination State
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const rowsPerPage = 10; // Default limit

	// Add with your other state declarations
	const [snackbar, setSnackbar] = useState({
		open: false,
		message: '',
		severity: 'success', // 'success' | 'error' | 'info' | 'warning'
	});
	const [confirmDialog, setConfirmDialog] = useState({
		open: false,
		selectedIds: [],
		companyId: null,
		companyName: '',
		count: 0,
	});

	// Debounce Search
	useEffect(() => {
		const t = setTimeout(() => {
			setDebouncedSearch(searchTerm);
			setPage(1); // Reset to page 1 on search change
		}, 500);
		return () => clearTimeout(t);
	}, [searchTerm]);

	// Fetch Data
	useEffect(() => {
		const fetchPayslips = async () => {
			setLoading(true);
			let params = {
				page: page,
				limit: rowsPerPage,
				year: selectedYear,
				month: selectedMonth,
			};
			try {
				if (debouncedSearch.length > 0) {
					params.staffId = debouncedSearch;
				}

				if (selectedCompanyId !== ALL_COMPANIES) {
					params.companyId = selectedCompanyId;
				}
				if (onlyMine) {
					params.staffId = user.staffId;
				}

				const response = await getPayslips(params);

				if (response.status === 404) {
					setPayslips([]);
					setTotalPages(1);
					return;
				}

				// The response structure based on your provided JSON is:
				// response.data = { success: true, data: { payslips: [], pagination: {} } }
				if (response.data?.success) {
					const { payslips, pagination } = response.data.data;

					setPayslips(payslips || []);
					setTotalPages(pagination?.totalPages || 1);
				} else {
					setPayslips([]);
					setErrorMessage(response.data.message);
					// If the API returns a success: false with a message, you might want to show it,
					// or just show empty if it's a "no data found" scenario.
				}
			} catch (error) {
				if (error.status === 403) {
					// Check if the error message contains "not assigned to any company"
					const originalMessage = error.response?.data?.message || '';

					if (originalMessage.toLowerCase().includes('not assigned to any company')) {
						setErrorMessage('You have not been assigned to any company yet. Contact Support.');
					} else {
						setErrorMessage(originalMessage || 'Failed to load payslip data.');
					}
				} else if (error.status === 404) {
					return;
				} else {
					setErrorMessage('Failed to load payslip data.');
				}
			} finally {
				setLoading(false);
			}
		};

		const fetchCompanies = async () => {
			setIsCompanyLoading(true);
			try {
				const result = await getAccessibleCompany();

				if (result.data.success) {
					// Transform the API response to match your component's data structure
					const transformedCompanies = result.data.data.map((company) => ({
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
				} else {
					// Handle API error response
					throw new Error(result.message || 'Failed to fetch companies');
				}
			} catch (err) {
				// Show error notification
				setErrorMessage(err.message || 'Failed to load companies');
			} finally {
				setIsCompanyLoading(false);
			}
		};

		fetchCompanies();
		fetchPayslips();
	}, [page, debouncedSearch, selectedMonth, selectedYear, onlyMine, selectedCompanyId]);

	// Calculate summary data from payslips
	useEffect(() => {
		if (payslips.length > 0) {
			const totalStaff = payslips.length;
			const monthlyGross = payslips.reduce((sum, slip) => sum + (Number(slip.grossPay) || 0), 0);
			const monthlyNet = payslips.reduce((sum, slip) => sum + (Number(slip.netPay) || 0), 0);

			setSummaryData({
				totalStaff,
				monthlyGross,
				monthlyNet,
			});
		} else {
			setSummaryData({
				totalStaff: 0,
				monthlyGross: 0,
				monthlyNet: 0,
			});
		}
	}, [payslips]);

	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleDownload = async (id) => {
		try {
			setErrorMessage('');
			const response = await downloadPayslip(id);

			if (response.success) {
				const blobUrl = URL.createObjectURL(response.blob);
				const filename = response.filename || `payslip-${id}.pdf`;

				const link = document.createElement('a');
				link.href = blobUrl;
				link.download = filename;
				link.style.display = 'none';
				document.body.appendChild(link);
				link.click();

				document.body.removeChild(link);
				URL.revokeObjectURL(blobUrl);
			} else {
				setErrorMessage(response.error || 'Failed to download payslip.');
			}
		} catch (error) {
			console.error('Error downloading payslip:', error);
			setErrorMessage('An unexpected error occurred during download.');
		}
	};

	// Mock function to preview payslip summary
	const handlePreviewSummary = async () => {
		setPreviewLoading(true);
		setErrorMessage('');

		try {
			// Mock API call - replace with actual API
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Mock response data
			const mockSummary = {
				totalStaff: Math.floor(Math.random() * 50) + 80, // 80-130
				monthlyGross: Math.floor(Math.random() * 100000) + 150000, // 150k-250k
				monthlyNet: Math.floor(Math.random() * 80000) + 120000, // 120k-200k
			};

			setPreviewSummary(mockSummary);
		} catch (error) {
			setErrorMessage('Failed to fetch summary data');
		} finally {
			setPreviewLoading(false);
		}
	};

	// Function to handle sending payslips from modal
	const handleModalSendPayslips = async () => {
		try {
			setLoading(true);
			setErrorMessage('');

			const payload = {
				month: modalMonth,
				year: modalYear,
				companyId: modalCompanyId !== ALL_COMPANIES ? modalCompanyId : null,
			};

			// Mock API call - replace with actual
			await new Promise((resolve) => setTimeout(resolve, 1500));

			// Close modal and show success
			setIsSendModalOpen(false);
			// Reset preview
			setPreviewSummary(null);
			setModalCompanyId(ALL_COMPANIES);
			setModalMonth(currentMonthName);
			setModalYear(currentYear.toString());

			// Show success message (you might want to add a snackbar)
			console.log('Payslips sent successfully!');
		} catch (error) {
			setErrorMessage('Failed to send payslips');
		} finally {
			setLoading(false);
		}
	};

	// Reset modal when closed
	const handleCloseModal = () => {
		setIsSendModalOpen(false);
		setPreviewSummary(null);
		// Reset to current filter values or defaults
		setModalCompanyId(ALL_COMPANIES);
		setModalMonth(currentMonthName);
		setModalYear(currentYear.toString());
	};

	// New function to handle batch download of selected payslips
	const handleBatchDownload = async () => {
		if (selectedPayslips.size === 0) {
			setErrorMessage('Please select at least one payslip to download.');
			return;
		}

		try {
			setLoading(true);
			setErrorMessage('');

			// Convert Set to Array of IDs
			const selectedIds = Array.from(selectedPayslips);

			// Call API to download batch
			// const response = await downloadBatchPayslips(selectedIds); // You'll need to implement this API

			// if (response.success) {
			//     const blobUrl = URL.createObjectURL(response.blob);
			//     const filename = response.filename || `payslips-batch-${selectedMonth}-${selectedYear}.xlsx`;

			//     const link = document.createElement('a');
			//     link.href = blobUrl;
			//     link.download = filename;
			//     link.style.display = 'none';
			//     document.body.appendChild(link);
			//     link.click();

			//     document.body.removeChild(link);
			//     URL.revokeObjectURL(blobUrl);

			//     // Clear selection after successful download
			//     setSelectedPayslips(new Set());
			//	  setSelectedPayslipsData([]);
			// } else {
			//     setErrorMessage(response.error || 'Failed to download batch payslips.');
			// }
		} catch (error) {
			console.error('Error downloading batch payslips:', error);
			setErrorMessage('An unexpected error occurred during batch download.');
		} finally {
			setLoading(false);
		}
	};

	// Function to handle sending selected payslips
	const handleBatchSend = async () => {
		if (selectedPayslips.size === 0) {
			setSnackbar({
				open: true,
				message: 'Please select at least one payslip to send.',
				severity: 'warning',
			});
			return;
		}

		// Convert Set to Array of IDs
		const selectedIds = Array.from(selectedPayslips);

		// Get the selected payslip objects from the payslips array
		const selectedPayslipObjects = payslips.filter((slip) => selectedIds.includes(slip.id));

		// Check if all selected payslips belong to the same company
		const companyIds = [...new Set(selectedPayslipObjects.map((slip) => slip.companyId))];

		if (companyIds.length > 1) {
			setSnackbar({
				open: true,
				message: 'All selected payslips must belong to the same company. Please select payslips from only one company.',
				severity: 'error',
			});
			return;
		}

		// If no company ID found (shouldn't happen, but just in case)
		if (companyIds.length === 0 || !companyIds[0]) {
			setSnackbar({
				open: true,
				message: 'Unable to determine company for selected payslips.',
				severity: 'error',
			});
			return;
		}

		const companyId = companyIds[0];

		// Find company name
		const company = companies.find((c) => c.id === companyId);
		const companyName = company?.name || 'Unknown Company';

		// Open confirmation modal instead of window.confirm
		setConfirmDialog({
			open: true,
			selectedIds: selectedIds,
			companyId: companyId,
			companyName: companyName,
			count: selectedIds.length,
		});
	};

	// New function to process the actual send after confirmation
	const processBatchSend = async (selectedIds, companyId) => {
		try {
			setLoading(true);
			setErrorMessage('');

			// Call the API to send selected payslips
			const response = await sendOutPayslips({
				companyId: companyId,
				payslipIds: selectedIds,
			});

			// Check if the request was successful
			if (response.data?.success) {
				setSnackbar({
					open: true,
					message: `Successfully sent ${selectedIds.length} payslip(s)`,
					severity: 'success',
				});

				// Clear selection after successful send
				setSelectedPayslips(new Set());
				setSelectedPayslipsData([]);
				// Optionally refresh the data
				setPage(1); // This will trigger the useEffect to refetch data
			} else {
				setSnackbar({
					open: true,
					message: response.data?.message || 'Failed to send selected payslips.',
					severity: 'error',
				});
			}
		} catch (error) {
			console.error('Error sending payslips:', error);

			let errorMsg = 'An unexpected error occurred while sending payslips. Please try again.';
			if (error.response?.status === 403) {
				errorMsg = 'You do not have permission to send payslips for this company.';
			} else if (error.response?.status === 400) {
				errorMsg = error.response?.data?.message || 'Invalid request. Please check your selection.';
			}

			setSnackbar({
				open: true,
				message: errorMsg,
				severity: 'error',
			});
		} finally {
			setLoading(false);
		}
	};

	// New function to handle sending payslips for the month
	const handleSendPayslips = async () => {
		try {
			setLoading(true);
			setErrorMessage('');

			const payload = {
				month: selectedMonth,
				year: selectedYear,
				companyId: selectedCompanyId !== ALL_COMPANIES ? selectedCompanyId : null,
			};

			// const response = await sendPayslips(payload); // You'll need to implement this API

			// if (response.success) {
			//     // Show success message
			//     console.log('Payslips sent successfully');
			// } else {
			//     setErrorMessage(response.error || 'Failed to send payslips.');
			// }
		} catch (error) {
			console.error('Error sending payslips:', error);
			setErrorMessage('An unexpected error occurred while sending payslips.');
		} finally {
			setLoading(false);
		}
	};

	// Function to handle selection of individual payslip
	// const handleSelectPayslip = (id) => {
	// 	const newSelection = new Set(selectedPayslips);
	// 	if (newSelection.has(id)) {
	// 		newSelection.delete(id);
	// 	} else {
	// 		newSelection.add(id);
	// 	}
	// 	setSelectedPayslips(newSelection);
	// };
	// Function to handle selection of individual payslip
	const handleSelectPayslip = (id) => {
		const newSelection = new Set(selectedPayslips);
		const newSelectionData = [...selectedPayslipsData];

		// Find the full payslip object from current results
		const selectedPayslip = payslips.find((slip) => slip.id === id);

		if (newSelection.has(id)) {
			// Deselect
			newSelection.delete(id);
			// Remove from full data
			const index = newSelectionData.findIndex((item) => item.id === id);
			if (index !== -1) {
				newSelectionData.splice(index, 1);
			}
		} else {
			// Select - only add if we found the object
			newSelection.add(id);
			if (selectedPayslip && !newSelectionData.some((item) => item.id === id)) {
				newSelectionData.push(selectedPayslip);
			}
		}

		setSelectedPayslips(newSelection);
		setSelectedPayslipsData(newSelectionData);
	};

	// Function to handle select all
	const handleSelectAll = () => {
		if (selectedPayslips.size === payslips.length) {
			// Deselect all current page items
			const currentIds = new Set(payslips.map((slip) => slip.id));
			const newSelection = new Set(Array.from(selectedPayslips).filter((id) => !currentIds.has(id)));
			const newSelectionData = selectedPayslipsData.filter((item) => !currentIds.has(item.id));

			setSelectedPayslips(newSelection);
			setSelectedPayslipsData(newSelectionData);
		} else {
			// Select all current page items
			const newSelection = new Set(selectedPayslips);
			const newSelectionData = [...selectedPayslipsData];

			payslips.forEach((slip) => {
				if (!newSelection.has(slip.id)) {
					newSelection.add(slip.id);
					newSelectionData.push(slip);
				}
			});

			setSelectedPayslips(newSelection);
			setSelectedPayslipsData(newSelectionData);
		}
	};

	// Function to handle select all
	// const handleSelectAll = () => {
	// 	if (selectedPayslips.size === payslips.length) {
	// 		// Deselect all
	// 		setSelectedPayslips(new Set());
	// 	} else {
	// 		// Select all
	// 		const allIds = payslips.map((slip) => slip.id);
	// 		setSelectedPayslips(new Set(allIds));
	// 	}
	// };

	const handlePreview = async (id) => {
		try {
			setErrorMessage('');

			// Revoke previous preview if it exists
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				setPreviewUrl(null);
			}

			const response = await downloadPayslip(id);

			if (!response.success) {
				setErrorMessage(response.error || 'Failed to fetch payslip.');
				return;
			}

			const url = URL.createObjectURL(response.blob);
			setPreviewUrl(url);
		} catch (error) {
			console.error('Error previewing payslip:', error);
			setErrorMessage('An unexpected error occurred during preview.');
		}
	};

	const getInitials = (name) => {
		if (!name) return 'EMP';
		const parts = name.split(' ');
		if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
		return name.slice(0, 2).toUpperCase();
	};

	const getDepartmentColor = (dept) => {
		if (!dept) return 'default';
		const d = dept.toLowerCase();
		if (d.includes('engineer') || d.includes('dev')) return 'primary';
		if (d.includes('hr') || d.includes('human')) return 'success';
		if (d.includes('sales')) return 'secondary';
		if (d.includes('marketing')) return 'warning';
		return 'default';
	};

	const pageAnimations = {
		'@keyframes fadeIn': {
			'0%': { opacity: 0 },
			'100%': { opacity: 1 },
		},
		'@keyframes slideInUp': {
			'0%': {
				transform: 'translateY(30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInDown': {
			'0%': {
				transform: 'translateY(-30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
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
		'@keyframes shimmer': {
			'0%': { backgroundPosition: '-1000px 0' },
			'100%': { backgroundPosition: '1000px 0' },
		},
		'@keyframes bounce': {
			'0%, 100%': { transform: 'translateY(0)' },
			'50%': { transform: 'translateY(-8px)' },
		},
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0.4)' },
			'70%': { boxShadow: '0 0 0 10px rgba(19, 127, 236, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0)' },
		},
		'@keyframes rowEnter': {
			'0%': {
				transform: 'translateX(-10px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
	};

	return (
		<Box
			sx={{
				minHeight: '100vh',
				width: '100%',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				p: { xs: 2, sm: 3, lg: 4 },
				backgroundColor: isDarkMode ? '#0f172a' : '#f6f7f8',
				fontFamily: '"Inter", sans-serif',
				animation: 'fadeIn 0.5s ease-out',
				...pageAnimations,
			}}>
			<Box
				sx={{
					width: '100%',
					maxWidth: '1280px',
					display: 'flex',
					flexDirection: 'column',
					gap: 4,
				}}>
				{/* Header with slide in animation */}
				<Box
					sx={{
						animation: 'slideInDown 0.5s ease-out',
						...pageAnimations,
					}}>
					<Typography
						variant="h4"
						component="h1"
						sx={{
							'fontWeight': 700,
							'fontSize': { xs: '1.875rem', md: '2.25rem' },
							'color': isDarkMode ? '#ffffff' : '#0f172a',
							'letterSpacing': '-0.025em',
							'mb': 1,
							'position': 'relative',
							'display': 'inline-block',
							'&::after': {
								content: '""',
								position: 'absolute',
								bottom: -8,
								left: 0,
								width: '60px',
								height: '4px',
							},
						}}>
						Company Payslips
					</Typography>
					<Typography
						variant="body1"
						sx={{
							color: isDarkMode ? '#94a3b8' : '#64748b',
							fontSize: '1.125rem',
							maxWidth: '600px',
							animation: 'slideInLeft 0.5s ease-out 0.1s both',
							...pageAnimations,
						}}>
						View, filter, and download payslips across your organization.
					</Typography>
				</Box>

				{errorMessage && (
					<Alert
						severity="error"
						onClose={() => setErrorMessage('')}
						sx={{
							'animation': 'shake 0.3s ease-out',
							'@keyframes shake': {
								'0%, 100%': { transform: 'translateX(0)' },
								'25%': { transform: 'translateX(-5px)' },
								'75%': { transform: 'translateX(5px)' },
							},
							...pageAnimations,
						}}>
						{errorMessage}
					</Alert>
				)}

				{/* Filter Toolbar with scale animation */}
				<Paper
					elevation={0}
					sx={{
						'p': 3,
						'borderRadius': 3,
						'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						'bgcolor': isDarkMode ? '#0f172a' : '#ffffff',
						'boxShadow': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
						'animation': 'scaleIn 0.4s ease-out 0.2s both',
						'transition': 'all 0.3s ease',
						'&:hover': {
							transform: 'translateY(-2px)',
							boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
						},
						...pageAnimations,
					}}>
					<Grid
						container
						spacing={2}
						alignItems="flex-end">
						{/* Search */}
						<Grid
							item
							size={{ xs: 12, sm: 6, lg: 3 }}
							sx={{
								animation: 'slideInLeft 0.4s ease-out',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								sx={{
									fontWeight: 600,
									color: isDarkMode ? '#94a3b8' : '#64748b',
									textTransform: 'uppercase',
									display: 'block',
									mb: 0.5,
								}}>
								Staff Search
							</Typography>
							<TextField
								fullWidth
								size="small"
								placeholder="Search by staff name or ID"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								sx={{
									'bgcolor': isDarkMode ? '#0f172a' : '#f8fafc',
									'transition': 'all 0.2s ease',
									'&:hover': {
										transform: 'scale(1.01)',
									},
									'& .MuiOutlinedInput-root': {
										'transition': 'all 0.2s ease',
										'&.Mui-focused': {
											animation: 'pulse-glow 1.5s infinite',
											...pageAnimations,
										},
									},
								}}
								InputProps={{
									startAdornment: (
										<InputAdornment position="start">
											<SearchIcon
												sx={{
													color: isDarkMode ? '#64748b' : '#94a3b8',
													transition: 'transform 0.2s ease',
												}}
											/>
										</InputAdornment>
									),
								}}
							/>
						</Grid>

						{/* Month */}
						<Grid
							item
							size={{ xs: 12, sm: 6, lg: 2 }}
							sx={{
								animation: 'slideInLeft 0.4s ease-out 0.05s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								sx={{
									fontWeight: 600,
									color: isDarkMode ? '#94a3b8' : '#64748b',
									textTransform: 'uppercase',
									display: 'block',
									mb: 0.5,
								}}>
								Month
							</Typography>
							<TextField
								select
								fullWidth
								size="small"
								value={selectedMonth}
								onChange={(e) => {
									setSelectedMonth(e.target.value);
									setPage(1);
								}}
								sx={{
									'bgcolor': isDarkMode ? '#0f172a' : '#f8fafc',
									'transition': 'all 0.2s ease',
									'&:hover': {
										transform: 'scale(1.01)',
									},
								}}>
								{MONTHS.map((opt) => (
									<MenuItem
										key={opt}
										value={opt}>
										{opt}
									</MenuItem>
								))}
							</TextField>
						</Grid>

						{/* Year */}
						<Grid
							item
							size={{ xs: 12, sm: 6, lg: 2 }}
							sx={{
								animation: 'slideInLeft 0.4s ease-out 0.1s both',
								...pageAnimations,
							}}>
							<Typography
								variant="caption"
								sx={{
									fontWeight: 600,
									color: isDarkMode ? '#94a3b8' : '#64748b',
									textTransform: 'uppercase',
									display: 'block',
									mb: 0.5,
								}}>
								Year
							</Typography>
							<TextField
								select
								fullWidth
								size="small"
								value={selectedYear}
								onChange={(e) => {
									setSelectedYear(e.target.value);
									setPage(1);
								}}
								sx={{
									'bgcolor': isDarkMode ? '#0f172a' : '#f8fafc',
									'transition': 'all 0.2s ease',
									'&:hover': {
										transform: 'scale(1.01)',
									},
								}}>
								{YEARS.map((opt) => (
									<MenuItem
										key={opt}
										value={opt}>
										{opt}
									</MenuItem>
								))}
							</TextField>
						</Grid>

						{/* Company */}
						{(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
							<Grid
								item
								size={{ xs: 12, sm: 6, lg: 2 }}
								sx={{
									animation: 'slideInLeft 0.4s ease-out 0.15s both',
									...pageAnimations,
								}}>
								<Typography
									variant="caption"
									sx={{
										fontWeight: 600,
										color: isDarkMode ? '#94a3b8' : '#64748b',
										textTransform: 'uppercase',
										display: 'block',
										mb: 0.5,
									}}>
									Company
								</Typography>

								<TextField
									select
									fullWidth
									size="small"
									value={selectedCompanyId === '' ? ALL_COMPANIES : selectedCompanyId}
									onChange={(e) => {
										setSelectedCompanyId(e.target.value);
										setPage(1);
									}}
									disabled={loading || isCompanyLoading}
									sx={{
										'bgcolor': isDarkMode ? '#0f172a' : '#f8fafc',
										'transition': 'all 0.2s ease',
										'&:hover:not(.Mui-disabled)': {
											transform: 'scale(1.01)',
										},
									}}
									InputProps={{
										endAdornment: isCompanyLoading ? (
											<InputAdornment position="end">
												<CircularProgress
													size={18}
													sx={{
														'animation': 'spin 1s linear infinite',
														'@keyframes spin': {
															'0%': { transform: 'rotate(0deg)' },
															'100%': { transform: 'rotate(360deg)' },
														},
														...pageAnimations,
													}}
												/>
											</InputAdornment>
										) : null,
									}}>
									<MenuItem value={ALL_COMPANIES}>{isCompanyLoading ? 'Loading companies…' : 'All companies'}</MenuItem>

									{companies.map((company) => (
										<MenuItem
											key={company.id}
											value={company.id}>
											{company.name}
										</MenuItem>
									))}
								</TextField>
							</Grid>
						)}

						{/* Toggle by staffId */}
						<Grid
							item
							size={{ xs: 12, lg: 3 }}
							sx={{
								animation: 'slideInRight 0.4s ease-out 0.2s both',
								...pageAnimations,
							}}>
							<FormControlLabel
								control={
									<Switch
										checked={onlyMine}
										onChange={(e) => {
											const checked = e.target.checked;
											setOnlyMine(checked);
											setPage(1);
											if (checked) {
												setSelectedCompanyId('');
											}
										}}
										color="primary"
										sx={{
											'& .MuiSwitch-switchBase': {
												transition: 'transform 0.2s ease',
											},
											'& .MuiSwitch-switchBase.Mui-checked': {
												transform: 'translateX(20px) scale(1.1)',
											},
										}}
									/>
								}
								label="PaySlip Uploaded by Me"
								sx={{
									'& .MuiFormControlLabel-label': {
										color: isDarkMode ? '#fff' : '#0f172a',
									},
								}}
							/>
						</Grid>
					</Grid>
				</Paper>

				{/* Batch Selection Bar */}
				{selectedPayslips.size > 0 && (
					<Paper
						elevation={0}
						sx={{
							p: 2,
							borderRadius: 2,
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? '#1e293b' : '#ffffff',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							animation: 'slideInUp 0.3s ease-out',
							transformOrigin: 'top',
							...pageAnimations,
						}}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<Checkbox
								checked={selectedPayslips.size === payslips.length}
								indeterminate={selectedPayslips.size > 0 && selectedPayslips.size < payslips.length}
								onChange={handleSelectAll}
								sx={{
									'color': isDarkMode ? '#94a3b8' : '#64748b',
									'&.Mui-checked': {
										color: '#137fec',
									},
									'transition': 'transform 0.2s ease',
									'&:hover': {
										transform: 'scale(1.1)',
									},
								}}
							/>
							<Typography
								variant="body2"
								sx={{
									color: isDarkMode ? '#e2e8f0' : '#1e293b',
									fontWeight: 500,
								}}>
								{selectedPayslips.size} selected
							</Typography>

							{/* Cancel Selection Button - Added here */}
							<Button
								variant="text"
								size="small"
								startIcon={<CloseIcon sx={{ fontSize: 18 }} />}
								onClick={() => {
									setSelectedPayslips(new Set());
									setSelectedPayslipsData([]);
								}}
								sx={{
									'ml': 2,
									'color': isDarkMode ? '#ef4444' : '#dc2626',
									'textTransform': 'none',
									'fontWeight': 500,
									'borderRadius': 2,
									'px': 1.5,
									'py': 0.5,
									'minWidth': 'auto',
									'transition': 'all 0.2s ease',
									'&:hover': {
										'backgroundColor': isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(220, 38, 38, 0.1)',
										'transform': 'scale(1.05)',
										'& .MuiSvgIcon-root': {
											transform: 'rotate(90deg)',
										},
									},
									'& .MuiSvgIcon-root': {
										transition: 'transform 0.3s ease',
									},
								}}>
								Clear all
							</Button>
						</Box>

						<Box sx={{ display: 'flex', gap: 2 }}>
							<Button
								variant="outlined"
								startIcon={<DownloadIcon sx={{ transition: 'transform 0.2s ease' }} />}
								onClick={handleBatchDownload}
								disabled={loading}
								sx={{
									'borderColor': isDarkMode ? '#334155' : '#e2e8f0',
									'color': isDarkMode ? '#fff' : '#0f172a',
									'textTransform': 'none',
									'fontWeight': 600,
									'borderRadius': 2,
									'transition': 'all 0.3s ease',
									'&:hover': {
										'borderColor': '#137fec',
										'backgroundColor': 'rgba(19, 127, 236, 0.1)',
										'transform': 'scale(1.02)',
										'& .MuiSvgIcon-root': {
											transform: 'translateY(-2px)',
										},
									},
								}}>
								Download ({selectedPayslips.size})
							</Button>

							<Button
								variant="contained"
								startIcon={<SendIcon sx={{ transition: 'transform 0.2s ease' }} />}
								onClick={handleBatchSend}
								disabled={loading}
								sx={{
									'bgcolor': '#137fec',
									'transition': 'all 0.3s ease',
									'position': 'relative',
									'overflow': 'hidden',
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
										'bgcolor': '#1170d0',
										'transform': 'scale(1.02)',
										'& .MuiSvgIcon-root': {
											transform: 'translateY(-2px)',
										},
										'&::before': {
											width: '200px',
											height: '200px',
										},
									},
									'&:disabled': {
										bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
									},
									'textTransform': 'none',
									'fontWeight': 600,
									'borderRadius': 2,
								}}>
								Send ({selectedPayslips.size})
							</Button>
						</Box>
					</Paper>
				)}

				{/* Main Data Table */}
				<Paper
					elevation={0}
					sx={{
						borderRadius: 3,
						border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						bgcolor: isDarkMode ? '#1e2b38' : '#ffffff',
						overflow: 'hidden',
						boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
						animation: 'slideInUp 0.5s ease-out 0.3s both',
						...pageAnimations,
					}}>
					<TableContainer>
						<Table sx={{ minWidth: 1000 }}>
							<TableHead>
								<TableRow
									sx={{
										bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
										borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									<TableCell
										sx={{
											py: 2,
											px: 3,
											width: '48px',
											borderBottom: 'none',
										}}>
										<Checkbox
											checked={selectedPayslips.size === payslips.length && payslips.length > 0}
											indeterminate={selectedPayslips.size > 0 && selectedPayslips.size < payslips.length}
											onChange={handleSelectAll}
											sx={{
												'color': isDarkMode ? '#94a3b8' : '#64748b',
												'&.Mui-checked': {
													color: '#137fec',
												},
												'transition': 'transform 0.2s ease',
												'&:hover': {
													transform: 'scale(1.1)',
												},
											}}
										/>
									</TableCell>

									{['Staff Name', 'Staff ID', 'Department', 'Position', 'Month / Year', 'Gross Pay', 'Net Pay', 'Generated', 'Actions'].map((head, index) => (
										<TableCell
											key={head}
											align={index >= 5 && index <= 7 ? 'right' : index === 8 ? 'center' : 'left'}
											sx={{
												py: 2,
												px: 3,
												fontWeight: 700,
												fontSize: '0.75rem',
												textTransform: 'uppercase',
												color: isDarkMode ? '#94a3b8' : '#64748b',
												borderBottom: 'none',
												animation: `slideInDown 0.3s ease-out ${index * 0.05}s both`,
												...(index === 8 && {
													position: 'sticky',
													right: 0,
													bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
													zIndex: 1,
													boxShadow: isDarkMode ? '-5px 0 10px -5px rgba(0,0,0,0.3)' : '-5px 0 10px -5px rgba(0,0,0,0.05)',
												}),
												...pageAnimations,
											}}>
											{head}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell
											colSpan={10}
											align="center"
											sx={{ py: 8 }}>
											<CircularProgress
												size={40}
												sx={{
													'animation': 'spin 1s linear infinite, pulse-glow 1.5s infinite',
													'@keyframes spin': {
														'0%': { transform: 'rotate(0deg)' },
														'100%': { transform: 'rotate(360deg)' },
													},
													...pageAnimations,
												}}
											/>
											<Typography
												variant="body2"
												sx={{ mt: 2, color: 'text.secondary' }}>
												Loading data...
											</Typography>
										</TableCell>
									</TableRow>
								) : payslips.length > 0 ? (
									payslips.map((row, index) => {
										const staff = row.staffRecord || {};
										const initials = getInitials(staff.name || 'Unknown');

										return (
											<TableRow
												key={row.id}
												sx={{
													'&:hover': {
														bgcolor: isDarkMode ? '#334155' : '#f8fafc',
														transform: 'scale(1.001)',
													},
													'borderBottom': `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`,
													'transition': 'all 0.2s ease',
													'bgcolor': selectedPayslips.has(row.id) ? (isDarkMode ? '#334155' : '#f8fafc') : 'inherit',
													'animation': `rowEnter 0.3s ease-out ${index * 0.03}s both`,
													...pageAnimations,
												}}>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', width: '48px' }}>
													<Checkbox
														checked={selectedPayslips.has(row.id)}
														onChange={() => handleSelectPayslip(row.id)}
														sx={{
															'color': isDarkMode ? '#94a3b8' : '#64748b',
															'&.Mui-checked': {
																color: '#137fec',
															},
															'transition': 'transform 0.2s ease',
															'&:hover': {
																transform: 'scale(1.1)',
															},
														}}
													/>
												</TableCell>

												{/* Staff Name */}
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<Box
														sx={{
															display: 'flex',
															alignItems: 'center',
															gap: 1.5,
														}}>
														<Avatar
															sx={{
																'width': 36,
																'height': 36,
																'fontSize': '0.75rem',
																'fontWeight': 700,
																'bgcolor': isDarkMode ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe',
																'color': isDarkMode ? '#93c5fd' : '#2563eb',
																'transition': 'transform 0.2s ease',
																'&:hover': {
																	transform: 'scale(1.1)',
																},
															}}>
															{initials}
														</Avatar>
														<Box>
															<Typography
																variant="body2"
																sx={{
																	fontWeight: 600,
																	color: isDarkMode ? '#fff' : '#0f172a',
																}}>
																{staff.name || 'Unknown'}
															</Typography>
															<Typography
																variant="caption"
																sx={{
																	color: isDarkMode ? '#94a3b8' : '#64748b',
																}}>
																{staff.email || 'No email'}
															</Typography>
														</Box>
													</Box>
												</TableCell>

												{/* Staff ID */}
												<TableCell
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														color: isDarkMode ? '#cbd5e1' : '#475569',
														fontFamily: 'monospace',
													}}>
													{staff.staffId || '-'}
												</TableCell>

												{/* Department */}
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<Chip
														label={staff.department || 'N/A'}
														size="small"
														color={getDepartmentColor(staff.department)}
														variant={isDarkMode ? 'outlined' : 'filled'}
														sx={{
															'height': 24,
															'fontSize': '0.75rem',
															'fontWeight': 500,
															'transition': 'all 0.2s ease',
															'&:hover': {
																transform: 'scale(1.05)',
															},
															...(isDarkMode && {
																bgcolor: 'rgba(51, 65, 85, 0.5)',
																border: 'none',
																color: '#cbd5e1',
															}),
															...(!isDarkMode && {
																bgcolor: '#f1f5f9',
																color: '#1e293b',
															}),
														}}
													/>
												</TableCell>

												{/* Position */}
												<TableCell
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														color: isDarkMode ? '#cbd5e1' : '#475569',
														fontSize: '0.875rem',
													}}>
													{staff.position || '-'}
												</TableCell>

												{/* Month/Year */}
												<TableCell
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														color: isDarkMode ? '#cbd5e1' : '#475569',
														fontSize: '0.875rem',
													}}>
													{row.month} {row.year}
												</TableCell>

												{/* Gross */}
												<TableCell
													align="right"
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														color: isDarkMode ? '#cbd5e1' : '#475569',
														fontSize: '0.875rem',
														fontWeight: 500,
													}}>
													{Number(row.grossPay).toLocaleString(undefined, {
														minimumFractionDigits: 2,
													})}
												</TableCell>

												{/* Net */}
												<TableCell
													align="right"
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														color: isDarkMode ? '#fff' : '#0f172a',
														fontSize: '0.875rem',
														fontWeight: 700,
													}}>
													{Number(row.netPay).toLocaleString(undefined, {
														minimumFractionDigits: 2,
													})}
												</TableCell>

												{/* Generated */}
												<TableCell
													align="right"
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														color: isDarkMode ? '#94a3b8' : '#64748b',
														fontSize: '0.875rem',
														whiteSpace: 'nowrap',
													}}>
													{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-'}
												</TableCell>

												{/* Actions */}
												<TableCell
													align="center"
													sx={{
														py: 2,
														px: 3,
														borderBottom: 'none',
														position: 'sticky',
														right: 0,
														bgcolor: isDarkMode ? '#1e2b38' : '#fff',
														zIndex: 1,
													}}>
													<Box
														sx={{
															display: 'flex',
															alignItems: 'center',
															justifyContent: 'center',
															gap: 1,
														}}>
														<Button
															startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 20, transition: 'transform 0.2s ease' }} />}
															sx={{
																'fontSize': '0.875rem',
																'fontWeight': 500,
																'textTransform': 'none',
																'color': '#137fec',
																'px': 2,
																'py': 0.75,
																'borderRadius': 1.5,
																'transition': 'all 0.2s ease',
																'&:hover': {
																	'bgcolor': 'rgba(19, 127, 236, 0.1)',
																	'transform': 'scale(1.05)',
																	'& .MuiSvgIcon-root': {
																		transform: 'scale(1.1)',
																	},
																},
															}}
															onClick={async () => {
																console.log(row.id);
																await handlePreview(row.id);
																setIsPreviewPDFModalOpen(true);
															}}>
															View
														</Button>

														<Box
															component="button"
															onClick={() => handleDownload(row.id)}
															sx={{
																'width': 32,
																'height': 32,
																'borderRadius': '50%',
																'display': 'flex',
																'alignItems': 'center',
																'justifyContent': 'center',
																'border': 'none',
																'bgcolor': 'transparent',
																'color': '#94a3b8',
																'cursor': 'pointer',
																'transition': 'all 0.2s',
																'&:hover': {
																	bgcolor: 'rgba(19, 127, 236, 0.1)',
																	color: '#137fec',
																	transform: 'scale(1.1) rotate(5deg)',
																},
															}}>
															<DownloadIcon sx={{ fontSize: 20 }} />
														</Box>
													</Box>
												</TableCell>
											</TableRow>
										);
									})
								) : (
									<TableRow>
										<TableCell
											colSpan={9}
											align="center"
											sx={{ py: 8 }}>
											<Typography
												variant="body1"
												color="text.secondary">
												No payslips found matching your filters.
											</Typography>
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{/* Pagination */}
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							p: 2,
							borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
							animation: 'fadeIn 0.3s ease-out',
							...pageAnimations,
						}}>
						<Pagination
							count={totalPages}
							page={page}
							onChange={handlePageChange}
							renderItem={(item) => (
								<PaginationItem
									slots={{
										previous: ChevronLeftIcon,
										next: ChevronRightIcon,
									}}
									{...item}
									sx={{
										'borderRadius': 2,
										'width': 32,
										'height': 32,
										'margin': '0 2px',
										'color': isDarkMode ? '#94a3b8' : '#475569',
										'fontSize': '0.875rem',
										'fontWeight': 500,
										'transition': 'all 0.2s ease',
										'&.Mui-selected': {
											'backgroundColor': '#137fec',
											'color': '#ffffff',
											'fontWeight': 700,
											'animation': 'pulse-glow 2s infinite',
											'&:hover': {
												backgroundColor: '#1170d0',
											},
										},
										'&:hover': {
											backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
											transform: 'scale(1.1)',
										},
									}}
								/>
							)}
						/>
					</Box>
				</Paper>
			</Box>

			<PreviewPayslip
				open={isPreviewPDFModalOpen}
				previewUrl={previewUrl}
				isDarkMode={isDarkMode}
				onClose={() => {
					setIsPreviewPDFModalOpen(false);
					if (previewUrl) {
						URL.revokeObjectURL(previewUrl);
						setPreviewUrl(null);
					}
				}}
			/>

			{/* FAB - Send Payslips */}
			<Fab
				variant="extended"
				color="primary"
				aria-label="send payslips"
				onClick={() => setIsSendModalOpen(true)}
				sx={{
					'position': 'fixed',
					'bottom': 24,
					'right': 24,
					'bgcolor': '#137fec',
					'&:hover': {
						bgcolor: '#1170d0',
						transform: 'scale(1.05)',
					},
					'boxShadow': '0 8px 16px rgba(19, 127, 236, 0.3)',
					'animation': 'bounce 2s infinite',
					'transition': 'all 0.3s ease',
					'zIndex': 1000,
					...pageAnimations,
				}}>
				<SendIcon sx={{ mr: 1, transition: 'transform 0.2s ease' }} />
				Send Out Payslips
			</Fab>

			{/* Send Payslips Modal */}
			<Dialog
				open={isSendModalOpen}
				onClose={handleCloseModal}
				maxWidth="md"
				fullWidth
				TransitionProps={{
					timeout: 300,
				}}
				PaperProps={{
					sx: {
						borderRadius: 3,
						bgcolor: isDarkMode ? '#1f2937' : '#f6f7f8',
						backgroundImage: 'none',
						animation: 'scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
						...pageAnimations,
					},
				}}>
				<DialogTitle
					sx={{
						p: 3,
						pb: 2,
						borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
					}}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
						<SendIcon sx={{ color: '#137fec' }} />
						<Typography
							variant="h6"
							sx={{ fontWeight: 600, color: isDarkMode ? '#fff' : '#0f172a' }}>
							Send Out Payslips
						</Typography>
					</Box>
					<IconButton
						onClick={handleCloseModal}
						size="small"
						sx={{
							'transition': 'all 0.2s ease',
							'&:hover': {
								transform: 'rotate(90deg) scale(1.1)',
								color: '#f44336',
							},
						}}>
						<CloseIcon />
					</IconButton>
				</DialogTitle>

				<DialogContent sx={{ p: 3 }}>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
						<Box>
							<Typography
								variant="caption"
								sx={{
									fontWeight: 600,
									color: isDarkMode ? '#94a3b8' : '#64748b',
									textTransform: 'uppercase',
									display: 'block',
									mb: 2,
								}}>
								Select Period & Company
							</Typography>

							<Grid
								container
								spacing={2}
								alignItems="center">
								<Grid
									item
									xs={12}
									sm={3}>
									<TextField
										select
										fullWidth
										size="small"
										label="Month"
										value={modalMonth}
										onChange={(e) => {
											setModalMonth(e.target.value);
											setPreviewSummary(null);
										}}
										sx={{
											'bgcolor': isDarkMode ? '#0f172a' : '#f8fafc',
											'transition': 'all 0.2s ease',
											'&:hover': {
												transform: 'scale(1.01)',
											},
										}}>
										{MONTHS.map((opt) => (
											<MenuItem
												key={opt}
												value={opt}>
												{opt}
											</MenuItem>
										))}
									</TextField>
								</Grid>
								<Grid
									item
									xs={12}
									sm={3}>
									<TextField
										select
										fullWidth
										size="small"
										label="Year"
										value={modalYear}
										onChange={(e) => {
											setModalYear(e.target.value);
											setPreviewSummary(null);
										}}
										sx={{
											'bgcolor': isDarkMode ? '#0f172a' : '#f8fafc',
											'transition': 'all 0.2s ease',
											'&:hover': {
												transform: 'scale(1.01)',
											},
										}}>
										{YEARS.map((opt) => (
											<MenuItem
												key={opt}
												value={opt}>
												{opt}
											</MenuItem>
										))}
									</TextField>
								</Grid>
								<Grid
									item
									xs={12}
									sm={3}>
									<TextField
										select
										fullWidth
										size="small"
										label="Company"
										value={modalCompanyId}
										onChange={(e) => {
											setModalCompanyId(e.target.value);
											setPreviewSummary(null);
										}}
										disabled={isCompanyLoading}
										sx={{
											'bgcolor': isDarkMode ? '#0f172a' : '#f8fafc',
											'transition': 'all 0.2s ease',
											'&:hover:not(.Mui-disabled)': {
												transform: 'scale(1.01)',
											},
										}}>
										<MenuItem value={ALL_COMPANIES}>All Companies</MenuItem>
										{companies.map((company) => (
											<MenuItem
												key={company.id}
												value={company.id}>
												{company.name}
											</MenuItem>
										))}
									</TextField>
								</Grid>
								<Grid
									item
									xs={12}
									sm={3}>
									<Button
										fullWidth
										variant="outlined"
										onClick={handlePreviewSummary}
										disabled={previewLoading}
										startIcon={previewLoading ? <CircularProgress size={16} /> : <VisibilityIcon />}
										sx={{
											'height': '40px',
											'borderColor': isDarkMode ? '#334155' : '#e2e8f0',
											'color': isDarkMode ? '#fff' : '#0f172a',
											'textTransform': 'none',
											'transition': 'all 0.2s ease',
											'&:hover': {
												borderColor: '#137fec',
												backgroundColor: 'rgba(19, 127, 236, 0.1)',
												transform: 'scale(1.02)',
											},
										}}>
										{previewLoading ? 'Fetching...' : 'Preview Summary'}
									</Button>
								</Grid>
							</Grid>
						</Box>

						{previewSummary && (
							<Box
								sx={{
									animation: 'slideInUp 0.4s ease-out',
									...pageAnimations,
								}}>
								<Typography
									variant="caption"
									sx={{
										fontWeight: 600,
										color: isDarkMode ? '#94a3b8' : '#64748b',
										textTransform: 'uppercase',
										display: 'block',
										mb: 2,
									}}>
									Summary for {modalMonth} {modalYear}
								</Typography>

								<Grid
									container
									spacing={2}>
									{/* Total Staff Card */}
									<Grid
										item
										size={{ xs: 12, md: 4 }}
										sx={{
											animation: 'slideInRight 0.3s ease-out',
											...pageAnimations,
										}}>
										<Paper
											elevation={0}
											sx={{
												'p': 2.5,
												'borderRadius': 2,
												'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
												'bgcolor': isDarkMode ? '#1e293b' : '#ffffff',
												'display': 'flex',
												'flexDirection': 'column',
												'alignItems': 'center',
												'justifyContent': 'center',
												'minHeight': '140px',
												'width': '100%',
												'transition': 'all 0.3s ease',
												'&:hover': {
													transform: 'translateY(-4px) scale(1.02)',
													boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
													borderColor: '#137fec',
												},
											}}>
											<PeopleIcon sx={{ color: '#137fec', mb: 1, fontSize: 28 }} />
											<Typography
												variant="h5"
												sx={{
													fontWeight: 700,
													color: isDarkMode ? '#fff' : '#0f172a',
													lineHeight: 1.2,
													mb: 0.5,
												}}>
												{previewSummary.totalStaff}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
												Total Staff
											</Typography>
										</Paper>
									</Grid>

									<Grid
										item
										size={{ xs: 12, md: 4 }}
										sx={{
											animation: 'slideInUp 0.3s ease-out 0.1s both',
											...pageAnimations,
										}}>
										<Paper
											elevation={0}
											sx={{
												'p': 2.5,
												'borderRadius': 2,
												'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
												'bgcolor': isDarkMode ? '#1e293b' : '#ffffff',
												'display': 'flex',
												'flexDirection': 'column',
												'alignItems': 'center',
												'justifyContent': 'center',
												'minHeight': '140px',
												'width': '100%',
												'transition': 'all 0.3s ease',
												'&:hover': {
													transform: 'translateY(-4px) scale(1.02)',
													boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
													borderColor: '#10b981',
												},
											}}>
											<AttachMoneyIcon sx={{ color: '#10b981', mb: 1, fontSize: 28 }} />
											<Typography
												variant="h5"
												sx={{
													fontWeight: 700,
													color: isDarkMode ? '#fff' : '#0f172a',
													lineHeight: 1.2,
													mb: 0.5,
												}}>
												{previewSummary.monthlyGross.toLocaleString()}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
												Monthly Gross
											</Typography>
										</Paper>
									</Grid>

									{/* Monthly Net Card */}
									<Grid
										item
										size={{ xs: 12, md: 4 }}
										sx={{
											animation: 'slideInLeft 0.3s ease-out 0.2s both',
											...pageAnimations,
										}}>
										<Paper
											elevation={0}
											sx={{
												'p': 2.5,
												'borderRadius': 2,
												'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
												'bgcolor': isDarkMode ? '#1e293b' : '#ffffff',
												'display': 'flex',
												'flexDirection': 'column',
												'alignItems': 'center',
												'justifyContent': 'center',
												'minHeight': '140px',
												'width': '100%',
												'transition': 'all 0.3s ease',
												'&:hover': {
													transform: 'translateY(-4px) scale(1.02)',
													boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
													borderColor: '#8b5cf6',
												},
											}}>
											<AccountBalanceWalletIcon sx={{ color: '#8b5cf6', mb: 1, fontSize: 28 }} />
											<Typography
												variant="h5"
												sx={{
													fontWeight: 700,
													color: isDarkMode ? '#fff' : '#0f172a',
													lineHeight: 1.2,
													mb: 0.5,
												}}>
												{previewSummary.monthlyNet.toLocaleString()}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
												Monthly Net
											</Typography>
										</Paper>
									</Grid>
								</Grid>
							</Box>
						)}
					</Box>
				</DialogContent>

				<DialogActions sx={{ p: 3, pt: 0 }}>
					<Button
						onClick={handleCloseModal}
						variant="outlined"
						sx={{
							'borderColor': isDarkMode ? '#334155' : '#e2e8f0',
							'color': isDarkMode ? '#fff' : '#0f172a',
							'textTransform': 'none',
							'transition': 'all 0.2s ease',
							'&:hover': {
								borderColor: '#137fec',
								backgroundColor: 'rgba(19, 127, 236, 0.1)',
								transform: 'scale(1.02)',
							},
						}}>
						Cancel
					</Button>
					<Button
						variant="contained"
						onClick={handleModalSendPayslips}
						disabled={!previewSummary || loading}
						startIcon={loading ? <CircularProgress size={16} /> : <SendIcon />}
						sx={{
							'bgcolor': '#137fec',
							'transition': 'all 0.3s ease',
							'position': 'relative',
							'overflow': 'hidden',
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
								'bgcolor': '#1170d0',
								'transform': 'scale(1.02)',
								'&::before': {
									width: '200px',
									height: '200px',
								},
							},
							'&:disabled': {
								bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
							},
							'textTransform': 'none',
							'fontWeight': 600,
							'minWidth': 140,
						}}>
						{loading ? 'Sending...' : 'Send Payslips'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Success/Error Snackbar */}
			<Snackbar
				open={snackbar.open}
				autoHideDuration={6000}
				onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
				<Alert
					onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
					severity={snackbar.severity}
					sx={{
						width: '100%',
						boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
					}}>
					{snackbar.message}
				</Alert>
			</Snackbar>

			{/* Confirmation Dialog for Sending Payslips */}
			<Dialog
				open={confirmDialog.open}
				onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
				maxWidth="sm"
				fullWidth
				PaperProps={{
					sx: {
						borderRadius: 3,
						bgcolor: isDarkMode ? '#1f2937' : '#ffffff',
						backgroundImage: 'none',
						animation: 'scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
						...pageAnimations,
					},
				}}>
				<DialogTitle
					sx={{
						p: 3,
						pb: 2,
						borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						display: 'flex',
						alignItems: 'center',
						gap: 1.5,
					}}>
					<Box
						sx={{
							width: 40,
							height: 40,
							borderRadius: '50%',
							bgcolor: 'rgba(245, 158, 11, 0.1)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							animation: 'pulse-glow 2s infinite',
							...pageAnimations,
						}}>
						<SendIcon sx={{ color: '#f59e0b' }} />
					</Box>
					<Typography
						variant="h6"
						sx={{
							fontWeight: 700,
							color: isDarkMode ? '#fff' : '#0f172a',
							fontSize: '1.25rem',
						}}>
						Confirm Send Action
					</Typography>
				</DialogTitle>

				<DialogContent sx={{ p: 3 }}>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
						<Box
							sx={{
								p: 2,
								mt: 2,
								borderRadius: 2,
								bgcolor: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)',
								border: `1px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)'}`,
								display: 'flex',
								alignItems: 'flex-start',
								gap: 1.5,
							}}>
							<InfoIcon
								sx={{
									color: '#f59e0b',
									fontSize: 20,
									mt: 0.3,
									animation: 'pulse-glow 2s infinite',
									...pageAnimations,
								}}
							/>
							<Typography
								variant="body2"
								sx={{
									color: isDarkMode ? '#ffedd5' : '#92400e',
									fontSize: '0.95rem',
									lineHeight: 1.5,
								}}>
								{`This action will immediately send the selected payslips to the employee${
									confirmDialog.selectedIds.length > 1 ? "'s" : ''
								} registered email addresses. This process cannot be undone.`}
							</Typography>
						</Box>

						<Box>
							<Typography
								variant="caption"
								sx={{
									fontWeight: 600,
									color: isDarkMode ? '#94a3b8' : '#64748b',
									textTransform: 'uppercase',
									display: 'block',
									mb: 2,
								}}>
								Selection Summary
							</Typography>

							<Grid
								container
								spacing={2}>
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<Paper
										elevation={0}
										sx={{
											'p': 2,
											'borderRadius': 2,
											'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
											'bgcolor': isDarkMode ? '#1e293b' : '#f8fafc',
											'transition': 'all 0.2s ease',
											'&:hover': {
												transform: 'translateY(-2px)',
												borderColor: '#137fec',
											},
										}}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
											<BusinessIcon sx={{ color: '#137fec', fontSize: 20 }} />
											<Typography
												variant="body2"
												sx={{
													fontWeight: 600,
													color: isDarkMode ? '#fff' : '#0f172a',
												}}>
												Company
											</Typography>
										</Box>
										<Typography
											variant="h6"
											sx={{
												fontWeight: 700,
												color: isDarkMode ? '#fff' : '#0f172a',
												fontSize: '1.1rem',
												ml: 4.5,
											}}>
											{confirmDialog.companyName || 'Selected Company'}
										</Typography>
									</Paper>
								</Grid>

								{/* Count Card */}
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<Paper
										elevation={0}
										sx={{
											'p': 2,
											'borderRadius': 2,
											'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
											'bgcolor': isDarkMode ? '#1e293b' : '#f8fafc',
											'transition': 'all 0.2s ease',
											'&:hover': {
												transform: 'translateY(-2px)',
												borderColor: '#10b981',
											},
										}}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
											<DescriptionIcon sx={{ color: '#10b981', fontSize: 20 }} />
											<Typography
												variant="body2"
												sx={{
													fontWeight: 600,
													color: isDarkMode ? '#fff' : '#0f172a',
												}}>
												Payslips to Send
											</Typography>
										</Box>
										<Typography
											variant="h6"
											sx={{
												fontWeight: 700,
												color: isDarkMode ? '#fff' : '#0f172a',
												fontSize: '1.1rem',
												ml: 4.5,
											}}>
											{confirmDialog.count} {confirmDialog.count === 1 ? 'payslip' : 'payslips'} selected
										</Typography>
									</Paper>
								</Grid>
							</Grid>
						</Box>

						{/* Recipient Preview (Optional - shows first few employees) */}
						{/* {confirmDialog.selectedIds.length > 0 && (
							<Box>
								<Typography
									variant="caption"
									sx={{
										fontWeight: 600,
										color: isDarkMode ? '#94a3b8' : '#64748b',
										textTransform: 'uppercase',
										display: 'block',
										mb: 1.5,
									}}>
									Recipients Preview
								</Typography>

								<Box
									sx={{
										maxHeight: 140,
										overflowY: 'auto',
										borderRadius: 2,
										border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
									}}>
									{payslips
										.filter((slip) => confirmDialog.selectedIds.includes(slip.id))
										.slice(0, 5)
										.map((slip, index) => {
											const staff = slip.staffRecord || {};
											return (
												<Box
													key={slip.id}
													sx={{
														'p': 1.5,
														'borderBottom': index < 4 ? `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` : 'none',
														'display': 'flex',
														'alignItems': 'center',
														'gap': 1.5,
														'transition': 'background-color 0.2s ease',
														'&:hover': {
															bgcolor: isDarkMode ? '#334155' : '#f1f5f9',
														},
													}}>
													<Avatar
														sx={{
															width: 28,
															height: 28,
															fontSize: '0.7rem',
															fontWeight: 600,
															bgcolor: 'rgba(19, 127, 236, 0.1)',
															color: '#137fec',
														}}>
														{getInitials(staff.name || 'Unknown')}
													</Avatar>
													<Box sx={{ flex: 1 }}>
														<Typography
															variant="body2"
															sx={{
																fontWeight: 500,
																color: isDarkMode ? '#fff' : '#0f172a',
															}}>
															{staff.name || 'Unknown'}
														</Typography>
														<Typography
															variant="caption"
															sx={{
																color: isDarkMode ? '#94a3b8' : '#64748b',
																display: 'block',
															}}>
															{staff.email || 'No email'}
														</Typography>
													</Box>
												</Box>
											);
										})}

									{confirmDialog.selectedIds.length > 5 && (
										<Box
											sx={{
												p: 1.5,
												textAlign: 'center',
												borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
												bgcolor: isDarkMode ? '#0f172a' : '#f1f5f9',
											}}>
											<Typography
												variant="caption"
												sx={{
													color: isDarkMode ? '#94a3b8' : '#64748b',
													fontWeight: 500,
												}}>
												And {confirmDialog.selectedIds.length - 5} more recipient(s)
											</Typography>
										</Box>
									)}
								</Box>
							</Box>
						)} */}
						{/* Recipient Preview - Using selectedPayslipsData instead of filtering payslips */}
						{selectedPayslipsData.length > 0 && (
							<Box>
								<Typography
									variant="caption"
									sx={{
										fontWeight: 600,
										color: isDarkMode ? '#94a3b8' : '#64748b',
										textTransform: 'uppercase',
										display: 'block',
										mb: 1.5,
									}}>
									Recipients Preview
								</Typography>

								<Box
									sx={{
										maxHeight: 140,
										overflowY: 'auto',
										borderRadius: 2,
										border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
									}}>
									{selectedPayslipsData.slice(0, 5).map((slip, index) => {
										const staff = slip.staffRecord || {};
										return (
											<Box
												key={slip.id}
												sx={{
													'p': 1.5,
													'borderBottom': index < 4 ? `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` : 'none',
													'display': 'flex',
													'alignItems': 'center',
													'gap': 1.5,
													'transition': 'background-color 0.2s ease',
													'&:hover': {
														bgcolor: isDarkMode ? '#334155' : '#f1f5f9',
													},
												}}>
												<Avatar
													sx={{
														width: 28,
														height: 28,
														fontSize: '0.7rem',
														fontWeight: 600,
														bgcolor: 'rgba(19, 127, 236, 0.1)',
														color: '#137fec',
													}}>
													{getInitials(staff.name || 'Unknown')}
												</Avatar>
												<Box sx={{ flex: 1 }}>
													<Typography
														variant="body2"
														sx={{
															fontWeight: 500,
															color: isDarkMode ? '#fff' : '#0f172a',
														}}>
														{staff.name || 'Unknown'}
													</Typography>
													<Typography
														variant="caption"
														sx={{
															color: isDarkMode ? '#94a3b8' : '#64748b',
															display: 'block',
														}}>
														{staff.email || 'No email'}
													</Typography>
												</Box>
											</Box>
										);
									})}

									{selectedPayslipsData.length > 5 && (
										<Box
											sx={{
												p: 1.5,
												textAlign: 'center',
												borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
												bgcolor: isDarkMode ? '#0f172a' : '#f1f5f9',
											}}>
											<Typography
												variant="caption"
												sx={{
													color: isDarkMode ? '#94a3b8' : '#64748b',
													fontWeight: 500,
												}}>
												And {selectedPayslipsData.length - 5} more recipient(s)
											</Typography>
										</Box>
									)}
								</Box>
							</Box>
						)}
					</Box>
				</DialogContent>

				<DialogActions
					sx={{
						p: 3,
						pt: 2,
						borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						gap: 1,
					}}>
					<Button
						onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
						variant="outlined"
						startIcon={<CloseIcon />}
						sx={{
							'borderColor': isDarkMode ? '#334155' : '#e2e8f0',
							'color': isDarkMode ? '#fff' : '#0f172a',
							'textTransform': 'none',
							'fontWeight': 600,
							'borderRadius': 2,
							'px': 3,
							'py': 1,
							'transition': 'all 0.2s ease',
							'&:hover': {
								borderColor: '#ef4444',
								backgroundColor: 'rgba(239, 68, 68, 0.1)',
								transform: 'scale(1.02)',
							},
						}}>
						Cancel
					</Button>
					<Button
						variant="contained"
						onClick={async () => {
							setConfirmDialog((prev) => ({ ...prev, open: false }));
							await processBatchSend(confirmDialog.selectedIds, confirmDialog.companyId);
						}}
						startIcon={<SendIcon />}
						disabled={loading}
						sx={{
							'bgcolor': '#137fec',
							'&:hover': {
								bgcolor: '#1170d0',
								transform: 'scale(1.05)',
							},
							'textTransform': 'none',
							'fontWeight': 600,
							'borderRadius': 2,
							'px': 4,
							'py': 1,
							'transition': 'all 0.3s ease',
							'position': 'relative',
							'overflow': 'hidden',
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
							'&:hover:not(:disabled)::before': {
								width: '300px',
								height: '300px',
							},
						}}>
						Confirm Send
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
};

export default CompanyPayslips;
