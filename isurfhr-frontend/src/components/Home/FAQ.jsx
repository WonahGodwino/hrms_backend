import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export function FaqItem({ question, answer }) {
	const [open, setOpen] = useState(false);

	return (
		<Box
			onClick={() => setOpen((prev) => !prev)}
			sx={{
				'bgcolor': '#fff',
				'borderRadius': '14px',
				'border': '1.5px solid #e8edf5',
				'px': 3,
				'py': 2.5,
				'cursor': 'pointer',
				'transition': 'box-shadow 0.2s ease',
				'&:hover': {
					boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
				},
			}}>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 2,
				}}>
				<Typography
					sx={{
						fontWeight: 700,
						fontSize: '0.95rem',
						color: '#0d1b2a',
					}}>
					{question}
				</Typography>
				<ExpandMoreIcon
					sx={{
						color: '#94a3b8',
						fontSize: 22,
						flexShrink: 0,
						transition: 'transform 0.25s ease',
						transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
					}}
				/>
			</Box>

			<Box
				sx={{
					overflow: 'hidden',
					maxHeight: open ? '200px' : '0px',
					transition: 'max-height 0.3s ease',
				}}>
				<Typography
					variant="body2"
					sx={{
						color: '#64748b',
						fontSize: '0.9rem',
						lineHeight: 1.7,
						pt: 2,
					}}>
					{answer}
				</Typography>
			</Box>
		</Box>
	);
}
