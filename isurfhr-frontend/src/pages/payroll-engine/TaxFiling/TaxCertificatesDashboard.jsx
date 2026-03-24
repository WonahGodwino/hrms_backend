// src/pages/payroll-engine/TaxFiling/TaxCertificatesDashboard.jsx
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
	CircularProgress,
	Alert,
	Select,
	FormControl,
	InputLabel,
	MenuItem,
	Snackbar,
	Card,
	CardContent,
	Grid,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import PeopleIcon from '@mui/icons-material/People';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DescriptionIcon from '@mui/icons-material/Description';

import { getEligibleEmployees, downloadTaxCertificate } from '@/services/TaxFilingService';
import { useAuth } from '@/lib/context/AuthContext';

const TaxCertificatesDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const { user } = useAuth();

	// Get company ID from user context
	const companyId = user?.companyId || user?.company?.id;

	// Data State
	const [employees, setEmployees] = useState([]);
	const [totalEmployees, setTotalEmployees] = useState(0);
	const [periodsCount, setPeriodsCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Filter State
	const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
	const [searchQuery, setSearchQuery] = useState('');

	// Pagination State
	const [page, setPage] = useState(1);
	const rowsPerPage = 10;

	// Download State
	const [downloadingId, setDownloadingId] = useState(null);

	// Snackbar State
	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

	// Generate year options (last 5 years to current year)
	const currentYear = new Date().getFullYear();
	const yearOptions = [];
	for (let y = currentYear - 4; y <= currentYear; y++) {
		yearOptions.push(y);
	}

	// Fetch eligible employees
	const fetchEmployees = useCallback(async () => {
		if (!companyId) return;

		setLoading(true);
		setError(null);
		try {
			const response = await getEligibleEmployees(selectedYear, companyId);
			if (response.data?.success) {
				setEmployees(response.data.data.employees || []);
				setTotalEmployees(response.data.data.totalEmployees || 0);
				setPeriodsCount(response.data.data.periodsCount || 0);
			}
		} catch (err) {
			console.error('Failed to fetch eligible employees:', err);
			setError('Unable to load eligible employees. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [selectedYear, companyId]);

	useEffect(() => {
		fetchEmployees();
	}, [fetchEmployees]);

	// Handle download certificate
	const handleDownload = async (employee) => {
		if (!companyId) return;

		setDownloadingId(employee.id);
		try {
			const response = await downloadTaxCertificate(selectedYear, employee.id, companyId);
			const blob = new Blob([response.data], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			// Clean up name for filename
			const cleanName = employee.name.replace(/[^a-zA-Z0-9]/g, '-');
			link.download = `Tax-Certificate-${cleanName}-${selectedYear}.xlsx`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
			setSnackbar({
				open: true,
				message: `Tax certificate downloaded for ${employee.name}`,
				severity: 'success',
			});
		} catch (err) {
			console.error('Failed to download tax certificate:', err);
			setSnackbar({
				open: true,
				message: 'Failed to download tax certificate',
				severity: 'error',
			});
		} finally {
			setDownloadingId(null);
		}
	};

	// Filter employees by search
	const filteredEmployees = employees.filter((emp) => {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			emp.name?.toLowerCase().includes(query) ||
			emp.staffId?.toLowerCase().includes(query) ||
			emp.email?.toLowerCase().includes(query) ||
			emp.stateOfResidence?.toLowerCase().includes(query)
		);
	});

	// Paginate employees
	const paginatedEmployees = filteredEmployees.slice((page - 1) * rowsPerPage, page * rowsPerPage);

	// Handlers
	const handlePageChange = (event, value) => {
		setPage(value);
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

				{/* Summary Cards */}
				<Grid container spacing={3} sx={{ mb: 3 }}>
					<Grid item xs={12} sm={6} md={4}>
						<Card
							elevation={0}
							sx={{
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							}}>
							<CardContent>
								<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
									<PeopleIcon sx={{ color: '#3b82f6', mr: 1 }} />
									<Typography variant="overline" color="text.secondary">
										Eligible Employees
									</Typography>
								</Box>
								<Typography variant="h4" sx={{ fontWeight: 700 }}>
									{totalEmployees}
								</Typography>
							</CardContent>
						</Card>
					</Grid>
					<Grid item xs={12} sm={6} md={4}>
						<Card
							elevation={0}
							sx={{
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							}}>
							<CardContent>
								<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
									<CalendarMonthIcon sx={{ color: '#22c55e', mr: 1 }} />
									<Typography variant="overline" color="text.secondary">
										Pay Periods
									</Typography>
								</Box>
								<Typography variant="h4" sx={{ fontWeight: 700 }}>
									{periodsCount}
								</Typography>
							</CardContent>
						</Card>
					</Grid>
					<Grid item xs={12} sm={6} md={4}>
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
										Tax Year
									</Typography>
								</Box>
								<Typography variant="h4" sx={{ fontWeight: 700 }}>
									{selectedYear}
								</Typography>
							</CardContent>
						</Card>
					</Grid>
				</Grid>

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
								Tax Certificates
							</Typography>
							<Typography
								variant="body1"
								sx={{
									color: isDarkMode ? '#94a3b8' : '#64748b',
									fontSize: '1rem',
								}}>
								Generate and download individual employee tax certificates
							</Typography>
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
									onChange={(e) => {
										setSelectedYear(e.target.value);
										setPage(1);
									}}
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

							{/* Search */}
							<TextField
								size="small"
								placeholder="Search by name, staff ID, email..."
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
									'maxWidth': 400,
									'& .MuiOutlinedInput-root': {
										borderRadius: 2,
										bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
									},
								}}
							/>

							<Box sx={{ flex: 1 }} />

							{/* Refresh Button */}
							<Tooltip title="Refresh">
								<IconButton
									onClick={fetchEmployees}
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
									{['Employee Name', 'Staff ID', 'Email', 'State', 'TIN', 'Payslips', 'Action'].map(
										(head) => (
											<TableCell
												key={head}
												align={head === 'Action' ? 'right' : 'left'}
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
												Loading eligible employees...
											</Typography>
										</TableCell>
									</TableRow>
								) : paginatedEmployees.length === 0 ? (
									<TableRow>
										<TableCell colSpan={7} align="center" sx={{ py: 6 }}>
											<Typography variant="body1" sx={{ color: 'text.secondary' }}>
												{searchQuery
													? 'No employees match your search criteria.'
													: 'No employees eligible for tax certificates. Ensure payroll has been processed for this year.'}
											</Typography>
										</TableCell>
									</TableRow>
								) : (
									paginatedEmployees.map((employee) => (
										<TableRow
											key={employee.id}
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
													{employee.name}
												</Typography>
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{employee.staffId}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{employee.email || '-'}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{employee.stateOfResidence || '-'}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#94a3b8' : '#64748b',
													fontFamily: 'monospace',
													fontSize: '0.8rem',
												}}>
												{employee.jtbTin || '-'}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													color: isDarkMode ? '#cbd5e1' : '#475569',
												}}>
												{employee.payslipsCount || 0}
											</TableCell>
											<TableCell align="right" sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Button
													size="small"
													variant="contained"
													startIcon={
														downloadingId === employee.id ? (
															<CircularProgress size={16} color="inherit" />
														) : (
															<DownloadIcon />
														)
													}
													onClick={() => handleDownload(employee)}
													disabled={downloadingId === employee.id}
													sx={{
														bgcolor: '#137fec',
														textTransform: 'none',
														fontWeight: 600,
														borderRadius: 2,
														'&:hover': { bgcolor: '#1d4ed8' },
														'&:disabled': { bgcolor: '#94a3b8' },
													}}>
													{downloadingId === employee.id ? 'Downloading...' : 'Download'}
												</Button>
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
								{paginatedEmployees.length > 0 ? (page - 1) * rowsPerPage + 1 : 0}
							</Box>{' '}
							to{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{paginatedEmployees.length > 0 ? (page - 1) * rowsPerPage + paginatedEmployees.length : 0}
							</Box>{' '}
							of{' '}
							<Box component="span" fontWeight="600" color={isDarkMode ? '#fff' : '#0f172a'}>
								{filteredEmployees.length}
							</Box>{' '}
							results
						</Typography>

						<Pagination
							count={Math.ceil(filteredEmployees.length / rowsPerPage) || 1}
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

export default TaxCertificatesDashboard;
