import React from 'react';
import { Box, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const PreviewPayslip = ({ open, previewUrl, isDarkMode, onClose }) => {
	if (!open || !previewUrl) return null;

	return (
		<Box
			sx={{
				position: 'fixed',
				top: 0,
				left: 0,
				width: '100vw',
				height: '100vh',
				bgcolor: 'rgba(0,0,0,0.6)',
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				zIndex: 9999,
				p: 2,
			}}
			onClick={onClose}>
			<Box
				sx={{
					width: '90%',
					height: '90%',
					bgcolor: isDarkMode ? '#1e293b' : '#fff',
					borderRadius: 2,
					overflow: 'hidden',
					position: 'relative',
					boxShadow: 24,
					display: 'flex',
					flexDirection: 'column',
				}}
				onClick={(e) => e.stopPropagation()}>
				{/* Toolbar */}
				<Box
					sx={{
						height: 40,
						bgcolor: isDarkMode ? '#0f172a' : '#f1f5f9',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'flex-end',
						px: 2,
						flexShrink: 0,
					}}>
					<Button
						onClick={onClose}
						sx={{
							'minWidth': 'auto',
							'p': 0.8,
							'borderRadius': '50%',
							'color': isDarkMode ? '#fff' : '#000',
							'bgcolor': isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
							'&:hover': {
								bgcolor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
							},
						}}>
						<CloseIcon sx={{ fontSize: 20 }} />
					</Button>
				</Box>

				{/* PDF Preview */}
				<iframe
					src={previewUrl}
					title="Payslip Preview"
					width="100%"
					height="100%"
					style={{ border: 'none', flexGrow: 1 }}
				/>
			</Box>
		</Box>
	);
};

export default PreviewPayslip;
