import React, { useState, useEffect, useMemo } from 'react';
import { Paper, Typography, Box, Grid, Chip, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Pagination } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import PersonIcon from '@mui/icons-material/Person';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';

const MonthlyView = ({
	data,
	date, // Current month to display
	selectedDate, // Currently selected date (for highlighting)
	onDateChange, // Called when a date is clicked
	onMonthChange, // Called when month navigation happens
	onTodayClick, // Called when Today button is clicked
	companyId,
}) => {
	// Pagination state
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 5,
		total: 0,
	});

	// Use props directly instead of local state for month
	const currentMonth = date;

	// Get month start and end
	const monthStart = startOfMonth(currentMonth);
	const monthEnd = endOfMonth(currentMonth);
	// const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
	// const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 }); // Sunday

	// // Generate calendar days
	// const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
	const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

	// Group data by date for quick lookup
	const [attendanceByDate, setAttendanceByDate] = useState({});

	// useEffect(() => {
	// 	if (data && Array.isArray(data)) {
	// 		const grouped = {};
	// 		data.forEach((record) => {
	// 			const recordDate = record.date || (record.signInAt ? format(new Date(record.signInAt), 'yyyy-MM-dd') : null);
	// 			if (recordDate) {
	// 				if (!grouped[recordDate]) {
	// 					grouped[recordDate] = [];
	// 				}
	// 				grouped[recordDate].push(record);
	// 			}
	// 		});
	// 		setAttendanceByDate(grouped);
	// 	}
	// }, [data]);
	useEffect(() => {
		if (data && Array.isArray(data)) {
			const grouped = {};
			data.forEach((record) => {
				const recordDate = record.date || (record.signInAt ? format(new Date(record.signInAt), 'yyyy-MM-dd') : null);
				if (recordDate) {
					if (!grouped[recordDate]) {
						grouped[recordDate] = [];
					}
					grouped[recordDate].push(record);
				}
			});
			setAttendanceByDate(grouped);
		}
	}, [data]);

	// Update pagination total when selected date changes
	// useEffect(() => {
	// 	const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
	// 	const records = attendanceByDate[selectedDateStr] || [];
	// 	setPagination((prev) => ({
	// 		...prev,
	// 		total: records.length,
	// 		page: 1, // Reset to first page when date changes
	// 	}));
	// }, [selectedDate, attendanceByDate]);
	useEffect(() => {
		const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
		const records = attendanceByDate[selectedDateStr] || [];
		setPagination((prev) => ({
			...prev,
			total: records.length,
			page: 1, // Reset to first page when date changes
		}));
	}, [selectedDate, attendanceByDate]);

	// Get paginated records for selected date
	const paginatedSelectedDateRecords = useMemo(() => {
		const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
		const records = attendanceByDate[selectedDateStr] || [];
		const startIndex = (pagination.page - 1) * pagination.pageSize;
		const endIndex = startIndex + pagination.pageSize;
		return records.slice(startIndex, endIndex);
	}, [selectedDate, attendanceByDate, pagination.page, pagination.pageSize]);

	// Calculate attendance stats for a specific date
	const getDateStats = (date) => {
		const dateStr = format(date, 'yyyy-MM-dd');
		const records = attendanceByDate[dateStr] || [];

		return {
			total: records.length,
			present: records.filter((r) => r.status === 'PRESENT').length,
			late: records.filter((r) => r.status === 'LATE').length,
			absent: records.filter((r) => r.status === 'ABSENT').length,
		};
	};

	// Navigate to previous month
	const handlePreviousMonth = () => {
		const newMonth = subMonths(currentMonth, 1);
		onMonthChange(newMonth);
	};

	// Navigate to next month
	const handleNextMonth = () => {
		const newMonth = addMonths(currentMonth, 1);
		onMonthChange(newMonth);
	};

	// Go to today
	const handleToday = () => {
		onTodayClick();
	};

	// Handle date click
	const handleDateClick = (day) => {
		onDateChange(day);
	};

	// Day names for calendar header
	const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
				<CalendarMonthIcon sx={{ fontSize: 64, mb: 2, color: 'rgba(255,255,255,0.1)' }} />
				<Typography
					variant="h6"
					sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
					No monthly attendance data
				</Typography>
				<Typography
					variant="body2"
					sx={{ color: 'rgba(255,255,255,0.4)' }}>
					Monthly attendance data will be displayed here.
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
			{/* Calendar Header */}
			<Box sx={{ p: 3, bgcolor: 'rgba(30, 41, 59, 0.5)' }}>
				<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
					<Typography
						variant="h5"
						sx={{ color: '#fff', fontWeight: 600 }}>
						{format(currentMonth, 'MMMM yyyy')}
					</Typography>
					<Stack
						direction="row"
						spacing={1}>
						<IconButton
							onClick={handlePreviousMonth}
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
							onClick={handleNextMonth}
							size="small"
							sx={{ color: 'rgba(255,255,255,0.7)' }}>
							<ChevronRightIcon />
						</IconButton>
					</Stack>
				</Box>

				{/* Quick Stats */}
				<Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
					<Chip
						label={`Total: ${data.length}`}
						size="small"
						sx={{ bgcolor: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa' }}
					/>
					<Chip
						label={`Present: ${data.filter((d) => d.status === 'PRESENT').length}`}
						size="small"
						sx={{ bgcolor: 'rgba(74, 222, 128, 0.1)', color: '#4ade80' }}
					/>
					<Chip
						label={`Late: ${data.filter((d) => d.status === 'LATE').length}`}
						size="small"
						sx={{ bgcolor: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}
					/>
					<Chip
						label={`Absent: ${data.filter((d) => d.status === 'ABSENT').length}`}
						size="small"
						sx={{ bgcolor: 'rgba(248, 113, 113, 0.1)', color: '#f87171' }}
					/>
				</Box>
			</Box>

			{/* Calendar Grid */}
			<Box sx={{ p: 2 }}>
				{/* Day Headers */}
				<Grid
					container
					spacing={0.5}
					sx={{ mb: 1 }}>
					{dayNames.map((day) => (
						<Grid
							item
							xs
							key={day}>
							<Box
								sx={{
									textAlign: 'center',
									py: 1,
									color: 'rgba(255,255,255,0.5)',
									fontSize: '0.875rem',
									fontWeight: 600,
								}}>
								{day}
							</Box>
						</Grid>
					))}
				</Grid>

				{/* Calendar Days */}

				<Grid
					container
					spacing={0.5}>
					{monthDays.map((day, index) => {
						const isSelected = isSameDay(day, selectedDate);
						const isTodayDate = isToday(day);
						const stats = getDateStats(day);
						const hasAttendance = stats.total > 0;

						return (
							<Grid
								item
								xs={12 / 7}
								key={index}>
								<Box
									onClick={() => handleDateClick(day)}
									sx={{
										'minHeight': 100,
										'p': 1,
										'borderRadius': 1,
										'border': isSelected ? '2px solid #2196f3' : '1px solid rgba(255,255,255,0.08)',
										'bgcolor': isSelected ? 'rgba(33, 150, 243, 0.1)' : isTodayDate ? 'rgba(251, 191, 36, 0.05)' : 'rgba(255,255,255,0.02)',
										'cursor': 'pointer',
										'transition': 'all 0.2s',
										'&:hover': {
											bgcolor: 'rgba(255,255,255,0.05)',
											transform: 'translateY(-2px)',
										},
									}}>
									{/* Rest of your date cell content remains the same */}
									<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
										<Typography
											variant="body2"
											sx={{
												color: isTodayDate ? '#fbbf24' : '#fff',
												fontWeight: isTodayDate ? 700 : 500,
											}}>
											{format(day, 'd')}
										</Typography>
										{isTodayDate && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#fbbf24' }} />}
									</Box>

									{hasAttendance && (
										<Stack spacing={0.5}>
											{stats.present > 0 && (
												<Box
													sx={{
														height: 4,
														borderRadius: 1,
														bgcolor: '#10b981',
														width: `${Math.min((stats.present / stats.total) * 100, 100)}%`,
													}}
												/>
											)}
											{stats.late > 0 && (
												<Box
													sx={{
														height: 4,
														borderRadius: 1,
														bgcolor: '#f59e0b',
														width: `${Math.min((stats.late / stats.total) * 100, 100)}%`,
													}}
												/>
											)}
											{stats.absent > 0 && (
												<Box
													sx={{
														height: 4,
														borderRadius: 1,
														bgcolor: '#ef4444',
														width: `${Math.min((stats.absent / stats.total) * 100, 100)}%`,
													}}
												/>
											)}

											{hasAttendance && (
												<Typography
													variant="caption"
													sx={{ display: 'block', mt: 0.5, color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>
													{stats.present}/{stats.total}
												</Typography>
											)}
										</Stack>
									)}
								</Box>
							</Grid>
						);
					})}
				</Grid>
			</Box>

			{/* Selected Date Details */}
			<Box sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
				<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
					<Typography
						variant="h6"
						sx={{ color: '#fff' }}>
						Attendance for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
					</Typography>
					{pagination.total > 0 && (
						<Typography
							variant="body2"
							sx={{ color: 'rgba(255,255,255,0.6)' }}>
							Showing {(pagination.page - 1) * pagination.pageSize + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}{' '}
							records
						</Typography>
					)}
				</Box>

				{attendanceByDate[format(selectedDate, 'yyyy-MM-dd')] ? (
					<>
						<TableContainer>
							<Table size="small">
								<TableHead>
									<TableRow>
										<TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Staff</TableCell>
										<TableCell
											sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}
											align="center">
											Status
										</TableCell>
										<TableCell
											sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}
											align="center">
											Sign In
										</TableCell>
										<TableCell
											sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}
											align="center">
											Sign Out
										</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{paginatedSelectedDateRecords.map((record, index) => (
										<TableRow
											key={index}
											sx={{
												'&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
											}}>
											<TableCell sx={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
												<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
													<Box
														sx={{
															width: 28,
															height: 28,
															borderRadius: '50%',
															bgcolor: 'rgba(33, 150, 243, 0.1)',
															display: 'flex',
															alignItems: 'center',
															justifyContent: 'center',
														}}>
														<PersonIcon sx={{ fontSize: 14, color: '#2196f3' }} />
													</Box>
													<Box>
														<Typography
															variant="body2"
															sx={{ fontWeight: 500 }}>
															{record.staff?.firstName} {record.staff?.lastName}
														</Typography>
														<Typography
															variant="caption"
															sx={{ color: 'rgba(255,255,255,0.5)' }}>
															{record.staff?.department}
														</Typography>
													</Box>
												</Box>
											</TableCell>
											<TableCell
												align="center"
												sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
												<Chip
													label={record.status}
													size="small"
													sx={{
														bgcolor: record.status === 'PRESENT' ? '#10b98120' : record.status === 'LATE' ? '#f59e0b20' : '#ef444420',
														color: record.status === 'PRESENT' ? '#10b981' : record.status === 'LATE' ? '#f59e0b' : '#ef4444',
														fontWeight: 600,
													}}
												/>
											</TableCell>
											<TableCell
												align="center"
												sx={{ color: '#fff', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
												{record.signInAt
													? new Date(record.signInAt).toLocaleTimeString([], {
															hour: '2-digit',
															minute: '2-digit',
															hour12: false,
													  })
													: '--:--'}
											</TableCell>
											<TableCell
												align="center"
												sx={{ color: '#fff', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
												{record.signOutAt
													? new Date(record.signOutAt).toLocaleTimeString([], {
															hour: '2-digit',
															minute: '2-digit',
															hour12: false,
													  })
													: '--:--'}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableContainer>

						{/* Pagination */}
						{pagination.total > pagination.pageSize && (
							<Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
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
						)}
					</>
				) : (
					<Typography
						variant="body2"
						sx={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
						No attendance records for this date
					</Typography>
				)}
			</Box>
		</Paper>
	);
};

export default MonthlyView;

// <Grid
// 		container
// 		spacing={0.5}>
// 		{calendarDays.map((day, index) => {
// 			const isCurrentMonth = isSameMonth(day, currentMonth);
// 			const isSelected = isSameDay(day, selectedDate);
// 			const isTodayDate = isToday(day);
// 			const stats = getDateStats(day);
// 			const hasAttendance = stats.total > 0;

// 			return (
// 				<Grid
// 					item
// 					xs
// 					key={index}>
// 					<Box
// 						onClick={() => handleDateClick(day)}
// 						sx={{
// 							'minHeight': 100,
// 							'p': 1,
// 							'borderRadius': 1,
// 							'border': isSelected ? '2px solid #2196f3' : '1px solid rgba(255,255,255,0.08)',
// 							'bgcolor': isSelected ? 'rgba(33, 150, 243, 0.1)' : isTodayDate ? 'rgba(251, 191, 36, 0.05)' : 'rgba(255,255,255,0.02)',
// 							'cursor': 'pointer',
// 							'opacity': isCurrentMonth ? 1 : 0.4,
// 							'transition': 'all 0.2s',
// 							'&:hover': {
// 								bgcolor: 'rgba(255,255,255,0.05)',
// 								transform: 'translateY(-2px)',
// 							},
// 						}}>
// 						{/* Date Number */}
// 						<Box
// 							sx={{
// 								display: 'flex',
// 								justifyContent: 'space-between',
// 								alignItems: 'center',
// 								mb: 0.5,
// 							}}>
// 							<Typography
// 								variant="body2"
// 								sx={{
// 									color: isTodayDate ? '#fbbf24' : isCurrentMonth ? '#fff' : 'rgba(255,255,255,0.4)',
// 									fontWeight: isTodayDate ? 700 : 500,
// 								}}>
// 								{format(day, 'd')}
// 							</Typography>
// 							{isTodayDate && (
// 								<Box
// 									sx={{
// 										width: 6,
// 										height: 6,
// 										borderRadius: '50%',
// 										bgcolor: '#fbbf24',
// 									}}
// 								/>
// 							)}
// 						</Box>

// 						{/* Attendance Indicators */}
// {
// 	hasAttendance && (
// 		<Stack spacing={0.5}>
// 			{stats.present > 0 && (
// 				<Box
// 					sx={{
// 						height: 4,
// 						borderRadius: 1,
// 						bgcolor: '#10b981',
// 						width: `${Math.min((stats.present / stats.total) * 100, 100)}%`,
// 					}}
// 				/>
// 			)}
// 			{stats.late > 0 && (
// 				<Box
// 					sx={{
// 						height: 4,
// 						borderRadius: 1,
// 						bgcolor: '#f59e0b',
// 						width: `${Math.min((stats.late / stats.total) * 100, 100)}%`,
// 					}}
// 				/>
// 			)}
// 			{stats.absent > 0 && (
// 				<Box
// 					sx={{
// 						height: 4,
// 						borderRadius: 1,
// 						bgcolor: '#ef4444',
// 						width: `${Math.min((stats.absent / stats.total) * 100, 100)}%`,
// 					}}
// 				/>
// 			)}
// 		</Stack>
// 	);
// }

// {
// 	/* Quick Stats */
// }
// {
// 	hasAttendance && (
// 		<Typography
// 			variant="caption"
// 			sx={{
// 				display: 'block',
// 				mt: 0.5,
// 				color: 'rgba(255,255,255,0.6)',
// 				fontSize: '0.7rem',
// 			}}>
// 			{stats.present}/{stats.total}
// 		</Typography>
// 	);
// }
// 					</Box>
// 				</Grid>
// 			);
// 		})}
// 	</Grid>
