// File: src/components/ui-mui/select.jsx
import React from 'react';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

export default function Select({ label, value, onChange, options = [], children, ...props }) {
	return (
		<FormControl fullWidth>
			{label && <InputLabel>{label}</InputLabel>}
			<MuiSelect
				value={value}
				onChange={onChange}
				{...props}>
				{children
					? children
					: options.map((opt) => (
							<MenuItem
								key={opt.value ?? opt}
								value={opt.value ?? opt}>
								{opt.label ?? opt}
							</MenuItem>
					  ))}
			</MuiSelect>
		</FormControl>
	);
}
