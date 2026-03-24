import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

// Styled components
const SwitchBox = styled(Paper)(({ theme, isExpanded }) => ({
	'borderRadius': '30px',
	'padding': '2px 6px',
	'cursor': 'pointer',
	'transition': 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
	// 'backgroundColor': isExpanded ? 'rgba(33, 150, 243, 0.08)' : '#132f4c',
	'border': `1px solid ${isExpanded ? '#2196F3' : 'rgba(255, 255, 255, 0.1)'}`,
	'position': 'relative',
	'width': 'fit-content',
	'minWidth': '150px',
	'boxShadow': 'none',
	'&:hover': {
		backgroundColor: isExpanded ? 'rgba(33, 150, 243, 0.12)' : '#1a3a52',
		borderColor: isExpanded ? '#2196F3' : 'rgba(255, 255, 255, 0.2)',
	},
}));

const InitialsBadge = styled(Box)(({ theme, bgColor }) => ({
	width: '24px',
	height: '24px',
	borderRadius: '50%',
	backgroundColor: bgColor || '#2196F3',
	color: 'white',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	fontWeight: 700,
	fontSize: '8px',
	flexShrink: 0,
}));

const DropdownContainer = styled(Paper)(({ theme, show }) => ({
	position: 'absolute',
	top: 'calc(100% + 8px)',
	left: 0,
	right: 0,
	zIndex: 1000,
	backgroundColor: '#132f4c',
	border: '1px solid rgba(33, 150, 243, 0.3)',
	borderRadius: '30px',
	maxHeight: show ? '400px' : '0',
	overflow: show ? 'auto' : 'hidden',
	opacity: show ? 1 : 0,
	transform: show ? 'translateY(0)' : 'translateY(-10px)',
	transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
	boxShadow: show ? '0 8px 24px rgba(0, 0, 0, 0.4)' : 'none',
	pointerEvents: show ? 'auto' : 'none',
	padding: show ? '10px' : '0',
}));

const DropdownItem = styled(Box)(({ theme, selected }) => ({
	'display': 'flex',
	'alignItems': 'center',
	'gap': '12px',
	'padding': '2px 6px',
	'borderRadius': '30px',
	'cursor': 'pointer',
	'backgroundColor': selected ? 'rgba(33, 150, 243, 0.15)' : 'transparent',
	'transition': 'all 0.2s ease',
	'marginBottom': '4px',
	'&:hover': {
		backgroundColor: selected ? 'rgba(33, 150, 243, 0.25)' : 'rgba(255, 255, 255, 0.05)',
	},
}));

const TeamLogo = styled(Box)(({ bgColor }) => ({
	width: '30px',
	height: '30px',
	borderRadius: '50%',
	backgroundColor: bgColor || '#9E9E9E',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	overflow: 'hidden',
	flexShrink: 0,
	color: 'white',
	fontWeight: 600,
	fontSize: '12px',
}));

const AddNewButton = styled(Box)(({ theme }) => ({
	'display': 'flex',
	'alignItems': 'center',
	'gap': '12px',
	'padding': '7px 10px',
	'borderRadius': '30px',
	'cursor': 'pointer',
	'marginTop': '8px',
	'borderTop': '1px solid rgba(255, 255, 255, 0.1)',
	'transition': 'all 0.2s ease',
	'&:hover': {
		backgroundColor: 'rgba(255, 255, 255, 0.05)',
	},
}));

export const CustomSwitchSelect = ({ options, value, onChange, onAddNew }) => {
	const [state, setState] = useState('selected'); // 'selected', 'expanded'
	const containerRef = useRef(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (containerRef.current && !containerRef.current.contains(event.target)) {
				setState('selected');
			}
		};

		if (state === 'expanded') {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [state]);

	const selectedOption = options.find((opt) => opt.id === value) || options[0];

	const handleMainClick = (e) => {
		e.stopPropagation();
		if (state === 'selected') {
			setState('expanded');
		} else {
			setState('selected');
		}
	};

	const handleClose = (e) => {
		e.stopPropagation();
		setState((prev) => (prev === 'expanded' ? 'selected' : 'expanded'));
	};

	const handleOptionSelect = (option) => {
		onChange(option.id);
		setState('selected');
	};

	const handleAddNew = (e) => {
		e.stopPropagation();
		if (onAddNew) {
			onAddNew();
		}
		setState('selected');
	};

	return (
		<Box
			ref={containerRef}
			sx={{ position: 'relative', width: 'fit-content' }}>
			<SwitchBox
				isExpanded={state === 'expanded'}
				elevation={state === 'expanded' ? 6 : 2}
				onClick={handleMainClick}>
				{/* Header - Always visible */}
				<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
						<InitialsBadge bgColor={selectedOption.color}>{selectedOption.initials}</InitialsBadge>

						<Typography
							variant="body1"
							sx={{
								fontWeight: 600,
								color: '#ffffff',
							}}>
							{selectedOption.name}
						</Typography>
					</Box>

					<IconButton
						size="small"
						onClick={handleClose}
						sx={{
							'color': '#ffffff',
							'&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
						}}>
						{state === 'selected' ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
					</IconButton>
				</Box>
			</SwitchBox>

			{/* Dropdown - Separate floating box */}
			<DropdownContainer
				show={state === 'expanded'}
				onClick={(e) => e.stopPropagation()}>
				<Box>
					{options.map((option) => (
						<DropdownItem
							key={option.id}
							selected={option.id === value}
							onClick={() => handleOptionSelect(option)}>
							<TeamLogo bgColor={option.color}>
								{option.logo ? (
									<img
										src={option.logo}
										alt={option.name}
										style={{ width: '100%', height: '100%', objectFit: 'cover' }}
									/>
								) : (
									option.initials
								)}
							</TeamLogo>
							<Typography
								variant="body2"
								sx={{ fontWeight: 500, flex: 1, color: '#ffffff' }}>
								{option.name}
							</Typography>
							{option.id === value && (
								<Box sx={{ color: '#2196F3' }}>
									<svg
										width="16"
										height="16"
										viewBox="0 0 16 16"
										fill="currentColor">
										<path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
									</svg>
								</Box>
							)}
						</DropdownItem>
					))}

					{onAddNew && (
						<AddNewButton onClick={handleAddNew}>
							<Box
								sx={{
									width: '32px',
									height: '32px',
									borderRadius: '50%',
									backgroundColor: 'rgba(255, 255, 255, 0.1)',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
								}}>
								<AddIcon sx={{ color: '#2196F3', fontSize: '20px' }} />
							</Box>
							<Typography
								variant="body2"
								sx={{ fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)' }}>
								Add new company
							</Typography>
						</AddNewButton>
					)}
				</Box>
			</DropdownContainer>
		</Box>
	);
};
