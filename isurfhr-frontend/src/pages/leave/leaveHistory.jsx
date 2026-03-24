import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, CircularProgress, Alert, Chip, Button, TextField, MenuItem, Grid, InputAdornment, IconButton } from '@mui/material';
import { useAuth } from '@/lib/context/AuthContext';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import LeaveDetailsModal from '@/pages/leave/modals/leaveDetailsModal';
import { Search } from 'lucide-react';

export default function LeaveHistory() {
	const { user } = useAuth();
	const role = user?.role || 'STAFF';

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [filters, setFilters] = useState({
		status: 'all',
		startDate: null,
		endDate: null,
	});
	const [selectedRecord, setSelectedRecord] = useState(null);
	const [modalOpen, setModalOpen] = useState(false);
	const [historyData, setHistoryData] = useState([]);

	useEffect(() => {
		// Simulate loading history
		setTimeout(() => {
			setLoading(false);

			// Mock data - different for staff vs approver
			const mockHistory =
				role === 'STAFF'
					? [
							{
								id: 'lr001',
								reference: 'LR-2026-001',
								type: 'Annual Leave',
								startDate: '2026-01-15',
								endDate: '2026-01-18',
								days: 4,
								status: 'APPROVED',
								appliedAt: '2025-12-20',
							},
							{
								id: 'lr002',
								reference: 'LR-2025-045',
								type: 'Sick Leave',
								startDate: '2025-12-05',
								endDate: '2025-12-07',
								days: 3,
								status: 'REJECTED',
								appliedAt: '2025-11-28',
								rejectReason: 'Insufficient documentation',
							},
					  ]
					: [
							// Approver sees more records
							{
								id: 'lr003',
								staff: 'Jane Smith',
								reference: 'LR-2026-007',
								type: 'Annual Leave',
								startDate: '2026-02-10',
								endDate: '2026-02-14',
								days: 5,
								status: 'APPROVED',
								appliedAt: '2026-01-25',
							},
							{
								id: 'lr004',
								staff: 'Mike Johnson',
								reference: 'LR-2026-012',
								type: 'Personal Leave',
								startDate: '2026-03-01',
								endDate: '2026-03-03',
								days: 3,
								status: 'PENDING',
								appliedAt: '2026-02-01',
							},
					  ];

			setHistoryData(mockHistory);
		}, 1000);
	}, [role]);

	const handleFilterChange = (field, value) => {
		setFilters((prev) => ({ ...prev, [field]: value }));
	};

	const handleSearch = async () => {};

	if (loading) {
		return (
			<Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<CircularProgress color="primary" />
			</Box>
		);
	}

	return (
		<Box
			component="main"
			sx={{
				width: '100%',
				minHeight: '100vh',
				bgcolor: '#0a1929',
				px: { xs: 2, sm: 4, md: 6 },
				py: 4,
			}}>
			{/* Header */}
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				justifyContent="space-between"
				alignItems={{ xs: 'flex-start', sm: 'center' }}
				spacing={2}
				sx={{ mb: 4 }}>
				<Typography
					variant="h4"
					fontWeight={700}
					color="white">
					{role === 'STAFF' ? 'My Leave History' : 'Leave History'}
				</Typography>

				<Button
					variant="contained"
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
						'&:hover': {
							backgroundColor: '#1976d2',
							boxShadow: 'none',
						},
					}}
					onClick={() => window.history.back()}>
					Back to Dashboard
				</Button>
			</Stack>

			{/* Filters */}
			{/* <Paper sx={{ p: 3, bgcolor: '#0f172a', borderRadius: 2, mb: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
				<Typography
					variant="h6"
					color="white"
					sx={{ mb: 2 }}>
					Filter History
				</Typography>
				<Grid
					container
					spacing={3}>
					<Grid
						item
						xs={12}
						sm={4}>
						<TextField
							select
							fullWidth
							label="Status"
							value={filters.status}
							onChange={(e) => handleFilterChange('status', e.target.value)}
							variant="outlined"
							size="small"
							sx={{
								'& .MuiOutlinedInput-root': {
									bgcolor: '#1e293b',
									color: 'white',
								},
							}}>
							<MenuItem value="all">All</MenuItem>
							<MenuItem value="approved">Approved / On Leave</MenuItem>
							<MenuItem value="pending">Pending</MenuItem>
							<MenuItem value="rejected">Rejected</MenuItem>
							<MenuItem value="cancelled">Cancelled</MenuItem>
						</TextField>
					</Grid>

					<Grid
						item
						xs={12}
						sm={4}>
						<LocalizationProvider dateAdapter={AdapterDateFns}>
							<DatePicker
								label="From Date"
								value={filters.startDate}
								onChange={(newValue) => handleFilterChange('startDate', newValue)}
								renderInput={(params) => (
									<TextField
										{...params}
										fullWidth
										size="small"
										sx={{
											'& .MuiOutlinedInput-root': {
												bgcolor: '#1e293b',
												color: 'white',
											},
										}}
									/>
								)}
							/>
						</LocalizationProvider>
					</Grid>

					<Grid
						item
						xs={12}
						sm={4}>
						<LocalizationProvider dateAdapter={AdapterDateFns}>
							<DatePicker
								label="To Date"
								value={filters.endDate}
								onChange={(newValue) => handleFilterChange('endDate', newValue)}
								renderInput={(params) => (
									<TextField
										{...params}
										fullWidth
										size="small"
										sx={{
											'& .MuiOutlinedInput-root': {
												bgcolor: '#1e293b',
												color: 'white',
											},
										}}
									/>
								)}
							/>
						</LocalizationProvider>
					</Grid>
				</Grid>
			</Paper> */}
			<LeaveFilterPanel
				filters={filters}
				handleFilterChange={handleFilterChange}
				onSearch={handleSearch}
			/>

			{/* History List */}
			<Paper sx={{ p: 3, bgcolor: '#0f172a', borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)' }}>
				<Typography
					variant="h6"
					color="white"
					sx={{ mb: 2 }}>
					Leave Records
				</Typography>

				{historyData.length === 0 ? (
					<Box sx={{ textAlign: 'center', py: 6 }}>
						<Typography color="text.secondary">No leave records found matching your filters</Typography>
					</Box>
				) : (
					<Stack spacing={2}>
						{historyData.map((record) => (
							<Paper
								key={record.id}
								variant="outlined"
								onClick={() => {
									setSelectedRecord(record);
									setModalOpen(true);
								}}
								sx={{
									'p': 2.5,
									'bgcolor': '#1e293b',
									'borderColor': 'rgba(255,255,255,0.12)',
									'&:hover': { borderColor: '#2196f3', cursor: 'pointer' },
								}}>
								<Stack
									direction="row"
									justifyContent="space-between"
									alignItems="center">
									<Box>
										{role !== 'STAFF' && (
											<Typography
												variant="subtitle1"
												color="white"
												sx={{ mb: 0.5 }}>
												{record.staff}
											</Typography>
										)}
										<Typography
											variant="body1"
											color="white">
											{record.type} • {record.startDate} – {record.endDate} • {record.days} day(s)
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary">
											Reference: {record.reference} • Applied: {record.appliedAt}
										</Typography>
									</Box>

									<Chip
										label={record.status}
										color={record.status === 'APPROVED' ? 'success' : record.status === 'PENDING' ? 'warning' : record.status === 'REJECTED' ? 'error' : 'default'}
										size="small"
									/>
								</Stack>

								{record.rejectReason && (
									<Typography
										variant="body2"
										color="error"
										sx={{ mt: 1 }}>
										Reason: {record.rejectReason}
									</Typography>
								)}
							</Paper>
						))}
					</Stack>
				)}
			</Paper>

			<LeaveDetailsModal
				open={modalOpen}
				onClose={() => setModalOpen(false)}
				leaveRecord={selectedRecord}
				role={role}
			/>
		</Box>
	);
}

