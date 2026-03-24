// src/pages/global/Sidebar.jsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Sidebar, Menu, MenuItem } from 'react-pro-sidebar';
import { Box, IconButton, Typography, useTheme, useMediaQuery, Avatar, Collapse } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { tokens } from '../../theme';
import { getProfile } from '../../services/AuthService';

// Icons
import {
	DoorClosed,
	BookOpen,
	CalendarCheck,
	CalendarDays,
	ClipboardList,
	DollarSign,
	FileText,
	UserCheck,
	BarChart2,
	Settings,
	Layers,
	LogOut,
	LayoutDashboard,
	Building2,
	GitBranch,
	UserCog,
	CheckSquare,
	Settings2,
	Briefcase,
	ChevronDown,
	PanelRight,
	PanelLeft,
	Banknote,
	Calculator,
	Clock,
	FileCheck,
	PieChart,
	Wallet,
	Receipt,
	Users,
	FileSpreadsheet,
	Award,
} from 'lucide-react';

export default function AppSidebar({ isCollapsed = false, onCollapseToggle, toggled, onToggle }) {
	const theme = useTheme();
	const colors = tokens(theme.palette.mode);
	const isTabletOrBelow = useMediaQuery(theme.breakpoints.down('md'));
	const navigate = useNavigate();

	const [collapsed, setCollapsed] = useState(Boolean(isCollapsed));
	const [userInfo, setUserInfo] = useState({ fullName: '', role: '' });
	const [expandedGroups, setExpandedGroups] = useState({});
	const location = useLocation();

	const currentPath = location.pathname;

	// Treat Tablets identically to Phones regarding Drawer logic
	useEffect(() => {
		if (isTabletOrBelow) {
			setCollapsed(false); // Drawer sidebar is ALWAYS fully expanded
		} else {
			setCollapsed(Boolean(isCollapsed));
		}
	}, [isCollapsed, isTabletOrBelow]);

	useEffect(() => {
		if (isTabletOrBelow) {
			setCollapsed(false);
		} else if (typeof toggled !== 'undefined') {
			if (toggled) {
				setCollapsed(false);
			} else {
				setCollapsed(Boolean(isCollapsed));
			}
		}
	}, [toggled, isCollapsed, isTabletOrBelow]);

	useEffect(() => {
		const fetchProfile = async () => {
			try {
				const token = localStorage.getItem('authToken');
				if (!token) {
					setUserInfo({ fullName: 'User', role: 'STAFF' });
					return;
				}

				const res = await getProfile();
				const userData = res?.data;

				if (userData) {
					setUserInfo({
						fullName: userData.fullName || (userData.firstName ? `${userData.firstName} ${userData.lastName}` : 'User'),
						role: userData.role || 'STAFF',
					});
				}
			} catch (err) {
				setUserInfo({ fullName: 'User', role: 'STAFF' });
				console.log(err);
			}
		};

		fetchProfile();
	}, []);

	const handleMobileLinkClick = useCallback(
		(href) => {
			navigate(href);
			if (isTabletOrBelow) {
				if (typeof onToggle === 'function') {
					onToggle(false);
				} else if (onCollapseToggle) {
					setTimeout(() => onCollapseToggle(true), 0);
				}
			}
		},
		[isTabletOrBelow, onCollapseToggle, onToggle, navigate]
	);

	const handleClickCollapseOnly = useCallback(() => {
		if (isTabletOrBelow && typeof onToggle === 'function') {
			onToggle(false);
			return;
		}

		setCollapsed((prev) => {
			const next = !prev;
			if (onCollapseToggle) setTimeout(() => onCollapseToggle(next), 0);
			return next;
		});
	}, [isTabletOrBelow, onCollapseToggle, onToggle]);

	const handleLogout = useCallback(() => {
		try {
			localStorage.removeItem('authToken');
			localStorage.removeItem('authUser');
		} catch (e) {
			console.error(e);
		}
		navigate('/login');
	}, [navigate]);

	const toggleGroup = useCallback((groupTitle) => {
		setExpandedGroups((prev) => ({
			...prev,
			[groupTitle]: !prev[groupTitle],
		}));
	}, []);

	const getInitials = (name) => {
		if (!name) return 'U';
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return 'U';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	};

	const unifiedMenu = useMemo(
		() => [
			{
				title: 'Core Setup',
				icon: Settings,
				items: [
					{
						title: 'Companies',
						href: '/companies',
						roles: ['ADMIN'],
						icon: Building2,
					},
					{
						title: 'Departments',
						href: '/departments',
						roles: ['ADMIN', 'HR'],
						icon: Layers,
					},
					{
						title: 'Business Units',
						href: '/business-units',
						roles: ['ADMIN', 'HR'],
						icon: GitBranch,
					},
					{
						title: 'Staff Management',
						href: '/staff-management',
						roles: ['ADMIN', 'HR'],
						icon: UserCog,
					},
					{
						title: 'Template Management',
						href: '/templates',
						roles: ['ADMIN', 'HR', 'SUPER_ADMIN'],
						icon: FileText,
					},
				],
			},
			{
				title: 'Recruitment',
				icon: Briefcase,
				items: [
					{
						title: 'Jobs Dashboard',
						href: '/jobs',
						roles: ['ADMIN', 'HR'],
						icon: Briefcase,
					},
					//   {
					//     title: "Job Applications",
					//     href: "/job-applications",
					//     roles: ["ADMIN", "HR"],
					//     icon: ClipboardList,
					//   },
					//   {
					//     title: "Aptitude Tests",
					//     href: "/aptitude-tests",
					//     roles: ["ADMIN", "HR"],
					//     icon: CheckSquare,
					//   },
					//   {
					//     title: "Internal Openings",
					//     href: "/internal-vacancies",
					//     roles: ["STAFF"],
					//     icon: Briefcase,
					//   },
					{
						title: 'Interviews',
						href: '/interviews',
						roles: ['ADMIN', 'HR'],
						icon: CalendarCheck,
					},
				],
			},
			{
				title: 'OffBoarding',
				icon: DoorClosed,
				items: [
					{
						title: 'OffBoarding Dashboard',
						href: '/offboarding',
						roles: ['ADMIN', 'HR', 'SUPER_ADMIN'],
						icon: DoorClosed,
					},
				],
			},
			{
				title: 'Task Management',
				icon: ClipboardList,
				items: [
					{
						title: 'Task Dashboard',
						href: '/tasks-dashboard',
						roles: ['ADMIN', 'HR', 'STAFF'],
						icon: BarChart2,
					},
					{
						title: 'My Assigned Tasks',
						href: '/assigned-tasks',
						roles: ['STAFF'],
						icon: CheckSquare,
					},
				],
			},
			{
				title: 'Attendance',
				icon: BookOpen,
				items: [
					{
						title: 'Attendance Dashboard',
						href: '/attendance-dashboard',
						roles: ['ADMIN', 'HR', 'STAFF'],
						icon: UserCheck,
					},
				],
			},
			{
				title: 'Leave',
				icon: CalendarDays,
				items: [
					{
						title: 'Leave Dashboard',
						href: '/leave-dashboard',
						roles: ['STAFF', 'HR', 'ADMIN'],
						icon: CalendarCheck,
					},
					{
						title: 'Leave Settings',
						href: '/leave-settings',
						roles: ['HR', 'ADMIN'],
						icon: Settings2,
					},
				],
			},
			{
				title: 'Finance & Payroll',
				icon: DollarSign,
				items: [
					{
						title: 'My Payslips',
						href: '/my-payslips',
						roles: ['STAFF'],
						icon: FileText,
					},
					{
						title: 'Company Payslips',
						href: '/company-payslips',
						roles: ['ADMIN', 'HR', 'SUPER_ADMIN'],
						icon: FileText,
					},
					{
						title: 'Payroll Dashboard',
						href: '/payroll-dashboard',
						roles: ['ADMIN', 'HR'],
						icon: BarChart2,
					},
					{
						title: 'Account Validator',
						href: '/account-validator',
						roles: ['ADMIN', 'HR', 'SUPER_ADMIN'], // or just ["ADMIN", "SUPER_ADMIN"] if more restricted
						icon: Banknote,
					},
				],
			},
			{
				title: 'Payroll Engine',
				icon: Calculator,
				items: [
					{
						title: 'Pay Periods',
						href: '/payroll-engine/pay-periods',
						roles: ['ADMIN', 'HR'],
						icon: CalendarDays,
					},
					{
						title: 'Salary Structures',
						href: '/payroll-engine/salaries',
						roles: ['ADMIN', 'HR'],
						icon: Wallet,
					},
					{
						title: 'Deductions',
						href: '/payroll-engine/deductions',
						roles: ['ADMIN', 'HR'],
						icon: DollarSign,
					},
					{
						title: 'Overtime',
						href: '/payroll-engine/overtime',
						roles: ['ADMIN', 'HR'],
						icon: Clock,
					},
					{
						title: 'Computed Payslips',
						href: '/payroll-engine/payslips',
						roles: ['ADMIN', 'HR'],
						icon: FileCheck,
					},
					{
						title: 'My Payslips',
						href: '/payroll-engine/my-payslips',
						roles: ['STAFF'],
						icon: FileText,
					},
					{
						title: 'Validation Portal',
						href: '/payroll-engine/validation',
						roles: ['ADMIN', 'HR'],
						icon: CheckSquare,
					},
					{
						title: 'Reports',
						href: '/payroll-engine/reports',
						roles: ['ADMIN', 'HR'],
						icon: PieChart,
					},
				],
			},
			{
				title: 'Tax Filing',
				icon: Receipt,
				items: [
					{
						title: 'Tax Filing Dashboard',
						href: '/payroll-engine/tax-filing',
						roles: ['ADMIN', 'HR'],
						icon: Receipt,
					},
					{
						title: 'Tax Profiles',
						href: '/payroll-engine/tax-filing/profiles',
						roles: ['ADMIN', 'HR'],
						icon: Users,
					},
					{
						title: 'Monthly Filing',
						href: '/payroll-engine/tax-filing/monthly',
						roles: ['ADMIN', 'HR'],
						icon: FileSpreadsheet,
					},
					{
						title: 'Annual Returns',
						href: '/payroll-engine/tax-filing/annual',
						roles: ['ADMIN', 'HR'],
						icon: FileText,
					},
					{
						title: 'Tax Certificates',
						href: '/payroll-engine/tax-filing/certificates',
						roles: ['ADMIN', 'HR'],
						icon: Award,
					},
				],
			},
		],
		[]
	);

	useEffect(() => {
		const currentRole = (userInfo.role || '').toString();
		const initialExpandedState = {};

		unifiedMenu.forEach((group) => {
			const hasActiveItem = (group.items || []).some((item) => {
				if (currentRole === 'SUPER_ADMIN' && item.title === 'My Payslips') return false;
				if (currentRole !== 'SUPER_ADMIN' && !item.roles?.includes(currentRole)) return false;
				return currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href));
			});
			if (hasActiveItem && !expandedGroups[group.title]) {
				initialExpandedState[group.title] = true;
			}
		});

		if (Object.keys(initialExpandedState).length > 0) {
			setExpandedGroups((prev) => ({ ...prev, ...initialExpandedState }));
		}
	}, [currentPath, unifiedMenu, userInfo.role, expandedGroups]);

	const menuItems = useMemo(() => {
		const currentRole = (userInfo.role || '').toString();

		return (unifiedMenu || [])
			.map((group, gi) => {
				const visibleItems = (group.items || []).filter((item) => {
					if (!item.roles?.length) return true;
					if (currentRole === 'SUPER_ADMIN') {
						if (item.title === 'My Payslips') return false;
						return true;
					}
					return item.roles.includes(currentRole);
				});

				if (!visibleItems.length) return null;

				const isExpanded = expandedGroups[group.title] || false;
				const hasActiveItem = visibleItems.some((item) => currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href)));

				return (
					<React.Fragment key={group.title ?? gi}>
						{!collapsed && (
							<Box
								onClick={() => toggleGroup(group.title)}
								sx={{
									'display': 'flex',
									'alignItems': 'center',
									'justifyContent': 'space-between',
									'px': 3,
									'mt': 2,
									'mb': 1,
									'cursor': 'pointer',
									'transition': 'all 0.2s ease',
									'&:hover': {
										'& .group-title': { color: colors.gray[100] },
										'& .group-chevron': { color: colors.gray[100] },
									},
								}}>
								<Typography
									className="group-title"
									variant="overline"
									sx={{
										color: hasActiveItem ? colors.primary[300] : colors.gray[400],
										fontWeight: hasActiveItem ? 800 : 700,
										fontSize: '0.75rem',
										letterSpacing: '0.05em',
										transition: 'color 0.2s ease',
									}}>
									{group.title}
								</Typography>
								<Box
									className="group-chevron"
									sx={{
										color: colors.gray[500],
										display: 'flex',
										alignItems: 'center',
										transition: 'transform 0.2s ease',
										transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
									}}>
									<ChevronDown sx={{ fontSize: 18 }} />
								</Box>
							</Box>
						)}

						{!collapsed && (
							<Collapse
								in={isExpanded}
								timeout="auto"
								unmountOnExit>
								<Box>
									{visibleItems.map((child) => {
										const isActive = currentPath === child.href || (child.href !== '/' && currentPath.startsWith(child.href));
										const ChildIcon = child.icon;

										return (
											<MenuItem
												key={child.href ?? child.title}
												active={isActive}
												onClick={() => handleMobileLinkClick(child.href)}
												icon={
													ChildIcon ? (
														<ChildIcon
															size={20}
															strokeWidth={1.5}
														/>
													) : (
														<div />
													)
												}
												sx={{ justifyContent: 'flex-start', px: 2 }}>
												<Typography
													variant="body2"
													sx={{
														fontWeight: isActive ? 600 : 400,
														color: 'inherit',
													}}>
													{child.title}
												</Typography>
											</MenuItem>
										);
									})}
								</Box>
							</Collapse>
						)}

						{collapsed && <Box sx={{ display: 'none' }}></Box>}

						{collapsed &&
							visibleItems.map((child) => {
								const isActive = currentPath === child.href || (child.href !== '/' && currentPath.startsWith(child.href));
								const ChildIcon = child.icon;
								return (
									<MenuItem
										key={child.href ?? child.title}
										active={isActive}
										onClick={() => handleMobileLinkClick(child.href)}
										icon={
											ChildIcon ? (
												<ChildIcon
													size={20}
													strokeWidth={1.5}
												/>
											) : (
												<div />
											)
										}
										sx={{ justifyContent: 'center', px: 0 }}
									/>
								);
							})}
					</React.Fragment>
				);
			})
			.filter(Boolean);
	}, [unifiedMenu, userInfo.role, currentPath, handleMobileLinkClick, collapsed, colors, expandedGroups, toggleGroup]);

	const sidebarBg = `hsl(222, 47%, 11%)`;
	const border = `1px solid rgba(255, 255, 255, 0.1)`;

	return (
		<Box
			sx={{
				'height': '100%',
				'position': isTabletOrBelow ? 'absolute' : 'relative',
				'zIndex': isTabletOrBelow ? 1200 : 'auto',
				'flexShrink': 0,
				'& .pro-sidebar-inner, & .ps-sidebar-container': {
					background: `${sidebarBg} !important`,
				},
				'& .pro-sidebar, & .ps-sidebar-root': {
					borderRight: 'none !important',
				},
				'& .ps-menu-button': {
					backgroundColor: 'transparent !important',
					color: `${colors.gray[300]} !important`,
					borderRadius: '8px !important',
					margin: '4px 8px !important',
					transition: 'all 0.2s ease !important',
				},
				'& .ps-menu-button:hover': {
					backgroundColor: 'rgba(96, 165, 250, 0.1) !important',
					color: '#60a5fa !important',
				},
				'& .ps-menu-button:hover .ps-menu-icon': {
					color: '#60a5fa !important',
				},
				'& .ps-menu-button.ps-active': {
					backgroundColor: `${colors.primary[500]} !important`,
					color: '#ffffff !important',
					boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
				},
				'& .ps-menu-button.ps-active .ps-menu-icon': {
					color: '#ffffff !important',
				},
				'& .ps-menu-icon': {
					color: 'inherit !important',
					backgroundColor: 'transparent !important',
					minWidth: 'auto !important',
					marginRight: '10px !important',
				},
			}}>
			<Sidebar
				collapsed={collapsed}
				breakPoint="md"
				width="260px"
				{...(typeof toggled !== 'undefined' ? { toggled } : {})}
				{...(typeof onToggle === 'function' ? { onToggle } : {})}
				style={{ height: '100vh', borderRight: border }}>
				<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: collapsed ? 'center' : 'space-between',
							px: collapsed ? 0 : 3,
							py: 3,
							mb: 1,
						}}>
						{!collapsed && (
							<Box
								display="flex"
								alignItems="center"
								gap={1.5}>
								<Box
									sx={{
										width: 32,
										height: 32,
										borderRadius: 1,
										bgcolor: colors.primary[500],
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										color: 'white',
										fontWeight: 900,
										letterSpacing: '-0.04em',
									}}>
									24/7
								</Box>
								<Typography
									variant="h5"
									sx={{
										color: 'gray.100',
										fontWeight: 800,
										letterSpacing: '-0.02em',
									}}>
									HR
								</Typography>
							</Box>
						)}
						<IconButton
							onClick={handleClickCollapseOnly}
							sx={{
								'color': colors.gray[400],
								'&:hover': {
									color: colors.gray[100],
									bgcolor: 'rgba(255,255,255,0.1)',
								},
							}}>
							{collapsed ? <PanelRight /> : <PanelLeft />}
						</IconButton>
					</Box>
					{!collapsed && (
						<Box sx={{ px: 3, mb: 3 }}>
							<Box
								sx={{
									p: 2,
									borderRadius: 2,
									bgcolor: 'rgba(255,255,255,0.03)',
									border: '1px solid rgba(255,255,255,0.05)',
									display: 'flex',
									alignItems: 'center',
									gap: 1.5,
								}}>
								<Avatar
									sx={{
										width: 36,
										height: 36,
										fontSize: 14,
										bgcolor: colors.primary[600],
										color: '#fff',
										fontWeight: 600,
									}}>
									{getInitials(userInfo.fullName)}
								</Avatar>
								<Box overflow="hidden">
									<Typography
										variant="body2"
										sx={{
											color: colors.gray[100],
											fontWeight: 600,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}>
										{userInfo.fullName || 'User'}
									</Typography>
									<Typography
										variant="caption"
										sx={{
											color: colors.gray[400],
											display: 'block',
											fontSize: '0.7rem',
										}}>
										{userInfo.role || 'STAFF'}
									</Typography>
								</Box>
							</Box>
						</Box>
					)}
					<Box sx={{ flex: 1, overflowY: 'auto', px: 0 }}>
						<Menu
							iconShape="square"
							style={{ paddingBottom: 20 }}>
							<MenuItem
								active={currentPath === '/dashboard'}
								onClick={() => handleMobileLinkClick('/dashboard')}
								icon={
									<LayoutDashboard
										size={20}
										strokeWidth={1.5}
									/>
								}
								sx={{
									justifyContent: collapsed ? 'center' : 'flex-start',
									px: collapsed ? 0 : 2,
								}}>
								{!collapsed && (
									<Typography
										variant="body2"
										sx={{
											fontWeight: currentPath === '/dashboard' ? 600 : 400,
											color: 'inherit',
										}}>
										Dashboard
									</Typography>
								)}
							</MenuItem>
							{menuItems}
						</Menu>
					</Box>
					<Box sx={{ pl: 0, borderTop: border }}>
						<Menu iconShape="square">
							<MenuItem
								icon={
									<LogOut
										size={20}
										strokeWidth={1.5}
									/>
								}
								onClick={() => {
									if (isTabletOrBelow && typeof onToggle === 'function') {
										onToggle(false);
									}
									handleLogout();
								}}
								className="ps-menu-button">
								{!collapsed && (
									<Typography
										variant="body2"
										fontWeight={600}
										color="inherit">
										Logout
									</Typography>
								)}
							</MenuItem>
						</Menu>
					</Box>
				</Box>
			</Sidebar>
		</Box>
	);
}
