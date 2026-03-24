import { Typography, Box } from '@mui/material';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const phrases = ['Secure Your HR Operations', 'Transform Your HR', 'Transform Your Business'];

export function HeroText() {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setIndex((prev) => (prev + 1) % phrases.length);
		}, 5000);

		return () => clearInterval(interval);
	}, []);

	return (
		<Typography
			variant="h1"
			component="h1"
			sx={{
				fontWeight: 800,
				fontSize: { xs: '2.5rem', sm: '3.5rem', md: '3rem' },
				lineHeight: 1.1,
				color: 'black',
				mb: 3,
			}}>
			Control, Automate,
			<br />
			and{' '}
			<Box
				component="span"
				sx={{
					display: 'inline',
					color: 'primary.main',
				}}>
				<AnimatePresence mode="wait">
					<Box
						key={phrases[index]}
						component={motion.span}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -20 }}
						transition={{
							duration: 0.5,
							ease: 'easeInOut',
						}}
						style={{ display: 'inline' }}>
						{phrases[index]}
					</Box>
				</AnimatePresence>
			</Box>
		</Typography>
	);
}
