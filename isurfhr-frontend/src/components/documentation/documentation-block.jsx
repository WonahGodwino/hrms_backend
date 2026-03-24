import { Box, Typography, useTheme } from '@mui/material';

export function DocImageBlock({ src, alt, caption }) {
	const theme = useTheme();
	const isDarkMode = theme.palette.mode === 'dark';

	return (
		<Box sx={{ my: 4 }}>
			<Box
				component="img"
				src={src}
				alt={alt}
				sx={{
					width: '100%',
					borderRadius: 4,
					border: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
					boxShadow: isDarkMode ? '0 20px 40px rgba(0,0,0,0.4)' : '0 20px 40px rgba(0,0,0,0.12)',
				}}
			/>
			{caption && (
				<Typography
					variant="body2"
					sx={{
						mt: 1.5,
						textAlign: 'center',
						color: isDarkMode ? '#9dabb9' : '#64748b',
					}}>
					{caption}
				</Typography>
			)}
		</Box>
	);
}
