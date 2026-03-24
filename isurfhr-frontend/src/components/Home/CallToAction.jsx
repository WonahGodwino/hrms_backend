import React from 'react';
import { Box, Typography, Container, Button } from '@mui/material';

import { useInView } from 'react-intersection-observer';
import { keyframes } from '@mui/system';

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

const pulse = keyframes`
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
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

export const CallToAction = () => {
	const [ref, inView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	return (
		<Box
			component="section"
			ref={ref}
			sx={{
				bgcolor: '#f8f9fb',
				py: { xs: 10, md: 14 },
				position: 'relative',
				overflow: 'hidden',
			}}>
			{/* Decorative background elements */}
			<Box
				sx={{
					position: 'absolute',
					top: '20%',
					left: '10%',
					width: 200,
					height: 200,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(33,150,243,0.03) 0%, transparent 70%)',
					animation: inView ? `${float} 8s ease-in-out infinite` : 'none',
					pointerEvents: 'none',
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					bottom: '20%',
					right: '10%',
					width: 250,
					height: 250,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(33,150,243,0.03) 0%, transparent 70%)',
					animation: inView ? `${float} 10s ease-in-out infinite reverse` : 'none',
					pointerEvents: 'none',
				}}
			/>

			<Container
				maxWidth="md"
				sx={{
					textAlign: 'center',
					position: 'relative',
					zIndex: 1,
				}}>
				{/* Heading */}
				<Typography
					variant="h3"
					component="h2"
					sx={{
						fontWeight: 900,
						fontSize: { xs: '2rem', sm: '2.6rem', md: '3rem' },
						color: '#0f172a',
						lineHeight: 1.15,
						letterSpacing: '-0.5px',
						mb: 2.5,
						opacity: 0,
						animation: inView ? `${fadeInUp} 0.6s ease-out forwards` : 'none',
					}}>
					Ready to unify your human capital management?
				</Typography>

				{/* Subtext with count animation */}
				<Typography
					sx={{
						fontSize: { xs: '0.95rem', md: '1rem' },
						color: '#475569',
						mb: 5,
						opacity: 0,
						animation: inView ? `${fadeInUp} 0.6s ease-out 0.2s forwards` : 'none',
					}}>
					Join over{' '}
					<Box
						component="span"
						sx={{
							fontWeight: 800,
							color: 'primary.main',
							display: 'inline-block',
							animation: inView ? `${countUp} 0.5s ease-out 0.4s forwards, ${pulse} 2s ease-in-out 1.5s infinite` : 'none',
							opacity: 0,
							transform: 'scale(0.8)',
						}}>
						1,500+
					</Box>{' '}
					enterprises optimizing their workforce with 247HR.
				</Typography>

				{/* Buttons */}
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						gap: 2,
						flexWrap: 'wrap',
						mb: 2.5,
					}}>
					<Button
						variant="contained"
						disableElevation
						href="/get-started"
						sx={{
							'fontWeight': 600,
							'fontSize': '0.95rem',
							'textTransform': 'none',
							'borderRadius': 1,
							'px': 4,
							'py': 1.5,
							'bgcolor': 'primary.main',
							'boxShadow': '0 4px 20px rgba(29,111,243,0.35)',
							'opacity': 0,
							'animation': inView ? `${fadeInUp} 0.6s ease-out 0.3s forwards` : 'none',
							'position': 'relative',
							'overflow': 'hidden',
							'&::after': {
								content: '""',
								position: 'absolute',
								top: 0,
								left: '-100%',
								width: '100%',
								height: '100%',
								background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
								animation: inView ? `${shimmer} 2s infinite 1s` : 'none',
							},
							'&:hover': {
								bgcolor: 'primary.dark',
								boxShadow: '0 6px 24px rgba(29,111,243,0.45)',
							},
						}}>
						Get Started Now
					</Button>

					<Button
						variant="outlined"
						href="/contact-sales"
						disableElevation
						sx={{
							'fontWeight': 600,
							'fontSize': '0.95rem',
							'textTransform': 'none',
							'borderRadius': 1,
							'px': 4,
							'py': 1.5,
							'color': '#0f172a',
							'borderColor': 'grey.300',
							'bgcolor': 'white',
							'opacity': 0,
							'animation': inView ? `${fadeInUp} 0.6s ease-out 0.4s forwards` : 'none',
							'position': 'relative',
							'overflow': 'hidden',
							'&::after': {
								content: '""',
								position: 'absolute',
								top: 0,
								left: '-100%',
								width: '100%',
								height: '100%',
								background: 'linear-gradient(90deg, transparent, rgba(33,150,243,0.1), transparent)',
								animation: inView ? `${shimmer} 2s infinite 1.2s` : 'none',
							},
							'&:hover': {
								bgcolor: 'grey.50',
								borderColor: 'grey.400',
							},
						}}>
						Talk to Sales
					</Button>
				</Box>

				{/* Fine print */}
				<Typography
					sx={{
						fontSize: '0.8rem',
						color: 'grey.400',
						opacity: 0,
						animation: inView ? `${fadeInUp} 0.6s ease-out 0.5s forwards` : 'none',
					}}>
					No credit card required. Setup takes less than 15 minutes.
				</Typography>
			</Container>
		</Box>
	);
};
