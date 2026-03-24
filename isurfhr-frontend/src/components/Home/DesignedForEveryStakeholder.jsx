import React from 'react';
import { Box, Typography, Container, Grid, Link } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import { useInView } from 'react-intersection-observer';
import { keyframes } from '@mui/system';

const stakeholders = [
	{
		icon: <PsychologyOutlinedIcon sx={{ fontSize: 26, color: '#1e293b' }} />,
		title: 'HR Managers',
		description: 'Focus on culture, not paperwork. Automate administrative tasks and streamline complex onboarding workflows with ease.',
		linkLabel: 'HR Solutions',
		href: '#hr-solutions',
	},
	{
		icon: <AccountBalanceIcon sx={{ fontSize: 26, color: '#1e293b' }} />,
		title: 'Finance & Payroll',
		description: 'Ensure 100% accuracy in payroll processing. Get detailed labor cost reports and maintain effortless tax compliance.',
		linkLabel: 'Finance Tools',
		href: '#finance-tools',
	},
	{
		icon: <LeaderboardOutlinedIcon sx={{ fontSize: 26, color: '#1e293b' }} />,
		title: 'Leadership',
		description: 'Make data-driven decisions with real-time workforce analytics. Gain visibility into headcount trends and strategic growth.',
		linkLabel: 'Executive Insights',
		href: '#executive-insights',
	},
];

