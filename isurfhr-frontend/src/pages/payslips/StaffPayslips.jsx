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
	Divider,
	CircularProgress,
	Alert,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EmailIcon from '@mui/icons-material/Email';
import BadgeIcon from '@mui/icons-material/Badge';
import { getMyPayslips, downloadPayslip } from '../../services/PayslipService'; // Adjust path as needed
import { useAuth } from '../../lib/context/AuthContext'; // Adjust path as needed
import PreviewPayslip from '@/pages/payslips/PreviewPayslip';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

const StaffPayslips = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const { user } = useAuth();

	// State
	const [payslips, setPayslips] = useState([]);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [isPreviewPDFModalOpen, setIsPreviewPDFModalOpen] = useState(false);
	const [loading, setLoading] = useState(true);

	const [errorMessage, setErrorMessage] = useState('');
	const [page, setPage] = useState(1);
	const rowsPerPage = 5;

	// Fetch Payslips on Mount
	useEffect(() => {
		const fetchPayslips = async () => {
			setLoading(true);
			setErrorMessage('');
			try {
				const response = await getMyPayslips();
				if (response.data?.success) {
					// Map API response to component state
					// API Response structure: { success: true, data: { payslips: [...] } }
					const fetchedPayslips = response.data.data.payslips.map((p) => ({
						id: p.id,
						month: p.month,
						year: p.year,
						gross: p.grossPay,
						net: p.netPay,
						date: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A',
						fileName: p.fileName,
					}));
					setPayslips(fetchedPayslips);
				} else {
					setErrorMessage('Failed to load payslips.');
				}
			} catch (error) {
				console.error('Error fetching payslips:', error);
				setErrorMessage(error.message || 'An error occurred while fetching payslips.');
			} finally {
				setLoading(false);
			}
		};

		fetchPayslips();
	}, []);

	// Pagination Logic
	const count = Math.ceil(payslips.length / rowsPerPage);
	const paginatedData = payslips.slice((page - 1) * rowsPerPage, page * rowsPerPage);

	const handlePageChange = (event, value) => {
		setPage(value);
	};

	const handleDownload = async (id) => {
		try {
			setErrorMessage('');
			const response = await downloadPayslip(id);

			if (response.success) {
				const blobUrl = URL.createObjectURL(response.blob);
				const filename = response.filename || `payslip-${id}.pdf`;

				const link = document.createElement('a');
				link.href = blobUrl;
				link.download = filename;
				link.style.display = 'none';
				document.body.appendChild(link);
				link.click();

				document.body.removeChild(link);
				URL.revokeObjectURL(blobUrl);
			} else {
				setErrorMessage('Failed to download payslip.');
			}
		} catch (error) {
			console.error('Error downloading payslip:', error);
			setErrorMessage('An unexpected error occurred during download.');
		}
	};

	const handlePreview = async (id) => {
		try {
			setErrorMessage('');

			// Revoke previous preview if it exists
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				setPreviewUrl(null);
			}

			const response = await downloadPayslip(id);

			if (!response.success) {
				setErrorMessage(response.error || 'Failed to fetch payslip.');
				return;
			}

			const url = URL.createObjectURL(response.blob);
			setPreviewUrl(url);
		} catch (error) {
			console.error('Error previewing payslip:', error);
			setErrorMessage('An unexpected error occurred during preview.');
		}
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
			<Box sx={{ width: '100%', maxWidth: '1280px' }}>
				{/* Header Section */}
				<Box sx={{ mb: 4 }}>
					<Typography
						variant="h4"
						component="h1"
						sx={{
							fontWeight: 700,
							fontSize: '1.875rem',
							color: isDarkMode ? '#ffffff' : '#0f172a',
							letterSpacing: '-0.025em',
							mb: 1,
						}}>
						My Payslips
					</Typography>
					<Typography
						variant="body1"
						sx={{
							color: isDarkMode ? '#94a3b8' : '#64748b',
							fontSize: '1rem',
						}}>
						View and download your monthly salary payslips
					</Typography>
				</Box>

				{errorMessage && (
					<Alert
						severity="error"
						sx={{ mb: 2 }}
						onClose={() => setErrorMessage('')}>
						{errorMessage}
					</Alert>
				)}

				{/* User Info Card */}
				<Paper
					elevation={0}
					sx={{
						mb: 4,
						p: { xs: 2.5, md: 3 },
						borderRadius: 2,
						border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						bgcolor: isDarkMode ? '#1a2632' : '#ffffff',
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						alignItems: { sm: 'center' },
						gap: { xs: 3, sm: 6 },
						width: { xs: '100%', md: 'fit-content' },
						boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
					}}>
					{/* Staff ID */}
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
						<Typography
							variant="caption"
							sx={{
								fontSize: '0.75rem',
								fontWeight: 600,
								textTransform: 'uppercase',
								letterSpacing: '0.05em',
								color: isDarkMode ? '#94a3b8' : '#64748b',
							}}>
							Staff ID
						</Typography>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<BadgeIcon
								sx={{
									color: '#94a3b8',
									fontSize: 20,
								}}
							/>
							<Typography
								variant="body2"
								sx={{
									fontWeight: 500,
									color: isDarkMode ? '#ffffff' : '#0f172a',
								}}>
								{user?.staffId || 'N/A'}
							</Typography>
						</Box>
					</Box>

					{/* Divider */}
					<Divider
						orientation="vertical"
						flexItem
						sx={{
							display: { xs: 'none', sm: 'block' },
							borderColor: isDarkMode ? '#334155' : '#e2e8f0',
							height: 40,
							alignSelf: 'center',
						}}
					/>
					<Divider
						orientation="horizontal"
						flexItem
						sx={{
							display: { xs: 'block', sm: 'none' },
							borderColor: isDarkMode ? '#334155' : '#e2e8f0',
						}}
					/>

					{/* Email Address */}
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
						<Typography
							variant="caption"
							sx={{
								fontSize: '0.75rem',
								fontWeight: 600,
								textTransform: 'uppercase',
								letterSpacing: '0.05em',
								color: isDarkMode ? '#94a3b8' : '#64748b',
							}}>
							Email Address
						</Typography>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<EmailIcon
								sx={{
									color: '#94a3b8',
									fontSize: 20,
								}}
							/>
							<Typography
								variant="body2"
								sx={{
									fontWeight: 500,
									color: isDarkMode ? '#ffffff' : '#0f172a',
								}}>
								{user?.email || 'N/A'}
							</Typography>
						</Box>
					</Box>
				</Paper>

				{/* Payslips Table */}
				<Paper
					elevation={0}
					sx={{
						borderRadius: 3,
						border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
						bgcolor: isDarkMode ? '#1a2632' : '#ffffff',
						overflow: 'hidden',
						boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
					}}>
					<TableContainer>
						<Table sx={{ minWidth: 800 }}>
							<TableHead>
								<TableRow
									sx={{
										bgcolor: isDarkMode ? '#1e2b38' : '#f8fafc',
										borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
									}}>
									{[
										{ label: 'Month', align: 'left', width: '15%' },
										{ label: 'Year', align: 'left', width: '10%' },
										{ label: 'Gross Pay', align: 'right', width: '15%' },
										{ label: 'Net Pay', align: 'right', width: '15%' },
										{ label: 'Generated Date', align: 'left', width: '20%' },
										{ label: 'Actions', align: 'right', width: '25%' },
									].map((col) => (
										<TableCell
											key={col.label}
											align={col.align}
											width={col.width}
											sx={{
												py: 2,
												px: 3,
												fontSize: '0.75rem',
												fontWeight: 600,
												textTransform: 'uppercase',
												letterSpacing: '0.05em',
												color: isDarkMode ? '#94a3b8' : '#64748b',
												borderBottom: 'none',
											}}>
											{col.label}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell
											colSpan={6}
											align="center"
											sx={{ py: 4 }}>
											<CircularProgress size={30} />
											<Typography
												variant="body2"
												sx={{ mt: 1, color: 'text.secondary' }}>
												Loading payslips...
											</Typography>
										</TableCell>
									</TableRow>
								) : paginatedData.length > 0 ? (
									paginatedData.map((row) => (
										<TableRow
											key={row.id}
											sx={{
												'&:hover': {
													bgcolor: isDarkMode ? '#1e2b38' : '#f8fafc',
												},
												'borderBottom': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
												'transition': 'background-color 150ms',
											}}>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													fontSize: '0.875rem',
													fontWeight: 500,
													color: isDarkMode ? '#ffffff' : '#0f172a',
													borderBottom: 'none',
												}}>
												{row.month}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													fontSize: '0.875rem',
													color: isDarkMode ? '#cbd5e1' : '#475569',
													borderBottom: 'none',
												}}>
												{row.year}
											</TableCell>
											<TableCell
												align="right"
												sx={{
													py: 2,
													px: 3,
													fontSize: '0.875rem',
													fontWeight: 500,
													color: isDarkMode ? '#ffffff' : '#0f172a',
													fontVariantNumeric: 'tabular-nums',
													borderBottom: 'none',
												}}>
												{Number(row.gross).toLocaleString(undefined, {
													minimumFractionDigits: 2,
												})}
											</TableCell>
											<TableCell
												align="right"
												sx={{
													py: 2,
													px: 3,
													fontSize: '0.875rem',
													fontWeight: 700,
													color: isDarkMode ? '#ffffff' : '#0f172a',
													fontVariantNumeric: 'tabular-nums',
													borderBottom: 'none',
												}}>
												{Number(row.net).toLocaleString(undefined, {
													minimumFractionDigits: 2,
												})}
											</TableCell>
											<TableCell
												sx={{
													py: 2,
													px: 3,
													fontSize: '0.875rem',
													color: isDarkMode ? '#cbd5e1' : '#475569',
													borderBottom: 'none',
												}}>
												{row.date}
											</TableCell>
											<TableCell
												align="right"
												sx={{
													py: 2,
													px: 3,
													borderBottom: 'none',
													display: 'flex',
													flexDirection: 'row',
												}}>
												<Button
													startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 20 }} />}
													sx={{
														'fontSize': '0.875rem',
														'fontWeight': 500,
														'textTransform': 'none',
														'color': '#137fec',
														'px': 2,
														'py': 0.75,
														'borderRadius': 1.5,
														'&:hover': {
															bgcolor: 'rgba(19, 127, 236, 0.1)',
														},
													}}
													onClick={async () => {
														console.log(row.id);
														await handlePreview(row.id);
														setIsPreviewPDFModalOpen(true);
													}}>
													View
												</Button>

												<Button
													startIcon={<DownloadIcon sx={{ fontSize: 20 }} />}
													onClick={() => handleDownload(row.id)}
													sx={{
														'fontSize': '0.875rem',
														'fontWeight': 500,
														'textTransform': 'none',
														'color': '#137fec',
														'px': 2,
														'py': 0.75,
														'borderRadius': 1.5,
														'&:hover': {
															bgcolor: 'rgba(19, 127, 236, 0.1)',
														},
													}}>
													Download
												</Button>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={6}
											align="center"
											sx={{ py: 6 }}>
											<Typography
												variant="body2"
												color="text.secondary">
												No payslips found.
											</Typography>
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{/* Footer / Pagination */}
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							p: 2,
							borderTop: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? '#1a2632' : '#ffffff',
						}}>
						<Pagination
							count={count || 1}
							page={page}
							onChange={handlePageChange}
							renderItem={(item) => (
								<PaginationItem
									slots={{
										previous: ChevronLeftIcon,
										next: ChevronRightIcon,
									}}
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
											'backgroundColor': '#135bec',
											'color': '#ffffff',
											'fontWeight': 700,
											'&:hover': {
												backgroundColor: 'rgba(19, 91, 236, 0.9)',
											},
										},
										'&:hover': {
											backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
										},
									}}
								/>
							)}
						/>
					</Box>
				</Paper>
			</Box>

			<PreviewPayslip
				open={isPreviewPDFModalOpen}
				previewUrl={previewUrl}
				isDarkMode={isDarkMode}
				onClose={() => {
					setIsPreviewPDFModalOpen(false);

					if (previewUrl) {
						URL.revokeObjectURL(previewUrl);
						setPreviewUrl(null);
					}
				}}
			/>
		</Box>
	);
};

export default StaffPayslips;
