import React, { useState } from 'react';
import {
	Box,
	Paper,
	Typography,
	Grid,
	Stack,
	Chip,
	Button,
	Avatar,
	IconButton,
	TextField,
	InputAdornment,
	MenuItem,
	Select,
	FormControl,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
} from '@mui/material';

import {
	Business as BusinessIcon,
	People as PeopleIcon,
	CancelOutlined as CancelOutlinedIcon,
	Search as SearchIcon,
	Visibility as VisibilityIcon,
	ChevronRight as ChevronRightIcon,
	AdminPanelSettings as AdminPanelSettingsIcon,
	CalendarToday as CalendarTodayIcon,
	BeachAccess as BeachAccessIcon,
	DateRange as DateRangeIcon,
} from '@mui/icons-material';

import LeaveDetailsModal from './modals/leaveDetailsModal';

const leaveHistory = [
	{
		id: 'LV-2025-0892',
		leaveType: 'Annual',
		leaveReason: 'Nexus Innovations - Year-end family trip',
		assignedAdmin: 'John Doe',
		noOfDays: 5,
		status: 'Approved',
		dateCreated: 'Oct 24, 2023',
		company: {
			name: 'Nexus Innovations',
			id: 'COMP-001',
			department: 'Technology',
		},
	},
	{
		id: 'LV-2025-0891',
		leaveType: 'Sick',
		leaveReason: 'Global Logistics - Medical appointment',
		assignedAdmin: 'Alice Smith',
		noOfDays: 2,
		status: 'Approved',
		dateCreated: 'Sep 12, 2023',
		company: {
			name: 'Global Logistics',
			id: 'COMP-002',
			department: 'Logistics',
		},
	},
	{
		id: 'LV-2025-0890',
		leaveType: 'Unpaid',
		leaveReason: 'Summit Financial - Personal matters',
		assignedAdmin: 'Unassigned',
		noOfDays: 3,
		status: 'Declined',
		dateCreated: 'Aug 05, 2023',
		company: {
			name: 'Summit Financial',
			id: 'COMP-003',
			sector: 'Finance',
		},
	},
	{
		id: 'LV-2025-0889',
		leaveType: 'Annual',
		leaveReason: 'Alpha Health - Extended weekend',
		assignedAdmin: 'Mike Kite',
		noOfDays: 4,
		status: 'Pending',
		dateCreated: 'Nov 15, 2023',
		company: {
			name: 'Alpha Health',
			id: 'COMP-004',
			sector: 'Healthcare',
		},
	},
	{
		id: 'LV-2025-0888',
		leaveType: 'Annual',
		leaveReason: 'Urban Retailers - Holiday preparation',
		assignedAdmin: 'Sarah Jones',
		noOfDays: 2,
		status: 'Approved',
		dateCreated: 'Dec 01, 2023',
		company: {
			name: 'Urban Retailers',
			id: 'COMP-005',
			sector: 'Retail',
		},
	},
];

