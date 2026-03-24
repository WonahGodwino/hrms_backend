import React, { useState } from 'react';
import { Box, InputLabel, FormControl, Select, OutlinedInput, Typography, MenuItem, useTheme, CircularProgress } from '@mui/material';

export const TemplateSelectField = ({
	value,
	onChange,
	label = 'Select Template',
	placeholder = 'Choose a template',
	disabled = false,
	required = false,
	fullWidth = true,
	sx = {},
}) => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);

	const templateOptions = [
		{ value: 'ISURF_STANDARD', label: 'Isurf Standard' },
		{ value: 'BLUERIDGE', label: 'Blueridge' },
	];

	const handleSelectChange = (event) => {
		const selectedValue = event.target.value;
		onChange(selectedValue);
		setIsDropdownOpen(false);
	};

	const handleDropdownClose = () => {
		setIsDropdownOpen(false);
	};

	const handleDropdownOpen = () => {
		if (!disabled) {
			setIsDropdownOpen(true);
		}
	};

	const selectedTemplate = templateOptions.find((template) => template.value === value);

	return (
		<Box sx={{ mb: 3, width: fullWidth ? '100%' : 'auto', ...sx }}>
			<InputLabel
				htmlFor="template-select"
				sx={{
					fontSize: 13,
					fontWeight: 600,
					color: 'white',
					textAlign: 'left',
					mb: 1,
				}}>
				{label}
				{required && ' *'}
			</InputLabel>
			<FormControl
				fullWidth={fullWidth}
				disabled={disabled}>
				<Select
					id="template-select"
					value={value}
					onChange={handleSelectChange}
					displayEmpty
					open={isDropdownOpen}
					onClose={handleDropdownClose}
					onOpen={handleDropdownOpen}
					input={<OutlinedInput />}
					MenuProps={{
						autoFocus: false,
						disableAutoFocusItem: true,
						disableAutoFocus: true,
						onClose: (event, reason) => {
							if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
								handleDropdownClose();
							}
						},
						PaperProps: {
							onMouseDown: (e) => {
								e.stopPropagation();
							},
							sx: {
								'mt': 1,
								'borderRadius': 2,
								'bgcolor': isDarkMode ? '#1e293b' : '#fff',
								'& .MuiMenuItem-root': {
									px: 2,
									py: 1.5,
								},
							},
						},
					}}
					sx={{
						'borderRadius': 2,
						'bgcolor': isDarkMode ? 'rgba(255,255,255,0.02)' : '#fff',
						'& .MuiOutlinedInput-notchedOutline': {
							border: 'none',
						},
						'& .MuiSelect-select': {
							padding: '12px 14px',
							height: 44,
							boxSizing: 'border-box',
							opacity: disabled ? 0.7 : 1,
							display: 'flex',
							alignItems: 'center',
						},
						'boxShadow': 1,
						'textAlign': 'left',
					}}
					renderValue={(selected) => {
						if (!selected) {
							return <Typography color="rgba(255,255,255,0.6)">{placeholder}</Typography>;
						}

						return <Typography color={disabled ? 'rgba(255,255,255,0.5)' : 'white'}>{selectedTemplate?.label || selected}</Typography>;
					}}>
					{templateOptions.map((template) => (
						<MenuItem
							key={template.value}
							value={template.value}
							sx={{
								'color': 'white',
								'&:hover': {
									bgcolor: 'rgba(33, 150, 243, 0.1)',
								},
								'&.Mui-selected': {
									'bgcolor': 'rgba(33, 150, 243, 0.2)',
									'&:hover': {
										bgcolor: 'rgba(33, 150, 243, 0.3)',
									},
								},
							}}>
							<Typography>{template.label}</Typography>
						</MenuItem>
					))}
				</Select>
			</FormControl>
		</Box>
	);
};
