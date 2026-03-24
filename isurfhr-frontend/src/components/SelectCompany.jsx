import React, { useState, useMemo } from 'react';
import { Box, InputLabel, FormControl, Select, OutlinedInput, Typography, MenuItem, useTheme, CircularProgress } from '@mui/material';

export const CompanySelectField = ({
	value,
	onChange,
	companies = [],
	label = 'Select Company',
	placeholder = 'Choose a company',
	searchPlaceholder = 'Search companies...',
	disabled = false,
	required = false,
	fullWidth = true,
	loading = false, // New loading prop
	sx = {},
}) => {
	const theme = useTheme();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [companySearch, setCompanySearch] = useState('');

	// Filter companies based on search input
	const filteredCompanies = useMemo(() => {
		if (!companySearch.trim()) return companies;
		return companies.filter(
			(company) => company.name.toLowerCase().includes(companySearch.toLowerCase()) || company.code?.toLowerCase().includes(companySearch.toLowerCase())
		);
	}, [companies, companySearch]);

	const handleSelectChange = (event) => {
		const selectedValue = event.target.value;
		onChange(selectedValue);
		setIsDropdownOpen(false);
		setCompanySearch('');
	};

	const handleDropdownClose = () => {
		setIsDropdownOpen(false);
		setCompanySearch('');
	};

	const handleDropdownOpen = () => {
		if (!loading) {
			// Don't open dropdown when loading
			setIsDropdownOpen(true);
		}
	};

	const handleSearchChange = (event) => {
		setCompanySearch(event.target.value);
	};

	const handleSearchKeyDown = (event) => {
		event.stopPropagation();
		if (event.key === 'Escape') {
			handleDropdownClose();
		}
	};

	return (
		<Box sx={{ mb: 3, width: fullWidth ? '100%' : 'auto', ...sx }}>
			<InputLabel
				htmlFor="company-select"
				sx={{
					fontSize: 13,
					fontWeight: 600,
					color: 'white',
					textAlign: 'left',
					mb: 1,
				}}>
				{label}
				{required && ' *'}
				{loading && (
					<Box
						component="span"
						sx={{ ml: 1, display: 'inline-flex' }}>
						<CircularProgress
							size={12}
							sx={{ color: 'rgba(255,255,255,0.7)' }}
						/>
					</Box>
				)}
			</InputLabel>
			<FormControl
				fullWidth={fullWidth}
				disabled={disabled || loading}>
				<Select
					id="company-select"
					value={value}
					onChange={handleSelectChange}
					displayEmpty
					open={isDropdownOpen && !loading} // Prevent opening when loading
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
								'bgcolor': theme.palette.mode === 'dark' ? '#1e293b' : '#fff',
								'& .MuiMenuItem-root': {
									px: 2,
									py: 1.5,
								},
							},
						},
					}}
					sx={{
						'borderRadius': 2,
						'bgcolor': theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
						'& .MuiOutlinedInput-notchedOutline': {
							border: 'none',
						},
						'& .MuiSelect-select': {
							padding: '12px 14px',
							height: 44,
							boxSizing: 'border-box',
							opacity: disabled || loading ? 0.7 : 1,
							display: 'flex',
							alignItems: 'center',
						},
						'boxShadow': 1,
						'textAlign': 'left',
					}}
					renderValue={(selected) => {
						if (loading) {
							return (
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<CircularProgress
										size={16}
										sx={{ color: 'rgba(255,255,255,0.6)' }}
									/>
									<Typography color="rgba(255,255,255,0.6)">Loading companies...</Typography>
								</Box>
							);
						}

						if (!selected) {
							return <Typography color="rgba(255,255,255,0.6)">{placeholder}</Typography>;
						}

						const selectedCompany = companies.find((company) => company.id === selected);
						return <Typography color={disabled ? 'rgba(255,255,255,0.5)' : 'white'}>{selectedCompany?.name || selected}</Typography>;
					}}>
					{/* Show loading in dropdown when open */}
					{loading ? (
						<MenuItem
							disabled
							sx={{ justifyContent: 'center', py: 3 }}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
								<CircularProgress
									size={20}
									sx={{ color: 'rgba(255,255,255,0.6)' }}
								/>
								<Typography color="rgba(255,255,255,0.6)">Loading companies...</Typography>
							</Box>
						</MenuItem>
					) : (
						[
							<Box
								sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}
								onMouseDown={(e) => {
									e.stopPropagation();
								}}
								onClick={(e) => e.stopPropagation()}>
								<OutlinedInput
									placeholder={searchPlaceholder}
									value={companySearch}
									onChange={handleSearchChange}
									size="small"
									onClick={(e) => e.stopPropagation()}
									onKeyDown={handleSearchKeyDown}
									autoFocus={isDropdownOpen}
									sx={{
										'width': '100%',
										'borderRadius': 1,
										'bgcolor': theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
										'& .MuiOutlinedInput-notchedOutline': {
											border: 'none',
										},
										'& .MuiOutlinedInput-input': {
											padding: '8px 12px',
											fontSize: '0.875rem',
										},
									}}
								/>
							</Box>,
							...(filteredCompanies.length > 0
								? filteredCompanies.map((company) => (
										<MenuItem
											key={company.id}
											value={company.id}
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
											<Typography>{company.name}</Typography>
											{company.code && (
												<Typography
													variant="caption"
													sx={{ ml: 1, color: 'rgba(255,255,255,0.6)' }}>
													({company.code})
												</Typography>
											)}
										</MenuItem>
								  ))
								: [
										<MenuItem disabled>
											<Typography color="rgba(255,255,255,0.6)">{companySearch.trim() ? 'No companies found' : 'No companies available'}</Typography>
										</MenuItem>,
								  ]),
						]
					)}
				</Select>
			</FormControl>
		</Box>
	);
};
