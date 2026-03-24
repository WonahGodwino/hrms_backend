import React from 'react';
import { Box, Paper, Typography, Stack } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TodayIcon from '@mui/icons-material/Today';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

const SummaryCards = ({ stats, loading, role, userData }) => {
	// Determine if user is STAFF or ADMIN/HR
	const isStaff = role === 'STAFF';

	// Cards for ADMIN/HR view
	const adminCards = [
		{
			title: 'Total Staff',
			value: stats.total,
			icon: <PeopleIcon sx={{ fontSize: 24 }} />,
			color: '#60a5fa',
			bgColor: 'rgba(96, 165, 250, 0.1)',
		},
		{
			title: 'Present',
			value: stats.present,
			icon: <CheckCircleIcon sx={{ fontSize: 24 }} />,
			color: '#4ade80',
			bgColor: 'rgba(74, 222, 128, 0.1)',
		},
		{
			title: 'Absent',
			value: stats.absent,
			icon: <CancelIcon sx={{ fontSize: 24 }} />,
			color: '#f87171',
			bgColor: 'rgba(248, 113, 113, 0.1)',
		},
		{
			title: 'Late',
			value: stats.late,
			icon: <ScheduleIcon sx={{ fontSize: 24 }} />,
			color: '#fbbf24',
			bgColor: 'rgba(251, 191, 36, 0.1)',
		},
	];

	// Cards for STAFF view
	const staffCards = [
		{
			title: 'Today',
			value: stats.todayStatus || 'Not Checked In',
			icon: <TodayIcon sx={{ fontSize: 24 }} />,
			color: '#60a5fa',
			bgColor: 'rgba(96, 165, 250, 0.1)',
			isStatus: true,
		},
		{
			title: 'Hours This Week',
			value: stats.weeklyHours || '0h',
			icon: <AccessTimeIcon sx={{ fontSize: 24 }} />,
			color: '#4ade80',
			bgColor: 'rgba(74, 222, 128, 0.1)',
		},
		{
			title: 'Monthly Attendance',
			value: stats.monthlyAttendance || '0%',
			icon: <CalendarMonthIcon sx={{ fontSize: 24 }} />,
			color: '#fbbf24',
			bgColor: 'rgba(251, 191, 36, 0.1)',
		},
		{
			title: 'On Time Rate',
			value: stats.onTimeRate || '0%',
			icon: <TrendingUpIcon sx={{ fontSize: 24 }} />,
			color: '#8b5cf6',
			bgColor: 'rgba(139, 92, 246, 0.1)',
		},
	];

	// Choose which cards to display based on role
	const cards = isStaff ? staffCards : adminCards;

	// Loading state with skeleton animations
	if (loading) {
		return (
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={2}
				sx={{ mb: 3 }}>
				{[1, 2, 3, 4].map((_, index) => (
					<Paper
						key={index}
						elevation={0}
						sx={{
							flex: 1,
							p: 3,
							borderRadius: 2,
							bgcolor: '#162033',
							border: '1px solid rgba(255,255,255,0.08)',
							minWidth: { xs: '100%', sm: 0 },
							animation: `pulse-glow 2s infinite`,
							...pageAnimations,
						}}>
						<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
							<Skeleton
								variant="rounded"
								width={48}
								height={48}
								sx={{
									bgcolor: 'rgba(255,255,255,0.1)',
									mb: 2,
									borderRadius: 2,
									animation: 'shimmer 2s infinite',
									...pageAnimations,
								}}
							/>
							<Skeleton
								variant="text"
								width={80}
								height={32}
								sx={{
									bgcolor: 'rgba(255,255,255,0.1)',
									mb: 0.5,
									animation: 'shimmer 2s infinite',
									...pageAnimations,
								}}
							/>
							<Skeleton
								variant="text"
								width={60}
								height={20}
								sx={{
									bgcolor: 'rgba(255,255,255,0.1)',
									animation: 'shimmer 2s infinite',
									...pageAnimations,
								}}
							/>
						</Box>
					</Paper>
				))}
			</Stack>
		);
	}

	return (
		<Stack
			direction={{ xs: 'column', sm: 'row' }}
			spacing={2}
			sx={{ mb: 3 }}>
			{cards.map((card, index) => (
				<Paper
					key={index}
					elevation={0}
					sx={{
						'flex': 1,
						'p': 3,
						'borderRadius': 2,
						'bgcolor': '#162033',
						'border': '1px solid rgba(255,255,255,0.08)',
						'display': 'flex',
						'flexDirection': 'column',
						'alignItems': 'center',
						'textAlign': 'center',
						'minWidth': { xs: '100%', sm: 0 },
						'animation': `slideInUp 0.5s ease-out ${index * 0.1}s both`,
						'transition': 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
						'position': 'relative',
						'overflow': 'hidden',
						'&::before': {
							content: '""',
							position: 'absolute',
							top: 0,
							left: '-100%',
							width: '100%',
							height: '100%',
							background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
							transition: 'left 0.5s ease',
						},
						'&:hover': {
							'transform': 'translateY(-8px) scale(1.02)',
							'boxShadow': '0 12px 24px rgba(0,0,0,0.3)',
							'borderColor': card.color,
							'&::before': {
								left: '100%',
							},
							'& .card-icon': {
								transform: 'scale(1.1) rotate(5deg)',
							},
							'& .card-value': {
								color: card.color,
							},
						},
						...pageAnimations,
					}}>
					{/* Icon Container with animation */}
					<Box
						className="card-icon"
						sx={{
							'width': 48,
							'height': 48,
							'borderRadius': 2,
							'bgcolor': card.bgColor,
							'display': 'flex',
							'alignItems': 'center',
							'justifyContent': 'center',
							'mb': 2,
							'transition': 'all 0.3s ease',
							'animation': `float 3s ease-in-out ${index * 0.2}s infinite`,
							'&:hover': {
								animation: 'none',
							},
							...pageAnimations,
						}}>
						<Box
							sx={{
								color: card.color,
								transition: 'transform 0.3s ease',
							}}>
							{card.icon}
						</Box>
					</Box>

					{/* Value with hover effect */}
					<Typography
						className="card-value"
						variant="h3"
						fontWeight={isStaff ? 600 : 700}
						sx={{
							'color': '#fff',
							'mb': 0.5,
							'fontSize': isStaff ? '1.1rem' : '1.5rem',
							'transition': 'color 0.3s ease',
							'position': 'relative',
							'display': 'inline-block',
							'&::after': {
								content: '""',
								position: 'absolute',
								bottom: -2,
								left: '50%',
								transform: 'translateX(-50%)',
								width: 0,
								height: '2px',
								background: `linear-gradient(90deg, transparent, ${card.color}, transparent)`,
								transition: 'width 0.3s ease',
							},
							'&:hover::after': {
								width: '80%',
							},
						}}>
						{card.value}
					</Typography>

					{/* Title */}
					<Typography
						variant="body2"
						sx={{
							'color': 'rgba(255,255,255,0.6)',
							'transition': 'color 0.3s ease',
							'&:hover': {
								color: 'rgba(255,255,255,0.9)',
							},
						}}>
						{card.title}
					</Typography>

					{/* Status indicator for staff view */}
					{isStaff && card.isStatus && card.value !== 'Not Checked In' && (
						<Box
							sx={{
								mt: 1,
								px: 1.5,
								py: 0.5,
								borderRadius: 1,
								bgcolor: 'rgba(74, 222, 128, 0.1)',
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.5,
								animation: 'fadeIn 0.3s ease-out',
								...pageAnimations,
							}}>
							<Box
								sx={{
									width: 8,
									height: 8,
									borderRadius: '50%',
									bgcolor: '#4ade80',
									animation: 'pulse-glow 2s infinite',
									...pageAnimations,
								}}
							/>
							<Typography
								variant="caption"
								sx={{
									color: '#4ade80',
									fontWeight: 500,
								}}>
								Active
							</Typography>
						</Box>
					)}
				</Paper>
			))}
		</Stack>
	);
};

