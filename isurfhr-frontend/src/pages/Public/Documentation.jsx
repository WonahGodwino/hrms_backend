import React from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Toolbar, Box, Typography, Button, Stack, Container, useTheme, Grid, Card, CardContent, Chip, IconButton } from '@mui/material';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import PublicIcon from '@mui/icons-material/Public';
import WorkIcon from '@mui/icons-material/Work';
import ShareIcon from '@mui/icons-material/Share';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import { DocImageBlock } from '@/components/documentation/documentation-block';
import HrRestingIcon from '@mui/icons-material/KingBed'; // Using a placeholder for the custom logo icon

export default function DocumentationPage() {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	return (
		<Box
			sx={{
				width: '100%',
				minHeight: '100vh',
				bgcolor: isDarkMode ? '#101922' : '#f6f7f8',
				color: isDarkMode ? '#ffffff' : '#111418',
				fontFamily: '"Inter", sans-serif',
				overflowX: 'hidden',
				display: 'flex',
				flexDirection: 'column',
				backgroundImage: isDarkMode
					? 'radial-gradient(1200px 400px at 50% -200px, rgba(19,127,236,0.12), transparent)'
					: 'radial-gradient(1200px 400px at 50% -200px, rgba(19,127,236,0.08), transparent)',
			}}>
			{/* Navigation */}
			<AppBar
				position="sticky"
				elevation={0}
				sx={{
					bgcolor: isDarkMode ? 'rgba(16, 25, 34, 0.95)' : 'rgba(255, 255, 255, 0.95)',
					backdropFilter: 'blur(8px)',
					borderBottom: `1px solid ${isDarkMode ? '#283039' : '#e5e7eb'}`,
					color: 'inherit',
				}}>
				<Container maxWidth="lg">
					<Toolbar
						disableGutters
						sx={{ justifyContent: 'space-between', py: 1.5 }}>
						{/* Logo */}
						<Box
							component={Link}
							to="/"
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1.5,
								textDecoration: 'none',
								color: 'inherit',
								cursor: 'pointer',
							}}>
							<Box sx={{ color: '#137fec', display: 'flex' }}>
								<HrRestingIcon sx={{ fontSize: 32 }} />
							</Box>
							<Typography
								variant="h6"
								fontWeight={700}
								sx={{ letterSpacing: '-0.015em' }}>
								IsurfHR
							</Typography>
						</Box>

						{/* Right Side Actions */}
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: { xs: 2, md: 4 },
							}}>
							<Box sx={{ display: { xs: 'none', md: 'block' } }}>
								<Button
									component={Link}
									to="/careers"
									color="inherit"
									sx={{
										'textTransform': 'none',
										'fontWeight': 500,
										'fontSize': '0.875rem',
										'&:hover': { color: 'white' },
									}}>
									Browse Jobs
								</Button>
							</Box>
							<Box sx={{ display: 'flex', gap: 1 }}>
								<Button
									component={Link}
									to="/login"
									variant="contained"
									sx={{
										'textTransform': 'none',
										'fontWeight': 700,
										'fontSize': '0.875rem',
										'borderRadius': 3,
										'bgcolor': '#137fec',
										'color': '#fff',
										'&:hover': { bgcolor: '#1170d0' },
										'height': 40,
										'px': 2,
										'boxShadow': '0 10px 15px -3px rgba(19, 127, 236, 0.2)',
									}}>
									Customer Login
								</Button>
							</Box>
						</Box>
					</Toolbar>
				</Container>
			</AppBar>

			{/* Main Content */}
			<Container
				maxWidth="lg"
				sx={{ py: { xs: 6, md: 10 } }}>
				{/* Hero */}
				<Stack
					spacing={4}
					sx={{ mb: 10 }}>
					<Chip
						label="Product Documentation"
						sx={{
							width: 'fit-content',
							px: 1.5,
							py: 0.5,
							fontWeight: 700,
							bgcolor: isDarkMode ? '#1b2735' : '#eaf2ff',
							color: '#137fec',
							borderRadius: 999,
						}}
					/>

					<Typography
						variant="h2"
						fontWeight={900}
						sx={{ letterSpacing: '-0.03em', maxWidth: 800 }}>
						Everything you need to use IsurfHR confidently
					</Typography>

					<Typography
						variant="body1"
						sx={{
							color: isDarkMode ? '#9dabb9' : '#475569',
							maxWidth: 720,
							fontSize: '1.05rem',
							lineHeight: 1.7,
						}}>
						Learn how to onboard staff, upload payroll, and manage payslips with clarity. This guide is written for HR teams and staff — no technical knowledge required.
					</Typography>
				</Stack>

				{/* Roles */}
				<Grid
					container
					spacing={4}
					sx={{ mb: 10 }}>
					{[
						{
							title: 'Staff',
							desc: 'View personal payslips and employment records.',
							icon: <PersonSearchIcon />,
						},
						{
							title: 'HR',
							desc: 'Manage staff and payroll for a single company.',
							icon: <BusinessCenterIcon />,
						},
						{
							title: 'Admin',
							desc: 'Manage staff and payroll across multiple assigned companies.',
							icon: <Diversity3Icon />,
						},
						{
							title: 'Super Admin',
							desc: 'Manage the entire system and all companies.',
							icon: <DesignServicesIcon />,
						},
					].map((role) => (
						<Grid
							item
							xs={12}
							sm={6}
							md={3}
							key={role.title}>
							<Card
								sx={{
									'height': '100%',
									'borderRadius': 5,
									'bgcolor': isDarkMode ? '#0f172a' : '#ffffff',
									'border': `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
									'transition': 'all 0.25s ease',
									'&:hover': {
										transform: 'translateY(-4px)',
										boxShadow: isDarkMode ? '0 20px 30px rgba(0,0,0,0.35)' : '0 20px 30px rgba(0,0,0,0.08)',
										borderColor: '#137fec',
									},
								}}>
								<CardContent>
									<Box
										sx={{
											width: 44,
											height: 44,
											borderRadius: 3,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											bgcolor: isDarkMode ? '#1e293b' : '#eaf2ff',
											color: '#137fec',
											mb: 2,
										}}>
										{role.icon}
									</Box>

									<Typography fontWeight={700}>{role.title}</Typography>
									<Typography
										variant="body2"
										sx={{ color: isDarkMode ? '#9dabb9' : '#64748b' }}>
										{role.desc}
									</Typography>
								</CardContent>
							</Card>
						</Grid>
					))}
				</Grid>

				{/* Documentation Sections */}
				<Box sx={{ mb: 12 }}>
					<Stack
						spacing={2}
						sx={{ mb: 5 }}>
						<Typography
							variant="h4"
							fontWeight={800}
							sx={{ letterSpacing: '-0.02em' }}>
							Explore documentation
						</Typography>

						<Typography
							sx={{
								maxWidth: 720,
								color: isDarkMode ? '#9dabb9' : '#475569',
							}}>
							Choose a topic to get step-by-step guidance with screenshots and examples.
						</Typography>
					</Stack>

					<Grid
						container
						spacing={3}>
						{[
							{
								title: 'Staff Management',
								description: 'Upload staff, manage records, review upload history, and resolve failed uploads.',
								link: '/documentation/staff-management',
								icon: <PersonSearchIcon />,
							},
							{
								title: 'Payroll Management',
								description: 'Upload payroll, generate payslips, manage payroll history, and download company payslips.',
								link: '/documentation/payroll-management',
								icon: <BusinessCenterIcon />,
							},
						].map((item) => (
							<Grid
								item
								xs={12}
								md={6}
								key={item.title}>
								<Card
									component={Link}
									to={item.link}
									sx={{
										'textDecoration': 'none',
										'height': '100%',
										'borderRadius': 4,
										'p': 3,
										'bgcolor': isDarkMode ? '#0b1220' : '#ffffff',
										'border': `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
										'transition': 'all 0.25s ease',
										'&:hover': {
											borderColor: '#137fec',
											boxShadow: isDarkMode ? '0 10px 25px rgba(0,0,0,0.35)' : '0 10px 25px rgba(0,0,0,0.08)',
											transform: 'translateY(-2px)',
										},
									}}>
									<Stack
										direction="row"
										spacing={3}
										alignItems="flex-start">
										<Box
											sx={{
												width: 44,
												height: 44,
												borderRadius: 3,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												bgcolor: isDarkMode ? '#1e293b' : '#eaf2ff',
												color: '#137fec',
												flexShrink: 0,
											}}>
											{item.icon}
										</Box>

										<Stack spacing={0.5}>
											<Typography fontWeight={800}>{item.title}</Typography>

											<Typography
												variant="body2"
												sx={{ color: isDarkMode ? '#9dabb9' : '#64748b' }}>
												{item.description}
											</Typography>

											<Typography
												variant="body2"
												sx={{
													mt: 1,
													fontWeight: 600,
													color: '#137fec',
												}}>
												View documentation →
											</Typography>
										</Stack>
									</Stack>
								</Card>
							</Grid>
						))}
					</Grid>
				</Box>

				{/* Important notes */}
				<Box
					sx={{
						mb: 12,
						p: { xs: 3, md: 5 },
						borderRadius: 6,
						bgcolor: isDarkMode ? '#0b1220' : '#f8fafc',
						border: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
					}}>
					<Stack spacing={3}>
						<Typography
							variant="h4"
							fontWeight={800}>
							Important notes
						</Typography>
						<Typography sx={{ maxWidth: 800 }}>
							Payslips are generated automatically after a successful payroll upload. Staff can view and download their payslips as PDF.
						</Typography>

						<Stack spacing={1}>
							<Typography>• Staff must complete registration before viewing payslips</Typography>
							<Typography>• Payslip notifications are sent automatically by email</Typography>
							<Typography>• Payslip emails cannot be resent at this time</Typography>
						</Stack>
					</Stack>
				</Box>
			</Container>

			{/* Footer */}
			<Box
				component="footer"
				sx={{
					width: '100%',
					bgcolor: isDarkMode ? '#101922' : '#fff',
					borderTop: `1px solid ${isDarkMode ? '#283039' : '#e5e7eb'}`,
					py: 5,
					mt: 'auto',
				}}>
				<Container
					maxWidth="lg"
					sx={{ display: 'flex', justifyContent: 'center' }}>
					<Box
						sx={{
							display: 'flex',
							flexDirection: 'column',
							gap: 4,
							alignItems: 'center',
							textAlign: 'center',
							maxWidth: '960px',
							width: '100%',
						}}>
						<Box
							sx={{
								display: 'flex',
								flexWrap: 'wrap',
								justifyContent: 'center',
								gap: { xs: 3, md: 6 },
							}}>
							{['About Us', 'Careers', 'Privacy Policy', 'Terms of Service', 'Documentation'].map((item) => (
								<Typography
									key={item}
									component="a"
									href={item === 'Documentation' ? '/documentation' : '#'}
									sx={{
										'color': isDarkMode ? '#9dabb9' : '#64748b',
										'fontSize': '1rem',
										'textDecoration': 'none',
										'&:hover': { color: isDarkMode ? '#fff' : '#111418' },
										'transition': 'color 0.2s',
									}}>
									{item}
								</Typography>
							))}
						</Box>

						<Box sx={{ display: 'flex', gap: 3 }}>
							{[<PublicIcon />, <WorkIcon />, <ShareIcon />].map((icon, index) => (
								<IconButton
									key={index}
									sx={{
										'color': isDarkMode ? '#9dabb9' : '#64748b',
										'&:hover': {
											color: '#137fec',
											bgcolor: isDarkMode ? '#283039' : '#f3f4f6',
										},
									}}>
									{icon}
								</IconButton>
							))}
						</Box>

						<Typography
							variant="body2"
							sx={{ color: isDarkMode ? '#586370' : '#94a3b8' }}>
							© {new Date().getFullYear()} 247HR. All rights reserved.
						</Typography>
					</Box>
				</Container>
			</Box>
		</Box>
	);
}
