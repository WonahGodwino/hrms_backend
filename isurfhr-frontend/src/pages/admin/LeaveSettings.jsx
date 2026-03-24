import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, Stack, CircularProgress, Alert, Chip, Select, MenuItem, TextField, Grid, IconButton, InputAdornment } from '@mui/material';
import { useAuth } from '@/lib/context/AuthContext';
import { getAccessibleCompany } from '@/services/CompanyService';

import DeleteIcon from '@mui/icons-material/Delete';

const defaultLeaveTypes = ['Annual Leave', 'Sick Leave', 'Maternity Leave', 'Paternity Leave', 'Compassionate Leave', 'Study Leave', 'Unpaid Leave', 'Sabbatical Leave'];
export default function LeaveSettings() {
	const { user } = useAuth();
	const role = user?.role || 'STAFF';

	const isAdmin = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(role);
	const [companyFilter, setCompanyFilter] = useState('');
	const [apiError, setApiError] = useState('');
	const [companies, setCompanies] = useState([]);
	const [isCompanyLoading, setIsCompanyLoading] = useState(true);
	const [leaveType, setLeaveType] = useState(defaultLeaveTypes[0]);
	const [editingPolicyId, setEditingPolicyId] = useState(null);
	const [hoveredCard, setHoveredCard] = useState(null);
	const [isSaving, setIsSaving] = useState(false);

	const [policyDraft, setPolicyDraft] = useState({
		title: '',
		constraints: [],
	});

	const [policiesByType, setPoliciesByType] = useState(
		defaultLeaveTypes.reduce((acc, type) => {
			acc[type] = [];
			return acc;
		}, {})
	);

	useEffect(() => {
		fetchCompanies();
	}, []);

	const handleCompanyChange = (e) => {
		const newCompanyId = e.target.value;
		setCompanyFilter(newCompanyId);
		// Trigger shake animation on select
		e.target.style.animation = 'shakeX 0.5s ease';
		setTimeout(() => {
			if (e.target) e.target.style.animation = '';
		}, 500);
	};

	const fetchCompanies = async () => {
		setIsCompanyLoading(true);
		try {
			const result = await getAccessibleCompany();

			if (result.data.success) {
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
				throw new Error(result.message || 'Failed to fetch companies');
			}
		} catch (err) {
			setApiError(err.message || 'Failed to load companies');
		} finally {
			setIsCompanyLoading(false);
		}
	};

	const handleAddConstraint = () => {
		setPolicyDraft({
			...policyDraft,
			constraints: [
				...policyDraft.constraints,
				{
					id: Date.now(),
					field: 'leave_days',
					operator: 'max',
					value: 0,
					unit: 'days',
				},
			],
		});
	};

	const updateConstraint = (id, field, value) => {
		setPolicyDraft({
			...policyDraft,
			constraints: policyDraft.constraints.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
		});
	};

	const removeConstraint = (id) => {
		setPolicyDraft({
			...policyDraft,
			constraints: policyDraft.constraints.filter((c) => c.id !== id),
		});
	};

	const handleSavePolicy = async () => {
		if (!policyDraft.title) return;

		setIsSaving(true);

		// Simulate save animation
		setTimeout(() => {
			if (editingPolicyId) {
				const updated = policiesByType[leaveType].map((policy) => (policy.id === editingPolicyId ? { ...policyDraft, id: editingPolicyId } : policy));

				setPoliciesByType({
					...policiesByType,
					[leaveType]: updated,
				});

				setEditingPolicyId(null);
			} else {
				const newPolicy = {
					...policyDraft,
					id: Date.now(),
				};

				setPoliciesByType({
					...policiesByType,
					[leaveType]: [...policiesByType[leaveType], newPolicy],
				});
			}

			setPolicyDraft({ title: '', constraints: [] });
			setIsSaving(false);
		}, 500);
	};

	const handleEdit = (policy) => {
		setPolicyDraft(policy);
		setEditingPolicyId(policy.id);
	};

	const handleDelete = (id) => {
		const filtered = policiesByType[leaveType].filter((policy) => policy.id !== id);

		setPoliciesByType({
			...policiesByType,
			[leaveType]: filtered,
		});
	};

	if (!isAdmin) {
		return (
			<Box
				sx={{
					p: 6,
					minHeight: '80vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					animation: 'bounce-in 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
					...animations,
				}}>
				<Stack
					alignItems="center"
					spacing={2}>
					<Alert
						severity="warning"
						sx={{
							animation: 'pulse-glow 2s infinite, wobble 3s infinite',
							...animations,
						}}>
						You do not have access to Leave Settings.
					</Alert>
				</Stack>
			</Box>
		);
	}

	return (
		<Box
			component="main"
			sx={{
				width: '100%',
				minHeight: '100vh',
				bgcolor: '#0a1929',
				px: { xs: 2, sm: 4, md: 6 },
				py: 4,
				animation: 'slide-in-blurred 0.6s cubic-bezier(0.23, 1, 0.32, 1)',
				...animations,
			}}>
			{/* Header with float animation */}
			<Stack
				sx={{
					'mb': 4,
					'&:hover': {
						'& .MuiTypography-root': {
							animation: 'float 3s ease-in-out infinite',
							...animations,
						},
					},
				}}>
				<Typography
					variant="h4"
					fontWeight={700}
					color="white"
					sx={{
						'position': 'relative',
						'transition': 'transform 0.2s ease',
						'&::after': {
							content: '""',
							position: 'absolute',
							bottom: -8,
							left: 0,
							width: '60px',
							height: '4px',
							background: 'linear-gradient(90deg, #2196f3, #64b5f6, #2196f3)',
							borderRadius: '2px',
							animation: 'shimmer 2s infinite',
							...animations,
						},
						'&:hover': {
							'transform': 'translateX(5px)',
							'&::after': {
								width: '80px',
								transition: 'width 0.3s ease',
							},
						},
					}}>
					Leave Settings
					<Chip
						label="Policy Management"
						size="small"
						sx={{
							'ml': 2,
							'bgcolor': '#2196f3',
							'color': 'white',
							'animation': 'pulse-glow 2s infinite',
							'transition': 'all 0.2s ease',
							'&:hover': {
								transform: 'scale(1.1) rotate(2deg)',
								bgcolor: '#1976d2',
								transition: 'transform 0.3s ease',
							},
							...animations,
						}}
					/>
				</Typography>
			</Stack>

			{apiError && (
				<Alert
					severity="error"
					onClose={() => setApiError('')}
					sx={{
						'mb': 3,
						'animation': 'shake 0.5s ease-in-out',
						...animations,
						'@keyframes shake': {
							'0%, 100%': { transform: 'translateX(0)' },
							'10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
							'20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
						},
					}}>
					{apiError}
				</Alert>
			)}

			<Stack spacing={4}>
				{/* Leave Type Card */}
				<Paper
					sx={{
						...cardStyle,
						'transition': 'all 0.3s ease',
						'animation': `float 4s ease-in-out infinite`,
						'&:hover': {
							'transform': 'translateY(-4px) scale(1.02)',
							'boxShadow': '0 12px 24px rgba(33, 150, 243, 0.2)',
							'animation': 'none', // Pause float on hover
							'& .MuiTypography-root': {
								color: '#2196f3',
								transition: 'color 0.3s ease',
							},
						},
						...animations,
					}}>
					<Typography
						variant="h6"
						color="white"
						sx={{ mb: 2, transition: 'color 0.3s ease' }}>
						Leave Type
					</Typography>

					<Select
						fullWidth
						value={leaveType}
						onChange={(e) => setLeaveType(e.target.value)}
						sx={{
							...inputStyle,
							'transition': 'all 0.2s ease',
							'&:hover': {
								bgcolor: '#2a3a54',
								transform: 'scale(1.01)',
							},
						}}>
						{defaultLeaveTypes.map((type, index) => (
							<MenuItem
								key={type}
								value={type}
								sx={{
									'transition': 'all 0.2s ease',
									'animation': `slide-in-blurred 0.5s ease-out ${index * 0.05}s both`,
									'&:hover': {
										bgcolor: 'rgba(33, 150, 243, 0.1)',
										paddingLeft: '24px',
										transform: 'scale(1.02)',
									},
									...animations,
								}}>
								{type}
							</MenuItem>
						))}
					</Select>
				</Paper>

				{/* Policy Builder Card */}
				<Paper
					sx={{
						...cardStyle,
						'transition': 'all 0.3s ease',
						'animation': `float 4.5s ease-in-out 0.2s infinite`,
						'&:hover': {
							transform: 'translateY(-4px) scale(1.02)',
							boxShadow: '0 12px 24px rgba(33, 150, 243, 0.2)',
							animation: 'none', // Pause float on hover
						},
						...animations,
					}}>
					<Typography
						variant="h6"
						color="white"
						sx={{ mb: 3, transition: 'color 0.3s ease' }}>
						Create Policy
					</Typography>

					<Stack spacing={3}>
						<TextField
							label="Policy Description"
							multiline
							rows={4}
							fullWidth
							value={policyDraft.title}
							onChange={(e) =>
								setPolicyDraft({
									...policyDraft,
									title: e.target.value,
								})
							}
							sx={{
								...inputStyle,
								'& .MuiOutlinedInput-root': {
									'transition': 'all 0.2s ease',
									'&:hover': {
										'& fieldset': {
											borderColor: '#2196f3',
											borderWidth: '2px',
										},
										'transform': 'scale(1.01)',
									},
									'&.Mui-focused': {
										animation: 'pulse-glow 1.5s infinite',
										...animations,
									},
								},
							}}
						/>

						<TextField
							select
							fullWidth
							label="Company"
							name="company"
							value={companyFilter}
							onChange={handleCompanyChange}
							disabled={isCompanyLoading || companies.length === 0}
							variant="outlined"
							InputProps={{
								endAdornment: isCompanyLoading ? (
									<InputAdornment position="end">
										<CircularProgress
											size={20}
											sx={{
												'animation': 'spin 1s linear infinite, pulse-glow 1.5s infinite',
												'@keyframes spin': {
													'0%': { transform: 'rotate(0deg)' },
													'100%': { transform: 'rotate(360deg)' },
												},
												...animations,
											}}
										/>
									</InputAdornment>
								) : null,
							}}
							sx={{
								...inputStyle,
								'transition': 'all 0.2s ease',
								'&:hover:not(.Mui-disabled)': {
									bgcolor: '#2a3a54',
									transform: 'scale(1.01)',
								},
							}}>
							<MenuItem value="">{isCompanyLoading ? 'Loading companies...' : 'Select company'}</MenuItem>

							{companies.map((company, index) => (
								<MenuItem
									key={company.id}
									value={company.id}
									sx={{
										'transition': 'all 0.2s ease',
										'animation': `slide-in-blurred 0.4s ease-out ${index * 0.03}s both`,
										'&:hover': {
											bgcolor: 'rgba(33, 150, 243, 0.1)',
											paddingLeft: '24px',
											transform: 'scale(1.02)',
										},
										...animations,
									}}>
									{company.name}
								</MenuItem>
							))}
						</TextField>

						<Button
							variant="outlined"
							onClick={handleAddConstraint}
							sx={{
								'height': 40,
								'px': 2,
								'borderRadius': 1,
								'color': '#2196f3',
								'fontWeight': 700,
								'textTransform': 'none',
								'borderColor': '#2196f3',
								'transition': 'all 0.3s ease',
								'position': 'relative',
								'overflow': 'hidden',
								'&::before': {
									content: '""',
									position: 'absolute',
									top: '50%',
									left: '50%',
									width: 0,
									height: 0,
									borderRadius: '50%',
									background: 'rgba(33, 150, 243, 0.2)',
									transform: 'translate(-50%, -50%)',
									transition: 'width 0.6s ease, height 0.6s ease',
								},
								'&:hover': {
									'color': '#ffffff',
									'borderColor': '#ffffff',
									'bgcolor': 'rgba(33, 150, 243, 0.1)',
									'transform': 'scale(1.02)',
									'&::before': {
										width: '200px',
										height: '200px',
									},
								},
								'&:active': {
									transform: 'scale(0.98)',
								},
							}}>
							+ Add Enforcement Rule
						</Button>

						{policyDraft.constraints.map((constraint, index) => (
							<Paper
								key={constraint.id}
								sx={{
									...innerCardStyle,
									'animation': `bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${index * 0.1}s both`,
									'transition': 'all 0.3s ease',
									'&:hover': {
										bgcolor: '#253649',
										transform: 'translateX(8px) scale(1.01)',
										borderColor: '#2196f3',
										boxShadow: '0 4px 12px rgba(33, 150, 243, 0.2)',
									},
									...animations,
								}}>
								<Grid
									container
									spacing={2}
									alignItems="center">
									<Grid
										item
										size={{ xs: 12, md: 3 }}>
										<Select
											value={constraint.field}
											onChange={(e) => updateConstraint(constraint.id, 'field', e.target.value)}
											fullWidth
											sx={{
												...inputStyle,
												'transition': 'all 0.2s ease',
												'&:hover': {
													bgcolor: '#2a3a54',
												},
											}}>
											<MenuItem value="leave_days">Leave Days</MenuItem>
											<MenuItem value="employment_duration">Employment Duration</MenuItem>
											<MenuItem value="consecutive_days">Consecutive Days</MenuItem>
										</Select>
									</Grid>

									<Grid
										item
										size={{ xs: 12, md: 2 }}>
										<Select
											value={constraint.operator}
											onChange={(e) => updateConstraint(constraint.id, 'operator', e.target.value)}
											fullWidth
											sx={{
												...inputStyle,
												'transition': 'all 0.2s ease',
												'&:hover': {
													bgcolor: '#2a3a54',
												},
											}}>
											<MenuItem value="max">Maximum</MenuItem>
											<MenuItem value="min">Minimum</MenuItem>
											<MenuItem value="exact">Exactly</MenuItem>
										</Select>
									</Grid>

									<Grid
										item
										size={{ xs: 12, md: 2 }}>
										<TextField
											type="number"
											value={constraint.value}
											onChange={(e) => updateConstraint(constraint.id, 'value', Number(e.target.value))}
											fullWidth
											sx={{
												...inputStyle,
												'& .MuiOutlinedInput-root': {
													'transition': 'all 0.2s ease',
													'&:hover': {
														'& fieldset': {
															borderColor: '#2196f3',
														},
													},
												},
											}}
										/>
									</Grid>

									<Grid
										item
										size={{ xs: 12, md: 3 }}>
										<Select
											value={constraint.unit}
											onChange={(e) => updateConstraint(constraint.id, 'unit', e.target.value)}
											fullWidth
											sx={{
												...inputStyle,
												'transition': 'all 0.2s ease',
												'&:hover': {
													bgcolor: '#2a3a54',
												},
											}}>
											<MenuItem value="days">Days</MenuItem>
											<MenuItem value="months">Months</MenuItem>
										</Select>
									</Grid>

									<Grid
										item
										size={{ xs: 12, md: 2 }}
										sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'center' } }}>
										<IconButton
											color="error"
											onClick={() => removeConstraint(constraint.id)}
											sx={{
												'transition': 'all 0.2s ease',
												'&:hover': {
													transform: 'scale(1.1) rotate(5deg)',
													bgcolor: 'rgba(244, 67, 54, 0.1)',
												},
												'&:active': {
													transform: 'scale(0.95)',
												},
											}}>
											<DeleteIcon />
										</IconButton>
									</Grid>
								</Grid>
							</Paper>
						))}

						<Button
							variant="contained"
							onClick={handleSavePolicy}
							sx={{
								...primaryButtonStyle,
								'position': 'relative',
								'overflow': 'hidden',
								'transition': 'all 0.3s ease',
								'&::before': {
									content: '""',
									position: 'absolute',
									top: '50%',
									left: '50%',
									width: 0,
									height: 0,
									borderRadius: '50%',
									background: 'rgba(255,255,255,0.3)',
									transform: 'translate(-50%, -50%)',
									transition: 'width 0.6s ease, height 0.6s ease',
								},
								'&:hover': {
									'transform': 'scale(1.02) translateY(-2px)',
									'backgroundColor': '#1976d2',
									'&::before': {
										width: '200px',
										height: '200px',
									},
								},
								'&:active': {
									transform: 'scale(0.98)',
								},
							}}>
							{editingPolicyId ? 'Update Policy' : 'Save Policy'}
						</Button>
					</Stack>
				</Paper>

				{/* Existing Policies Card */}
				<Paper
					sx={{
						...cardStyle,
						'transition': 'all 0.3s ease',
						'animation': `float 5s ease-in-out 0.4s infinite`,
						'&:hover': {
							transform: 'translateY(-4px) scale(1.02)',
							boxShadow: '0 12px 24px rgba(33, 150, 243, 0.2)',
							animation: 'none', // Pause float on hover
						},
						...animations,
					}}>
					<Typography
						variant="h6"
						color="white"
						sx={{ mb: 3, transition: 'color 0.3s ease' }}>
						Policies – {leaveType}
					</Typography>

					{policiesByType[leaveType].length === 0 ? (
						<Typography
							color="text.secondary"
							sx={{
								textAlign: 'center',
								py: 4,
							}}>
							🎯 No policies configured yet. Time to create one!
						</Typography>
					) : (
						<Stack spacing={2}>
							{policiesByType[leaveType].map((policy, index) => (
								<Paper
									key={policy.id}
									sx={{
										...innerCardStyle,
										'animation': `bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${index * 0.1}s both`,
										'transition': 'all 0.3s ease',
										'&:hover': {
											bgcolor: '#253649',
											transform: 'translateX(8px) scale(1.01)',
											borderColor: '#2196f3',
											boxShadow: '0 4px 12px rgba(33, 150, 243, 0.2)',
										},
										...animations,
									}}>
									<Stack
										direction="row"
										justifyContent="space-between"
										alignItems="flex-start">
										<Box>
											<Typography
												color="white"
												fontWeight={600}
												sx={{
													'transition': 'color 0.2s ease',
													'&:hover': {
														color: '#2196f3',
														transform: 'translateX(4px)',
													},
												}}>
												{policy.title}
											</Typography>

											{policy.constraints.map((c, idx) => (
												<Typography
													key={c.id}
													variant="body2"
													color="text.secondary"
													sx={{
														'transition': 'all 0.2s ease',
														'animation': `slide-in-blurred 0.4s ease-out ${idx * 0.05}s both`,
														'&:hover': {
															transform: 'translateX(8px)',
															color: 'rgba(255,255,255,0.9)',
														},
														...animations,
													}}>
													• {c.operator} {c.value} {c.unit} ({c.field})
												</Typography>
											))}
										</Box>

										<Stack
											direction="row"
											spacing={1}>
											<Button
												size="small"
												variant="outlined"
												onClick={() => handleEdit(policy)}
												sx={{
													'textTransform': 'none',
													'borderColor': '#2196f3',
													'color': '#2196f3',
													'transition': 'all 0.2s ease',
													'&:hover': {
														transform: 'scale(1.05) rotate(-2deg)',
														bgcolor: 'rgba(33, 150, 243, 0.1)',
														boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
													},
													'&:active': {
														transform: 'scale(0.95)',
													},
												}}>
												Edit
											</Button>

											<Button
												size="small"
												variant="outlined"
												color="error"
												onClick={() => handleDelete(policy.id)}
												sx={{
													'textTransform': 'none',
													'transition': 'all 0.2s ease',
													'&:hover': {
														transform: 'scale(1.05) rotate(2deg)',
														bgcolor: 'rgba(244, 67, 54, 0.1)',
														boxShadow: '0 4px 12px rgba(244, 67, 54, 0.3)',
													},
													'&:active': {
														transform: 'scale(0.95)',
													},
												}}>
												Delete
											</Button>
										</Stack>
									</Stack>
								</Paper>
							))}
						</Stack>
					)}
				</Paper>
			</Stack>
		</Box>
	);
}

