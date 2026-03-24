import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, Grid, Button, TextField, MenuItem, CircularProgress, Alert, Snackbar, Chip, IconButton, Tooltip } from '@mui/material';
import { useAuth } from '@/lib/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import LeaveDetailsModal from '@/pages/leave/modals/leaveDetailsModal';

export default function LeaveRequests() {
	const { user } = useAuth();
	const role = user?.role || 'STAFF';
	const companyId = user?.companyId || '';
	const navigate = useNavigate();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [requests, setRequests] = useState([]);
	const [filters, setFilters] = useState({
		status: 'all',
		search: '',
	});

	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
	const [selectedRecord, setSelectedRecord] = useState(null);
	const [modalOpen, setModalOpen] = useState(false);

	const isStaff = role === 'STAFF';
	const isApprover = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role);

	useEffect(() => {
		const fetchRequests = async () => {
			setLoading(true);
			setError('');

			try {
				// Simulate API fetch
				await new Promise((resolve) => setTimeout(resolve, 1200));

				// Mock data - different by role
				const mockData = isStaff
					? [
							{
								id: 'lr001',
								reference: 'LR-2026-001',
								type: 'Annual Leave',
								startDate: '2026-03-10',
								endDate: '2026-03-14',
								days: 5,
								status: 'APPROVED',
								appliedAt: '2026-02-20',
							},
							{
								id: 'lr002',
								reference: 'LR-2026-015',
								type: 'Sick Leave',
								startDate: '2026-02-05',
								endDate: '2026-02-07',
								days: 3,
								status: 'PENDING',
								appliedAt: '2026-01-28',
							},
							{
								id: 'lr003',
								reference: 'LR-2025-089',
								type: 'Personal Leave',
								startDate: '2025-12-20',
								endDate: '2025-12-22',
								days: 3,
								status: 'REJECTED',
								appliedAt: '2025-12-01',
								rejectReason: 'Overlapping project deadline',
							},
					  ]
					: [
							{
								id: 'lr004',
								staff: 'Jane Smith',
								reference: 'LR-2026-007',
								type: 'Annual Leave',
								startDate: '2026-03-15',
								endDate: '2026-03-20',
								days: 6,
								status: 'PENDING',
								appliedAt: '2026-02-25',
							},
							{
								id: 'lr005',
								staff: 'Mike Johnson',
								reference: 'LR-2026-012',
								type: 'Sick Leave',
								startDate: '2026-02-10',
								endDate: '2026-02-11',
								days: 2,
								status: 'APPROVED',
								appliedAt: '2026-02-01',
							},
							// ... more items
					  ];

				setRequests(mockData);
			} catch (err) {
				setError('Failed to load leave requests');
				console.error(err);
			} finally {
				setLoading(false);
			}
		};

		fetchRequests();
	}, [role, companyId]);

	const filteredRequests = requests.filter((req) => {
		if (filters.status !== 'all' && req.status?.toLowerCase() !== filters.status) return false;
		if (filters.search) {
			const searchLower = filters.search.toLowerCase();
			return (
				req.reference?.toLowerCase().includes(searchLower) ||
				req.type?.toLowerCase().includes(searchLower) ||
				(isApprover && req.staff?.toLowerCase().includes(searchLower))
			);
		}
		return true;
	});

	const handleApply = () => {
		setSnackbar({ open: true, message: 'Opening leave application...', severity: 'info' });
		// Later: navigate('/leave-dashboard/apply') or open modal
	};

	const handleViewDetails = (record) => {
		setSelectedRecord(record);
		setModalOpen(true);
	};

	const handleSnackbarClose = () => setSnackbar({ ...snackbar, open: false });

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
					Leave Requests
					{isApprover && (
						<Chip
							label="Team View"
							size="small"
							color="primary"
							sx={{ ml: 2, bgcolor: '#2196f3', color: 'white' }}
						/>
					)}
				</Typography>

				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						alignItems: { sm: 'center' },
						justifyContent: { sm: 'flex-end' },
						gap: 2,
						width: { xs: '100%', md: 'auto' },
					}}>
					<Tooltip title="Apply for leave">
						<Button
							variant="contained"
							startIcon={<AddIcon />}
							onClick={handleApply}
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
							}}>
							Apply for Leave
						</Button>
					</Tooltip>
				</Box>
			</Stack>

			{error && (
				<Alert
					severity="error"
					sx={{ mb: 3 }}
					onClose={() => setError('')}>
					{error}
				</Alert>
			)}

			{/* Filters */}
			<Paper sx={{ p: 3, bgcolor: '#0f172a', borderRadius: 2, mb: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					spacing={3}
					alignItems={{ sm: 'center' }}
					justifyContent="space-between">
					<TextField
						select
						label="Status"
						value={filters.status}
						onChange={(e) => setFilters({ ...filters, status: e.target.value })}
						size="small"
						sx={{
							'minWidth': 160,
							'& .MuiOutlinedInput-root': { bgcolor: '#1e293b', color: 'white' },
						}}>
						<MenuItem value="all">All</MenuItem>
						<MenuItem value="pending">Pending</MenuItem>
						<MenuItem value="approved">Approved</MenuItem>
						<MenuItem value="rejected">Rejected</MenuItem>
						<MenuItem value="cancelled">Cancelled</MenuItem>
					</TextField>

					<TextField
						fullWidth
						placeholder="Search by reference, type, or staff..."
						value={filters.search}
						onChange={(e) => setFilters({ ...filters, search: e.target.value })}
						InputProps={{
							startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.5)', mr: 1 }} />,
						}}
						size="small"
						sx={{
							'maxWidth': 400,
							'& .MuiOutlinedInput-root': { bgcolor: '#1e293b', color: 'white' },
						}}
					/>

					<Tooltip title="Export filtered list">
						<IconButton
							sx={{
								'color': 'white',
								'bgcolor': '#334155',
								'&:hover': { bgcolor: '#475569' },
							}}
							// onClick={handleExport}
						>
							<DownloadIcon />
						</IconButton>
					</Tooltip>
				</Stack>
			</Paper>

			{/* Requests List */}
			<Paper sx={{ p: 3, bgcolor: '#0f172a', borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)' }}>
				{filteredRequests.length === 0 ? (
					<Box sx={{ textAlign: 'center', py: 8 }}>
						<Typography
							variant="h6"
							color="text.secondary">
							No leave requests found
						</Typography>
						{isStaff && (
							<Button
								variant="contained"
								startIcon={<AddIcon />}
								onClick={handleApply}
								sx={{ mt: 3 }}>
								Apply for Leave
							</Button>
						)}
					</Box>
				) : (
					<Stack spacing={2}>
						{filteredRequests.map((req) => (
							<Paper
								key={req.id}
								variant="outlined"
								onClick={() => handleViewDetails(req)}
								sx={{
									'p': 3,
									'bgcolor': '#1e293b',
									'borderColor': 'rgba(255,255,255,0.12)',
									'borderRadius': 2,
									'cursor': 'pointer',
									'transition': 'all 0.2s',
									'&:hover': {
										borderColor: '#2196f3',
										transform: 'translateY(-2px)',
										boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
									},
								}}>
								<Stack
									direction={{ xs: 'column', sm: 'row' }}
									justifyContent="space-between"
									alignItems={{ sm: 'center' }}
									spacing={2}>
									<Box sx={{ flex: 1 }}>
										{!isStaff && (
											<Typography
												variant="subtitle1"
												color="white"
												sx={{ mb: 0.5 }}>
												{req.staff}
											</Typography>
										)}
										<Typography
											variant="body1"
											color="white">
											{req.type} • {req.startDate} – {req.endDate} • {req.days} day(s)
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary">
											Reference: {req.reference} • Applied: {req.appliedAt}
										</Typography>
									</Box>

									<Chip
										label={req.status?.toUpperCase() || 'UNKNOWN'}
										color={getStatusColor(req.status)}
										size="medium"
										sx={{ minWidth: 100, fontWeight: 600 }}
									/>

									{/* Quick actions (approvers only) */}
									{isApprover && req.status === 'PENDING' && (
										<Stack
											direction="row"
											spacing={1}
											sx={{ ml: 2 }}>
											<Button
												size="small"
												variant="outlined"
												color="success"
												sx={{ minWidth: 80 }}
												// onClick={() => handleApprove(req)}
											>
												Approve
											</Button>
											<Button
												size="small"
												variant="outlined"
												color="error"
												sx={{ minWidth: 80 }}
												// onClick={() => handleReject(req)}
											>
												Reject
											</Button>
										</Stack>
									)}

									{/* Cancel for staff pending */}
									{isStaff && req.status === 'PENDING' && (
										<Button
											size="small"
											variant="outlined"
											color="error"
											sx={{ ml: 2, minWidth: 80 }}
											// onClick={() => handleCancel(req)}
										>
											Cancel
										</Button>
									)}
								</Stack>
							</Paper>
						))}
					</Stack>
				)}
			</Paper>

			{/* Modal */}
			<LeaveDetailsModal
				open={modalOpen}
				onClose={() => setModalOpen(false)}
				leaveRecord={selectedRecord}
				role={role}
			/>

			{/* Snackbar */}
			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={() => setSnackbar({ ...snackbar, open: false })}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
				<Alert
					severity={snackbar.severity}
					sx={{ width: '100%' }}>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</Box>
	);
}

// Helper (copy from modal or centralize)
const getStatusColor = (status) => {
	switch (status?.toUpperCase()) {
		case 'APPROVED':
		case 'ON LEAVE':
			return 'success';
		case 'PENDING':
			return 'warning';
		case 'REJECTED':
			return 'error';
		case 'CANCELLED':
			return 'default';
		default:
			return 'default';
	}
};
