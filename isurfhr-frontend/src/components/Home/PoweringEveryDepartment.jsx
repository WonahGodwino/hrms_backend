import React from 'react';
import { Box, Typography, Container, Grid, Card, CardContent, Link } from '@mui/material';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GavelIcon from '@mui/icons-material/Gavel';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AccountBoxOutlinedIcon from '@mui/icons-material/AccountBoxOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import { useInView } from 'react-intersection-observer';
import { keyframes } from '@mui/system';

const modules = [
	{
		icon: <PersonAddAltIcon sx={{ fontSize: 26 }} />,
		iconBg: '#eff6ff',
		iconColor: '#3b82f6',
		title: 'Recruitment & ATS',
		description: 'Pipeline management, automated interview scheduling, and AI-powered candidate scoring.',
		progress: 75,
	},
	{
		icon: <AccountBoxOutlinedIcon sx={{ fontSize: 26 }} />,
		iconBg: '#eff6ff',
		iconColor: '#6366f1',
		title: 'Staff Management',
		description: 'Complete digital records, document repository, and lifecycle event tracking for all staff.',
		progress: 100,
	},
	{
		icon: <AccessTimeIcon sx={{ fontSize: 26 }} />,
		iconBg: '#ECFEFF',
		iconColor: '#0ea5e9',
		title: 'Time & Attendance',
		description: 'Biometric integration, geo-fenced clock-ins, and automated leave management workflows.',
		progress: 80,
	},
	{
		icon: <AssignmentTurnedInOutlinedIcon sx={{ fontSize: 26 }} />,
		iconBg: '#fff7ed',
		iconColor: '#f97316',
		title: 'Task Management',
		description: 'Collaborative project tracking, daily tasks, and OKR monitoring for performance clarity.',
		progress: 50,
	},
	{
		icon: <PaymentsOutlinedIcon sx={{ fontSize: 26 }} />,
		iconBg: '#f0fdf4',
		iconColor: '#22c55e',
		title: 'Automated Payroll',
		description: 'One-click processing, multi-currency support, and direct bank integration for global pay.',
		progress: 100,
	},
	{
		icon: <GavelIcon sx={{ fontSize: 26 }} />,
		iconBg: '#fef2f2',
		iconColor: '#ef4444',
		title: 'Reporting & Compliance',
		description: 'Statutory reports, tax compliance, and audit-ready data export for local regulations.',
		progress: 80,
	},
];
// Creative animation keyframes
const slideInRotate = keyframes`
  from {
    opacity: 0;
    transform: translateX(-30px) rotate(-2deg);
  }
  to {
    opacity: 1;
    transform: translateX(0) rotate(0);
  }
`;

const slideInScale = keyframes`
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const slideInSkew = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px) skewX(-3deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) skewX(0);
  }
`;

const popIn = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  80% {
    transform: scale(1.02);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

const floatIn = keyframes`
  0% {
    opacity: 0;
    transform: translateY(40px);
  }
  60% {
    transform: translateY(-5px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`;

const glowPulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.3);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(33, 150, 243, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0);
  }
