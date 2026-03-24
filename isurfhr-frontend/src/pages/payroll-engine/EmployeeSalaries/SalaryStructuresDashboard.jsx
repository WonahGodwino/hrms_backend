// src/pages/payroll-engine/EmployeeSalaries/SalaryStructuresDashboard.jsx
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
	Pagination,
	PaginationItem,
	useTheme,
	InputAdornment,
	IconButton,
	Tooltip,
	Menu,
	MenuItem,
	ListItemIcon,
	ListItemText,
	CircularProgress,
	Alert,
	Chip,
	FormControl,
	InputLabel,
	Select,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';

import { getSalaryStructures, deactivateSalary } from '@/services/PayrollEngineService';
import { formatCurrency } from '@/components/payroll-engine';
import CreateSalaryModal from './CreateSalaryModal';
import BulkImportSalariesModal from './BulkImportSalariesModal';

const SalaryStructuresDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Data State
	const [salaries, setSalaries] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Pagination State
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const rowsPerPage = 10;

	// Filter State
	const [searchTerm, setSearchTerm] = useState('');
	const [categoryFilter, setCategoryFilter] = useState('');
	const [activeFilter, setActiveFilter] = useState('true');

	// Menu State
	const [anchorEl, setAnchorEl] = useState(null);
	const [selectedSalary, setSelectedSalary] = useState(null);
	const openMenu = Boolean(anchorEl);

	// Modal State
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [importModalOpen, setImportModalOpen] = useState(false);
	const [editingSalary, setEditingSalary] = useState(null);

	// Fetch salaries
	const fetchSalaries = React.useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const params = {
				page,
				limit: rowsPerPage,
				...(activeFilter && { isActive: activeFilter }),
				...(categoryFilter && { employeeCategory: categoryFilter }),
			};

			const response = await getSalaryStructures(params);

			if (response.data) {
				let data = response.data.data || [];
				// Client-side search filter
				if (searchTerm) {
					const search = searchTerm.toLowerCase();
					data = data.filter(
						(s) => {
							const fullName = s.staff?.fullName || `${s.staff?.firstName || ''} ${s.staff?.lastName || ''}`.trim();
							return (
								fullName?.toLowerCase().includes(search) ||
								s.staff?.email?.toLowerCase().includes(search) ||
								s.accountName?.toLowerCase().includes(search)
							);
						}
					);
				}
				setSalaries(data);
				setTotalCount(response.data.total || data.length);
			}
		} catch (err) {
			console.error('Failed to fetch salary structures:', err);
			setError('Unable to load salary structures. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [page, rowsPerPage, activeFilter, categoryFilter, searchTerm]);

	useEffect(() => {
		fetchSalaries();
	}, [page, categoryFilter, activeFilter, fetchSalaries]);

	// Debounced search
	useEffect(() => {
		const timer = setTimeout(() => {
			fetchSalaries();
		}, 300);
		return () => clearTimeout(timer);
	}, [fetchSalaries, searchTerm]);

	// Handlers
	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleActionClick = (event, salary) => {
		setAnchorEl(event.currentTarget);
		setSelectedSalary(salary);
	};

	const handleCloseMenu = () => {
		setAnchorEl(null);
	};

	const handleEdit = () => {
		handleCloseMenu();
		setEditingSalary(selectedSalary);
		setCreateModalOpen(true);
	};

	const handleDeactivate = async () => {
		handleCloseMenu();
		const staffId = selectedSalary?.staffId || selectedSalary?.staff?.id;
		if (!staffId) return;

		try {
			await deactivateSalary(staffId);
			fetchSalaries();
		} catch (err) {
			console.error('Failed to deactivate salary:', err);
			setError('Failed to deactivate salary structure.');
		}
	};

	const handleModalClose = () => {
		setCreateModalOpen(false);
		setEditingSalary(null);
	};

	const handleSuccess = () => {
		handleModalClose();
		setImportModalOpen(false);
		fetchSalaries();
	};

	// Calculate total allowances (values may be strings from API)
	const calcTotalAllowances = (salary) => {
		return (
			(parseFloat(salary.housingAllowance) || 0) +
			(parseFloat(salary.transportAllowance) || 0) +
			(parseFloat(salary.dressingAllowance) || 0) +
			(parseFloat(salary.leaveAllowance) || 0) +
			(parseFloat(salary.entertainmentAllowance) || 0) +
			(parseFloat(salary.utilityAllowance) || 0) +
			(parseFloat(salary.otherAllowances) || 0)
		);
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
				backgroundColor: isDarkMode ? '#101922' : '#f6f7f8',
				fontFamily: '"Inter", sans-serif',
			}}>
			<Box sx={{ width: '100%', maxWidth: '1200px' }}>
				{/* Error Alert */}
				{error && (
					<Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}

				{/* Main Paper */}
				<Paper
					elevation={0}
					sx={{
						borderRadius: 3,
						border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						overflow: 'hidden',
						boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
					}}>
					{/* Header */}
					<Box
						sx={{
							p: { xs: 3, md: 4 },
							borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`,
						}}>
						<Box
							sx={{
								display: 'flex',
								flexDirection: { xs: 'column', md: 'row' },
								justifyContent: 'space-between',
								alignItems: { xs: 'flex-start', md: 'center' },
								gap: 2,
							}}>
							<Box>
								<Typography
									variant="h4"
									component="h2"
									sx={{
										fontWeight: 900,
										fontSize: '1.875rem',
										color: isDarkMode ? '#ffffff' : '#0f172a',
										letterSpacing: '-0.025em',
										mb: 0.5,
									}}>
									Salary Structures
								</Typography>
								<Typography
									variant="body1"
									sx={{
										color: isDarkMode ? '#94a3b8' : '#64748b',
										fontSize: '1rem',
									}}>
									Manage employee compensation and banking details
								</Typography>
							</Box>

							<Box sx={{ display: 'flex', gap: 2 }}>
								<Button
									variant="outlined"
									startIcon={<CloudUploadIcon />}
									onClick={() => setImportModalOpen(true)}
									sx={{
										borderColor: isDarkMode ? '#475569' : '#cbd5e1',
										color: isDarkMode ? '#e2e8f0' : '#475569',
										fontWeight: 600,
										textTransform: 'none',
										borderRadius: '9999px',
										height: 48,
										px: 3,
										'&:hover': {
											borderColor: isDarkMode ? '#94a3b8' : '#94a3b8',
											bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
										},
									}}>
									Import
								</Button>

								<Button
									variant="contained"
									startIcon={<AddIcon />}
									onClick={() => setCreateModalOpen(true)}
									sx={{
										bgcolor: '#137fec',
										color: '#fff',
										fontWeight: 700,
										textTransform: 'none',
										borderRadius: '9999px',
										height: 48,
										px: 3,
										boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
										'&:hover': { bgcolor: '#1d4ed8' },
									}}>
									Add Salary
								</Button>
							</Box>
						</Box>
					</Box>

					{/* Toolbar */}
					<Box
						sx={{
							px: { xs: 3, md: 4 },
							py: 2,
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						}}>
						<Box
							sx={{
								display: 'flex',
								flexDirection: { xs: 'column', sm: 'row' },
								gap: 2,
								alignItems: 'center',
							}}>
							{/* Search */}
							<TextField
								placeholder="Search by name or email..."
								size="small"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								sx={{
									'width': { xs: '100%', sm: '280px' },
									'& .MuiOutlinedInput-root': {
										'borderRadius': '9999px',
										'bgcolor': isDarkMode ? '#1e293b' : '#f8fafc',
										'& fieldset': { border: 'none' },
									},
								}}
								InputProps={{
									startAdornment: (
										<InputAdornment position="start">
											<SearchIcon sx={{ color: isDarkMode ? '#94a3b8' : '#9ca3af' }} />
										</InputAdornment>
									),
								}}
							/>

							{/* Category Filter */}
							<FormControl size="small" sx={{ minWidth: 140 }}>
								<InputLabel sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Category</InputLabel>
								<Select
									value={categoryFilter}
									label="Category"
									onChange={(e) => setCategoryFilter(e.target.value)}
									sx={{
										'borderRadius': 2,
										'bgcolor': isDarkMode ? '#1e293b' : '#f8fafc',
										'& .MuiOutlinedInput-notchedOutline': {
											borderColor: isDarkMode ? '#334155' : '#e2e8f0',
										},
									}}>
									<MenuItem value="">All</MenuItem>
									<MenuItem value="REGULAR">Regular</MenuItem>
									<MenuItem value="CONTRACT">Contract</MenuItem>
								</Select>
							</FormControl>

							{/* Active Filter */}
							<FormControl size="small" sx={{ minWidth: 120 }}>
								<InputLabel sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Status</InputLabel>
								<Select
									value={activeFilter}
									label="Status"
									onChange={(e) => setActiveFilter(e.target.value)}
									sx={{
										'borderRadius': 2,
										'bgcolor': isDarkMode ? '#1e293b' : '#f8fafc',
										'& .MuiOutlinedInput-notchedOutline': {
											borderColor: isDarkMode ? '#334155' : '#e2e8f0',
										},
									}}>
									<MenuItem value="">All</MenuItem>
									<MenuItem value="true">Active</MenuItem>
									<MenuItem value="false">Inactive</MenuItem>
								</Select>
							</FormControl>

							<Box sx={{ flex: 1 }} />

							<Tooltip title="Refresh">
								<IconButton
									onClick={fetchSalaries}
									sx={{
										color: isDarkMode ? '#94a3b8' : '#64748b',
										'&:hover': { bgcolor: isDarkMode ? '#334155' : '#f1f5f9' },
									}}>
									<RefreshIcon />
								</IconButton>
							</Tooltip>
						</Box>
					</Box>

					{/* Table */}
					<TableContainer>
						<Table sx={{ minWidth: 900 }}>
							<TableHead>
								<TableRow
									sx={{
										bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
										borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									{['Employee', 'Category', 'Basic Salary', 'Allowances', 'Bank', 'Status', 'Actions'].map(
										(head) => (
											<TableCell
												key={head}
												align={head === 'Actions' ? 'right' : 'left'}
												sx={{
													py: 2,
													px: 3,
													fontSize: '0.75rem',
													fontWeight: 600,
													textTransform: 'uppercase',
													letterSpacing: '0.05em',
													color: isDarkMode ? '#94a3b8' : '#64748b',
												}}>
												{head}
											</TableCell>
										)
									)}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={7} align="center" sx={{ py: 6 }}>
											<CircularProgress size={30} />
											<Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
												Loading salary structures...
											</Typography>
										</TableCell>
									</TableRow>
								) : salaries.length === 0 ? (
									<TableRow>
										<TableCell colSpan={7} align="center" sx={{ py: 6 }}>
											<Typography variant="body1" sx={{ color: 'text.secondary' }}>
												No salary structures found.
											</Typography>
										</TableCell>
									</TableRow>
								) : (
									salaries.map((salary) => (
										<TableRow
											key={salary._id}
											sx={{
												'&:hover': {
													bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
												},
												borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`,
												transition: 'background-color 150ms',
											}}>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Typography
													variant="body2"
													sx={{
														fontWeight: 600,
														color: isDarkMode ? '#fff' : '#0f172a',
													}}>
													{salary.staff?.fullName || `${salary.staff?.firstName || ''} ${salary.staff?.lastName || ''}`.trim() || '--'}
												</Typography>
												<Typography
													variant="caption"
													sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }}>
													{salary.staff?.email || '--'}
												</Typography>
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Chip
													label={salary.employeeCategory || 'REGULAR'}
													size="small"
													sx={{
														height: 24,
														fontSize: '0.7rem',
														fontWeight: 500,
														textTransform: 'capitalize',
														bgcolor:
															salary.employeeCategory === 'CONTRACT'
																? isDarkMode
																	? 'rgba(251, 191, 36, 0.15)'
																	: '#fef3c7'
																: isDarkMode
																	? 'rgba(59, 130, 246, 0.15)'
																	: '#dbeafe',
														color:
															salary.employeeCategory === 'CONTRACT'
																? isDarkMode
																	? '#fbbf24'
																	: '#b45309'
																: isDarkMode
																	? '#60a5fa'
																	: '#1d4ed8',
													}}
												/>
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													fontFamily: '"Inter", monospace',
													fontWeight: 600,
													color: isDarkMode ? '#e2e8f0' : '#0f172a',
												}}>
												{formatCurrency(salary.basicSalary)}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													fontFamily: '"Inter", monospace',
													color: isDarkMode ? '#94a3b8' : '#64748b',
												}}>
												{formatCurrency(calcTotalAllowances(salary))}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Typography
													variant="body2"
													sx={{ color: isDarkMode ? '#e2e8f0' : '#334155' }}>
													{salary.bankName || '--'}
												</Typography>
												<Typography
													variant="caption"
													sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }}>
													{salary.accountNumber || '--'}
												</Typography>
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Chip
													label={salary.isActive ? 'Active' : 'Inactive'}
													size="small"
													sx={{
														height: 24,
														fontSize: '0.7rem',
														fontWeight: 500,
														bgcolor: salary.isActive
															? isDarkMode
																? 'rgba(34, 197, 94, 0.15)'
																: '#d1fae5'
															: isDarkMode
																? 'rgba(239, 68, 68, 0.15)'
																: '#fee2e2',
														color: salary.isActive
															? isDarkMode
																? '#22c55e'
																: '#047857'
															: isDarkMode
																? '#ef4444'
																: '#b91c1c',
													}}
												/>
											</TableCell>
											<TableCell align="right" sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<IconButton
													size="small"
													onClick={(e) => handleActionClick(e, salary)}
													sx={{
														'color': isDarkMode ? '#94a3b8' : '#94a3b8',
														'&:hover': {
															color: '#137fec',
															bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f1f5f9',
														},
													}}>
													<MoreVertIcon fontSize="small" />
												</IconButton>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{/* Pagination */}
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							flexDirection: { xs: 'column', sm: 'row' },
							p: 2,
							px: 3,
							borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
						}}>
						<Typography
							variant="body2"
							sx={{
								color: isDarkMode ? '#94a3b8' : '#64748b',
								mb: { xs: 2, sm: 0 },
							}}>
							Showing{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{salaries.length > 0 ? (page - 1) * rowsPerPage + 1 : 0}
							</Box>{' '}
							to{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{salaries.length > 0 ? (page - 1) * rowsPerPage + salaries.length : 0}
							</Box>{' '}
							of{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{totalCount}
							</Box>{' '}
							results
						</Typography>

						<Pagination
							count={Math.ceil(totalCount / rowsPerPage) || 1}
							page={page}
							onChange={handlePageChange}
							renderItem={(item) => (
								<PaginationItem
									slots={{ previous: ChevronLeftIcon, next: ChevronRightIcon }}
									{...item}
									sx={{
										'borderRadius': 2,
										'width': 32,
										'height': 32,
										'margin': '0 2px',
										'color': isDarkMode ? '#94a3b8' : '#475569',
										'fontSize': '0.875rem',
										'fontWeight': 500,
										'&.Mui-selected': {
											'backgroundColor': '#137fec',
											'color': '#ffffff',
											'fontWeight': 700,
											'&:hover': { backgroundColor: '#1170d0' },
										},
										'&:hover': { backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' },
									}}
								/>
							)}
						/>
					</Box>
				</Paper>

				{/* Actions Menu */}
				<Menu
					anchorEl={anchorEl}
					open={openMenu}
					onClose={handleCloseMenu}
					PaperProps={{
						elevation: 0,
						sx: {
							overflow: 'visible',
							filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.15))',
							mt: 1.5,
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							color: isDarkMode ? '#e2e8f0' : '#1e293b',
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							borderRadius: 2,
							minWidth: 160,
						},
					}}
					transformOrigin={{ horizontal: 'right', vertical: 'top' }}
					anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
					<MenuItem onClick={handleEdit}>
						<ListItemIcon>
							<EditIcon fontSize="small" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
						</ListItemIcon>
						<ListItemText primary="Edit" />
					</MenuItem>
					<MenuItem onClick={handleDeactivate} sx={{ color: '#ef4444' }}>
						<ListItemIcon>
							<DeleteIcon fontSize="small" sx={{ color: '#ef4444' }} />
						</ListItemIcon>
						<ListItemText primary="Deactivate" />
					</MenuItem>
				</Menu>

				{/* Create/Edit Modal */}
				<CreateSalaryModal
					open={createModalOpen}
					onClose={handleModalClose}
					onSuccess={handleSuccess}
					editData={editingSalary}
				/>

				{/* Import Modal */}
				<BulkImportSalariesModal
					open={importModalOpen}
					onClose={() => setImportModalOpen(false)}
					onSuccess={handleSuccess}
				/>
			</Box>
		</Box>
	);
};

export default SalaryStructuresDashboard;
