// components/DateNavigator.jsx
import React from 'react';
import { Box, Button, Typography, Stack } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';

const DateNavigator = ({ selectedDate, onDateChange, view = 'day' }) => {
	const handlePrevious = () => {
		let newDate;
		switch (view) {
			case 'week':
				newDate = subWeeks(selectedDate, 1);
				break;
			case 'month':
				newDate = subMonths(selectedDate, 1);
				break;
			default:
				newDate = subDays(selectedDate, 1);
		}
		onDateChange(newDate);
	};

	const handleNext = () => {
		let newDate;
		switch (view) {
			case 'week':
				newDate = addWeeks(selectedDate, 1);
				break;
			case 'month':
				newDate = addMonths(selectedDate, 1);
				break;
			default:
				newDate = addDays(selectedDate, 1);
		}
		onDateChange(newDate);
	};

	const handleToday = () => {
		onDateChange(new Date());
	};

	const formatDisplayDate = () => {
		switch (view) {
			case 'week':
				const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
				const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
				return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
			case 'month':
				return format(selectedDate, 'MMMM yyyy');
			default:
				return format(selectedDate, 'EEEE, MMMM d, yyyy');
		}
	};

	return (
		<Stack
			direction={{ xs: 'column', sm: 'row' }}
			spacing={1}
			alignItems="center"
			sx={{ width: '100%' }}>
			{/* Navigation row for mobile - wraps appropriately */}
			<Stack
				direction="row"
				spacing={1}
				alignItems="center"
				sx={{ width: { xs: '100%', sm: 'auto', md: '100%' } }}>
				<Button
					variant="outlined"
					size="small"
					onClick={handlePrevious}
					sx={{
						'py': { xs: 0, md: 1.5 },
						'minWidth': { xs: 40, md: 50 },
						'borderColor': 'rgba(255,255,255,0.2)',
						'color': '#fff',
						'&:hover': {
							borderColor: 'rgba(255,255,255,0.3)',
						},
					}}>
					<ChevronLeftIcon />
				</Button>

				{/* Date display - responsive width */}
				<Box
					sx={{
						px: { xs: 1, sm: 2, md: 3 },
						py: 1,
						bgcolor: '#222b3f',
						borderRadius: 1,
						flex: { xs: 1, sm: '0 1 auto', md: '1 1 1' },
						minWidth: { xs: 'auto', sm: 220, md: '78%' },
						textAlign: 'center',
					}}>
					<Typography
						variant="subtitle1"
						sx={{
							color: '#fff',
							fontWeight: 600,
							fontSize: { xs: '0.9rem', sm: '1rem' },
						}}>
						{formatDisplayDate()}
					</Typography>
				</Box>

				<Button
					variant="outlined"
					size="small"
					onClick={handleNext}
					sx={{
						'py': { xs: 0, md: 1.5 },
						'minWidth': { xs: 40, md: 50 },
						'borderColor': 'rgba(255,255,255,0.2)',
						'color': '#fff',
						'&:hover': {
							borderColor: 'rgba(255,255,255,0.3)',
						},
					}}>
					<ChevronRightIcon />
				</Button>
			</Stack>

			{/* Today button - full width on mobile */}
			<Button
				variant="contained"
				size="small"
				onClick={handleToday}
				startIcon={<TodayIcon />}
				sx={{
					'py': { xs: 0, md: 1.5 },
					'width': { xs: '100%', sm: 'auto' },
					'bgcolor': '#334155',
					'color': '#fff',
					'&:hover': {
						bgcolor: '#475569',
					},
				}}>
				Today
			</Button>
		</Stack>
	);
};

export default DateNavigator;
