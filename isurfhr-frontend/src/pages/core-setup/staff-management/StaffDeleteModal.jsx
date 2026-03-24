import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button, IconButton, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function StaffDeleteModal({ open, staffName, onClose, onConfirm, loading = false }) {
	return (
		<Dialog
			open={open}
			onClose={loading ? null : onClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: { borderRadius: 3 },
			}}>
			{/* Header */}
			<DialogTitle
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					borderBottom: '1px solid #e0e0e0',
					p: 3,
				}}>
				<Typography fontWeight={600}>Delete Staff</Typography>

				<IconButton
					onClick={onClose}
					disabled={loading}>
					<CloseIcon />
				</IconButton>
			</DialogTitle>

			{/* Content */}
			<DialogContent sx={{ p: 3, my: 3 }}>
				<Box
					display="flex"
					alignItems="flex-start"
					gap={2}>
					<WarningAmberIcon
						color="error"
						sx={{ fontSize: 32, mt: 0.5 }}
					/>

					<Box>
						<Typography
							fontWeight={600}
							gutterBottom>
							Are you sure you want to delete this staff?
						</Typography>

						<Typography
							variant="body2"
							color="text.secondary">
							This action will permanently remove
							{staffName ? ` ${staffName}` : ' this user'} from the system. This action cannot be undone.
						</Typography>
					</Box>
				</Box>
			</DialogContent>

			{/* Actions */}
			<DialogActions
				sx={{
					borderTop: '1px solid #e0e0e0',
					p: 3,
					gap: 1,
				}}>
				<Button
					onClick={onClose}
					disabled={loading}
					variant="outlined"
					color="inherit"
					sx={{
						'borderColor': '#e0e0e0',
						'color': 'text.secondary',
						'textTransform': 'none',
						'fontWeight': 500,
						'&:hover': {
							borderColor: '#bdbdbd',
							backgroundColor: '#f5f5f5',
						},
					}}>
					Cancel
				</Button>

				<Button
					onClick={onConfirm}
					variant="contained"
					color="error"
					disabled={loading}
					sx={{
						textTransform: 'none',
						fontWeight: 500,
					}}>
					{loading ? 'Deleting...' : 'Delete Staff'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
