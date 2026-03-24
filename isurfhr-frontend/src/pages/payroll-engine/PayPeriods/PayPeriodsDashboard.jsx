// src/pages/payroll-engine/PayPeriods/PayPeriodsDashboard.jsx
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
	Select,
	FormControl,
	InputLabel,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import CalculateIcon from '@mui/icons-material/Calculate';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';

import { getPayPeriods, getCurrentPayPeriod } from '@/services/PayrollEngineService';
import { PayPeriodStatusChip, WorkflowProgressCompact } from '@/components/payroll-engine';
import CreatePayPeriodModal from './CreatePayPeriodModal';
import PayPeriodDetailsDrawer from './PayPeriodDetailsDrawer';

const PayPeriodsDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Data State
	const [periods, setPeriods] = useState([]);
	const [currentPeriod, setCurrentPeriod] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Pagination State
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const rowsPerPage = 10;

	// Filter State
	const [yearFilter, setYearFilter] = useState('');
	const [statusFilter, setStatusFilter] = useState('');

	// Menu State
	const [anchorEl, setAnchorEl] = useState(null);
	const [selectedPeriod, setSelectedPeriod] = useState(null);
	const openMenu = Boolean(anchorEl);

	// Modal State
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

	// Fetch pay periods
	const fetchPeriods = React.useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const params = {
				page,
				limit: rowsPerPage,
				...(yearFilter && { year: yearFilter }),
				...(statusFilter && { status: statusFilter }),
			};

			const [periodsRes, currentRes] = await Promise.all([
				getPayPeriods(params),
				getCurrentPayPeriod().catch(() => null),
			]);

			if (periodsRes.data) {
				setPeriods(periodsRes.data.data || []);
				setTotalCount(periodsRes.data.total || 0);
			}

			if (currentRes?.data) {
				setCurrentPeriod(currentRes.data);
			}
		} catch (err) {
			console.error('Failed to fetch pay periods:', err);
			setError('Unable to load pay periods. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [page, rowsPerPage, yearFilter, statusFilter]);

	useEffect(() => {
		fetchPeriods();
	}, [fetchPeriods]);

	// Handlers
	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleActionClick = (event, period) => {
		setAnchorEl(event.currentTarget);
		setSelectedPeriod(period);
	};

	const handleCloseMenu = () => {
		setAnchorEl(null);
	};

	const handleViewDetails = () => {
		handleCloseMenu();
		setDetailsDrawerOpen(true);
	};

	const handleCreateSuccess = () => {
		setCreateModalOpen(false);
		fetchPeriods();
	};

	const handleActionComplete = () => {
		setDetailsDrawerOpen(false);
		setSelectedPeriod(null);
		fetchPeriods();
	};

	// Format date
	const formatDate = (dateString) => {
		if (!dateString) return '--';
		try {
			return new Date(dateString).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});
		} catch {
			return dateString;
		}
	};

	// Generate year options
	const yearOptions = [];
	const currentYear = new Date().getFullYear();
	for (let y = currentYear - 2; y <= currentYear + 1; y++) {
		yearOptions.push(y);
	}

	const statusOptions = [
		{ value: '', label: 'All Status' },
		{ value: 'DRAFT', label: 'Draft' },
		{ value: 'VALIDATION_OPEN', label: 'Validation Open' },
		{ value: 'VALIDATION_CLOSED', label: 'Validation Closed' },
		{ value: 'COMPUTING', label: 'Computing' },
		{ value: 'REVIEW', label: 'Review' },
		{ value: 'APPROVED', label: 'Approved' },
		{ value: 'PAID', label: 'Paid' },
	];

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

				{/* Current Period Card */}
				{currentPeriod && (
					<Paper
						elevation={0}
						sx={{
							p: 3,
							mb: 3,
							borderRadius: 3,
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							background: isDarkMode
								? 'linear-gradient(135deg, #1A2632 0%, #1e3a5f 100%)'
								: 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)',
						}}>
						<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
							<Box>
								<Typography
									variant="overline"
									sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
									Current Pay Period
								</Typography>
								<Typography
									variant="h5"
									sx={{ fontWeight: 700, color: isDarkMode ? '#ffffff' : '#0f172a' }}>
									{currentPeriod.periodName}
								</Typography>
							</Box>
							<PayPeriodStatusChip status={currentPeriod.status} isDarkMode={isDarkMode} />
						</Box>
						<WorkflowProgressCompact currentStatus={currentPeriod.status} isDarkMode={isDarkMode} />
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
									Pay Periods
								</Typography>
								<Typography
									variant="body1"
									sx={{
										color: isDarkMode ? '#94a3b8' : '#64748b',
										fontSize: '1rem',
									}}>
									Manage monthly payroll cycles and workflow
								</Typography>
							</Box>

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
								Create Pay Period
							</Button>
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
							{/* Year Filter */}
							<FormControl size="small" sx={{ minWidth: 120 }}>
								<InputLabel sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Year</InputLabel>
								<Select
									value={yearFilter}
									label="Year"
									onChange={(e) => setYearFilter(e.target.value)}
									sx={{
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
										'& .MuiOutlinedInput-notchedOutline': {
											borderColor: isDarkMode ? '#334155' : '#e2e8f0',
										},
									}}>
									<MenuItem value="">All Years</MenuItem>
									{yearOptions.map((year) => (
										<MenuItem key={year} value={year}>
											{year}
										</MenuItem>
									))}
								</Select>
							</FormControl>

							{/* Status Filter */}
							<FormControl size="small" sx={{ minWidth: 160 }}>
								<InputLabel sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Status</InputLabel>
								<Select
									value={statusFilter}
									label="Status"
									onChange={(e) => setStatusFilter(e.target.value)}
									sx={{
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
										'& .MuiOutlinedInput-notchedOutline': {
											borderColor: isDarkMode ? '#334155' : '#e2e8f0',
										},
									}}>
									{statusOptions.map((opt) => (
										<MenuItem key={opt.value} value={opt.value}>
											{opt.label}
										</MenuItem>
									))}
								</Select>
							</FormControl>

							<Box sx={{ flex: 1 }} />

							{/* Refresh Button */}
							<Tooltip title="Refresh">
								<IconButton
									onClick={fetchPeriods}
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
						<Table sx={{ minWidth: 800 }}>
							<TableHead>
								<TableRow
									sx={{
										bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
										borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									{['Period', 'Year', 'Status', 'Validation Window', 'Created', 'Actions'].map(
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
										<TableCell colSpan={6} align="center" sx={{ py: 6 }}>
											<CircularProgress size={30} />
											<Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
												Loading pay periods...
											</Typography>
										</TableCell>
									</TableRow>
								) : periods.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6} align="center" sx={{ py: 6 }}>
											<Typography variant="body1" sx={{ color: 'text.secondary' }}>
												No pay periods found.
											</Typography>
										</TableCell>
									</TableRow>
								) : (
									periods.map((period) => (
										<TableRow
											key={period.id || period._id}
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
													{period.periodName}
												</Typography>
												<Typography
													variant="caption"
													sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }}>
													{formatDate(period.startDate)} - {formatDate(period.endDate)}
												</Typography>
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{period.year}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<PayPeriodStatusChip status={period.status} isDarkMode={isDarkMode} />
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
													fontSize: '0.875rem',
												}}>
												{formatDate(period.validationWindowStart)} -{' '}
												{formatDate(period.validationWindowEnd)}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#94a3b8' : '#64748b',
													fontSize: '0.875rem',
												}}>
												{formatDate(period.createdAt)}
											</TableCell>
											<TableCell align="right" sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<IconButton
													size="small"
													onClick={(e) => handleActionClick(e, period)}
													sx={{
														color: isDarkMode ? '#94a3b8' : '#94a3b8',
														'&:hover': {
															color: '#137fec',
															bgcolor: isDarkMode
																? 'rgba(30, 41, 59, 0.5)'
																: '#f1f5f9',
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
								{periods.length > 0 ? (page - 1) * rowsPerPage + 1 : 0}
							</Box>{' '}
							to{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{periods.length > 0 ? (page - 1) * rowsPerPage + periods.length : 0}
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
							minWidth: 180,
						},
					}}
					transformOrigin={{ horizontal: 'right', vertical: 'top' }}
					anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
					<MenuItem onClick={handleViewDetails}>
						<ListItemIcon>
							<VisibilityIcon fontSize="small" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
						</ListItemIcon>
						<ListItemText primary="View Details" />
					</MenuItem>

					{selectedPeriod?.status === 'DRAFT' && (
						<MenuItem onClick={handleViewDetails}>
							<ListItemIcon>
								<PlayArrowIcon fontSize="small" sx={{ color: '#22c55e' }} />
							</ListItemIcon>
							<ListItemText primary="Open Validation" />
						</MenuItem>
					)}

					{selectedPeriod?.status === 'VALIDATION_OPEN' && (
						<MenuItem onClick={handleViewDetails}>
							<ListItemIcon>
								<StopIcon fontSize="small" sx={{ color: '#f59e0b' }} />
							</ListItemIcon>
							<ListItemText primary="Close Validation" />
						</MenuItem>
					)}

					{selectedPeriod?.status === 'VALIDATION_CLOSED' && (
						<MenuItem onClick={handleViewDetails}>
							<ListItemIcon>
								<CalculateIcon fontSize="small" sx={{ color: '#3b82f6' }} />
							</ListItemIcon>
							<ListItemText primary="Compute Payroll" />
						</MenuItem>
					)}

					{selectedPeriod?.status === 'REVIEW' && (
						<MenuItem onClick={handleViewDetails}>
							<ListItemIcon>
								<CheckCircleIcon fontSize="small" sx={{ color: '#22c55e' }} />
							</ListItemIcon>
							<ListItemText primary="Approve Payroll" />
						</MenuItem>
					)}

					{selectedPeriod?.status === 'APPROVED' && (
						<MenuItem onClick={handleViewDetails}>
							<ListItemIcon>
								<CheckCircleIcon fontSize="small" sx={{ color: '#3b82f6' }} />
							</ListItemIcon>
							<ListItemText primary="Mark as Paid" />
						</MenuItem>
					)}
				</Menu>

				{/* Create Modal */}
				<CreatePayPeriodModal
					open={createModalOpen}
					onClose={() => setCreateModalOpen(false)}
					onSuccess={handleCreateSuccess}
				/>

				{/* Details Drawer */}
				<PayPeriodDetailsDrawer
					open={detailsDrawerOpen}
					onClose={() => {
						setDetailsDrawerOpen(false);
						setSelectedPeriod(null);
					}}
					period={selectedPeriod}
					onActionComplete={handleActionComplete}
				/>
			</Box>
		</Box>
	);
};

export default PayPeriodsDashboard;
