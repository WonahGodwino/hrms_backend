import React, { useState, useEffect, useMemo } from 'react';
import { Paper, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Stack, IconButton, Button, Pagination } from '@mui/material';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay, isToday } from 'date-fns';

const WeeklyView = ({ data, date, selectedDate, onDateChange, onWeekChange, onTodayClick, companyId }) => {
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 6,
		total: 0,
	});

	// Get week range
	const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
	const weekEnd = endOfWeek(date, { weekStartsOn: 1 }); // Sunday
	const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

	// Group data by staff and date
	const [groupedData, setGroupedData] = useState({});

	useEffect(() => {
		if (data && Array.isArray(data)) {
			const grouped = {};
			data.forEach((record) => {
				const staffId = record.staffId;
				const staff = record.staff || {};
				if (!grouped[staffId]) {
					grouped[staffId] = {
						staff: {
							id: staffId,
							firstName: staff.firstName || '',
							lastName: staff.lastName || '',
							department: staff.department || '',
							position: staff.position || '',
						},
						attendance: {},
					};
				}
				// Get the date of the record
				const recordDate = record.date || (record.signInAt ? format(new Date(record.signInAt), 'yyyy-MM-dd') : null);
				if (recordDate) {
					grouped[staffId].attendance[recordDate] = {
						id: record.id,
						signInAt: record.signInAt,
						signOutAt: record.signOutAt,
						status: record.status,
						method: record.method,
					};
				}
			});
			setGroupedData(grouped);
			setPagination((prev) => ({
				...prev,
				total: Object.keys(grouped).length,
				page: 1, // Reset to first page when data changes
			}));
		}
	}, [data]);

	// Calculate paginated staff data
	const paginatedStaffData = useMemo(() => {
		const staffArray = Object.values(groupedData);
		const startIndex = (pagination.page - 1) * pagination.pageSize;
		const endIndex = startIndex + pagination.pageSize;
		return staffArray.slice(startIndex, endIndex);
	}, [groupedData, pagination.page, pagination.pageSize]);

	// Format time for display
	const formatTime = (isoString) => {
		if (!isoString) return '--:--';
		try {
			return new Date(isoString).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			});
		} catch (error) {
			return '--:--';
		}
	};

	// Get status chip
	const getStatusChip = (status) => {
		const config = {
			PRESENT: { color: '#10b981', label: 'P' },
			LATE: { color: '#f59e0b', label: 'L' },
			ABSENT: { color: '#ef4444', label: 'A' },
			HALF_DAY: { color: '#8b5cf6', label: 'H' },
			default: { color: '#6b7280', label: '-' },
		};

		const { color, label } = config[status] || config.default;

		return (
			<Chip
				label={label}
				size="small"
				sx={{
					width: 24,
					height: 24,
					bgcolor: `${color}20`,
					color: color,
					fontWeight: 700,
					fontSize: '0.7rem',
				}}
			/>
		);
	};

	// Handle week navigation
	const handlePreviousWeek = () => {
		const newWeek = subWeeks(date, 1);
		onWeekChange(newWeek);
	};

	const handleNextWeek = () => {
		const newWeek = addWeeks(date, 1);
		onWeekChange(newWeek);
	};

	const handleToday = () => {
		onTodayClick();
	};

	// Handle day click
	const handleDayClick = (day) => {
		onDateChange(day);
	};

	if (!data || data.length === 0) {
		return (
			<Paper
				elevation={0}
				sx={{
					p: 6,
					borderRadius: 2,
					bgcolor: '#162033',
					minHeight: 400,
					border: '1px solid rgba(255,255,255,0.08)',
					textAlign: 'center',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					alignItems: 'center',
				}}>
				<ViewWeekIcon sx={{ fontSize: 64, mb: 2, color: 'rgba(255,255,255,0.1)' }} />
				<Typography
					variant="h6"
					sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
					No weekly attendance data
				</Typography>
				<Typography
					variant="body2"
					sx={{ color: 'rgba(255,255,255,0.4)' }}>
					Weekly attendance data will be displayed here.
				</Typography>
			</Paper>
		);
	}

	return (
		<Paper
			elevation={0}
			sx={{
				borderRadius: 2,
				bgcolor: '#162033',
				border: '1px solid rgba(255,255,255,0.08)',
				overflow: 'hidden',
			}}>
			{/* Weekly Header */}
			<Box sx={{ p: 3, bgcolor: 'rgba(30, 41, 59, 0.5)' }}>
				<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
					<Typography
						variant="h5"
						sx={{ color: '#fff', fontWeight: 600 }}>
						Week of {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
					</Typography>
					<Stack
						direction="row"
						spacing={1}>
						<IconButton
							onClick={handlePreviousWeek}
							size="small"
							sx={{ color: 'rgba(255,255,255,0.7)' }}>
							<ChevronLeftIcon />
						</IconButton>
						<IconButton
							onClick={handleToday}
							size="small"
							sx={{ color: 'rgba(255,255,255,0.7)' }}>
							<TodayIcon />
						</IconButton>
						<IconButton
							onClick={handleNextWeek}
							size="small"
							sx={{ color: 'rgba(255,255,255,0.7)' }}>
							<ChevronRightIcon />
						</IconButton>
					</Stack>
				</Box>

				{/* Week Summary */}
				<Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
					<Chip
						label={`Total Records: ${data.length}`}
						size="small"
						sx={{ bgcolor: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa' }}
					/>
					<Chip
						label={`Average Attendance: ${Math.round((data.filter((d) => d.status === 'PRESENT' || d.status === 'LATE').length / data.length) * 100)}%`}
						size="small"
						sx={{ bgcolor: 'rgba(74, 222, 128, 0.1)', color: '#4ade80' }}
					/>
				</Box>
			</Box>

			{/* Week Days Header */}
			<Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
				<Stack
					direction="row"
					spacing={1}
					justifyContent="space-between">
					{weekDays.map((day, index) => {
						const isTodayDate = isToday(day);
						const isSelected = isSameDay(day, selectedDate);

						return (
							<Button
								key={index}
								variant="outlined"
								onClick={() => handleDayClick(day)}
								sx={{
									'flex': 1,
									'py': 1.5,
									'borderRadius': 1,
									'borderColor': isSelected ? '#2196f3' : isTodayDate ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255,255,255,0.1)',
									'bgcolor': isSelected ? 'rgba(33, 150, 243, 0.1)' : isTodayDate ? 'rgba(251, 191, 36, 0.05)' : 'transparent',
									'color': isSelected ? '#2196f3' : isTodayDate ? '#fbbf24' : 'rgba(255,255,255,0.7)',
									'&:hover': {
										borderColor: isSelected ? '#2196f3' : 'rgba(255,255,255,0.2)',
										bgcolor: isSelected ? 'rgba(33, 150, 243, 0.2)' : 'rgba(255,255,255,0.05)',
									},
								}}>
								<Box sx={{ textAlign: 'center' }}>
									<Typography
										variant="caption"
										sx={{ display: 'block', fontWeight: 600 }}>
										{format(day, 'EEE')}
									</Typography>
									<Typography
										variant="body2"
										sx={{ fontWeight: isTodayDate ? 700 : 500 }}>
										{format(day, 'd')}
									</Typography>
									{isTodayDate && (
										<Box
											sx={{
												width: 4,
												height: 4,
												borderRadius: '50%',
												bgcolor: '#fbbf24',
												mx: 'auto',
												mt: 0.5,
											}}
										/>
									)}
								</Box>
							</Button>
						);
					})}
				</Stack>
			</Box>

			{/* Weekly Table */}
			<TableContainer>
				<Table>
					<TableHead>
						<TableRow sx={{ bgcolor: 'rgba(30, 41, 59, 0.3)' }}>
							<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, minWidth: 200 }}>Staff</TableCell>
							{weekDays.map((day, index) => (
								<TableCell
									key={index}
									align="center"
									sx={{
										color: 'rgba(255,255,255,0.7)',
										fontWeight: 600,
										borderLeft: '1px solid rgba(255,255,255,0.1)',
										minWidth: 100,
									}}>
									<Box sx={{ textAlign: 'center' }}>
										<Typography
											variant="caption"
											sx={{ color: 'rgba(255,255,255,0.5)' }}>
											{format(day, 'EEE')}
										</Typography>
										<Typography variant="body2">{format(day, 'd')}</Typography>
									</Box>
								</TableCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{paginatedStaffData.map((staffData, staffIndex) => (
							<TableRow
								key={staffData.staff.id || staffIndex}
								sx={{
									'bgcolor': '#0f172a',
									'&:hover': { bgcolor: '#1a2332' },
								}}>
								<TableCell sx={{ py: 2 }}>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
										<Box
											sx={{
												width: 32,
												height: 32,
												borderRadius: '50%',
												bgcolor: 'rgba(33, 150, 243, 0.1)',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
											}}>
											<PersonIcon sx={{ fontSize: 16, color: '#2196f3' }} />
										</Box>
										<Box>
											<Typography sx={{ color: '#fff', fontWeight: 500, fontSize: '0.9rem' }}>
												{staffData.staff.firstName} {staffData.staff.lastName}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: 'rgba(255,255,255,0.5)' }}>
												{staffData.staff.department}
											</Typography>
										</Box>
									</Box>
								</TableCell>

								{weekDays.map((day, dayIndex) => {
									const dayStr = format(day, 'yyyy-MM-dd');
									const attendance = staffData.attendance[dayStr];

									return (
										<TableCell
											key={dayIndex}
											align="center"
											sx={{
												py: 2,
												borderLeft: '1px solid rgba(255,255,255,0.1)',
											}}>
											{attendance ? (
												<Stack
													spacing={0.5}
													alignItems="center">
													{getStatusChip(attendance.status)}
													<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
														<AccessTimeIcon sx={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
														<Typography
															variant="caption"
															sx={{ color: 'rgba(255,255,255,0.6)' }}>
															{formatTime(attendance.signInAt)}
														</Typography>
													</Box>
													{attendance.signOutAt && (
														<Typography
															variant="caption"
															sx={{ color: 'rgba(255,255,255,0.4)' }}>
															{formatTime(attendance.signOutAt)}
														</Typography>
													)}
												</Stack>
											) : (
												<Typography
													variant="caption"
													sx={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
													-
												</Typography>
											)}
										</TableCell>
									);
								})}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>

			{/* Pagination */}
			<Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
				<Pagination
					count={Math.ceil(pagination.total / pagination.pageSize) || 1}
					page={pagination.page}
					onChange={(_, page) => setPagination((prev) => ({ ...prev, page }))}
					color="primary"
					sx={{
						'& .MuiPaginationItem-root': { color: '#fff' },
						'& .Mui-selected': { bgcolor: '#2196f3' },
					}}
				/>
			</Box>
		</Paper>
	);
};

export default WeeklyView;
