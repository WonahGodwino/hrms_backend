import React from 'react';
import { Box, Typography, Container, Grid } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import VpnLockOutlinedIcon from '@mui/icons-material/VpnLockOutlined';
import LockIcon from '@mui/icons-material/LockOutlined';
import { useInView } from 'react-intersection-observer';
import { keyframes } from '@mui/system';

const features = [
	{
		icon: <VpnLockOutlinedIcon sx={{ fontSize: 22, color: '#60a5fa' }} />,
		title: 'Granular Access Control',
		description: 'Permission-based visibility (RBAC) ensuring data sovereignty across global branches.',
	},
	{
		icon: <CloudDoneOutlinedIcon sx={{ fontSize: 22, color: '#60a5fa' }} />,
		title: 'Cloud Architecture',
		description: 'High-availability AWS hosting with localized data residency to meet GDPR and CCPA.',
	},
	{
		icon: <ReceiptLongIcon sx={{ fontSize: 22, color: '#60a5fa' }} />,
		title: 'Audit Trails & Chains',
		description: 'Immutable logs of every change made to payroll and sensitive employee records.',
	},
];

const badges = [
	{
		icon: <GppGoodOutlinedIcon sx={{ fontSize: 36, color: '#94a3b8' }} />,
		label: 'SOC2 TYPE II',
		active: false,
	},
	{
		icon: <SecurityOutlinedIcon sx={{ fontSize: 36, color: '#94a3b8' }} />,
		label: 'ISO 27001',
		active: false,
	},
	{
		icon: <GavelOutlinedIcon sx={{ fontSize: 36, color: '#94a3b8' }} />,
		label: 'GDPR COMPLIANT',
		active: false,
	},
	{
		icon: <HealthAndSafetyOutlinedIcon sx={{ fontSize: 36, color: '#60a5fa' }} />,
		label: 'HIPAA READY',
		active: true,
	},
];

// Animation keyframes
const fadeInLeft = keyframes`
  from {
    opacity: 0;
    transform: translateX(-50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const fadeInRight = keyframes`
  from {
    opacity: 0;
    transform: translateX(50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const pulseGlow = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.3);
    border-color: #334155;
  }
  50% {
    box-shadow: 0 0 20px 4px rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.3);
    border-color: #334155;
  }
`;

const rotateSlowly = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const float = keyframes`
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-5px);
  }
  100% {
    transform: translateY(0px);
  }
`;

const countUp = keyframes`
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const slideInStagger = keyframes`
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const dataFlow = keyframes`
  0% {
    background-position: 0% 0%;
  }
  100% {
    background-position: 200% 200%;
  }
