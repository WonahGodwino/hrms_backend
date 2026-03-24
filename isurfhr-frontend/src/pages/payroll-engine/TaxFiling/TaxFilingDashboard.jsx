// src/pages/payroll-engine/TaxFiling/TaxFilingDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
	Box,
	Typography,
	Paper,
	useTheme,
	CircularProgress,
	Alert,
	Card,
	CardContent,
	Grid,
	Button,
	Chip,
	LinearProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PeopleIcon from '@mui/icons-material/People';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WarningIcon from '@mui/icons-material/Warning';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BadgeIcon from '@mui/icons-material/Badge';
import LocationCityIcon from '@mui/icons-material/LocationCity';

import { getTaxFilingDashboard } from '@/services/TaxFilingService';
import { useAuth } from '@/lib/context/AuthContext';

const TaxFilingDashboard = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const navigate = useNavigate();
	const { user } = useAuth();

	const companyId = user?.companyId || user?.company?.id;

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [dashboardData, setDashboardData] = useState(null);

	const fetchDashboard = useCallback(async () => {
		if (!companyId) return;

		setLoading(true);
		setError(null);
		try {
			const response = await getTaxFilingDashboard(companyId);
			if (response.data?.success) {
				setDashboardData(response.data.data);
			}
		} catch (err) {
			console.error('Failed to fetch tax filing dashboard:', err);
			setError('Unable to load dashboard data. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [companyId]);

	useEffect(() => {
		fetchDashboard();
	}, [fetchDashboard]);

	const formatCurrency = (amount) => {
		return new Intl.NumberFormat('en-NG', {
			style: 'currency',
			currency: 'NGN',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}).format(amount || 0);
	};

	const QuickActionCard = ({ title, description, icon, color, onClick }) => (
		<Card
			elevation={0}
			onClick={onClick}
			sx={{
				'borderRadius': 3,
				'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
				'bgcolor': isDarkMode ? '#1A2632' : '#ffffff',
				'cursor': 'pointer',
				'transition': 'all 0.2s',
				'&:hover': {
					borderColor: color,
					transform: 'translateY(-2px)',
					boxShadow: `0 4px 12px ${color}20`,
				},
			}}>
			<CardContent sx={{ p: 3 }}>
				<Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
					<Box
						sx={{
							p: 1.5,
							borderRadius: 2,
							bgcolor: `${color}15`,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						{React.cloneElement(icon, { sx: { color, fontSize: 28 } })}
					</Box>
					<ArrowForwardIcon sx={{ color: isDarkMode ? '#64748b' : '#94a3b8' }} />
				</Box>
				<Typography variant="h6" sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}>
					{title}
				</Typography>
				<Typography variant="body2" color="text.secondary">
					{description}
				</Typography>
			</CardContent>
		</Card>
	);

	if (loading) {
		return (
			<Box
				sx={{
					minHeight: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: isDarkMode ? '#101922' : '#f6f7f8',
				}}>
				<CircularProgress />
			</Box>
		);
	}

	const { dashboard, stats, stateDistribution } = dashboardData || {};
	const currentPeriod = dashboard?.currentPeriod;
	const currentYear = dashboard?.currentYear;

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
				{error && (
					<Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}

				{/* Header */}
				<Box sx={{ mb: 4 }}>
					<Typography
						variant="h4"
						sx={{
							fontWeight: 900,
							fontSize: '2rem',
							color: isDarkMode ? '#ffffff' : '#0f172a',
							letterSpacing: '-0.025em',
							mb: 0.5,
						}}>
						Tax Filing & Compliance
					</Typography>
					<Typography
						variant="body1"
						sx={{
							color: isDarkMode ? '#94a3b8' : '#64748b',
							fontSize: '1rem',
						}}>
						Multi-state PAYE tax filing, monthly schedules, and annual Form H1 returns
					</Typography>
				</Box>

				{/* Stats Cards */}
				<Grid container spacing={3} sx={{ mb: 4 }}>
					{/* Tax Profiles Card */}
					<Grid item xs={12} sm={6} md={3}>
						<Card
							elevation={0}
							sx={{
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								height: '100%',
							}}>
							<CardContent>
								<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
									<PeopleIcon sx={{ color: '#3b82f6', mr: 1 }} />
									<Typography variant="overline" color="text.secondary">
										Tax Profiles
									</Typography>
								</Box>
								<Typography variant="h4" sx={{ fontWeight: 700 }}>
									{stats?.employeesWithProfile || 0}
									<Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
										/ {stats?.totalEmployees || 0}
									</Typography>
								</Typography>
								<Box sx={{ mt: 1.5 }}>
									<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
										<Typography variant="caption" color="text.secondary">
											Profile Completion
										</Typography>
										<Typography variant="caption" sx={{ fontWeight: 600 }}>
											{stats?.profileCompletionRate || 0}%
										</Typography>
									</Box>
									<LinearProgress
										variant="determinate"
										value={stats?.profileCompletionRate || 0}
										sx={{
											height: 6,
											borderRadius: 3,
											bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
											'& .MuiLinearProgress-bar': {
												bgcolor: stats?.profileCompletionRate === 100 ? '#22c55e' : '#3b82f6',
											},
										}}
									/>
								</Box>
								{stats?.employeesWithoutProfile > 0 && (
									<Chip
										size="small"
										icon={<WarningIcon sx={{ fontSize: 14 }} />}
										label={`${stats.employeesWithoutProfile} missing profiles`}
										color="warning"
										variant="outlined"
										sx={{ mt: 1.5 }}
									/>
								)}
							</CardContent>
						</Card>
					</Grid>

					{/* Current Period Card */}
					<Grid item xs={12} sm={6} md={3}>
						<Card
							elevation={0}
							sx={{
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								height: '100%',
							}}>
							<CardContent>
								<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
									<CalendarMonthIcon sx={{ color: '#22c55e', mr: 1 }} />
									<Typography variant="overline" color="text.secondary">
										Current Period
									</Typography>
								</Box>
								<Typography variant="h5" sx={{ fontWeight: 700 }}>
									{currentPeriod?.periodName || 'N/A'}
								</Typography>
								<Box sx={{ mt: 1.5 }}>
									<Typography variant="body2" color="text.secondary">
										{currentPeriod?.totalEmployees || 0} employees
									</Typography>
									<Typography variant="body2" sx={{ color: '#22c55e', fontWeight: 600, mt: 0.5 }}>
										{formatCurrency(currentPeriod?.totalTaxAmount)}
									</Typography>
								</Box>
							</CardContent>
						</Card>
					</Grid>

					{/* Monthly Filing Status Card */}
					<Grid item xs={12} sm={6} md={3}>
						<Card
							elevation={0}
							sx={{
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								height: '100%',
							}}>
							<CardContent>
								<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
									<AssessmentIcon sx={{ color: '#f59e0b', mr: 1 }} />
									<Typography variant="overline" color="text.secondary">
										Monthly Filing
									</Typography>
								</Box>
								<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
									<Typography variant="h4" sx={{ fontWeight: 700 }}>
										{currentPeriod?.statesFiled || 0}
									</Typography>
									<Typography variant="body2" color="text.secondary">
										/ {currentPeriod?.statesWithEmployees || 0} states filed
									</Typography>
								</Box>
								<Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
									{currentPeriod?.statesPending > 0 && (
										<Chip size="small" label={`${currentPeriod.statesPending} pending`} color="warning" variant="outlined" />
									)}
									{currentPeriod?.statesFiled > 0 && (
										<Chip size="small" label={`${currentPeriod.statesFiled} filed`} color="success" variant="outlined" />
									)}
								</Box>
							</CardContent>
						</Card>
					</Grid>

					{/* Annual Summary Card */}
					<Grid item xs={12} sm={6} md={3}>
						<Card
							elevation={0}
							sx={{
								borderRadius: 3,
								border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
								bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
								height: '100%',
							}}>
							<CardContent>
								<Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
									<TrendingUpIcon sx={{ color: '#8b5cf6', mr: 1 }} />
									<Typography variant="overline" color="text.secondary">
										Annual ({currentYear?.year || new Date().getFullYear()})
									</Typography>
								</Box>
								{currentYear ? (
									<>
										<Typography variant="h5" sx={{ fontWeight: 700, color: '#22c55e' }}>
											{formatCurrency(currentYear.totalTaxPaid)}
										</Typography>
										<Box sx={{ mt: 1.5 }}>
											<Typography variant="body2" color="text.secondary">
												{currentYear.totalEmployees || 0} employees
											</Typography>
											<Typography variant="body2" color="text.secondary">
												{currentYear.statesFiled || 0} / {currentYear.statesWithEmployees || 0} states filed
											</Typography>
										</Box>
									</>
								) : (
									<>
										<Typography variant="body1" sx={{ fontWeight: 600, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
											No annual data
										</Typography>
										<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
											Generate annual returns when ready
										</Typography>
									</>
								)}
							</CardContent>
						</Card>
					</Grid>
				</Grid>

				{/* States Distribution */}
				{stateDistribution && stateDistribution.length > 0 && (
					<Paper
						elevation={0}
						sx={{
							p: 3,
							mb: 4,
							borderRadius: 3,
							border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
						}}>
						<Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
							<LocationCityIcon sx={{ color: '#3b82f6', mr: 1 }} />
							<Typography variant="h6" sx={{ fontWeight: 700 }}>
								State Distribution
							</Typography>
							<Chip size="small" label={`${stats?.statesCount || 0} states`} sx={{ ml: 2 }} />
						</Box>
						<Grid container spacing={2}>
							{stateDistribution.map((state) => (
								<Grid item xs={6} sm={4} md={3} key={state.stateCode}>
									<Box
										sx={{
											p: 2,
											borderRadius: 2,
											bgcolor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
											border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										}}>
										<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
											{state.state}
										</Typography>
										<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
											{state.irsName}
										</Typography>
										<Typography variant="h6" sx={{ fontWeight: 700, mt: 1, color: '#3b82f6' }}>
											{state.count} {state.count === 1 ? 'employee' : 'employees'}
										</Typography>
									</Box>
								</Grid>
							))}
						</Grid>
					</Paper>
				)}

				{/* Missing Profiles Warning */}
				{stats?.employeesWithoutProfile > 0 && (
					<Paper
						elevation={0}
						sx={{
							p: 2,
							mb: 4,
							borderRadius: 3,
							border: '1px solid #f59e0b',
							bgcolor: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							flexWrap: 'wrap',
							gap: 2,
						}}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
							<WarningIcon sx={{ color: '#f59e0b' }} />
							<Box>
								<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
									{stats.employeesWithoutProfile} employees missing tax profiles
								</Typography>
								<Typography variant="body2" color="text.secondary">
									Create tax profiles to include them in PAYE filing
								</Typography>
							</Box>
						</Box>
						<Button
							variant="contained"
							size="small"
							onClick={() => navigate('/payroll-engine/tax-filing/profiles')}
							sx={{
								bgcolor: '#f59e0b',
								'&:hover': { bgcolor: '#d97706' },
							}}>
							Add Missing Profiles
						</Button>
					</Paper>
				)}

				{/* Quick Actions */}
				<Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
					Quick Actions
				</Typography>
				<Grid container spacing={3} sx={{ mb: 4 }}>
					<Grid item xs={12} sm={6} md={3}>
						<QuickActionCard
							title="Tax Profiles"
							description="Manage employee state assignments and TINs"
							icon={<BadgeIcon />}
							color="#3b82f6"
							onClick={() => navigate('/payroll-engine/tax-filing/profiles')}
						/>
					</Grid>
					<Grid item xs={12} sm={6} md={3}>
						<QuickActionCard
							title="Monthly Filing"
							description="Generate and file PAYE schedules"
							icon={<ScheduleIcon />}
							color="#22c55e"
							onClick={() => navigate('/payroll-engine/tax-filing/monthly')}
						/>
					</Grid>
					<Grid item xs={12} sm={6} md={3}>
						<QuickActionCard
							title="Annual Returns"
							description="Generate Form H1 returns by state"
							icon={<ReceiptLongIcon />}
							color="#f59e0b"
							onClick={() => navigate('/payroll-engine/tax-filing/annual')}
						/>
					</Grid>
					<Grid item xs={12} sm={6} md={3}>
						<QuickActionCard
							title="Tax Certificates"
							description="Download employee tax certificates"
							icon={<DescriptionIcon />}
							color="#8b5cf6"
							onClick={() => navigate('/payroll-engine/tax-filing/certificates')}
						/>
					</Grid>
				</Grid>
			</Box>
		</Box>
	);
};

export default TaxFilingDashboard;
