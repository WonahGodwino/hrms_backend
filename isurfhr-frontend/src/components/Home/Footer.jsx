import React from 'react';
import { Box, Typography, Container, Grid, Link, Divider, IconButton } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ShareIcon from '@mui/icons-material/Share';
import LanguageIcon from '@mui/icons-material/Language';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';

const footerLinks = [
	{
		heading: 'Modules',
		links: ['Recruitment', 'Payroll Engine', 'Performance', 'Core HR'],
	},
	{
		heading: 'Platform',
		links: ['Infrastructure', 'Security', 'API Docs', 'Compliance'],
	},
	{
		heading: 'Support',
		links: ['Help Center', 'Case Studies', 'Knowledge Base', 'Contact'],
	},
];

const socialIcons = [
	{ icon: <ShareIcon sx={{ fontSize: 18 }} />, label: 'Share', href: '#' },
	{ icon: <LanguageIcon sx={{ fontSize: 18 }} />, label: 'Website', href: '#' },
	{ icon: <AlternateEmailIcon sx={{ fontSize: 18 }} />, label: 'Email', href: '#' },
];

const legalLinks = ['Privacy Policy', 'Terms of Service', 'Cookie Settings'];

export const Footer = () => {
	return (
		<Box
			component="footer"
			sx={{
				bgcolor: 'white',
				borderTop: '1px solid',
				borderColor: 'grey.100',
				pt: { xs: 6, md: 8 },
				pb: 4,
			}}>
			<Container
				sx={{ width: { xs: '95%', md: '90%' }, margin: '0 auto' }}
				maxWidth={false}>
				<Grid
					container
					spacing={{ xs: 5, md: 4 }}>
					{/* Brand Column */}
					<Grid
						item
						size={{ xs: 12, sm: 6, md: 3 }}>
						{/* Logo */}
						<Box
							component="a"
							href="/"
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 1,
								textDecoration: 'none',
								mb: 2,
							}}>
							<Box
								sx={{
									width: 32,
									height: 32,
									bgcolor: 'primary.main',
									borderRadius: 1.5,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
								}}>
								<AccountBalanceIcon sx={{ color: 'white', fontSize: 17 }} />
							</Box>
							<Typography
								sx={{
									fontWeight: 700,
									fontSize: '1rem',
									color: 'grey.900',
									letterSpacing: '-0.3px',
								}}>
								247HR
							</Typography>
						</Box>

						{/* Tagline */}
						<Typography
							sx={{
								fontSize: '0.875rem',
								color: '#475569',
								lineHeight: 1.7,
								mb: 3,
								maxWidth: 220,
							}}>
							Building the technological foundation for the future of work. Simple. Unified. Secure.
						</Typography>

						{/* Social Icons */}
						<Box sx={{ display: 'flex', gap: 0.5 }}>
							{socialIcons.map((item) => (
								<IconButton
									key={item.label}
									component="a"
									href={item.href}
									aria-label={item.label}
									size="small"
									sx={{
										'color': '#475569',
										'&:hover': { color: 'primary.main', bgcolor: 'transparent' },
									}}>
									{item.icon}
								</IconButton>
							))}
						</Box>
					</Grid>

					{/* Spacer on desktop */}
					<Grid
						item
						size={{ md: 1 }}
						sx={{ display: { xs: 'none', md: 'block' } }}
					/>

					{/* Link Columns */}
					{footerLinks.map((col) => (
						<Grid
							item
							size={{ xs: 6, sm: 4, md: 2.5 }}
							key={col.heading}>
							<Typography
								sx={{
									fontWeight: 700,
									fontSize: '0.875rem',
									color: 'grey.900',
									mb: 2,
								}}>
								{col.heading}
							</Typography>
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
								{col.links.map((link) => (
									<Link
										key={link}
										href="#"
										underline="none"
										sx={{
											'fontSize': '0.875rem',
											'color': '#475569',
											'transition': 'color 0.15s',
											'&:hover': { color: 'primary.main' },
										}}>
										{link}
									</Link>
								))}
							</Box>
						</Grid>
					))}
				</Grid>

				{/* Divider */}
				<Divider sx={{ mt: { xs: 5, md: 6 }, mb: 3, borderColor: 'grey.100' }} />

				{/* Bottom Bar */}
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						justifyContent: 'space-between',
						alignItems: { xs: 'flex-start', sm: 'center' },
						gap: 2,
					}}>
					<Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>© 2026 ISURF Global Services Limited. All rights reserved.</Typography>

					<Box sx={{ display: 'flex', gap: { xs: 2, md: 3 }, flexWrap: 'wrap' }}>
						{legalLinks.map((item) => (
							<Link
								key={item}
								href="#"
								underline="none"
								sx={{
									'fontSize': '0.8rem',
									'color': '#475569',
									'transition': 'color 0.15s',
									'&:hover': { color: 'grey.700' },
								}}>
								{item}
							</Link>
						))}
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
