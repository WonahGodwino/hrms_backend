import React, { useEffect, useState } from 'react';
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
	CircularProgress,
	Skeleton,
	Alert,
} from '@mui/material';
import {
	PendingActions as PendingActionsIcon,
	CalendarToday as CalendarTodayIcon,
	People as PeopleIcon,
	Visibility as VisibilityIcon,
	HourglassEmpty as HourglassEmptyIcon,
	Search as SearchIcon,
	ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import LeaveDetailsModal from './modals/leaveDetailsModal';
import { getAccessibleCompany } from '@/services/CompanyService';

// Example team stats (in real app → come from props or API)
const mockTeamStats = {
	totalPending: 7,
	onLeaveToday: 4,
	upcomingNextWeek: 11,
	overdue: 2,
};

const hrStatCardsConfig = [
	{
		label: 'PENDING',
		key: 'totalPending',
		unit: `7 Pending`,
		subText: 'requests awaiting approval',
		icon: <PendingActionsIcon sx={{ color: '#ff9800', fontSize: 25 }} />,
		filterType: 'PENDING',
	},
	{
		label: 'ON LEAVE TODAY',
		key: 'onLeaveToday',
		unit: `4 Staffs`,
		subText: 'team members currently away',
		icon: <CalendarTodayIcon sx={{ color: '#4caf50', fontSize: 25 }} />,
		filterType: 'TODAY',
	},
	{
		label: 'UPCOMING NEXT 7 DAYS',
		key: 'upcomingNextWeek',
		unit: `2 Staffs`,
		subText: 'planned absences',
		icon: <PeopleIcon sx={{ color: '#2196f3', fontSize: 25 }} />,
		filterType: 'UPCOMING',
	},
	{
		label: 'OVERDUE REQUEST',
		key: 'overdue',
		unit: `2 requests`,
		subText: 'requests past due date',
		icon: <HourglassEmptyIcon sx={{ color: '#f44336', fontSize: 25 }} />,
		filterType: 'OVERDUE',
	},
];

// This would normally come from API - here as example static data
const mockLeaveRequests = [
	{
		id: 'LV-2026-0123',
		leaveType: 'Annual',
		leaveReason: 'Family vacation',
		employeeName: 'Aisha Mohammed',
		noOfDays: 6,
		status: 'Pending',
		company: {
			id: 'comp-gl-001', // Global Logistics ID
			name: 'Global Logistics',
			department: 'IT',
		},
		dateCreated: 'Feb 05, 2026',
	},
	{
		id: 'LV-2026-0122',
		leaveType: 'Sick',
		leaveReason: 'Malaria treatment',
		employeeName: 'Chinedu Okeke',
		noOfDays: 3,
		company: {
			id: 'comp-gl-001', // Global Logistics ID
			name: 'Global Logistics',
			department: 'IT',
		},
		status: 'Approved',
		dateCreated: 'Jan 28, 2026',
	},
	{
		id: 'LV-2026-0121',
		leaveType: 'Maternity',
		leaveReason: 'Childbirth',
		employeeName: 'Fatima Yusuf',
		noOfDays: 90,
		company: {
			id: 'comp-gl-001', // Global Logistics ID
			name: 'Global Logistics',
			department: 'IT',
		},
		status: 'Approved',
		dateCreated: 'Jan 15, 2026',
	},
	{
		id: 'LV-2026-0120',
		leaveType: 'Annual',
		leaveReason: 'Wedding ceremony',
		employeeName: 'Tunde Adebayo',
		noOfDays: 5,
		company: {
			id: 'comp-gl-001', // Global Logistics ID
			name: 'Global Logistics',
			department: 'Sales',
		},
		status: 'Pending',
		dateCreated: 'Feb 10, 2026',
	},
	{
		id: 'LV-2026-0119',
		leaveType: 'Unpaid',
		leaveReason: 'Personal travel',
		employeeName: 'Ngozi Eze',
		noOfDays: 4,
		company: {
			id: 'comp-gl-001', // Global Logistics ID
			name: 'Global Logistics',
			department: 'Sales',
		},
		status: 'Declined',
		dateCreated: 'Feb 01, 2026',
	},
];

const LeaveHRDashboard = ({ teamStats = mockTeamStats, pendingApprovals, role }) => {
	const [page, setPage] = useState(0);
	const [rowsPerPage] = useState(10);
	const [searchTerm, setSearchTerm] = useState('');
	const [statusFilter, setStatusFilter] = useState('Pending');
	const [companyFilter, setCompanyFilter] = useState(''); // Add company filter state
	const [activeCardFilter, setActiveCardFilter] = useState({ type: 'PENDING' });
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedLeave, setSelectedLeave] = useState(null);
	const [isCompanyLoading, setIsCompanyLoading] = useState(true);
	const [companies, setCompanies] = useState([]);
	const [apiError, setApiError] = useState('');
	const isAdmin = role === 'ADMIN';
	const statuses = ['All Statuses', 'Pending', 'Approved', 'Declined', 'Cancelled'];

	// Individual loading states
	const [cardsLoading, setCardsLoading] = useState(false);
	const [tableLoading, setTableLoading] = useState(false);
	const [selectedTeam, setSelectedTeam] = useState(1);

	useEffect(() => {
		fetchCompanies();
	}, []);

	// Fetch data when company or status filter changes
	useEffect(() => {
		fetchTableData();
	}, [companyFilter, statusFilter, searchTerm, page]);

	const fetchCompanies = async () => {
		setIsCompanyLoading(true);
		try {
			const result = await getAccessibleCompany();

			if (result.data.success) {
				// Transform the API response to match your component's data structure
				const transformedCompanies = result.data.data.map((company) => ({
					id: company.id,
					name: company.companyName || 'Unknown Company',
					code: company.companyName || '',
					status: company.status || 'active',
					address: company.address,
					phone: company.phone,
					taxId: company.taxId,
					email: company.email,
				}));

				setCompanies(transformedCompanies);
				if (transformedCompanies.length > 0 && !companyFilter) {
					setCompanyFilter(transformedCompanies[0].id);
				}
			} else {
				// Handle API error response
				throw new Error(result.message || 'Failed to fetch companies');
			}
		} catch (err) {
			// Show error notification
			setApiError(err.message || 'Failed to load companies');
		} finally {
			setIsCompanyLoading(false);
		}
	};

	const fetchCardData = async () => {
		setCardsLoading(true);
		try {
			// Pass companyFilter to your API call
			// const data = await api.getTeamStats(companyFilter);
			// Update teamStats
			console.log('Fetching card data for company:', companyFilter);
		} catch (error) {
			setApiError(err.message || 'Failed to load card records');
		} finally {
			setCardsLoading(false);
		}
	};

	const fetchTableData = async () => {
		setTableLoading(true);
		try {
			// Pass filters to your API call
			// const data = await api.getLeaveRequests({
			//   searchTerm,
			//   status: statusFilter === 'All Statuses' ? null : statusFilter,
			//   companyId: companyFilter,
			//   page,
			//   rowsPerPage
			// });
			// Update leave requests with the response
			console.log('Fetching table data with filters:', {
				searchTerm,
				statusFilter,
				companyFilter,
				page,
			});
		} catch (error) {
			setApiError(err.message || 'Failed to load leave records');
		} finally {
			setTableLoading(false);
		}
	};

	const CardSkeleton = () => (
		<Grid
			item
			xs={12}
			sm={6}
			md={3}>
			<Paper sx={{ p: 2.5, bgcolor: '#0f172a', borderRadius: 2, height: '100%' }}>
				<Box sx={{ mb: 1.5 }}>
					<Skeleton
						variant="circular"
						width={30}
						height={30}
						sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
					/>
				</Box>
				<Skeleton
					variant="text"
					width="60%"
					height={20}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)', mb: 1 }}
				/>
				<Skeleton
					variant="text"
					width="80%"
					height={30}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)', mb: 1 }}
				/>
				<Skeleton
					variant="text"
					width="40%"
					height={16}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</Paper>
		</Grid>
	);

	const TableRowSkeleton = () => (
		<TableRow>
			<TableCell>
				<Skeleton
					variant="text"
					width={120}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</TableCell>
			<TableCell>
				<Skeleton
					variant="text"
					width={80}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</TableCell>
			<TableCell>
				<Skeleton
					variant="text"
					width={150}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</TableCell>
			<TableCell>
				<Skeleton
					variant="text"
					width={40}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</TableCell>
			<TableCell>
				<Skeleton
					variant="rounded"
					width={70}
					height={24}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</TableCell>
			<TableCell>
				<Skeleton
					variant="text"
					width={90}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</TableCell>
			<TableCell>
				<Skeleton
					variant="text"
					width={60}
					sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
				/>
			</TableCell>
		</TableRow>
	);

	// Rest of your filter logic remains the same
	const filteredRequests = mockLeaveRequests.filter((item) => {
		const matchesSearch =
			searchTerm === '' ||
			item.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
			item.leaveReason.toLowerCase().includes(searchTerm.toLowerCase()) ||
			item.leaveType.toLowerCase().includes(searchTerm.toLowerCase());

		const matchesStatus = statusFilter === 'All Statuses' || item.status === statusFilter;

		// Add company filter (if you have companyId in your mock data)
		// const matchesCompany = !companyFilter || item.companyId === companyFilter;

		let matchesCardFilter = true;
		if (activeCardFilter) {
			switch (activeCardFilter.type) {
				case 'PENDING':
				case 'Pending':
					matchesCardFilter = item.status === 'Pending';
					break;
				case 'TODAY':
				case 'UPCOMING':
					matchesCardFilter = item.status === 'Approved';
					break;
				case 'OVERDUE':
					matchesCardFilter = item.status === 'Pending';
					break;
				default:
					matchesCardFilter = true;
			}
		}

		return matchesSearch && matchesStatus && matchesCardFilter;
	});

	const handleCardClick = (cardType) => {
		if (activeCardFilter?.type === cardType) {
			setActiveCardFilter(null);
			setStatusFilter('All Statuses');
		} else {
			setActiveCardFilter({ type: cardType });
			setPage(0);

			if (cardType === 'PENDING') {
				setStatusFilter('Pending');
			}
		}
	};

	const handleClearCardFilter = () => {
		setActiveCardFilter(null);
	};

	const handleSearch = (e) => {
		setSearchTerm(e.target.value);
		setPage(0);
	};

	const handleStatusChange = (e) => {
		const newStatus = e.target.value;
		setStatusFilter(newStatus);
		setPage(0);

		if (newStatus !== 'Pending' && activeCardFilter?.type === 'PENDING') {
			setActiveCardFilter(null);
		}
	};

	// Add company change handler
	const handleCompanyChange = (e) => {
		const newCompanyId = e.target.value;
		setCompanyFilter(newCompanyId);
		setPage(0);
		// Reset card filter when company changes
		setActiveCardFilter(null);
		// Optionally reset status filter
		// setStatusFilter('All Statuses');
	};

	const getStatusColor = (status) => {
		switch (status) {
			case 'Approved':
				return '#4caf50';
			case 'Pending':
				return '#ff9800';
			case 'Declined':
				return '#f44336';
			case 'Cancelled':
				return '#9e9e9e';
			default:
				return '#757575';
		}
	};

	const handleViewLeaveDetails = (leaveRecord) => {
		setSelectedLeave(leaveRecord);
		setModalOpen(true);
	};

	const handleCloseModal = () => {
		setModalOpen(false);
		setSelectedLeave(null);
	};

	// Get selected company name for display
	const getSelectedCompanyName = () => {
		const company = companies.find((c) => c.id === companyFilter);
		return company ? company.name : 'Select Company';
	};

	return (
		<Stack spacing={4}>
			{/* Show API error if any */}
			{apiError && (
				<Alert
					severity="error"
					onClose={() => setApiError('')}>
					{apiError}
				</Alert>
			)}

			<Grid
				container
				spacing={3}>
				{cardsLoading
					? Array.from(new Array(4)).map((_, index) => (
							<Grid
								item
								size={{
									xs: 12,
									sm: 6,
									md: 6, // 2 cards at medium screens
									lg: 3, // 4 cards at large screens
								}}
								key={index}>
								<Paper
									sx={{
										p: { xs: 2, sm: 2.5 },
										bgcolor: '#0f172a',
										borderRadius: 2,
										height: '100%',
										display: 'flex',
										flexDirection: 'column',
									}}>
									{/* Icon skeleton */}
									<Box sx={{ mb: 1.5, display: 'block', width: { xs: 35, sm: 40 } }}>
										<Skeleton
											variant="circular"
											width={{ xs: 35, sm: 40 }} // Make width and height equal for perfect circle
											height={{ xs: 35, sm: 40 }} // Same values as width
											sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
										/>
									</Box>

									{/* Label skeleton */}
									<Skeleton
										variant="text"
										width="80%"
										height={20}
										sx={{
											mb: 0.75,
											px: 1,
											bgcolor: 'rgba(255,255,255,0.1)',
										}}
									/>

									{/* Value skeleton */}
									<Skeleton
										variant="text"
										width="60%"
										height={{ xs: 36, sm: 40 }}
										sx={{
											mb: 0.8,
											px: 1,
											bgcolor: 'rgba(255,255,255,0.1)',
										}}
									/>

									{/* Subtext skeleton */}
									<Skeleton
										variant="text"
										width="70%"
										height={16}
										sx={{
											px: 1,
											bgcolor: 'rgba(255,255,255,0.1)',
										}}
									/>
								</Paper>
							</Grid>
					  ))
					: hrStatCardsConfig.map((card, index) => (
							<Grid
								item
								size={{
									xs: 12,
									sm: 6,
									md: 6,
									lg: 3,
								}}
								key={index}
								sx={{
									animation: `float 3s ease-in-out ${index * 0.2}s infinite`,
									...animations,
								}}>
								<Paper
									onClick={() => handleCardClick(card.filterType)}
									sx={{
										'p': { xs: 2, sm: 2.5 },
										'bgcolor': '#0f172a',
										'borderRadius': 2,
										'border': activeCardFilter?.type === card.filterType ? '2px solid #2196f3' : 'none',
										'boxShadow': activeCardFilter?.type === card.filterType ? '0 0 20px rgba(33, 150, 243, 0.5)' : '0 4px 6px rgba(0,0,0,0.1)',
										'height': '100%',
										'display': 'flex',
										'flexDirection': 'column',
										'cursor': 'pointer',
										'transition': 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
										'position': 'relative',
										'overflow': 'hidden',
										'&::after': {
											content: '""',
											position: 'absolute',
											bottom: 0,
											left: 0,
											width: '100%',
											height: '2px',
											background: 'linear-gradient(90deg, #2196f3, #64b5f6, #2196f3)',
											transform: 'scaleX(0)',
											transition: 'transform 0.3s ease',
										},
										'&:hover': {
											'transform': 'scale(1.02) translateY(-4px)',
											'boxShadow': '0 12px 20px rgba(33, 150, 243, 0.3)',
											'&::after': {
												transform: 'scaleX(1)',
											},
											'& .MuiAvatar-root': {
												animation: 'rotate-scale 0.5s ease',
												...animations,
											},
										},
									}}>
									<Box sx={{ mb: 1.5 }}>
										<Avatar sx={{ bgcolor: 'transparent', width: { xs: 25, sm: 30 }, height: { xs: 35, sm: 40 } }}>{card.icon}</Avatar>
									</Box>

									<Typography
										variant="caption"
										color="text.secondary"
										sx={{
											letterSpacing: '0.5px',
											fontWeight: 600,
											fontSize: { xs: '0.7rem', sm: '0.75rem' }, // Responsive font size
											mb: 0.75,
											px: 1,
										}}>
										{card.label}
									</Typography>

									<Typography
										variant="h5"
										fontWeight={700}
										color="white"
										sx={{
											lineHeight: 1.1,
											mb: 0.8,
											px: 1,
											fontSize: { xs: '1.5rem', sm: '1.75rem' }, // Responsive font size
										}}>
										{card.unit}
									</Typography>

									<Typography
										variant="caption"
										color="text.secondary"
										sx={{
											fontSize: { xs: '0.675rem', sm: '0.725rem' }, // Responsive font size
											lineHeight: 1.3,
											px: 1,
										}}>
										{card.subText}
									</Typography>
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
							'&:hover': { bgcolor: 'rgba(33, 150, 243, 0.1)' },
						}}>
						Clear Filter
					</Button>
				</Box>
			)}

			<Paper
				sx={{
					bgcolor: '#0f172a',
					borderRadius: 3,
					border: '1px solid rgba(255,255,255,0.08)',
					overflow: 'hidden',
					boxShadow: 'none',
					position: 'relative',
				}}>
				{tableLoading && (
					<Box
						sx={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							bgcolor: 'rgba(15, 23, 42, 0.7)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							zIndex: 10,
							backdropFilter: 'blur(2px)',
						}}>
						<CircularProgress sx={{ color: '#2196f3' }} />
					</Box>
				)}

				<Box sx={{ px: 3, pt: 3, pb: 0 }}>
					<Stack
						direction="row"
						justifyContent="space-between"
						alignItems="center"
						sx={{ mb: 3 }}>
						<Typography
							variant="h5"
							fontWeight={700}
							color="white">
							Team Leave Requests
						</Typography>
					</Stack>

					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1}
						sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}>
						<TextField
							placeholder="Search by employee, reason or type..."
							variant="outlined"
							size="small"
							value={searchTerm}
							onChange={handleSearch}
							disabled={tableLoading}
							sx={{
								'width': { xs: '100%', md: '300px' },
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

						<Grid
							container
							spacing={1}
							sx={{
								width: '100%',
								flex: 1,
							}}>
							<Grid
								item
								size={{ xs: 12, sm: 6, md: 6 }}>
								<FormControl
									size="small"
									fullWidth>
									<Select
										value={statusFilter}
										onChange={handleStatusChange}
										displayEmpty
										disabled={tableLoading}
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
							</Grid>

							{isAdmin && (
								<Grid
									item
									size={{ xs: 12, sm: 6, md: 6 }}>
									<FormControl
										size="small"
										fullWidth>
										<Select
											value={companyFilter}
											onChange={handleCompanyChange}
											displayEmpty
											disabled={isCompanyLoading || companies.length === 0}
											renderValue={(selected) => {
												if (!selected) {
													return <Typography color="rgba(255,255,255,0.5)">Select Company</Typography>;
												}
												const company = companies.find((c) => c.id === selected);
												return company ? company.name : 'Select Company';
											}}
											sx={{
												'color': 'white',
												'bgcolor': '#1e293b',
												'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
												'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
												'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
											}}>
											{companies.map((company) => (
												<MenuItem
													key={company.id}
													value={company.id}>
													{company.name}
												</MenuItem>
											))}

											{/* Show loading state in dropdown */}
											{isCompanyLoading && (
												<MenuItem disabled>
													<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
														<CircularProgress size={16} />
														<Typography>Loading companies...</Typography>
													</Box>
												</MenuItem>
											)}

											{!isCompanyLoading && companies.length === 0 && (
												<MenuItem disabled>
													<Typography color="error">No companies found</Typography>
												</MenuItem>
											)}
										</Select>
									</FormControl>
								</Grid>
							)}
						</Grid>
					</Stack>

					{/* Show selected company info if needed */}
					{companyFilter && (
						<Box sx={{ mb: 2 }}>
							<Typography
								variant="caption"
								color="text.secondary">
								Showing data for: {getSelectedCompanyName()}
							</Typography>
						</Box>
					)}
				</Box>

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
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>EMPLOYEE</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>LEAVE TYPE</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>REASON</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>DAYS</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>STATUS</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>DATE REQUESTED</TableCell>
								<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>ACTIONS</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{tableLoading ? (
								// Show skeleton rows while loading
								<>
									<TableRowSkeleton />
									<TableRowSkeleton />
									<TableRowSkeleton />
									<TableRowSkeleton />
									<TableRowSkeleton />
								</>
							) : // Show actual data
							filteredRequests.length > 0 ? (
								filteredRequests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((item) => (
									<TableRow
										key={item.id}
										sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
										<TableCell>
											<Typography
												variant="body2"
												color="white">
												{item.employeeName}
											</Typography>
										</TableCell>
										<TableCell>
											<Typography
												variant="body2"
												color="white">
												{item.leaveType}
											</Typography>
										</TableCell>
										<TableCell>
											<Typography
												variant="body2"
												color="text.secondary">
												{item.leaveReason}
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
											<Button
												startIcon={<VisibilityIcon fontSize="small" />}
												size="small"
												sx={{
													'color': '#137fec',
													'textTransform': 'none',
													'&:hover': { bgcolor: 'rgba(19, 127, 236, 0.1)' },
												}}
												onClick={() => handleViewLeaveDetails(item)}>
												View
											</Button>
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={7}
										align="center"
										sx={{ py: 3 }}>
										<Typography color="text.secondary">
											{companyFilter ? 'No leave requests found for this company' : 'Please select a company to view leave requests'}
										</Typography>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</TableContainer>

				{/* Simple pagination */}
				<Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
					<Stack
						direction="row"
						spacing={2}
						alignItems="center">
						<Typography
							variant="body2"
							color="text.secondary">
							Showing {!tableLoading && filteredRequests.length > 0 ? page * rowsPerPage + 1 : 0}–
							{!tableLoading ? Math.min((page + 1) * rowsPerPage, filteredRequests.length) : 0} of {!tableLoading ? filteredRequests.length : 0}
						</Typography>
						<IconButton
							size="small"
							onClick={() => setPage(Math.max(0, page - 1))}
							disabled={page === 0 || tableLoading || filteredRequests.length === 0}
							sx={{ color: page === 0 || tableLoading || filteredRequests.length === 0 ? 'rgba(255,255,255,0.2)' : 'white' }}>
							<ChevronRightIcon sx={{ transform: 'rotate(180deg)' }} />
						</IconButton>
						<IconButton
							size="small"
							onClick={() => setPage(page + 1)}
							disabled={page >= Math.ceil(filteredRequests.length / rowsPerPage) - 1 || tableLoading || filteredRequests.length === 0}
							sx={{
								color: page >= Math.ceil(filteredRequests.length / rowsPerPage) - 1 || tableLoading || filteredRequests.length === 0 ? 'rgba(255,255,255,0.2)' : 'white',
							}}>
							<ChevronRightIcon />
						</IconButton>
					</Stack>
				</Box>
			</Paper>

			<LeaveDetailsModal
				open={modalOpen}
				onClose={handleCloseModal}
				leaveRecord={selectedLeave}
				role="HR"
			/>
		</Stack>
	);
};

export default LeaveHRDashboard;

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