/* ------------------ Styles ------------------ */
const cardStyle = {
	p: 3,
	bgcolor: '#0f172a',
	borderRadius: 2,
	border: '1px solid rgba(255,255,255,0.08)',
};

const innerCardStyle = {
	p: 2,
	bgcolor: '#1e293b',
	border: '1px solid rgba(255,255,255,0.08)',
};

const inputStyle = {
	bgcolor: '#1e293b',
	color: 'white',
};

const primaryButtonStyle = {
	'alignSelf': 'flex-start',
	'backgroundColor': '#2196f3',
	'textTransform': 'none',
	'fontWeight': 700,
	'&:hover': {
		backgroundColor: '#1976d2',
	},
};

const animations = {
	'@keyframes float': {
		'0%': { transform: 'translateY(0px)' },
		'50%': { transform: 'translateY(-8px)' },
		'100%': { transform: 'translateY(0px)' },
	},
	'@keyframes pulse-glow': {
		'0%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)' },
		'70%': { boxShadow: '0 0 0 12px rgba(33, 150, 243, 0)' },
		'100%': { boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)' },
	},
	'@keyframes shimmer': {
		'0%': { backgroundPosition: '-1000px 0' },
		'100%': { backgroundPosition: '1000px 0' },
	},
	'@keyframes slide-in-blurred': {
		'0%': {
			transform: 'translateX(100px) scaleX(1.5) scaleY(0.5)',
			transformOrigin: '0% 50%',
			filter: 'blur(20px)',
			opacity: 0,
		},
		'100%': {
			transform: 'translateX(0) scaleY(1) scaleX(1)',
			transformOrigin: '50% 50%',
			filter: 'blur(0)',
			opacity: 1,
		},
	},
	'@keyframes bounce-in': {
		'0%': {
			transform: 'scale(0.3)',
			opacity: 0,
		},
		'50%': {
			transform: 'scale(1.05)',
		},
		'70%': {
			transform: 'scale(0.9)',
		},
		'100%': {
			transform: 'scale(1)',
			opacity: 1,
		},
	},
	'@keyframes rotate-scale': {
		'0%': { transform: 'rotate(-10deg) scale(0.8)' },
		'100%': { transform: 'rotate(0) scale(1)' },
	},
	'@keyframes color-wave': {
		'0%': { color: '#60a5fa' },
		'25%': { color: '#34d399' },
		'50%': { color: '#fbbf24' },
		'75%': { color: '#f87171' },
		'100%': { color: '#60a5fa' },
	},
	'@keyframes wobble': {
		'0%': { transform: 'translateX(0%)' },
		'15%': { transform: 'translateX(-5%) rotate(-3deg)' },
		'30%': { transform: 'translateX(4%) rotate(2deg)' },
		'45%': { transform: 'translateX(-3%) rotate(-1deg)' },
		'60%': { transform: 'translateX(2%) rotate(0.5deg)' },
		'75%': { transform: 'translateX(-1%) rotate(-0.3deg)' },
		'100%': { transform: 'translateX(0%) rotate(0deg)' },
	},
};
