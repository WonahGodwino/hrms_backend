import {
	Box,
	Typography,
	Button,
	Stack,
	Table,
	TableBody,
	TableHead,
	TableContainer,
	TableCell,
	TableRow,
	Paper,
	IconButton,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
} from '@mui/material';
import { Close } from '@mui/icons-material';

export const PreviewModal = ({ open, onClose, previewData }) => {
	if (!previewData) return null;

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="xl"
			fullWidth
			PaperProps={{
				sx: {
					bgcolor: '#0f172a',
					border: '1px solid rgba(255,255,255,0.08)',
					backgroundImage: 'none',
				},
			}}>
			<DialogTitle sx={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
				<Stack
					direction="row"
					justifyContent="space-between"
					alignItems="center">
					<Typography
						variant="h6"
						fontWeight={600}>
						File Preview ({previewData.totalRows} rows)
					</Typography>
					<IconButton
						onClick={onClose}
						sx={{ color: 'rgba(255,255,255,0.5)' }}>
						<Close />
					</IconButton>
				</Stack>
			</DialogTitle>

			<DialogContent sx={{ mt: 2 }}>
				<Box
					sx={{
						'maxHeight': '70vh',
						'overflow': 'auto',
						'&::-webkit-scrollbar': {
							width: '8px',
							height: '8px',
						},
						'&::-webkit-scrollbar-track': {
							background: 'rgba(255,255,255,0.05)',
						},
						'&::-webkit-scrollbar-thumb': {
							background: 'rgba(255,255,255,0.2)',
							borderRadius: '4px',
						},
					}}>
					<TableContainer
						component={Paper}
						sx={{ bgcolor: 'transparent' }}>
						<Table stickyHeader>
							<TableHead>
								<TableRow>
									{previewData.headers.map((header, index) => (
										<TableCell
											key={index}
											sx={{
												bgcolor: '#1e293b',
												color: '#fff',
												fontWeight: 600,
												borderBottom: '2px solid rgba(255,255,255,0.08)',
												whiteSpace: 'nowrap',
											}}>
											{header}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{previewData.rows.map((row, rowIndex) => (
									<TableRow key={rowIndex}>
										{previewData.headers.map((header, colIndex) => (
											<TableCell
												key={colIndex}
												sx={{
													color: 'rgba(255,255,255,0.7)',
													borderBottom: '1px solid rgba(255,255,255,0.05)',
												}}>
												{row[header]?.toString() || '-'}
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</Box>
			</DialogContent>

			<DialogActions sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', p: 2 }}>
				<Button
					onClick={onClose}
					variant="outlined"
					sx={{
						'borderColor': 'rgba(255,255,255,0.3)',
						'color': '#fff',
						'&:hover': {
							borderColor: 'rgba(255,255,255,0.5)',
							backgroundColor: 'rgba(255,255,255,0.05)',
						},
					}}>
					Close
				</Button>
			</DialogActions>
		</Dialog>
	);
};
