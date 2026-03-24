// src/pages/payroll-engine/TaxFiling/AnnualFilingDashboard.jsx
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
	Pagination,
	PaginationItem,
	useTheme,
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
	Card,
	CardContent,
	Grid,
	Snackbar,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PeopleIcon from '@mui/icons-material/People';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DescriptionIcon from '@mui/icons-material/Description';

import {
	getAnnualFilingSummary,
	generateAnnualReturns,
	downloadFormH1,
	markAnnualReturnAsFiled,
	FILING_STATUS,
} from '@/services/TaxFilingService';
import { useAuth } from '@/lib/context/AuthContext';
import AnnualReturnDetailsDrawer from './AnnualReturnDetailsDrawer';

const AnnualFilingDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const { user } = useAuth();

	// Get company ID from user context
	const companyId = user?.companyId || user?.company?.id;

	// Data State
	const [summary, setSummary] = useState(null);
	const [returns, setReturns] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [generating, setGenerating] = useState(false);

	// Filter State
	const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

	// Pagination State
	const [page, setPage] = useState(1);
	const rowsPerPage = 10;

	// Menu State
	const [anchorEl, setAnchorEl] = useState(null);
	const [selectedReturn, setSelectedReturn] = useState(null);
	const openMenu = Boolean(anchorEl);

	// Drawer State
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

	// Snackbar State
	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

	// Generate year options (last 5 years to current year)
	const currentYear = new Date().getFullYear();
	const yearOptions = [];
	for (let y = currentYear - 4; y <= currentYear; y++) {
		yearOptions.push(y);
	}

	// Fetch annual filing summary
	const fetchSummary = useCallback(async () => {
		if (!companyId) return;

		setLoading(true);
		setError(null);
		try {
			const response = await getAnnualFilingSummary(selectedYear, companyId);
			if (response.data?.success) {
				setSummary(response.data.data.summary || null);
				setReturns(response.data.data.returns || []);
			}
		} catch (err) {
			console.error('Failed to fetch annual filing summary:', err);
			setError('Unable to load annual filing data. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [selectedYear, companyId]);

	useEffect(() => {
		fetchSummary();
	}, [fetchSummary]);

	// Handle generate returns
	const handleGenerateReturns = async () => {
		if (!companyId) return;

		setGenerating(true);
		try {
			const response = await generateAnnualReturns(selectedYear, companyId);
			if (response.data?.success) {
				setSnackbar({
					open: true,
					message: response.data.message || 'Annual returns generated successfully',
					severity: 'success',
				});
				fetchSummary();
			}
		} catch (err) {
			console.error('Failed to generate annual returns:', err);
			setSnackbar({
				open: true,
				message: err.response?.data?.message || 'Failed to generate annual returns',
				severity: 'error',
			});
		} finally {
			setGenerating(false);
		}
	};

	// Handle download Form H1
	const handleDownload = async (returnData, format = 'xlsx') => {
		if (!companyId) return;

		try {
			const response = await downloadFormH1(selectedYear, returnData.stateCode, format, companyId);
			const blob = new Blob([response.data], {
				type:
					format === 'xlsx'
						? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
						: 'text/csv',
			});
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `Form-H1-${returnData.stateCode}-${selectedYear}.${format}`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to download Form H1:', err);
			setSnackbar({
				open: true,
				message: 'Failed to download Form H1',
				severity: 'error',
			});
		}
	};

	// Handle mark as filed
	const handleMarkAsFiled = async (returnData) => {
		if (!companyId) return;

		try {
			const response = await markAnnualReturnAsFiled(selectedYear, returnData.stateCode, companyId);
			if (response.data?.success) {
				setSnackbar({
					open: true,
					message: 'Annual return marked as filed',
					severity: 'success',
				});
				fetchSummary();
			}
		} catch (err) {
			console.error('Failed to mark as filed:', err);
			setSnackbar({
				open: true,
				message: 'Failed to mark annual return as filed',
				severity: 'error',
			});
		}
		handleCloseMenu();
	};

	// Handlers
	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleActionClick = (event, returnData) => {
		setAnchorEl(event.currentTarget);
		setSelectedReturn(returnData);
	};

	const handleCloseMenu = () => {
		setAnchorEl(null);
	};

	const handleViewDetails = () => {
		handleCloseMenu();
		setDetailsDrawerOpen(true);
	};

	// Format currency
	const formatCurrency = (amount) => {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			minimumFractionDigits: 2,
		}).format(amount || 0);
	};

	// Get status chip
	const getStatusChip = (status) => {
		const statusConfig = {
			[FILING_STATUS.PENDING]: { color: 'default', label: 'Pending' },
			[FILING_STATUS.GENERATED]: { color: 'info', label: 'Generated' },
			[FILING_STATUS.FILED]: { color: 'success', label: 'Filed' },
			[FILING_STATUS.CONFIRMED]: { color: 'success', label: 'Confirmed' },
		};
		const config = statusConfig[status] || { color: 'default', label: status };
		return <Chip size="small" label={config.label} color={config.color} />;
	};

	// Paginate returns
	const paginatedReturns = returns.slice((page - 1) * rowsPerPage, page * rowsPerPage);

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

				{/* Summary Cards */}
				{summary && (
					<Grid container spacing={3} sx={{ mb: 3 }}>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<AccountBalanceIcon sx={{ color: '#3b82f6', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											Total States
										</Typography>
									</Box>
									<Typography variant="h4" sx={{ fontWeight: 700 }}>
										{summary.totalStates || 0}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<PeopleIcon sx={{ color: '#22c55e', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											Total Employees
										</Typography>
									</Box>
									<Typography variant="h4" sx={{ fontWeight: 700 }}>
										{summary.totalEmployees || 0}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<AssessmentIcon sx={{ color: '#f59e0b', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											Total Tax Paid
										</Typography>
									</Box>
									<Typography variant="h5" sx={{ fontWeight: 700 }}>
										{formatCurrency(summary.totalTaxPaid)}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
						<Grid item xs={12} sm={6} md={3}>
							<Card
								elevation={0}
								sx={{
									borderRadius: 3,
									border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								}}>
								<CardContent>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<DescriptionIcon sx={{ color: '#8b5cf6', mr: 1 }} />
										<Typography variant="overline" color="text.secondary">
											Gross Income
										</Typography>
									</Box>
									<Typography variant="h5" sx={{ fontWeight: 700 }}>
										{formatCurrency(summary.totalGrossIncome)}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
					</Grid>
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
									Annual Returns (Form H1)
								</Typography>
								<Typography
									variant="body1"
									sx={{
										color: isDarkMode ? '#94a3b8' : '#64748b',
										fontSize: '1rem',
									}}>
									Generate and manage annual PAYE returns by state
								</Typography>
							</Box>

							<Button
								variant="contained"
								startIcon={generating ? <CircularProgress size={20} color="inherit" /> : <AutorenewIcon />}
								onClick={handleGenerateReturns}
								disabled={generating}
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
									'&:disabled': { bgcolor: '#94a3b8' },
								}}>
								{generating ? 'Generating...' : 'Generate Returns'}
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
									value={selectedYear}
									label="Year"
									onChange={(e) => setSelectedYear(e.target.value)}
									sx={{
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
										'& .MuiOutlinedInput-notchedOutline': {
											borderColor: isDarkMode ? '#334155' : '#e2e8f0',
										},
									}}>
									{yearOptions.map((year) => (
										<MenuItem key={year} value={year}>
											{year}
										</MenuItem>
									))}
								</Select>
							</FormControl>

							<Box sx={{ flex: 1 }} />

							{/* Refresh Button */}
							<Tooltip title="Refresh">
								<IconButton
									onClick={fetchSummary}
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
									{['State', 'IRS', 'Employees', 'Gross Income', 'Tax Paid', 'Status', 'Actions'].map(
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
												Loading annual returns...
											</Typography>
										</TableCell>
									</TableRow>
								) : paginatedReturns.length === 0 ? (
									<TableRow>
										<TableCell colSpan={7} align="center" sx={{ py: 6 }}>
											<Typography variant="body1" sx={{ color: 'text.secondary' }}>
												No annual returns found. Click "Generate Returns" to create Form H1 returns.
											</Typography>
										</TableCell>
									</TableRow>
								) : (
									paginatedReturns.map((returnData) => (
										<TableRow
											key={returnData.id || returnData.stateCode}
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
													{returnData.stateName}
												</Typography>
												<Typography variant="caption" sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }}>
													{returnData.stateCode}
												</Typography>
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{returnData.stateIrs}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{returnData.totalEmployees || 0}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{formatCurrency(returnData.totalGrossIncome)}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													fontWeight: 600,
													color: '#22c55e',
												}}>
												{formatCurrency(returnData.totalTaxPaid)}
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												{getStatusChip(returnData.status)}
											</TableCell>
											<TableCell align="right" sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<IconButton
													size="small"
													onClick={(e) => handleActionClick(e, returnData)}
													sx={{
														color: isDarkMode ? '#94a3b8' : '#94a3b8',
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
								{paginatedReturns.length > 0 ? (page - 1) * rowsPerPage + 1 : 0}
							</Box>{' '}
							to{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{paginatedReturns.length > 0 ? (page - 1) * rowsPerPage + paginatedReturns.length : 0}
							</Box>{' '}
							of{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{returns.length}
							</Box>{' '}
							results
						</Typography>

						<Pagination
							count={Math.ceil(returns.length / rowsPerPage) || 1}
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

					<MenuItem onClick={() => handleDownload(selectedReturn, 'xlsx')}>
						<ListItemIcon>
							<DownloadIcon fontSize="small" sx={{ color: '#3b82f6' }} />
						</ListItemIcon>
						<ListItemText primary="Download Excel" />
					</MenuItem>

					<MenuItem onClick={() => handleDownload(selectedReturn, 'csv')}>
						<ListItemIcon>
							<DownloadIcon fontSize="small" sx={{ color: '#22c55e' }} />
						</ListItemIcon>
						<ListItemText primary="Download CSV" />
					</MenuItem>

					{selectedReturn?.status === FILING_STATUS.GENERATED && (
						<MenuItem onClick={() => handleMarkAsFiled(selectedReturn)}>
							<ListItemIcon>
								<CheckCircleIcon fontSize="small" sx={{ color: '#22c55e' }} />
							</ListItemIcon>
							<ListItemText primary="Mark as Filed" />
						</MenuItem>
					)}
				</Menu>

				{/* Details Drawer */}
				<AnnualReturnDetailsDrawer
					open={detailsDrawerOpen}
					onClose={() => {
						setDetailsDrawerOpen(false);
						setSelectedReturn(null);
					}}
					year={selectedYear}
					stateCode={selectedReturn?.stateCode}
					companyId={companyId}
				/>

				{/* Snackbar */}
				<Snackbar
					open={snackbar.open}
					autoHideDuration={6000}
					onClose={() => setSnackbar({ ...snackbar, open: false })}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
					<Alert
						onClose={() => setSnackbar({ ...snackbar, open: false })}
						severity={snackbar.severity}
						sx={{ width: '100%' }}>
						{snackbar.message}
					</Alert>
				</Snackbar>
			</Box>
		</Box>
	);
};

export default AnnualFilingDashboard;
