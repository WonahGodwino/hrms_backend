import React from 'react';
import { Box, Typography, Container } from '@mui/material';
import Interswitch_Group from '@/assets/Partners/Interswitch_Group.png';
import Cadbury from '@/assets/Partners/Cadbury.png';
import OPay from '@/assets/Partners/OPay.png';
import PowerChina from '@/assets/Partners/PowerChina.png';
import longrich from '@/assets/Partners/longrich.png';
import FrieslandCampina from '@/assets/Partners/FrieslandCampina.png';
import { useInView } from 'react-intersection-observer';
// Using real CDN logo URLs via Clearbit / simple-icons style sources
const partners = [
	{
		name: 'Interswitch',
		logo: Interswitch_Group,
	},
	{
		name: 'Cadbury',
		logo: Cadbury,
	},
	{
		name: 'OPay',
		logo: OPay,
	},
	{
		name: 'PowerChina',
		logo: PowerChina,
	},
	{
		name: 'FrieslandCampina',
		logo: FrieslandCampina,
	},
	{
		name: 'Longrich',
		logo: longrich,
	},
];

// Duplicate for seamless infinite loop
const marqueeItems = [...partners, ...partners];

export const TrustedPartners = () => {
	const [titleRef, titleInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [marqueeRef, marqueeInView] = useInView({
		threshold: 0.2,
		triggerOnce: true,
	});

	return (
		<Box
			component="section"
			sx={{
				py: { xs: 6, md: 8 },
				bgcolor: 'grey.100',
				overflow: 'hidden',
				width: '100%',
				position: 'relative',
			}}>
			<Container
				maxWidth="xl"
				sx={{
					textAlign: 'center',
					mb: 2,
				}}>
				{/* Title with animation */}
				<Box ref={titleRef}>
					<Typography
						variant="h4"
						component="h2"
						sx={{
							fontWeight: 800,
							fontSize: { xs: '1.6rem', md: '2rem' },
							color: 'grey.900',
							mb: 1.5,
							opacity: titleInView ? 1 : 0,
							transform: titleInView ? 'translateY(0)' : 'translateY(30px)',
							transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
						}}>
						Our{' '}
						<Box
							component="span"
							sx={{
								'color': 'grey.900',
								'position': 'relative',
								'&::after': {
									content: '""',
									position: 'absolute',
									bottom: -2,
									left: 0,
									width: '100%',
									height: 3,
									opacity: titleInView ? 0.3 : 0,
									transform: titleInView ? 'scaleX(1)' : 'scaleX(0)',
									transition: 'opacity 0.6s ease-out 0.3s, transform 0.6s ease-out 0.3s',
									transformOrigin: 'left',
								},
							}}>
							TRUSTED
						</Box>{' '}
						Partners
					</Typography>

					<Typography
						variant="body1"
						sx={{
							color: '#475569',
							fontSize: '0.95rem',
							opacity: titleInView ? 1 : 0,
							transform: titleInView ? 'translateY(0)' : 'translateY(20px)',
							transition: 'opacity 0.6s ease-out 0.2s, transform 0.6s ease-out 0.2s',
						}}>
						Adopt 247hr and see your HR processes transform
					</Typography>
				</Box>
			</Container>

			{/* Marquee container with animation */}
			<Box
				ref={marqueeRef}
				sx={{
					'position': 'relative',
					'width': '100%',
					'bgcolor': 'white',
					'overflow': 'hidden',
					'py': 15,
					'opacity': marqueeInView ? 1 : 0,
					'transform': marqueeInView ? 'scale(1)' : 'scale(0.95)',
					'transition': 'opacity 0.8s ease-out 0.2s, transform 0.8s ease-out 0.2s',
					'&::before, &::after': {
						content: '""',
						position: 'absolute',
						top: 0,
						bottom: 0,
						width: { xs: 60, md: 120 },
						zIndex: 2,
						pointerEvents: 'none',
						transition: 'opacity 0.6s ease-out',
						opacity: marqueeInView ? 1 : 0,
					},
					'&::before': {
						left: 0,
						background: 'linear-gradient(to right, #ffffff 0%, transparent 100%)',
					},
					'&::after': {
						right: 0,
						background: 'linear-gradient(to left, #ffffff 0%, transparent 100%)',
					},
				}}>
				<Box
					sx={{
						'display': 'flex',
						'width': 'max-content',
						'animation': marqueeInView ? 'marquee 28s linear infinite' : 'none',
						'&:hover': {
							animationPlayState: 'paused',
						},
						'@keyframes marquee': {
							'0%': { transform: 'translateX(0%)' },
							'100%': { transform: 'translateX(-50%)' },
						},
					}}>
					{marqueeItems.map((partner, index) => (
						<Box
							key={`${partner.name}-${index}`}
							sx={{
								'display': 'flex',
								'alignItems': 'center',
								'justifyContent': 'center',
								'mx': { xs: 4, md: 6 },
								'flexShrink': 0,
								'opacity': marqueeInView ? 1 : 0,
								'transform': marqueeInView ? 'translateY(0)' : 'translateY(20px)',
								'transition': `opacity 0.5s ease-out ${0.3 + (index % 6) * 0.1}s, transform 0.5s ease-out ${0.3 + (index % 6) * 0.1}s`,
								'&:hover': {
									transform: 'scale(1.1)',
									filter: 'brightness(1.1)',
								},
							}}>
							<Box
								component="img"
								src={partner.logo}
								alt={partner.name}
								sx={{
									'height': { xs: 30, md: 38 },
									'maxWidth': { xs: 100, md: 140 },
									'objectFit': 'contain',
									'transition': 'all 0.3s ease',
									'filter': 'grayscale(0.2)',
									'&:hover': {
										filter: 'grayscale(0)',
									},
								}}
								onError={(e) => {
									e.target.style.display = 'none';
									e.target.nextSibling.style.display = 'block';
								}}
							/>
							<Typography
								sx={{
									display: 'none',
									fontWeight: 700,
									fontSize: '1.1rem',
									color: 'grey.400',
									letterSpacing: '-0.5px',
									whiteSpace: 'nowrap',
									transition: 'color 0.3s ease',
								}}>
								{partner.name}
							</Typography>
						</Box>
					))}
				</Box>
			</Box>

			{/* Optional subtle background animation */}
			<Box
				sx={{
					position: 'absolute',
					bottom: 0,
					left: 0,
					right: 0,
					height: '2px',
					background: 'linear-gradient(90deg, transparent, primary.main, transparent)',
					opacity: titleInView ? 0.3 : 0,
					transform: titleInView ? 'scaleX(1)' : 'scaleX(0)',
					transition: 'opacity 0.8s ease-out 0.5s, transform 0.8s ease-out 0.5s',
					transformOrigin: 'center',
				}}
			/>
		</Box>
	);
};