function LeaveFilterPanel({ filters, handleFilterChange, onSearch }) {
	return (
		<Paper
			sx={{
				p: 3,
				bgcolor: '#0f172a',
				borderRadius: 2,
				mb: 4,
				border: '1px solid rgba(255,255,255,0.08)',
			}}>
			<Typography
				variant="h6"
				color="white"
				sx={{ mb: 2 }}>
				Filter History
			</Typography>

			{/* All filters in one container */}
			<Grid
				container
				spacing={3}>
				{/* Search – full width on all sizes, but we control row break via breakpoints */}
				<Grid
					item
					size={{ sm: 4, md: 3, xs: 12 }}>
					{/* xs={12}
					md={4}> */}
					<TextField
						fullWidth
						placeholder="Search by name or email..."
						value={filters.search || ''}
						onChange={(e) => handleFilterChange('search', e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') onSearch();
						}}
						size="small"
						InputProps={{
							endAdornment: (
								<InputAdornment position="end">
									<IconButton
										size="small"
										onClick={onSearch}
										sx={{ color: '#94a3b8' }}>
										<Search size={18} />
									</IconButton>
								</InputAdornment>
							),
							sx: {
								'bgcolor': '#1e293b',
								'color': 'white',
								'& .MuiInputBase-input': {
									'color': 'white',
									'&::placeholder': { color: '#94a3b8', opacity: 1 },
								},
							},
						}}
						sx={{
							'& .MuiOutlinedInput-root': {
								'& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
								'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
								'&.Mui-focused fieldset': { borderColor: '#3b82f6' },
							},
						}}
					/>
				</Grid>

				{/* Status – fixed width on desktop */}
				<Grid
					item
					size={{ sm: 4, md: 3, xs: 12 }}>
					{/* xs={12}
					sm={4}
					md={2}> */}
					<TextField
						select
						label="Status"
						value={filters.status}
						onChange={(e) => handleFilterChange('status', e.target.value)}
						variant="outlined"
						size="small"
						fullWidth
						sx={{
							'width': { xs: '100%' },
							'& .MuiOutlinedInput-root': {
								'bgcolor': '#1e293b',
								'color': 'white',
								'& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
								'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
								'&.Mui-focused fieldset': { borderColor: '#3b82f6' },
							},
							'& .MuiInputLabel-root': { color: '#94a3b8' },
							'& .MuiSelect-icon': { color: '#94a3b8' },
						}}>
						<MenuItem value="all">All</MenuItem>
						<MenuItem value="approved">Approved / On Leave</MenuItem>
						<MenuItem value="pending">Pending</MenuItem>
						<MenuItem value="rejected">Rejected</MenuItem>
						<MenuItem value="cancelled">Cancelled</MenuItem>
					</TextField>
				</Grid>

				{/* From Date */}
				<Grid
					item
					size={{ sm: 4, md: 3, xs: 12 }}>
					{/* xs={12}
					sm={4}
					md={3}> */}
					<LocalizationProvider dateAdapter={AdapterDateFns}>
						<DatePicker
							label="From Date"
							value={filters.startDate}
							onChange={(newValue) => handleFilterChange('startDate', newValue)}
							renderInput={(params) => (
								<TextField
									{...params}
									fullWidth
									size="small"
									sx={{
										'& .MuiOutlinedInput-root': {
											'bgcolor': '#1e293b',
											'color': 'white',
											'& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
											'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
											'&.Mui-focused fieldset': { borderColor: '#3b82f6' },
										},
										'& .MuiInputLabel-root': { color: '#94a3b8' },
									}}
								/>
							)}
						/>
					</LocalizationProvider>
				</Grid>

				{/* To Date */}
				<Grid
					item
					size={{ sm: 4, md: 3, xs: 12 }}>
					{/* xs={12}
					sm={4}
					md={3}> */}
					<LocalizationProvider dateAdapter={AdapterDateFns}>
						<DatePicker
							label="To Date"
							value={filters.endDate}
							onChange={(newValue) => handleFilterChange('endDate', newValue)}
							renderInput={(params) => (
								<TextField
									{...params}
									fullWidth
									size="small"
									sx={{
										'& .MuiOutlinedInput-root': {
											'bgcolor': '#1e293b',
											'color': 'white',
											'& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
											'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
											'&.Mui-focused fieldset': { borderColor: '#3b82f6' },
										},
										'& .MuiInputLabel-root': { color: '#94a3b8' },
									}}
								/>
							)}
						/>
					</LocalizationProvider>
				</Grid>
			</Grid>
		</Paper>
	);
}