const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const bounceIn = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.05);
  }
  80% {
    transform: scale(0.95);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

const pulseRing = keyframes`
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.3);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(33, 150, 243, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0);
  }
`;

const slideInLeft = keyframes`
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const slideInRight = keyframes`
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const float = keyframes`
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-8px);
  }
  100% {
    transform: translateY(0px);
  }
`;

const shimmer = keyframes`
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
`;

const rotateIn = keyframes`
  from {
    opacity: 0;
    transform: rotate(-180deg) scale(0.3);
  }
  to {
    opacity: 1;
    transform: rotate(0) scale(1);
  }
`;

export const DesignedForEveryStakeholder = () => {
	const [titleRef, titleInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [cardsRef, cardsInView] = useInView({
		threshold: 0.2,
		triggerOnce: true,
	});

	// Different entrance animations for each card
	const cardEntranceAnimations = [slideInLeft, bounceIn, slideInRight];
	const iconAnimations = [rotateIn, bounceIn, rotateIn];
	const hoverAnimations = [float, pulseRing, float];

	return (
		<Box
			component="section"
			sx={{
				py: { xs: 8, md: 11 },
				bgcolor: 'white',
				position: 'relative',
				overflow: 'hidden',
				minHeight: '85dvh',
			}}>
			{/* Decorative background elements */}
			<Box
				sx={{
					position: 'absolute',
					top: '15%',
					left: '5%',
					width: 200,
					height: 200,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(33,150,243,0.02) 0%, transparent 70%)',
					pointerEvents: 'none',
					zIndex: 0,
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					bottom: '10%',
					right: '5%',
					width: 250,
					height: 250,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(33,150,243,0.02) 0%, transparent 70%)',
					pointerEvents: 'none',
					zIndex: 0,
				}}
			/>

			<Container
				maxWidth={false}
				sx={{
					width: '90%',
					margin: '0 auto',
					position: 'relative',
					zIndex: 1,
				}}>
				{/* Heading with animation */}
				<Box ref={titleRef}>
					<Typography
						variant="h4"
						component="h2"
						sx={{
							'textAlign': 'center',
							'fontWeight': 800,
							'fontSize': { xs: '1.7rem', md: '2.1rem' },
							'color': '#0f172a',
							'mb': { xs: 6, md: 8 },
							'opacity': titleInView ? 1 : 0,
							'transform': titleInView ? 'translateY(0)' : 'translateY(30px)',
							'transition': 'opacity 0.7s ease-out, transform 0.7s ease-out',
							'position': 'relative',
							'display': 'inline-block',
							'width': '100%',
							'&::after': {
								content: '""',
								position: 'absolute',
								bottom: -10,
								left: '50%',
								transform: titleInView ? 'translateX(-50%) scaleX(1)' : 'translateX(-50%) scaleX(0)',
								width: 80,
								height: 3,
								bgcolor: 'primary.main',
								borderRadius: 2,
								transition: 'transform 0.8s ease-out 0.3s',
							},
						}}>
						Designed for Every Stakeholder
					</Typography>
				</Box>

				{/* Cards */}
				<Grid
					ref={cardsRef}
					container
					spacing={{ xs: 5, md: 6 }}>
					{stakeholders.map((item, index) => {
						const EntranceAnimation = cardEntranceAnimations[index];
						const IconAnimation = iconAnimations[index];
						const HoverAnimation = hoverAnimations[index];

						return (
							<Grid
								item
								size={{ xs: 12, md: 4 }}
								key={item.title}
								sx={{
									opacity: 0,
									animation: cardsInView ? `${EntranceAnimation} 0.8s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.15}s forwards` : 'none',
								}}>
								<Box
									sx={{
										'display': 'flex',
										'flexDirection': 'column',
										'gap': 2,
										'p': 3,
										'borderRadius': 2,
										'transition': 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
										'position': 'relative',
										'height': '100%',
										'background': 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
										'boxShadow': '0 4px 20px -8px rgba(0,0,0,0.1)',
										'border': '1px solid #f0f0f0',
										'&:hover': {
											'transform': 'translateY(-8px)',
											'boxShadow': '0 20px 40px -12px rgba(33,150,243,0.3)',
											'borderColor': 'primary.main',
											'& .stakeholder-icon': {
												'transform': 'scale(1.1) rotate(5deg)',
												'bgcolor': 'primary.main',
												'& svg': {
													color: 'white !important',
												},
											},
											'& .stakeholder-title': {
												color: 'primary.main',
											},
											'& .stakeholder-link': {
												'gap': 1.5,
												'& svg': {
													transform: 'translateX(4px)',
												},
											},
										},
									}}>
									{/* Icon circle with entrance animation */}
									<Box
										className="stakeholder-icon"
										sx={{
											'width': 56,
											'height': 56,
											'borderRadius': '50%',
											'bgcolor': '#f1f5f9',
											'display': 'flex',
											'alignItems': 'center',
											'justifyContent': 'center',
											'mb': 0.5,
											'transition': 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
											'position': 'relative',
											'opacity': 0,
											'animation': cardsInView ? `${IconAnimation} 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.15 + 0.2}s forwards` : 'none',
											'&::after': {
												content: '""',
												position: 'absolute',
												top: -4,
												left: -4,
												right: -4,
												bottom: -4,
												borderRadius: '50%',
												border: '2px solid transparent',
												transition: 'border-color 0.3s ease',
											},
											'&:hover::after': {
												animation: cardsInView ? `${HoverAnimation} 2s infinite` : 'none',
											},
										}}>
										{item.icon}
									</Box>

									{/* Title with hover effect */}
									<Typography
										className="stakeholder-title"
										sx={{
											'fontWeight': 700,
											'fontSize': '1.15rem',
											'color': '#0f172a',
											'transition': 'color 0.3s ease',
											'position': 'relative',
											'display': 'inline-block',
											'&::before': {
												content: '""',
												position: 'absolute',
												bottom: -2,
												left: 0,
												width: 0,
												height: 2,
												bgcolor: 'primary.main',
												transition: 'width 0.3s ease',
											},
											'&:hover::before': {
												width: '100%',
											},
										}}>
										{item.title}
									</Typography>

									{/* Description */}
									<Typography
										sx={{
											fontSize: '0.9rem',
											color: '#475569',
											lineHeight: 1.75,
											transition: 'color 0.3s ease',
										}}>
										{item.description}
									</Typography>

									{/* CTA Link with enhanced hover */}
									<Link
										href={item.href}
										underline="none"
										className="stakeholder-link"
										sx={{
											'display': 'inline-flex',
											'alignItems': 'center',
											'gap': 0.5,
											'color': 'primary.main',
											'fontWeight': 600,
											'fontSize': '0.875rem',
											'mt': 0.5,
											'transition': 'all 0.3s ease',
											'position': 'relative',
											'overflow': 'hidden',
											'&::after': {
												content: '""',
												position: 'absolute',
												bottom: -2,
												left: 0,
												width: '100%',
												height: '1px',
												bgcolor: 'primary.main',
												transform: 'scaleX(0)',
												transformOrigin: 'left',
												transition: 'transform 0.3s ease',
											},
											'&:hover': {
												'gap': 1,
												'&::after': {
													transform: 'scaleX(1)',
												},
												'& svg': {
													transform: 'translateX(4px)',
												},
											},
											'& svg': {
												transition: 'transform 0.3s ease',
											},
										}}>
										{item.linkLabel}
										<ArrowForwardIcon sx={{ fontSize: 16 }} />
									</Link>

									{/* Shimmer effect on hover */}
									<Box
										sx={{
											'position': 'absolute',
											'top': 0,
											'left': 0,
											'right': 0,
											'bottom': 0,
											'background': 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
											'backgroundSize': '200% 100%',
											'borderRadius': 2,
											'opacity': 0,
											'transition': 'opacity 0.3s ease',
											'pointerEvents': 'none',
											'&:hover': {
												opacity: 0.3,
												animation: `${shimmer} 1.5s infinite`,
											},
										}}
									/>
								</Box>
							</Grid>
						);
					})}
				</Grid>

				<Box
					sx={{
						width: '100%',
						height: 1,
						mt: 8,
						background: 'linear-gradient(90deg, transparent, rgba(33,150,243,0.2), transparent)',
					}}
				/>
			</Container>
		</Box>
	);
};
