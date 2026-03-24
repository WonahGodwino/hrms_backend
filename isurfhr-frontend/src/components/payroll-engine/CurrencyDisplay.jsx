// src/components/payroll-engine/CurrencyDisplay.jsx
import React from 'react';
import { Typography } from '@mui/material';

/**
 * Format number as Nigerian Naira currency
 * @param {number} amount - The amount to format
 * @param {boolean} showSymbol - Whether to show currency symbol
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, showSymbol = true, decimals = 2) => {
	if (amount === null || amount === undefined || isNaN(amount)) {
		return showSymbol ? '₦0.00' : '0.00';
	}

	const formatted = new Intl.NumberFormat('en-NG', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(amount);

	return showSymbol ? `₦${formatted}` : formatted;
};

/**
 * Format number with thousands separator (no currency symbol)
 * @param {number} value - The value to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (value) => {
	if (value === null || value === undefined || isNaN(value)) {
		return '0';
	}
	return new Intl.NumberFormat('en-NG').format(value);
};

/**
 * CurrencyDisplay - Typography component with formatted currency
 * @param {number} amount - The amount to display
 * @param {boolean} showSymbol - Whether to show ₦ symbol
 * @param {number} decimals - Decimal places
 * @param {string} variant - MUI Typography variant
 * @param {string} color - Text color
 * @param {object} sx - Additional MUI sx props
 */
const CurrencyDisplay = ({
	amount,
	showSymbol = true,
	decimals = 2,
	variant = 'body2',
	color,
	fontWeight,
	sx = {},
	...props
}) => {
	const formattedValue = formatCurrency(amount, showSymbol, decimals);

	return (
		<Typography
			variant={variant}
			sx={{
				fontFamily: '"Inter", monospace',
				fontWeight: fontWeight || 500,
				color: color,
				letterSpacing: '-0.01em',
				...sx,
			}}
			{...props}>
			{formattedValue}
		</Typography>
	);
};

export default CurrencyDisplay;
