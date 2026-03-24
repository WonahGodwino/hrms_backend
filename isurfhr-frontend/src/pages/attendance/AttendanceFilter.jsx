// components/AttendanceFilter.jsx
import React, { useState } from 'react';
import { Modal, Box, Typography, Button, FormControl, InputLabel, Select, MenuItem, TextField, Stack, Chip, IconButton, Paper, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';

const AttendanceFilter = ({ open, onClose, onApplyFilters, companyId, initialFilters = {}, departments = [] }) => {
	const [filters, setFilters] = useState({
		period: initialFilters.period || 'day',
		date: initialFilters.date || new Date(),
		startDate: initialFilters.startDate || null,
		endDate: initialFilters.endDate || null,
		staffId: initialFilters.staffId || '',
		department: initialFilters.department || '',
		status: initialFilters.status || '',
		...initialFilters,
	});

	const statusOptions = [
		{ value: '', label: 'All Status' },
		{ value: 'PRESENT', label: 'Present' },
		{ value: 'LATE', label: 'Late' },
		{ value: 'ABSENT', label: 'Absent' },
		{ value: 'HALF_DAY', label: 'Half Day' },
	];

	const periodOptions = [
		{ value: 'day', label: 'Day' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
		{ value: 'custom', label: 'Custom Range' },
	];

	const handleFilterChange = (field, value) => {
		setFilters((prev) => ({
			...prev,
			[field]: value,
		}));

		// If period changes, reset date range
		if (field === 'period' && value !== 'custom') {
			setFilters((prev) => ({
				...prev,
				startDate: null,
				endDate: null,
			}));
		}
	};

	const handleApply = () => {
		// Format dates for API
		const formattedFilters = {
			...filters,
			companyId,
			date: filters.date ? format(filters.date, 'yyyy-MM-dd') : '',
			startDate: filters.startDate ? format(filters.startDate, 'yyyy-MM-dd') : '',
			endDate: filters.endDate ? format(filters.endDate, 'yyyy-MM-dd') : '',
		};

		onApplyFilters(formattedFilters);
		onClose();
	};

	const handleReset = () => {
		setFilters({
			period: 'day',
			date: new Date(),
			startDate: null,
			endDate: null,
			staffId: '',
			department: '',
			status: '',
		});
	};

	const getActiveFiltersCount = () => {
		let count = 0;
		if (filters.staffId) count++;
		if (filters.department) count++;
		if (filters.status) count++;
		if (filters.period === 'custom' && (filters.startDate || filters.endDate)) count++;
		return count;
	};

	const activeFiltersCount = getActiveFiltersCount();

	return (
		<Modal
			open={open}
			onClose={onClose}
			closeAfterTransition
			BackdropProps={{
				sx: {
					backdropFilter: 'blur(10px)',
					backgroundColor: 'rgba(0,0,0,0.7)',
				},
			}}>
			<Box
				sx={{
					position: 'absolute',
					top: '50%',
					left: '50%',
					transform: 'translate(-50%, -50%)',
					width: { xs: '95%', sm: 600 },
					maxHeight: '90vh',
					bgcolor: '#0f172a',
					border: '1px solid rgba(255,255,255,0.12)',
					borderRadius: 3,
					boxShadow: 24,
					p: 4,
					outline: 'none',
					overflow: 'auto',
				}}>
				<LocalizationProvider dateAdapter={AdapterDateFns}>
					{/* Header */}
					<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
						<Typography
							variant="h5"
							fontWeight={600}
							sx={{ color: '#fff' }}>
							Filter Attendance
						</Typography>
						<IconButton
							onClick={onClose}
							sx={{ color: 'rgba(255,255,255,0.7)' }}>
							<CloseIcon />
						</IconButton>
					</Box>

					{/* Active Filters Summary */}
					{activeFiltersCount > 0 && (
						<Paper
							elevation={0}
							sx={{
								p: 2,
								mb: 3,
								bgcolor: 'rgba(33, 150, 243, 0.1)',
								border: '1px solid rgba(33, 150, 243, 0.2)',
								borderRadius: 2,
							}}>
							<Typography
								variant="body2"
								sx={{ color: '#90caf9', mb: 1 }}>
								Active Filters ({activeFiltersCount}):
							</Typography>
							<Stack
								direction="row"
								spacing={1}
								flexWrap="wrap">
								{filters.staffId && (
									<Chip
										label={`Staff ID: ${filters.staffId}`}
										size="small"
										onDelete={() => handleFilterChange('staffId', '')}
										sx={{ bgcolor: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa' }}
									/>
								)}
								{filters.department && (
									<Chip
										label={`Dept: ${filters.department}`}
										size="small"
										onDelete={() => handleFilterChange('department', '')}
										sx={{ bgcolor: 'rgba(74, 222, 128, 0.2)', color: '#4ade80' }}
									/>
								)}
								{filters.status && (
									<Chip
										label={`Status: ${statusOptions.find((s) => s.value === filters.status)?.label}`}
										size="small"
										onDelete={() => handleFilterChange('status', '')}
										sx={{ bgcolor: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' }}
									/>
								)}
								{filters.period === 'custom' && filters.startDate && (
									<Chip
										label={`From: ${format(filters.startDate, 'MMM d, yyyy')}`}
										size="small"
										onDelete={() => handleFilterChange('startDate', null)}
										sx={{ bgcolor: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}
									/>
								)}
								{filters.period === 'custom' && filters.endDate && (
									<Chip
										label={`To: ${format(filters.endDate, 'MMM d, yyyy')}`}
										size="small"
										onDelete={() => handleFilterChange('endDate', null)}
										sx={{ bgcolor: 'rgba(236, 72, 153, 0.2)', color: '#ec4899' }}
									/>
								)}
							</Stack>
						</Paper>
					)}

					{/* Filter Form */}
					<Stack spacing={3}>
						{/* Period Selection */}
						<FormControl
							fullWidth
							size="small">
							<InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Time Period</InputLabel>
							<Select
								value={filters.period}
								onChange={(e) => handleFilterChange('period', e.target.value)}
								label="Time Period"
								sx={{
									'bgcolor': '#222b3f',
									'color': '#fff',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
										borderColor: '#2196f3',
									},
								}}>
								{periodOptions.map((option) => (
									<MenuItem
										key={option.value}
										value={option.value}>
										{option.label}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						{/* Date Selection based on Period */}
						{filters.period !== 'custom' && (
							<DatePicker
								label="Select Date"
								value={filters.date}
								onChange={(newDate) => handleFilterChange('date', newDate)}
								sx={{
									'width': '100%',
									'& .MuiInputLabel-root': {
										color: 'rgba(255,255,255,0.7)',
									},
									'& .MuiOutlinedInput-root': {
										'bgcolor': '#222b3f',
										'color': '#fff',
										'& fieldset': {
											borderColor: 'rgba(255,255,255,0.15)',
										},
										'&:hover fieldset': {
											borderColor: 'rgba(255,255,255,0.3)',
										},
										'&.Mui-focused fieldset': {
											borderColor: '#2196f3',
										},
									},
								}}
							/>
						)}

						{/* Custom Date Range */}
						{filters.period === 'custom' && (
							<Stack
								direction="row"
								spacing={2}>
								<DatePicker
									label="Start Date"
									value={filters.startDate}
									onChange={(newDate) => handleFilterChange('startDate', newDate)}
									sx={{
										'flex': 1,
										'& .MuiInputLabel-root': {
											color: 'rgba(255,255,255,0.7)',
										},
										'& .MuiOutlinedInput-root': {
											'bgcolor': '#222b3f',
											'color': '#fff',
											'& fieldset': {
												borderColor: 'rgba(255,255,255,0.15)',
											},
											'&:hover fieldset': {
												borderColor: 'rgba(255,255,255,0.3)',
											},
											'&.Mui-focused fieldset': {
												borderColor: '#2196f3',
											},
										},
									}}
								/>
								<DatePicker
									label="End Date"
									value={filters.endDate}
									onChange={(newDate) => handleFilterChange('endDate', newDate)}
									sx={{
										'flex': 1,
										'& .MuiInputLabel-root': {
											color: 'rgba(255,255,255,0.7)',
										},
										'& .MuiOutlinedInput-root': {
											'bgcolor': '#222b3f',
											'color': '#fff',
											'& fieldset': {
												borderColor: 'rgba(255,255,255,0.15)',
											},
											'&:hover fieldset': {
												borderColor: 'rgba(255,255,255,0.3)',
											},
											'&.Mui-focused fieldset': {
												borderColor: '#2196f3',
											},
										},
									}}
								/>
							</Stack>
						)}

						<Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

						{/* Staff ID Search */}
						<TextField
							fullWidth
							label="Staff ID"
							value={filters.staffId}
							onChange={(e) => handleFilterChange('staffId', e.target.value)}
							placeholder="Enter staff ID"
							InputProps={{
								startAdornment: <SearchIcon sx={{ mr: 1, opacity: 0.7, color: 'rgba(255,255,255,0.5)' }} />,
							}}
							sx={{
								'& .MuiInputLabel-root': {
									color: 'rgba(255,255,255,0.7)',
								},
								'& .MuiOutlinedInput-root': {
									'bgcolor': '#222b3f',
									'color': '#fff',
									'& fieldset': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&:hover fieldset': {
										borderColor: 'rgba(255,255,255,0.3)',
									},
									'&.Mui-focused fieldset': {
										borderColor: '#2196f3',
									},
								},
							}}
						/>

						{/* Department Filter */}
						{/* <FormControl
							fullWidth
							size="small">
							<InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Department</InputLabel>
							<Select
								value={filters.department}
								onChange={(e) => handleFilterChange('department', e.target.value)}
								label="Department"
								sx={{
									'bgcolor': '#222b3f',
									'color': '#fff',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
										borderColor: '#2196f3',
									},
								}}>
								<MenuItem value="">All Departments</MenuItem>
								{departments.map((dept) => (
									<MenuItem
										key={dept}
										value={dept}>
										{dept}
									</MenuItem>
								))}
							</Select>
						</FormControl> */}

						{/* Status Filter */}
						<FormControl
							fullWidth
							size="small">
							<InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Status</InputLabel>
							<Select
								value={filters.status}
								onChange={(e) => handleFilterChange('status', e.target.value)}
								label="Status"
								sx={{
									'bgcolor': '#222b3f',
									'color': '#fff',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
										borderColor: '#2196f3',
									},
								}}>
								{statusOptions.map((status) => (
									<MenuItem
										key={status.value}
										value={status.value}>
										{status.label}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						{/* Action Buttons */}
						<Stack
							direction="row"
							spacing={2}
							justifyContent="flex-end">
							<Button
								variant="outlined"
								onClick={handleReset}
								sx={{
									'color': '#fff',
									'borderColor': 'rgba(255,255,255,0.2)',
									'&:hover': {
										borderColor: 'rgba(255,255,255,0.3)',
									},
								}}>
								Reset Filters
							</Button>
							<Button
								variant="contained"
								onClick={handleApply}
								sx={{
									'bgcolor': '#2196f3',
									'&:hover': { bgcolor: '#1976d2' },
								}}>
								Apply Filters
							</Button>
						</Stack>
					</Stack>
				</LocalizationProvider>
			</Box>
		</Modal>
	);
};

export default AttendanceFilter;
