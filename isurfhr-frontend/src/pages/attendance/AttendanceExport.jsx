import React, { useState } from 'react';
import {
	Modal,
	Box,
	Typography,
	Button,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Stack,
	IconButton,
	RadioGroup,
	FormControlLabel,
	Radio,
	Alert,
	CircularProgress,
	Paper,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import GridOnIcon from '@mui/icons-material/GridOn';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { formatType } from '@/lib/export';

const AttendanceExport = ({ open, onClose, companyId, filters = {}, onExport }) => {
	const [loading, setLoading] = useState(false);
	const [exportType, setExportType] = useState('pdf');
	const [exportRange, setExportRange] = useState('current');
	const [startDate, setStartDate] = useState(new Date());
	const [endDate, setEndDate] = useState(new Date());
	const [error, setError] = useState('');

	const handleExport = async () => {
		setLoading(true);
		setError('');

		try {
			const exportConfig = {
				companyId,
				type: exportType,
				range: exportRange,
				startDate: exportRange === 'custom' ? format(startDate, 'yyyy-MM-dd') : null,
				endDate: exportRange === 'custom' ? format(endDate, 'yyyy-MM-dd') : null,
				filters: filters,
			};

			if (onExport) {
				onExport(exportConfig);
			}

			// Show success and close
			onClose();
			setLoading(false);
		} catch (err) {
			setError(err.message || 'Failed to generate export');
			setLoading(false);
		}
	};

	return (
		<Modal
			open={open}
			onClose={loading ? undefined : onClose}
			closeAfterTransition
			BackdropProps={{
				sx: {
					backdropFilter: 'blur(10px)',
					backgroundColor: 'rgba(0,0,0,0.7)',
				},
			}}>
			<Box
				sx={{
					position: 'absolute',
					top: '50%',
					left: '50%',
					transform: 'translate(-50%, -50%)',
					width: { xs: '95%', sm: 500 },
					bgcolor: '#0f172a',
					border: '1px solid rgba(255,255,255,0.12)',
					borderRadius: 3,
					boxShadow: 24,
					p: 4,
					outline: 'none',
				}}>
				<LocalizationProvider dateAdapter={AdapterDateFns}>
					{/* Header */}
					<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
						<Typography
							variant="h5"
							fontWeight={600}
							sx={{ color: '#fff' }}>
							Export Attendance Report
						</Typography>
						<IconButton
							onClick={onClose}
							disabled={loading}
							sx={{ color: 'rgba(255,255,255,0.7)' }}>
							<CloseIcon />
						</IconButton>
					</Box>

					{error && (
						<Alert
							severity="error"
							sx={{ mb: 3, bgcolor: 'rgba(220, 38, 38, 0.1)', color: '#fca5a5' }}>
							{error}
						</Alert>
					)}

					{/* Export Options */}
					<Stack spacing={3}>
						{/* Export Format */}
						<FormControl
							fullWidth
							size="small">
							<InputLabel sx={{ color: 'rgba(255,255,255,0.7)' }}>Export Format</InputLabel>
							<Select
								value={exportType}
								onChange={(e) => setExportType(e.target.value)}
								label="Export Format"
								disabled={loading}
								sx={{
									'bgcolor': '#222b3f',
									'color': '#fff',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
										borderColor: '#2196f3',
									},
								}}>
								<MenuItem value="pdf">
									<Stack
										direction="row"
										alignItems="center"
										spacing={1}>
										<PictureAsPdfIcon sx={{ fontSize: 20, color: '#ef4444' }} />
										<Typography>PDF Document (.pdf)</Typography>
									</Stack>
								</MenuItem>
								<MenuItem value="excel">
									<Stack
										direction="row"
										alignItems="center"
										spacing={1}>
										<GridOnIcon sx={{ fontSize: 20, color: '#10b981' }} />
										<Typography>Excel Spreadsheet (.xlsx)</Typography>
									</Stack>
								</MenuItem>
								<MenuItem value="csv">
									<Stack
										direction="row"
										alignItems="center"
										spacing={1}>
										<GridOnIcon sx={{ fontSize: 20, color: '#3b82f6' }} />
										<Typography>CSV File (.csv)</Typography>
									</Stack>
								</MenuItem>
							</Select>
						</FormControl>

						{/* Date Range */}
						<Paper
							elevation={0}
							sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
							<Typography
								variant="subtitle2"
								sx={{ color: '#fff', mb: 2 }}>
								Date Range
							</Typography>

							<RadioGroup
								value={exportRange}
								onChange={(e) => setExportRange(e.target.value)}>
								<FormControlLabel
									value="current"
									control={
										<Radio
											size="small"
											sx={{
												'color': 'rgba(255,255,255,0.5)',
												'&.Mui-checked': {
													color: '#2196f3',
												},
											}}
										/>
									}
									label={
										<Typography
											variant="body2"
											sx={{ color: 'rgba(255,255,255,0.8)' }}>
											Current View ({filters.period || 'day'})
										</Typography>
									}
									disabled={loading}
								/>
								<FormControlLabel
									value="custom"
									control={
										<Radio
											size="small"
											sx={{
												'color': 'rgba(255,255,255,0.5)',
												'&.Mui-checked': {
													color: '#2196f3',
												},
											}}
										/>
									}
									label={
										<Typography
											variant="body2"
											sx={{ color: 'rgba(255,255,255,0.8)' }}>
											Custom Date Range
										</Typography>
									}
									disabled={loading}
								/>
							</RadioGroup>

							{exportRange === 'custom' && (
								<Stack
									direction="row"
									spacing={2}
									sx={{ mt: 2 }}>
									<DatePicker
										label="Start Date"
										value={startDate}
										onChange={setStartDate}
										disabled={loading}
										sx={{
											'flex': 1,
											'& .MuiInputLabel-root': {
												color: 'rgba(255,255,255,0.7)',
											},
											'& .MuiOutlinedInput-root': {
												'bgcolor': '#222b3f',
												'color': '#fff',
												'& fieldset': {
													borderColor: 'rgba(255,255,255,0.15)',
												},
												'&:hover fieldset': {
													borderColor: 'rgba(255,255,255,0.3)',
												},
												'&.Mui-focused fieldset': {
													borderColor: '#2196f3',
												},
											},
										}}
									/>
									<DatePicker
										label="End Date"
										value={endDate}
										onChange={setEndDate}
										disabled={loading}
										sx={{
											'flex': 1,
											'& .MuiInputLabel-root': {
												color: 'rgba(255,255,255,0.7)',
											},
											'& .MuiOutlinedInput-root': {
												'bgcolor': '#222b3f',
												'color': '#fff',
												'& fieldset': {
													borderColor: 'rgba(255,255,255,0.15)',
												},
												'&:hover fieldset': {
													borderColor: 'rgba(255,255,255,0.3)',
												},
												'&.Mui-focused fieldset': {
													borderColor: '#2196f3',
												},
											},
										}}
									/>
								</Stack>
							)}
						</Paper>

						{/* Preview Info */}
						<Paper
							elevation={0}
							sx={{ p: 2, bgcolor: 'rgba(33, 150, 243, 0.1)', borderRadius: 2 }}>
							<Typography
								variant="body2"
								sx={{ color: '#90caf9' }}>
								<strong>Export Summary:</strong>
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: '#90caf9', display: 'block', mt: 0.5 }}>
								• Format: {formatType(exportType)}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: '#90caf9', display: 'block' }}>
								• Range: {exportRange === 'current' ? 'Current view' : `${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`}
							</Typography>
							{filters.department && (
								<Typography
									variant="caption"
									sx={{ color: '#90caf9', display: 'block' }}>
									• Department: {filters.department}
								</Typography>
							)}
							{filters.status && (
								<Typography
									variant="caption"
									sx={{ color: '#90caf9', display: 'block' }}>
									• Status: {filters.status}
								</Typography>
							)}
						</Paper>

						{/* Action Buttons */}
						<Stack
							direction="row"
							spacing={2}
							justifyContent="flex-end">
							<Button
								variant="outlined"
								onClick={onClose}
								disabled={loading}
								sx={{
									'color': '#fff',
									'borderColor': 'rgba(255,255,255,0.2)',
									'&:hover': {
										borderColor: 'rgba(255,255,255,0.3)',
									},
								}}>
								Cancel
							</Button>
							<Button
								variant="contained"
								onClick={handleExport}
								disabled={loading}
								startIcon={
									loading ? (
										<CircularProgress
											size={20}
											sx={{ color: '#fff' }}
										/>
									) : (
										<DownloadIcon />
									)
								}
								sx={{
									'bgcolor': '#2196f3',
									'&:hover': { bgcolor: '#1976d2' },
									'&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)' },
								}}>
								{loading ? 'Generating...' : 'Export Report'}
							</Button>
						</Stack>
					</Stack>
				</LocalizationProvider>
			</Box>
		</Modal>
	);
};

export default AttendanceExport;
