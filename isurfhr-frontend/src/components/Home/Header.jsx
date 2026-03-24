import React, { useState } from 'react';
import {
	AppBar,
	Toolbar,
	Box,
	Button,
	IconButton,
	Drawer,
	Link,
	// List,
	// ListItem,
	// ListItemButton,
	// ListItemText,
	Divider,
	Typography,
	useMediaQuery,
	useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

import { keyframes } from '@mui/system';

const navLinks = [
	{ label: 'Product', href: '/#product' },
	{ label: 'Solutions', href: '/#solutions' },
	{ label: 'Pricing', href: '/pricing' },
	{ label: 'Enterprise', href: '/#enterprise' },
];

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

export const Header = ({ ctaType = 'demo' }) => {
	const [drawerOpen, setDrawerOpen] = useState(false);
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('md'));

	const toggleDrawer = () => setDrawerOpen((prev) => !prev);

	const ctaConfig = {
		demo: {
			text: 'Request a Demo',
			href: '/request-demo',
			color: 'primary.main',
			hoverColor: 'primary.dark',
		},
		sales: {
			text: 'Contact Sales',
			href: '/contact-sales',
			color: 'secondary.main', // or any color you want
			hoverColor: 'secondary.dark',
		},
	};

	const currentCta = ctaConfig[ctaType];

	return (
		<>
			<AppBar
				position="sticky"
				elevation={0}
				sx={{
					bgcolor: 'rgba(255, 255, 255, 0.8)',
					backdropFilter: 'blur(10px)',
					borderBottom: '1px solid',
					borderColor: 'grey.100',
				}}>
				<Toolbar
					sx={{
						width: '90%',
						mx: 'auto',
						px: { xs: 1, md: 2 },
						height: 64,
						display: 'flex',
						justifyContent: 'space-between',
					}}>
					<Box
						component="a"
						href="/"
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1,
							textDecoration: 'none',
						}}>
						<Box
							sx={{
								'width': 50,
								'height': 50,
								'borderRadius': 1,
								'display': 'flex',
								'alignItems': 'center',
								'justifyContent': 'center',
								'transition': 'transform 0.2s ease',
								'overflow': 'hidden',
								'&:hover': {
									transform: 'scale(1.05)',
								},
							}}>
							<Box
								component="img"
								src="/logo.png"
								alt="247HR logo"
								sx={{
									width: '100%',
									height: '100%',
									objectFit: 'cover',
								}}
							/>
						</Box>
					</Box>

					{/* Desktop Nav */}
					{!isMobile && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
							{navLinks.map((link) => (
								<Box
									key={link.label}
									component="a"
									href={link.href}
									sx={{
										'fontSize': '0.9rem',
										'fontWeight': 500,
										'color': 'grey.600',
										'textDecoration': 'none',
										'transition': 'color 0.15s',
										'position': 'relative',
										'&::after': {
											content: '""',
											position: 'absolute',
											bottom: -4,
											left: 0,
											width: '0%',
											height: '2px',
											bgcolor: 'primary.main',
											transition: 'width 0.2s ease',
										},
										'&:hover': {
											'color': 'grey.900',
											'&::after': {
												width: '100%',
											},
										},
									}}>
									{link.label}
								</Box>
							))}
						</Box>
					)}

					{/* Desktop CTA */}
					{!isMobile && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
							<Button
								href="/login"
								sx={{
									'fontSize': '0.9rem',
									'fontWeight': 500,
									'color': 'grey.600',
									'textTransform': 'none',
									'position': 'relative',
									'&::after': {
										content: '""',
										position: 'absolute',
										bottom: 0,
										left: '50%',
										transform: 'translateX(-50%)',
										width: '0%',
										height: '2px',
										bgcolor: 'primary.main',
										transition: 'width 0.2s ease',
									},
									'&:hover': {
										'color': 'primary.main',
										'bgcolor': 'transparent',
										'&::after': {
											width: '80%',
										},
									},
								}}>
								Login
							</Button>
							<Button
								// href="/request-demo"
								href={currentCta.href}
								variant="contained"
								disableElevation
								sx={{
									'fontSize': '0.9rem',
									'fontWeight': 600,
									'textTransform': 'none',
									'borderRadius': 1,
									'px': 2.5,
									'py': 1,
									'bgcolor': 'primary.main',
									'position': 'relative',
									'overflow': 'hidden',
									'&::after': {
										content: '""',
										position: 'absolute',
										top: 0,
										left: '-100%',
										width: '100%',
										height: '100%',
										background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
										transition: 'left 0.5s ease',
									},
									'&:hover': {
										'bgcolor': 'primary.dark',
										'&::after': {
											left: '100%',
										},
									},
								}}>
								{currentCta.text}
							</Button>
						</Box>
					)}

					{/* Mobile Menu Toggle */}
					{isMobile && (
						<IconButton
							onClick={toggleDrawer}
							sx={{
								'color': 'grey.700',
								'border': '1px solid',
								'borderColor': drawerOpen ? 'primary.main' : 'grey.200',
								'bgcolor': drawerOpen ? 'rgba(33,150,243,0.04)' : 'transparent',
								'transition': 'all 0.2s ease',
								'&:hover': {
									bgcolor: 'rgba(33,150,243,0.04)',
									borderColor: 'primary.main',
								},
							}}>
							{drawerOpen ? <CloseIcon /> : <MenuIcon />}
						</IconButton>
					)}
				</Toolbar>
			</AppBar>

			{/* Mobile Drawer - Redesigned */}
			<Drawer
				anchor="top"
				open={drawerOpen}
				onClose={toggleDrawer}
				sx={{
					'& .MuiDrawer-paper': {
						top: 64,
						background: 'rgba(255, 255, 255, 0.98)',
						backdropFilter: 'blur(10px)',
						boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)',
						borderBottom: '1px solid',
						borderColor: 'grey.100',
						minHeight: 'calc(100vh - 64px)',
						display: 'flex',
						flexDirection: 'column',
					},
				}}>
				<Box
					sx={{
						px: 3,
						py: 4,
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						gap: 3,
					}}>
					{/* Navigation Links */}
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
						{navLinks.map((link, index) => (
							<Box
								key={link.label}
								sx={{
									opacity: 0,
									animation: drawerOpen ? `${slideIn} 0.3s ease-out ${index * 0.05}s forwards` : 'none',
								}}>
								<Button
									component="a"
									href={link.href}
									onClick={toggleDrawer}
									fullWidth
									sx={{
										'justifyContent': 'flex-start',
										'py': 1.5,
										'px': 2,
										'borderRadius': 2,
										'fontSize': '1rem',
										'fontWeight': 500,
										'color': 'grey.700',
										'textTransform': 'none',
										'transition': 'all 0.2s ease',
										'&:hover': {
											bgcolor: 'rgba(33,150,243,0.04)',
											color: 'primary.main',
											transform: 'translateX(8px)',
										},
									}}>
									{link.label}
								</Button>
							</Box>
						))}
					</Box>

					{/* Divider with animation */}
					<Box
						sx={{
							opacity: 0,
							animation: drawerOpen ? `${fadeIn} 0.3s ease-out 0.3s forwards` : 'none',
						}}>
						<Divider
							sx={{
								'borderColor': 'grey.200',
								'&::before, &::after': {
									borderColor: 'grey.200',
								},
							}}>
							<Typography
								variant="caption"
								sx={{ color: 'grey.400', px: 1 }}>
								Account
							</Typography>
						</Divider>
					</Box>

					{/* Account Section */}
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
						<Box
							sx={{
								opacity: 0,
								animation: drawerOpen ? `${slideIn} 0.3s ease-out 0.35s forwards` : 'none',
							}}>
							<Button
								component="a"
								href="/login"
								onClick={toggleDrawer}
								fullWidth
								variant="outlined"
								sx={{
									'py': 1.5,
									'borderRadius': 2,
									'fontSize': '0.95rem',
									'fontWeight': 600,
									'textTransform': 'none',
									'borderColor': 'grey.300',
									'color': 'grey.700',
									'transition': 'all 0.2s ease',
									'&:hover': {
										borderColor: 'primary.main',
										color: 'primary.main',
										bgcolor: 'rgba(33,150,243,0.04)',
										transform: 'translateY(-2px)',
										boxShadow: '0 4px 12px rgba(33,150,243,0.15)',
									},
								}}>
								Log in
							</Button>
						</Box>

						<Box
							sx={{
								opacity: 0,
								animation: drawerOpen ? `${slideIn} 0.3s ease-out 0.4s forwards` : 'none',
							}}>
							<Button
								component="a"
								href={currentCta.href}
								onClick={toggleDrawer}
								fullWidth
								variant="contained"
								disableElevation
								sx={{
									'py': 1.5,
									'borderRadius': 2,
									'fontSize': '0.95rem',
									'fontWeight': 600,
									'textTransform': 'none',
									'bgcolor': 'primary.main',
									'position': 'relative',
									'overflow': 'hidden',
									'transition': 'all 0.2s ease',
									'&::after': {
										content: '""',
										position: 'absolute',
										top: 0,
										left: '-100%',
										width: '100%',
										height: '100%',
										background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
										transition: 'left 0.5s ease',
									},
									'&:hover': {
										'bgcolor': 'primary.dark',
										'transform': 'translateY(-2px)',
										'boxShadow': '0 8px 20px rgba(33,150,243,0.3)',
										'&::after': {
											left: '100%',
										},
									},
								}}>
								{currentCta.text}
							</Button>
						</Box>
					</Box>

					{/* Footer Links */}
					<Box
						sx={{
							mt: 'auto',
							pt: 4,
							opacity: 0,
							animation: drawerOpen ? `${fadeIn} 0.3s ease-out 0.45s forwards` : 'none',
						}}>
						<Box sx={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
							<Link
								href="#"
								underline="none"
								sx={{
									'fontSize': '0.8rem',
									'color': 'grey.400',
									'transition': 'color 0.2s ease',
									'&:hover': {
										color: 'primary.main',
									},
								}}>
								Privacy
							</Link>
							<Link
								href="#"
								underline="none"
								sx={{
									'fontSize': '0.8rem',
									'color': 'grey.400',
									'transition': 'color 0.2s ease',
									'&:hover': {
										color: 'primary.main',
									},
								}}>
								Terms
							</Link>
							<Link
								href="#"
								underline="none"
								sx={{
									'fontSize': '0.8rem',
									'color': 'grey.400',
									'transition': 'color 0.2s ease',
									'&:hover': {
										color: 'primary.main',
									},
								}}>
								Contact
							</Link>
						</Box>
						<Typography
							variant="caption"
							sx={{
								display: 'block',
								textAlign: 'center',
								mt: 2,
								color: 'grey.300',
								fontSize: '0.7rem',
							}}>
							© 2026 247HR. All rights reserved.
						</Typography>
					</Box>
				</Box>
			</Drawer>
		</>
	);
};
