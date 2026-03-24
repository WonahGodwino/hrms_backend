// src/pages/payroll-engine/Deductions/DeductionsDashboard.jsx
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
	Chip,
	Tabs,
	Tab,
	Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getPayPeriods, getDeductionsByPeriod, createDeduction, deleteDeduction, bulkUploadDeductions, getDeductionSummary, getStaff } from '@/services/PayrollEngineService';
import { formatCurrency, BulkUploadModal } from '@/components/payroll-engine';

const DEDUCTION_TYPES = [
	{ value: 'UNION_DUES', label: 'Union Dues', color: '#8b5cf6', description: 'Trade union membership dues' },
	{ value: 'COOPERATIVE', label: 'Cooperative', color: '#06b6d4', description: 'Cooperative society contributions' },
	{ value: 'LOAN', label: 'Loan', color: '#3b82f6', description: 'Salary advance or loan repayment' },
	{ value: 'SALARY_ADVANCE', label: 'Salary Advance', color: '#f59e0b', description: 'Advance payment recovery' },
	{ value: 'OTHER', label: 'Other', color: '#64748b', description: 'Miscellaneous deductions' },
];

const getTypeConfig = (type) => DEDUCTION_TYPES.find((t) => t.value === type) || DEDUCTION_TYPES[DEDUCTION_TYPES.length - 1];

const DeductionsDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// Data State
	const [periods, setPeriods] = useState([]);
	const [selectedPeriodId, setSelectedPeriodId] = useState('');
	const [deductions, setDeductions] = useState([]);
	const [summary, setSummary] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Filter State
	const [typeFilter, setTypeFilter] = useState('all');

	// Pagination
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const rowsPerPage = 10;

	// Modal State
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [uploadModalOpen, setUploadModalOpen] = useState(false);
	const [formData, setFormData] = useState({
		staffId: '',
		deductionType: 'OTHER',
		amount: '',
		description: '',
		isRecurring: false,
	});
	const [submitting, setSubmitting] = useState(false);

	// Staff Selection State
	const [staffOptions, setStaffOptions] = useState([]);
	const [selectedStaff, setSelectedStaff] = useState(null);
	const [staffLoading, setStaffLoading] = useState(false);

	// Upload State
	const [uploadDeductionType, setUploadDeductionType] = useState('OTHER');

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

	// Fetch deductions when period changes
	useEffect(() => {
		const fetchDeductions = async () => {
			if (!selectedPeriodId) return;
			setLoading(true);
			try {
				const params = { page, limit: rowsPerPage };
				if (typeFilter !== 'all') params.deductionType = typeFilter;

				const [deductionsRes, summaryRes] = await Promise.all([
					getDeductionsByPeriod(selectedPeriodId, params),
					getDeductionSummary(selectedPeriodId),
				]);

				setDeductions(deductionsRes.data?.data || []);
				setTotalCount(deductionsRes.data?.total || 0);
				setSummary(summaryRes.data?.data || null);
			} catch (err) {
				console.error('Failed to fetch deductions:', err);
				setError('Unable to load deductions.');
			} finally {
				setLoading(false);
			}
		};
		fetchDeductions();
	}, [selectedPeriodId, page, typeFilter]);

	const handleCreate = async () => {
		setSubmitting(true);
		try {
			await createDeduction({
				payPeriodId: selectedPeriodId,
				...formData,
				amount: parseFloat(formData.amount),
			});
			setCreateModalOpen(false);
			setFormData({ staffId: '', deductionType: 'OTHER', amount: '', description: '', isRecurring: false });
			setSelectedStaff(null);
			// Refresh
			const response = await getDeductionsByPeriod(selectedPeriodId, { page, limit: rowsPerPage });
			setDeductions(response.data?.data || []);
		} catch (err) {
			setError(err.response?.data?.message || 'Failed to create deduction.');
		} finally {
			setSubmitting(false);
		}
	};

	const handleStaffChange = (event, newValue) => {
		setSelectedStaff(newValue);
		setFormData((prev) => ({ ...prev, staffId: newValue?._id || newValue?.id || '' }));
	};

	const handleDelete = async (id) => {
		if (!window.confirm('Delete this deduction?')) return;
		try {
			await deleteDeduction(id);
			setDeductions((prev) => prev.filter((d) => (d.id || d._id) !== id));
		} catch (err) {
			setError('Failed to delete deduction.');
		}
	};

	// Handle bulk upload
	const handleBulkUpload = async (file, options) => {
		if (!selectedPeriodId) {
			throw new Error('Please select a pay period first.');
		}
		return bulkUploadDeductions(selectedPeriodId, file, options?.deductionType || uploadDeductionType);
	};

	// Handle upload success
	const handleUploadSuccess = async () => {
		setUploadModalOpen(false);
		// Refresh deductions list
		const [deductionsRes, summaryRes] = await Promise.all([
			getDeductionsByPeriod(selectedPeriodId, { page, limit: rowsPerPage }),
			getDeductionSummary(selectedPeriodId),
		]);
		setDeductions(deductionsRes.data?.data || []);
		setTotalCount(deductionsRes.data?.total || 0);
		setSummary(summaryRes.data?.data || null);
	};

	const formatDate = (dateString) => {
		if (!dateString) return '--';
		return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	};

	return (
		<Box sx={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: { xs: 2, sm: 3, lg: 4 }, backgroundColor: isDarkMode ? '#101922' : '#f6f7f8' }}>
			<Box sx={{ width: '100%', maxWidth: '1200px' }}>
				{error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

				{/* Summary Cards */}
				{summary && (
					<Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
						{DEDUCTION_TYPES.map((type) => {
							const typeData = summary.byType?.find((t) => t._id === type.value);
							return (
								<Paper key={type.value} elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#fff' }}>
									<Typography variant="caption" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
										{type.label}
									</Typography>
									<Typography variant="h5" sx={{ fontWeight: 700, color: type.color, mt: 0.5 }}>
										{formatCurrency(typeData?.totalAmount || 0)}
									</Typography>
									<Typography variant="caption" sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }}>
										{typeData?.count || 0} entries
									</Typography>
								</Paper>
							);
						})}
					</Box>
				)}

				<Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, bgcolor: isDarkMode ? '#1A2632' : '#ffffff', overflow: 'hidden' }}>
					{/* Header */}
					<Box sx={{ p: { xs: 3, md: 4 }, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}` }}>
						<Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
							<Box>
								<Typography variant="h4" sx={{ fontWeight: 900, fontSize: '1.875rem', color: isDarkMode ? '#ffffff' : '#0f172a', letterSpacing: '-0.025em', mb: 0.5 }}>
									Deductions Management
								</Typography>
								<Typography variant="body1" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
									Manage employee deductions for pay periods
								</Typography>
							</Box>
							<Box sx={{ display: 'flex', gap: 2 }}>
								<Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => setUploadModalOpen(true)} sx={{ fontWeight: 600, textTransform: 'none', borderRadius: '9999px', height: 48, px: 3, borderColor: isDarkMode ? '#334155' : '#e2e8f0', color: isDarkMode ? '#e2e8f0' : '#334155' }}>
									Upload CSV
								</Button>
								<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateModalOpen(true)} sx={{ bgcolor: '#137fec', fontWeight: 700, textTransform: 'none', borderRadius: '9999px', height: 48, px: 3, '&:hover': { bgcolor: '#1d4ed8' } }}>
									Add Deduction
								</Button>
							</Box>
						</Box>
					</Box>

					{/* Toolbar */}
					<Box sx={{ px: { xs: 3, md: 4 }, py: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
						<FormControl size="small" sx={{ minWidth: 200 }}>
							<InputLabel>Pay Period</InputLabel>
							<Select value={selectedPeriodId} label="Pay Period" onChange={(e) => setSelectedPeriodId(e.target.value)} sx={{ bgcolor: isDarkMode ? '#1e293b' : '#f8fafc' }}>
								{periods.map((p) => <MenuItem key={p.id || p._id} value={p.id || p._id}>{p.periodName}</MenuItem>)}
							</Select>
						</FormControl>
						<FormControl size="small" sx={{ minWidth: 160 }}>
							<InputLabel>Type</InputLabel>
							<Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)} sx={{ bgcolor: isDarkMode ? '#1e293b' : '#f8fafc' }}>
								<MenuItem value="all">All Types</MenuItem>
								{DEDUCTION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
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
									{['Employee', 'Type', 'Amount', 'Description', 'Recurring', 'Created', 'Actions'].map((head) => (
										<TableCell key={head} sx={{ py: 2, px: 3, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: isDarkMode ? '#94a3b8' : '#64748b' }}>
											{head}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
								) : deductions.length === 0 ? (
									<TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No deductions found.</Typography></TableCell></TableRow>
								) : (
									deductions.map((item) => {
										const typeConfig = getTypeConfig(item.deductionType);
										const employeeName = item.staff?.fullName || `${item.staff?.firstName || ''} ${item.staff?.lastName || ''}`.trim() || item.staffId?.fullName || '--';
										return (
											<TableRow key={item.id || item._id} sx={{ '&:hover': { bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc' }, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}` }}>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<Typography variant="body2" sx={{ fontWeight: 600, color: isDarkMode ? '#fff' : '#0f172a' }}>{employeeName}</Typography>
												</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<Chip label={typeConfig.label} size="small" sx={{ bgcolor: `${typeConfig.color}20`, color: typeConfig.color, fontWeight: 600, fontSize: '0.7rem' }} />
												</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', fontWeight: 600, color: '#ef4444' }}>{formatCurrency(item.amount)}</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', color: isDarkMode ? '#94a3b8' : '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '--'}</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													{item.isRecurring ? (
														<Chip label="Yes" size="small" sx={{ bgcolor: '#22c55e20', color: '#22c55e', fontWeight: 600, fontSize: '0.7rem' }} />
													) : (
														<Chip label="No" size="small" sx={{ bgcolor: isDarkMode ? '#334155' : '#e2e8f0', color: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 600, fontSize: '0.7rem' }} />
													)}
												</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{formatDate(item.createdAt)}</TableCell>
												<TableCell sx={{ py: 2, px: 3, borderBottom: 'none' }}>
													<IconButton size="small" onClick={() => handleDelete(item.id || item._id)} sx={{ color: '#ef4444' }}>
														<DeleteIcon fontSize="small" />
													</IconButton>
												</TableCell>
											</TableRow>
										);
									})
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
					<DialogTitle>Add Deduction</DialogTitle>
					<DialogContent>
						<Grid container spacing={2} sx={{ mt: 1 }}>
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
								<FormControl fullWidth>
									<InputLabel>Type</InputLabel>
									<Select value={formData.deductionType} label="Type" onChange={(e) => setFormData({ ...formData, deductionType: e.target.value })}>
										{DEDUCTION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
									</Select>
								</FormControl>
							</Grid>
							<Grid item xs={6}>
								<TextField fullWidth label="Amount" type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required inputProps={{ min: 0, step: 0.01 }} />
							</Grid>
							<Grid item xs={12}>
								<TextField fullWidth label="Description" multiline rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
							</Grid>
						</Grid>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setCreateModalOpen(false)}>Cancel</Button>
						<Button variant="contained" onClick={handleCreate} disabled={submitting || !formData.staffId || !formData.amount} sx={{ bgcolor: '#137fec' }}>
							{submitting ? <CircularProgress size={20} color="inherit" /> : 'Create'}
						</Button>
					</DialogActions>
				</Dialog>

				{/* Bulk Upload Modal */}
				<BulkUploadModal
					open={uploadModalOpen}
					onClose={() => setUploadModalOpen(false)}
					onUpload={handleBulkUpload}
					title="Upload Deductions"
					description="Upload a CSV or Excel file with deduction data"
					templateType="DEDUCTIONS"
					deductionTypes={DEDUCTION_TYPES}
					selectedDeductionType={uploadDeductionType}
					onDeductionTypeChange={setUploadDeductionType}
					requiredColumns={['staffId', 'amount']}
					optionalColumns={['description']}
					onSuccess={handleUploadSuccess}
				/>
			</Box>
		</Box>
	);
};

export default DeductionsDashboard;
