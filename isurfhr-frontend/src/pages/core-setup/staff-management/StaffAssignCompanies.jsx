import React, { useState, useEffect } from 'react';
import {
	Box,
	Typography,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Button,
	CircularProgress,
	Chip,
	TextField,
	InputAdornment,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Snackbar,
	Alert,
	Checkbox,
	FormControlLabel,
	List,
	ListItem,
} from '@mui/material';
import { Search, Business, Person, CheckCircle, Cancel, Refresh, Delete, AdminPanelSettings, Work, PersonPin } from '@mui/icons-material';
import { getStaffList } from '@/services/StaffService';
import { getAccessibleCompany, assignCompaniesToStaff, removeCompanyAssignment, getAssignment } from '@/services/CompanyService';

// Helper function to get role display
const getRoleDisplay = (role) => {
	switch (role) {
		case 'ADMIN':
			return { label: 'Admin', icon: <AdminPanelSettings />, color: '#8b5cf6' };
		case 'HR':
			return { label: 'HR', icon: <Work />, color: '#10b981' };
		case 'STAFF':
			return { label: 'Staff', icon: <PersonPin />, color: '#3b82f6' };
		default:
			return { label: role, icon: <Person />, color: 'FFFFFF' };
	}
};

const StaffAssignCompanies = () => {
	// State for data
	const [staffData, setStaffData] = useState([]);
	const [companies, setCompanies] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadingCompanies, setLoadingCompanies] = useState(true);
	const [error, setError] = useState(null);
	const [snackbarOpen, setSnackbarOpen] = useState(false);
	const [snackbarMessage, setSnackbarMessage] = useState('');
	const [snackbarSeverity, setSnackbarSeverity] = useState('success');
	const [pagination, setPagination] = useState({
		page: 1,
		pageSize: 10,
		total: 0,
	});

	// Search and Filter State
	const [searchTerm, setSearchTerm] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [roleFilter, setRoleFilter] = useState('all');

	// Dialog State
	const [assignDialogOpen, setAssignDialogOpen] = useState(false);
	const [selectedStaff, setSelectedStaff] = useState(null);
	const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
	// Confirmation Dialog State
	const [multipleConfirmationDialogOpen, setMultipleConfirmationDialogOpen] = useState(false);
	const [staffToRemove, setStaffToRemove] = useState(null);

	const fetchStaff = async () => {
		setLoading(true);
		setError(null);

		try {
			let params = {};
			if (searchTerm.trim()) {
				params.search = searchTerm.trim();
			}

			const [staffRes, assignments] = await Promise.all([getStaffList(params), fetchViewAssignment()]);

			if (!staffRes?.data?.success) {
				throw new Error(staffRes?.message || 'Failed to fetch staff');
			}

			const staffArray = staffRes.data.data.staff || [];
			const assignmentCompanyMap = new Map();

			assignments.forEach((assignment) => {
				const staffId = assignment.userId;
				const company = assignment.company;

				if (!staffId || !company) return;

				const normalizedCompany = {
					companyName: company.companyName,
					email: company.email,
					address: company.address,
					taxId: company.taxId,
					id: company.id,
					phone: company.phone,
				};

				if (!assignmentCompanyMap.has(staffId)) {
					assignmentCompanyMap.set(staffId, []);
				}

				assignmentCompanyMap.get(staffId).push(normalizedCompany);
			});

			const transformedData = staffArray.map((staff) => {
				const staffId = staff.id || staff._id;
				return {
					id: staffId,
					staffId: staff.staffId || staff.employeeId || `STF-${staffId ? staffId.slice(-4) : '0000'}`,
					name: staff.name || staff.fullName || `${staff.firstName || ''} ${staff.lastName || ''}`.trim(),
					email: staff.email,
					department: staff.department || 'Unassigned',
					role: staff.role || 'STAFF',
					company: assignmentCompanyMap.has(staffId) ? assignmentCompanyMap.get(staffId) : [],
					status: assignmentCompanyMap.has(staffId) ? 'active' : 'pending_assignment',
					lastUpdated: staff.updatedAt
						? new Date(staff.updatedAt).toLocaleString('en-US', {
								year: 'numeric',
								month: '2-digit',
								day: '2-digit',
								hour: '2-digit',
								minute: '2-digit',
								hour12: true,
						  })
						: 'N/A',
				};
			});

			setStaffData(transformedData);

			if (staffRes.data.data.pagination) {
				setPagination({
					page: staffRes.data.data.pagination.page || 1,
					pageSize: staffRes.data.data.pagination.limit || 10,
					total: staffRes.data.data.pagination.totalCount || transformedData.length,
				});
			}
		} catch (err) {
			const errorMessage = err?.message || 'Failed to load staff data';
			setError(errorMessage);
			setSnackbarMessage(errorMessage);
			setSnackbarSeverity('error');
			setSnackbarOpen(true);
		} finally {
			setLoading(false);
		}
	};

	const fetchCompanies = async () => {
		setLoadingCompanies(true);
		try {
			const result = await getAccessibleCompany();

			if (result.data.success) {
				// Transform the API response to match your component's data structure
				const transformedCompanies = result.data.data.map((company) => ({
					id: company.id,
					name: company.companyName || 'Unknown Company',
					code: company.companyName || '',
					status: company.status || 'active',
					address: company.address,
					phone: company.phone,
					taxId: company.taxId,
					email: company.email,
				}));

				setCompanies(transformedCompanies);
			} else {
				// Handle API error response
				throw new Error(result.message || 'Failed to fetch companies');
			}
		} catch (err) {
			// Show error notification
			setSnackbarMessage(err.message || 'Failed to load companies');
			setSnackbarSeverity('error');
			setSnackbarOpen(true);
		} finally {
			setLoadingCompanies(false);
		}
	};

	const fetchViewAssignment = async () => {
		try {
			const response = await getAssignment();

			if (!response.data?.success) return [];

			return response.data.data.assignments || [];
		} catch (error) {
			void error;
			return [];
		}
	};

	useEffect(() => {
		fetchStaff();
		fetchCompanies();
	}, []);

	// Handle search
	const handleSearch = (e) => {
		setSearchTerm(e.target.value);
	};

	const handleSearchSubmit = () => {
		fetchStaff();
	};

	// Check if user can have multiple companies
	const canHaveMultipleCompanies = (role) => {
		return role === 'ADMIN'; // Admin can have multiple companies
	};

	// Handle assign company dialog open
	const handleOpenAssignDialog = (staff) => {
		setSelectedStaff(staff);
		setSelectedCompanyIds([...staff.company]); // Initialize with current assignments
		setAssignDialogOpen(true);
	};

	// Handle company selection change
	const handleCompanySelectionChange = (company) => {
		const staffRole = selectedStaff?.role;

		setSelectedCompanyIds((prev) => {
			const exists = prev.some((c) => c.id === company.id);

			// ADMIN: multi-select
			if (canHaveMultipleCompanies(staffRole)) {
				return exists ? prev.filter((c) => c.id !== company.id) : [...prev, company];
			}

			// STAFF: single-select (radio behavior)
			return exists ? [] : [company];
		});
	};

	// Handle assign companies
	const handleAssignCompanies = async () => {
		if (!selectedStaff) return;

		// Validate that STAFF roles don't have multiple companies selected
		if (!canHaveMultipleCompanies(selectedStaff.role) && selectedCompanyIds.length > 1) {
			setSnackbarMessage('Staff members can only be assigned to one company');
			setSnackbarSeverity('error');
			setSnackbarOpen(true);
			return;
		}

		// Validate that at least one company is selected if removing all
		if (selectedCompanyIds.length === 0) {
			const confirmRemove = window.confirm(`Remove all company assignments from ${selectedStaff.name}?`);
			if (!confirmRemove) return;
		}
		setLoading(true);
		try {
			// Prepare payload based on the staff role
			const payload = {
				userId: selectedStaff.id,
				role: selectedStaff.role,
			};

			if (selectedStaff.role === 'ADMIN') {
				// Can be used later when an array of Id's can be sent at once
				payload.companyId = selectedCompanyIds[selectedCompanyIds.length - 1].id;
			} else {
				payload.companyId = selectedCompanyIds[0].id;
			}

			const result = await assignCompaniesToStaff(payload);

			if (result.data.success) {
				await fetchStaff();

				// Show success message
				const message =
					selectedCompanyIds.length === 0
						? `All company assignments removed from ${selectedStaff.name}`
						: `Successfully assigned ${selectedCompanyIds.length} company(s) to ${selectedStaff.name}`;

				// setSnackbarMessage(message);
				setSnackbarSeverity('success');
				setSnackbarOpen(true);
				setAssignDialogOpen(false);

				// Clear selected data
				setSelectedStaff(null);
				setSelectedCompanyIds([]);
			} else {
				// Handle API error response
				throw new Error(result.message || 'Failed to assign companies');
			}
		} catch (err) {
			console.error('Error assigning companies:', err);

			// Show detailed error message
			const errorMessage = err.message || 'Failed to assign companies. Please try again.';
			setSnackbarMessage(errorMessage);
			setSnackbarSeverity('error');
			setSnackbarOpen(true);
			setAssignDialogOpen(false); // Don't close on error
		} finally {
			setLoading(false);
		}
	};

	const handleRemoveCompanyAssignment = async (staff, companyId) => {
		setLoading(true);

		try {
			if (!companyId) throw new Error('No company to remove');

			// REAL API CALL
			await removeCompanyAssignment(staff.id, companyId);

			// Update local state
			setStaffData((prev) =>
				prev.map((s) =>
					s.id === staff.id
						? {
								...s,
								company: staff.company.filter((company) => company.id !== companyId),
								status: staff.company.length === 0 ? 'pending_assignment' : 'active',
								lastUpdated: new Date().toLocaleString('en-US', {
									year: 'numeric',
									month: '2-digit',
									day: '2-digit',
									hour: '2-digit',
									minute: '2-digit',
									hour12: true,
								}),
						  }
						: s
				)
			);

			const companyName = companies.find((c) => c.id === companyId)?.name || 'Company';

			setSnackbarMessage(`${companyName} assignment removed successfully`);
			setSnackbarSeverity('success');
			setSnackbarOpen(true);
		} catch (err) {
			console.error(err);
			setSnackbarMessage('Failed to remove company assignment');
			setSnackbarSeverity('error');
			setSnackbarOpen(true);
		} finally {
			setLoading(false);
			setStaffToRemove(null);
		}
	};

	// Handle remove all company assignments
	const handleRemoveAllAssignments = async (staff) => {
		setLoading(true);
		try {
			// TODO: Replace with actual API call
			// const result = await removeAllCompanyAssignments(staff.id);

			// Mock API response
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Update local state
			setStaffData((prev) =>
				prev.map((s) =>
					s.id === staff.id
						? {
								...s,
								company: [],
								status: 'pending_assignment',
								lastUpdated: new Date().toLocaleString('en-US', {
									year: 'numeric',
									month: '2-digit',
									day: '2-digit',
									hour: '2-digit',
									minute: '2-digit',
									hour12: true,
								}),
						  }
						: s
				)
			);

			setSnackbarMessage(`All company assignments removed from ${staff.name}`);
			setSnackbarSeverity('success');
			setSnackbarOpen(true);
		} catch (err) {
			setSnackbarMessage('Failed to remove assignments');
			setSnackbarSeverity('error');
			setSnackbarOpen(true);
		} finally {
			setLoading(false);
			setStaffToRemove(null);
		}
	};

	// Add this function near other handler functions
	// const handleOpenRemoveAllConfirmation = (staff) => {
	// 	setStaffToRemove(staff);
	// 	setMultipleConfirmationDialogOpen(true);
	// };

	// Handle refresh
	const handleRefresh = () => {
		fetchStaff();
		fetchCompanies();
	};

	// Get status chip color
	const getStatusChip = (status) => {
		switch (status) {
			case 'active':
				return (
					<Chip
						label="Assigned"
						color="success"
						size="small"
						icon={<CheckCircle />}
					/>
				);
			case 'pending_assignment':
				return (
					<Chip
						label="Pending"
						color="warning"
						size="small"
						icon={<Person />}
					/>
				);
			case 'inactive':
				return (
					<Chip
						label="Inactive"
						color="error"
						size="small"
						icon={<Cancel />}
					/>
				);
			default:
				return (
					<Chip
						label={status}
						size="small"
					/>
				);
		}
	};

	// Get company chips for display
	const getCompanyChips = (staff) => {
		if (!staff.company || staff.company.length === 0) {
			return <Typography sx={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.875rem' }}>No companies assigned</Typography>;
		}

		return (
			<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
				{staff.company.map((companyDetails) => {
					const company = companies.find((company) => company.id === companyDetails.id);
					if (!company) return null;

					return (
						<Chip
							key={companyDetails.id}
							label={`${company.name}${company.code ? ` (${company.code})` : ''}`}
							size="small"
							onDelete={canHaveMultipleCompanies(staff.role) ? () => handleRemoveCompanyAssignment(staff, companyDetails.id) : undefined}
							deleteIcon={canHaveMultipleCompanies(staff.role) ? <Delete /> : undefined}
							sx={{
								backgroundColor: 'rgba(96, 165, 250, 0.1)',
								color: '#60a5fa',
								maxWidth: 180,
							}}
						/>
					);
				})}
			</Box>
		);
	};

	if (loading && staffData.length === 0) {
		return (
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					minHeight: '50vh',
					backgroundColor: '#0a1929',
				}}>
				<CircularProgress sx={{ color: '#2563eb' }} />
			</Box>
		);
	}

	return (
		<Box
			sx={{
				minHeight: '100vh',
				width: '100%',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				p: { xs: 2, sm: 3, md: 4 },
				backgroundColor: '#0a1929',
				fontFamily: '"Inter", sans-serif',
			}}>
			<Box sx={{ width: '100%', maxWidth: '1400px' }}>
				{/* Header */}
				<Box sx={{ mb: 4, px: 1 }}>
					<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
						<Box>
							<Typography
								variant="h4"
								component="h1"
								sx={{
									fontWeight: 900,
									fontSize: { xs: '1.875rem', sm: '2.25rem' },
									color: '#ffffff',
									letterSpacing: '-0.033em',
									lineHeight: 1.2,
									mb: 0.5,
									display: 'flex',
									alignItems: 'center',
									gap: 2,
								}}>
								<Business sx={{ fontSize: 36, color: '#60a5fa' }} />
								Staff Company Assignment
							</Typography>
							<Typography
								variant="body1"
								sx={{
									color: '#94a3b8',
									fontSize: '1rem',
									ml: 6,
								}}>
								Manage company assignments for staff members •
								<Box
									component="span"
									sx={{ ml: 1, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
									<Chip
										component={'span'}
										label="Staff: 1 Company"
										size="small"
										sx={{ height: 20, fontSize: '0.7rem' }}
									/>
									<Chip
										component={'span'}
										label="HR/Admin: Multiple"
										size="small"
										sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#8b5cf6' }}
									/>
								</Box>
							</Typography>
						</Box>
						<Button
							startIcon={<Refresh />}
							onClick={handleRefresh}
							sx={{
								'color': '#60a5fa',
								'borderColor': 'rgba(96, 165, 250, 0.3)',
								'&:hover': {
									borderColor: 'rgba(96, 165, 250, 0.5)',
									backgroundColor: 'rgba(96, 165, 250, 0.1)',
								},
							}}
							variant="outlined">
							Refresh
						</Button>
					</Box>

					{/* Search and Filter Bar */}
					<Paper
						elevation={0}
						sx={{
							p: 2,
							borderRadius: 2,
							border: '1px solid rgba(255,255,255,0.08)',
							backgroundColor: '#0f172a',
							display: 'flex',
							gap: 2,
							flexWrap: 'wrap',
							alignItems: 'center',
						}}>
						<TextField
							placeholder="Search staff by name, email, ID or department..."
							value={searchTerm}
							onChange={handleSearch}
							onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
							InputProps={{
								startAdornment: (
									<InputAdornment position="start">
										<Search sx={{ color: '#64748b' }} />
									</InputAdornment>
								),
								// Add loading indicator
								endAdornment: loading ? (
									<InputAdornment position="end">
										<CircularProgress
											size={20}
											sx={{ color: '#64748b' }}
										/>
									</InputAdornment>
								) : null,
							}}
							sx={{
								'flexGrow': 1,
								'minWidth': 300,
								'& .MuiOutlinedInput-root': {
									'backgroundColor': 'rgba(255,255,255,0.05)',
									'border': 'none',
									'& fieldset': {
										border: 'none',
									},
								},
								'& .MuiInputBase-input': {
									color: '#e2e8f0',
								},
							}}
						/>

						{/* This can be used later */}
						{/* <Button
							startIcon={<FilterList />}
							endIcon={<ArrowDropDown />}
							sx={{
								color: '#94a3b8',
								borderColor: 'rgba(148, 163, 184, 0.3)',
							}}
							variant="outlined">
							Filters
						</Button> */}

						<Button
							variant="contained"
							onClick={handleSearchSubmit}
							sx={{
								'backgroundColor': '#2563eb',
								'&:hover': {
									backgroundColor: '#1d4ed8',
								},
							}}>
							Search
						</Button>
					</Paper>
				</Box>

				{/* Table Container */}
				<Paper
					elevation={0}
					sx={{
						borderRadius: 3,
						border: '1px solid rgba(255,255,255,0.08)',
						backgroundColor: '#0f172a',
						overflow: 'hidden',
						position: 'relative',
					}}>
					{loading && staffData.length > 0 && (
						<Box
							sx={{
								position: 'absolute',
								top: 0,
								left: 0,
								right: 0,
								bottom: 0,
								backgroundColor: 'rgba(15, 23, 42, 0.7)',
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center',
								zIndex: 10,
							}}>
							<CircularProgress sx={{ color: '#2563eb' }} />
						</Box>
					)}

					<TableContainer>
						<Table sx={{ minWidth: 800 }}>
							<TableHead>
								<TableRow sx={{ bgcolor: '#1e293b' }}>
									{['Staff ID', 'Staff Info', 'Role', 'Assigned Companies', 'Status', 'Actions'].map((header) => (
										<TableCell
											key={header}
											sx={{
												px: 3,
												py: 2,
												fontSize: '0.75rem',
												fontWeight: 600,
												textTransform: 'uppercase',
												color: '#94a3b8',
												borderBottom: 'none',
											}}>
											{header}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{staffData.length === 0 && !loading ? (
									<TableRow>
										<TableCell
											colSpan={7}
											sx={{ textAlign: 'center', py: 4, borderBottom: 'none' }}>
											<Typography sx={{ color: '#94a3b8' }}>No staff members found</Typography>
										</TableCell>
									</TableRow>
								) : (
									staffData.length >= 1 &&
									staffData.map((staff) => {
										const roleInfo = getRoleDisplay(staff.role);
										const isMultiCompany = canHaveMultipleCompanies(staff.role);

										return (
											<TableRow
												key={staff.id}
												sx={{
													'borderTop': '1px solid rgba(255,255,255,0.08)',
													'&:hover': { bgcolor: 'rgba(30, 41, 59, 0.5)' },
												}}>
												<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
													<Typography
														variant="body2"
														sx={{ fontWeight: 600, color: '#60a5fa' }}>
														{staff.staffId}
													</Typography>
												</TableCell>

												<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
													<Box>
														<Typography
															variant="body2"
															sx={{ color: '#e2e8f0', fontWeight: 500 }}>
															{staff.name}
														</Typography>
														<Typography
															variant="caption"
															sx={{ display: 'block', color: '#94a3b8' }}>
															{staff.email}
														</Typography>
														<Typography
															variant="caption"
															sx={{ display: 'block', color: '#64748b' }}>
															{staff.department}
														</Typography>
													</Box>
												</TableCell>

												<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
													{/* <Chip
														icon={roleInfo.icon}
														label={roleInfo.label}
														size="small"
														sx={{
															backgroundColor: `${roleInfo.color}15`,
															color: roleInfo.color,
															border: `1px solid ${roleInfo.color}30`,
														}}
													/> */}
													<Chip
														icon={roleInfo.icon}
														label={roleInfo.label}
														size="small"
														sx={{
															'backgroundColor': `${roleInfo.color}15`,
															'color': roleInfo.color,
															'border': `1px solid ${roleInfo.color}30`,
															'& .MuiChip-icon': {
																color: roleInfo.color,
															},
														}}
													/>
												</TableCell>

												<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>{getCompanyChips(staff)}</TableCell>

												<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>{getStatusChip(staff.status)}</TableCell>

												<TableCell sx={{ px: 3, py: 2, borderBottom: 'none' }}>
													<Box sx={{ display: 'flex', gap: 1 }}>
														<Button
															size="small"
															onClick={() => handleOpenAssignDialog(staff)}
															sx={{
																'borderRadius': 1,
																'px': staff.company.length > 1 ? 4 : 2,
																'py': staff.company.length > 1 ? 2 : 0.5,
																'fontSize': '0.75rem',
																'fontWeight': 600,
																'textTransform': 'none',
																'color': isMultiCompany ? '#8b5cf6' : '#60a5fa',
																'bgcolor': isMultiCompany ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
																'&:hover': {
																	bgcolor: isMultiCompany ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
																},
															}}>
															{isMultiCompany ? 'Manage Companies' : 'Assign Company'}
														</Button>
														{staff && staff.company.length === 1 && (
															<Button
																size="small"
																onClick={() => handleRemoveCompanyAssignment(staff, staff.company[0].id)}
																sx={{
																	'borderRadius': 1,
																	'px': 2,
																	'py': 0.5,
																	'fontSize': '0.75rem',
																	'fontWeight': 600,
																	'textTransform': 'none',
																	'color': '#ef4444',
																	'bgcolor': 'rgba(239, 68, 68, 0.1)',
																	'&:hover': {
																		bgcolor: 'rgba(239, 68, 68, 0.2)',
																	},
																}}>
																Remove
															</Button>
														)}
														{/* {staff.company.length > 1 && (
															<Button
																size="small"
																onClick={() => handleOpenRemoveAllConfirmation(staff)}
																sx={{
																	'borderRadius': 1,
																	'px': 2,
																	'py': 0.5,
																	'fontSize': '0.75rem',
																	'fontWeight': 600,
																	'textTransform': 'none',
																	'color': '#ef4444',
																	'bgcolor': 'rgba(239, 68, 68, 0.1)',
																	'&:hover': {
																		bgcolor: 'rgba(239, 68, 68, 0.2)',
																	},
																}}>
																Remove All
															</Button>
														)} */}
													</Box>
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</TableContainer>

					{staffData.length > 0 && pagination.total > pagination.pageSize && (
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								p: 2,
								borderTop: '1px solid rgba(255,255,255,0.08)',
							}}>
							<Typography sx={{ color: '#94a3b8', fontSize: '0.875rem' }}>
								Showing {(pagination.page - 1) * pagination.pageSize + 1} -{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
							</Typography>

							<Pagination
								count={Math.ceil(pagination.total / pagination.pageSize)}
								page={pagination.page}
								onChange={(event, newPage) => {
									setPagination((prev) => ({ ...prev, page: newPage }));
									fetchStaff(newPage); // Update fetchStaff to accept page parameter
								}}
								color="primary"
								sx={{
									'& .MuiPaginationItem-root': {
										color: '#94a3b8',
									},
									'& .Mui-selected': {
										backgroundColor: '#2563eb',
										color: '#ffffff',
									},
								}}
							/>
						</Box>
					)}
				</Paper>
			</Box>

			{/* Assign Companies Dialog */}
			<Dialog
				open={assignDialogOpen}
				onClose={() => setAssignDialogOpen(false)}
				maxWidth="md"
				fullWidth
				PaperProps={{
					sx: {
						backgroundColor: '#0f172a',
						border: '1px solid rgba(255,255,255,0.1)',
						borderRadius: 2,
						maxHeight: '80vh',
					},
				}}>
				<DialogTitle sx={{ color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
					{selectedStaff && canHaveMultipleCompanies(selectedStaff.role) ? 'Manage Company Assignments' : 'Assign Company'}
				</DialogTitle>
				<DialogContent sx={{ p: 3 }}>
					{selectedStaff && (
						<>
							<Box sx={{ mb: 3 }}>
								<Paper sx={{ p: 2, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
									<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
										<Box>
											<Typography sx={{ color: '#e2e8f0', fontWeight: 500 }}>
												{selectedStaff.name} ({selectedStaff.staffId})
											</Typography>
											<Typography sx={{ color: '#94a3b8', fontSize: '0.875rem' }}>
												{selectedStaff.department} • {selectedStaff.email}
											</Typography>
										</Box>
										<Chip
											icon={getRoleDisplay(selectedStaff.role).icon}
											label={getRoleDisplay(selectedStaff.role).label}
											size="small"
											sx={{
												backgroundColor: `${getRoleDisplay(selectedStaff.role).color}15`,
												color: getRoleDisplay(selectedStaff.role).color,
											}}
										/>
									</Box>
									<Typography sx={{ color: '#60a5fa', fontSize: '0.875rem', mt: 1 }}>
										{canHaveMultipleCompanies(selectedStaff.role) ? '✓ Can be assigned to multiple companies' : '✓ Can be assigned to one company only'}
									</Typography>
								</Paper>
							</Box>

							<Typography sx={{ color: '#e2e8f0', mb: 2, fontWeight: 500 }}>Select Companies:</Typography>

							{!canHaveMultipleCompanies(selectedStaff.role) && (
								<Typography sx={{ color: '#fbbf24', mb: 2, fontSize: '0.875rem', fontStyle: 'italic' }}>
									Note: This staff member can only be assigned to one company at a time
								</Typography>
							)}

							<Box sx={{ maxHeight: 300, overflow: 'auto', pr: 1 }}>
								<List sx={{ p: 0 }}>
									{companies.map((company) => (
										<ListItem
											key={company.id}
											sx={{
												'p': 1,
												'mb': 0.5,
												'borderRadius': 1,
												'&:hover': {
													backgroundColor: 'rgba(255,255,255,0.05)',
												},
											}}>
											<FormControlLabel
												control={
													<Checkbox
														checked={selectedCompanyIds.some((selected) => selected.id === company.id)}
														onChange={() => handleCompanySelectionChange(company)}
														sx={{
															'color': '#64748b',
															'&.Mui-checked': {
																color: '#60a5fa',
															},
														}}
													/>
												}
												label={
													<Box>
														<Typography sx={{ color: '#e2e8f0', fontSize: '0.95rem' }}>{company.name}</Typography>
														<Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>
															{company.code} • {company.status}
														</Typography>
													</Box>
												}
												sx={{ ml: 0, width: '100%' }}
											/>
										</ListItem>
									))}
								</List>
							</Box>

							{selectedCompanyIds.length > 0 && (
								<Paper sx={{ p: 2, mt: 3, backgroundColor: 'rgba(96, 165, 250, 0.05)', borderRadius: 1 }}>
									<Typography sx={{ color: '#60a5fa', fontWeight: 500, mb: 1 }}>Selected Companies ({selectedCompanyIds.length}):</Typography>
									<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
										{selectedCompanyIds.map((companyId) => {
											const company = companies.find((c) => c.id === companyId.id);
											return company ? (
												<Chip
													key={companyId.id}
													label={company.name}
													size="small"
													onDelete={() => handleCompanySelectionChange(companyId.id)}
													sx={{
														backgroundColor: 'rgba(96, 165, 250, 0.1)',
														color: '#60a5fa',
													}}
												/>
											) : null;
										})}
									</Box>
								</Paper>
							)}
						</>
					)}
				</DialogContent>
				<DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
					<Button
						onClick={() => setAssignDialogOpen(false)}
						sx={{ color: '#94a3b8' }}>
						Cancel
					</Button>
					<Button
						onClick={handleAssignCompanies}
						variant="contained"
						disabled={loading || (!selectedStaff && selectedCompanyIds.length === 0)}
						sx={{
							'backgroundColor': '#2563eb',
							'&:hover': {
								backgroundColor: '#1d4ed8',
							},
							'&:disabled': {
								backgroundColor: 'rgba(37, 99, 235, 0.3)',
								color: 'rgba(255,255,255,0.5)',
							},
						}}>
						{loading ? <CircularProgress size={24} /> : 'Save Assignments'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Confirmation Dialog for Remove Assignment */}
			<Dialog
				open={multipleConfirmationDialogOpen}
				onClose={() => setMultipleConfirmationDialogOpen(false)}
				maxWidth="sm"
				fullWidth
				PaperProps={{
					sx: {
						backgroundColor: '#0f172a',
						border: '1px solid rgba(255,255,255,0.1)',
						borderRadius: 2,
					},
				}}>
				<DialogTitle sx={{ color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Confirm Removal</DialogTitle>
				<DialogContent sx={{ p: 3 }}>
					{staffToRemove && (
						<>
							<Typography sx={{ color: '#e2e8f0', mb: 2 }}>
								Are you sure you want to remove {staffToRemove.company.length === 1 ? 'this' : 'all'} company assignment
								{staffToRemove.company.length > 1 && 's'} from:
							</Typography>

							<Paper sx={{ p: 2, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 1, mb: 2 }}>
								<Typography sx={{ color: '#ef4444', fontWeight: 500, fontSize: '1rem' }}>
									{staffToRemove.name} ({staffToRemove.staffId})
								</Typography>
								<Typography sx={{ color: '#fca5a5', fontSize: '0.875rem' }}>
									{staffToRemove.department} • {staffToRemove.email}
								</Typography>
							</Paper>

							<Typography sx={{ color: '#fbbf24', fontSize: '0.875rem', mb: 2 }}>
								⚠️ This action will remove {staffToRemove.company.length === 1 ? 'this company assignment' : `all ${staffToRemove.company.length} company assignments`}{' '}
								and cannot be undone.
							</Typography>

							{/* Show assigned companies that will be removed */}
							{staffToRemove.company.length > 0 && (
								<Box sx={{ mt: 2 }}>
									<Typography sx={{ color: '#94a3b8', mb: 1, fontSize: '0.875rem' }}>Companies to be removed:</Typography>
									<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
										{staffToRemove.company.map((companyId) => {
											const company = companies.find((c) => c.id === companyId);
											return company ? (
												<Chip
													key={companyId}
													label={company.name}
													size="small"
													sx={{
														backgroundColor: 'rgba(239, 68, 68, 0.1)',
														color: '#fca5a5',
														border: '1px solid rgba(239, 68, 68, 0.3)',
													}}
												/>
											) : null;
										})}
									</Box>
								</Box>
							)}
						</>
					)}
				</DialogContent>
				<DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
					<Button
						onClick={() => {
							setMultipleConfirmationDialogOpen(false);
							setStaffToRemove(null);
						}}
						sx={{
							'color': '#94a3b8',
							'&:hover': {
								color: '#e2e8f0',
							},
						}}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							if (staffToRemove) {
								if (staffToRemove.company.length === 1) {
									handleRemoveCompanyAssignment(staffToRemove);
								} else {
									handleRemoveAllAssignments(staffToRemove);
								}
							}
							setMultipleConfirmationDialogOpen(false);
						}}
						variant="contained"
						sx={{
							'backgroundColor': '#ef4444',
							'&:hover': {
								backgroundColor: '#dc2626',
							},
						}}>
						{loading ? <CircularProgress size={24} /> : staffToRemove && staffToRemove.company.length === 1 ? 'Remove Assignment' : 'Remove All Assignments'}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Snackbar for notifications */}
			<Snackbar
				open={snackbarOpen}
				autoHideDuration={4000}
				onClose={() => setSnackbarOpen(false)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
				<Alert
					onClose={() => setSnackbarOpen(false)}
					severity={snackbarSeverity}
					variant="filled"
					sx={{ width: '100%' }}>
					{snackbarMessage}
				</Alert>
			</Snackbar>
		</Box>
	);
};

export default StaffAssignCompanies;
