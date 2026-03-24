import React from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Toolbar, Box, Typography, Button, Stack, Container, useTheme, Grid, Card, CardContent, Chip, IconButton } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import PublicIcon from '@mui/icons-material/Public';
import WorkIcon from '@mui/icons-material/Work';
import ShareIcon from '@mui/icons-material/Share';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import CampaignIcon from '@mui/icons-material/Campaign';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import HrRestingIcon from '@mui/icons-material/KingBed'; // Using a placeholder for the custom logo icon

const Home = () => {
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
								247HR
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
										textTransform: 'none',
										fontWeight: 500,
										fontSize: '0.875rem',
									}}>
									Browse Jobs
								</Button>
							</Box>
							<Box sx={{ display: 'flex', gap: 1 }}>
								<Button
									component={Link}
									to="/login"
									// variant="outlined"
									// sx={{
									// 	'display': { xs: 'none', sm: 'flex' },
									// 	'textTransform': 'none',
									// 	'fontWeight': 700,
									// 	'fontSize': '0.875rem',
									// 	'borderRadius': 3, // rounded-xl
									// 	'color': isDarkMode ? '#fff' : '#111418',
									// 	'borderColor': isDarkMode ? '#283039' : '#d1d5db',
									// 	'bgcolor': isDarkMode ? '#283039' : 'transparent',
									// 	'&:hover': {
									// 		bgcolor: isDarkMode ? '#323b46' : '#f3f4f6',
									// 		borderColor: isDarkMode ? '#323b46' : '#9ca3af',
									// 	},
									// 	'height': 40,
									// 	'px': 2,
									// }}>
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
								{/* <Button
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
									Sign In
								</Button> */}
							</Box>
						</Box>
					</Toolbar>
				</Container>
			</AppBar>

			{/* Main Content */}
			<Box
				component="main"
				sx={{
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
				}}>
				{/* Hero Section */}
				<Box sx={{ width: '100%', px: { xs: 2, md: 5 }, py: 3 }}>
					<Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
						<Box
							sx={{
								position: 'relative',
								minHeight: '560px',
								borderRadius: { xs: 0, sm: 4 }, // rounded-xl logic from tailwind
								overflow: 'hidden',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								textAlign: 'center',
								gap: 4,
								p: 4,
								backgroundImage: `linear-gradient(rgba(16, 25, 34, 0.7) 0%, rgba(16, 25, 34, 0.8) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuATIXgmrhArOOASLQexvLC6XMKy85r_9PyQgOj3WvywfIsG6IQc8sWRsasqFhRYkIT9BwwkMwrryqjsAJ5zug3XjguEucYcJWdVsMC65uixwc0FFdH5AwCEKvFrEWH3wyQYDB9iNHAzfNsRwGfLGsn3xOLR-cQr3jLq-V6f9q7CJSvYGHjhDaNAKXdmrURCGGchAsZAnhQgsDK70lzSAFn5CMLtZ-UcLSklN8hkmEZyln3UmWOJbfWdkS5RqboASrL1NUSS6kXf1oa4")`,
								backgroundSize: 'cover',
								backgroundPosition: 'center',
							}}>
							<Box sx={{ maxWidth: '720px', zIndex: 1 }}>
								<Typography
									variant="h1"
									sx={{
										color: '#fff',
										fontWeight: 900,
										fontSize: { xs: '2.25rem', md: '3.75rem' },
										lineHeight: { xs: 1.2, md: 1.1 },
										letterSpacing: '-0.033em',
										mb: 2,
									}}>
									The Complete HR Ecosystem for Modern Teams & Top Talent
								</Typography>
								<Typography
									variant="body1"
									sx={{
										color: '#9dabb9',
										fontSize: { xs: '1rem', md: '1.125rem' },
										lineHeight: 1.6,
										maxWidth: '600px',
										mx: 'auto',
									}}>
									Streamline your hiring process or discover your next career move with 247HR. The platform that connects potential with opportunity.
								</Typography>
							</Box>

							<Box
								sx={{
									display: 'flex',
									flexWrap: 'wrap',
									justifyContent: 'center',
									gap: 2,
									zIndex: 1,
									mt: 2,
								}}>
								<Button
									component={Link}
									to="/register"
									variant="contained"
									size="large"
									sx={{
										'bgcolor': '#137fec',
										'color': '#fff',
										'fontWeight': 700,
										'textTransform': 'none',
										'borderRadius': 3,
										'px': 4,
										'height': 48,
										'fontSize': '1rem',
										'boxShadow': '0 20px 25px -5px rgba(30, 64, 175, 0.2)', // blue-900/20 shadow
										'&:hover': { bgcolor: '#2563eb', transform: 'scale(1.05)' },
										'transition': 'all 0.2s',
									}}>
									Start Free Trial
								</Button>
								<Button
									component={Link}
									to="/careers"
									variant="outlined"
									size="large"
									sx={{
										'color': '#fff',
										'borderColor': '#3b4754',
										'fontWeight': 700,
										'textTransform': 'none',
										'borderRadius': 3,
										'px': 4,
										'height': 48,
										'fontSize': '1rem',
										'bgcolor': 'transparent',
										'backdropFilter': 'blur(4px)',
										'&:hover': { bgcolor: '#283039', borderColor: '#3b4754' },
									}}>
									View Open Roles
								</Button>
							</Box>
						</Box>
					</Box>
				</Box>

				{/* Job Listings Section */}
				<Box
					sx={{
						width: '100%',
						px: { xs: 2, md: 8 },
						py: 5,
						display: 'flex',
						justifyContent: 'center',
					}}>
					<Box
						sx={{
							width: '100%',
							maxW: '960px',
							display: 'flex',
							flexDirection: 'column',
							px: 12,
							gap: 5,
						}}>
						<Box
							sx={{
								display: 'flex',
								flexDirection: { xs: 'column', md: 'row' },
								justifyContent: 'space-between',
								alignItems: { xs: 'flex-start', md: 'flex-end' },
								gap: 3,
							}}>
							<Box>
								<Typography
									variant="h2"
									sx={{
										fontSize: '2rem',
										fontWeight: 700,
										color: isDarkMode ? '#fff' : '#111418',
										letterSpacing: '-0.033em',
										mb: 1,
									}}>
									Hiring Now
								</Typography>
								<Typography
									variant="body2"
									sx={{ color: isDarkMode ? '#9dabb9' : '#64748b' }}>
									Latest opportunities from top companies
								</Typography>
							</Box>
							<Button
								component={Link}
								to="/careers"
								sx={{
									'textTransform': 'none',
									'fontWeight': 700,
									'fontSize': '0.875rem',
									'borderRadius': 3,
									'bgcolor': isDarkMode ? '#283039' : '#e5e7eb',
									'color': isDarkMode ? '#fff' : '#111418',
									'height': 40,
									'px': 3,
									'&:hover': { bgcolor: isDarkMode ? '#323b46' : '#d1d5db' },
								}}>
								View All Jobs
							</Button>
						</Box>

						<Grid
							container
							spacing={2}>
							{[
								{
									title: 'Senior Product Designer',
									company: 'TechFlow Inc.',
									loc: 'San Francisco, CA',
									type: 'Remote',
									icon: <DesignServicesIcon />,
								},
								{
									title: 'Marketing Lead',
									company: 'Creative Agency',
									loc: 'New York, NY',
									type: 'On-site',
									icon: <CampaignIcon />,
								},
								{
									title: 'HR Specialist',
									company: 'PeopleFirst',
									loc: 'Austin, TX',
									type: 'Hybrid',
									icon: <Diversity3Icon />,
								},
							].map((job, index) => (
								<Grid
									item
									xs={12}
									sm={6}
									md={4}
									key={index}
									size={4}>
									<Card
										component={Link}
										to={`/careers/${index + 1}`} // Mock linking
										sx={{
											'height': '100%',
											'bgcolor': isDarkMode ? '#1c2127' : '#fff',
											'border': `1px solid ${isDarkMode ? '#3b4754' : '#e5e7eb'}`,
											'borderRadius': 2,
											'textDecoration': 'none',
											'transition': 'all 0.2s',
											'&:hover': {
												'borderColor': 'rgba(19, 127, 236, 0.5)', // primary/50
												'bgcolor': isDarkMode ? '#232930' : '#f9fafb',
												'& .apply-text': {
													opacity: 1,
													transform: 'translateY(0)',
												},
												'& .job-title': { color: '#137fec' },
											},
										}}
										elevation={0}>
										<CardContent
											sx={{
												p: 3,
												display: 'flex',
												flexDirection: 'column',
												gap: 2,
											}}>
											<Box
												sx={{
													display: 'flex',
													justifyContent: 'space-between',
													alignItems: 'flex-start',
												}}>
												<Box
													sx={{
														p: 1,
														borderRadius: 2,
														bgcolor: isDarkMode ? '#283039' : '#f3f4f6',
														color: isDarkMode ? '#fff' : '#111418',
														display: 'flex',
													}}>
													{job.icon}
												</Box>
												<Chip
													label={job.type}
													size="small"
													sx={{
														height: 24,
														fontSize: '0.75rem',
														fontWeight: 500,
														bgcolor: 'transparent',
														border: `1px solid ${isDarkMode ? '#3b4754' : '#e5e7eb'}`,
														color: isDarkMode ? '#9dabb9' : '#64748b',
													}}
												/>
											</Box>
											<Box>
												<Typography
													variant="h6"
													className="job-title"
													sx={{
														fontWeight: 700,
														fontSize: '1.125rem',
														lineHeight: 1.2,
														color: isDarkMode ? '#fff' : '#111418',
														mb: 0.5,
														transition: 'color 0.2s',
													}}>
													{job.title}
												</Typography>
												<Box
													sx={{
														display: 'flex',
														alignItems: 'center',
														gap: 1,
														color: isDarkMode ? '#9dabb9' : '#64748b',
														fontSize: '0.875rem',
													}}>
													<Typography
														variant="body2"
														fontWeight={500}>
														{job.company}
													</Typography>
													<Typography variant="body2">•</Typography>
													<Typography variant="body2">{job.loc}</Typography>
												</Box>
											</Box>
											<Box
												className="apply-text"
												sx={{
													display: 'flex',
													alignItems: 'center',
													gap: 0.5,
													color: '#137fec',
													fontWeight: 700,
													fontSize: '0.875rem',
													opacity: 0,
													transform: 'translateY(8px)',
													transition: 'all 0.2s',
													mt: 1,
												}}>
												Apply Now <ArrowForwardIcon sx={{ fontSize: 16 }} />
											</Box>
										</CardContent>
									</Card>
								</Grid>
							))}
						</Grid>
					</Box>
				</Box>

				{/* Value Proposition Section */}
				<Box
					sx={{
						width: '100%',
						bgcolor: isDarkMode ? 'rgba(28, 33, 39, 0.3)' : '#f1f5f9',
						py: 10,
						px: { xs: 2, md: 5 },
						display: 'flex',
						justifyContent: 'center',
					}}>
					<Box
						sx={{
							width: '100%',
							maxWidth: '960px',
							display: 'flex',
							flexDirection: 'column',
							gap: 6,
						}}>
						<Box sx={{ textAlign: 'center', maxWidth: '600px', mx: 'auto' }}>
							<Typography
								variant="h2"
								sx={{
									fontSize: '2rem',
									fontWeight: 700,
									color: isDarkMode ? '#fff' : '#111418',
									letterSpacing: '-0.033em',
									mb: 1.5,
								}}>
								Why Choose 247HR
							</Typography>
							<Typography
								variant="body1"
								sx={{ color: isDarkMode ? '#9dabb9' : '#64748b' }}>
								A unified platform designed to bridge the gap between talent acquisition and career growth.
							</Typography>
						</Box>

						<Grid
							container
							spacing={3}>
							{/* For Companies */}
							<Grid
								item
								xs={12}
								md={6}
								size={6}>
								<Box
									sx={{
										'p': 4,
										'borderRadius': 3,
										'border': `1px solid ${isDarkMode ? '#3b4754' : '#e5e7eb'}`,
										'background': isDarkMode ? 'linear-gradient(135deg, #1c2127 0%, #161b22 100%)' : '#fff',
										'display': 'flex',
										'flexDirection': { xs: 'column', md: 'row' },
										'gap': 3,
										'alignItems': 'flex-start',
										'transition': 'border-color 0.2s',
										'&:hover': { borderColor: 'rgba(19, 127, 236, 0.3)' },
									}}>
									<Box
										sx={{
											p: 2,
											borderRadius: '50%',
											bgcolor: 'rgba(19, 127, 236, 0.2)', // primary/20
											color: '#137fec',
											display: 'flex',
											flexShrink: 0,
										}}>
										<BusinessCenterIcon sx={{ fontSize: 32 }} />
									</Box>
									<Box>
										<Typography
											variant="h5"
											sx={{
												fontWeight: 700,
												color: isDarkMode ? '#fff' : '#111418',
												mb: 1.5,
											}}>
											For Companies
										</Typography>
										<Typography
											variant="body1"
											sx={{
												color: isDarkMode ? '#9dabb9' : '#64748b',
												lineHeight: 1.6,
												mb: 2,
											}}>
											Built for Modern HR Teams. Automate payroll and accelerate hiring with AI-powered applicant reviews. Manage benefits and post jobs instantly to
											thousands of qualified candidates.
										</Typography>
										<Link
											to="/register" // Assuming companies register here
											style={{
												color: '#137fec',
												fontSize: '0.875rem',
												fontWeight: 700,
												textDecoration: 'none',
											}}>
											Learn about Employer Tools
										</Link>
									</Box>
								</Box>
							</Grid>

							{/* For Job Seekers */}
							<Grid
								item
								xs={12}
								md={6}
								size={6}>
								<Box
									sx={{
										'p': 4,
										'borderRadius': 3,
										'border': `1px solid ${isDarkMode ? '#3b4754' : '#e5e7eb'}`,
										'background': isDarkMode ? 'linear-gradient(135deg, #1c2127 0%, #161b22 100%)' : '#fff',
										'display': 'flex',
										'flexDirection': { xs: 'column', md: 'row' },
										'gap': 3,
										'alignItems': 'flex-start',
										'transition': 'border-color 0.2s',
										'&:hover': { borderColor: 'rgba(19, 127, 236, 0.3)' },
									}}>
									<Box
										sx={{
											p: 2,
											borderRadius: '50%',
											bgcolor: 'rgba(19, 127, 236, 0.2)',
											color: '#137fec',
											display: 'flex',
											flexShrink: 0,
										}}>
										<PersonSearchIcon sx={{ fontSize: 32 }} />
									</Box>
									<Box>
										<Typography
											variant="h5"
											sx={{
												fontWeight: 700,
												color: isDarkMode ? '#fff' : '#111418',
												mb: 1.5,
											}}>
											For Job Seekers
										</Typography>
										<Typography
											variant="body1"
											sx={{
												color: isDarkMode ? '#9dabb9' : '#64748b',
												lineHeight: 1.6,
												mb: 2,
											}}>
											Find Roles That Fit You. Smart matching technology to get your profile in front of managers. Create one profile and apply with a single click.
										</Typography>
										<Link
											to="/applicant-register"
											style={{
												color: '#137fec',
												fontSize: '0.875rem',
												fontWeight: 700,
												textDecoration: 'none',
											}}>
											Create your Candidate Profile
										</Link>
									</Box>
								</Box>
							</Grid>
						</Grid>
					</Box>
				</Box>
			</Box>

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
};

export default Home;
