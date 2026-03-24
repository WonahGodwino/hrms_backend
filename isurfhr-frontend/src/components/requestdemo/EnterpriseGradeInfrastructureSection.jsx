import { Box, Container, Grid, Typography } from '@mui/material';
import { keyframes } from '@mui/system';
import SecurityIcon from '@mui/icons-material/Security';
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import { useInView } from 'react-intersection-observer';

// ─── Keyframes ───────────────
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const badges = [
	{ label: 'SOC2 TYPE II', icon: <GppGoodOutlinedIcon sx={{ fontSize: 40, color: '#60a5fa' }} /> },
	{ label: 'ISO 27001', icon: <SecurityIcon sx={{ fontSize: 40, color: '#60a5fa' }} /> },
	{ label: 'GDPR COMPLIANT', icon: <GavelOutlinedIcon sx={{ fontSize: 40, color: '#60a5fa' }} /> },
	{ label: 'HIPAA READY', icon: <AdminPanelSettingsOutlinedIcon sx={{ fontSize: 40, color: '#60a5fa' }} /> },
];

export const EnterpriseGradeInfrastructure = () => {
	const [headingRef, headingInView] = useInView({ threshold: 0.3 });
	const [badgesRef, badgesInView] = useInView({ threshold: 0.2 });

	return (
		<Box
			component="section"
			sx={{
				bgcolor: '#0d1520',
				py: { xs: 10, md: 14 },
				overflow: 'hidden',
				position: 'relative',
			}}>
			<Container
				maxWidth={false}
				sx={{
					width: { xs: '90%', lg: '80%' },
					margin: '0 auto',
					position: 'relative',
					zIndex: 1,
				}}>
				<Box
					ref={headingRef}
					sx={{
						textAlign: 'center',
						mb: { xs: 7, md: 9 },
						opacity: 0,
						animation: headingInView ? `${fadeInUp} 0.75s cubic-bezier(0.22,1,0.36,1) forwards` : 'none',
					}}>
					<Typography
						variant="h2"
						component="h2"
						sx={{
							fontWeight: 600,
							fontSize: { xs: '1.7rem', sm: '2.25rem', md: '2.75rem' },
							color: 'white',
							lineHeight: 1.2,
							letterSpacing: '-0.5px',
							mx: 'auto',
						}}>
						Enterprise-grade infrastructure for workforce governance.
					</Typography>
				</Box>

				<Box ref={badgesRef}>
					<Grid
						container
						justifyContent="center"
						spacing={{ xs: 2, sm: 3, md: 4 }}
						sx={{ maxWidth: '100%', mx: 'auto' }}>
						{badges.map((badge, index) => (
							<Grid
								item
								size={{ xs: 6, sm: 6, md: 3 }}
								key={badge.label}>
								<Box
									sx={{
										bgcolor: 'rgba(13,21,32,0.65)',
										backdropFilter: 'blur(12px)',
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center',
										justifyContent: 'center',
										gap: 1.2,
										position: 'relative',
										overflow: 'hidden',
										cursor: 'default',
										opacity: 0,
										animation: badgesInView ? `${fadeInUp} 0.7s cubic-bezier(0.22,1,0.36,1) ${0.1 + index * 0.12}s forwards` : 'none',
										transition: 'all 0.3s ease',
									}}>
									<Box
										sx={{
											width: 72,
											height: 72,
											borderRadius: '16px',
											bgcolor: 'rgba(96,165,250,0.12)',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											mb: 1,
										}}>
										{badge.icon}
									</Box>

									<Typography
										sx={{
											fontSize: '0.7rem',
											fontWeight: 800,
											letterSpacing: '0.15em',
											color: '#cbd5e1',
											textAlign: 'center',
											textTransform: 'uppercase',
											px: 1.5,
											lineHeight: 1.3,
										}}>
										{badge.label}
									</Typography>
								</Box>
							</Grid>
						))}
					</Grid>
				</Box>
			</Container>
		</Box>
	);
};
