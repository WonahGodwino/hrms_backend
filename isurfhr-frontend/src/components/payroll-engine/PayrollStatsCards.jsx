// src/components/payroll-engine/PayrollStatsCards.jsx
import React from 'react';
import { Box, Paper, Typography, useTheme } from '@mui/material';
import { formatCurrency, formatNumber } from './CurrencyDisplay';
import {
	Users,
	UserCheck,
	UserX,
	Wallet,
	TrendingUp,
	TrendingDown,
	DollarSign,
	Percent,
} from 'lucide-react';

// Icon mapping
const ICON_MAP = {
	users: Users,
	userCheck: UserCheck,
	userX: UserX,
	wallet: Wallet,
	trendingUp: TrendingUp,
	trendingDown: TrendingDown,
	dollarSign: DollarSign,
	percent: Percent,
};

/**
 * Single stat card component
 */
const StatCard = ({ title, value, subtitle, icon = 'wallet', color, isCurrency = false, isDarkMode }) => {
	const IconComponent = ICON_MAP[icon] || Wallet;

	const colorStyles = {
		primary: {
			bg: isDarkMode ? 'rgba(19, 127, 236, 0.1)' : '#dbeafe',
			icon: '#137fec',
		},
		success: {
			bg: isDarkMode ? 'rgba(34, 197, 94, 0.1)' : '#d1fae5',
			icon: '#22c55e',
		},
		warning: {
			bg: isDarkMode ? 'rgba(251, 191, 36, 0.1)' : '#fef3c7',
			icon: '#f59e0b',
		},
		error: {
			bg: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : '#fee2e2',
			icon: '#ef4444',
		},
		info: {
			bg: isDarkMode ? 'rgba(20, 184, 166, 0.1)' : '#ccfbf1',
			icon: '#14b8a6',
		},
	};

	const colorStyle = colorStyles[color] || colorStyles.primary;

	return (
		<Paper
			elevation={0}
			sx={{
				p: 3,
				borderRadius: 3,
				border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
				bgcolor: isDarkMode ? '#1A2632' : '#ffffff',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				gap: 2,
				transition: 'all 0.2s ease',
				'&:hover': {
					borderColor: isDarkMode ? '#475569' : '#cbd5e1',
					boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
				},
			}}>
			<Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
				<Box>
					<Typography
						variant="body2"
						sx={{
							color: isDarkMode ? '#94a3b8' : '#64748b',
							fontWeight: 500,
							fontSize: '0.875rem',
							mb: 0.5,
						}}>
						{title}
					</Typography>
					<Typography
						variant="h4"
						sx={{
							fontWeight: 700,
							color: isDarkMode ? '#ffffff' : '#0f172a',
							fontSize: '1.75rem',
							letterSpacing: '-0.025em',
							fontFamily: isCurrency ? '"Inter", monospace' : 'inherit',
						}}>
						{isCurrency ? formatCurrency(value) : formatNumber(value)}
					</Typography>
				</Box>
				<Box
					sx={{
						width: 48,
						height: 48,
						borderRadius: 2,
						bgcolor: colorStyle.bg,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}>
					<IconComponent
						size={24}
						color={colorStyle.icon}
						strokeWidth={2}
					/>
				</Box>
			</Box>
			{subtitle && (
				<Typography
					variant="caption"
					sx={{
						color: isDarkMode ? '#64748b' : '#94a3b8',
						fontSize: '0.75rem',
					}}>
					{subtitle}
				</Typography>
			)}
		</Paper>
	);
};

/**
 * PayrollStatsCards - Grid of stat cards
 * @param {Array} stats - Array of stat objects: { title, value, subtitle, icon, color, isCurrency }
 * @param {number} columns - Number of columns (default 4)
 */
const PayrollStatsCards = ({ stats = [], columns = 4, isDarkMode }) => {
	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: {
					xs: '1fr',
					sm: 'repeat(2, 1fr)',
					md: `repeat(${Math.min(columns, 4)}, 1fr)`,
				},
				gap: 2,
			}}>
			{stats.map((stat, index) => (
				<StatCard
					key={index}
					{...stat}
					isDarkMode={isDarkMode}
				/>
			))}
		</Box>
	);
};

export default PayrollStatsCards;
