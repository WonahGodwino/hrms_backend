// src/components/payroll-engine/PayPeriodStatusChip.jsx
import React from 'react';
import { Chip } from '@mui/material';

// Status configuration mapping
const STATUS_CONFIG = {
	draft: {
		label: 'Draft',
		bgLight: '#f1f5f9',
		bgDark: 'rgba(148, 163, 184, 0.15)',
		colorLight: '#475569',
		colorDark: '#94a3b8',
	},
	validation_open: {
		label: 'Validation Open',
		bgLight: '#fef3c7',
		bgDark: 'rgba(251, 191, 36, 0.15)',
		colorLight: '#b45309',
		colorDark: '#fbbf24',
	},
	validation_closed: {
		label: 'Validation Closed',
		bgLight: '#fed7aa',
		bgDark: 'rgba(249, 115, 22, 0.15)',
		colorLight: '#c2410c',
		colorDark: '#fb923c',
	},
	computing: {
		label: 'Computing',
		bgLight: '#dbeafe',
		bgDark: 'rgba(59, 130, 246, 0.15)',
		colorLight: '#1d4ed8',
		colorDark: '#3b82f6',
	},
	review: {
		label: 'Under Review',
		bgLight: '#e0e7ff',
		bgDark: 'rgba(99, 102, 241, 0.15)',
		colorLight: '#4338ca',
		colorDark: '#818cf8',
	},
	approved: {
		label: 'Approved',
		bgLight: '#d1fae5',
		bgDark: 'rgba(34, 197, 94, 0.15)',
		colorLight: '#047857',
		colorDark: '#22c55e',
	},
	paid: {
		label: 'Paid',
		bgLight: '#ccfbf1',
		bgDark: 'rgba(20, 184, 166, 0.15)',
		colorLight: '#0f766e',
		colorDark: '#14b8a6',
	},
};

// Validation status configuration
const VALIDATION_STATUS_CONFIG = {
	pending: {
		label: 'Pending',
		bgLight: '#f1f5f9',
		bgDark: 'rgba(148, 163, 184, 0.15)',
		colorLight: '#475569',
		colorDark: '#94a3b8',
	},
	yes_for_payment: {
		label: 'Yes for Payment',
		bgLight: '#d1fae5',
		bgDark: 'rgba(34, 197, 94, 0.15)',
		colorLight: '#047857',
		colorDark: '#22c55e',
	},
	no_for_payment: {
		label: 'No for Payment',
		bgLight: '#fee2e2',
		bgDark: 'rgba(239, 68, 68, 0.15)',
		colorLight: '#b91c1c',
		colorDark: '#ef4444',
	},
};

// Payment status configuration
const PAYMENT_STATUS_CONFIG = {
	pending: {
		label: 'Pending',
		bgLight: '#f1f5f9',
		bgDark: 'rgba(148, 163, 184, 0.15)',
		colorLight: '#475569',
		colorDark: '#94a3b8',
	},
	active: {
		label: 'Active',
		bgLight: '#d1fae5',
		bgDark: 'rgba(34, 197, 94, 0.15)',
		colorLight: '#047857',
		colorDark: '#22c55e',
	},
	withheld: {
		label: 'Withheld',
		bgLight: '#fee2e2',
		bgDark: 'rgba(239, 68, 68, 0.15)',
		colorLight: '#b91c1c',
		colorDark: '#ef4444',
	},
	paid: {
		label: 'Paid',
		bgLight: '#ccfbf1',
		bgDark: 'rgba(20, 184, 166, 0.15)',
		colorLight: '#0f766e',
		colorDark: '#14b8a6',
	},
};

/**
 * PayPeriodStatusChip - Displays status with appropriate styling
 * @param {string} status - The status value
 * @param {string} type - 'period' | 'validation' | 'payment'
 * @param {boolean} isDarkMode - Whether dark mode is enabled
 * @param {object} sx - Additional MUI sx props
 */
const PayPeriodStatusChip = ({ status, type = 'period', isDarkMode = false, sx = {} }) => {
	let config;
	const normalizedStatus = (status || '').toLowerCase().replace(/-/g, '_');

	switch (type) {
		case 'validation':
			config = VALIDATION_STATUS_CONFIG[normalizedStatus];
			break;
		case 'payment':
			config = PAYMENT_STATUS_CONFIG[normalizedStatus];
			break;
		default:
			config = STATUS_CONFIG[normalizedStatus];
	}

	if (!config) {
		config = {
			label: status || 'Unknown',
			bgLight: '#f1f5f9',
			bgDark: 'rgba(148, 163, 184, 0.15)',
			colorLight: '#475569',
			colorDark: '#94a3b8',
		};
	}

	return (
		<Chip
			label={config.label}
			size="small"
			sx={{
				height: 24,
				fontSize: '0.75rem',
				fontWeight: 600,
				borderRadius: '6px',
				bgcolor: isDarkMode ? config.bgDark : config.bgLight,
				color: isDarkMode ? config.colorDark : config.colorLight,
				border: 'none',
				...sx,
			}}
		/>
	);
};

export default PayPeriodStatusChip;
