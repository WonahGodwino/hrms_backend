import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Stack, Chip, CircularProgress, Alert, Snackbar } from '@mui/material';
import { useAuth } from '@/lib/context/AuthContext';
import AddIcon from '@mui/icons-material/Add';
import Tooltip from '@mui/material/Tooltip';
import LeaveApplicationModal from '@/pages/leave/modals/leaveApplicationModal';
import StaffDashboard from '@/pages/leave/leaveStaffDashboard';
import LeaveHRDashboard from '@/pages/leave/leaveHRdashboard';

export default function LeaveDashboard() {
	const { user } = useAuth();
	const role = user?.role || 'STAFF';
	const navigate = useNavigate();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [data, setData] = useState({
		balance: { available: 14, pending: 3, used: 7, carriedOver: 2 },
		upcomingLeaves: [{}],
		recentRequests: [{}],
		pendingApprovals: [{}],
		leaveHistory: [],
		teamStats: { totalPending: 8, onLeaveToday: 4, upcomingNextWeek: 12, overdue: 1 },
		stats: {
			availableLeave: 21,
			requests: 3,
			currentLeave: {
				status: 'On Leave',
				startDate: 'Mar 10, 2026',
				endDate: 'Mar 14, 2026',
				days: 5,
				type: 'Annual',
			},
			upcomingLeave: {
				status: 'Upcoming Leave',
				startDate: 'Oct 8, 2026',
				endDate: null,
				days: 2,
				type: 'Annual',
			},
			annualLeaveTaken: 1100,
			activeLeave: 5,
		},
		warnings: ['Advance notice required: 2 days', 'Maximum consecutive days: 21'],
	});
	const [applyModalOpen, setApplyModalOpen] = useState(false);

	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

	const isStaff = role === 'STAFF';
	const isHr = role === 'HR';
	const isApprover = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role);

	useEffect(() => {
		// Simulate API fetch
		setTimeout(() => {
			setLoading(false);
			// In real code → replace with actual fetch
		}, 1200);
	}, []);

	const handleApply = () => {
		setApplyModalOpen(true);
	};

	const handleSnackbarClose = () => setSnackbar({ ...snackbar, open: false });

	if (loading) {
		return (
			<Box
				sx={{
					minHeight: '80vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					animation: 'bounce-in 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
					...animations,
				}}>
				<Stack
					alignItems="center"
					spacing={2}>
					<CircularProgress
						size={60}
						sx={{
							color: '#2196f3',
							animation: 'pulse-glow 2s infinite',
							...animations,
						}}
					/>
					<Typography
						sx={{
							color: 'white',
							animation: 'color-wave 3s infinite',
							...animations,
						}}>
						Loading your dashboard...
					</Typography>
				</Stack>
			</Box>
		);
	}

	return (
		<Box
			component="main"
			sx={{
				width: '100%',
				minHeight: '100vh',
				bgcolor: '#0a1929',
				px: { xs: 2, sm: 4, md: 6 },
				py: 4,
				animation: 'slide-in-blurred 0.6s cubic-bezier(0.23, 1, 0.32, 1)',
				...animations,
			}}>
			{/* Header with float animation */}
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				justifyContent="space-between"
				alignItems={{ xs: 'flex-start', sm: 'center' }}
				spacing={2}
				sx={{
					'mb': 4,
					'&:hover': {
						'& .MuiTypography-root': {
							animation: 'float 3s ease-in-out infinite',
							...animations,
						},
					},
				}}>
				<Typography
					variant="h4"
					fontWeight={700}
					color="white"
					sx={{
						'position': 'relative',
						'&::after': {
							content: '""',
							position: 'absolute',
							bottom: -8,
							left: 0,
							width: '60px',
							height: '4px',
							background: 'linear-gradient(90deg, #2196f3, #64b5f6, #2196f3)',
							borderRadius: '2px',
							animation: 'shimmer 2s infinite',
							...animations,
						},
					}}>
					Leave Dashboard
					{isApprover && (
						<Chip
							label="Team View"
							size="small"
							color="primary"
							sx={{
								'ml': 2,
								'bgcolor': '#2196f3',
								'color': 'white',
								'animation': 'pulse-glow 2s infinite',
								...animations,
								'&:hover': {
									transform: 'scale(1.1) rotate(2deg)',
									transition: 'transform 0.3s ease',
								},
							}}
						/>
					)}
				</Typography>

				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						alignItems: { sm: 'center' },
						justifyContent: { sm: 'flex-end' },
						gap: 2,
						width: { xs: '100%', md: 'auto' },
					}}>
					{['HR', 'ADMIN', 'STAFF', 'SUPER_ADMIN'].includes(role) && (
						<Tooltip title="Apply for leave">
							<Button
								variant="contained"
								startIcon={<AddIcon sx={{ transition: 'transform 0.3s ease' }} />}
								onClick={handleApply}
								sx={{
									'height': 40,
									'px': 2,
									'borderRadius': 1,
									'backgroundColor': '#2196f3',
									'color': '#ffffff',
									'fontWeight': 700,
									'textTransform': 'none',
									'letterSpacing': '0.015em',
									'boxShadow': 'none',
									'position': 'relative',
									'overflow': 'hidden',
									'&::before': {
										content: '""',
										position: 'absolute',
										top: '50%',
										left: '50%',
										width: 0,
										height: 0,
										borderRadius: '50%',
										background: 'rgba(255,255,255,0.3)',
										transform: 'translate(-50%, -50%)',
										transition: 'width 0.6s ease, height 0.6s ease',
									},
									'&:hover': {
										'backgroundColor': '#1976d2',
										'boxShadow': 'none',
										'transform': 'scale(1.02) translateY(-2px)',
										'transition': 'all 0.3s ease',
										'& .MuiSvgIcon-root': {
											transform: 'rotate(90deg) scale(1.2)',
										},
										'&::before': {
											width: '200px',
											height: '200px',
										},
									},
								}}>
								Apply for Leave
							</Button>
						</Tooltip>
					)}
				</Box>
			</Stack>

			{error && (
				<Alert
					severity="error"
					sx={{
						'mb': 3,
						'animation': 'shake 0.5s ease-in-out',
						...animations,
						'@keyframes shake': {
							'0%, 100%': { transform: 'translateX(0)' },
							'10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
							'20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
						},
					}}
					onClose={() => setError('')}>
					{error}
				</Alert>
			)}

			{/* Main Content with staggered animation */}
			<Box
				sx={{
					animation: 'slide-in-blurred 0.8s cubic-bezier(0.23, 1, 0.32, 1)',
					...animations,
				}}>
				{isStaff ? (
					<StaffDashboard
						balance={data.balance}
						policy={data.policy}
						upcomingLeave={data.stats.upcomingLeave}
						stats={data.stats}
						totalRequests={1240}
						onApplyLeave={handleApply}
						onViewLeaveDetails={(leave) => {
							console.log('View details:', leave);
						}}
						onSearch={(type, value) => {
							console.log('Search:', type, value);
						}}
						onFilterChange={(type, value) => {
							console.log('Filter:', type, value);
						}}
					/>
				) : (
					<LeaveHRDashboard
						role={role}
						teamStats={data.teamStats}
						pendingApprovals={data.pendingApprovals}
					/>
				)}
			</Box>

			{/* Global Snackbar with bounce animation */}
			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={handleSnackbarClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				sx={{
					'& .MuiPaper-root': {
						animation: 'bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
						...animations,
					},
				}}>
				<Alert
					onClose={handleSnackbarClose}
					severity={snackbar.severity}
					sx={{ width: '100%' }}>
					{snackbar.message}
				</Alert>
			</Snackbar>

			<LeaveApplicationModal
				open={applyModalOpen}
				onClose={() => setApplyModalOpen(false)}
				onSuccess={(submittedData) => {
					setSnackbar({
						open: true,
						message: `Leave submitted! Reference: ${submittedData.referenceNumber}`,
						severity: 'success',
					});
				}}
			/>
		</Box>
	);
}

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
