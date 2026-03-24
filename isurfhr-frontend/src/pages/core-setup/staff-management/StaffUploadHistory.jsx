import React, { useState, useEffect } from 'react';
import {
	Box,
	Typography,
	Button,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Pagination,
	PaginationItem,
	CircularProgress,
	Alert,
	Snackbar,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StaffUploadReport from './StaffUploadReport'; // Import the report drawer
import { getStaffUploadHistory, getStaffDownloadFailedRecords } from '@/services/StaffService';

// Mock Data
const mockHistoryData = [
	{
		id: '#U-10524',
		uploadedBy: 'John Doe',
		email: 'john.doe@example.com',
		date: '2023-10-26 10:00 AM',
		total: 500,
		successful: 500,
		failed: 0,
	},
	{
		id: '#U-10523',
		uploadedBy: 'Jane Smith',
		email: 'jane.smith@example.com',
		date: '2023-10-25 03:15 PM',
		total: 320,
		successful: 315,
		failed: 5,
	},
	{
		id: '#U-10522',
		uploadedBy: 'Peter Jones',
		email: 'peter.jones@example.com',
		date: '2023-10-25 09:30 AM',
		total: 150,
		successful: 150,
		failed: 0,
	},
	{
		id: '#U-10521',
		uploadedBy: 'Mary Johnson',
		email: 'mary.j@example.com',
		date: '2023-10-24 11:45 AM',
		total: 210,
		successful: 200,
		failed: 10,
	},
	{
		id: '#U-10520',
		uploadedBy: 'David Williams',
		email: 'david.w@example.com',
		date: '2023-10-23 05:00 PM',
		total: 400,
		successful: 400,
		failed: 0,
	},
];

const StaffUploadHistory = () => {
	// State for data
	const [historyData, setHistoryData] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [snackbarOpen, setSnackbarOpen] = useState(false);

	// Pagination State
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 5, // Default rows per page
		total: 0,
	});

	// Report Drawer State
	const [reportOpen, setReportOpen] = useState(false);
	const [selectedReport, setSelectedReport] = useState(null);

	const fetchHistory = async (page = pagination.page, pageSize = pagination.pageSize) => {
		setLoading(true);
		setError(null);

		try {
			const result = await getStaffUploadHistory({
				page,
				pageSize,
			});

			if (result.success) {
				// Service already transformed the data, use it directly
				console.log(result.items);
				setHistoryData(result.items);
				setPagination({
					page: result.pagination.page,
					pageSize: result.pagination.pageSize,
					total: result.pagination.total,
				});
			} else {
				setError(result.error || 'Failed to fetch upload history');
				setSnackbarOpen(true);

				// Fallback to mock data for development
				if (process.env.NODE_ENV === 'development') {
					console.warn('Using mock data due to API error:', result.error);
					setHistoryData(getMockData());
					setPagination({
						page: 1,
						pageSize: 5,
						total: 50,
					});
				}
			}
		} catch (err) {
			setError('Network error occurred');
			setSnackbarOpen(true);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchHistory();
	}, []);

	// Handler for pagination change
	const handlePageChange = (event, newPage) => {
		setPagination((prev) => ({ ...prev, page: newPage }));
		fetchHistory(newPage);
	};

	// Handler for viewing report
	const handleViewReport = (row) => {
		// If you have detailed report endpoint, fetch it here
		// For now, construct from row data
		console.log({ row });
		const reportDetails = {
			summary: {
				processed: row.total,
				successful: row.successful,
				failed: row.failed,
				// Calculate other metrics if available in rawData
				newlyCreated: row.rawData?.newlyCreated || Math.floor(row.successful * 0.9),
				updated: row.rawData?.updated || Math.ceil(row.successful * 0.1),
			},
			metadata: {
				uploadId: row.id,
				uploadedBy: row.uploadedBy,
				email: row.email,
				date: row.date,
				fileName: row.rawData?.fileName || `staff_upload_${row.date.split(' ')[0]}.xlsx`,
				uploadType: row.rawData?.uploadType || 'Staff Bulk Upload',
			},
			errors:
				row.rawData?.errors ||
				(row.failed > 0
					? [
							{ row: 12, message: 'Invalid email format' },
							{ row: 45, message: 'Duplicate Staff ID' },
							{ row: 102, message: 'Missing Department field' },
					  ].slice(0, Math.min(row.failed, 3))
					: []),
			rawData: row.rawData, // Keep original data
		};

		setSelectedReport(reportDetails);
		setReportOpen(true);
	};

	// Mock data for development (remove when CORS is fixed)
	const getMockData = () => {
		return mockHistoryData;
	};

	const handleCloseSnackbar = () => {
		setSnackbarOpen(false);
	};

	const handleDownloadFailedReport = async (uploadId) => {
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

	// Calculate page count for pagination
	const pageCount = Math.ceil(pagination.total / pagination.pageSize);

	if (loading && historyData.length === 0) {
		return (
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					minHeight: '50vh',
					backgroundColor: '#0a1929',
				}}>
				<CircularProgress sx={{ color: '#2563eb' }} />
			</Box>
		);
	}

	return (
		<Box
			sx={{
				minHeight: '100vh',
				width: '100%',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				p: { xs: 2, sm: 3, md: 4 },
				backgroundColor: '#0a1929',
				fontFamily: '"Inter", sans-serif',
			}}>
			<Box sx={{ width: '100%', maxWidth: '1280px' }}>
				{/* Header */}
				<Box sx={{ mb: 4, px: 1 }}>
					<Typography
						variant="h4"
						component="h1"
						sx={{
							fontWeight: 900,
							fontSize: { xs: '1.875rem', sm: '2.25rem' },
							color: '#ffffff',
							letterSpacing: '-0.033em',
							lineHeight: 1.2,
							mb: 0.5,
						}}>
						Staff Upload History
					</Typography>
					<Typography
						variant="body1"
						sx={{
							color: '#94a3b8',
							fontSize: '1rem',
						}}>
						View all past staff upload batches and their processing results.
						{pagination.total > 0 && (
							<>
								{' '}
								<strong style={{ color: '#e2e8f0' }}>{pagination.total}</strong> total uploads
							</>
						)}
					</Typography>
				</Box>

				{/* Table Container */}
				<Paper
					elevation={0}
					sx={{
						borderRadius: 3,
						border: '1px solid rgba(255,255,255,0.08)',
						backgroundColor: '#0f172a',
						overflow: 'hidden',
						position: 'relative',
					}}>
					{loading && historyData.length > 0 && (
						<Box
							sx={{
								position: 'absolute',
								top: 0,
								left: 0,
								right: 0,
								bottom: 0,
								backgroundColor: 'rgba(15, 23, 42, 0.7)',
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center',
								zIndex: 10,
							}}>
							<CircularProgress sx={{ color: '#2563eb' }} />
						</Box>
					)}

					<TableContainer>
						<Table sx={{ minWidth: 800 }}>
							<TableHead>
								<TableRow sx={{ bgcolor: '#1e293b' }}>
									{['Upload ID', 'Uploaded By', 'Date Uploaded', 'Total Records', 'Successful', 'Failed', 'Actions'].map((header) => (
										<TableCell
											key={header}
											sx={{
												px: 3,
												py: 2,
												fontSize: '0.75rem',
												fontWeight: 600,
												textTransform: 'uppercase',
												color: '#94a3b8',
												borderBottom: 'none',
											}}>
											{header}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{historyData.length === 0 && !loading ? (
									<TableRow>
										<TableCell
											colSpan={7}
											sx={{ textAlign: 'center', py: 4, borderBottom: 'none' }}>
											<Typography sx={{ color: '#94a3b8' }}>No upload history found</Typography>
										</TableCell>
									</TableRow>
								) : (
									historyData.map((row) => (
										<TableRow
											key={row.id}
											sx={{
												'borderTop': '1px solid rgba(255,255,255,0.08)',
												'&:hover': { bgcolor: 'rgba(30, 41, 59, 0.5)' },
											}}>
											<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
												<Typography
													variant="body2"
													sx={{ fontWeight: 500, color: '#e2e8f0' }}>
													{row.id}
												</Typography>
											</TableCell>

											<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
												<Box>
													<Typography
														variant="body2"
														sx={{ color: '#e2e8f0' }}>
														{row.uploadedBy}
													</Typography>
													<Typography
														variant="caption"
														sx={{ display: 'block', color: '#94a3b8' }}>
														{row.email}
													</Typography>
												</Box>
											</TableCell>

											<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
												<Typography
													variant="body2"
													sx={{ color: '#94a3b8' }}>
													{row.date}
												</Typography>
											</TableCell>

											<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
												<Typography
													variant="body2"
													sx={{ color: '#94a3b8' }}>
													{row.total}
												</Typography>
											</TableCell>

											<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
												<Typography
													variant="body2"
													sx={{ color: '#4ade80', fontWeight: 600 }}>
													{row.successful}
												</Typography>
											</TableCell>

											<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
												<Typography
													variant="body2"
													sx={{ color: '#ef4444', fontWeight: 600 }}>
													{row.failed}
												</Typography>
											</TableCell>

											<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
												<Button
													size="small"
													onClick={() => handleViewReport(row)}
													sx={{
														'borderRadius': 9999,
														'px': 2,
														'py': 0.5,
														'fontSize': '0.75rem',
														'fontWeight': 600,
														'textTransform': 'none',
														'color': '#60a5fa',
														'bgcolor': 'rgba(59, 130, 246, 0.1)',
														'&:hover': {
															bgcolor: 'rgba(59, 130, 246, 0.2)',
														},
													}}>
													View Report
												</Button>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{/* Pagination */}
					{historyData.length > 0 && (
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								p: 2,
								borderTop: '1px solid rgba(255,255,255,0.08)',
							}}>
							<Pagination
								count={pageCount}
								page={pagination.page}
								onChange={handlePageChange}
								disabled={loading}
								renderItem={(item) => (
									<PaginationItem
										slots={{ previous: ChevronLeftIcon, next: ChevronRightIcon }}
										{...item}
										sx={{
											'borderRadius': 2,
											'width': 40,
											'height': 40,
											'margin': '0 2px',
											'color': '#e2e8f0',
											'fontSize': '0.875rem',
											'fontWeight': 500,
											'&.Mui-selected': {
												'backgroundColor': '#2563eb',
												'color': '#ffffff',
												'fontWeight': 700,
												'&:hover': {
													backgroundColor: '#1d4ed8',
												},
											},
											'&:hover': {
												backgroundColor: 'rgba(255,255,255,0.08)',
											},
											'&.Mui-disabled': {
												color: '#64748b',
											},
										}}
									/>
								)}
							/>
						</Box>
					)}
				</Paper>

				{/* Snackbar for errors */}
				<Snackbar
					open={snackbarOpen}
					autoHideDuration={6000}
					onClose={handleCloseSnackbar}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
					<Alert
						onClose={handleCloseSnackbar}
						severity="error"
						variant="filled"
						sx={{ width: '100%' }}>
						{error}
					</Alert>
				</Snackbar>
			</Box>

			{/* Staff Upload Report Drawer */}
			<StaffUploadReport
				open={reportOpen}
				onClose={() => setReportOpen(false)}
				onDownload={handleDownloadFailedReport}
				details={selectedReport}
			/>
		</Box>
	);
};

export default StaffUploadHistory;
