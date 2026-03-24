import React from 'react';
import { Box, Typography, Container, Grid } from '@mui/material';
import PeopleSearchIcon from '@mui/icons-material/PersonSearch';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import GroupsIcon from '@mui/icons-material/Groups';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import PaymentsIcon from '@mui/icons-material/Payments';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useInView } from 'react-intersection-observer';
import { keyframes } from '@mui/system';

const lifecycleSteps = [
	{
		icon: <PeopleSearchIcon />,
		title: 'Recruit',
		subtitle: 'Attract & Hire',
	},
	{
		icon: <AssignmentIndIcon />,
		title: 'Onboard',
		subtitle: 'Welcome & Set Up',
	},
	{
		icon: <GroupsIcon />,
		title: 'Manage',
		subtitle: 'Staff Directory',
	},
	{
		icon: <EventAvailableIcon />,
		title: 'Track',
		subtitle: 'Attendance & Leave',
	},
	{
		icon: <PaymentsIcon />,
		title: 'Pay',
		subtitle: 'Automated Payroll',
	},
	{
		icon: <BarChartIcon />,
		title: 'Report',
		subtitle: 'Analytics & BI',
	},
];

// New animations better suited for this layout
const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
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

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

export const EmployeeLifecycle = () => {
	const [titleRef, titleInView] = useInView({
		threshold: 0.3,
		triggerOnce: true,
	});

	const [gridRef, gridInView] = useInView({
		threshold: 0.2,
		triggerOnce: true,
	});

	return (
		<Box
			component="section"
			id="solutions"
			sx={{
				py: { xs: 8, md: 10 },
				bgcolor: '#f8f9fb',
			}}>
			<Container
				maxWidth={false}
				sx={{
					width: '90%',
					margin: '0 auto',
				}}>
				{/* Title Section */}
				<Box
					ref={titleRef}
					sx={{
						textAlign: 'center',
						mb: { xs: 6, md: 8 },
					}}>
					<Typography
						variant="h4"
						component="h2"
						sx={{
							fontWeight: 800,
							fontSize: { xs: '1.6rem', md: '2rem' },
							color: 'grey.900',
							mb: 1.5,
							opacity: titleInView ? 1 : 0,
							animation: titleInView ? `${fadeInUp} 0.6s ease-out forwards` : 'none',
						}}>
						The Complete Employee Lifecycle
					</Typography>
					<Typography
						variant="body1"
						sx={{
							color: '#475569',
							fontSize: '0.95rem',
							opacity: titleInView ? 1 : 0,
							animation: titleInView ? `${fadeInUp} 0.6s ease-out 0.2s forwards` : 'none',
						}}>
						One seamless flow for every touchpoint of your human capital management.
					</Typography>
				</Box>

				{/* Grid */}
				<Grid
					ref={gridRef}
					container
					spacing={{ xs: 4, md: 2 }}
					justifyContent="center"
					alignItems="flex-start">
					{lifecycleSteps.map((step, index) => (
						<Grid
							item
							key={step.title}
							size={{ xs: 6, sm: 4, md: 2 }}
							sx={{
								textAlign: 'center',
								opacity: 0,
								animation: gridInView ? `${fadeIn} 0.5s ease-out ${index * 0.15}s forwards` : 'none',
							}}>
							{/* Card */}
							<Box
								sx={{
									'display': 'flex',
									'flexDirection': 'column',
									'alignItems': 'center',
									'gap': 1.5,
									'position': 'relative',
									'cursor': 'pointer',
									'opacity': 0,
									'animation': gridInView ? `${slideIn} 0.5s ease-out ${index * 0.15 + 0.1}s forwards` : 'none',
									'&::after':
										index < lifecycleSteps.length - 1
											? {
													content: '""',
													position: 'absolute',
													top: 28,
													left: 'calc(50% + 36px)',
													width: 'calc(100% - 72px)',
													height: '1px',
													bgcolor: 'grey.200',
													display: { xs: 'none', md: 'block' },
													opacity: 0,
													animation: gridInView ? `${fadeIn} 0.4s ease-out ${index * 0.15 + 0.3}s forwards` : 'none',
											  }
											: {},
									// Hover effects
									'&:hover .icon-container': {
										bgcolor: 'primary.main',
										borderColor: 'primary.main',
										boxShadow: '0 8px 20px rgba(59,130,246,0.25)',
									},
									'&:hover .icon-container svg': {
										color: 'white',
									},
									'&:hover .step-title': {
										color: 'primary.main',
									},
								}}>
								{/* Icon Container */}
								<Box
									className="icon-container"
									sx={{
										'width': 56,
										'height': 56,
										'bgcolor': 'white',
										'border': '1.5px solid',
										'borderColor': 'grey.200',
										'borderRadius': 1,
										'display': 'flex',
										'alignItems': 'center',
										'justifyContent': 'center',
										'boxShadow': '0 4px 12px rgba(0,0,0,0.05)',
										'transition': 'all 0.3s ease',
										'& svg': {
											fontSize: 28,
											color: 'primary.main',
											transition: 'color 0.3s ease',
										},
									}}>
									{step.icon}
								</Box>

								{/* Text Content */}
								<Box>
									<Typography
										className="step-title"
										sx={{
											fontWeight: 700,
											fontSize: '0.95rem',
											color: 'grey.900',
											mb: 0.3,
											transition: 'color 0.3s ease',
										}}>
										{step.title}
									</Typography>
									<Typography
										sx={{
											fontSize: '0.8rem',
											color: 'grey.500',
											fontWeight: 400,
										}}>
										{step.subtitle}
									</Typography>
								</Box>
							</Box>
						</Grid>
					))}
				</Grid>

				{/* Subtle decorative pulse on the active section */}
				<Box
					sx={{
						position: 'relative',
						width: '100%',
						height: 2,
						mt: 6,
						background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.1), transparent)',
						opacity: titleInView ? 1 : 0,
						transition: 'opacity 0.8s ease',
					}}
				/>
			</Container>
		</Box>
	);
};
