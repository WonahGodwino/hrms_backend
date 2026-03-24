// src/pages/payroll-engine/TaxFiling/AnnualReturnDetailsDrawer.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
	Drawer,
	Box,
	Typography,
	IconButton,
	Button,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	CircularProgress,
	Chip,
	Divider,
	useTheme,
	Alert,
	Tooltip,
	Paper,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import BusinessIcon from '@mui/icons-material/Business';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

import { getStateAnnualReturn, downloadFormH1, FILING_STATUS } from '@/services/TaxFilingService';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AnnualReturnDetailsDrawer = ({ open, onClose, year, stateCode, companyId }) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [formH1Data, setFormH1Data] = useState(null);
	const [filingStatus, setFilingStatus] = useState(null);
	const [downloading, setDownloading] = useState(false);

	// Fetch form H1 data
	const fetchData = useCallback(async () => {
		if (!year || !stateCode || !companyId) return;

		setLoading(true);
		setError(null);
		try {
			const response = await getStateAnnualReturn(year, stateCode, companyId);
			if (response.data?.success) {
				setFormH1Data(response.data.data.formH1Data || null);
				setFilingStatus(response.data.data.filingStatus || null);
			}
		} catch (err) {
			console.error('Failed to fetch Form H1 data:', err);
			setError('Unable to load Form H1 data. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [year, stateCode, companyId]);

	useEffect(() => {
		if (open) {
			fetchData();
		}
	}, [open, fetchData]);

	// Handle download
	const handleDownload = async (format) => {
		if (!year || !stateCode || !companyId) return;

		setDownloading(true);
		try {
			const response = await downloadFormH1(year, stateCode, format, companyId);
			const blob = new Blob([response.data], {
				type:
					format === 'xlsx'
						? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
						: 'text/csv',
			});
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `Form-H1-${stateCode}-${year}.${format}`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to download Form H1:', err);
			setError('Failed to download Form H1');
		} finally {
			setDownloading(false);
		}
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

	return (
		<Drawer
			anchor="right"
			open={open}
			onClose={onClose}
			PaperProps={{
				sx: {
					width: { xs: '100%', sm: '90%', md: '80%', lg: '70%' },
					maxWidth: 1200,
					bgcolor: isDarkMode ? '#101922' : '#f6f7f8',
				},
			}}>
			{/* Header */}
			<Box
				sx={{
					p: 3,
					bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
					borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'flex-start',
				}}>
				<Box>
					<Typography variant="h5" sx={{ fontWeight: 700, color: isDarkMode ? '#fff' : '#0f172a' }}>
						Form H1 - Annual Return
					</Typography>
					<Typography variant="body2" sx={{ color: isDarkMode ? '#94a3b8' : '#64748b', mt: 0.5 }}>
						{formH1Data?.stateName || stateCode} ({formH1Data?.irsName || 'IRS'}) - {year}
					</Typography>
				</Box>
				<IconButton onClick={onClose} sx={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
					<CloseIcon />
				</IconButton>
			</Box>

			{/* Content */}
			<Box sx={{ p: 3, overflow: 'auto', flex: 1 }}>
				{loading ? (
					<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
						<CircularProgress />
					</Box>
				) : error ? (
					<Alert severity="error" sx={{ mb: 2 }}>
						{error}
					</Alert>
				) : formH1Data ? (
					<>
						{/* Company Info & Status */}
						<Paper
							elevation={0}
							sx={{
								p: 3,
								mb: 3,
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
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
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<BusinessIcon sx={{ mr: 1, color: isDarkMode ? '#94a3b8' : '#64748b' }} />
										<Typography variant="subtitle2" color="text.secondary">
											Company
										</Typography>
									</Box>
									<Typography variant="h6" sx={{ fontWeight: 600 }}>
										{formH1Data.companyInfo?.name || 'N/A'}
									</Typography>
									<Typography variant="body2" color="text.secondary">
										Tax ID: {formH1Data.companyInfo?.taxId || 'N/A'}
									</Typography>
								</Box>

								<Box>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<LocationCityIcon sx={{ mr: 1, color: isDarkMode ? '#94a3b8' : '#64748b' }} />
										<Typography variant="subtitle2" color="text.secondary">
											State IRS
										</Typography>
									</Box>
									<Typography variant="h6" sx={{ fontWeight: 600 }}>
										{formH1Data.irsName}
									</Typography>
									<Typography variant="body2" color="text.secondary">
										{formH1Data.stateName}
									</Typography>
								</Box>

								<Box>
									<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
										<CalendarMonthIcon sx={{ mr: 1, color: isDarkMode ? '#94a3b8' : '#64748b' }} />
										<Typography variant="subtitle2" color="text.secondary">
											Tax Year
										</Typography>
									</Box>
									<Typography variant="h6" sx={{ fontWeight: 600 }}>
										{year}
									</Typography>
									{filingStatus && getStatusChip(filingStatus.status)}
								</Box>
							</Box>
						</Paper>

						{/* Summary Totals */}
						<Paper
							elevation={0}
							sx={{
								p: 3,
								mb: 3,
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
							}}>
							<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
								Summary
							</Typography>
							<Box
								sx={{
									display: 'grid',
									gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
									gap: 3,
								}}>
								<Box>
									<Typography variant="caption" color="text.secondary">
										Total Employees
									</Typography>
									<Typography variant="h5" sx={{ fontWeight: 700 }}>
										{formH1Data.totals?.employeeCount || 0}
									</Typography>
								</Box>
								<Box>
									<Typography variant="caption" color="text.secondary">
										Total Gross Income
									</Typography>
									<Typography variant="h5" sx={{ fontWeight: 700 }}>
										{formatCurrency(formH1Data.totals?.grossIncome)}
									</Typography>
								</Box>
								<Box>
									<Typography variant="caption" color="text.secondary">
										Total Tax Deducted
									</Typography>
									<Typography variant="h5" sx={{ fontWeight: 700, color: '#22c55e' }}>
										{formatCurrency(formH1Data.totals?.totalTaxDeducted)}
									</Typography>
								</Box>
							</Box>
						</Paper>

						{/* Download Buttons */}
						<Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
							<Button
								variant="contained"
								startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
								onClick={() => handleDownload('xlsx')}
								disabled={downloading}
								sx={{
									bgcolor: '#137fec',
									'&:hover': { bgcolor: '#1d4ed8' },
								}}>
								Download Excel
							</Button>
							<Button
								variant="outlined"
								startIcon={downloading ? <CircularProgress size={16} /> : <DownloadIcon />}
								onClick={() => handleDownload('csv')}
								disabled={downloading}
								sx={{
									borderColor: isDarkMode ? '#334155' : '#e2e8f0',
									color: isDarkMode ? '#e2e8f0' : '#1e293b',
								}}>
								Download CSV
							</Button>
						</Box>

						{/* Employee Table */}
						<Paper
							elevation={0}
							sx={{
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								overflow: 'hidden',
							}}>
							<Box sx={{ p: 2, borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}` }}>
								<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
									Employee Annual Tax Details
								</Typography>
							</Box>
							<TableContainer sx={{ maxHeight: 500 }}>
								<Table stickyHeader size="small">
									<TableHead>
										<TableRow>
											<TableCell
												sx={{
													bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
													fontWeight: 600,
													fontSize: '0.75rem',
												}}>
												S/N
											</TableCell>
											<TableCell
												sx={{
													bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
													fontWeight: 600,
													fontSize: '0.75rem',
													minWidth: 180,
												}}>
												Employee Name
											</TableCell>
											<TableCell
												sx={{
													bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
													fontWeight: 600,
													fontSize: '0.75rem',
												}}>
												TIN
											</TableCell>
											<TableCell
												sx={{
													bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
													fontWeight: 600,
													fontSize: '0.75rem',
												}}>
												Staff ID
											</TableCell>
											{MONTHS.map((month) => (
												<TableCell
													key={month}
													align="right"
													sx={{
														bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
														fontWeight: 600,
														fontSize: '0.7rem',
														minWidth: 70,
													}}>
													{month}
												</TableCell>
											))}
											<TableCell
												align="right"
												sx={{
													bgcolor: isDarkMode ? '#1e293b' : '#f8fafc',
													fontWeight: 600,
													fontSize: '0.75rem',
													minWidth: 100,
												}}>
												Annual Tax
											</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{formH1Data.employees?.map((employee, index) => (
											<TableRow
												key={employee.staffId || index}
												sx={{
													'&:hover': { bgcolor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc' },
												}}>
												<TableCell sx={{ fontSize: '0.8rem' }}>{employee.sn || index + 1}</TableCell>
												<TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
													{employee.taxpayerName}
												</TableCell>
												<TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
													{employee.jtbTin || '-'}
												</TableCell>
												<TableCell sx={{ fontSize: '0.8rem' }}>{employee.staffId}</TableCell>
												{MONTHS.map((_, monthIndex) => {
													const monthData = employee.monthlyBreakdown?.find(
														(m) => m.month === monthIndex + 1
													);
													return (
														<TableCell
															key={monthIndex}
															align="right"
															sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
															{monthData ? formatCurrency(monthData.taxPaid).replace('NGN', '') : '-'}
														</TableCell>
													);
												})}
												<TableCell
													align="right"
													sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#22c55e' }}>
													{formatCurrency(employee.annualTaxDeducted)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</TableContainer>
						</Paper>
					</>
				) : (
					<Box sx={{ textAlign: 'center', py: 6 }}>
						<Typography color="text.secondary">No data available</Typography>
					</Box>
				)}
			</Box>
		</Drawer>
	);
};

export default AnnualReturnDetailsDrawer;
