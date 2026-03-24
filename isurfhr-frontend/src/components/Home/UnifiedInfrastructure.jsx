import React from 'react';
import { Box, Typography, Container, Grid } from '@mui/material';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import InsightsIcon from '@mui/icons-material/Insights';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { useInView } from 'react-intersection-observer';
import { keyframes } from '@mui/system';

const features = [
	{
		icon: <SyncAltIcon sx={{ fontSize: 22, color: 'rgba(255,255,255,0.7)' }} />,
		title: 'Seamless Data Flow',
		description: 'Information captured during recruitment flows directly into payroll and staff records—zero manual re-entry.',
	},
	{
		icon: <InsightsIcon sx={{ fontSize: 22, color: 'rgba(255,255,255,0.7)' }} />,
		title: 'Real-time Analytics',
		description: 'Global dashboards provide instant insights into workforce trends, turnover rates, and financial impact.',
	},
	{
		icon: <VerifiedUserIcon sx={{ fontSize: 22, color: 'rgba(255,255,255,0.7)' }} />,
		title: 'Unified Compliance',
		description: 'Apply labor laws and tax regulations globally from a single control center with automatic updates.',
	},
];

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

const glowPulse = keyframes`
  0% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 0.3;
  }
`;

const slideUpFade = keyframes`
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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

const scaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const wave = keyframes`
  0% {
    transform: rotate(0deg) scale(1);
  }
  25% {
    transform: rotate(1deg) scale(1.02);
  }
  75% {
    transform: rotate(-1deg) scale(0.98);
  }
  100% {
    transform: rotate(0deg) scale(1);
  }