`;

const borderWave = keyframes`
  0% {
    border-image-source: linear-gradient(0deg, #60a5fa, transparent, #60a5fa);
  }
  25% {
    border-image-source: linear-gradient(90deg, #60a5fa, transparent, #60a5fa);
  }
  50% {
    border-image-source: linear-gradient(180deg, #60a5fa, transparent, #60a5fa);
  }
  75% {
    border-image-source: linear-gradient(270deg, #60a5fa, transparent, #60a5fa);
  }
  100% {
    border-image-source: linear-gradient(360deg, #60a5fa, transparent, #60a5fa);
  }
`;

export const EnterpriseGradeInfrastructure = () => {
	const [leftRef, leftInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [rightRef, rightInView] = useInView({
		threshold: 0.2,
		triggerOnce: true,
	});

	return (
		<Box
			id="enterprise"
			component="section"
			sx={{
				bgcolor: '#101922',
				py: { xs: 8, md: 11 },
				overflow: 'hidden',
				position: 'relative',
				minHeight: '90dvh',
			}}>
			<Box
				sx={{
					position: 'absolute',
					top: '10%',
					right: '5%',
					width: 300,
					height: 300,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(96,165,250,0.03) 0%, transparent 70%)',
					animation: `${rotateSlowly} 30s linear infinite`,
					pointerEvents: 'none',
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					bottom: '10%',
					left: '5%',
					width: 250,
					height: 250,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(96,165,250,0.02) 0%, transparent 70%)',
					animation: `${rotateSlowly} 40s linear infinite reverse`,
					pointerEvents: 'none',
				}}
			/>

			<Box
				sx={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					backgroundImage: 'linear-gradient(rgba(96,165,250,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.02) 1px, transparent 1px)',
					backgroundSize: '50px 50px',
					pointerEvents: 'none',
					opacity: 0.5,
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
				<Grid
					container
					spacing={{ xs: 6, md: 8 }}
					alignItems="center">
					<Grid
						ref={leftRef}
						item
						size={{ xs: 12, md: 6 }}
						sx={{
							opacity: 0,
							animation: leftInView ? `${fadeInLeft} 0.8s ease-out forwards` : 'none',
						}}>
						<Typography
							variant="h3"
							component="h2"
							sx={{
								'fontWeight': 900,
								'fontSize': { xs: '2rem', lg: '2.6rem' },
								'color': 'white',
								'lineHeight': 1.15,
								'letterSpacing': '-0.5px',
								'mb': 5,
								'position': 'relative',
								'&::after': {
									content: '""',
									position: 'absolute',
									bottom: -10,
									left: 0,
									width: 80,
									height: 3,
									background: 'linear-gradient(90deg, #60a5fa, transparent)',
									borderRadius: 2,
								},
							}}>
							Enterprise-Grade
							<br />
							Infrastructure for
							<br />
							Workforce Governance
						</Typography>

						{/* Feature list with staggered entrance */}
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
							{features.map((feature, index) => (
								<Box
									key={feature.title}
									sx={{
										'display': 'flex',
										'alignItems': 'flex-start',
										'gap': 2,
										'opacity': 0,
										'animation': leftInView ? `${slideInStagger} 0.6s ease-out ${0.3 + index * 0.15}s forwards` : 'none',
										'position': 'relative',
										'&::before': {
											content: '""',
											position: 'absolute',
											left: -8,
											top: 0,
											bottom: 0,
											width: 2,
											background: 'linear-gradient(to bottom, #60a5fa, transparent)',
											opacity: 0,
											transition: 'opacity 0.3s ease',
										},
										'&:hover::before': {
											opacity: 1,
										},
									}}>
									{/* Icon box with pulse animation */}
									<Box
										sx={{
											width: 40,
											height: 40,
											borderRadius: 1,
											bgcolor: 'rgba(96,165,250,0.1)',
											border: '1px solid rgba(96,165,250,0.2)',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											flexShrink: 0,
											animation: leftInView ? `${pulseGlow} 3s ease-in-out infinite ${index * 0.5}s` : 'none',
										}}>
										{feature.icon}
									</Box>

									<Box>
										<Typography
											sx={{
												fontWeight: 700,
												fontSize: '0.975rem',
												color: 'white',
												mb: 0.5,
												position: 'relative',
												display: 'inline-block',
											}}>
											{feature.title}
										</Typography>
										<Typography
											sx={{
												fontSize: '0.875rem',
												color: '#64748b',
												lineHeight: 1.7,
												width: '85%',
											}}>
											{feature.description}
										</Typography>
									</Box>
								</Box>
							))}
						</Box>
					</Grid>

					<Grid
						ref={rightRef}
						item
						size={{ xs: 12, md: 6 }}
						sx={{
							opacity: 0,
							animation: rightInView ? `${fadeInRight} 0.8s ease-out 0.2s forwards` : 'none',
						}}>
						<Grid
							container
							spacing={2}>
							{badges.map((badge, index) => (
								<Grid
									item
									size={{ xs: 6 }}
									key={badge.label}>
									<Box
										sx={{
											'aspectRatio': '1.4 / 1',
											'borderRadius': 3,
											'border': '1px solid',
											'borderColor': badge.active ? '#334155' : '#1e293b',
											'bgcolor': badge.active ? 'rgba(16, 25, 34, 0.1)' : 'rgba(16, 25, 34, 0.05)',
											'display': 'flex',
											'flexDirection': 'column',
											'alignItems': 'center',
											'justifyContent': 'center',
											'gap': 1.5,
											'position': 'relative',
											'overflow': 'hidden',
											'opacity': 0,
											'animation': rightInView ? `${countUp} 0.5s ease-out ${0.3 + index * 0.1}s forwards` : 'none',

											...(badge.active && {
												'&::before': {
													content: '""',
													position: 'absolute',
													top: 0,
													left: 0,
													right: 0,
													bottom: 0,
													background: 'linear-gradient(135deg, transparent, rgba(96,165,250,0.03), transparent)',
													backgroundSize: '200% 200%',
													animation: `${dataFlow} 6s ease-in-out infinite`,
													pointerEvents: 'none',
												},

												'&::after': {
													content: '""',
													position: 'absolute',
													inset: -1,
													padding: '1px',
													borderRadius: 3,
													background: 'linear-gradient(135deg, #60a5fa, transparent, #60a5fa)',
													WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
													WebkitMaskComposite: 'xor',
													maskComposite: 'exclude',
													opacity: 0.15,
													animation: `${borderWave} 8s linear infinite`,
													pointerEvents: 'none',
												},
											}),

											// Subtle floating for icons on active badges
											'& .badge-icon': badge.active
												? {
														animation: `${float} 4s ease-in-out infinite`,
												  }
												: {},
										}}>
										{/* Icon with class for targeting */}
										<Box className="badge-icon">{badge.icon}</Box>

										<Typography
											sx={{
												fontSize: '1rem',
												fontWeight: 900,
												letterSpacing: '0.01em',
												color: badge.active ? '#60a5fa' : '#CBD5E1',
												textAlign: 'center',
												position: 'relative',
											}}>
											{badge.label}
										</Typography>

										{/* Subtle data flow line for active badges */}
										{badge.active && (
											<Box
												sx={{
													position: 'absolute',
													bottom: 0,
													left: 0,
													width: '100%',
													height: '1px',
													background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)',
													opacity: 0.2,
												}}
											/>
										)}
									</Box>
								</Grid>
							))}
						</Grid>
					</Grid>
				</Grid>
			</Container>
		</Box>
	);
};
