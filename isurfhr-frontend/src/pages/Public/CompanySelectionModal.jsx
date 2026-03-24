import { useState } from 'react';
import { Box, Button, Card, Modal, Typography, FormControl, InputLabel, Select, MenuItem, CircularProgress, Backdrop } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

const tokens = () => ({
	primary: {
		100: '#d0dfff',
		500: '#135bec',
		600: '#0d4bd1',
		700: '#0938a0',
		800: '#06266f',
	},
	gray: {
		100: '#f6f6f8',
		900: '#101622',
	},
	background: {
		light: '#f6f6f8',
		dark: '#101622',
	},
});

export function CompanySelectionModal({ open, onOpenChange, companies, onSelect, loading }) {
	const theme = useTheme();
	const [selectedCompanyId, setSelectedCompanyId] = useState('');
	const [error, setError] = useState('');

	const colors = tokens(theme.palette.mode);

	const handleSubmit = () => {
		if (!selectedCompanyId) {
			setError('Please select a company');
			return;
		}
		onSelect(selectedCompanyId);
	};

	const handleClose = () => {
		setSelectedCompanyId('');
		setError('');
		onOpenChange(false);
	};

	return (
		<Modal
			open={open}
			onClose={handleClose}
			closeAfterTransition
			slots={{ backdrop: Backdrop }}
			slotProps={{
				backdrop: {
					sx: {
						'backgroundColor': 'rgba(0,0,0,0.55)',
						'&::before': {
							content: '""',
							position: 'fixed',
							inset: 0,
							backdropFilter: 'blur(6px)',
							WebkitBackdropFilter: 'blur(6px)',
							zIndex: -1,
						},
					},
				},
			}}>
			<Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
				<Card
					sx={{
						isolation: 'isolate',
						width: '100%',
						maxWidth: 420,
						borderRadius: 3,
						overflow: 'hidden',
						boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
					}}>
					{/* Header */}
					<Box
						sx={{
							p: 3,
							color: '#fff',
							background: `linear-gradient(135deg, ${colors.primary[700]} 0%, ${colors.primary[800]} 80%)`,
						}}>
						<Box
							display="flex"
							justifyContent="space-between"
							alignItems="center">
							<Box
								display="flex"
								gap={1.5}
								alignItems="center">
								<BusinessOutlinedIcon />
								<Box>
									<Typography fontWeight={700}>Select Company</Typography>
									<Typography
										variant="caption"
										sx={{ opacity: 0.85 }}>
										Choose which company to reset password for
									</Typography>
								</Box>
							</Box>
							<IconButton
								onClick={handleClose}
								sx={{ color: '#fff' }}>
								<CloseIcon />
							</IconButton>
						</Box>
					</Box>

					{/* Body */}
					<Box sx={{ p: 4 }}>
						<Typography
							variant="body2"
							color="text.secondary"
							align="center"
							sx={{ mb: 3 }}>
							Your email is associated with multiple companies. Please select one to continue.
						</Typography>

						{/* Company Select */}
						<FormControl
							fullWidth
							sx={{ mb: 3 }}>
							<InputLabel id="company-select-label">Company</InputLabel>
							<Select
								labelId="company-select-label"
								id="company-select"
								value={selectedCompanyId}
								label="Company"
								onChange={(e) => {
									setSelectedCompanyId(e.target.value);
									setError('');
								}}
								sx={{
									borderRadius: 2,
									bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#fff',
								}}>
								{companies?.map((company) => (
									<MenuItem
										key={company.companyId}
										value={company.companyId}>
										{company.companyName}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						{error && (
							<Typography
								variant="caption"
								color="error"
								sx={{ display: 'block', mb: 2, textAlign: 'center' }}>
								{error}
							</Typography>
						)}

						{/* Continue Button */}
						<Button
							fullWidth
							disabled={loading || !selectedCompanyId}
							onClick={handleSubmit}
							variant="contained"
							sx={{
								py: 1.25,
								fontWeight: 700,
								borderRadius: 2,
							}}>
							{loading ? (
								<>
									<CircularProgress
										size={18}
										sx={{ mr: 1, color: '#fff' }}
									/>
									Processing…
								</>
							) : (
								'Continue'
							)}
						</Button>
					</Box>
				</Card>
			</Box>
		</Modal>
	);
}
