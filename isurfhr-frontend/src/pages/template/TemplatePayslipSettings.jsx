import { useState, useEffect } from 'react';
import {
	Box,
	Typography,
	TextField,
	Select,
	MenuItem,
	FormControl,
	FormControlLabel,
	Switch,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
} from '@mui/material';

export const PayslipDialog = ({ open, field, sections, onClose, onSave, updateFieldPayslip }) => {
	const [localSettings, setLocalSettings] = useState({
		visible: true,
		sectionId: '',
		displayName: '',
		order: 1,
	});

	// Initialize local state when dialog opens or field changes
	useEffect(() => {
		if (field) {
			setLocalSettings({
				visible: field.payslip?.visible ?? true,
				sectionId: field.payslip?.sectionId || sections[0]?.id || '',
				displayName: field.payslip?.displayName || field.displayName || '',
				order: field.payslip?.order || 1,
			});
		}
	}, [field, sections]);

	const handleSave = () => {
		onSave(field?.id, localSettings);
	};

	const handleClose = () => {
		onClose();
	};

	if (!field) return null;

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: {
					background: '#0f172a',
					color: '#fff',
					borderRadius: 2,
				},
			}}>
			<DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2 }}>
				<Typography sx={{ fontWeight: 600, color: '#fff' }}>Payslip Settings - {field.displayName}</Typography>
			</DialogTitle>

			<DialogContent sx={{ mt: 2 }}>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
					{/* Visibility Toggle */}
					<Box>
						<FormControlLabel
							control={
								<Switch
									checked={localSettings.visible}
									onChange={(e) => setLocalSettings({ ...localSettings, visible: e.target.checked })}
									sx={{
										'& .MuiSwitch-switchBase': {
											'&.Mui-checked': {
												'color': '#4ade80',
												'& + .MuiSwitch-track': { backgroundColor: '#4ade80' },
											},
										},
									}}
								/>
							}
							label={<Typography sx={{ color: '#fff' }}>{localSettings.visible ? 'Show on payslip' : 'Hide on payslip'}</Typography>}
						/>
					</Box>

					{/* Conditional fields based on visibility */}
					{localSettings.visible && (
						<>
							{/* Section Select */}
							<Box>
								<Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', mb: 1 }}>Payslip Section</Typography>
								<FormControl
									fullWidth
									size="small">
									<Select
										value={localSettings.sectionId}
										onChange={(e) => setLocalSettings({ ...localSettings, sectionId: e.target.value })}
										sx={{
											'bgcolor': '#0f172a',
											'color': '#fff',
											'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
											'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
											'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
										}}>
										{sections.map((section) => (
											<MenuItem
												key={section.id}
												value={section.id}>
												{section.name}
											</MenuItem>
										))}
									</Select>
								</FormControl>
							</Box>

							{/* Display Name on Payslip */}
							<Box>
								<Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', mb: 1 }}>Display Name on Payslip</Typography>
								<TextField
									fullWidth
									size="small"
									value={localSettings.displayName}
									onChange={(e) => setLocalSettings({ ...localSettings, displayName: e.target.value })}
									sx={{
										'& .MuiOutlinedInput-root': {
											'bgcolor': '#0f172a',
											'& input': { color: '#fff' },
											'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
											'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
											'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
										},
									}}
								/>
							</Box>

							{/* Order in Section */}
							<Box>
								<Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', mb: 1 }}>Order in Section</Typography>
								<TextField
									fullWidth
									size="small"
									type="number"
									value={localSettings.order}
									onChange={(e) => setLocalSettings({ ...localSettings, order: parseInt(e.target.value) || 1 })}
									inputProps={{ min: 1 }}
									sx={{
										'& .MuiOutlinedInput-root': {
											'bgcolor': '#0f172a',
											'& input': { color: '#fff' },
											'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
											'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
											'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
										},
									}}
								/>
							</Box>
						</>
					)}
				</Box>
			</DialogContent>

			<DialogActions sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', p: 2, gap: 1 }}>
				<Button
					onClick={handleClose}
					sx={{
						'color': 'rgba(255,255,255,0.7)',
						'&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
					}}>
					Cancel
				</Button>
				<Button
					onClick={handleSave}
					variant="contained"
					sx={{
						'bgcolor': '#2196f3',
						'&:hover': { bgcolor: '#1976d2' },
					}}>
					Save Settings
				</Button>
			</DialogActions>
		</Dialog>
	);
};