// Add default props
SummaryCards.defaultProps = {
	role: 'ADMIN', // Default to ADMIN view
	userData: null,
	stats: {
		total: 0,
		present: 0,
		absent: 0,
		late: 0,
		todayStatus: 'Not Checked In',
		weeklyHours: '0h',
		monthlyAttendance: '0%',
		onTimeRate: '0%',
	},
};

const pageAnimations = {
	'@keyframes slideInUp': {
		'0%': {
			transform: 'translateY(40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateY(0)',
			opacity: 1,
		},
	},
	'@keyframes slideInDown': {
		'0%': {
			transform: 'translateY(-40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateY(0)',
			opacity: 1,
		},
	},
	'@keyframes slideInLeft': {
		'0%': {
			transform: 'translateX(-40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0)',
			opacity: 1,
		},
	},
	'@keyframes slideInRight': {
		'0%': {
			transform: 'translateX(40px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0)',
			opacity: 1,
		},
	},
	'@keyframes fadeIn': {
		'0%': { opacity: 0 },
		'100%': { opacity: 1 },
	},
	'@keyframes scaleIn': {
		'0%': {
			transform: 'scale(0.9)',
			opacity: 0,
		},
		'100%': {
			transform: 'scale(1)',
			opacity: 1,
		},
	},
	'@keyframes float': {
		'0%': { transform: 'translateY(0px)' },
		'50%': { transform: 'translateY(-5px)' },
		'100%': { transform: 'translateY(0px)' },
	},
	'@keyframes pulse-glow': {
		'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
		'70%': { boxShadow: '0 0 0 10px rgba(33, 150, 243, 0)' },
		'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
	},
	'@keyframes shimmer': {
		'0%': { backgroundPosition: '-1000px 0' },
		'100%': { backgroundPosition: '1000px 0' },
	},
	'@keyframes shake': {
		'0%, 100%': { transform: 'translateX(0)' },
		'25%': { transform: 'translateX(-5px)' },
		'75%': { transform: 'translateX(5px)' },
	},
};

export default SummaryCards;
