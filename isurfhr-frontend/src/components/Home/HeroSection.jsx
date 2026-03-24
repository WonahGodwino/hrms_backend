import React, { useState, useEffect } from 'react';
import { Box, Container, Typography, Button, Grid, Chip } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { HeroText } from './HeroText';

import { keyframes } from '@mui/system';
import { useInView } from 'react-intersection-observer';

const float = keyframes`
  0% {
    transform: translateY(0px) rotate(0deg);
  }
  50% {
    transform: translateY(-15px) rotate(1deg);
  }
  100% {
    transform: translateY(0px) rotate(0deg);
  }
`;

export function HeroSection() {
	const [headerRef, headerInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [contentRef, contentInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [consoleRef, consoleInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [hasAnimated, setHasAnimated] = useState(false);

	useEffect(() => {
		if (headerInView && contentInView && consoleInView && !hasAnimated) {
			setHasAnimated(true);
		}
	}, [headerInView, contentInView, consoleInView, hasAnimated]);

	return (
		<Box
			component="section"
			sx={{
				py: { xs: 8, md: 12 },
				bgcolor: 'white',
				minHeight: '88dvh',
				position: 'relative',
				overflow: 'hidden',
			}}>
			<Container
				maxWidth="xl"
				sx={{ width: { xs: '95%', md: '90%' } }}>
				<Grid
					container
					spacing={6}
					alignItems="center">
					<Grid
						item
						size={{ xs: 12, md: 6 }}>
						{/* Header Chip with transition */}
						<Box ref={headerRef}>
							<Chip
								label="THE UNIFIED HR ECOSYSTEM"
								icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />}
								sx={{
									'mb': 2,
									'bgcolor': '#e6f0ff',
									'color': 'primary.main',
									'fontWeight': { xs: 500, md: 700 },
									'fontSize': { xs: '0.60rem', md: '0.65rem' },
									'border': 'none',
									'pl': { xs: 0.5, md: 1 },
									'pr': { xs: 0.5, md: 2 },
									'letterSpacing': '0.5px',
									'opacity': headerInView ? 1 : 0,
									'transform': headerInView ? 'translateY(0)' : 'translateY(20px)',
									'transition': 'opacity 0.6s ease-out, transform 0.6s ease-out',
									'& .MuiChip-icon': {
										mr: 1,
										ml: 0.5,
									},
									'& .MuiChip-label': {
										px: { md: 1 },
									},
								}}
							/>
						</Box>

						{/* HeroText with transition */}
						<Box
							sx={{
								opacity: contentInView ? 1 : 0,
								transform: contentInView ? 'translateY(0)' : 'translateY(30px)',
								transition: 'opacity 0.6s ease-out 0.1s, transform 0.6s ease-out 0.1s',
							}}>
							<HeroText />
						</Box>

						{/* Description with transition */}
						<Typography
							variant="body1"
							ref={contentRef}
							sx={{
								fontSize: { xs: '1rem', md: '1rem', xl: '1.2rem' },
								color: 'grey.600',
								mb: 5,
								maxWidth: { xs: '95%', md: '90%' },
								textAlign: { xs: 'justify', md: 'start' },
								opacity: contentInView ? 1 : 0,
								transform: contentInView ? 'translateY(0)' : 'translateY(30px)',
								transition: 'opacity 0.6s ease-out 0.2s, transform 0.6s ease-out 0.2s',
							}}>
							The single source of truth for the entire employee journey.
							<br
								style={{ display: 'none' }}
								className="responsive-br"
							/>{' '}
							Eliminate data silos with 247HR's integrated enterprise platform.
						</Typography>

						{/* Buttons with transition */}
						<Box
							sx={{
								display: 'flex',
								flexDirection: { xs: 'column', sm: 'row' },
								justifyContent: { xs: 'space-evenly', md: 'start' },
								gap: { xs: 2, md: 1, lg: 3 },
								flexWrap: 'nowrap',
								opacity: contentInView ? 1 : 0,
								transform: contentInView ? 'translateY(0)' : 'translateY(30px)',
								transition: 'opacity 0.6s ease-out 0.3s, transform 0.6s ease-out 0.3s',
							}}>
							<Button
								href={'/request-demo'}
								variant="contained"
								color="primary"
								size="large"
								sx={{
									'borderRadius': 1,
									'px': { xs: 1, md: 1.5, lg: 4 },
									'py': { xs: 1, md: 1.5, lg: 1.5 },
									'fontWeight': { xs: 500, md: 600 },
									'fontSize': { xs: '1.1rem', md: '0.9rem', lg: '1.1rem' },
									'textTransform': 'none',
									'boxShadow': '0 12px 20px -10px rgba(33, 150, 243, 0.4)',
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
										'boxShadow': '0 18px 25px -8px rgba(33, 150, 243, 0.5)',
										'transform': 'translateY(-2px)',
										'&::after': {
											left: '100%',
										},
									},
									'transition': 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease-out 0.3s, transform 0.6s ease-out 0.3s',
								}}>
								Request a Demo
							</Button>

							<Button
								variant="outlined"
								size="large"
								startIcon={
									<PlayCircleOutlineIcon
										sx={{
											fontSize: 18,
											color: 'grey.800',
											transition: 'transform 0.3s ease',
										}}
									/>
								}
								sx={{
									'borderRadius': 1,
									'px': { xs: 1, md: 1.5, lg: 4 },
									'py': { xs: 1, md: 1.5, lg: 1.5 },
									'fontWeight': { xs: 400, md: 600 },
									'fontSize': '1.1rem',
									'textTransform': 'none',
									'borderColor': 'grey.400',
									'color': 'grey.900',
									'bgcolor': 'white',
									'borderWidth': 2,
									'transition': 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease-out 0.3s, transform 0.6s ease-out 0.3s',
									'&:hover': {
										'bgcolor': 'grey.50',
										'borderColor': 'grey.600',
										'transform': 'translateY(-2px)',
										'boxShadow': '0 10px 20px -8px rgba(0,0,0,0.2)',
										'& .MuiSvgIcon-root': {
											transform: 'scale(1.1)',
										},
									},
								}}>
								Watch Platform Tour
							</Button>
						</Box>
					</Grid>

					{/* Console with transition and floating animation */}
					<Grid
						item
						size={{ xs: 12, md: 6 }}
						ref={consoleRef}>
						<Box
							sx={{
								position: 'relative',
								perspective: '1200px',
								maxWidth: 580,
								mx: 'auto',
								opacity: consoleInView ? 1 : 0,
								transform: consoleInView ? 'translateX(0) scale(1)' : 'translateX(30px) scale(0.95)',
								transition: 'opacity 0.7s ease-out 0.2s, transform 0.7s ease-out 0.2s',
							}}>
							<Box
								sx={{
									'position': 'relative',
									'zIndex': 1,
									'bgcolor': '#0f172a',
									'borderRadius': 2,
									'p': 1,
									'overflow': 'hidden',
									'boxShadow': '0 20px 60px rgba(0,0,0,0.4)',
									'border': '1px solid #1e293b',
									'animation': `${float} 6s ease-in-out infinite`,
									'&:hover': {
										boxShadow: '0 25px 70px rgba(0,0,0,0.5)',
									},
									'transition': 'box-shadow 0.3s ease',
								}}>
								<Box
									sx={{
										bgcolor: '#0f172a',
										py: 1.2,
										px: 2,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										borderBottom: '1px solid #1e293b',
									}}>
									<Box sx={{ display: 'flex', gap: 1 }}>
										<Box
											sx={{
												'width': 12,
												'height': 12,
												'borderRadius': '50%',
												'bgcolor': '#ff5f56',
												'opacity': 0.7,
												'transition': 'opacity 0.2s ease, transform 0.2s ease',
												'&:hover': {
													opacity: 1,
													transform: 'scale(1.2)',
												},
											}}
										/>
										<Box
											sx={{
												'width': 12,
												'height': 12,
												'borderRadius': '50%',
												'bgcolor': '#ffbd2e',
												'opacity': 0.7,
												'transition': 'opacity 0.2s ease, transform 0.2s ease',
												'&:hover': {
													opacity: 1,
													transform: 'scale(1.2)',
												},
											}}
										/>
										<Box
											sx={{
												'width': 12,
												'height': 12,
												'borderRadius': '50%',
												'bgcolor': '#28c940',
												'opacity': 0.7,
												'transition': 'opacity 0.2s ease, transform 0.2s ease',
												'&:hover': {
													opacity: 1,
													transform: 'scale(1.2)',
												},
											}}
										/>
									</Box>
									<Typography
										variant="body2"
										sx={{
											color: 'grey.400',
											fontWeight: 500,
											fontSize: '0.85rem',
											background: 'linear-gradient(90deg, #94a3b8, #cbd5e1)',
											WebkitBackgroundClip: 'text',
											WebkitTextFillColor: 'transparent',
										}}>
										GLOBAL PAYROLL CONSOLE V4.2
									</Typography>
								</Box>

								{/* Main content */}
								<Box sx={{ p: { xs: 1, md: 3 }, bgcolor: '#0f172a' }}>
									<Grid
										container
										spacing={2}
										sx={{ mb: 3 }}>
										{[
											{ label: 'TOTAL GROSS', value: '$1,482,900', bg: 'transparent' },
											{ label: 'TAX LIABILITY', value: '$342,105', bg: 'transparent' },
											{ label: 'VALIDATION', value: '100% Pass', bg: 'rgba(59,130,246,0.1)', color: '#22c55e' },
										].map(({ label, value, bg, color }, index) => (
											<Grid
												item
												size={{ xs: 4 }}
												key={label}>
												<Box
													sx={{
														'bgcolor': bg,
														'border': bg === 'transparent' ? '1px solid #334155' : 'none',
														'borderRadius': 2,
														'p': 2,
														'px': { xs: 1, md: 2 },
														'textAlign': { xs: 'center', md: 'left' },
														'opacity': consoleInView ? 1 : 0,
														'transform': consoleInView ? 'translateY(0)' : 'translateY(20px)',
														'transition': `opacity 0.5s ease-out ${0.4 + index * 0.1}s, transform 0.5s ease-out ${0.4 + index * 0.1}s`,
														'&:hover': {
															transform: 'translateY(-2px)',
															borderColor: '#3b82f6',
														},
													}}>
													<Typography
														variant="caption"
														sx={{ color: 'grey.400', display: 'block', mb: 0.5 }}>
														{label}
													</Typography>
													<Typography
														variant="h6"
														sx={{ color: color ?? 'white', fontWeight: { xs: 400, md: 700 }, fontSize: { xs: '0.8rem', md: '1.1rem' } }}>
														{value}
													</Typography>
												</Box>
											</Grid>
										))}
									</Grid>

									{/* Approval Workflow */}
									<Box
										sx={{
											'border': '1px solid #334155',
											'borderRadius': 2,
											'p': 2.5,
											'mb': 2,
											'opacity': consoleInView ? 1 : 0,
											'transform': consoleInView ? 'translateY(0)' : 'translateY(20px)',
											'transition': 'opacity 0.6s ease-out 0.7s, transform 0.6s ease-out 0.7s',
											'&:hover': {
												borderColor: '#3b82f6',
												boxShadow: '0 4px 12px rgba(59,130,246,0.2)',
											},
										}}>
										<Box
											sx={{
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												mb: 1.5,
											}}>
											<Typography
												variant="subtitle1"
												sx={{ color: 'white', fontWeight: 500 }}>
												Approval Workflow - Batch #409
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: 'grey.500' }}>
												Processing...
											</Typography>
										</Box>

										<Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
											<Box sx={{ flex: 1, mr: 2 }}>
												<Box
													sx={{
														height: 8,
														bgcolor: '#334155',
														borderRadius: 4,
														overflow: 'hidden',
													}}>
													<Box
														sx={{
															'height': '100%',
															'width': '75%',
															'bgcolor': '#3b82f6',
															'borderRadius': 4,
															'transition': 'width 0.3s ease',
															'&:hover': {
																bgcolor: '#2563eb',
															},
														}}
													/>
												</Box>
											</Box>
											<Typography
												variant="body2"
												sx={{ color: 'grey.300', fontWeight: 500 }}>
												75%
											</Typography>
										</Box>

										<Grid
											container
											spacing={1}>
											{['EMPLOYEE DATA SYNC', 'TAX ENGINE SYNC', 'GL MAPPING'].map((label, i) => (
												<Grid
													item
													size={{ xs: 4 }}
													key={label}
													sx={{ textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right' }}>
													<Typography
														variant="caption"
														sx={{
															'color': i < 2 ? 'grey.500' : 'grey.400',
															'transition': 'color 0.2s ease',
															'&:hover': {
																color: '#3b82f6',
															},
														}}>
														{label}
													</Typography>
												</Grid>
											))}
										</Grid>
									</Box>
								</Box>
							</Box>

							{/* Floating blob shadow */}
							<Box
								sx={{
									position: 'absolute',
									inset: -20,
									bgcolor: 'grey.900',
									borderRadius: '60% 40% 70% 30%',
									opacity: consoleInView ? 0.25 : 0,
									filter: 'blur(40px)',
									zIndex: -1,
									transform: 'rotate(-5deg)',
									animation: consoleInView ? `${float} 8s ease-in-out infinite reverse` : 'none',
									transition: 'opacity 0.7s ease-out 0.2s',
								}}
							/>
						</Box>
					</Grid>
				</Grid>
			</Container>
		</Box>
	);
}
