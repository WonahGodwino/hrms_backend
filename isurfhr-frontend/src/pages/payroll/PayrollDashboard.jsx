import React, { useState } from 'react';
import {
	Box,
	Typography,
	Button,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Paper,
	useTheme,
	Pagination,
	PaginationItem,
	Alert,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import UploadPayrollModal from './UploadPayrollModal';
import DownloadingToast from './DownloadingToast';
import PayrollDetailsDrawer from './PayrollDetailsDrawer'; // Import the drawer
import { downloadPayrollTemplate, getPayrollHistory } from '../../services/PayrollService';
import { useEffect } from 'react';
import { TEMPLATE_LABEL_MAP } from '@/lib/utils';
import DownloadTemplateModal from '@/pages/payroll/DownloadTemplateModal';

const PayrollDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	// State
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
	const [downloadError, setDownloadError] = useState('');
	const [toastOpen, setToastOpen] = useState(false);
	const [downloadStatus, setDownloadStatus] = useState('idle');
	const [downloadModalOpen, setDownloadModalOpen] = useState(false);
	const [selectedTemplate, setSelectedTemplate] = useState('ISURF_STANDARD');

	// Payroll data state
	const [payrollData, setPayrollData] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// Details Drawer State
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [selectedPayroll, setSelectedPayroll] = useState(null);

	// Pagination State
	const [page, setPage] = useState(1);
	const rowsPerPage = 5;

	// Calculate pagination
	const pageCount = Math.ceil(payrollData.length / rowsPerPage);
	const displayedRows = payrollData.slice((page - 1) * rowsPerPage, page * rowsPerPage);

	// Fetch payroll data
	const fetchPayrolls = async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await getPayrollHistory();
			const uploads = response.data.data.uploads;

			// Transform API data to match component structure
			const transformedData = uploads.map((upload, index) => ({
				id: upload.uploadId,
				date: formatDate(upload.uploadedOn),
				total: upload.totalRecords,
				success: upload.successful,
				failed: upload.failed,
				fileName: upload.fileName,
				uploadedBy: upload.uploadedBy,
				failedRecordsDownload: upload.failedRecordsDownload,
				// Add sequential ID for display if needed
				displayId: `PAY-${String(uploads.length - index).padStart(5, '0')}`,
			}));

			setPayrollData(transformedData);
		} catch (error) {
			if (error.status === 403) {
				setErrorMessage(error.response.data.message || 'Failed to load payroll data.');
			} else if (error.status === 404) {
				return;
			} else {
				setErrorMessage('Failed to load payroll data.');
			}
			setError('Error fetching payroll data');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchPayrolls();
	}, []);

	// Format date function
	const formatDate = (dateString) => {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	// Handlers
	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleOpenUploadModal = () => setIsUploadModalOpen(true);
	const handleCloseUploadModal = () => setIsUploadModalOpen(false);

	const handleUploadPayroll = () => {
		console.log('Payroll uploaded successfully, refreshing data...');
		// Refresh data after upload
		fetchPayrolls();
		setPage(1);
		handleCloseUploadModal();
	};

	const handleDownloadTemplate = async () => {
		setDownloadError('');
		setDownloadStatus('downloading');
		setToastOpen(true);

		try {
			const response = await downloadPayrollTemplate(selectedTemplate);

			const blob = new Blob([response.data], {
				type: response.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});

			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', 'payroll_template.xlsx');

			document.body.appendChild(link);
			link.click();

			link.parentNode.removeChild(link);
			window.URL.revokeObjectURL(url);

			setDownloadStatus('success');
		} catch (err) {
			console.error('Download Template Error:', err);
			setDownloadStatus('error');
			setDownloadError('Failed to download template. Please try again.');
		} finally {
			setDownloadModalOpen(false);
		}
	};

	const handleToastClose = (event, reason) => {
		if (reason === 'clickaway') {
			return;
		}
		setToastOpen(false);
		if (downloadStatus !== 'downloading') {
			setTimeout(() => setDownloadStatus('idle'), 300);
		}
	};

	// Handler for View Details - updated to use real data
	const handleViewDetails = (row) => {
		const details = {
			summary: {
				processed: row.total,
				successful: row.success,
				failed: row.failed,
				generated: row.success, // Assuming success = generated
				sent: row.success, // Assuming success = sent
			},
			metadata: {
				uploadId: row.id,
				uploadedBy: row.uploadedBy?.name || 'Unknown',
				date: row.date,
				fileName: row.fileName || `payroll_${row.date.toLowerCase().replace(/ /g, '_').replace(/,/g, '')}.xlsx`,
			},
			// In a real app, you would fetch error details from an API
			errors: row.failed > 0 ? [] : [], // Placeholder for actual error data
			failedRecordsDownload: row.failedRecordsDownload,
		};

		setSelectedPayroll(details);
		setDetailsOpen(true);
	};

	const handleCloseDetails = () => {
		setDetailsOpen(false);
	};

	// Add these animations at the top of your component
	const pageAnimations = {
		'@keyframes fadeIn': {
			'0%': { opacity: 0 },
			'100%': { opacity: 1 },
		},
		'@keyframes slideInUp': {
			'0%': {
				transform: 'translateY(30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInDown': {
			'0%': {
				transform: 'translateY(-30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateY(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInLeft': {
			'0%': {
				transform: 'translateX(-30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes slideInRight': {
			'0%': {
				transform: 'translateX(30px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes scaleIn': {
			'0%': {
				transform: 'scale(0.95)',
				opacity: 0,
			},
			'100%': {
				transform: 'scale(1)',
				opacity: 1,
			},
		},
		'@keyframes rowEnter': {
			'0%': {
				transform: 'translateX(-10px)',
				opacity: 0,
			},
			'100%': {
				transform: 'translateX(0)',
				opacity: 1,
			},
		},
		'@keyframes pulse-glow': {
			'0%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0.4)' },
			'70%': { boxShadow: '0 0 0 8px rgba(19, 127, 236, 0)' },
			'100%': { boxShadow: '0 0 0 0 rgba(19, 127, 236, 0)' },
		},
		'@keyframes shimmer': {
			'0%': { backgroundPosition: '-1000px 0' },
			'100%': { backgroundPosition: '1000px 0' },
		},
		'@keyframes shake': {
			'0%, 100%': { transform: 'translateX(0)' },
			'25%': { transform: 'translateX(-5px)' },
			'75%': { transform: 'translateX(5px)' },
		},
	};

	return (
		<Box
			sx={{
				minHeight: '100vh',
				width: '100%',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'flex-start',
				p: { xs: 2, sm: 3, md: 4 },
				backgroundColor: isDarkMode ? 'inherit' : '#f6f7f8',
				fontFamily: '"Inter", sans-serif',
				animation: 'fadeIn 0.5s ease-out',
				...pageAnimations,
			}}>
			<Box sx={{ width: '100%', maxWidth: '1152px' }}>
				{/* Error Alert for Download */}
				{downloadError && (
					<Alert
						severity="error"
						onClose={() => setDownloadError('')}
						sx={{
							mb: 2,
							animation: 'shake 0.3s ease-out',
							...pageAnimations,
						}}>
						{downloadError}
					</Alert>
				)}

				{/* Error Alert for Data Fetching */}
				{error && (
					<Alert
						severity="error"
						onClose={() => setError(null)}
						sx={{
							mb: 2,
							animation: 'shake 0.3s ease-out',
							...pageAnimations,
						}}>
						{error}
					</Alert>
				)}

				{/* Header Section */}
				<Box
					component="header"
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						alignItems: { sm: 'center' },
						justifyContent: { sm: 'space-between' },
						gap: 2,
						py: 2,
						px: 1,
						mb: 3,
					}}>
					{/* Title - No underline, just slide in */}
					<Typography
						variant="h4"
						component="h1"
						sx={{
							fontWeight: 900,
							letterSpacing: '-0.025em',
							color: isDarkMode ? '#ffffff' : '#0d141b',
							fontSize: { xs: '1.875rem', sm: '2.25rem' },
							animation: 'slideInDown 0.5s ease-out',
							...pageAnimations,
						}}>
						Payroll Processing
					</Typography>

					{/* Action Buttons */}
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1.5,
							animation: 'slideInRight 0.5s ease-out',
							...pageAnimations,
						}}>
						<Button
							variant="contained"
							startIcon={<DownloadIcon sx={{ transition: 'transform 0.2s ease' }} />}
							onClick={() => setDownloadModalOpen(true)}
							disabled={downloadStatus === 'downloading'}
							sx={{
								'height': 40,
								'px': 2,
								'borderRadius': 2,
								'backgroundColor': isDarkMode ? '#334155' : '#e7edf3',
								'color': isDarkMode ? '#ffffff' : '#0d141b',
								'fontWeight': 700,
								'textTransform': 'none',
								'letterSpacing': '0.015em',
								'boxShadow': 'none',
								'transition': 'all 0.3s ease',
								'&:hover': {
									'backgroundColor': isDarkMode ? '#475569' : '#cbd5e1',
									'transform': 'scale(1.02)',
									'& .MuiSvgIcon-root': {
										transform: 'translateY(-2px)',
									},
								},
							}}>
							Download Template
						</Button>

						<Button
							variant="contained"
							startIcon={<UploadFileIcon sx={{ transition: 'transform 0.2s ease' }} />}
							onClick={handleOpenUploadModal}
							sx={{
								'height': 40,
								'px': 2,
								'borderRadius': 2,
								'backgroundColor': '#137fec',
								'color': '#ffffff',
								'fontWeight': 700,
								'textTransform': 'none',
								'letterSpacing': '0.015em',
								'boxShadow': 'none',
								'position': 'relative',
								'overflow': 'hidden',
								'transition': 'all 0.3s ease',
								'&::before': {
									content: '""',
									position: 'absolute',
									top: '50%',
									left: '50%',
									width: 0,
									height: 0,
									borderRadius: '50%',
									background: 'rgba(255,255,255,0.3)',
									transform: 'translate(-50%, -50%)',
									transition: 'width 0.6s ease, height 0.6s ease',
								},
								'&:hover': {
									'backgroundColor': 'rgba(19, 127, 236, 0.9)',
									'transform': 'scale(1.02)',
									'& .MuiSvgIcon-root': {
										transform: 'rotate(90deg) scale(1.1)',
									},
									'&::before': {
										width: '200px',
										height: '200px',
									},
								},
							}}>
							Upload Payroll
						</Button>
					</Box>
				</Box>

				{/* Main Table Paper */}
				<Paper
					elevation={0}
					sx={{
						'mt': 0,
						'borderRadius': 3,
						'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						'backgroundColor': isDarkMode ? 'inherit' : '#ffffff',
						'overflow': 'hidden',
						'boxShadow': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
						'animation': 'slideInUp 0.5s ease-out 0.1s both',
						'transition': 'all 0.3s ease',
						'&:hover': {
							boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
						},
						...pageAnimations,
					}}>
					{loading ? (
						<Box sx={{ p: 4, textAlign: 'center' }}>
							<CircularProgress
								size={32}
								sx={{
									'color': '#2196f3',
									'animation': 'spin 1s linear infinite, pulse-glow 1.5s infinite',
									'@keyframes spin': {
										'0%': { transform: 'rotate(0deg)' },
										'100%': { transform: 'rotate(360deg)' },
									},
									...pageAnimations,
								}}
							/>
						</Box>
					) : payrollData.length === 0 ? (
						<Box sx={{ p: 4, textAlign: 'center' }}>
							<Typography
								color="text.secondary"
								sx={{
									animation: 'fadeIn 0.3s ease-out',
									...pageAnimations,
								}}>
								No payroll data available
							</Typography>
						</Box>
					) : (
						<>
							<Box sx={{ px: 2, py: 1.5 }}>
								<TableContainer>
									<Table
										sx={{ minWidth: 650 }}
										aria-label="payroll table">
										<TableHead>
											<TableRow
												sx={{
													bgcolor: isDarkMode ? '#0f172a' : '#f8fafc',
													borderBottom: `1px solid ${isDarkMode ? '#334155' : '#cfdbe7'}`,
												}}>
												{['Upload ID', 'Date', 'Total Records', 'Successful', 'Failed', 'Actions'].map((head, index) => (
													<TableCell
														key={head}
														sx={{
															px: 2,
															py: 1.5,
															width: '16.66%',
															fontWeight: 500,
															borderBottom: 'none',
															fontSize: '0.875rem',
															color: isDarkMode ? '#cbd5e1' : '#0d141b',
															animation: `slideInDown 0.3s ease-out ${index * 0.05}s both`,
															...pageAnimations,
														}}>
														{head}
													</TableCell>
												))}
											</TableRow>
										</TableHead>
										<TableBody>
											{displayedRows.map((row, index) => (
												<TableRow
													key={row.id}
													sx={{
														'borderTop': `1px solid ${isDarkMode ? '#334155' : '#cfdbe7'}`,
														'&:last-child td, &:last-child th': { border: 0 },
														'transition': 'all 0.2s ease',
														'animation': `rowEnter 0.3s ease-out ${index * 0.03}s both`,
														'&:hover': {
															backgroundColor: isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(241, 245, 249, 0.5)',
														},
														...pageAnimations,
													}}>
													<TableCell
														sx={{
															height: 72,
															px: 2,
															py: 1,
															fontSize: '0.875rem',
															color: isDarkMode ? '#94a3b8' : '#4c739a',
															borderBottom: 'none',
														}}>
														{row.displayId || row.id}
													</TableCell>
													<TableCell
														sx={{
															height: 72,
															px: 2,
															py: 1,
															fontSize: '0.875rem',
															color: isDarkMode ? '#94a3b8' : '#4c739a',
															borderBottom: 'none',
														}}>
														{row.date}
													</TableCell>
													<TableCell
														sx={{
															height: 72,
															px: 2,
															py: 1,
															fontSize: '0.875rem',
															color: isDarkMode ? '#94a3b8' : '#4c739a',
															borderBottom: 'none',
														}}>
														{row.total}
													</TableCell>
													<TableCell
														sx={{
															'height': 72,
															'px': 2,
															'py': 1,
															'fontSize': '0.875rem',
															'color': isDarkMode ? '#22c55e' : '#16a34a',
															'borderBottom': 'none',
															'transition': 'transform 0.2s ease',
															'&:hover': {
																transform: 'scale(1.05)',
															},
														}}>
														{row.success}
													</TableCell>
													<TableCell
														sx={{
															'height': 72,
															'px': 2,
															'py': 1,
															'fontSize': '0.875rem',
															'color': isDarkMode ? '#ef4444' : '#dc2626',
															'borderBottom': 'none',
															'transition': 'transform 0.2s ease',
															'&:hover': {
																transform: 'scale(1.05)',
															},
														}}>
														{row.failed}
													</TableCell>
													<TableCell
														onClick={() => handleViewDetails(row)}
														sx={{
															'height': 72,
															'px': 2,
															'py': 1,
															'fontSize': '0.875rem',
															'fontWeight': 700,
															'color': isDarkMode ? 'rgba(19, 127, 236, 0.9)' : '#137fec',
															'borderBottom': 'none',
															'cursor': 'pointer',
															'letterSpacing': '0.015em',
															'transition': 'all 0.2s ease',
															'&:hover': {
																textDecoration: 'underline',
																transform: 'scale(1.02)',
															},
														}}>
														View Details
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</TableContainer>
							</Box>

							{/* Pagination */}
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									p: 2,
									borderTop: `1px solid ${isDarkMode ? '#334155' : '#cfdbe7'}`,
									animation: 'fadeIn 0.3s ease-out 0.2s both',
									...pageAnimations,
								}}>
								<Pagination
									count={pageCount}
									page={page}
									onChange={handlePageChange}
									renderItem={(item) => (
										<PaginationItem
											slots={{ previous: ChevronLeftIcon, next: ChevronRightIcon }}
											{...item}
											sx={{
												'borderRadius': 2,
												'width': 40,
												'height': 40,
												'margin': '0 2px',
												'color': isDarkMode ? '#ffffff' : '#0d141b',
												'fontSize': '0.875rem',
												'fontWeight': 500,
												'transition': 'all 0.2s ease',
												'&.Mui-selected': {
													'backgroundColor': '#137fec',
													'color': '#ffffff',
													'fontWeight': 700,
													'animation': 'pulse-glow 2s infinite',
													'&:hover': {
														backgroundColor: 'rgba(19, 127, 236, 0.9)',
													},
												},
												'&:hover': {
													backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
													transform: 'scale(1.1)',
												},
											}}
										/>
									)}
								/>
							</Box>
						</>
					)}
				</Paper>
			</Box>

			{/* Modals and Toasts */}
			<UploadPayrollModal
				open={isUploadModalOpen}
				onClose={handleCloseUploadModal}
				onUpload={handleUploadPayroll}
			/>

			<DownloadingToast
				open={toastOpen}
				onClose={handleToastClose}
				status={downloadStatus}
			/>

			<PayrollDetailsDrawer
				open={detailsOpen}
				onClose={handleCloseDetails}
				details={selectedPayroll}
			/>

			<DownloadTemplateModal
				open={downloadModalOpen}
				onClose={() => setDownloadModalOpen(false)}
				selectedTemplate={selectedTemplate}
				onTemplateChange={setSelectedTemplate}
				onConfirm={handleDownloadTemplate}
				isDownloading={downloadStatus === 'downloading'}
			/>
		</Box>
	);
};

export default PayrollDashboard;
