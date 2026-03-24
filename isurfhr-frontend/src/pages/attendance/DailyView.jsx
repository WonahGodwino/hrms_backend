import React, { useState, useEffect, useMemo } from 'react';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Chip, Box, Avatar, Alert, Pagination } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';

const DailyView = ({ data, date, companyId }) => {
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 6,
		total: 0,
	});

	useEffect(() => {
		setPagination((prev) => ({
			...prev,
			total: data?.length || 0,
			page: 1, // Reset to first page when data changes
		}));
	}, [data]);

	const paginatedData = useMemo(() => {
		if (!data || !Array.isArray(data)) return [];
		const startIndex = (pagination.page - 1) * pagination.pageSize;
		const endIndex = startIndex + pagination.pageSize;
		return data.slice(startIndex, endIndex);
	}, [data, pagination.page, pagination.pageSize]);

	// Helper function to format time
	const formatTime = (isoString) => {
		if (!isoString) return '--:--';
		try {
			return new Date(isoString).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			});
		} catch (error) {
			return '--:--';
		}
	};

	// Helper function to get status chip
	const getStatusChip = (status) => {
		const config = {
			PRESENT: { color: '#10b981', label: 'Present' },
			LATE: { color: '#f59e0b', label: 'Late' },
			ABSENT: { color: '#ef4444', label: 'Absent' },
			HALF_DAY: { color: '#8b5cf6', label: 'Half Day' },
			ON_LEAVE: { color: '#8b5cf6', label: 'On Leave' },
			default: { color: '#6b7280', label: 'Unknown' },
		};

		const { color, label } = config[status] || config.default;

		return (
			<Chip
				label={label}
				size="small"
				sx={{
					bgcolor: `${color}20`,
					color: color,
					fontWeight: 600,
					fontSize: '0.75rem',
					height: 24,
					borderRadius: 1,
				}}
			/>
		);
	};

	// Helper function to get method chip
	const getMethodChip = (method) => {
		if (!method) return null;

		return (
			<Chip
				label={method.toUpperCase()}
				size="small"
				variant="outlined"
				sx={{
					borderColor: 'rgba(255,255,255,0.2)',
					color: 'rgba(255,255,255,0.7)',
					fontSize: '0.7rem',
					height: 20,
				}}
			/>
		);
	};

	// Check if data is valid
	if (!data || !Array.isArray(data)) {
		return (
			<Paper
				elevation={0}
				sx={{
					p: 8,
					borderRadius: 2,
					bgcolor: '#162033',
					border: '1px solid rgba(255,255,255,0.08)',
					textAlign: 'center',
					minHeight: 400,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					alignItems: 'center',
				}}>
				<Alert
					severity="warning"
					sx={{ mb: 2 }}>
					Invalid data format received
				</Alert>
				<Typography
					variant="body2"
					sx={{ color: 'rgba(255,255,255,0.4)' }}>
					Please check the API response format.
				</Typography>
			</Paper>
		);
	}

	if (data.length === 0) {
		return (
			<Paper
				elevation={0}
				sx={{
					p: 8,
					borderRadius: 2,
					bgcolor: '#162033',
					border: '1px solid rgba(255,255,255,0.08)',
					textAlign: 'center',
					minHeight: 400,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					alignItems: 'center',
				}}>
				<Typography
					variant="h6"
					sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
					No attendance records found
				</Typography>
				<Typography
					variant="body2"
					sx={{ color: 'rgba(255,255,255,0.4)' }}>
					There are no attendance records for this date.
				</Typography>
			</Paper>
		);
	}

	return (
		<Paper
			elevation={0}
			sx={{
				borderRadius: 2,
				overflow: 'hidden',
				bgcolor: '#162033',
				border: '0.5px solid rgba(255,255,255,0.08)',
			}}>
			<TableContainer>
				<Table>
					<TableHead>
						<TableRow sx={{ bgcolor: 'rgba(30, 41, 59, 0.5)' }}>
							<TableCell
								sx={{
									color: 'rgba(255,255,255,0.7)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									py: 2,
									pl: 3,
								}}>
								Staff
							</TableCell>
							<TableCell
								sx={{
									color: 'rgba(255,255,255,0.7)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									py: 2,
								}}>
								Department
							</TableCell>
							<TableCell
								sx={{
									color: 'rgba(255,255,255,0.7)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									py: 2,
								}}>
								Sign In
							</TableCell>
							<TableCell
								sx={{
									color: 'rgba(255,255,255,0.7)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									py: 2,
								}}>
								Sign Out
							</TableCell>
							<TableCell
								sx={{
									color: 'rgba(255,255,255,0.7)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									py: 2,
								}}>
								Status
							</TableCell>
							<TableCell
								sx={{
									color: 'rgba(255,255,255,0.7)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									py: 2,
								}}>
								Method
							</TableCell>
						</TableRow>
					</TableHead>

					<TableBody>
						{paginatedData.map((record) => {
							const staff = record.staff || {};
							return (
								<TableRow
									key={record.id || record.staffId}
									hover
									sx={{
										'cursor': 'pointer',
										'bgcolor': '#0f172a',
										'&:hover': { bgcolor: '#1a2332' },
									}}>
									<TableCell sx={{ py: 2, pl: 3, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
											<Avatar
												sx={{
													width: 36,
													height: 36,
													bgcolor: 'rgba(33, 150, 243, 0.1)',
													color: '#2196f3',
												}}>
												<PersonIcon />
											</Avatar>
											<Box>
												<Typography sx={{ color: '#fff', fontWeight: 500 }}>
													{staff.firstName || ''} {staff.lastName || ''}
												</Typography>
												<Typography
													variant="body2"
													sx={{ color: 'rgba(255,255,255,0.6)' }}>
													{staff.position || staff.staffId || ''}
												</Typography>
											</Box>
										</Box>
									</TableCell>

									<TableCell sx={{ py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
										<Chip
											label={staff.department || 'N/A'}
											size="small"
											sx={{
												bgcolor: 'rgba(148, 163, 184, 0.1)',
												color: '#94a3b8',
												fontWeight: 500,
											}}
										/>
									</TableCell>

									<TableCell sx={{ py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
											<AccessTimeIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }} />
											<Typography sx={{ color: '#fff', fontFamily: 'monospace' }}>{formatTime(record.signInAt)}</Typography>
										</Box>
									</TableCell>

									<TableCell sx={{ py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
											<AccessTimeIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }} />
											<Typography sx={{ color: '#fff', fontFamily: 'monospace' }}>{formatTime(record.signOutAt)}</Typography>
										</Box>
									</TableCell>

									<TableCell sx={{ py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{getStatusChip(record.status)}</TableCell>

									<TableCell sx={{ py: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{getMethodChip(record.method)}</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</TableContainer>

			<Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
				<Pagination
					count={Math.ceil(pagination.total / pagination.pageSize) || 1}
					page={pagination.page}
					onChange={(_, page) => setPagination((prev) => ({ ...prev, page }))}
					color="primary"
					sx={{
						'& .MuiPaginationItem-root': { color: '#fff' },
						'& .Mui-selected': { bgcolor: '#2196f3' },
					}}
				/>
			</Box>
		</Paper>
	);
};

export default DailyView;