const StaffDashboard = ({
	// Leave balance data
	balance = {
		available: 14,
		pending: 3,
		used: 7,
		carriedOver: 2,
		totalEntitlement: 21,
	},

	// Policy data
	policy = {
		accrualRate: '1.75 days/month',
		maxDaysPerRequest: 21,
		carryOverMax: 5,
		noticeDays: 2,
	},

	// Upcoming leave
	upcomingLeave = {
		start: '2026-03-10',
		end: '2026-03-14',
		type: 'Annual',
		days: 5,
	},

	// Stats cards data
	stats = {
		availableLeave: 21,
		requests: 3,
		currentLeave: {
			status: 'On Leave',
			startDate: 'Mar 10, 2026',
			endDate: 'Mar 14, 2026',
			days: 5,
			type: 'Annual',
		},
		annualLeaveTaken: 1100,
		activeLeave: 5,
		upcomingLeave: {
			status: 'Upcoming Leave',
			startDate: 'Mar 10, 2026',
			endDate: null, //'Mar 14, 2026',
			days: 2,
			type: 'Annual',
		},
	},

	// Pagination info
	totalRequests = 1240,
	rowsPerPageOptions = [10, 25, 50],
	defaultRowsPerPage = 10,

	// Event handlers
	onApplyLeave,
	onViewLeaveDetails,
	onSearch,
	onFilterChange,

	...rest
}) => {
	const [page, setPage] = useState(0);
	const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
	const [searchTerm, setSearchTerm] = useState('');
	const [sectorFilter, setSectorFilter] = useState('All Sectors');
	const [statusFilter, setStatusFilter] = useState('All Statuses');
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedLeave, setSelectedLeave] = useState(null);

	// Get unique sectors and statuses
	const [activeCardFilter, setActiveCardFilter] = useState(null);
	const sectors = ['All Sectors']; //...new Set(leaveHistory.map((item) => item.company.sector))
	const statuses = ['All Statuses', ...new Set(leaveHistory.map((item) => item.status))];

	// Filter leave history
	const filteredHistory = leaveHistory.filter((item) => {
		// Search filter
		const matchesSearch =
			searchTerm === '' ||
			item.leaveReason.toLowerCase().includes(searchTerm.toLowerCase()) ||
			item.company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			item.company.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
			item.leaveType.toLowerCase().includes(searchTerm.toLowerCase());

		// Sector filter
		const matchesSector = sectorFilter === 'All Sectors' || item.company.department === sectorFilter;

		// Status filter
		const matchesStatus = statusFilter === 'All Statuses' || item.status === statusFilter;

		// Card filter - applies additional filtering based on which card was clicked
		let matchesCardFilter = true;
		if (activeCardFilter) {
			switch (activeCardFilter.type) {
				case 'AVAILABLE LEAVE':
					// Show only active/approved leaves that are upcoming/current
					matchesCardFilter = item.status === 'Approved' || item.status === 'Active';
					break;
				case 'REQUESTS':
					// Show only pending requests
					matchesCardFilter = item.status === 'Pending';
					break;
				case 'CURRENT LEAVE':
					// Show current/active leaves
					matchesCardFilter = item.status === 'Active' || item.status === 'Approved';
					break;
				case 'UPCOMING LEAVE':
					// Show future/upcoming leaves (you'd need date logic here)
					matchesCardFilter = item.status === 'Pending' || item.status === 'Approved';
					break;
				case 'ANNUAL LEAVE TAKEN':
					// Show completed/used leaves
					matchesCardFilter = item.status === 'Approved' || item.status === 'Completed';
					break;
				default:
					matchesCardFilter = true;
			}
		}

		return matchesSearch && matchesSector && matchesStatus && matchesCardFilter;
	});

	const handleCardClick = (cardType) => {
		// If clicking the same card again, clear the filter
		if (activeCardFilter?.type === cardType) {
			setActiveCardFilter(null);
			// Also reset status filter to show all
			setStatusFilter('All Statuses');
		} else {
			setActiveCardFilter({ type: cardType });
			// Reset page to 0 when applying new filter
			setPage(0);

			// Optionally update the status filter to match the card
			switch (cardType) {
				case 'REQUESTS':
					setStatusFilter('Pending');
					break;
				case 'CURRENT LEAVE':
				case 'AVAILABLE LEAVE':
					setStatusFilter('Approved');
					break;
				case 'ANNUAL LEAVE TAKEN':
					setStatusFilter('Approved');
					break;
				default:
					// Keep existing filter
					break;
			}
		}
	};

	const handleClearCardFilter = () => {
		setActiveCardFilter(null);
	};

	const handleSearch = (e) => {
		const value = e.target.value;
		setSearchTerm(value);
		setPage(0);
		onSearch?.('search', value);
	};

	const handleSectorChange = (e) => {
		const value = e.target.value;
		setSectorFilter(value);
		setPage(0);
		onFilterChange?.('sector', value);
	};

	const handleStatusChange = (e) => {
		const value = e.target.value;
		setStatusFilter(value);
		setPage(0);
		setActiveCardFilter(null);
		onFilterChange?.('status', value);
	};

	const handleViewLeaveDetails = (leaveRecord) => {
		setSelectedLeave(leaveRecord);
		setModalOpen(true);
	};

	const handleCloseModal = () => {
		setModalOpen(false);
		setSelectedLeave(null);
	};

	const getStatusColor = (status) => {
		switch (status) {
			case 'Approved':
				return '#4caf50';
			case 'Pending':
				return '#ff9800';
			case 'Declined':
				return '#f44336';
			default:
				return '#9e9e9e';
		}
	};

	const statCards = [
		{
			label: 'AVAILABLE LEAVE',
			value: balance.available,
			unit: `${balance.available || 0} Days`,
			subText: 'this year', // Changed from 'this month' to 'this year'
			icon: <BusinessIcon sx={{ fontSize: 28, color: '#2196f3' }} />,
			bgColor: 'transparent',
			textColor: '#2196f3',
			filterType: 'AVAILABLE LEAVE',
			count: leaveHistory.filter((item) => item.status === 'Approved' || item.status === 'Active').length,
		},
		{
			label: 'REQUESTS',
			value: stats.requests || leaveHistory.filter((r) => r.status === 'Pending').length,
			unit: `${stats.requests || leaveHistory.filter((r) => r.status === 'Pending').length} Requests`,
			subText: 'this year', // Changed from 'this month' to 'this year'
			icon: <PeopleIcon sx={{ fontSize: 28, color: '#9c27b0' }} />,
			bgColor: 'transparent',
			textColor: '#9c27b0',
			filterType: 'REQUESTS',
			count: leaveHistory.filter((item) => item.status === 'Pending').length,
		},
		{
			label: 'CURRENT LEAVE',
			bgColor: 'transparent',
			value: 'On Leave',
			unit: `${stats.currentLeave.days || 0} Days`,
			subText: `${stats.currentLeave.startDate} - ${stats.currentLeave.endDate}`,
			icon: <AdminPanelSettingsIcon sx={{ fontSize: 28, color: '#ff9800' }} />,
			color: '#ff9800',
			// filterType: 'CURRENT LEAVE',
			// count: leaveHistory.filter((item) => item.status === 'Active' || item.status === 'Approved').length,
		},
		{
			label: 'UPCOMING LEAVE',
			value: stats.upcomingLeave.days,
			unit: `${stats.upcomingLeave.days || 0} Days`,
			subText: `Starts ${stats.upcomingLeave.startDate}`,
			icon: <CalendarTodayIcon sx={{ fontSize: 28, color: '#2196f3' }} />,
			color: '#2196f3',
			// filterType: 'UPCOMING LEAVE',
			// count: leaveHistory.filter((item) => item.status === 'Pending' || item.status === 'Approved').length,
		},
		{
			label: 'ANNUAL LEAVE TAKEN',
			value: balance.used || 0,
			unit: `${balance.used || 0} Days`,
			subText: 'this year',
			icon: <DateRangeIcon sx={{ fontSize: 28, color: '#f44336' }} />,
			// icon: <CancelOutlinedIcon sx={{ fontSize: 28, color: '#f44336' }} />,
			bgColor: 'transparent',
			textColor: '#f44336',
			// filterType: 'ANNUAL LEAVE TAKEN',
			// count: leaveHistory.filter((item) => item.status === 'Approved' || item.status === 'Completed').length,
		},
	];

	return (
		<Stack
			spacing={4}
			{...rest}>
			<Grid
				container
				spacing={3}>
				{statCards.map((card, index) => (
					<Grid
						item
						size={{
							xs: 12,
							sm: 6,
							md: 6,
							lg: 2.4,
						}}
						key={index}
						sx={{
							animation: `bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${index * 0.1}s both`,
							...animations,
						}}>
						<Paper
							onClick={() => handleCardClick(card.filterType)}
							sx={{
								'p': { xs: 2, sm: 2.5 },
								'bgcolor': '#0f172a',
								'borderRadius': 2,
								'border': activeCardFilter ? (activeCardFilter?.type === card.filterType ? '2px solid #2196f3' : '1px solid rgba(255,255,255,0.08)') : 'none',
								'boxShadow': activeCardFilter ? (activeCardFilter?.type === card.filterType ? '0 0 20px rgba(33, 150, 243, 0.5)' : '0 4px 6px rgba(0,0,0,0.1)') : 'none',
								'height': '100%',
								'display': 'flex',
								'flexDirection': 'column',
								'cursor': 'pointer',
								'transition': 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
								'position': 'relative',
								'overflow': 'hidden',
								'&::before': {
									content: '""',
									position: 'absolute',
									top: 0,
									left: '-100%',
									width: '100%',
									height: '100%',
									background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
									transition: 'left 0.5s ease',
								},
								'&:hover': {
									'transform': 'scale(1.02) translateY(-4px)',
									'boxShadow': '0 12px 20px rgba(0,0,0,0.3)',
									'&::before': {
										left: '100%',
									},
									'& .MuiAvatar-root': {
										animation: 'rotate-scale 0.5s ease',
										...animations,
									},
								},
							}}>
							<Stack
								direction="row"
								alignItems="center"
								spacing={1}
								sx={{ mb: 1.5 }}>
								<Avatar
									sx={{
										bgcolor: 'transparent',
										width: { xs: 28, sm: 32 },
										height: { xs: 28, sm: 32 },
										transition: 'all 0.3s ease',
									}}>
									{card.icon}
								</Avatar>
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{
										letterSpacing: '0.5px',
										fontWeight: 600,
										fontSize: { xs: '0.7rem', sm: '0.75rem' },
										transition: 'color 0.3s ease',
									}}>
									{card.label}
								</Typography>
							</Stack>

							<Typography
								variant="h5"
								fontWeight={700}
								color="white"
								sx={{
									'lineHeight': 1.2,
									'mb': 0.5,
									'fontSize': { xs: '1.25rem', sm: '1.5rem' },
									'transition': 'transform 0.3s ease',
									'&:hover': {
										transform: 'scale(1.05)',
										color: '#2196f3',
									},
								}}>
								{card.unit}
							</Typography>

							{card.subText && (
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{
										'display': 'block',
										'fontSize': { xs: '0.65rem', sm: '0.7rem' },
										'transition': 'opacity 0.3s ease',
										'&:hover': {
											opacity: 0.8,
										},
									}}>
									{card.subText}
								</Typography>
							)}
						</Paper>
					</Grid>
				))}
			</Grid>

			{activeCardFilter && (
				<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
					<Button
						size="small"
						onClick={handleClearCardFilter}
						sx={{
							'color': '#2196f3',
							'textTransform': 'none',
							'&:hover': {
								bgcolor: 'rgba(33, 150, 243, 0.1)',
							},
						}}>
						Clear Filter
					</Button>
				</Box>
			)}

			{/* ======================================== */}
			{/* SECTION 3: LEAVE HISTORY TABLE */}
			{/* ======================================== */}
			<Paper
				sx={{
					bgcolor: '#0f172a',
					borderRadius: 3,
					border: '1px solid rgba(255,255,255,0.08)',
					overflow: 'hidden',
					boxShadow: 'none',
				}}>
				{/* Header */}
				<Box
					sx={{
						px: 3,
						pt: 3,
						pb: 0,
					}}>
					<Stack
						direction="row"
						justifyContent="space-between"
						alignItems="center"
						sx={{ mb: 3 }}>
						<Typography
							variant="h5"
							fontWeight={700}
							color="white">
							Leave History
						</Typography>
					</Stack>

					{/* Search and Filters */}
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={2}
						sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}>
						{/* Search Box - Left side with fixed width */}
						<TextField
							placeholder="Search by company name or department"
							variant="outlined"
							size="small"
							value={searchTerm}
							onChange={handleSearch}
							sx={{
								'width': { xs: '100%', md: '400px' }, // Fixed width on desktop, full width on mobile
								'& .MuiOutlinedInput-root': {
									'color': 'white',
									'bgcolor': '#1e293b',
									'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
									'&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
									'&.Mui-focused fieldset': { borderColor: '#2196f3' },
								},
							}}
							InputProps={{
								startAdornment: (
									<InputAdornment position="start">
										<SearchIcon sx={{ color: 'rgba(255,255,255,0.5)' }} />
									</InputAdornment>
								),
							}}
						/>

						{/* Filter Selects - Right side */}
						<Stack
							direction="row"
							spacing={2}
							sx={{
								width: { xs: '100%', md: 'auto' },
								justifyContent: { xs: 'space-between', md: 'flex-end' },
							}}>
							{/* Sector Filter */}
							<FormControl
								size="small"
								sx={{ minWidth: 150, flex: { xs: 1, md: 'none' } }}>
								<Select
									value={sectorFilter}
									onChange={handleSectorChange}
									displayEmpty
									sx={{
										'color': 'white',
										'bgcolor': '#1e293b',
										'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
									}}>
									{sectors.map((sector) => (
										<MenuItem
											key={sector}
											value={sector}>
											{sector}
										</MenuItem>
									))}
								</Select>
							</FormControl>

							{/* Status Filter */}
							<FormControl
								size="small"
								sx={{ minWidth: 150, flex: { xs: 1, md: 'none' } }}>
								<Select
									value={statusFilter}
									onChange={handleStatusChange}
									displayEmpty
									sx={{
										'color': 'white',
										'bgcolor': '#1e293b',
										'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
										'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
										'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
									}}>
									{statuses.map((status) => (
										<MenuItem
											key={status}
											value={status}>
											{status}
										</MenuItem>
									))}
								</Select>
							</FormControl>
						</Stack>
					</Stack>
				</Box>

				{/* Table */}
				<TableContainer>
					<Table
						size="small"
						sx={{
							'& .MuiTableCell-root': {
								py: 2,
								px: 3,
								borderBottom: '1px solid rgba(255,255,255,0.04)',
							},
							'& .MuiTableCell-head': {
								py: 1.5,
								px: 3,
								borderBottom: '1px solid rgba(255,255,255,0.08)',
							},
						}}>
						<TableHead>
							<TableRow sx={{ bgcolor: '#1e293b' }}>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>LEAVE TYPE</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>LEAVE REASON</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>ASSIGNED ADMIN</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>NO. OF DAYS</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>STATUS</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>DATE CREATED</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>ACTIONS</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{filteredHistory.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((item, index) => (
								<TableRow
									key={item.id}
									sx={{
										'mx': 4,
										'&:hover': {
											bgcolor: 'rgba(255,255,255,0.02)',
											transform: 'scale(1.01)',
											transition: 'all 0.3s ease',
										},
										'& td': {
											borderBottom: '1px solid rgba(255,255,255,0.04)',
											transition: 'all 0.3s ease',
										},
										'animation': `slide-in-blurred 0.5s ease-out ${index * 0.05}s both`,
										...animations,
									}}>
									<TableCell>
										<Stack
											direction="row"
											alignItems="center"
											spacing={1}>
											<Box>
												<Typography
													variant="body2"
													color="white">
													{item.leaveType}
												</Typography>
												<Typography
													variant="caption"
													color="text.secondary">
													{item.company.id}
												</Typography>
											</Box>
										</Stack>
									</TableCell>

									<TableCell>
										<Box>
											<Typography
												variant="body2"
												color="white">
												{item.company.name}
											</Typography>
											<Typography
												variant="caption"
												color="text.secondary">
												{item.leaveReason}
											</Typography>
										</Box>
									</TableCell>

									<TableCell>
										<Typography
											variant="body2"
											color="white">
											{item.assignedAdmin}
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary">
											{item.company.department}
										</Typography>
									</TableCell>

									<TableCell>
										<Typography
											variant="body2"
											fontWeight={600}
											color="white">
											{item.noOfDays}
										</Typography>
									</TableCell>

									<TableCell>
										<Chip
											label={item.status}
											size="small"
											sx={{
												bgcolor: `${getStatusColor(item.status)}20`,
												color: getStatusColor(item.status),
												fontWeight: 600,
												fontSize: '0.75rem',
											}}
										/>
									</TableCell>

									<TableCell>
										<Typography
											variant="body2"
											color="white">
											{item.dateCreated}
										</Typography>
									</TableCell>

									<TableCell>
										<Stack
											direction="row"
											spacing={1}>
											<Button
												startIcon={<VisibilityIcon fontSize="small" />}
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
												onClick={() => handleViewLeaveDetails(item)}>
												View
											</Button>
										</Stack>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>

				{/* Pagination */}
				<Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
					<Stack
						direction="row"
						spacing={2}
						alignItems="center">
						<Typography
							variant="body2"
							color="text.secondary">
							Rows per page:
						</Typography>
						<Select
							value={rowsPerPage}
							onChange={(e) => setRowsPerPage(e.target.value)}
							size="small"
							sx={{
								'color': 'white',
								'bgcolor': '#1e293b',
								'minWidth': 80,
								'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
							}}>
							{rowsPerPageOptions.map((option) => (
								<MenuItem
									key={option}
									value={option}>
									{option}
								</MenuItem>
							))}
						</Select>
						<Typography
							variant="body2"
							color="text.secondary">
							Showing {filteredHistory.length > 0 ? page * rowsPerPage + 1 : 0}-{Math.min((page + 1) * rowsPerPage, filteredHistory.length)} of {filteredHistory.length}
						</Typography>
						<IconButton
							size="small"
							onClick={() => setPage(Math.max(0, page - 1))}
							disabled={page === 0}
							sx={{ color: page === 0 ? 'rgba(255,255,255,0.2)' : 'white' }}>
							<ChevronRightIcon sx={{ transform: 'rotate(180deg)' }} />
						</IconButton>
						<IconButton
							size="small"
							onClick={() => setPage(page + 1)}
							disabled={page >= Math.ceil(filteredHistory.length / rowsPerPage) - 1}
							sx={{ color: page >= Math.ceil(filteredHistory.length / rowsPerPage) - 1 ? 'rgba(255,255,255,0.2)' : 'white' }}>
							<ChevronRightIcon />
						</IconButton>
					</Stack>
				</Box>
			</Paper>

			<LeaveDetailsModal
				open={modalOpen}
				onClose={handleCloseModal}
				leaveRecord={selectedLeave}
				role="STAFF"
			/>
		</Stack>
	);
};

export default StaffDashboard;

const animations = {
	'@keyframes float': {
		'0%': { transform: 'translateY(0px)' },
		'50%': { transform: 'translateY(-8px)' },
		'100%': { transform: 'translateY(0px)' },
	},
	'@keyframes pulse-glow': {
		'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
		'70%': { boxShadow: '0 0 0 12px rgba(33, 150, 243, 0)' },
		'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
	},
	'@keyframes shimmer': {
		'0%': { backgroundPosition: '-1000px 0' },
		'100%': { backgroundPosition: '1000px 0' },
	},
	'@keyframes slide-in-blurred': {
		'0%': {
			transform: 'translateX(1000px) scaleX(2.5) scaleY(0.2)',
			transformOrigin: '0% 50%',
			filter: 'blur(40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0) scaleY(1) scaleX(1)',
			transformOrigin: '50% 50%',
			filter: 'blur(0)',
			opacity: 1,
		},
	},
	'@keyframes bounce-in': {
		'0%': {
			transform: 'scale(0.3)',
			opacity: 0,
		},
		'50%': {
			transform: 'scale(1.05)',
		},
		'70%': {
			transform: 'scale(0.9)',
		},
		'100%': {
			transform: 'scale(1)',
			opacity: 1,
		},
	},
	'@keyframes rotate-scale': {
		'0%': { transform: 'rotate(-10deg) scale(0.8)' },
		'100%': { transform: 'rotate(0) scale(1)' },
	},
	'@keyframes color-wave': {
		'0%': { color: '#60a5fa' },
		'25%': { color: '#34d399' },
		'50%': { color: '#fbbf24' },
		'75%': { color: '#f87171' },
		'100%': { color: '#60a5fa' },
	},
};
