import { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { Box, IconButton, Badge, Avatar, Typography, Menu, MenuItem, ListItemIcon, ListItemText, Divider, Button, Tooltip, CircularProgress } from '@mui/material';
import { useAuth } from '@/lib/context/AuthContext';
import { getProfile } from '../../services/AuthService';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckIcon from '@mui/icons-material/Check';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import BusinessIcon from '@mui/icons-material/Business';

const Topbar = () => {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';
	const navigate = useNavigate();
	const { logout, currentCompany, companies, hasMultipleCompanies, switchCompany, initializing } = useAuth();

	// State for menus
	const [profileAnchorEl, setProfileAnchorEl] = useState(null);
	const [companyAnchorEl, setCompanyAnchorEl] = useState(null);

	const profileMenuOpen = Boolean(profileAnchorEl);
	const companyMenuOpen = Boolean(companyAnchorEl);

	// State for user info fetched from API
	const [userInfo, setUserInfo] = useState({ fullName: '', role: '' });

	// Fetch Profile Logic (Replicated from Sidebar.jsx)
	useEffect(() => {
		const fetchProfile = async () => {
			try {
				const res = await getProfile();
				const userProfile = res?.data;
				setUserInfo({
					fullName: `${userProfile.firstName} ${userProfile.lastName}`,
					role: userProfile.role,
				});
			} catch (error) {
				console.error('Failed to fetch profile:', error);
			}
		};
		fetchProfile();
	}, []);

	// Profile menu handlers
	const handleProfileMenuOpen = (event) => {
		setProfileAnchorEl(event.currentTarget);
	};

	const handleProfileMenuClose = () => {
		setProfileAnchorEl(null);
	};

	// Company menu handlers
	const handleCompanyMenuOpen = (event) => {
		setCompanyAnchorEl(event.currentTarget);
	};

	const handleCompanyMenuClose = () => {
		setCompanyAnchorEl(null);
	};

	const handleProfileClick = () => {
		handleProfileMenuClose();
		navigate('/settings/profile');
	};

	const handleLogout = () => {
		handleProfileMenuClose();
		if (logout) logout();
		navigate('/login');
	};

	const handleCompanySwitch = (company) => {
		switchCompany(company);
		handleCompanyMenuClose();
		// Optional: Navigate to company dashboard or reload current page
		// navigate(`/company/${company.id}/dashboard`);
	};

	// Sidebar background color variable
	const sidebarBg = `hsl(222, 47%, 11%)`;

	return (
		<Box
			display="flex"
			justifyContent="flex-end"
			alignItems="center"
			p={{ xs: 1, md: 2 }}
			sx={{
				backgroundColor: sidebarBg,
				borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
			}}>
			{/* LEFT SIDE - COMPANY SWITCHER */}
			<Box sx={{ mr: 'auto', display: 'flex', alignItems: 'center' }}>
				{!initializing && companies.length > 0 ? (
					<>
						<Tooltip title={companies.length > 1 ? 'Switch Company' : 'Current Company'}>
							<Button
								onClick={companies.length > 1 ? handleCompanyMenuOpen : undefined}
								startIcon={<BusinessIcon sx={{ color: '#e0e0e0' }} />}
								{...(companies.length > 1 && {
									endIcon: <SwapHorizIcon sx={{ color: '#e0e0e0', fontSize: 18 }} />,
								})}
								sx={{
									'color': '#e0e0e0',
									'textTransform': 'none',
									'cursor': companies.length > 1 ? 'pointer' : 'default',
									'&:hover':
										companies.length > 1
											? {
													backgroundColor: 'rgba(255, 255, 255, 0.08)',
											  }
											: {},
								}}>
								<Typography
									variant="body2"
									fontWeight="medium">
									{currentCompany?.name || companies[0]?.name || 'Select Company'}
								</Typography>
							</Button>
						</Tooltip>

						{/* Only show menu if there are multiple companies */}
						{hasMultipleCompanies && (
							<Menu
								anchorEl={companyAnchorEl}
								open={companyMenuOpen}
								onClose={handleCompanyMenuClose}
								anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
								transformOrigin={{ vertical: 'top', horizontal: 'left' }}
								PaperProps={{
									elevation: 0,
									sx: {
										'overflow': 'visible',
										'filter': 'drop-shadow(0px 2px 8px rgba(0,0,0,0.15))',
										'mt': 1.5,
										'minWidth': 240,
										'maxHeight': 350,
										'bgcolor': isDarkMode ? '#1f2a40' : '#ffffff',
										'color': isDarkMode ? '#e0e0e0' : '#141414',
										'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
										'& .MuiList-root': {
											maxHeight: 300,
											overflowY: 'auto',
											py: 0,
										},
									},
								}}
								MenuListProps={{
									sx: {
										maxHeight: 300,
										overflowY: 'auto',
									},
								}}>
								<Box sx={{ px: 2, py: 1, position: 'sticky', top: 0, bgcolor: isDarkMode ? '#1f2a40' : '#ffffff', zIndex: 1 }}>
									<Typography
										variant="caption"
										color="text.secondary">
										SWITCH COMPANY ({companies.length})
									</Typography>
								</Box>

								{companies.map((company) => (
									<MenuItem
										key={company.id}
										onClick={() => handleCompanySwitch(company)}
										sx={{
											justifyContent: 'space-between',
											bgcolor: company.id === currentCompany?.id ? (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)') : 'transparent',
										}}>
										<Box sx={{ display: 'flex', alignItems: 'center' }}>
											<ListItemIcon sx={{ minWidth: 36 }}>
												<BusinessIcon
													fontSize="small"
													sx={{ color: isDarkMode ? '#e0e0e0' : '#141414' }}
												/>
											</ListItemIcon>
											<ListItemText primary={company.name} />
										</Box>
										{company.id === currentCompany?.id && (
											<CheckIcon
												fontSize="small"
												sx={{ ml: 1 }}
											/>
										)}
									</MenuItem>
								))}
							</Menu>
						)}
					</>
				) : (
					// Loading state
					<Button
						disabled
						startIcon={<BusinessIcon sx={{ color: '#e0e0e0' }} />}
						endIcon={
							<CircularProgress
								size={16}
								sx={{ color: '#e0e0e0', ml: 1 }}
							/>
						}
						sx={{
							'color': '#e0e0e0',
							'textTransform': 'none',
							'opacity': 0.8,
							'&.Mui-disabled': {
								color: '#e0e0e0',
								opacity: 0.7,
							},
						}}
					/>
				)}
			</Box>

			{/* RIGHT SIDE - ICONS AND PROFILE */}
			<Box
				display="flex"
				alignItems="center"
				gap={1}>
				{/* Notifications */}
				<IconButton sx={{ color: '#e0e0e0' }}>
					<Badge
						badgeContent={3}
						color="error">
						<NotificationsOutlinedIcon />
					</Badge>
				</IconButton>

				{/* Settings */}
				<IconButton
					onClick={() => navigate('/settings')}
					sx={{ color: '#e0e0e0' }}>
					<SettingsOutlinedIcon />
				</IconButton>

				{/* USER PROFILE */}
				<Box
					sx={{
						'display': 'flex',
						'alignItems': 'center',
						'ml': 1,
						'cursor': 'pointer',
						'p': 0.5,
						'borderRadius': 1,
						'&:hover': {
							backgroundColor: 'rgba(255, 255, 255, 0.08)',
						},
					}}
					onClick={handleProfileMenuOpen}>
					<Avatar
						alt={userInfo.fullName || 'User'}
						sx={{ width: 32, height: 32, bgcolor: '#137fec' }}>
						{userInfo.fullName ? userInfo.fullName.charAt(0) : <PersonOutlinedIcon />}
					</Avatar>
					<Box
						ml={1}
						display={{ xs: 'none', md: 'block' }}>
						<Typography
							variant="body2"
							fontWeight="bold"
							color="#e0e0e0">
							{userInfo.fullName || 'Admin User'}
						</Typography>
						<Typography
							variant="caption"
							color="#a3a3a3">
							{userInfo.role || 'Administrator'}
						</Typography>
					</Box>
				</Box>

				{/* PROFILE MENU */}
				<Menu
					anchorEl={profileAnchorEl}
					open={profileMenuOpen}
					onClose={handleProfileMenuClose}
					anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
					transformOrigin={{ vertical: 'top', horizontal: 'right' }}
					PaperProps={{
						elevation: 0,
						sx: {
							'overflow': 'visible',
							'filter': 'drop-shadow(0px 2px 8px rgba(0,0,0,0.15))',
							'mt': 1.5,
							'bgcolor': isDarkMode ? '#1f2a40' : '#ffffff',
							'color': isDarkMode ? '#e0e0e0' : '#141414',
							'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
							'& .MuiAvatar-root': {
								width: 32,
								height: 32,
								ml: -0.5,
								mr: 1,
							},
						},
					}}>
					<MenuItem onClick={handleProfileClick}>
						<ListItemIcon>
							<PersonOutlinedIcon
								fontSize="small"
								sx={{ color: isDarkMode ? '#e0e0e0' : '#141414' }}
							/>
						</ListItemIcon>
						<ListItemText primary="My Profile" />
					</MenuItem>
					<MenuItem onClick={handleLogout}>
						<ListItemIcon>
							<LogoutOutlinedIcon
								fontSize="small"
								sx={{ color: isDarkMode ? '#e0e0e0' : '#141414' }}
							/>
						</ListItemIcon>
						<ListItemText primary="Logout" />
					</MenuItem>
				</Menu>
			</Box>
		</Box>
	);
};

export default Topbar;

// import React, { useState, useEffect } from 'react';
// import { Box, IconButton, useTheme, Avatar, Menu, MenuItem, ListItemIcon, ListItemText, Badge, Typography } from '@mui/material';
// import { useNavigate } from 'react-router-dom';
// // Removed tokens import as requested to avoid the error
// import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
// import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
// import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
// import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
// import { useAuth } from '@/lib/context/AuthContext';
// // Import getProfile service
// import { getProfile } from '../../services/AuthService';

// const Topbar = () => {
// 	const theme = useTheme();
// 	const isDarkMode = theme.palette.mode === 'dark';
// 	const navigate = useNavigate();
// 	const { logout } = useAuth();

// 	const [anchorEl, setAnchorEl] = useState(null);
// 	const open = Boolean(anchorEl);

// 	// State for user info fetched from API
// 	const [userInfo, setUserInfo] = useState({ fullName: '', role: '' });

// 	// Fetch Profile Logic (Replicated from Sidebar.jsx)
// 	useEffect(() => {
// 		const fetchProfile = async () => {
// 			try {
// 				const res = await getProfile();
// 				const userProfile = res?.data;
// 				setUserInfo({
// 					fullName: `${userProfile.firstName} ${userProfile.lastName}`,
// 					role: userProfile.role,
// 				});
// 			} catch (error) {
// 				console.error('Failed to fetch profile:', error);
// 			}
// 		};
// 		fetchProfile();
// 	}, []);

// 	const handleMenuOpen = (event) => {
// 		setAnchorEl(event.currentTarget);
// 	};

// 	const handleMenuClose = () => {
// 		setAnchorEl(null);
// 	};

// 	const handleProfileClick = () => {
// 		handleMenuClose();
// 		navigate('/settings/profile');
// 	};

// 	const handleLogout = () => {
// 		handleMenuClose();
// 		if (logout) logout();
// 		navigate('/login');
// 	};

// 	// Sidebar background color variable
// 	const sidebarBg = `hsl(222, 47%, 11%)`;

// 	return (
// 		<Box
// 			display="flex"
// 			justifyContent="flex-end"
// 			// Adjusted padding: smaller on mobile (xs: 1) to reduce height
// 			p={{ xs: 1, md: 2 }}
// 			sx={{
// 				backgroundColor: sidebarBg, // Match sidebar background
// 				borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
// 			}}>
// 			{/* ICONS SECTION */}
// 			<Box
// 				display="flex"
// 				alignItems="center"
// 				gap={1}>
// 				{/* Force light color for icons because background is dark */}
// 				<IconButton sx={{ color: '#e0e0e0' }}>
// 					<Badge
// 						badgeContent={3}
// 						color="error">
// 						<NotificationsOutlinedIcon />
// 					</Badge>
// 				</IconButton>

// 				<IconButton
// 					onClick={() => navigate('/settings')}
// 					sx={{ color: '#e0e0e0' }}>
// 					<SettingsOutlinedIcon />
// 				</IconButton>

// 				{/* USER PROFILE */}
// 				<Box
// 					sx={{
// 						'display': 'flex',
// 						'alignItems': 'center',
// 						'ml': 1,
// 						'cursor': 'pointer',
// 						'p': 0.5,
// 						'borderRadius': 1,
// 						'&:hover': {
// 							backgroundColor: 'rgba(255, 255, 255, 0.08)',
// 						},
// 					}}
// 					onClick={handleMenuOpen}>
// 					<Avatar
// 						alt={userInfo.fullName || 'User'}
// 						// src={user?.avatarUrl}
// 						sx={{ width: 32, height: 32, bgcolor: '#137fec' }} // Using primary color hex directly
// 					>
// 						{userInfo.fullName ? userInfo.fullName.charAt(0) : <PersonOutlinedIcon />}
// 					</Avatar>
// 					<Box
// 						ml={1}
// 						display={{ xs: 'none', md: 'block' }}>
// 						{/* Force light text color on dark topbar */}
// 						<Typography
// 							variant="body2"
// 							fontWeight="bold"
// 							color="#e0e0e0">
// 							{userInfo.fullName || 'Admin User'}
// 						</Typography>
// 						<Typography
// 							variant="caption"
// 							color="#a3a3a3">
// 							{userInfo.role || 'Administrator'}
// 						</Typography>
// 					</Box>
// 				</Box>

// 				{/* PROFILE MENU */}
// <Menu
// 	anchorEl={anchorEl}
// 	open={open}
// 	onClose={handleMenuClose}
// 	anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
// 	transformOrigin={{ vertical: 'top', horizontal: 'right' }}
// 	PaperProps={{
// 		elevation: 0,
// 		sx: {
// 			'overflow': 'visible',
// 			'filter': 'drop-shadow(0px 2px 8px rgba(0,0,0,0.15))',
// 			'mt': 1.5,
// 			'bgcolor': isDarkMode ? '#1f2a40' : '#ffffff',
// 			'color': isDarkMode ? '#e0e0e0' : '#141414',
// 			'border': `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
// 			'& .MuiAvatar-root': {
// 				width: 32,
// 				height: 32,
// 				ml: -0.5,
// 				mr: 1,
// 			},
// 		},
// 	}}>
// 	<MenuItem onClick={handleProfileClick}>
// 		<ListItemIcon>
// 			<PersonOutlinedIcon
// 				fontSize="small"
// 				sx={{ color: isDarkMode ? '#e0e0e0' : '#141414' }}
// 			/>
// 		</ListItemIcon>
// 		<ListItemText primary="My Profile" />
// 	</MenuItem>
// 	<MenuItem onClick={handleLogout}>
// 		<ListItemIcon>
// 			<LogoutOutlinedIcon
// 				fontSize="small"
// 				sx={{ color: isDarkMode ? '#e0e0e0' : '#141414' }}
// 			/>
// 		</ListItemIcon>
// 		<ListItemText primary="Logout" />
// 	</MenuItem>
// </Menu>
// 			</Box>
// 		</Box>
// 	);
// };

// export default Topbar;
