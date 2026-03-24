// src/pages/payroll-engine/TaxFiling/TaxProfilesDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
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
	Select,
	FormControl,
	InputLabel,
	Chip,
	Snackbar,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogContentText,
	DialogActions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import LockIcon from '@mui/icons-material/Lock';
import WarningIcon from '@mui/icons-material/Warning';

import {
	getTaxProfiles,
	deleteTaxProfile,
	downloadProfileTemplate,
	lockStatesForYear,
	getLockStatus,
	NIGERIA_STATES,
} from '@/services/TaxFilingService';
import { useAuth } from '@/lib/context/AuthContext';
import TaxProfileFormModal from './TaxProfileFormModal';
import BulkImportProfilesModal from './BulkImportProfilesModal';

const TaxProfilesDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const { user } = useAuth();

	const companyId = user?.companyId || user?.company?.id;

	// Data State
	const [profiles, setProfiles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Pagination State
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const rowsPerPage = 10;

	// Filter State
	const [stateFilter, setStateFilter] = useState('');
	const [searchQuery, setSearchQuery] = useState('');
	const [showMissing, setShowMissing] = useState(false);

	// Lock State
	const [lockStatus, setLockStatus] = useState(null);
	const [lockDialogOpen, setLockDialogOpen] = useState(false);
	const [locking, setLocking] = useState(false);

	// Menu State
	const [anchorEl, setAnchorEl] = useState(null);
	const [selectedProfile, setSelectedProfile] = useState(null);
	const openMenu = Boolean(anchorEl);

	// Modal State
	const [formModalOpen, setFormModalOpen] = useState(false);
	const [editingProfile, setEditingProfile] = useState(null);
	const [importModalOpen, setImportModalOpen] = useState(false);

	// Delete State
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Snackbar State
	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

	// Fetch profiles
	const fetchProfiles = useCallback(async () => {
		if (!companyId) return;

		setLoading(true);
		setError(null);
		try {
			const params = {
				companyId,
				page,
				limit: rowsPerPage,
				...(stateFilter && { state: stateFilter }),
				...(searchQuery && { search: searchQuery }),
				...(showMissing && { missingProfiles: true }),
			};

			const response = await getTaxProfiles(params);
			if (response.data?.success) {
				if (showMissing) {
					setProfiles(response.data.data.employees || []);
					setTotalCount(response.data.data.total || 0);
				} else {
					setProfiles(response.data.data.profiles || []);
					setTotalCount(response.data.data.total || 0);
				}
			}
		} catch (err) {
			console.error('Failed to fetch tax profiles:', err);
			setError('Unable to load tax profiles. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [companyId, page, rowsPerPage, stateFilter, searchQuery, showMissing]);

	// Fetch lock status
	const fetchLockStatus = useCallback(async () => {
		if (!companyId) return;
		try {
			const response = await getLockStatus(companyId);
			if (response.data?.success) {
				setLockStatus(response.data.data);
			}
		} catch (err) {
			console.error('Failed to fetch lock status:', err);
		}
	}, [companyId]);

	useEffect(() => {
		fetchProfiles();
		fetchLockStatus();
	}, [fetchProfiles, fetchLockStatus]);

	// Handle delete
	const handleDelete = async () => {
		if (!selectedProfile || !companyId) return;

		setDeleting(true);
		try {
			const staffId = selectedProfile.staffId || selectedProfile.id;
			await deleteTaxProfile(staffId, companyId);
			setSnackbar({
				open: true,
				message: 'Tax profile deleted successfully',
				severity: 'success',
			});
			setDeleteDialogOpen(false);
			setSelectedProfile(null);
			fetchProfiles();
		} catch (err) {
			console.error('Failed to delete tax profile:', err);
			setSnackbar({
				open: true,
				message: err.response?.data?.message || 'Failed to delete tax profile',
				severity: 'error',
			});
		} finally {
			setDeleting(false);
		}
	};

	// Handle lock states
	const handleLockStates = async () => {
		if (!companyId) return;

		setLocking(true);
		try {
			const year = new Date().getFullYear();
			const response = await lockStatesForYear({ year, companyId });
			if (response.data?.success) {
				setSnackbar({
					open: true,
					message: response.data.message || `States locked for ${year}`,
					severity: 'success',
				});
				setLockDialogOpen(false);
				fetchLockStatus();
			}
		} catch (err) {
			console.error('Failed to lock states:', err);
			setSnackbar({
				open: true,
				message: err.response?.data?.message || 'Failed to lock states',
				severity: 'error',
			});
		} finally {
			setLocking(false);
		}
	};

	// Handle download template
	const handleDownloadTemplate = async () => {
		if (!companyId) return;

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
			setSnackbar({
				open: true,
				message: 'Failed to download template',
				severity: 'error',
			});
		}
	};

	// Handlers
	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleActionClick = (event, profile) => {
		setAnchorEl(event.currentTarget);
		setSelectedProfile(profile);
	};

	const handleCloseMenu = () => {
		setAnchorEl(null);
	};

	const handleEdit = () => {
		setEditingProfile(selectedProfile);
		setFormModalOpen(true);
		handleCloseMenu();
	};

	const handleAddNew = () => {
		setEditingProfile(null);
		setFormModalOpen(true);
	};

	const handleFormSuccess = () => {
		setFormModalOpen(false);
		setEditingProfile(null);
		fetchProfiles();
	};

	const handleImportSuccess = () => {
		setImportModalOpen(false);
		fetchProfiles();
	};

	// Format TIN
	const formatTIN = (tin) => {
		if (!tin) return '-';
		const cleaned = tin.replace(/\D/g, '');
		if (cleaned.length === 13) {
			return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7, 11)}-${cleaned.slice(11)}`;
		}
		return tin;
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
				{error && (
					<Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}

				{/* Lock Status Banner */}
				{lockStatus && (
					<Paper
						elevation={0}
						sx={{
							p: 2,
							mb: 3,
							borderRadius: 3,
							border: `1px solid ${lockStatus.locked ? '#22c55e' : '#f59e0b'}`,
							bgcolor: lockStatus.locked
								? isDarkMode
									? 'rgba(34, 197, 94, 0.1)'
									: 'rgba(34, 197, 94, 0.05)'
								: isDarkMode
									? 'rgba(245, 158, 11, 0.1)'
									: 'rgba(245, 158, 11, 0.05)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							flexWrap: 'wrap',
							gap: 2,
						}}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
							{lockStatus.locked ? (
								<LockIcon sx={{ color: '#22c55e' }} />
							) : (
								<WarningIcon sx={{ color: '#f59e0b' }} />
							)}
							<Box>
								<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
									{lockStatus.locked
										? `States locked for ${lockStatus.year}`
										: 'States not locked for this year'}
								</Typography>
								<Typography variant="body2" color="text.secondary">
									{lockStatus.locked
										? `Locked on ${new Date(lockStatus.lockedDate).toLocaleDateString()}`
										: 'Per PITA, employee tax states should be locked on January 1st'}
								</Typography>
							</Box>
						</Box>
						{!lockStatus.locked && (
							<Button
								variant="contained"
								startIcon={<LockIcon />}
								onClick={() => setLockDialogOpen(true)}
								sx={{
									bgcolor: '#f59e0b',
									'&:hover': { bgcolor: '#d97706' },
								}}>
								Lock States for {new Date().getFullYear()}
							</Button>
						)}
					</Paper>
				)}

				{/* Main Paper */}
				<Paper
					elevation={0}
					sx={{
						borderRadius: 3,
						border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						overflow: 'hidden',
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
									sx={{
										fontWeight: 900,
										fontSize: '1.875rem',
										color: isDarkMode ? '#ffffff' : '#0f172a',
									}}>
									Tax Profiles
								</Typography>
								<Typography variant="body1" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
									Manage employee state assignments and JTB TINs
								</Typography>
							</Box>

							<Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
								<Button
									variant="outlined"
									startIcon={<DownloadIcon />}
									onClick={handleDownloadTemplate}
									sx={{
										borderColor: isDarkMode ? '#334155' : '#e2e8f0',
										color: isDarkMode ? '#e2e8f0' : '#1e293b',
									}}>
									Template
								</Button>
								<Button
									variant="outlined"
									startIcon={<UploadFileIcon />}
									onClick={() => setImportModalOpen(true)}
									sx={{
										borderColor: isDarkMode ? '#334155' : '#e2e8f0',
										color: isDarkMode ? '#e2e8f0' : '#1e293b',
									}}>
									Import
								</Button>
								<Button
									variant="contained"
									startIcon={<AddIcon />}
									onClick={handleAddNew}
									sx={{
										bgcolor: '#137fec',
										'&:hover': { bgcolor: '#1d4ed8' },
									}}>
									Add Profile
								</Button>
							</Box>
						</Box>
					</Box>

					{/* Toolbar */}
					<Box sx={{ px: { xs: 3, md: 4 }, py: 2 }}>
						<Box
							sx={{
								display: 'flex',
								flexDirection: { xs: 'column', sm: 'row' },
								gap: 2,
								alignItems: 'center',
							}}>
							{/* State Filter */}
							<FormControl size="small" sx={{ minWidth: 150 }}>
								<InputLabel>State</InputLabel>
								<Select
									value={stateFilter}
									label="State"
									onChange={(e) => {
										setStateFilter(e.target.value);
										setPage(1);
									}}
									sx={{
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
									}}>
									<MenuItem value="">All States</MenuItem>
									{NIGERIA_STATES.map((state) => (
										<MenuItem key={state.code} value={state.code}>
											{state.name}
										</MenuItem>
									))}
								</Select>
							</FormControl>

							{/* Show Missing Toggle */}
							<FormControl size="small" sx={{ minWidth: 180 }}>
								<InputLabel>View</InputLabel>
								<Select
									value={showMissing ? 'missing' : 'all'}
									label="View"
									onChange={(e) => {
										setShowMissing(e.target.value === 'missing');
										setPage(1);
									}}
									sx={{
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
									}}>
									<MenuItem value="all">All Profiles</MenuItem>
									<MenuItem value="missing">Missing Profiles</MenuItem>
								</Select>
							</FormControl>

							{/* Search */}
							<TextField
								size="small"
								placeholder="Search by name or staff ID..."
								value={searchQuery}
								onChange={(e) => {
									setSearchQuery(e.target.value);
									setPage(1);
								}}
								InputProps={{
									startAdornment: (
										<InputAdornment position="start">
											<SearchIcon sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
										</InputAdornment>
									),
								}}
								sx={{
									'flex': 1,
									'maxWidth': 300,
									'& .MuiOutlinedInput-root': {
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
									},
								}}
							/>

							<Box sx={{ flex: 1 }} />

							<Tooltip title="Refresh">
								<IconButton onClick={fetchProfiles}>
									<RefreshIcon />
								</IconButton>
							</Tooltip>
						</Box>
					</Box>

					{/* Table */}
					<TableContainer>
						<Table sx={{ minWidth: 800 }}>
							<TableHead>
								<TableRow
									sx={{
										bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
										borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									{(showMissing
										? ['Employee', 'Staff ID', 'Email', 'Department', 'Action']
										: ['Employee', 'Staff ID', 'State', 'JTB TIN', 'TIN Verified', 'PFA', 'Actions']
									).map((head) => (
										<TableCell
											key={head}
											align={head === 'Actions' || head === 'Action' ? 'right' : 'left'}
											sx={{
												py: 2,
												px: 3,
												fontSize: '0.75rem',
												fontWeight: 600,
												textTransform: 'uppercase',
												color: isDarkMode ? '#94a3b8' : '#64748b',
											}}>
											{head}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={showMissing ? 5 : 7} align="center" sx={{ py: 6 }}>
											<CircularProgress size={30} />
											<Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
												Loading...
											</Typography>
										</TableCell>
									</TableRow>
								) : profiles.length === 0 ? (
									<TableRow>
										<TableCell colSpan={showMissing ? 5 : 7} align="center" sx={{ py: 6 }}>
											<Typography variant="body1" sx={{ color: 'text.secondary' }}>
												{showMissing
													? 'All employees have tax profiles.'
													: 'No tax profiles found.'}
											</Typography>
										</TableCell>
									</TableRow>
								) : showMissing ? (
									profiles.map((employee) => (
										<TableRow
											key={employee.id}
											sx={{
												'&:hover': {
													bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
												},
											}}>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Typography variant="body2" sx={{ fontWeight: 600 }}>
													{employee.firstName} {employee.lastName}
												</Typography>
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{employee.staffId}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{employee.email || '-'}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{employee.department || '-'}
											</TableCell>
											<TableCell align="right" sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Button
													size="small"
													variant="contained"
													startIcon={<AddIcon />}
													onClick={() => {
														setEditingProfile({ staffId: employee.id, staff: employee });
														setFormModalOpen(true);
													}}
													sx={{ bgcolor: '#137fec' }}>
													Add Profile
												</Button>
											</TableCell>
										</TableRow>
									))
								) : (
									profiles.map((profile) => (
										<TableRow
											key={profile.id}
											sx={{
												'&:hover': {
													bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
												},
											}}>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Typography variant="body2" sx={{ fontWeight: 600 }}>
													{profile.staff?.firstName} {profile.staff?.lastName}
												</Typography>
												<Typography variant="caption" color="text.secondary">
													{profile.staff?.email}
												</Typography>
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{profile.staff?.staffId || '-'}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Chip
													size="small"
													label={profile.stateOfResidence}
													color="primary"
													variant="outlined"
												/>
												{profile.lockedState && (
													<Tooltip title={`Locked: ${profile.lockedState}`}>
														<LockIcon
															sx={{ ml: 1, fontSize: 16, color: '#22c55e', verticalAlign: 'middle' }}
														/>
													</Tooltip>
												)}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													fontFamily: 'monospace',
													fontSize: '0.85rem',
												}}>
												{formatTIN(profile.jtbTin)}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{profile.tinVerified ? (
													<Chip size="small" label="Verified" color="success" />
												) : profile.jtbTin ? (
													<Chip size="small" label="Unverified" color="warning" variant="outlined" />
												) : (
													'-'
												)}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{profile.pfaName || '-'}
											</TableCell>
											<TableCell align="right" sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<IconButton size="small" onClick={(e) => handleActionClick(e, profile)}>
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
						<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
							Showing {profiles.length > 0 ? (page - 1) * rowsPerPage + 1 : 0} to{' '}
							{profiles.length > 0 ? (page - 1) * rowsPerPage + profiles.length : 0} of {totalCount}{' '}
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
						sx: {
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							borderRadius: 2,
							minWidth: 160,
						},
					}}>
					<MenuItem onClick={handleEdit}>
						<ListItemIcon>
							<EditIcon fontSize="small" />
						</ListItemIcon>
						<ListItemText primary="Edit" />
					</MenuItem>
					<MenuItem
						onClick={() => {
							setDeleteDialogOpen(true);
							handleCloseMenu();
						}}>
						<ListItemIcon>
							<DeleteIcon fontSize="small" sx={{ color: '#ef4444' }} />
						</ListItemIcon>
						<ListItemText primary="Delete" sx={{ color: '#ef4444' }} />
					</MenuItem>
				</Menu>

				{/* Form Modal */}
				<TaxProfileFormModal
					open={formModalOpen}
					onClose={() => {
						setFormModalOpen(false);
						setEditingProfile(null);
					}}
					profile={editingProfile}
					companyId={companyId}
					onSuccess={handleFormSuccess}
				/>

				{/* Import Modal */}
				<BulkImportProfilesModal
					open={importModalOpen}
					onClose={() => setImportModalOpen(false)}
					companyId={companyId}
					onSuccess={handleImportSuccess}
				/>

				{/* Delete Dialog */}
				<Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
					<DialogTitle>Delete Tax Profile</DialogTitle>
					<DialogContent>
						<DialogContentText>
							Are you sure you want to delete the tax profile for{' '}
							<strong>
								{selectedProfile?.staff?.firstName} {selectedProfile?.staff?.lastName}
							</strong>
							? This action cannot be undone.
						</DialogContentText>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
							Cancel
						</Button>
						<Button onClick={handleDelete} color="error" disabled={deleting}>
							{deleting ? <CircularProgress size={20} /> : 'Delete'}
						</Button>
					</DialogActions>
				</Dialog>

				{/* Lock States Dialog */}
				<Dialog open={lockDialogOpen} onClose={() => setLockDialogOpen(false)}>
					<DialogTitle>Lock States for {new Date().getFullYear()}</DialogTitle>
					<DialogContent>
						<DialogContentText>
							Per PITA regulations, employee tax states should be locked on January 1st of each year.
							This will lock all current employee state assignments for {new Date().getFullYear()}.
							<br />
							<br />
							<strong>This action cannot be undone.</strong>
						</DialogContentText>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setLockDialogOpen(false)} disabled={locking}>
							Cancel
						</Button>
						<Button onClick={handleLockStates} variant="contained" disabled={locking}>
							{locking ? <CircularProgress size={20} /> : 'Lock States'}
						</Button>
					</DialogActions>
				</Dialog>

				{/* Snackbar */}
				<Snackbar
					open={snackbar.open}
					autoHideDuration={6000}
					onClose={() => setSnackbar({ ...snackbar, open: false })}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
					<Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
						{snackbar.message}
					</Alert>
				</Snackbar>
			</Box>
		</Box>
	);
};

export default TaxProfilesDashboard;
