// src/components/payroll-engine/WorkflowProgressBar.jsx
import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { Check, Circle } from 'lucide-react';

// Workflow steps in order
const WORKFLOW_STEPS = [
	{ key: 'draft', label: 'Draft' },
	{ key: 'validation_open', label: 'Validation' },
	{ key: 'validation_closed', label: 'Closed' },
	{ key: 'computing', label: 'Computing' },
	{ key: 'review', label: 'Review' },
	{ key: 'approved', label: 'Approved' },
	{ key: 'paid', label: 'Paid' },
];

/**
 * Get the current step index based on status
 */
const getStepIndex = (status) => {
	const normalizedStatus = (status || 'draft').toLowerCase().replace(/-/g, '_');
	const index = WORKFLOW_STEPS.findIndex((step) => step.key === normalizedStatus);
	return index === -1 ? 0 : index;
};

/**
 * WorkflowProgressBar - Visual representation of payroll workflow progress
 * @param {string} currentStatus - Current pay period status
 * @param {boolean} compact - Show compact version (no labels)
 */
const WorkflowProgressBar = ({ currentStatus, compact = false, isDarkMode }) => {
	const currentIndex = getStepIndex(currentStatus);

	return (
		<Box sx={{ width: '100%' }}>
			{/* Progress Line */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					position: 'relative',
				}}>
				{WORKFLOW_STEPS.map((step, index) => {
					const isCompleted = index < currentIndex;
					const isCurrent = index === currentIndex;
					const isPending = index > currentIndex;

					return (
						<React.Fragment key={step.key}>
							{/* Step Circle */}
							<Box
								sx={{
									position: 'relative',
									zIndex: 1,
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'center',
								}}>
								<Box
									sx={{
										width: compact ? 24 : 32,
										height: compact ? 24 : 32,
										borderRadius: '50%',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										transition: 'all 0.3s ease',
										...(isCompleted && {
											bgcolor: '#22c55e',
											color: '#fff',
										}),
										...(isCurrent && {
											bgcolor: '#137fec',
											color: '#fff',
											boxShadow: '0 0 0 4px rgba(19, 127, 236, 0.2)',
										}),
										...(isPending && {
											bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
											color: isDarkMode ? '#64748b' : '#94a3b8',
										}),
									}}>
									{isCompleted ? (
										<Check size={compact ? 14 : 18} strokeWidth={3} />
									) : (
										<Circle size={compact ? 8 : 10} fill="currentColor" />
									)}
								</Box>

								{/* Step Label */}
								{!compact && (
									<Typography
										variant="caption"
										sx={{
											mt: 1,
											fontSize: '0.65rem',
											fontWeight: isCurrent ? 700 : 500,
											color: isCurrent
												? '#137fec'
												: isCompleted
													? isDarkMode ? '#94a3b8' : '#64748b'
													: isDarkMode ? '#64748b' : '#94a3b8',
											textAlign: 'center',
											whiteSpace: 'nowrap',
										}}>
										{step.label}
									</Typography>
								)}
							</Box>

							{/* Connector Line */}
							{index < WORKFLOW_STEPS.length - 1 && (
								<Box
									sx={{
										flex: 1,
										height: 3,
										mx: compact ? 0.5 : 1,
										borderRadius: 1,
										transition: 'all 0.3s ease',
										bgcolor: index < currentIndex
											? '#22c55e'
											: isDarkMode ? '#334155' : '#e2e8f0',
									}}
								/>
							)}
						</React.Fragment>
					);
				})}
			</Box>
		</Box>
	);
};

/**
 * Compact version showing just current status with progress percentage
 */
export const WorkflowProgressCompact = ({ currentStatus, isDarkMode }) => {
	const currentIndex = getStepIndex(currentStatus);
	const progressPercent = Math.round((currentIndex / (WORKFLOW_STEPS.length - 1)) * 100);

	return (
		<Box sx={{ width: '100%' }}>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
				<Typography
					variant="caption"
					sx={{
						fontWeight: 600,
						color: isDarkMode ? '#e2e8f0' : '#334155',
						textTransform: 'capitalize',
					}}>
					{WORKFLOW_STEPS[currentIndex]?.label || 'Draft'}
				</Typography>
				<Typography
					variant="caption"
					sx={{
						fontWeight: 500,
						color: isDarkMode ? '#94a3b8' : '#64748b',
					}}>
					{progressPercent}%
				</Typography>
			</Box>
			<Box
				sx={{
					width: '100%',
					height: 6,
					borderRadius: 3,
					bgcolor: isDarkMode ? '#334155' : '#e2e8f0',
					overflow: 'hidden',
				}}>
				<Box
					sx={{
						width: `${progressPercent}%`,
						height: '100%',
						borderRadius: 3,
						bgcolor: progressPercent === 100 ? '#22c55e' : '#137fec',
						transition: 'width 0.5s ease',
					}}
				/>
			</Box>
		</Box>
	);
};

export default WorkflowProgressBar;
