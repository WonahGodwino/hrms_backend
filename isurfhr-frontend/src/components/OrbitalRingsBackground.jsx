import { Box, Grid, Typography } from '@mui/material';
import { keyframes } from '@mui/system';

// ── Keyframe animations ──────────────────────────────────────────────────────

const slowSpin = keyframes`
  from { transform: rotate(0deg) scale(1); }
  50%  { transform: rotate(180deg) scale(1.04); }
  to   { transform: rotate(360deg) scale(1); }
`;

const breathe = keyframes`
  0%, 100% { opacity: 0.55; filter: blur(0px); }
  50%       { opacity: 0.75; filter: blur(2px); }
`;

const innerPulse = keyframes`
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.55; }
  50%       { transform: scale(1.06) rotate(-180deg); opacity: 0.7; }
`;

const glowRing = keyframes`
  0%, 100% { box-shadow: 0 0 40px 8px rgba(232, 106, 90, 0.2); }
  50%       { box-shadow: 0 0 80px 20px rgba(232, 106, 90, 0.45); }
`;

// ── Coral ring SVG rendered as CSS mask ──────────────────────────────────────
// We recreate the "grainy donut" look with layered pseudo-like Box elements.

export const CoralAnimatedRing = () => (
	<Box
		sx={{
			position: 'absolute',
			top: '50%',
			left: '50%',
			transform: 'translate(-50%, -50%)',
			width: 620,
			height: 620,
			zIndex: 0,
			pointerEvents: 'none',
		}}>
		{/* Outer spinning ring layer */}
		<Box
			sx={{
				'position': 'absolute',
				'inset': 0,
				'borderRadius': '50%',
				'background': 'radial-gradient(circle, transparent 28%, #e86a5a 30%, #e86a5a 72%, transparent 74%)',
				'animation': `${slowSpin} 18s linear infinite, ${breathe} 6s ease-in-out infinite`,
				// Grainy texture via SVG noise filter embedded as data-uri
				'&::after': {
					content: '""',
					position: 'absolute',
					inset: 0,
					borderRadius: '50%',
					backgroundImage:
						"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
					backgroundSize: '180px 180px',
					mixBlendMode: 'overlay',
					opacity: 0.6,
				},
			}}
		/>

		{/* Inner counter-rotating ring for depth */}
		<Box
			sx={{
				position: 'absolute',
				inset: 40,
				borderRadius: '50%',
				background: 'radial-gradient(circle, transparent 34%, rgba(232,106,90,0.45) 36%, rgba(232,106,90,0.45) 68%, transparent 70%)',
				animation: `${innerPulse} 12s ease-in-out infinite`,
				filter: 'blur(1.5px)',
			}}
		/>

		{/* Glow bloom behind the ring */}
		<Box
			sx={{
				position: 'absolute',
				inset: 60,
				borderRadius: '50%',
				background: 'transparent',
				border: '3px solid rgba(232,106,90,0.15)',
				animation: `${glowRing} 6s ease-in-out infinite`,
			}}
		/>

		{/* Soft radial glow fill (not a ring, just ambient light) */}
		<Box
			sx={{
				position: 'absolute',
				inset: 80,
				borderRadius: '50%',
				background: 'radial-gradient(circle, rgba(232,106,90,0.08) 0%, transparent 70%)',
				animation: `${breathe} 8s ease-in-out infinite`,
			}}
		/>
	</Box>
);

// ── Main export ───────────────────────────────────────────────────────────────

export function ConsoleWithRing() {
	return (
		<Grid
			item
			size={{ xs: 12, md: 6 }}>
			<Box
				sx={{
					position: 'relative',
					perspective: '1200px',
					maxWidth: 580,
					mx: 'auto',
				}}>
				{/* ── Animated coral ring sits BEHIND the card ── */}
				<CoralAnimatedRing />

				{/* ── Mac-style window frame ── */}
				<Box
					sx={{
						position: 'relative',
						zIndex: 1,
						bgcolor: '#0f172a',
						borderRadius: 2,
						p: 1,
						overflow: 'hidden',
						boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
						border: '1px solid #1e293b',
					}}>
					{/* Title bar */}
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
							<Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ff5f56', opacity: 0.7 }} />
							<Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ffbd2e', opacity: 0.7 }} />
							<Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#28c940', opacity: 0.7 }} />
						</Box>
						<Typography
							variant="body2"
							sx={{ color: 'grey.400', fontWeight: 500, fontSize: '0.85rem' }}>
							GLOBAL PAYROLL CONSOLE V4.2
						</Typography>
					</Box>

					{/* Main content */}
					<Box sx={{ p: 3, bgcolor: '#0f172a' }}>
						{/* Top stats */}
						<Grid
							container
							spacing={2}
							sx={{ mb: 3 }}>
							{[
								{ label: 'TOTAL GROSS', value: '$1,482,900', bg: 'transparent' },
								{ label: 'TAX LIABILITY', value: '$342,105', bg: 'transparent' },
								{ label: 'VALIDATION', value: '100% Pass', bg: 'rgba(59,130,246,0.1)', color: '#22c55e' },
							].map(({ label, value, bg, color }) => (
								<Grid
									item
									size={{ xs: 4 }}
									key={label}>
									<Box
										sx={{
											bgcolor: bg,
											border: bg === 'transparent' ? '1px solid #334155' : 'none',
											borderRadius: 2,
											p: 2,
											textAlign: 'left',
										}}>
										<Typography
											variant="caption"
											sx={{ color: 'grey.400', display: 'block', mb: 0.5 }}>
											{label}
										</Typography>
										<Typography
											variant="h6"
											sx={{ color: color ?? 'white', fontWeight: 700, fontSize: '1.1rem' }}>
											{value}
										</Typography>
									</Box>
								</Grid>
							))}
						</Grid>

						{/* Approval Workflow */}
						<Box
							sx={{
								border: '1px solid #334155',
								borderRadius: 2,
								p: 2.5,
								mb: 2,
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
												height: '100%',
												width: '75%',
												bgcolor: '#3b82f6',
												borderRadius: 4,
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
											sx={{ color: i < 2 ? 'grey.500' : 'grey.400' }}>
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
						opacity: 0.25,
						filter: 'blur(40px)',
						zIndex: -1,
						transform: 'rotate(-5deg)',
					}}
				/>
			</Box>
		</Grid>
	);
}
