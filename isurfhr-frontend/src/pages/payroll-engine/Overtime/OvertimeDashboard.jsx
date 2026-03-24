// src/pages/payroll-engine/Overtime/OvertimeDashboard.jsx
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
	Pagination,
	PaginationItem,
	useTheme,
	IconButton,
	Tooltip,
	CircularProgress,
	Alert,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	Grid,
	Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getPayPeriods, getOvertimeByPeriod, createOvertime, deleteOvertime, bulkUploadOvertime, getStaff } from '@/services/PayrollEngineService';
import { formatCurrency, BulkUploadModal } from '@/components/payroll-engine';

const OvertimeDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Data State
	const [periods, setPeriods] = useState([]);
	const [selectedPeriodId, setSelectedPeriodId] = useState('');
	const [overtime, setOvertime] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Pagination
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const rowsPerPage = 10;

	// Modal State
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [formData, setFormData] = useState({
		periodId: '',
		staffId: '',
		overtimeHours: '',
		multiplier: '1.5',
		date: new Date().toISOString().split('T')[0],
		description: '',
	});
	const [submitting, setSubmitting] = useState(false);

	// Staff Selection State
	const [staffOptions, setStaffOptions] = useState([]);
	const [selectedStaff, setSelectedStaff] = useState(null);
	const [staffLoading, setStaffLoading] = useState(false);

	// Bulk Upload State
	const [uploadModalOpen, setUploadModalOpen] = useState(false);

	// Fetch periods
	useEffect(() => {
		const fetchPeriods = async () => {
			try {
				const response = await getPayPeriods({ limit: 20 });
				const allPeriods = response.data?.data || [];
				setPeriods(allPeriods);
				if (allPeriods.length > 0) {
					setSelectedPeriodId(allPeriods[0].id || allPeriods[0]._id);
				}
			} catch (err) {
				console.error('Failed to fetch periods:', err);
			} finally {
				setLoading(false);
			}
		};
		fetchPeriods();
	}, []);

	// Fetch staff when create modal opens
	useEffect(() => {
		const fetchStaff = async () => {
			setStaffLoading(true);
			try {
				const response = await getStaff({ limit: 500 });
				if (response.data?.data) {
					setStaffOptions(response.data.data);
				}
			} catch (err) {
				console.error('Failed to fetch staff:', err);
			} finally {
				setStaffLoading(false);
			}
		};

		if (createModalOpen) {
			fetchStaff();
		}
	}, [createModalOpen]);

	// Fetch overtime when period changes
	useEffect(() => {
		const fetchOvertime = async () => {
			if (!selectedPeriodId) return;
			setLoading(true);
			try {
				const response = await getOvertimeByPeriod(selectedPeriodId, { page, limit: rowsPerPage });
				setOvertime(response.data?.data || []);
				setTotalCount(response.data?.total || 0);
			} catch (err) {
				console.error('Failed to fetch overtime:', err);
				setError('Unable to load overtime entries.');
			} finally {
				setLoading(false);
			}
		};
		fetchOvertime();
	}, [selectedPeriodId, page]);

	const handleCreate = async () => {
		if (!formData.periodId) {
			setError('Please select a pay period.');
			return;
		}

		const periodIdToRefresh = formData.periodId;
		setSubmitting(true);
		try {
			await createOvertime({
				...formData,
				overtimeHours: parseFloat(formData.overtimeHours),
				multiplier: parseFloat(formData.multiplier),
			});
			setCreateModalOpen(false);
			setFormData({ periodId: '', staffId: '', overtimeHours: '', multiplier: '1.5', date: new Date().toISOString().split('T')[0], description: '' });
			setSelectedStaff(null);
			// Refresh using the selected period
			setSelectedPeriodId(periodIdToRefresh);
			const response = await getOvertimeByPeriod(periodIdToRefresh, { page, limit: rowsPerPage });
			setOvertime(response.data?.data || []);
		} catch (err) {
			setError(err.response?.data?.message || 'Failed to create overtime entry.');
		} finally {
			setSubmitting(false);
		}
	};

	// Set default periodId when modal opens
	const handleOpenCreateModal = () => {
		setFormData(prev => ({ ...prev, periodId: selectedPeriodId }));
		setCreateModalOpen(true);
	};

	const handleStaffChange = (event, newValue) => {
		setSelectedStaff(newValue);
		setFormData((prev) => ({ ...prev, staffId: newValue?._id || newValue?.id || '' }));
	};

	const handleDelete = async (id) => {
		if (!window.confirm('Delete this overtime entry?')) return;
		try {
			await deleteOvertime(id);
			setOvertime((prev) => prev.filter((o) => (o.id || o._id) !== id));
		} catch (err) {
			setError('Failed to delete overtime entry.');
		}
	};

	const formatDate = (dateString) => {
		if (!dateString) return '--';
		return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	};

	// Handle bulk upload
	const handleBulkUpload = async (file) => {
		if (!selectedPeriodId) {
			throw new Error('Please select a pay period first.');
		}
		return bulkUploadOvertime(selectedPeriodId, file);
	};

	// Handle upload success
	const handleUploadSuccess = async () => {
		setUploadModalOpen(false);
		// Refresh overtime list
		const response = await getOvertimeByPeriod(selectedPeriodId, { page, limit: rowsPerPage });
		setOvertime(response.data?.data || []);
		setTotalCount(response.data?.total || 0);
	};

	return (
		<Box sx={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: { xs: 2, sm: 3, lg: 4 }, backgroundColor: isDarkMode ? '#101922' : '#f6f7f8' }}>
			<Box sx={{ width: '100%', maxWidth: '1200px' }}>
				{error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

				<Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#ffffff', overflow: 'hidden' }}>
					{/* Header */}
					<Box sx={{ p: { xs: 3, md: 4 }, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}` }}>
						<Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
							<Box>
								<Typography variant="h4" sx={{ fontWeight: 900, fontSize: '1.875rem', color: isDarkMode ? '#ffffff' : '#0f172a', letterSpacing: '-0.025em', mb: 0.5 }}>
									Overtime Management
								</Typography>
								<Typography variant="body1" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
									Track and manage employee overtime hours
								</Typography>
							</Box>
							<Box sx={{ display: 'flex', gap: 2 }}>
								<Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => setUploadModalOpen(true)} disabled={!selectedPeriodId} sx={{ fontWeight: 600, textTransform: 'none', borderRadius: '9999px', height: 48, px: 3, borderColor: isDarkMode ? '#334155' : '#e2e8f0', color: isDarkMode ? '#e2e8f0' : '#334155' }}>
									Bulk Upload
								</Button>
								<Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateModal} sx={{ bgcolor: '#137fec', fontWeight: 700, textTransform: 'none', borderRadius: '9999px', height: 48, px: 3, '&:hover': { bgcolor: '#1d4ed8' } }}>
									Add Overtime
								</Button>
							</Box>
						</Box>
					</Box>

					{/* Toolbar */}
					<Box sx={{ px: { xs: 3, md: 4 }, py: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
						<FormControl size="small" sx={{ minWidth: 200 }}>
							<InputLabel>Pay Period</InputLabel>
							<Select value={selectedPeriodId} label="Pay Period" onChange={(e) => setSelectedPeriodId(e.target.value)} sx={{ bgcolor: isDarkMode ? '#1e293b' : '#f8fafc' }}>
								{periods.map((p) => <MenuItem key={p.id || p._id} value={p.id || p._id}>{p.periodName}</MenuItem>)}
							</Select>
						</FormControl>
						<Box sx={{ flex: 1 }} />
						<Tooltip title="Refresh">
							<IconButton onClick={() => setPage(1)} sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
								<RefreshIcon />
							</IconButton>
						</Tooltip>
					</Box>

					{/* Table */}
					<TableContainer>
						<Table sx={{ minWidth: 700 }}>
							<TableHead>
								<TableRow sx={{ bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc', borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
									{['Employee', 'Date', 'Hours', 'Multiplier', 'Earnings', 'Description', 'Actions'].map((head) => (
										<TableCell key={head} sx={{ py: 2, px: 3, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: isDarkMode ? '#94a3b8' : '#64748b' }}>
											{head}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
								) : overtime.length === 0 ? (
									<TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No overtime entries found.</Typography></TableCell></TableRow>
								) : (
									overtime.map((item) => (
										<TableRow key={item.id || item._id} sx={{ '&:hover': { bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc' }, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}` }}>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<Typography variant="body2" sx={{ fontWeight: 600, color: isDarkMode ? '#fff' : '#0f172a' }}>{item.staff?.fullName || item.staffId?.fullName || '--'}</Typography>
											</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{formatDate(item.date)}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#0f172a' }}>{item.hours || item.overtimeHours}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{item.rate || item.multiplier}x</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', fontWeight: 600, color: '#22c55e' }}>{formatCurrency(item.earnings || 0)}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', color: isDarkMode ? '#94a3b8' : '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '--'}</TableCell>
											<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
												<IconButton size="small" onClick={() => handleDelete(item.id || item._id)} sx={{ color: '#ef4444' }}>
													<DeleteIcon fontSize="small" />
												</IconButton>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{/* Pagination */}
					<Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
						<Pagination count={Math.ceil(totalCount / rowsPerPage) || 1} page={page} onChange={(e, v) => setPage(v)} renderItem={(item) => <PaginationItem slots={{ previous: ChevronLeftIcon, next: ChevronRightIcon }} {...item} />} />
					</Box>
				</Paper>

				{/* Create Modal */}
				<Dialog open={createModalOpen} onClose={() => { setCreateModalOpen(false); setSelectedStaff(null); }} maxWidth="sm" fullWidth>
					<DialogTitle>Add Overtime Entry</DialogTitle>
					<DialogContent>
						<Grid container spacing={2} sx={{ mt: 1 }}>
							<Grid item xs={12}>
								<FormControl fullWidth required>
									<InputLabel>Pay Period</InputLabel>
									<Select
										value={formData.periodId}
										label="Pay Period"
										onChange={(e) => setFormData({ ...formData, periodId: e.target.value })}
									>
										{periods.map((p) => (
											<MenuItem key={p.id || p._id} value={p.id || p._id}>
												{p.periodName}
											</MenuItem>
										))}
									</Select>
								</FormControl>
							</Grid>
							<Grid item xs={12}>
								<Autocomplete
									options={staffOptions}
									loading={staffLoading}
									getOptionLabel={(option) => `${option.fullName} (${option.email})`}
									value={selectedStaff}
									onChange={handleStaffChange}
									slotProps={{
										popper: { sx: { minWidth: 400 } },
									}}
									renderOption={(props, option) => (
										<Box
											component="li"
											{...props}
											sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', py: 1 }}
										>
											<Typography variant="body2" sx={{ fontWeight: 600 }}>
												{option.fullName}
											</Typography>
											<Typography variant="caption" sx={{ color: 'text.secondary' }}>
												{option.email}
											</Typography>
										</Box>
									)}
									renderInput={(params) => (
										<TextField
											{...params}
											label="Select Employee"
											required
											InputProps={{
												...params.InputProps,
												endAdornment: (
													<>
														{staffLoading ? <CircularProgress size={20} /> : null}
														{params.InputProps.endAdornment}
													</>
												),
											}}
										/>
									)}
								/>
							</Grid>
							<Grid item xs={6}>
								<TextField fullWidth label="Hours" type="number" value={formData.overtimeHours} onChange={(e) => setFormData({ ...formData, overtimeHours: e.target.value })} required inputProps={{ min: 0.5, step: 0.5 }} />
							</Grid>
							<Grid item xs={6}>
								<FormControl fullWidth>
									<InputLabel>Rate</InputLabel>
									<Select value={formData.multiplier} label="Rate" onChange={(e) => setFormData({ ...formData, multiplier: e.target.value })}>
										<MenuItem value="1.0">1.0x (Regular rate - Training hours)</MenuItem>
										<MenuItem value="1.5">1.5x (Time and a half - Weekday overtime)</MenuItem>
										<MenuItem value="2.0">2.0x (Double time - Weekend overtime)</MenuItem>
										<MenuItem value="2.5">2.5x (Premium rate - Public holiday)</MenuItem>
									</Select>
								</FormControl>
							</Grid>
							<Grid item xs={12}>
								<TextField fullWidth label="Date" type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} InputLabelProps={{ shrink: true }} />
							</Grid>
							<Grid item xs={12}>
								<TextField fullWidth label="Description" multiline rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
							</Grid>
						</Grid>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setCreateModalOpen(false)}>Cancel</Button>
						<Button variant="contained" onClick={handleCreate} disabled={submitting || !formData.periodId || !formData.staffId || !formData.overtimeHours} sx={{ bgcolor: '#137fec' }}>
							{submitting ? <CircularProgress size={20} color="inherit" /> : 'Create'}
						</Button>
					</DialogActions>
				</Dialog>

				{/* Bulk Upload Modal */}
				<BulkUploadModal
					open={uploadModalOpen}
					onClose={() => setUploadModalOpen(false)}
					onUpload={handleBulkUpload}
					title="Upload Overtime Entries"
					description="Upload a CSV or Excel file with overtime data"
					templateType="OVERTIME"
					requiredColumns={['staffId', 'overtimeHours']}
					optionalColumns={['multiplier', 'description']}
					onSuccess={handleUploadSuccess}
				/>
			</Box>
		</Box>
	);
};

export default OvertimeDashboard;
