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
import HrRestingIcon from '@mui/icons-material/KingBed'; // Using a placeholder for the
import staffDashboardImage from '@/assets/staff-dashboard.webp';
import staffUploadHistoryDetailsImage from '@/assets/staff-upload-history-details.webp';
import staffUploadHistoryImage from '@/assets/staff-upload-history.webp';
import uploadStaffImage from '@/assets/upload-staff.webp';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export default function DocumentationStaffManagement() {
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

			<Container
				maxWidth="lg"
				sx={{ py: { xs: 6, md: 10 } }}>
				<Stack
					direction="row"
					alignItems="center"
					spacing={1}
					sx={{ mb: 4 }}>
					<Button
						component={Link}
						to="/documentation"
						startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 14 }} />}
						sx={{
							'textTransform': 'none',
							'fontWeight': 600,
							'fontSize': '0.85rem',
							'color': isDarkMode ? '#9dabb9' : '#64748b',
							'px': 0,
							'minWidth': 'auto',
							'&:hover': {
								bgcolor: 'transparent',
								color: '#137fec',
							},
						}}>
						Documentation
					</Button>

					<ChevronRightIcon sx={{ fontSize: 16, color: isDarkMode ? '#586370' : '#94a3b8' }} />

					<Typography
						sx={{
							fontSize: '0.85rem',
							fontWeight: 600,
							color: isDarkMode ? '#ffffff' : '#111418',
						}}>
						Staff Dashboard
					</Typography>
				</Stack>

				<Typography sx={{ maxWidth: 720 }}>This is the central place HR and Admin users manage staff records.</Typography>

				<DocImageBlock
					src={staffDashboardImage}
					alt="Staff dashboard"
					caption="Staff dashboard showing total staff, upload actions, and status overview"
				/>

				<Typography
					variant="h5"
					fontWeight={700}
					sx={{ mb: 2 }}>
					Upload Staff Records
				</Typography>

				<DocImageBlock
					src={uploadStaffImage}
					alt="Upload staff UI"
					caption="Upload staff records using the provided Excel template"
				/>

				<Stack
					spacing={1.5}
					sx={{ mb: 5 }}>
					<Typography>1. Download the Excel template</Typography>
					<Typography>2. Fill in all required fields</Typography>
					<Typography>
						3. Click <b>Upload Staff</b>
					</Typography>
					<Typography>4. Upload the file</Typography>
				</Stack>

				<Typography
					variant="h5"
					fontWeight={700}
					sx={{ mb: 2 }}>
					Staff Upload history
				</Typography>

				<Typography sx={{ maxWidth: 720 }}>This is the central place HR and Admin users view all uploads for staff management.</Typography>

				<DocImageBlock
					src={staffUploadHistoryImage}
					alt="Staff upload history"
					caption="Staff upload history showing all uploads by the admin or hr"
				/>

				<DocImageBlock
					src={staffUploadHistoryDetailsImage}
					alt="Staff upload details"
					caption="Upload staff details page showing uploaded records and downloadable error report"
				/>
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