`;

export const UnifiedInfrastructure = () => {
	const [headerRef, headerInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [cardsRef, cardsInView] = useInView({
		threshold: 0.2,
		triggerOnce: true,
	});

	// Different animations for each card
	const cardAnimations = [float, wave, float];

	return (
		<Box
			component="section"
			sx={{
				position: 'relative',
				bgcolor: '#1978E5',
				overflow: 'hidden',
				py: { xs: 8, md: 10 },
			}}>
			{/* Background Arcs with animation */}
			<Box
				sx={{
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					display: { xs: 'none', md: 'block' },
					opacity: headerInView ? 1 : 0,
					transition: 'opacity 1.5s ease-out',
				}}>
				<svg
					viewBox="0 0 1440 900"
					preserveAspectRatio="none"
					style={{
						position: 'absolute',
						bottom: 0,
						left: 0,
						width: '100%',
						height: '100%',
					}}>
					<path
						d="M -200 1050 Q 720 -500 1540 850"
						stroke="rgba(255,255,255,0.25)"
						strokeWidth="3"
						fill="none"
						style={{
							strokeDasharray: 2000,
							strokeDashoffset: headerInView ? 0 : 2000,
							transition: 'stroke-dashoffset 2s ease-out',
						}}
					/>

					<path
						d="M -20 920 Q 720 -120 1440 885"
						stroke="rgba(255,255,255,0.18)"
						strokeWidth="3"
						fill="none"
						style={{
							strokeDasharray: 2000,
							strokeDashoffset: headerInView ? 0 : 2000,
							transition: 'stroke-dashoffset 2s ease-out 0.3s',
						}}
					/>
				</svg>
			</Box>

			<Container
				sx={{
					position: 'relative',
					zIndex: 1,
					width: { xs: '95%', md: '90%' },
					margin: '0 auto',
				}}
				maxWidth={false}>
				{/* Header Section */}
				<Box ref={headerRef}>
					{/* Eyebrow */}
					<Typography
						sx={{
							textAlign: 'center',
							fontWeight: 600,
							fontSize: '0.75rem',
							letterSpacing: '0.18em',
							color: 'rgba(255,255,255,0.9)',
							textTransform: 'uppercase',
							mb: 2.5,
							opacity: headerInView ? 1 : 0,
							transform: headerInView ? 'translateY(0)' : 'translateY(20px)',
							transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
						}}>
						Unified Infrastructure
					</Typography>

					{/* Main Heading */}
					<Typography
						variant="h2"
						component="h2"
						sx={{
							textAlign: 'center',
							fontWeight: 900,
							fontSize: { xs: '2.4rem', sm: '3rem', md: '3.8rem' },
							color: 'white',
							lineHeight: 1.1,
							letterSpacing: '-0.5px',
							mb: 3,
							mx: 'auto',
							opacity: headerInView ? 1 : 0,
							transform: headerInView ? 'translateY(0)' : 'translateY(30px)',
							transition: 'opacity 0.7s ease-out 0.1s, transform 0.7s ease-out 0.1s',
						}}>
						One Platform. Shared Data. Complete Visibility.
					</Typography>

					{/* Subtext */}
					<Typography
						sx={{
							textAlign: 'center',
							fontSize: { xs: '0.95rem', md: '1rem' },
							color: 'rgba(255,255,255,0.85)',
							lineHeight: 1.75,
							maxWidth: 620,
							mx: 'auto',
							mb: { xs: 6, md: 8 },
							opacity: headerInView ? 1 : 0,
							transform: headerInView ? 'translateY(0)' : 'translateY(20px)',
							transition: 'opacity 0.6s ease-out 0.2s, transform 0.6s ease-out 0.2s',
						}}>
						Say goodbye to fragmented tools. 247HR provides a single source of truth for your entire organization, ensuring every department stays in sync.
					</Typography>
				</Box>

				{/* Feature Cards */}
				<Grid
					ref={cardsRef}
					container
					spacing={5}>
					{features.map((feature, index) => {
						// Different entrance animations for each card
						const entranceAnimations = [slideInLeft, scaleIn, slideInRight];
						const EntranceAnimation = entranceAnimations[index];
						const HoverAnimation = cardAnimations[index];

						return (
							<Grid
								item
								size={{ xs: 12, md: 4 }}
								key={feature.title}
								sx={{
									opacity: 0,
									animation: cardsInView ? `${EntranceAnimation} 0.8s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.2}s forwards` : 'none',
								}}>
								<Box
									sx={{
										'bgcolor': 'rgba(255,255,255,0.08)',
										'backdropFilter': 'blur(1px)',
										'border': '1px solid rgba(255,255,255,0.15)',
										'borderRadius': 3,
										'p': { xs: 3, md: 3.5 },
										'height': '100%',
										'transition': 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
										'position': 'relative',
										'overflow': 'hidden',
										'&::before': {
											content: '""',
											position: 'absolute',
											top: 0,
											left: 0,
											right: 0,
											height: '2px',
											background: 'linear-gradient(90deg, transparent, white, transparent)',
											transform: 'translateX(-100%)',
											transition: 'transform 0.6s ease',
										},
										'&:hover': {
											'bgcolor': 'rgba(255,255,255,0.15)',
											'transform': `translateY(-4px) ${index === 1 ? 'scale(1.02)' : ''}`,
											'boxShadow': '0 20px 40px -12px rgba(0,0,0,0.3)',
											'borderColor': 'rgba(255,255,255,0.3)',
											'animation': cardsInView ? `${HoverAnimation} 3s ease-in-out infinite` : 'none',
											'&::before': {
												transform: 'translateX(100%)',
											},
										},
									}}>
									{/* Floating glow effect on hover */}
									<Box
										sx={{
											'position': 'absolute',
											'top': '50%',
											'left': '50%',
											'width': '100%',
											'height': '100%',
											'background': 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1), transparent 70%)',
											'opacity': 0,
											'transition': 'opacity 0.4s ease',
											'transform': 'translate(-50%, -50%)',
											'pointerEvents': 'none',
											'&:hover': {
												opacity: 1,
											},
										}}
									/>

									<Typography
										sx={{
											'fontWeight': 700,
											'fontSize': '1.2rem',
											'color': 'white',
											'mb': 1,
											'position': 'relative',
											'display': 'inline-block',
											'&::after': {
												content: '""',
												position: 'absolute',
												bottom: -2,
												left: 0,
												width: 0,
												height: '2px',
												bgcolor: 'white',
												transition: 'width 0.3s ease',
											},
											'&:hover::after': {
												width: '100%',
											},
										}}>
										{feature.title}
									</Typography>

									<Typography
										sx={{
											'width': { lg: '85%' },
											'fontSize': '0.865rem',
											'color': 'rgba(255,255,255,0.7)',
											'lineHeight': 1.7,
											'transition': 'color 0.3s ease',
											'&:hover': {
												color: 'rgba(255,255,255,0.9)',
											},
										}}>
										{feature.description}
									</Typography>
								</Box>
							</Grid>
						);
					})}
				</Grid>

				{/* Subtle decorative elements */}
				<Box
					sx={{
						position: 'absolute',
						bottom: '10%',
						right: '5%',
						width: 200,
						height: 200,
						borderRadius: '50%',
						background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
						pointerEvents: 'none',
						zIndex: 0,
						opacity: headerInView ? 1 : 0,
						transition: 'opacity 1s ease-out',
						animation: headerInView ? `${glowPulse} 4s ease-in-out infinite` : 'none',
					}}
				/>

				<Box
					sx={{
						position: 'absolute',
						top: '15%',
						left: '5%',
						width: 150,
						height: 150,
						borderRadius: '50%',
						background: 'radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)',
						pointerEvents: 'none',
						zIndex: 0,
						opacity: headerInView ? 1 : 0,
						transition: 'opacity 1s ease-out 0.3s',
						animation: headerInView ? `${glowPulse} 5s ease-in-out infinite reverse` : 'none',
					}}
				/>
			</Container>
		</Box>
	);
};
