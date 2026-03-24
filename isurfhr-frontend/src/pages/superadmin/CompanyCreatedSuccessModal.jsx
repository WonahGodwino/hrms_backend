import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const CompanyCreatedSuccessModal = ({ open, onClose, onViewCompany }) => {
	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth>
			<DialogTitle
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					borderBottom: '1px solid #e0e0e0',
					p: 3,
				}}>
				<Typography
					variant="h6"
					component="span"
					fontWeight={600}>
					Company Created Successfully
				</Typography>
				<IconButton
					onClick={onClose}
					aria-label="close">
					<CloseIcon />
				</IconButton>
			</DialogTitle>
			<DialogContent sx={{ p: 3, textAlign: 'center' }}>
				<Box sx={{ my: 3 }}>
					<CheckCircleIcon sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
					<Typography
						variant="body1"
						gutterBottom>
						The company has been successfully registered in the system.
					</Typography>
					<Typography
						variant="body2"
						color="text.secondary">
						You can now add users and configure settings for this company.
					</Typography>
				</Box>
			</DialogContent>
			<DialogActions sx={{ p: 3, borderTop: '1px solid #e0e0e0' }}>
				<Button
					onClick={onClose}
					variant="outlined"
					sx={{ mr: 1 }}>
					Close
				</Button>
				<Button
					onClick={onViewCompany}
					variant="contained">
					View Company Details
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default CompanyCreatedSuccessModal;
