/**
UI for managing staff records goes here.
 */
import {
	IconButton,
	Box,
	Button,
	Typography,
	Paper,
	Modal,
	Menu,
	MenuItem,
	useTheme,
	TextField,
	Table,
	TableHead,
	TableRow,
	TableCell,
	TableBody,
	Chip,
	Pagination,
	ListItemIcon,
	ListItemText,
	InputAdornment,
	Checkbox,
} from '@mui/material';
import { useAuth } from '@/lib/context/AuthContext';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SearchIcon from '@mui/icons-material/Search';
import { useEffect, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import {
	getStaffRecords,
	uploadStaffExcel,
	getStaffDownloadFailedRecords,
	getStaffUploadRecordTemplate,
	editAdminStaff,
	deleteAdminStaff,
} from '@/services/StaffService';
import CircularProgress from '@mui/material/CircularProgress';
import HistoryIcon from '@mui/icons-material/History';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useNavigate } from 'react-router-dom';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { CompanySelectField } from '@/components/SelectCompany';
import { getAccessibleCompany } from '@/services/CompanyService';
// Import the RegisterUserModal
import RegisterUserModal from './RegisterUserModal';
import StaffEditModal from '@/pages/core-setup/staff-management/StaffEditModal';
import StaffViewModal from '@/pages/core-setup/staff-management/StaffViewModal';
import StaffDeleteModal from '@/pages/core-setup/staff-management/StaffDeleteModal';
import { MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import VisibilityIcon from '@mui/icons-material/Visibility';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import ConfirmationModal from '@/pages/core-setup/staff-management/StaffConfirmationModal';

// Mock toast for now since it was undefined in original code
// const toast = {
// 	error: (msg) => console.error(msg),
// 	success: (msg) => console.log(msg),
// };

const StaffManagement = () => {
	// Removed unused theme
	const theme = useTheme();

	const { user } = useAuth();
	const role = (user?.role || '').toString();
	const canSelectCompany = role === 'SUPER_ADMIN' || role === 'ADMIN';
	const navigate = useNavigate(); // Initialize hook
	const [openUploadModal, setOpenUploadModal] = useState(false);
	const [selectedFile, setSelectedFile] = useState(null);
	const [dragActive, setDragActive] = useState(false);
	const [uploadResult, setUploadResult] = useState(null); // null | {total:150, success:148, failed:2, errors:[]}
	const [showSuccessModal, setShowSuccessModal] = useState(false);
	const [staffRecords, setStaffRecords] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 10,
		total: 0,
	});
	const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadComplete, setUploadComplete] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [selectedCompany, setSelectedCompany] = useState('');
	const [companies, setCompanies] = useState([]);
	const [anchorEl, setAnchorEl] = useState(null);
	const [excelPreview, setExcelPreview] = useState(null);
	const [showPreviewModal, setShowPreviewModal] = useState(false);

	// --- Register User Modal Logic ---
	const [isRegisterUserModalOpen, setIsRegisterUserModalOpen] = useState(false);

	// Edit User
	const [isEditUserOpen, setIsEditUserOpen] = useState(false);
	const [selectedUser, setSelectedUser] = useState(null);

	// Delete User
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [staffToDelete, setStaffToDelete] = useState(null);

	// View User
	const [isViewOpen, setIsViewOpen] = useState(false);
	const [selectedStaff, setSelectedStaff] = useState(new Set());
	const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
	const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

	const handleBatchDelete = async () => {
		setIsBatchDeleteModalOpen(true);
	};

	const handleRegisterUser = () => {
		setIsRegisterUserModalOpen(true);
	};

	const handleCloseRegisterUserModal = () => {
		setIsRegisterUserModalOpen(false);
	};

	const handleMenuOpen = (event, user) => {
		event.stopPropagation();
		setAnchorEl(event.currentTarget);
		setSelectedUser(user);
	};

	const handleMenuClose = () => {
		setAnchorEl(null);
	};

	const handleSubmitRegisterUser = (formData) => {
		handleCloseRegisterUserModal();
	};

	const handleOpenPreview = () => {
		if (excelPreview) {
			setShowPreviewModal(true);
		}
	};

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
		return () => clearTimeout(t);
	}, [searchTerm]);

	useEffect(() => {
		const loadRecords = async () => {
			setLoading(true);
			const result = await getStaffRecords({
				page: pagination.page,
				pageSize: pagination.pageSize,
				search: debouncedSearch.trim(),
			});

			if (result.success) {
				setStaffRecords(result.items);
				setPagination((prev) => ({
					...prev,
					total: result.pagination.total,
					pageSize: result.pagination.pageSize,
				}));
			} else {
				setError(result.error);
			}
			setLoading(false);
		};

		loadRecords();
	}, [pagination.page, pagination.pageSize, debouncedSearch]);

	useEffect(() => {
		if (!openUploadModal) return;

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
		// Fixed: Added canSelectCompany to dependency array
	}, [openUploadModal, canSelectCompany]);

	const uploadFile = async () => {
		if (!selectedFile) return;

		const REQUIRED_COLUMNS = ['staffId', 'firstName', 'lastName', 'email'];

		const missing = REQUIRED_COLUMNS.filter((col) => !excelPreview.headers.includes(col));

		if (missing.length) {
			toast.error(`Missing columns: ${missing.join(', ')}`);
			return;
		}

		setUploading(true);

		const result = await uploadStaffExcel(selectedFile, selectedCompany);

		// Check if API call was successful
		if (result.apiSuccess) {
			setUploadResult({
				total: result.summary.totalRecords,
				success: result.summary.successful,
				failed: result.summary.failed,
				errors: result.errors,
				uploadId: result.uploadId,
			});

			// Close upload modal
			setOpenUploadModal(false);

			// Show success modal (shows even if some records failed)
			setShowSuccessModal(true);

			// Refresh table if any records were successful
			if (result.summary.successful > 0) {
				const refreshed = await getStaffRecords({
					page: 1,
					pageSize: pagination.pageSize,
				});
				if (refreshed.success) {
					setStaffRecords(refreshed.items);
					setPagination((prev) => ({
						...prev,
						page: 1,
						total: refreshed.pagination.total,
					}));
				}
			}
		} else {
			// API call failed completely
			console.error('Upload failed', result.error);
			// toast.error(result.error || 'Upload failed');
		}

		setUploading(false);
		setSelectedFile(null);
		setExcelPreview(null);
	};

	const downloadFailedReport = async (uploadId) => {
		const result = await getStaffDownloadFailedRecords(uploadId);

		if (!result.success) {
			toast.error('Failed to download file');
			return;
		}

		// Create a temporary download link
		const blobUrl = URL.createObjectURL(result.blob);

		const link = document.createElement('a');
		link.href = blobUrl;
		link.download = `failed_records_${uploadId}.xlsx`;
		link.style.display = 'none'; // React-friendly: do not visually inject

		document.body.appendChild(link);
		link.click();

		// Cleanup
		document.body.removeChild(link);
		URL.revokeObjectURL(blobUrl);
	};

	const downloadStaffUploadTemplate = async () => {
		const result = await getStaffUploadRecordTemplate();

		if (!result.success) {
			toast.error('Failed to download file');
			return;
		}

		// Create a temporary download link
		const blobUrl = URL.createObjectURL(result.blob);

		const link = document.createElement('a');
		link.href = blobUrl;
		link.download = result.filename;
		link.style.display = 'none'; // React-friendly: do not visually inject

		document.body.appendChild(link);
		link.click();

		// Cleanup
		document.body.removeChild(link);
		URL.revokeObjectURL(blobUrl);
	};

	const onSaveEditStaff = async (updatedData) => {
		try {
			await editAdminStaff(selectedUser.id, updatedData);
			setIsEditUserOpen(false);

			setLoading(true);
			const result = await getStaffRecords({
				page: pagination.page,
				pageSize: pagination.pageSize,
				search: debouncedSearch.trim(),
			});

			if (result.success) {
				setStaffRecords(result.items);
				setPagination((prev) => ({
					...prev,
					total: result.pagination.total,
					pageSize: result.pagination.pageSize,
				}));
			} else {
				setError(result.error);
			}
			setLoading(false);
		} catch (error) {
			console.log(error);
		}
	};

	const onDeleteStaff = async () => {
		try {
			await deleteAdminStaff(staffToDelete.id);
			setIsDeleteOpen(false);
			setStaffToDelete(null);

			setLoading(true);
			const result = await getStaffRecords({
				page: pagination.page,
				pageSize: pagination.pageSize,
				search: debouncedSearch.trim(),
			});

			if (result.success) {
				setStaffRecords(result.items);
				setPagination((prev) => ({
					...prev,
					total: result.pagination.total,
					pageSize: result.pagination.pageSize,
				}));
			} else {
				setError(result.error);
			}
			setLoading(false);
		} catch (error) {
			console.log(error);
		}
		// console.log(staffToDelete);
		// console.log(staffToDelete.id);
	};

	const onSelectCompany = (companyId) => {
		setSelectedCompany(companyId);
	};

	const parseExcelPreview = async (file) => {
		const buffer = await file.arrayBuffer();
		const workbook = XLSX.read(buffer, { type: 'array' });

		const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('staff')) || workbook.SheetNames[0];
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
	};

	const handleSelectAll = () => {
		if (selectedStaff.size === staffRecords.length && staffRecords.length > 0) {
			setSelectedStaff(new Set());
		} else {
			setSelectedStaff(new Set(staffRecords.map((staff) => staff.id)));
		}
	};

	const handleSelectStaff = (staffId) => {
		const newSelected = new Set(selectedStaff);
		if (newSelected.has(staffId)) {
			newSelected.delete(staffId);
		} else {
			newSelected.add(staffId);
		}
		setSelectedStaff(newSelected);
	};

	const confirmBatchDelete = async () => {
		const selectedCount = selectedStaff.size;
		setBatchDeleteLoading(true);

		try {
			// Convert Set to array of IDs
			const staffIds = Array.from(selectedStaff);

			// Call your batch delete API here
			// await batchDeleteStaff(staffIds);

			// For now, we'll delete one by one using existing delete function
			for (const staffId of staffIds) {
				await deleteAdminStaff(staffId);
			}

			// Refresh the table
			const result = await getStaffRecords({
				page: pagination.page,
				pageSize: pagination.pageSize,
				search: debouncedSearch.trim(),
			});

			if (result.success) {
				setStaffRecords(result.items);
				setPagination((prev) => ({
					...prev,
					total: result.pagination.total,
					pageSize: result.pagination.pageSize,
				}));

				// Clear selection
				setSelectedStaff(new Set());

				// Close modal
				setIsBatchDeleteModalOpen(false);

				// Show success toast
				toast.success(`Successfully deleted ${selectedCount} staff ${selectedCount === 1 ? 'member' : 'members'}`);
			} else {
				setError(result.error);
				toast.error('Failed to delete staff members');
			}
		} catch (error) {
			console.error('Batch delete error:', error);
			toast.error('An error occurred while deleting staff members');
		} finally {
			setBatchDeleteLoading(false);
		}
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
		'@keyframes float': {
			'0%': { transform: 'translateY(0px)' },
			'50%': { transform: 'translateY(-5px)' },
			'100%': { transform: 'translateY(0px)' },
		},
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
			'70%': { boxShadow: '0 0 0 10px rgba(33, 150, 243, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
		},
		'@keyframes shimmer': {
			'0%': { backgroundPosition: '-1000px 0' },
			'100%': { backgroundPosition: '1000px 0' },
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
		'@keyframes bounce': {
			'0%, 100%': { transform: 'translateY(0)' },
			'50%': { transform: 'translateY(-8px)' },
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
				animation: 'fadeIn 0.5s ease-out',
				...pageAnimations,
			}}>
			{/* PAGE HEADER */}
			<Box
				sx={{
					display: 'flex',
					flexDirection: { xs: 'column', md: 'row' },
					justifyContent: 'space-between',
					alignItems: { xs: 'flex-start', md: 'center' },
					gap: 2,
					mb: 4,
				}}>
				<Typography
					variant="h2"
					fontWeight={700}
					sx={{
						'color': '#fff',
						'animation': 'slideInDown 0.5s ease-out',
						'position': 'relative',
						'display': 'inline-block',
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
							...pageAnimations,
						},
						...pageAnimations,
					}}>
					Staff Records
				</Typography>

				<Box
					component="header"
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						alignItems: { sm: 'center' },
						justifyContent: { sm: 'flex-end' },
						gap: 2,
						width: { xs: '100%', md: 'auto' },
						animation: 'slideInRight 0.5s ease-out',
						...pageAnimations,
					}}>
					<Button
						variant="contained"
						startIcon={<HistoryIcon sx={{ transition: 'transform 0.2s ease' }} />}
						onClick={() => navigate('/staff-management/history')}
						sx={{
							'height': 40,
							'px': 2,
							'borderRadius': 1,
							'backgroundColor': '#334155',
							'color': '#ffffff',
							'fontWeight': 700,
							'textTransform': 'none',
							'letterSpacing': '0.015em',
							'boxShadow': 'none',
							'transition': 'all 0.3s ease',
							'&:hover': {
								'backgroundColor': '#475569',
								'transform': 'scale(1.02)',
								'& .MuiSvgIcon-root': {
									transform: 'translateY(-2px)',
								},
							},
						}}>
						Staff Upload History
					</Button>

					<Button
						variant="contained"
						startIcon={<UploadFileIcon sx={{ transition: 'transform 0.2s ease' }} />}
						onClick={() => setOpenUploadModal(true)}
						sx={{
							'height': 40,
							'fontWeight': 600,
							'borderRadius': 1,
							'bgcolor': '#334155',
							'color': '#ffffff',
							'textTransform': 'none',
							'boxShadow': 'none',
							'transition': 'all 0.3s ease',
							'&:hover': {
								'bgcolor': '#475569',
								'transform': 'scale(1.02)',
								'& .MuiSvgIcon-root': {
									transform: 'translateY(-2px)',
								},
							},
						}}>
						Upload Staff Excel
					</Button>

					{['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role) && (
						<Button
							variant="contained"
							startIcon={<PersonAddIcon sx={{ transition: 'transform 0.2s ease' }} />}
							onClick={handleRegisterUser}
							sx={{
								'height': 40,
								'px': 2,
								'borderRadius': 1,
								'backgroundColor': '#2196f3',
								'color': '#ffffff',
								'fontWeight': 700,
								'textTransform': 'none',
								'letterSpacing': '0.015em',
								'boxShadow': 'none',
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
									'backgroundColor': '#1976d2',
									'transform': 'scale(1.02)',
									'& .MuiSvgIcon-root': {
										transform: 'rotate(90deg) scale(1.1)',
									},
									'&::before': {
										width: '200px',
										height: '200px',
									},
								},
							}}>
							Register User
						</Button>
					)}
				</Box>
			</Box>

			{/* FILE UPLOAD CARD */}
			<Paper
				elevation={0}
				sx={{
					'p': 2,
					'borderRadius': 2,
					'bgcolor': '#0f172a',
					'border': '1px solid rgba(255,255,255,0.08)',
					'mb': 3,
					'animation': 'slideInUp 0.5s ease-out 0.1s both',
					'transition': 'all 0.3s ease',
					'&:hover': {
						transform: 'translateY(-2px)',
						boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
					},
					...pageAnimations,
				}}>
				<Box
					sx={{
						'border': '2px dashed rgba(255,255,255,0.2)',
						'borderRadius': 2,
						'p': 6,
						'textAlign': 'center',
						'transition': 'all 0.3s ease',
						'&:hover': {
							borderColor: '#2196f3',
							backgroundColor: 'rgba(33, 150, 243, 0.05)',
						},
					}}>
					<CloudUploadIcon
						sx={{
							fontSize: 64,
							mb: 2,
							opacity: 0.5,
							color: '#fff',
							animation: 'float 3s ease-in-out infinite',
							...pageAnimations,
						}}
					/>

					<Typography
						variant="h6"
						fontWeight={600}
						sx={{ color: '#fff', mb: 0.5 }}>
						Upload your Excel file here
					</Typography>

					<Typography
						variant="body2"
						sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>
						{selectedFile?.name || 'staff_data_q3_2024.xlsx'}
					</Typography>

					<Button
						variant="contained"
						startIcon={<UploadFileIcon sx={{ transition: 'transform 0.2s ease' }} />}
						onClick={() => setOpenUploadModal(true)}
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
						Upload file
					</Button>
				</Box>
			</Paper>

			{/* SEARCH BAR */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					mb: 3,
					gap: 3,
					animation: 'slideInUp 0.5s ease-out 0.2s both',
					...pageAnimations,
				}}>
				{/* Search Field */}
				<Box sx={{ flexGrow: 1 }}>
					<TextField
						fullWidth
						placeholder="Search by name, email, or ID..."
						size="small"
						value={searchTerm}
						onChange={(e) => {
							setPagination((prev) => ({ ...prev, page: 1 }));
							setSearchTerm(e.target.value);
						}}
						InputProps={{
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon
										sx={{
											mr: 1,
											opacity: 0.5,
											color: 'rgba(255,255,255,0.5)',
											transition: 'transform 0.2s ease',
										}}
									/>
								</InputAdornment>
							),
							sx: {
								'bgcolor': '#222b3f',
								'borderRadius': 1,
								'borderWidth': '0px',
								'transition': 'all 0.2s ease',
								'& .MuiOutlinedInput-notchedOutline': {
									borderColor: 'rgba(255,255,255,0.15)',
								},
								'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
									borderColor: '#2196f3',
								},
								'&:hover': {
									bgcolor: '#2a3a54',
									transform: 'scale(1.01)',
								},
								'&.Mui-focused': {
									animation: 'pulse-glow 1.5s infinite',
									...pageAnimations,
								},
								'color': '#fff',
								'maxWidth': 500,
							},
						}}
						sx={{
							'& .MuiInputBase-input::placeholder': {
								color: 'rgba(255,255,255,0.5)',
								opacity: 1,
							},
						}}
					/>
				</Box>

				<Button
					variant="contained"
					startIcon={<CloudDownloadIcon sx={{ transition: 'transform 0.2s ease' }} />}
					onClick={() => downloadStaffUploadTemplate()}
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
					Download Staff Template
				</Button>
			</Box>

			{/* Batch Selection Bar */}
			{selectedStaff.size > 0 && (
				<Paper
					elevation={0}
					sx={{
						p: 2,
						borderRadius: 2,
						border: '1px solid rgba(255,255,255,0.08)',
						bgcolor: '#1e293b',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						mb: 3,
						animation: 'slideInUp 0.3s ease-out',
						transformOrigin: 'top',
						...pageAnimations,
					}}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<Checkbox
							checked={selectedStaff.size === staffRecords.length && staffRecords.length > 0}
							indeterminate={selectedStaff.size > 0 && selectedStaff.size < staffRecords.length}
							onChange={handleSelectAll}
							sx={{
								'color': 'rgba(255,255,255,0.5)',
								'&.Mui-checked': {
									color: '#2196f3',
								},
								'&.MuiCheckbox-indeterminate': {
									color: '#2196f3',
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
								color: '#e2e8f0',
								fontWeight: 500,
							}}>
							{selectedStaff.size} {selectedStaff.size === 1 ? 'staff' : 'staff'} selected
						</Typography>
					</Box>

					<Box sx={{ display: 'flex', gap: 2 }}>
						{/* Delete Button - Only show for HR, ADMIN, SUPER_ADMIN */}
						{['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role) && (
							<Button
								variant="contained"
								startIcon={
									<Trash2
										size={18}
										sx={{ transition: 'transform 0.2s ease' }}
									/>
								}
								onClick={handleBatchDelete}
								disabled={loading}
								sx={{
									'bgcolor': '#ef4444',
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
										'bgcolor': '#dc2626',
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
										bgcolor: 'rgba(255,255,255,0.12)',
									},
									'textTransform': 'none',
									'fontWeight': 600,
									'borderRadius': 1,
									'height': 40,
									'px': 3,
								}}>
								Delete ({selectedStaff.size})
							</Button>
						)}

						{/* Clear Selection Button */}
						<Button
							variant="outlined"
							onClick={() => setSelectedStaff(new Set())}
							sx={{
								'borderColor': 'rgba(255,255,255,0.2)',
								'color': '#e2e8f0',
								'textTransform': 'none',
								'fontWeight': 600,
								'borderRadius': 1,
								'height': 40,
								'px': 3,
								'transition': 'all 0.3s ease',
								'&:hover': {
									borderColor: '#94a3b8',
									backgroundColor: 'rgba(255,255,255,0.05)',
									transform: 'scale(1.02)',
								},
							}}>
							Clear Selection
						</Button>
					</Box>
				</Paper>
			)}

			{/* Batch Delete Confirmation Modal */}
			<ConfirmationModal
				open={isBatchDeleteModalOpen}
				onClose={() => setIsBatchDeleteModalOpen(false)}
				onConfirm={confirmBatchDelete}
				title="Delete Staff Members"
				message={`Are you sure you want to delete ${selectedStaff.size} selected staff ${selectedStaff.size === 1 ? 'member' : 'members'}? This action cannot be undone.`}
				confirmText="Delete"
				cancelText="Cancel"
				type="danger"
				loading={batchDeleteLoading}
				size="md"
			/>

			{/* TABLE */}
			<Paper
				elevation={0}
				sx={{
					'borderRadius': 2,
					'overflow': 'hidden',
					'bgcolor': '#162033',
					'border': '0.5px solid rgba(255,255,255,0.08)',
					'mb': 3,
					'animation': 'slideInUp 0.5s ease-out 0.3s both',
					'transition': 'all 0.3s ease',
					'&:hover': {
						boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
					},
					...pageAnimations,
				}}>
				{/* Add horizontal scroll container */}
				<Box sx={{ overflowX: 'auto', width: '100%' }}>
					<Table sx={{ minWidth: 900 }}>
						<TableHead>
							<TableRow sx={{ bgcolor: 'hsl(219, 40, 14)' }}>
								<TableCell
									sx={{
										color: 'rgba(255,255,255,0.7)',
										fontWeight: 600,
										fontSize: '0.75rem',
										textTransform: 'uppercase',
										py: 2,
										width: '48px',
										whiteSpace: 'nowrap',
									}}>
									<Checkbox
										checked={selectedStaff.size === staffRecords.length && staffRecords.length > 0}
										indeterminate={selectedStaff.size > 0 && selectedStaff.size < staffRecords.length}
										onChange={handleSelectAll}
										sx={{
											'color': 'rgba(255,255,255,0.5)',
											'&.Mui-checked': {
												color: '#2196f3',
											},
											'&.MuiCheckbox-indeterminate': {
												color: '#2196f3',
											},
											'transition': 'transform 0.2s ease',
											'&:hover': {
												transform: 'scale(1.1)',
											},
										}}
									/>
								</TableCell>

								{['Staff ID', 'First Name', 'Last Name', 'Email', 'Department', 'Position', 'Status', 'Actions'].map((head, index) => (
									<TableCell
										key={head}
										sx={{
											color: 'rgba(255,255,255,0.7)',
											fontWeight: 600,
											fontSize: '0.75rem',
											textTransform: 'uppercase',
											py: 2,
											whiteSpace: 'nowrap',
											animation: `slideInDown 0.3s ease-out ${index * 0.05}s both`,
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
										colSpan={9}
										sx={{ textAlign: 'center', py: 6 }}>
										<CircularProgress
											size={32}
											sx={{
												'color': '#2196f3',
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
											color="rgba(255,255,255,0.6)"
											mt={2}>
											Loading staff records...
										</Typography>
									</TableCell>
								</TableRow>
							) : error ? (
								<TableRow>
									<TableCell
										colSpan={9}
										sx={{ textAlign: 'center', color: '#f87171', py: 6 }}>
										{error}
									</TableCell>
								</TableRow>
							) : staffRecords.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={9}
										sx={{ textAlign: 'center', py: 12 }}>
										<Typography
											variant="h6"
											color="rgba(255,255,255,0.5)"
											gutterBottom>
											No staff records found
										</Typography>
										<Typography
											variant="body2"
											color="rgba(255,255,255,0.4)">
											Upload your first Excel file to populate the records.
										</Typography>
									</TableCell>
								</TableRow>
							) : (
								staffRecords.map((row, index) => (
									<TableRow
										key={row.id}
										hover
										sx={{
											'cursor': 'pointer',
											'bgcolor': selectedStaff.has(row.id) ? '#1a2332' : '#0f172a',
											'transition': 'all 0.2s ease',
											'animation': `rowEnter 0.3s ease-out ${index * 0.02}s both`,
											'&:hover': {
												bgcolor: '#1a2332',
												transform: 'scale(1.001)',
											},
											...pageAnimations,
										}}>
										<TableCell
											sx={{
												py: 2,
												borderBottom: '1px solid rgba(255,255,255,0.1)',
												width: '48px',
											}}>
											<Checkbox
												checked={selectedStaff.has(row.id)}
												onChange={() => handleSelectStaff(row.id)}
												onClick={(e) => e.stopPropagation()}
												sx={{
													'color': 'rgba(255,255,255,0.3)',
													'&.Mui-checked': {
														color: '#2196f3',
													},
													'transition': 'transform 0.2s ease',
													'&:hover': {
														transform: 'scale(1.1)',
													},
												}}
											/>
										</TableCell>

										<TableCell sx={{ color: '#fff', py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>{row.staffId || '-'}</TableCell>
										<TableCell sx={{ color: '#fff', py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>{row.firstName || '-'}</TableCell>
										<TableCell sx={{ color: '#fff', py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>{row.lastName || '-'}</TableCell>
										<TableCell sx={{ color: '#fff', py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>{row.email || '-'}</TableCell>
										<TableCell sx={{ color: '#fff', py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>{row.department || '-'}</TableCell>
										<TableCell sx={{ color: '#fff', py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>{row.position || '-'}</TableCell>
										<TableCell sx={{ py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>
											<Chip
												label={row.isActive ? 'Active' : 'Inactive'}
												size="small"
												sx={{
													'bgcolor': row.isActive ? '#133934' : '#334155',
													'color': row.isActive ? '#5eb183' : '#9e9e9e',
													'fontWeight': 600,
													'fontSize': '0.75rem',
													'height': 26,
													'borderRadius': 1,
													'transition': 'all 0.2s ease',
													'&:hover': {
														transform: 'scale(1.05)',
													},
												}}
											/>
										</TableCell>
										<TableCell
											align="right"
											sx={{
												py: 2,
												borderBottom: '1px solid rgba(255,255,255,0.1)',
												whiteSpace: 'nowrap',
											}}>
											<IconButton
												size="small"
												onClick={(e) => handleMenuOpen(e, row)}
												sx={{
													'transition': 'all 0.2s ease',
													'&:hover': {
														transform: 'rotate(90deg)',
														color: '#2196f3',
													},
												}}>
												<MoreVertical size={18} />
											</IconButton>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</Box>
			</Paper>

			{/* PAGINATION */}
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'center',
					py: 2,
					animation: 'fadeIn 0.3s ease-out 0.4s both',
					...pageAnimations,
				}}>
				<Pagination
					count={Math.ceil(pagination.total / pagination.pageSize) || 1}
					page={pagination.page}
					onChange={(_, page) => setPagination((prev) => ({ ...prev, page }))}
					color="primary"
					sx={{
						'& .MuiPaginationItem-root': {
							'color': '#fff',
							'transition': 'all 0.2s ease',
							'&:hover': {
								transform: 'scale(1.1)',
								bgcolor: '#334155',
							},
						},
						'& .Mui-selected': {
							bgcolor: '#2196f3',
							animation: 'pulse-glow 2s infinite',
							...pageAnimations,
						},
					}}
				/>
			</Box>

			{/* Row Actions Menu */}
			<Menu
				anchorEl={anchorEl}
				open={Boolean(anchorEl)}
				onClose={handleMenuClose}
				PaperProps={{
					sx: {
						minWidth: 160,
						borderRadius: 2,
						animation: 'scaleIn 0.2s ease-out',
						...pageAnimations,
					},
				}}>
				<MenuItem
					onClick={() => {
						setIsViewOpen(true);
						handleMenuClose();
					}}
					sx={{
						'transition': 'all 0.2s ease',
						'&:hover': {
							bgcolor: 'rgba(33, 150, 243, 0.1)',
							transform: 'translateX(4px)',
						},
					}}>
					<ListItemIcon>
						<Eye size={16} />
					</ListItemIcon>
					<ListItemText>View Staff</ListItemText>
				</MenuItem>

				{role != 'STAFF' && (
					<MenuItem
						onClick={() => {
							setIsEditUserOpen(true);
							handleMenuClose();
						}}
						sx={{
							'transition': 'all 0.2s ease',
							'&:hover': {
								bgcolor: 'rgba(33, 150, 243, 0.1)',
								transform: 'translateX(4px)',
							},
						}}>
						<ListItemIcon>
							<Edit size={16} />
						</ListItemIcon>
						<ListItemText>Edit Staff</ListItemText>
					</MenuItem>
				)}

				{role != 'STAFF' && (
					<MenuItem
						onClick={() => {
							setStaffToDelete(selectedUser);
							setIsDeleteOpen(true);
							handleMenuClose();
						}}
						sx={{
							'color': 'error.main',
							'transition': 'all 0.2s ease',
							'&:hover': {
								bgcolor: 'rgba(244, 67, 54, 0.1)',
								transform: 'translateX(4px)',
							},
						}}>
						<ListItemIcon>
							<Trash2
								size={16}
								color={theme.palette.error.main}
							/>
						</ListItemIcon>
						<ListItemText>Delete User</ListItemText>
					</MenuItem>
				)}
			</Menu>

			{/* ==================== UPLOAD MODAL ==================== */}
			<Modal
				open={openUploadModal}
				onClose={() => {
					if (uploading) return;
					setOpenUploadModal(false);
					setSelectedFile(null);
					setExcelPreview(null);
					setUploadComplete(false);
				}}
				closeAfterTransition
				slots={{ backdrop: 'div' }}
				slotProps={{
					backdrop: {
						sx: {
							backdropFilter: 'blur(10px)',
							backgroundColor: 'rgba(0,0,0,0.7)',
							transition: 'opacity 0.3s ease-in-out',
							opacity: openUploadModal ? 1 : 0,
						},
					},
				}}>
				<Box
					sx={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						transform: openUploadModal ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -40%) scale(0.9)',
						opacity: openUploadModal ? 1 : 0,
						transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
						width: { xs: '95%', sm: 520 },
						bgcolor: '#0f172a',
						border: '1px solid rgba(255,255,255,0.12)',
						borderRadius: 3,
						boxShadow: 24,
						p: 4,
						outline: 'none',
					}}>
					{/* Close Button */}
					<IconButton
						onClick={() => {
							if (!uploading) {
								setOpenUploadModal(false);
								setSelectedFile(null);
								setExcelPreview(null);
								setUploadComplete(false);
								setSelectedCompany('');
							}
						}}
						sx={{
							'position': 'absolute',
							'right': 8,
							'top': 8,
							'color': 'rgba(255,255,255,0.7)',
							'opacity': uploading ? 0.5 : 1,
							'transition': 'all 0.2s ease',
							'&:hover:not(:disabled)': {
								transform: 'rotate(90deg) scale(1.1)',
								color: '#f44336',
								bgcolor: 'rgba(244, 67, 54, 0.1)',
							},
						}}
						disabled={uploading}>
						<CloseIcon />
					</IconButton>

					{/* UPLOADING STATE */}
					{uploading && !uploadComplete && (
						<Box sx={{ textAlign: 'center', py: 8 }}>
							<CircularProgress
								size={60}
								sx={{
									'color': '#2196f3',
									'mb': 3,
									'animation': 'spin 1s linear infinite',
									'@keyframes spin': {
										'0%': { transform: 'rotate(0deg)' },
										'100%': { transform: 'rotate(360deg)' },
									},
								}}
							/>
							<Typography
								variant="h6"
								color="white"
								fontWeight={600}
								sx={{
									'animation': 'fadeSlideUp 0.3s ease-out',
									'@keyframes fadeSlideUp': {
										'0%': { opacity: 0, transform: 'translateY(10px)' },
										'100%': { opacity: 1, transform: 'translateY(0)' },
									},
								}}>
								Processing your file...
							</Typography>
							<Typography
								variant="body2"
								color="rgba(255,255,255,0.6)"
								mt={1}
								sx={{
									'animation': 'fadeSlideUp 0.3s ease-out 0.1s both',
									'@keyframes fadeSlideUp': {
										'0%': { opacity: 0, transform: 'translateY(10px)' },
										'100%': { opacity: 1, transform: 'translateY(0)' },
									},
								}}>
								This may take a few seconds.
							</Typography>
						</Box>
					)}

					{/* DEFAULT UPLOAD UI */}
					{!uploading && !uploadComplete && (
						<>
							<Box sx={{ textAlign: 'center' }}>
								<CloudUploadIcon
									sx={{
										'fontSize': 80,
										'color': '#2196f3',
										'mb': 2,
										'animation': 'gentleFloat 3s ease-in-out infinite',
										'@keyframes gentleFloat': {
											'0%': { transform: 'translateY(0px)' },
											'50%': { transform: 'translateY(-8px)' },
											'100%': { transform: 'translateY(0px)' },
										},
									}}
								/>

								<CompanySelectField
									companies={companies}
									label="Select Company"
									value={selectedCompany}
									loading={isLoadingCompanies}
									onChange={onSelectCompany}
									placeholder="Choose a company"
									disabled={!canSelectCompany}
									searchPlaceholder="Search companies..."
									sx={{
										'animation': 'fadeSlideDown 0.3s ease-out',
										'@keyframes fadeSlideDown': {
											'0%': { opacity: 0, transform: 'translateY(-10px)' },
											'100%': { opacity: 1, transform: 'translateY(0)' },
										},
									}}
								/>

								<Typography
									variant="h6"
									fontWeight={600}
									color="white"
									gutterBottom
									sx={{
										'animation': 'fadeSlideUp 0.3s ease-out 0.1s both',
										'@keyframes fadeSlideUp': {
											'0%': { opacity: 0, transform: 'translateY(10px)' },
											'100%': { opacity: 1, transform: 'translateY(0)' },
										},
									}}>
									Drop your Excel file here or click to browse
								</Typography>

								{/* Drop Zone */}
								<Box
									onDragOver={(e) => {
										e.preventDefault();
										setDragActive(true);
									}}
									onDragEnter={(e) => {
										e.preventDefault();
										setDragActive(true);
									}}
									onDragLeave={(e) => {
										e.preventDefault();
										setDragActive(false);
									}}
									onDrop={async (e) => {
										e.preventDefault();
										setDragActive(false);

										const file = e.dataTransfer.files?.[0];
										if (!file) return;

										setSelectedFile(file);
										await parseExcelPreview(file);
									}}
									sx={{
										'border': `2px dashed ${dragActive ? '#2196f3' : 'rgba(255,255,255,0.3)'}`,
										'borderRadius': 2,
										'padding': 4,
										'bgcolor': dragActive ? 'rgba(33,150,243,0.1)' : 'transparent',
										'minHeight': 120,
										'display': 'flex',
										'alignItems': 'center',
										'justifyContent': 'center',
										'position': 'relative',
										'cursor': 'pointer',
										'transition': 'all 0.3s ease',
										'animation': 'fadeSlideUp 0.3s ease-out 0.2s both',
										'@keyframes fadeSlideUp': {
											'0%': { opacity: 0, transform: 'translateY(10px)' },
											'100%': { opacity: 1, transform: 'translateY(0)' },
										},
									}}>
									<input
										type="file"
										accept=".xlsx,.xls"
										onChange={async (e) => {
											const file = e.target.files?.[0];
											if (!file) return;

											setSelectedFile(file);
											await parseExcelPreview(file);
										}}
										style={{
											opacity: 0,
											position: 'absolute',
											inset: 0,
											cursor: 'pointer',
										}}
									/>

									{selectedFile ? (
										<Box
											sx={{
												'display': 'inline-flex',
												'alignItems': 'center',
												'bgcolor': 'rgba(30,41,59,0.8)',
												'border': '1px solid rgba(100,116,139,0.4)',
												'borderRadius': 2,
												'px': 2,
												'py': 1.5,
												'gap': 1.5,
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
												}}
												sx={{
													'transition': 'all 0.2s ease',
													'&:hover': {
														transform: 'rotate(90deg)',
														color: '#f44336',
													},
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
											color="rgba(255,255,255,0.6)"
											sx={{
												'animation': 'pulse 2s infinite',
												'@keyframes pulse': {
													'0%': { opacity: 0.6 },
													'50%': { opacity: 1 },
													'100%': { opacity: 0.6 },
												},
											}}>
											staff_data_q3_2024.xlsx
										</Typography>
									)}
								</Box>

								{/* Action Buttons */}
								<Box
									sx={{
										'display': 'flex',
										'gap': 2,
										'mt': 3,
										'justifyContent': 'center',
										'animation': 'fadeSlideUp 0.3s ease-out 0.3s both',
										'@keyframes fadeSlideUp': {
											'0%': { opacity: 0, transform: 'translateY(10px)' },
											'100%': { opacity: 1, transform: 'translateY(0)' },
										},
									}}>
									<Button
										variant="outlined"
										disabled={!selectedFile || !excelPreview}
										startIcon={<VisibilityIcon sx={{ transition: 'transform 0.2s ease' }} />}
										onClick={handleOpenPreview}
										sx={{
											'px': 4,
											'borderRadius': 2,
											'textTransform': 'none',
											'fontWeight': 600,
											'borderColor': '#2196f3',
											'color': '#2196f3',
											'transition': 'all 0.3s ease',
											'&:hover': {
												'borderColor': '#1976d2',
												'bgcolor': 'rgba(33, 150, 243, 0.08)',
												'transform': 'scale(1.02)',
												'& .MuiSvgIcon-root': {
													transform: 'scale(1.1)',
												},
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
												'bgcolor': '#1976d2',
												'transform': 'scale(1.02)',
												'&::before': {
													width: '200px',
													height: '200px',
												},
											},
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

			{/* Preview Modal */}
			<Modal
				open={showPreviewModal}
				onClose={() => setShowPreviewModal(false)}
				closeAfterTransition
				slots={{ backdrop: 'div' }}
				slotProps={{
					backdrop: {
						sx: {
							backdropFilter: 'blur(10px)',
							backgroundColor: 'rgba(0,0,0,0.8)',
							transition: 'opacity 0.3s ease-in-out',
							opacity: showPreviewModal ? 1 : 0,
						},
					},
				}}>
				<Box
					sx={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						transform: showPreviewModal ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -40%) scale(0.9)',
						opacity: showPreviewModal ? 1 : 0,
						transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
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
							'p': 3,
							'borderBottom': '1px solid rgba(255,255,255,0.12)',
							'display': 'flex',
							'justifyContent': 'space-between',
							'alignItems': 'center',
							'animation': showPreviewModal ? 'fadeSlideRight 0.3s ease-out' : 'none',
							'@keyframes fadeSlideRight': {
								'0%': { opacity: 0, transform: 'translateX(-10px)' },
								'100%': { opacity: 1, transform: 'translateX(0)' },
							},
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
							sx={{
								'color': 'rgba(255,255,255,0.7)',
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
								'bgcolor': '#0b1220',
								'border': '1px solid rgba(255,255,255,0.12)',
								'borderRadius': 2,
								'overflow': 'hidden',
								'animation': showPreviewModal ? 'fadeIn 0.3s ease-out 0.1s both' : 'none',
								'@keyframes fadeIn': {
									'0%': { opacity: 0 },
									'100%': { opacity: 1 },
								},
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
											{excelPreview?.headers.map((h, index) => (
												<TableCell
													key={h}
													sx={{
														'color': 'rgba(255,255,255,0.9)',
														'fontWeight': 700,
														'bgcolor': '#162033',
														'fontSize': '0.8rem',
														'textTransform': 'uppercase',
														'letterSpacing': '0.5px',
														'minWidth': 150,
														'whiteSpace': 'nowrap',
														'animation': showPreviewModal ? `fadeSlideDown 0.2s ease-out ${index * 0.02}s both` : 'none',
														'@keyframes fadeSlideDown': {
															'0%': { opacity: 0, transform: 'translateY(-5px)' },
															'100%': { opacity: 1, transform: 'translateY(0)' },
														},
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
														bgcolor: '#1a2332',
														transition: 'all 0.2s ease',
													},
													'bgcolor': i % 2 === 0 ? '#0f172a' : '#0b1220',
													'animation': showPreviewModal ? `fadeIn 0.2s ease-out ${i * 0.01}s both` : 'none',
													'@keyframes fadeIn': {
														'0%': { opacity: 0 },
														'100%': { opacity: 1 },
													},
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
							'p': 3,
							'borderTop': '1px solid rgba(255,255,255,0.12)',
							'display': 'flex',
							'justifyContent': 'space-between',
							'alignItems': 'center',
							'animation': showPreviewModal ? 'fadeSlideUp 0.3s ease-out 0.2s both' : 'none',
							'@keyframes fadeSlideUp': {
								'0%': { opacity: 0, transform: 'translateY(10px)' },
								'100%': { opacity: 1, transform: 'translateY(0)' },
							},
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
								'transition': 'all 0.2s ease',
								'&:hover': {
									bgcolor: '#1976d2',
									transform: 'scale(1.02)',
								},
							}}>
							Close
						</Button>
					</Box>
				</Box>
			</Modal>

			{/* Upload Success Modal */}
			<Modal
				open={showSuccessModal}
				onClose={() => {
					setShowSuccessModal(false);
					setUploadResult(null);
				}}
				closeAfterTransition
				slots={{ backdrop: 'div' }}
				slotProps={{
					backdrop: {
						sx: {
							backdropFilter: 'blur(10px)',
							backgroundColor: 'rgba(0,0,0,0.8)',
							transition: 'opacity 0.3s ease-in-out',
							opacity: showSuccessModal ? 1 : 0,
						},
					},
				}}>
				<Box
					sx={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						transform: showSuccessModal ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -40%) scale(0.9)',
						opacity: showSuccessModal ? 1 : 0,
						transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
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
							maxWidth: 400,
							mx: 'auto',
							width: '100%',
							p: 5,
							overflowY: 'auto',
							overflowX: 'hidden',
						}}>
						{/* Success Icon */}
						<Box
							sx={{
								'width': 80,
								'height': 80,
								'borderRadius': '50%',
								'bgcolor': '#113727',
								'display': 'flex',
								'alignItems': 'center',
								'justifyContent': 'center',
								'mx': 'auto',
								'mb': 3,
								'animation': showSuccessModal ? 'popIn 0.4s ease-out' : 'none',
								'@keyframes popIn': {
									'0%': { transform: 'scale(0.5)', opacity: 0 },
									'50%': { transform: 'scale(1.1)' },
									'100%': { transform: 'scale(1)', opacity: 1 },
								},
							}}>
							<CheckIcon sx={{ fontSize: 48, color: '#4fca7b' }} />
						</Box>

						<Typography
							variant="h5"
							fontWeight={700}
							color="white"
							gutterBottom
							textAlign={'center'}
							sx={{
								'animation': showSuccessModal ? 'fadeSlideUp 0.3s ease-out 0.1s both' : 'none',
								'@keyframes fadeSlideUp': {
									'0%': { opacity: 0, transform: 'translateY(10px)' },
									'100%': { opacity: 1, transform: 'translateY(0)' },
								},
							}}>
							Upload Complete
						</Typography>
						<Typography
							variant="body2"
							color="rgba(255,255,255,0.7)"
							sx={{
								'mb': 4,
								'textAlign': 'center',
								'animation': showSuccessModal ? 'fadeSlideUp 0.3s ease-out 0.15s both' : 'none',
								'@keyframes fadeSlideUp': {
									'0%': { opacity: 0, transform: 'translateY(10px)' },
									'100%': { opacity: 1, transform: 'translateY(0)' },
								},
							}}>
							Your employee data file has been processed successfully.
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
							].map((stat, index) => (
								<Box
									key={stat.label}
									sx={{
										'border': '1px solid #283138',
										'borderRadius': 1,
										'backdropFilter': 'blur(10px)',
										'px': 3,
										'py': 3,
										'textAlign': 'center',
										'animation': showSuccessModal ? `fadeSlideUp 0.3s ease-out ${0.2 + index * 0.1}s both` : 'none',
										'transition': 'all 0.2s ease',
										'&:hover': {
											transform: 'translateY(-2px)',
											borderColor: stat.color,
										},
										'@keyframes fadeSlideUp': {
											'0%': { opacity: 0, transform: 'translateY(10px)' },
											'100%': { opacity: 1, transform: 'translateY(0)' },
										},
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
						{/* {uploadResult && uploadResult.failed > 0 && (
							<Accordion
								sx={{
									'bgcolor': '#1c252e',
									'border': '1px solid #1c252e',
									'borderRadius': 1,
									'mb': 4,
									'&:before': { display: 'none' },
									'animation': showSuccessModal ? 'fadeSlideUp 0.3s ease-out 0.4s both' : 'none',
									'@keyframes fadeSlideUp': {
										'0%': { opacity: 0, transform: 'translateY(10px)' },
										'100%': { opacity: 1, transform: 'translateY(0)' },
									},
								}}>
								<AccordionSummary
									expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}
									sx={{
										'transition': 'all 0.2s ease',
										'&:hover': {
											bgcolor: '#283138',
										},
									}}>
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
														sx={{
															'mb': 1,
															'animation': showSuccessModal ? `fadeSlideRight 0.2s ease-out ${i * 0.02}s both` : 'none',
															'@keyframes fadeSlideRight': {
																'0%': { opacity: 0, transform: 'translateX(-5px)' },
																'100%': { opacity: 1, transform: 'translateX(0)' },
															},
														}}>
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
						)} */}

						{/* Action Buttons */}
						<Box
							sx={{
								'display': 'flex',
								'justifyContent': 'right',
								'gap': 2,
								'animation': showSuccessModal ? 'fadeSlideUp 0.3s ease-out 0.5s both' : 'none',
								'@keyframes fadeSlideUp': {
									'0%': { opacity: 0, transform: 'translateY(10px)' },
									'100%': { opacity: 1, transform: 'translateY(0)' },
								},
							}}>
							<Button
								variant="outlined"
								onClick={() => downloadFailedReport(uploadResult?.uploadId)}
								sx={{
									'bgcolor': '#283138',
									'borderColor': '#283138',
									'color': '#fff',
									'px': 4,
									'py': 1,
									'borderRadius': 1,
									'textTransform': 'none',
									'transition': 'all 0.2s ease',
									'&:hover': {
										borderColor: '#283138',
										bgcolor: 'rgba(255,255,255,0.08)',
										transform: 'scale(1.02)',
									},
								}}>
								Download Report
							</Button>
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
										'&::before': {
											width: '200px',
											height: '200px',
										},
									},
								}}>
								Done
							</Button>
						</Box>
					</Box>
				</Box>
			</Modal>

			{/* Other Modals */}
			<RegisterUserModal
				open={isRegisterUserModalOpen}
				onClose={handleCloseRegisterUserModal}
				onSubmit={handleSubmitRegisterUser}
			/>

			<StaffViewModal
				open={isViewOpen}
				user={selectedUser}
				onClose={() => setIsViewOpen(false)}
			/>

			<StaffEditModal
				open={isEditUserOpen}
				user={selectedUser}
				currentUserRole={role}
				onClose={() => setIsEditUserOpen(false)}
				onSave={(updatedData) => onSaveEditStaff(updatedData)}
			/>

			<StaffDeleteModal
				open={isDeleteOpen}
				staffName={staffToDelete ? `${staffToDelete.firstName} ${staffToDelete.lastName}` : ''}
				onClose={() => {
					setIsDeleteOpen(false);
					setStaffToDelete(null);
				}}
				onConfirm={onDeleteStaff}
			/>
		</Box>
	);
};

export default StaffManagement;
