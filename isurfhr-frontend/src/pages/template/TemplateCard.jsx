import { Box, Typography, Avatar, CardContent, Card } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';

const NEWEST_TEMPLATES = [
	{ id: 1, title: 'User Research', status: 'DRAFT', date: '16th Feb 2026', icon: 'shield' },
	{ id: 2, title: 'User Research', status: null, date: '16th Feb 2026', icon: 'doc' },
	{ id: 3, title: 'User Research', status: 'DRAFT', date: '15th Feb 2026', icon: 'shield' },
	{ id: 4, title: 'User Research', status: null, date: '16th Feb 2026', icon: 'doc' },
];

export function TemplateCards() {
	return (
		<Box
			sx={{
				'mx': { xs: -2, sm: -4, md: -6 }, // full-bleed (negate parent padding)
				'px': { xs: 2, sm: 4, md: 6 }, // restore internal spacing
				'maxWidth': '93dvw', // safer than 93vw in most cases
				'overflowX': 'auto',
				'py': 2, // breathing room top/bottom
				// Nice scrollbar (optional – remove if you prefer browser default)
				'&::-webkit-scrollbar': { height: 8 },
				// '&::-webkit-scrollbar-track': { bgcolor: 'rgba(255,255,255,0.03)' },
				'&::-webkit-scrollbar-thumb': {
					'bgcolor': 'grey.600',
					'borderRadius': 4,
					'&:hover': { bgcolor: 'grey.500' },
				},
				// 'scrollbarWidth': 'thin', // Firefox support
				// 'scrollbarColor': 'grey.600 transparent',
			}}>
			<Box
				sx={{
					display: 'flex',
					flexDirection: 'row',
					gap: { xs: 2, sm: 3 },
					minWidth: 'max-content', // prevents cards from squishing
					pb: 1, // extra bottom space if scrollbar appears
				}}>
				{NEWEST_TEMPLATES.map((template) => {
					const isShield = template.icon === 'shield';
					const hasStatus = !!template.status;

					return (
						<Card
							key={template.id}
							elevation={0}
							sx={{
								'flex': '0 0 220px',
								'scrollSnapAlign': 'start',
								'bgcolor': '#162033',
								'borderRadius': 2,
								'border': '1px solid rgba(255,255,255,0.05)',
								'display': 'flex',
								'flexDirection': 'column',
								'justifyContent': 'space-between',
								'minHeight': 110,
								'cursor': 'pointer',
								'transition': 'all 0.2s ease',
								'&:hover': {
									transform: 'translateY(-4px)',
									boxShadow: isShield ? '0 4px 16px rgba(33, 150, 243, 0.2)' : '0 4px 16px rgba(34, 197, 94, 0.2)',
									borderColor: isShield ? 'rgba(33,150,243,0.3)' : 'rgba(34,197,94,0.3)',
								},
							}}
							// Add onClick if you want navigation/selection
							// onClick={() => handleTemplateClick(template.id)}
						>
							<CardContent sx={{ 'p': 2, 'pb': 1.5, '&:last-child': { pb: 1.5 } }}>
								{/* Top row: Icon + optional Status badge */}
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
									<Avatar
										sx={{
											bgcolor: isShield ? 'rgba(33,150,243,0.12)' : 'rgba(34,197,94,0.12)',
											width: 32,
											height: 32,
										}}>
										{isShield ? <ShieldOutlinedIcon sx={{ color: '#2196f3', fontSize: 18 }} /> : <AssignmentOutlinedIcon sx={{ color: '#22c55e', fontSize: 18 }} />}
									</Avatar>

									{/* {hasStatus && (
										<Box
											sx={{
												px: 0.8,
												py: 0.2,
												borderRadius: '4px',
												bgcolor: 'rgba(234,179,8,0.12)',
												border: '1px solid rgba(234,179,8,0.25)',
											}}>
											<Typography
												variant="caption"
												sx={{
													color: '#eab308',
													fontWeight: 700,
													fontSize: '0.6rem',
													letterSpacing: '0.05em',
												}}>
												{template.status}
											</Typography>
										</Box>
									)} */}

									{hasStatus && (
										<Box
											sx={{
												px: 0.8,
												py: 0.2,
												borderRadius: '4px',
											}}>
											<Typography
												variant="caption"
												sx={{
													color: 'grey.500',
													fontWeight: 700,
													fontSize: '0.6rem',
													letterSpacing: '0.05em',
												}}>
												{template.status}
											</Typography>
										</Box>
									)}
								</Box>

								{/* Title */}
								<Typography
									fontWeight={700}
									color="white"
									sx={{
										fontSize: '0.92rem',
										mt: 1,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
										lineHeight: 1.3,
									}}>
									{template.title}
								</Typography>

								{/* Date */}
								<Typography
									variant="caption"
									sx={{
										color: '#475569',
										fontSize: '0.68rem',
										mt: 0.5,
										display: 'block',
									}}>
									{template.date}
								</Typography>
							</CardContent>
						</Card>
					);
				})}
			</Box>
		</Box>
	);
}