`;

export const PoweringEveryDepartment = () => {
	const [headerRef, headerInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [cardsRef, cardsInView] = useInView({
		threshold: 0.2,
		triggerOnce: true,
	});

	const getAnimation = (index) => {
		const animations = [slideInRotate, slideInScale, slideInSkew, popIn, floatIn];
		return animations[index % animations.length];
	};

	return (
		<Box
			component="section"
			id="product"
			sx={{
				py: { xs: 8, md: 10 },
				bgcolor: '#f8f9fb',
				position: 'relative',
				overflow: 'hidden',
			}}>
			<Container
				maxWidth={false}
				sx={{
					width: '90%',
					margin: '0 auto',
					position: 'relative',
					zIndex: 2,
				}}>
				{/* Section Header */}
				<Box
					ref={headerRef}
					sx={{
						display: 'flex',
						alignItems: { md: 'flex-end' },
						justifyContent: 'space-between',
						flexDirection: { xs: 'column', md: 'row' },
						gap: 2,
						mb: { xs: 5, md: 6 },
						opacity: headerInView ? 1 : 0,
						transform: headerInView ? 'translateY(0)' : 'translateY(20px)',
						transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
					}}>
					<Box>
						<Typography
							sx={{
								fontWeight: 700,
								fontSize: '0.78rem',
								letterSpacing: '0.1em',
								color: 'primary.main',
								textTransform: 'uppercase',
								mb: 0.8,
								opacity: headerInView ? 1 : 0,
								transform: headerInView ? 'translateX(0)' : 'translateX(-10px)',
								transition: 'opacity 0.6s ease-out 0.1s, transform 0.6s ease-out 0.1s',
							}}>
							Modules
						</Typography>
						<Typography
							variant="h4"
							component="h2"
							sx={{
								fontWeight: 800,
								fontSize: { xs: '1.8rem', md: '2.2rem' },
								color: 'grey.900',
								lineHeight: 1.15,
								opacity: headerInView ? 1 : 0,
								transform: headerInView ? 'translateX(0)' : 'translateX(-10px)',
								transition: 'opacity 0.6s ease-out 0.2s, transform 0.6s ease-out 0.2s',
							}}>
							Powering Every Department
						</Typography>
					</Box>

					<Link
						href="#modules"
						underline="none"
						sx={{
							'display': 'flex',
							'alignItems': 'center',
							'gap': 0.5,
							'color': 'primary.main',
							'fontWeight': 600,
							'fontSize': '0.9rem',
							'whiteSpace': 'nowrap',
							'opacity': headerInView ? 1 : 0,
							'transform': headerInView ? 'translateX(0)' : 'translateX(10px)',
							'transition': 'opacity 0.6s ease-out 0.3s, transform 0.6s ease-out 0.3s, gap 0.2s ease',
							'&:hover': {
								'gap': 1,
								'& .MuiSvgIcon-root': {
									transform: 'translateX(4px)',
								},
							},
						}}>
						Explore all modules
						<ArrowForwardIcon
							sx={{
								fontSize: 18,
								transition: 'transform 0.3s ease',
							}}
						/>
					</Link>
				</Box>

				{/* Cards Grid */}
				<Grid
					ref={cardsRef}
					container
					spacing={2.5}>
					{modules.map((mod, index) => {
						const animation = getAnimation(index);
						const delay = index * 0.15;

						return (
							<Grid
								item
								size={{ xs: 12, sm: 6, md: 4 }}
								key={mod.title}
								sx={{
									opacity: 0,
									animation: cardsInView ? `${animation} 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s forwards` : 'none',
								}}>
								<Card
									elevation={0}
									sx={{
										'height': '100%',
										'borderRadius': 1,
										'bgcolor': 'white',
										'transition': 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
										'cursor': 'pointer',
										'boxShadow': 'none !important',
										'border': '1px solid #e0e0e0',
										'position': 'relative',
										'overflow': 'hidden',
										'&::before': {
											content: '""',
											position: 'absolute',
											top: 0,
											left: 0,
											width: '100%',
											height: '100%',
											background: `linear-gradient(135deg, ${mod.iconColor}10, transparent 60%)`,
											opacity: 0,
											transition: 'opacity 0.4s ease',
										},
										// Unique hover effects for each card
										'&:hover': {
											'borderColor': mod.iconColor, // This line changes border to match icon color
											'transform': 'translateY(-8px) scale(1.02)',
											'boxShadow': `0 20px 40px -12px ${mod.iconColor}80 !important`,
											'&::before': {
												opacity: 1,
											},
											'& .module-icon': {
												transform: 'scale(1.1) rotate(5deg)',
												bgcolor: mod.iconColor,
												color: 'white',
											},
											'& .progress-bar': {
												width: '100% !important',
												bgcolor: mod.iconColor,
											},
											'& .module-title': {
												color: mod.iconColor,
											},
										},
									}}>
									<CardContent sx={{ p: 3, pb: '24px !important', position: 'relative', zIndex: 1 }}>
										{/* Icon with unique animation on hover */}
										<Box
											className="module-icon"
											sx={{
												'width': 44,
												'height': 44,
												'borderRadius': 1,
												'bgcolor': mod.iconBg,
												'display': 'flex',
												'alignItems': 'center',
												'justifyContent': 'center',
												'color': mod.iconColor,
												'mb': 2.5,
												'transition': 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
												'& svg': {
													fontSize: 24,
													transition: 'transform 0.3s ease',
												},
											}}>
											{mod.icon}
										</Box>

										{/* Title */}
										<Typography
											className="module-title"
											sx={{
												fontWeight: 700,
												fontSize: '1rem',
												color: 'grey.900',
												mb: 1,
												transition: 'color 0.3s ease',
											}}>
											{mod.title}
										</Typography>

										{/* Description */}
										<Typography
											sx={{
												fontSize: '0.875rem',
												color: 'grey.500',
												lineHeight: 1.65,
												mb: 2.5,
												transition: 'color 0.3s ease',
											}}>
											{mod.description}
										</Typography>

										{/* Bottom accent line with unique behavior */}
										<Box
											className="progress-bar"
											sx={{
												'height': 3,
												'width': `${mod.progress}%`,
												'bgcolor': 'primary.main',
												'borderRadius': 4,
												'transition': 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
												'position': 'relative',
												'&::after': {
													content: '""',
													position: 'absolute',
													top: -2,
													right: -2,
													width: 7,
													height: 7,
													borderRadius: '50%',
													bgcolor: 'primary.main',
													opacity: 0,
													transition: 'opacity 0.3s ease',
												},
											}}
										/>

										{/* Pulse animation on hover */}
										<Box
											sx={{
												'position': 'absolute',
												'top': '50%',
												'left': '50%',
												'width': '100%',
												'height': '100%',
												'borderRadius': 1,
												'pointerEvents': 'none',
												'&:hover': {
													animation: `${glowPulse} 2s infinite`,
												},
											}}
										/>
									</CardContent>
								</Card>
							</Grid>
						);
					})}
				</Grid>
			</Container>

			{/* Decorative background elements */}
			<Box
				sx={{
					position: 'absolute',
					top: '20%',
					right: '5%',
					width: 200,
					height: 200,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(33,150,243,0.03) 0%, transparent 70%)',
					pointerEvents: 'none',
					zIndex: 0,
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					bottom: '10%',
					left: '5%',
					width: 150,
					height: 150,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(33,150,243,0.02) 0%, transparent 70%)',
					pointerEvents: 'none',
					zIndex: 0,
				}}
			/>
		</Box>
	);
};
