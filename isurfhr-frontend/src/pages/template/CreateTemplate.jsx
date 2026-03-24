import { useState, useCallback } from 'react';
import { Box, Typography, TextField, Select, MenuItem, FormControl, IconButton, Chip, Paper, Switch, Tooltip, Button, Stack } from '@mui/material';
import { PayslipDialog } from './TemplatePayslipSettings';
import { VisibilityOff as VisibilityOffIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { User, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────
const GripIcon = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="currentColor">
		<circle
			cx="9"
			cy="5"
			r="1.5"
		/>
		<circle
			cx="9"
			cy="12"
			r="1.5"
		/>
		<circle
			cx="9"
			cy="19"
			r="1.5"
		/>
		<circle
			cx="15"
			cy="5"
			r="1.5"
		/>
		<circle
			cx="15"
			cy="12"
			r="1.5"
		/>
		<circle
			cx="15"
			cy="19"
			r="1.5"
		/>
	</svg>
);

const TrashIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<polyline points="3 6 5 6 21 6" />
		<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
		<path d="M10 11v6M14 11v6" />
		<path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
	</svg>
);

const PlusIcon = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round">
		<line
			x1="12"
			y1="5"
			x2="12"
			y2="19"
		/>
		<line
			x1="5"
			y1="12"
			x2="19"
			y2="12"
		/>
	</svg>
);

const DocumentIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="#2196f3"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
		<polyline points="14 2 14 8 20 8" />
	</svg>
);

const LayersIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="#2196f3"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M12 2L2 7l10 5 10-5-10-5z" />
		<path d="M2 17l10 5 10-5" />
		<path d="M2 12l10 5 10-5" />
	</svg>
);

const InfoIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="#2196f3"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<circle
			cx="12"
			cy="12"
			r="10"
		/>
		<line
			x1="12"
			y1="8"
			x2="12"
			y2="12"
		/>
		<line
			x1="12"
			y1="16"
			x2="12.01"
			y2="16"
		/>
	</svg>
);

const CheckCircleIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="#4ade80"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
		<polyline points="22 4 12 14.01 9 11.01" />
	</svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────
const DATA_TYPES = ['Text', 'Number', 'Date', 'Percentage'];

const GRID_COLS = {
	xs: '36px minmax(120px, 1fr) minmax(100px, 1fr) 100px 60px minmax(140px, 1fr) 44px 44px',
	md: '44px 1fr 1fr 140px 80px 1fr 60px 60px',
};

// Define field sections with their properties
const FIELD_SECTIONS = [
	{
		id: 'staff_details',
		name: 'Staff Details',
		expanded: true,
		color: '#3b82f6',
		icon: <User />,
		description: 'Basic employee information',
	},
	{
		id: 'fixed_income',
		name: 'Fixed Income',
		expanded: true,
		color: '#10b981',
		icon: <DollarSign />,
		description: 'Regular monthly payments',
	},
	{
		id: 'earnings',
		name: 'Earnings',
		expanded: true,
		color: '#f59e0b',
		icon: <TrendingUp />,
		description: 'Variable pay and bonuses',
	},
	{
		id: 'deductions',
		name: 'Deductions',
		expanded: true,
		color: '#ef4444',
		icon: <TrendingDown />,
		description: 'Taxes and other deductions',
	},
];

const INITIAL_FIELDS = [
	{
		id: 1,
		displayName: 'Employee ID',
		systemFieldName: 'sep_id',
		dataType: 'Text',
		required: true,
		aliases: ['ID', 'Staff#'],
		aliasInput: '',
		sectionId: 'staff_details', // Direct section assignment
		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Employee ID', order: 1 },
	},
	{
		id: 2,
		displayName: 'Department',
		systemFieldName: 'dept_code',
		dataType: 'Text',
		required: true,
		aliases: ['cost_center'],
		aliasInput: '',
		sectionId: 'staff_details',
		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Department', order: 2 },
	},
	{
		id: 3,
		displayName: 'Name',
		systemFieldName: 'employee_name',
		dataType: 'Text',
		required: true,
		aliases: ['full_name'],
		aliasInput: '',
		sectionId: 'staff_details',
		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Name', order: 3 },
	},
	{
		id: 4,
		displayName: 'Email',
		systemFieldName: 'employee_email',
		dataType: 'Text',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'staff_details',
		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Email', order: 4 },
	},
	{
		id: 5,
		displayName: 'Year',
		systemFieldName: 'pay_year',
		dataType: 'Number',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'staff_details', // Could also be a separate period section
		payslip: { visible: false, sectionId: 'sec_period', displayName: 'Year', order: 1 },
	},
	{
		id: 6,
		displayName: 'Month',
		systemFieldName: 'pay_month',
		dataType: 'Text',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'staff_details',
		payslip: { visible: false, sectionId: 'sec_period', displayName: 'Month', order: 2 },
	},
	{
		id: 7,
		displayName: 'Prorated Gross Pay',
		systemFieldName: 'prorated_gross_pay',
		dataType: 'Number',
		required: true,
		aliases: ['gross_pay'],
		aliasInput: '',
		sectionId: 'earnings',
		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Prorated Gross Pay', order: 1 },
	},
	{
		id: 8,
		displayName: 'Basic',
		systemFieldName: 'basic_pay',
		dataType: 'Number',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'fixed_income',
		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Basic', order: 2 },
	},
	{
		id: 9,
		displayName: 'Housing',
		systemFieldName: 'housing_allowance',
		dataType: 'Number',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'fixed_income',
		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Housing', order: 3 },
	},
	{
		id: 10,
		displayName: 'Transport',
		systemFieldName: 'transport_allowance',
		dataType: 'Number',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'fixed_income',
		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Transport', order: 4 },
	},
	{
		id: 11,
		displayName: 'Payee',
		systemFieldName: 'payee_tax',
		dataType: 'Number',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'deductions',
		payslip: { visible: true, sectionId: 'sec_deductions', displayName: 'Payee', order: 1 },
	},
	{
		id: 12,
		displayName: 'Pension',
		systemFieldName: 'pension_contribution',
		dataType: 'Number',
		required: true,
		aliases: [],
		aliasInput: '',
		sectionId: 'deductions',
		payslip: { visible: true, sectionId: 'sec_deductions', displayName: 'Pension', order: 2 },
	},
	{
		id: 13,
		displayName: 'Bonus KPI',
		systemFieldName: 'bonus_kpi',
		dataType: 'Number',
		required: true,
		aliases: ['performance_bonus'],
		aliasInput: '',
		sectionId: 'earnings',
		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Bonus KPI', order: 5 },
	},
];

// Helper functions for field organization
const getFieldsBySection = (fields, sectionId) => {
	return fields.filter((field) => field.sectionId === sectionId);
};

const getFieldsBySections = (fields, sections) => {
	return sections.reduce((acc, section) => {
		acc[section.id] = getFieldsBySection(fields, section.id);
		return acc;
	}, {});
};

const moveFieldToSection = (fields, fieldId, targetSectionId) => {
	return fields.map((field) => (field.id === fieldId ? { ...field, sectionId: targetSectionId } : field));
};

const reorderFieldsInSection = (fields, sectionId, startIndex, endIndex) => {
	const sectionFields = fields.filter((f) => f.sectionId === sectionId);
	const otherFields = fields.filter((f) => f.sectionId !== sectionId);

	const reordered = Array.from(sectionFields);
	const [removed] = reordered.splice(startIndex, 1);
	reordered.splice(endIndex, 0, removed);

	return [...otherFields, ...reordered];
};

// Define which fields belong to which sections
// const FIELD_CATEGORIES = {
// 	// Staff Details
// 	employee_id: 'staff_details',
// 	employee_name: 'staff_details',
// 	department: 'staff_details',
// 	position: 'staff_details',
// 	join_date: 'staff_details',

// 	// Fixed Income
// 	basic_salary: 'fixed_income',
// 	housing_allowance: 'fixed_income',
// 	transport_allowance: 'fixed_income',

// 	// Earnings
// 	overtime: 'earnings',
// 	bonus: 'earnings',
// 	commission: 'earnings',
// 	incentives: 'earnings',

// 	// Deductions
// 	tax: 'deductions',
// 	pension: 'deductions',
// 	loan: 'deductions',
// 	absence_deduction: 'deductions',
// };

// const INITIAL_FIELDS = [
// 	{
// 		id: 1,
// 		displayName: 'Employee ID',
// 		systemFieldName: 'sep_id',
// 		dataType: 'Text',
// 		required: true,
// 		aliases: ['ID', 'Staff#'],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Employee ID', order: 1 },
// 	},
// 	{
// 		id: 2,
// 		displayName: 'Department',
// 		systemFieldName: 'dept_code',
// 		dataType: 'Text',
// 		required: true,
// 		aliases: ['cost_center'],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Department', order: 2 },
// 	},
// 	{
// 		id: 3,
// 		displayName: 'Name',
// 		systemFieldName: 'employee_name',
// 		dataType: 'Text',
// 		required: true,
// 		aliases: ['full_name'],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Name', order: 3 },
// 	},
// 	{
// 		id: 4,
// 		displayName: 'Email',
// 		systemFieldName: 'employee_email',
// 		dataType: 'Text',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_employee', displayName: 'Email', order: 4 },
// 	},
// 	{
// 		id: 5,
// 		displayName: 'Year',
// 		systemFieldName: 'pay_year',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: false, sectionId: 'sec_period', displayName: 'Year', order: 1 },
// 	},
// 	{
// 		id: 6,
// 		displayName: 'Month',
// 		systemFieldName: 'pay_month',
// 		dataType: 'Text',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: false, sectionId: 'sec_period', displayName: 'Month', order: 2 },
// 	},
// 	{
// 		id: 7,
// 		displayName: 'Prorated Gross Pay',
// 		systemFieldName: 'prorated_gross_pay',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: ['gross_pay'],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Prorated Gross Pay', order: 1 },
// 	},
// 	{
// 		id: 8,
// 		displayName: 'Basic',
// 		systemFieldName: 'basic_pay',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Basic', order: 2 },
// 	},
// 	{
// 		id: 9,
// 		displayName: 'Housing',
// 		systemFieldName: 'housing_allowance',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Housing', order: 3 },
// 	},
// 	{
// 		id: 10,
// 		displayName: 'Transport',
// 		systemFieldName: 'transport_allowance',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Transport', order: 4 },
// 	},
// 	{
// 		id: 11,
// 		displayName: 'Payee',
// 		systemFieldName: 'payee_tax',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_deductions', displayName: 'Payee', order: 1 },
// 	},
// 	{
// 		id: 12,
// 		displayName: 'Pension',
// 		systemFieldName: 'pension_contribution',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: [],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_deductions', displayName: 'Pension', order: 2 },
// 	},
// 	{
// 		id: 13,
// 		displayName: 'Bonus KPI',
// 		systemFieldName: 'bonus_kpi',
// 		dataType: 'Number',
// 		required: true,
// 		aliases: ['performance_bonus'],
// 		aliasInput: '',
// 		payslip: { visible: true, sectionId: 'sec_earnings', displayName: 'Bonus KPI', order: 5 },
// 	},
// ];

const StatusCard = ({ icon, iconBg, title, subtitle }) => (
	<Paper
		elevation={0}
		sx={{
			bgcolor: '#0f172a',
			border: '1px solid rgba(255,255,255,0.08)',
			borderRadius: 2,
			p: '14px 16px',
			display: 'flex',
			alignItems: 'center',
			gap: 1.5,
		}}>
		<Box
			sx={{
				width: 34,
				height: 34,
				borderRadius: '50%',
				backgroundColor: iconBg,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				flexShrink: 0,
			}}>
			{icon}
		</Box>
		<Box>
			<Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>{title}</Typography>
			<Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mt: 0.25 }}>
				{subtitle}
			</Typography>
		</Box>
	</Paper>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CreateTemplate() {
	const [templateName, setTemplateName] = useState('');
	const [templateDesc, setTemplateDesc] = useState('');
	const [fields, setFields] = useState(INITIAL_FIELDS);
	const [fieldSections, setFieldSections] = useState(FIELD_SECTIONS);
	const [newSectionName, setNewSectionName] = useState('');

	// Payslip sections state
	const [payslipSections, setPayslipSections] = useState([
		{ id: 'sec_1', name: 'Employee Information', order: 1 },
		{ id: 'sec_2', name: 'Earnings', order: 2 },
		{ id: 'sec_3', name: 'Deductions', order: 3 },
	]);

	// Dialog state
	const [payslipDialog, setPayslipDialog] = useState({
		open: false,
		fieldId: null,
	});

	const hasDuplicates = new Set(fields.map((f) => f.systemFieldName)).size !== fields.length;

	// Field management functions
	const updateField = (id, key, val) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: val } : f)));

	const updateFieldPayslip = (id, payslipUpdates) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, payslip: { ...f.payslip, ...payslipUpdates } } : f)));

	const commitAlias = (id) =>
		setFields((prev) =>
			prev.map((f) => {
				if (f.id !== id) return f;
				const trimmed = f.aliasInput?.trim();
				return trimmed ? { ...f, aliases: [...(f.aliases || []), trimmed], aliasInput: '' } : f;
			})
		);

	const removeAlias = (id, idx) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, aliases: f.aliases.filter((_, i) => i !== idx) } : f)));

	const deleteField = (id) => setFields((prev) => prev.filter((f) => f.id !== id));

	const addField = (sectionId) =>
		setFields((prev) => [
			...prev,
			{
				id: Date.now(),
				displayName: '',
				systemFieldName: '',
				dataType: 'Text',
				required: false,
				aliases: [],
				aliasInput: '',
				sectionId: sectionId || fieldSections[0]?.id,
				payslip: {
					visible: true,
					sectionId: payslipSections[0]?.id,
					displayName: '',
					order: prev.filter((f) => f.sectionId === sectionId).length + 1,
				},
			},
		]);

	// Section management
	const toggleSection = (sectionId) => {
		setFieldSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, expanded: !s.expanded } : s)));
	};

	// Payslip section management
	const handleAddPayslipSection = () => {
		if (!newSectionName.trim()) return;

		const newSection = {
			id: `sec_${Date.now()}`,
			name: newSectionName.trim(),
			order: payslipSections.length + 1,
		};

		setPayslipSections([...payslipSections, newSection]);
		setNewSectionName('');
	};

	const removePayslipSection = (id) => {
		const isUsed = fields.some((f) => f.payslip?.sectionId === id);
		if (isUsed) {
			alert('Cannot delete section that is assigned to fields. Update fields first.');
			return;
		}
		setPayslipSections((prev) => prev.filter((s) => s.id !== id));
	};

	// Dialog handlers
	const openPayslipDialog = (fieldId) => {
		setPayslipDialog({ open: true, fieldId });
	};

	const closePayslipDialog = () => {
		setPayslipDialog({ open: false, fieldId: null });
	};

	const handleSavePayslip = (fieldId, payslipData) => {
		updateFieldPayslip(fieldId, payslipData);
		closePayslipDialog();
	};

	// ── Shared input sx — mirrors StaffManagement TextField style ─────────────
	const inputSx = (mono = false) => ({
		'& .MuiOutlinedInput-root': {
			'backgroundColor': '#222b3f',
			'borderRadius': 1,
			'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
			'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
			'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
		},
		'& .MuiOutlinedInput-input': {
			'py': '7px',
			'px': '10px',
			'fontSize': mono ? 12 : '0.875rem',
			'color': mono ? 'rgba(255,255,255,0.5)' : '#fff',
			'fontFamily': mono ? 'monospace' : 'inherit',
			'&::placeholder': { color: 'rgba(255,255,255,0.5)', opacity: 1 },
		},
	});

	return (
		<Box
			component="main"
			sx={{
				width: '100%',
				minHeight: '100vh',
				overflowX: 'hidden',
				px: { xs: 2, sm: 4, md: 2 },
				py: 4,
			}}>
			{/* Header Section */}
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				justifyContent="space-between"
				alignItems={{ xs: 'flex-start', sm: 'center' }}
				spacing={2}
				sx={{ mb: 4 }}>
				<Typography
					variant="h4"
					fontWeight={700}
					color="white">
					Create Template
				</Typography>
			</Stack>

			{/* Main Content Container */}
			<Box sx={{ width: '100%' }}>
				{/* Template Details */}
				<Paper
					elevation={0}
					sx={{
						bgcolor: '#162033',
						border: '1px solid rgba(255,255,255,0.08)',
						borderRadius: 2,
						p: { xs: 2, sm: '20px 24px' },
						mb: 2,
					}}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
						<DocumentIcon />
						<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Template Details</Typography>
					</Box>

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}>
						<Box sx={{ flex: 1 }}>
							<Typography
								sx={{
									fontSize: '0.75rem',
									fontWeight: 600,
									textTransform: 'uppercase',
									letterSpacing: '0.06em',
									color: 'rgba(255,255,255,0.7)',
									display: 'block',
									mb: 0.75,
								}}>
								Template Name
							</Typography>
							<TextField
								fullWidth
								size="small"
								placeholder="e.g. Monthly Salaried Full-Time"
								value={templateName}
								onChange={(e) => setTemplateName(e.target.value)}
								sx={inputSx()}
							/>
						</Box>
						<Box sx={{ flex: 1 }}>
							<Typography
								sx={{
									fontSize: '0.75rem',
									fontWeight: 600,
									textTransform: 'uppercase',
									letterSpacing: '0.06em',
									color: 'rgba(255,255,255,0.7)',
									display: 'block',
									mb: 0.75,
								}}>
								Template Description
							</Typography>
							<TextField
								fullWidth
								size="small"
								placeholder="Describe the purpose and usage of this template"
								value={templateDesc}
								onChange={(e) => setTemplateDesc(e.target.value)}
								sx={inputSx()}
							/>
						</Box>
					</Stack>
				</Paper>

				{/* Payslip Sections */}
				<Paper
					elevation={0}
					sx={{
						bgcolor: '#162033',
						border: '1px solid rgba(255,255,255,0.08)',
						borderRadius: 2,
						p: { xs: 2, sm: '20px 24px' },
						mb: 2,
					}}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#2196f3"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round">
							<path d="M4 4h16v16H4z" />
							<line
								x1="9"
								y1="4"
								x2="9"
								y2="20"
							/>
							<line
								x1="15"
								y1="4"
								x2="15"
								y2="20"
							/>
							<line
								x1="4"
								y1="9"
								x2="20"
								y2="9"
							/>
							<line
								x1="4"
								y1="15"
								x2="20"
								y2="15"
							/>
						</svg>
						<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Payslip Sections</Typography>
					</Box>

					{/* Input area for new section */}
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1}
						sx={{ mb: 3 }}>
						<TextField
							size="small"
							placeholder="Enter section name (e.g. Bonuses, Allowances, Overtime)"
							value={newSectionName}
							onChange={(e) => setNewSectionName(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && handleAddPayslipSection()}
							sx={{
								'flex': 1,
								'& .MuiOutlinedInput-root': {
									'backgroundColor': '#222b3f',
									'& input': { color: '#fff' },
									'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
									'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
									'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
								},
							}}
						/>
						<Button
							variant="contained"
							size="small"
							startIcon={<PlusIcon />}
							onClick={handleAddPayslipSection}
							disabled={!newSectionName.trim()}
							sx={{
								'width': { xs: '100%', sm: 'auto' },
								'bgcolor': '#2196f3',
								'&:hover': { bgcolor: '#1976d2' },
								'&.Mui-disabled': { bgcolor: 'rgba(33,150,243,0.3)' },
							}}>
							Add
						</Button>
					</Stack>

					{/* Existing sections */}
					<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
						{payslipSections
							.sort((a, b) => a.order - b.order)
							.map((section) => (
								<Chip
									key={section.id}
									label={section.name}
									onDelete={() => removePayslipSection(section.id)}
									sx={{
										'bgcolor': '#222b3f',
										'color': '#fff',
										'& .MuiChip-deleteIcon': {
											'color': 'rgba(255,255,255,0.4)',
											'&:hover': { color: '#f87171' },
										},
									}}
								/>
							))}
					</Box>
				</Paper>

				{/* Field Sections */}
				{fieldSections.map((section) => {
					const sectionFields = fields.filter((f) => f.sectionId === section.id);

					return (
						<Paper
							key={section.id}
							elevation={0}
							sx={{
								bgcolor: '#162033',
								border: '1px solid rgba(255,255,255,0.08)',
								borderRadius: 2,
								overflow: 'hidden',
								mb: 2,
							}}>
							{/* Section Header */}
							<Box
								sx={{
									'display': 'flex',
									'alignItems': 'center',
									'justifyContent': 'space-between',
									'px': { xs: 2, sm: 3 },
									'py': 2,
									'borderBottom': '1px solid rgba(255,255,255,0.06)',
									'cursor': 'pointer',
									'&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
								}}
								onClick={() => toggleSection(section.id)}>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
									<Typography sx={{ fontSize: '1rem', color: section.color }}>{section.icon}</Typography>

									<Box>
										<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>{section.name}</Typography>
										<Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
											{sectionFields.length} field{sectionFields.length !== 1 ? 's' : ''}
											{section.description && ` • ${section.description}`}
										</Typography>
									</Box>
								</Box>

								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<Button
										size="small"
										startIcon={<PlusIcon />}
										onClick={(e) => {
											e.stopPropagation();
											addField(section.id);
										}}
										sx={{
											'color': '#2196f3',
											'fontSize': '0.75rem',
											'fontWeight': 600,
											'textTransform': 'none',
											'mr': 1,
											'&:hover': { backgroundColor: 'rgba(33,150,243,0.1)' },
										}}>
										Add Field
									</Button>
									<Box sx={{ color: 'rgba(255,255,255,0.5)' }}>{section.expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</Box>
								</Box>
							</Box>

							{/* Expanded Content */}
							{section.expanded && (
								<Box sx={{ p: { xs: 2, sm: 3 } }}>
									{sectionFields.length > 0 ? (
										<>
											{/* Responsive table container */}
											<Box
												sx={{
													'overflowX': 'auto',
													'WebkitOverflowScrolling': 'touch',
													'scrollbarWidth': 'thin',
													'&::-webkit-scrollbar': { height: 6 },
													'&::-webkit-scrollbar-thumb': { bgcolor: 'grey.700', borderRadius: '10px' },
													'&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
													'mb': 2,
												}}>
												<Box sx={{ minWidth: { xs: '900px', lg: '100%' } }}>
													{/* Table Header */}
													<Box
														sx={{
															display: 'grid',
															gridTemplateColumns: GRID_COLS,
															gap: '10px',
															px: { xs: 1, sm: 2 },
															py: 1,
															bgcolor: 'hsl(219, 40%, 14%)',
															borderRadius: 1,
															mb: 1,
														}}>
														{['', 'Display Name', 'System Field', 'Data Type', 'Required', 'Aliases', 'Payslip', ''].map((h, i) => (
															<Typography
																key={i}
																sx={{
																	color: 'rgba(255,255,255,0.7)',
																	fontWeight: 600,
																	fontSize: '0.7rem',
																	textTransform: 'uppercase',
																	whiteSpace: 'nowrap',
																}}>
																{h}
															</Typography>
														))}
													</Box>

													{/* Table Rows */}
													{sectionFields.map((field) => (
														<Box
															key={field.id}
															sx={{
																'display': 'grid',
																'gridTemplateColumns': GRID_COLS,
																'gap': '10px',
																'px': { xs: 1, sm: 2 },
																'py': 1,
																'alignItems': 'center',
																'borderBottom': '1px solid rgba(255,255,255,0.06)',
																'borderRadius': 1,
																'&:hover': { bgcolor: '#1a2332' },
															}}>
															{/* Drag Handle Placeholder (empty but maintains grid) */}
															<Box sx={{ color: 'rgba(255,255,255,0.3)' }}>
																<GripIcon />
															</Box>

															{/* Display Name */}
															<TextField
																fullWidth
																size="small"
																placeholder="Display name"
																value={field.displayName}
																onChange={(e) => updateField(field.id, 'displayName', e.target.value)}
																sx={inputSx()}
															/>

															{/* System Field Name */}
															<TextField
																fullWidth
																size="small"
																placeholder="system_field"
																value={field.systemFieldName}
																onChange={(e) => updateField(field.id, 'systemFieldName', e.target.value)}
																sx={inputSx(true)}
															/>

															{/* Data Type Select */}
															<FormControl
																fullWidth
																size="small">
																<Select
																	value={field.dataType}
																	onChange={(e) => updateField(field.id, 'dataType', e.target.value)}
																	sx={{
																		'backgroundColor': '#222b3f',
																		'color': '#fff',
																		'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
																		'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
																		'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
																		'& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
																	}}>
																	{DATA_TYPES.map((t) => (
																		<MenuItem
																			key={t}
																			value={t}>
																			{t}
																		</MenuItem>
																	))}
																</Select>
															</FormControl>

															{/* Required Switch */}
															<Box sx={{ display: 'flex', justifyContent: 'center' }}>
																<Switch
																	checked={field.required}
																	onChange={(e) => updateField(field.id, 'required', e.target.checked)}
																	sx={{
																		'width': 36,
																		'height': 20,
																		'p': 0,
																		'& .MuiSwitch-switchBase': {
																			'p': '2px',
																			'&.Mui-checked': {
																				'transform': 'translateX(16px)',
																				'color': '#fff',
																				'& + .MuiSwitch-track': { backgroundColor: '#2196f3', opacity: 1 },
																			},
																		},
																		'& .MuiSwitch-thumb': { width: 16, height: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
																		'& .MuiSwitch-track': { borderRadius: 10, backgroundColor: '#334155', opacity: '1 !important' },
																	}}
																/>
															</Box>

															{/* Aliases */}
															<Box
																sx={{
																	'bgcolor': '#222b3f',
																	'border': '1px solid rgba(255,255,255,0.15)',
																	'borderRadius': 1,
																	'px': 1,
																	'py': '4px',
																	'minHeight': 34,
																	'display': 'flex',
																	'alignItems': 'center',
																	'flexWrap': 'wrap',
																	'gap': 0.5,
																	'&:focus-within': { borderColor: '#2196f3' },
																}}>
																{field.aliases?.map((alias, i) => (
																	<Chip
																		key={i}
																		label={alias}
																		size="small"
																		onDelete={() => removeAlias(field.id, i)}
																		sx={{
																			'height': 20,
																			'fontSize': 11,
																			'fontFamily': 'monospace',
																			'bgcolor': '#334155',
																			'color': 'rgba(255,255,255,0.8)',
																			'borderRadius': 1,
																			'& .MuiChip-deleteIcon': {
																				'fontSize': 12,
																				'color': 'rgba(255,255,255,0.4)',
																				'&:hover': { color: '#fff' },
																			},
																		}}
																	/>
																))}
																<input
																	type="text"
																	placeholder="+"
																	value={field.aliasInput || ''}
																	onChange={(e) => updateField(field.id, 'aliasInput', e.target.value)}
																	onKeyDown={(e) => e.key === 'Enter' && commitAlias(field.id)}
																	onBlur={() => commitAlias(field.id)}
																	style={{
																		background: 'transparent',
																		border: 'none',
																		color: 'rgba(255,255,255,0.8)',
																		width: '30px',
																		outline: 'none',
																		fontSize: '12px',
																	}}
																/>
															</Box>

															{/* Payslip Icon */}
															<Box sx={{ display: 'flex', justifyContent: 'center' }}>
																<Tooltip title={field.payslip?.visible ? 'Shown on payslip' : 'Hidden on payslip'}>
																	<IconButton
																		size="small"
																		onClick={() => openPayslipDialog(field.id)}
																		sx={{
																			'color': field.payslip?.visible ? '#4ade80' : 'rgba(255,255,255,0.3)',
																			'&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
																		}}>
																		{field.payslip?.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
																	</IconButton>
																</Tooltip>
															</Box>

															{/* Delete Button */}
															<Tooltip
																title="Delete field"
																placement="top"
																arrow>
																<IconButton
																	size="small"
																	onClick={() => deleteField(field.id)}
																	sx={{
																		'color': 'rgba(255,255,255,0.3)',
																		'p': '4px',
																		'&:hover': {
																			color: '#f87171',
																			backgroundColor: 'rgba(248,113,113,0.1)',
																		},
																	}}>
																	<TrashIcon />
																</IconButton>
															</Tooltip>
														</Box>
													))}
												</Box>
											</Box>
										</>
									) : (
										// Empty state
										<Box
											sx={{
												textAlign: 'center',
												py: 4,
												border: '1px dashed rgba(255,255,255,0.1)',
												borderRadius: 2,
											}}>
											<Typography sx={{ color: 'rgba(255,255,255,0.3)', mb: 2, fontSize: '0.875rem' }}>No fields in this section yet</Typography>
											<Button
												variant="outlined"
												size="small"
												startIcon={<PlusIcon />}
												onClick={() => addField(section.id)}
												sx={{
													'borderColor': section.color,
													'color': section.color,
													'&:hover': {
														borderColor: section.color,
														backgroundColor: `${section.color}10`,
													},
												}}>
												Add your first field
											</Button>
										</Box>
									)}
								</Box>
							)}
						</Paper>
					);
				})}

				{/* Create Template Button */}
				<Paper
					elevation={0}
					sx={{
						bgcolor: '#162033',
						border: '1px solid rgba(255,255,255,0.08)',
						borderRadius: 2,
						p: 2,
						mb: 2,
					}}>
					<Box
						sx={{
							display: 'flex',
							gap: '10px',
							px: { xs: 2, sm: 2.5 },
							py: 1.5,
							alignItems: 'center',
						}}>
						<Box
							sx={{
								width: { xs: '80%', md: '50%' },
								mx: 'auto',
								columnSpan: 11,
								display: 'flex',
								justifyContent: 'flex-end',
							}}>
							<Button
								variant="contained"
								size="large"
								fullWidth
								startIcon={<PlusIcon />}
								sx={{
									'bgcolor': '#2196f3',
									'&:hover': { bgcolor: '#1976d2' },
									'&.Mui-disabled': { bgcolor: 'rgba(33,150,243,0.3)' },
									'whiteSpace': 'nowrap',
								}}>
								Create Template
							</Button>
						</Box>
					</Box>
				</Paper>

				{/* Status Cards */}
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
						gap: 2,
					}}>
					<StatusCard
						icon={<InfoIcon />}
						iconBg="rgba(33,150,243,0.15)"
						title="Dynamic Mapping"
						subtitle="Fields are automatically synced"
					/>

					<StatusCard
						icon={<CheckCircleIcon />}
						iconBg={hasDuplicates ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)'}
						title={`Schema ${hasDuplicates ? 'Invalid' : 'Valid'}`}
						subtitle={hasDuplicates ? 'Duplicate system names found' : 'No duplicate system names found'}
					/>
				</Box>

				{/* Payslip Dialog */}
				<PayslipDialog
					open={payslipDialog.open}
					field={fields.find((f) => f.id === payslipDialog.fieldId)}
					sections={payslipSections}
					onClose={closePayslipDialog}
					onSave={handleSavePayslip}
					updateFieldPayslip={updateFieldPayslip}
				/>

				{/* Footer */}
				<Typography sx={{ textAlign: 'center', mt: 3, fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>
					© 2024 247HR Enterprise Solutions. All rights reserved. • Enterprise Payroll Management System
				</Typography>
			</Box>
		</Box>
	);
}

// export default function CreateTemplate() {
// 	// const [templateName, setTemplateName] = useState('');
// 	// const [templateDesc, setTemplateDesc] = useState('');
// 	// const [fields, setFields] = useState(INITIAL_FIELDS);
// 	// const [fieldSections, setFieldSections] = useState([
// 	// 	{ id: 'staff', name: 'Staff Details', expanded: true, color: '#3b82f6', icon: <User /> },
// 	// 	{ id: 'fixed', name: 'Fixed Income', expanded: true, color: '#10b981', icon: <DollarSign /> },
// 	// 	{ id: 'earnings', name: 'Earnings', expanded: true, color: '#f59e0b', icon: <TrendingUp /> },
// 	// 	{ id: 'deductions', name: 'Deductions', expanded: true, color: '#ef4444', icon: <TrendingDown /> },
// 	// ]);
// 	// const [fieldSectionMap, setFieldSectionMap] = useState({});
// 	// const [dragId, setDragId] = useState(null);
// 	// const [dragOverId, setDragOverId] = useState(null);
// 	// const [newSectionName, setNewSectionName] = useState('');

// 	// // Payslip sections state
// 	// const [payslipSections, setPayslipSections] = useState([
// 	// 	{ id: 'sec_1', name: 'Employee Information', order: 1 },
// 	// 	{ id: 'sec_2', name: 'Earnings', order: 2 },
// 	// 	{ id: 'sec_3', name: 'Deductions', order: 3 },
// 	// ]);

// 	// // Dialog state
// 	// const [payslipDialog, setPayslipDialog] = useState({
// 	// 	open: false,
// 	// 	fieldId: null,
// 	// });

// 	const [templateName, setTemplateName] = useState('');
// 	const [templateDesc, setTemplateDesc] = useState('');
// 	const [fields, setFields] = useState(INITIAL_FIELDS);
// 	const [fieldSections, setFieldSections] = useState(FIELD_SECTIONS);
// 	const [dragState, setDragState] = useState({
// 		fieldId: null,
// 		sourceSectionId: null,
// 		sourceIndex: null,
// 	});
// 	const [newSectionName, setNewSectionName] = useState('');

// 	// Payslip sections state
// 	const [payslipSections, setPayslipSections] = useState([
// 		{ id: 'sec_1', name: 'Employee Information', order: 1 },
// 		{ id: 'sec_2', name: 'Earnings', order: 2 },
// 		{ id: 'sec_3', name: 'Deductions', order: 3 },
// 	]);

// 	// Dialog state
// 	const [payslipDialog, setPayslipDialog] = useState({
// 		open: false,
// 		fieldId: null,
// 	});

// 	const hasDuplicates = new Set(fields.map((f) => f.systemFieldName)).size !== fields.length;

// 	// Field management functions
// 	const updateField = (id, key, val) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: val } : f)));

// 	const updateFieldPayslip = (id, payslipUpdates) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, payslip: { ...f.payslip, ...payslipUpdates } } : f)));

// 	const commitAlias = (id) =>
// 		setFields((prev) =>
// 			prev.map((f) => {
// 				if (f.id !== id) return f;
// 				const t = f.aliasInput?.trim();
// 				return t ? { ...f, aliases: [...(f.aliases || []), t], aliasInput: '' } : f;
// 			})
// 		);

// 	const removeAlias = (id, idx) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, aliases: f.aliases.filter((_, i) => i !== idx) } : f)));

// 	const deleteField = (id) => setFields((prev) => prev.filter((f) => f.id !== id));

// 	const addField = (sectionId) =>
// 		setFields((prev) => [
// 			...prev,
// 			{
// 				id: Date.now(),
// 				displayName: '',
// 				systemFieldName: '',
// 				dataType: 'Text',
// 				required: false,
// 				aliases: [],
// 				aliasInput: '',
// 				sectionId: sectionId || fieldSections[0]?.id,
// 				payslip: { visible: true, sectionId: payslipSections[0]?.id, displayName: '', order: 1 },
// 			},
// 		]);

// 	// Section management
// 	const toggleSection = (sectionId) => {
// 		setFieldSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, expanded: !s.expanded } : s)));
// 	};

// 	// Drag and drop functions
// 	const handleDragStart = (e, fieldId, sectionId, index) => {
// 		setDragState({
// 			fieldId,
// 			sourceSectionId: sectionId,
// 			sourceIndex: index,
// 		});
// 		e.dataTransfer.effectAllowed = 'move';
// 		e.dataTransfer.setData('text/plain', fieldId);
// 	};

// 	// const hasDuplicates = new Set(fields.map((f) => f.systemFieldName)).size !== fields.length;

// 	// Field management functions
// 	// const updateField = (id, key, val) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: val } : f)));

// 	// const updateFieldPayslip = (id, payslipUpdates) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, payslip: { ...f.payslip, ...payslipUpdates } } : f)));

// 	// const commitAlias = (id) =>
// 	// 	setFields((prev) =>
// 	// 		prev.map((f) => {
// 	// 			if (f.id !== id) return f;
// 	// 			const t = f.aliasInput?.trim();
// 	// 			return t ? { ...f, aliases: [...(f.aliases || []), t], aliasInput: '' } : f;
// 	// 		})
// 	// 	);

// 	// const removeAlias = (id, idx) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, aliases: f.aliases.filter((_, i) => i !== idx) } : f)));

// 	// const deleteField = (id) => setFields((prev) => prev.filter((f) => f.id !== id));

// 	// const addField = () =>
// 	// 	setFields((prev) => [
// 	// 		...prev,
// 	// 		{
// 	// 			id: Date.now(),
// 	// 			displayName: '',
// 	// 			systemFieldName: '',
// 	// 			dataType: 'Text',
// 	// 			required: false,
// 	// 			aliases: [],
// 	// 			aliasInput: '',
// 	// 			payslip: { visible: true, sectionId: payslipSections[0]?.id, displayName: '', order: 1 },
// 	// 		},
// 	// 	]);

// 	const handleAddSection = () => {
// 		if (!newSectionName.trim()) return;

// 		const newSection = {
// 			id: `sec_${Date.now()}`,
// 			name: newSectionName.trim(),
// 			order: payslipSections.length + 1,
// 		};

// 		setPayslipSections([...payslipSections, newSection]);
// 		setNewSectionName(''); // Clear input
// 	};

// 	const updateSection = (id, updates) => setPayslipSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));

// 	const removeSection = (id) => {
// 		// Check if section is used by any field
// 		const isUsed = fields.some((f) => f.payslip?.sectionId === id);
// 		if (isUsed) {
// 			alert('Cannot delete section that is assigned to fields. Update fields first.');
// 			return;
// 		}
// 		setPayslipSections((prev) => prev.filter((s) => s.id !== id));
// 	};

// 	// Drag and drop functions
// 	// const handleDragStart = (e, id) => {
// 	// 	setDragId(id);
// 	// 	e.dataTransfer.effectAllowed = 'move';
// 	// };

// 	const handleDragOver = (e, id) => {
// 		e.preventDefault();
// 		setDragOverId(id);
// 	};

// 	const handleDrop = useCallback(
// 		(e, targetId) => {
// 			e.preventDefault();
// 			if (dragId === targetId) return;
// 			setFields((prev) => {
// 				const arr = [...prev];
// 				const from = arr.findIndex((f) => f.id === dragId);
// 				const to = arr.findIndex((f) => f.id === targetId);
// 				const [m] = arr.splice(from, 1);
// 				arr.splice(to, 0, m);
// 				return arr;
// 			});
// 			setDragId(null);
// 			setDragOverId(null);
// 		},
// 		[dragId]
// 	);

// 	// Dialog handlers
// 	// const openPayslipDialog = (fieldId) => {
// 	// 	setPayslipDialog({ open: true, fieldId });
// 	// };

// 	// const closePayslipDialog = () => {
// 	// 	setPayslipDialog({ open: false, fieldId: null });
// 	// };

// 	// const handleSavePayslip = (fieldId, payslipData) => {
// 	// 	updateFieldPayslip(fieldId, payslipData);
// 	// 	closePayslipDialog();
// 	// };

// 	const handleAddPayslipSection = () => {
// 		if (!newSectionName.trim()) return;

// 		const newSection = {
// 			id: `sec_${Date.now()}`,
// 			name: newSectionName.trim(),
// 			order: payslipSections.length + 1,
// 		};

// 		setPayslipSections([...payslipSections, newSection]);
// 		setNewSectionName('');
// 	};

// 	const updatePayslipSection = (id, updates) => setPayslipSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));

// 	const removePayslipSection = (id) => {
// 		const isUsed = fields.some((f) => f.payslip?.sectionId === id);
// 		if (isUsed) {
// 			alert('Cannot delete section that is assigned to fields. Update fields first.');
// 			return;
// 		}
// 		setPayslipSections((prev) => prev.filter((s) => s.id !== id));
// 	};

// 	// Dialog handlers
// 	const openPayslipDialog = (fieldId) => {
// 		setPayslipDialog({ open: true, fieldId });
// 	};

// 	const closePayslipDialog = () => {
// 		setPayslipDialog({ open: false, fieldId: null });
// 	};

// 	const handleSavePayslip = (fieldId, payslipData) => {
// 		updateFieldPayslip(fieldId, payslipData);
// 		closePayslipDialog();
// 	};

// 	// ── Shared input sx — mirrors StaffManagement TextField style ─────────────
// 	const inputSx = (mono = false) => ({
// 		'& .MuiOutlinedInput-root': {
// 			'backgroundColor': '#222b3f',
// 			'borderRadius': 1,
// 			'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
// 			'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
// 			'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
// 		},
// 		'& .MuiOutlinedInput-input': {
// 			'py': '7px',
// 			'px': '10px',
// 			'fontSize': mono ? 12 : '0.875rem',
// 			'color': mono ? 'rgba(255,255,255,0.5)' : '#fff',
// 			'fontFamily': mono ? 'monospace' : 'inherit',
// 			'&::placeholder': { color: 'rgba(255,255,255,0.5)', opacity: 1 },
// 		},
// 	});

// 	return (
// 		<Box
// 			component="main"
// 			sx={{
// 				width: '100%',
// 				minHeight: '100vh',
// 				overflowX: 'hidden', // Prevent horizontal scroll
// 				px: { xs: 2, sm: 4, md: 2 }, // Match dashboard padding
// 				py: 4,
// 			}}>
// 			{/* Header Section - Match dashboard style */}
// 			<Stack
// 				direction={{ xs: 'column', sm: 'row' }}
// 				justifyContent="space-between"
// 				alignItems={{ xs: 'flex-start', sm: 'center' }}
// 				spacing={2}
// 				sx={{ mb: 4 }}>
// 				<Typography
// 					variant="h4"
// 					fontWeight={700}
// 					color="white">
// 					Create Template
// 				</Typography>

// 				{/* You could add action buttons here if needed */}
// 			</Stack>

// 			{/* Main Content Container - Fluid width like dashboard */}
// 			<Box sx={{ width: '100%' }}>
// 				{/* Template Details */}
// 				<Paper
// 					elevation={0}
// 					sx={{
// 						bgcolor: '#162033',
// 						border: '1px solid rgba(255,255,255,0.08)',
// 						borderRadius: 2,
// 						p: { xs: 2, sm: '20px 24px' }, // Responsive padding
// 						mb: 2,
// 					}}>
// 					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
// 						<DocumentIcon />
// 						<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Template Details</Typography>
// 					</Box>

// 					<Stack
// 						direction={{ xs: 'column', sm: 'row' }}
// 						spacing={2}>
// 						<Box sx={{ flex: 1 }}>
// 							<Typography
// 								sx={{
// 									fontSize: '0.75rem',
// 									fontWeight: 600,
// 									textTransform: 'uppercase',
// 									letterSpacing: '0.06em',
// 									color: 'rgba(255,255,255,0.7)',
// 									display: 'block',
// 									mb: 0.75,
// 								}}>
// 								Template Name
// 							</Typography>
// 							<TextField
// 								fullWidth
// 								size="small"
// 								placeholder="e.g. Monthly Salaried Full-Time"
// 								value={templateName}
// 								onChange={(e) => setTemplateName(e.target.value)}
// 								sx={inputSx()}
// 							/>
// 						</Box>
// 						<Box sx={{ flex: 1 }}>
// 							<Typography
// 								sx={{
// 									fontSize: '0.75rem',
// 									fontWeight: 600,
// 									textTransform: 'uppercase',
// 									letterSpacing: '0.06em',
// 									color: 'rgba(255,255,255,0.7)',
// 									display: 'block',
// 									mb: 0.75,
// 								}}>
// 								Template Description
// 							</Typography>
// 							<TextField
// 								fullWidth
// 								size="small"
// 								placeholder="Describe the purpose and usage of this template"
// 								value={templateDesc}
// 								onChange={(e) => setTemplateDesc(e.target.value)}
// 								sx={inputSx()}
// 							/>
// 						</Box>
// 					</Stack>
// 				</Paper>

// 				{/* Payslip Sections */}
// 				<Paper
// 					elevation={0}
// 					sx={{
// 						bgcolor: '#162033',
// 						border: '1px solid rgba(255,255,255,0.08)',
// 						borderRadius: 2,
// 						p: { xs: 2, sm: '20px 24px' },
// 						mb: 2,
// 					}}>
// 					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
// 						<svg
// 							width="16"
// 							height="16"
// 							viewBox="0 0 24 24"
// 							fill="none"
// 							stroke="#2196f3"
// 							strokeWidth="2"
// 							strokeLinecap="round"
// 							strokeLinejoin="round">
// 							<path d="M4 4h16v16H4z" />
// 							<line
// 								x1="9"
// 								y1="4"
// 								x2="9"
// 								y2="20"
// 							/>
// 							<line
// 								x1="15"
// 								y1="4"
// 								x2="15"
// 								y2="20"
// 							/>
// 							<line
// 								x1="4"
// 								y1="9"
// 								x2="20"
// 								y2="9"
// 							/>
// 							<line
// 								x1="4"
// 								y1="15"
// 								x2="20"
// 								y2="15"
// 							/>
// 						</svg>
// 						<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Payslip Sections</Typography>
// 					</Box>

// 					{/* Input area for new section - Stack for better mobile layout */}
// 					<Stack
// 						direction={{ xs: 'column', sm: 'row' }}
// 						spacing={1}
// 						sx={{ mb: 3 }}>
// 						<TextField
// 							size="small"
// 							placeholder="Enter section name (e.g. Bonuses, Allowances, Overtime)"
// 							value={newSectionName}
// 							onChange={(e) => setNewSectionName(e.target.value)}
// 							onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
// 							sx={{
// 								'flex': 1,
// 								'& .MuiOutlinedInput-root': {
// 									'backgroundColor': '#222b3f',
// 									'& input': { color: '#fff' },
// 									'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
// 									'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
// 									'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
// 								},
// 							}}
// 						/>
// 						<Button
// 							variant="contained"
// 							size="small"
// 							startIcon={<PlusIcon />}
// 							onClick={handleAddSection}
// 							disabled={!newSectionName.trim()}
// 							sx={{
// 								'width': { xs: '100%', sm: 'auto' }, // Full width on mobile, auto on desktop
// 								'bgcolor': '#2196f3',
// 								'&:hover': { bgcolor: '#1976d2' },
// 								'&.Mui-disabled': { bgcolor: 'rgba(33,150,243,0.3)' },
// 							}}>
// 							Add
// 						</Button>
// 					</Stack>

// 					{/* Existing sections */}
// 					<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
// 						{payslipSections
// 							.sort((a, b) => a.order - b.order)
// 							.map((section) => (
// 								<Chip
// 									key={section.id}
// 									label={section.name}
// 									onDelete={() => removeSection(section.id)}
// 									sx={{
// 										'bgcolor': '#222b3f',
// 										'color': '#fff',
// 										'& .MuiChip-deleteIcon': {
// 											'color': 'rgba(255,255,255,0.4)',
// 											'&:hover': { color: '#f87171' },
// 										},
// 									}}
// 								/>
// 							))}
// 					</Box>
// 				</Paper>

// 				{/* Field Sections - Standalone Paper Components */}
// 				{fieldSections.map((section) => {
// 					// Filter fields for this section (you'll need to implement your logic here)
// 					// const sectionFields = fields.filter((f, index) => {
// 					// 	// This is a simple distribution - replace with your actual logic
// 					// 	const sectionIndex = fieldSections.findIndex((s) => s.id === section.id);
// 					// 	const fieldsPerSection = Math.ceil(fields.length / fieldSections.length);
// 					// 	const start = sectionIndex * fieldsPerSection;
// 					// 	const end = start + fieldsPerSection;
// 					// 	return index >= start && index < end;
// 					// });

// 					const sectionFields = fields.filter((f) => f.sectionId === section.id);

// 					// const sectionFields = fields.filter((f) => FIELD_CATEGORIES[f.systemFieldName?.toLowerCase()] === section.id);

// 					if (sectionFields.length === 0 && sectionFields.length === 0) return null;

// 					return (
// 						<Paper
// 							key={section.id}
// 							elevation={0}
// 							sx={{
// 								bgcolor: '#162033',
// 								border: '1px solid rgba(255,255,255,0.08)',
// 								borderRadius: 2,
// 								overflow: 'hidden',
// 								mb: 2,
// 							}}>
// 							<Box
// 								sx={{
// 									'display': 'flex',
// 									'alignItems': 'center',
// 									'justifyContent': 'space-between',
// 									'px': { xs: 2, sm: 3 },
// 									'py': 2,
// 									'borderBottom': '1px solid rgba(255,255,255,0.06)',
// 									'cursor': 'pointer',
// 									'&:hover': {
// 										bgcolor: 'rgba(255,255,255,0.02)',
// 									},
// 								}}
// 								onClick={() => setFieldSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, expanded: !s.expanded } : s)))}>
// 								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
// 									<Typography sx={{ fontSize: '1rem', color: section.color }}>{section.icon}</Typography>

// 									<Box>
// 										<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>{section.name}</Typography>
// 										<Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
// 											{sectionFields.length} field{sectionFields.length !== 1 ? 's' : ''}
// 										</Typography>
// 									</Box>
// 								</Box>

// 								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
// 									<Button
// 										size="small"
// 										startIcon={<PlusIcon />}
// 										onClick={(e) => {
// 											e.stopPropagation();
// 											addField();
// 										}}
// 										sx={{
// 											'color': '#2196f3',
// 											'fontSize': '0.75rem',
// 											'fontWeight': 600,
// 											'textTransform': 'none',
// 											'mr': 1,
// 											'&:hover': { backgroundColor: 'rgba(33,150,243,0.1)' },
// 										}}>
// 										Add Field
// 									</Button>
// 									<Box sx={{ color: 'rgba(255,255,255,0.5)' }}>{section.expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</Box>
// 								</Box>
// 							</Box>

// 							{/* Expanded Content */}
// 							{section.expanded && (
// 								<Box sx={{ p: { xs: 2, sm: 3 } }}>
// 									{sectionFields.length > 0 ? (
// 										<>
// 											{/* Responsive table container */}
// 											<Box
// 												sx={{
// 													'overflowX': 'auto',
// 													'WebkitOverflowScrolling': 'touch',
// 													'scrollbarWidth': 'thin',
// 													'&::-webkit-scrollbar': { height: 6 },
// 													'&::-webkit-scrollbar-thumb': { bgcolor: 'grey.700', borderRadius: '10px' },
// 													'&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
// 													'mb': 2,
// 												}}>
// 												<Box sx={{ minWidth: { xs: '900px', lg: '100%' } }}>
// 													{/* Table Header */}
// 													<Box
// 														sx={{
// 															display: 'grid',
// 															gridTemplateColumns: GRID_COLS,
// 															gap: '10px',
// 															px: { xs: 1, sm: 2 },
// 															py: 1,
// 															bgcolor: 'hsl(219, 40%, 14%)',
// 															borderRadius: 1,
// 															mb: 1,
// 														}}>
// 														{['', 'Display Name', 'System Field', 'Data Type', 'Required', 'Aliases', 'Payslip', ''].map((h, i) => (
// 															<Typography
// 																key={i}
// 																sx={{
// 																	color: 'rgba(255,255,255,0.7)',
// 																	fontWeight: 600,
// 																	fontSize: '0.7rem',
// 																	textTransform: 'uppercase',
// 																	whiteSpace: 'nowrap',
// 																}}>
// 																{h}
// 															</Typography>
// 														))}
// 													</Box>

// 													{/* Table Rows */}
// 													{sectionFields.map((field, index) => (
// 														<Box
// 															key={field.id}
// 															draggable
// 															onDragStart={(e) => handleDragStart(e, field.id)}
// 															onDragOver={(e) => handleDragOver(e, field.id)}
// 															onDrop={(e) => handleDrop(e, field.id)}
// 															onDragEnd={() => {
// 																setDragId(null);
// 																setDragOverId(null);
// 															}}
// 															sx={{
// 																'display': 'grid',
// 																'gridTemplateColumns': GRID_COLS,
// 																'gap': '10px',
// 																'px': { xs: 1, sm: 2 },
// 																'py': 1,
// 																'alignItems': 'center',
// 																'bgcolor': dragOverId === field.id && dragId !== field.id ? '#1a2332' : 'transparent',
// 																'borderBottom': index < sectionFields.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
// 																'transition': 'background-color 0.15s',
// 																'& .drag-handle': { opacity: 0, transition: 'opacity 0.15s' },
// 																'& .delete-btn': { opacity: 0, transition: 'opacity 0.15s' },
// 																'cursor': 'default',
// 																'borderRadius': 1,
// 																'&:hover': { bgcolor: '#1a2332' },
// 																'&:hover .drag-handle': { opacity: 1 },
// 																'&:hover .delete-btn': { opacity: 1 },
// 															}}>
// 															{/* Drag Handle */}
// 															<Box
// 																className="drag-handle"
// 																sx={{ color: 'rgba(255,255,255,0.3)', cursor: 'grab', display: 'flex', alignItems: 'center' }}>
// 																<GripIcon />
// 															</Box>

// 															{/* Display Name */}
// 															<TextField
// 																fullWidth
// 																size="small"
// 																placeholder="Display name"
// 																value={field.displayName}
// 																onChange={(e) => updateField(field.id, 'displayName', e.target.value)}
// 																sx={inputSx()}
// 															/>

// 															{/* System Field Name */}
// 															<TextField
// 																fullWidth
// 																size="small"
// 																placeholder="system_field"
// 																value={field.systemFieldName}
// 																onChange={(e) => updateField(field.id, 'systemFieldName', e.target.value)}
// 																sx={inputSx(true)}
// 															/>

// 															{/* Data Type Select */}
// 															<FormControl
// 																fullWidth
// 																size="small">
// 																<Select
// 																	value={field.dataType}
// 																	onChange={(e) => updateField(field.id, 'dataType', e.target.value)}
// 																	sx={{
// 																		'backgroundColor': '#222b3f',
// 																		'color': '#fff',
// 																		'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
// 																		'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
// 																		'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
// 																		'& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
// 																	}}>
// 																	{DATA_TYPES.map((t) => (
// 																		<MenuItem
// 																			key={t}
// 																			value={t}>
// 																			{t}
// 																		</MenuItem>
// 																	))}
// 																</Select>
// 															</FormControl>

// 															{/* Required Switch */}
// 															<Box sx={{ display: 'flex', justifyContent: 'center' }}>
// 																<Switch
// 																	checked={field.required}
// 																	onChange={(e) => updateField(field.id, 'required', e.target.checked)}
// 																	sx={{
// 																		'width': 36,
// 																		'height': 20,
// 																		'p': 0,
// 																		'& .MuiSwitch-switchBase': {
// 																			'p': '2px',
// 																			'&.Mui-checked': {
// 																				'transform': 'translateX(16px)',
// 																				'color': '#fff',
// 																				'& + .MuiSwitch-track': { backgroundColor: '#2196f3', opacity: 1 },
// 																			},
// 																		},
// 																		'& .MuiSwitch-thumb': { width: 16, height: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
// 																		'& .MuiSwitch-track': { borderRadius: 10, backgroundColor: '#334155', opacity: '1 !important' },
// 																	}}
// 																/>
// 															</Box>

// 															{/* Aliases */}
// 															<Box
// 																sx={{
// 																	'bgcolor': '#222b3f',
// 																	'border': '1px solid rgba(255,255,255,0.15)',
// 																	'borderRadius': 1,
// 																	'px': 1,
// 																	'py': '4px',
// 																	'minHeight': 34,
// 																	'display': 'flex',
// 																	'alignItems': 'center',
// 																	'flexWrap': 'wrap',
// 																	'gap': 0.5,
// 																	'&:focus-within': { borderColor: '#2196f3' },
// 																}}>
// 																{field.aliases?.map((alias, i) => (
// 																	<Chip
// 																		key={i}
// 																		label={alias}
// 																		size="small"
// 																		onDelete={() => removeAlias(field.id, i)}
// 																		sx={{
// 																			'height': 20,
// 																			'fontSize': 11,
// 																			'fontFamily': 'monospace',
// 																			'bgcolor': '#334155',
// 																			'color': 'rgba(255,255,255,0.8)',
// 																			'borderRadius': 1,
// 																			'& .MuiChip-deleteIcon': {
// 																				'fontSize': 12,
// 																				'color': 'rgba(255,255,255,0.4)',
// 																				'&:hover': { color: '#fff' },
// 																			},
// 																		}}
// 																	/>
// 																))}
// 																<input
// 																	type="text"
// 																	placeholder="+"
// 																	value={field.aliasInput || ''}
// 																	onChange={(e) => updateField(field.id, 'aliasInput', e.target.value)}
// 																	onKeyDown={(e) => e.key === 'Enter' && commitAlias(field.id)}
// 																	onBlur={() => commitAlias(field.id)}
// 																	style={{
// 																		background: 'transparent',
// 																		border: 'none',
// 																		color: 'rgba(255,255,255,0.8)',
// 																		width: '30px',
// 																		outline: 'none',
// 																		fontSize: '12px',
// 																	}}
// 																/>
// 															</Box>

// 															{/* Payslip Icon */}
// 															<Box sx={{ display: 'flex', justifyContent: 'center' }}>
// 																<Tooltip title={field.payslip?.visible ? 'Shown on payslip' : 'Hidden on payslip'}>
// 																	<IconButton
// 																		size="small"
// 																		onClick={() => openPayslipDialog(field.id)}
// 																		sx={{
// 																			'color': field.payslip?.visible ? '#4ade80' : 'rgba(255,255,255,0.3)',
// 																			'&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
// 																		}}>
// 																		{field.payslip?.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
// 																	</IconButton>
// 																</Tooltip>
// 															</Box>

// 															{/* Delete Button */}
// 															<Tooltip
// 																title="Delete field"
// 																placement="top"
// 																arrow>
// 																<IconButton
// 																	className="delete-btn"
// 																	size="small"
// 																	onClick={() => deleteField(field.id)}
// 																	sx={{
// 																		'color': 'rgba(255,255,255,0.3)',
// 																		'p': '4px',
// 																		'&:hover': {
// 																			color: '#f87171',
// 																			backgroundColor: 'rgba(248,113,113,0.1)',
// 																		},
// 																	}}>
// 																	<TrashIcon />
// 																</IconButton>
// 															</Tooltip>
// 														</Box>
// 													))}
// 												</Box>
// 											</Box>

// 											{/* Section Footer - Drag here to move field indicator */}
// 											<Box
// 												sx={{
// 													border: '1px dashed rgba(255,255,255,0.1)',
// 													borderRadius: 1,
// 													p: 1,
// 													textAlign: 'center',
// 													bgcolor: 'rgba(255,255,255,0.02)',
// 												}}
// 												onDragOver={(e) => e.preventDefault()}
// 												onDrop={(e) => {
// 													e.preventDefault();
// 													// Handle dropping field into this section
// 													if (dragId) {
// 														// You'll need to implement logic to move field to this section
// 														console.log(`Move field ${dragId} to section ${section.id}`);
// 													}
// 												}}>
// 												<Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>Drop here to move field to {section.name}</Typography>
// 											</Box>
// 										</>
// 									) : (
// 										// Empty state
// 										<Box
// 											sx={{
// 												textAlign: 'center',
// 												py: 4,
// 												border: '1px dashed rgba(255,255,255,0.1)',
// 												borderRadius: 2,
// 											}}>
// 											<Typography sx={{ color: 'rgba(255,255,255,0.3)', mb: 2, fontSize: '0.875rem' }}>No fields in this section yet</Typography>
// 											<Button
// 												variant="outlined"
// 												size="small"
// 												startIcon={<PlusIcon />}
// 												onClick={() => addField()}
// 												sx={{
// 													'borderColor': section.color,
// 													'color': section.color,
// 													'&:hover': {
// 														borderColor: section.color,
// 														backgroundColor: `${section.color}10`,
// 													},
// 												}}>
// 												Add your first field
// 											</Button>
// 										</Box>
// 									)}
// 								</Box>
// 							)}
// 						</Paper>
// 					);
// 				})}

// 				<Paper
// 					elevation={0}
// 					sx={{
// 						bgcolor: '#162033',
// 						border: '1px solid rgba(255,255,255,0.08)',
// 						borderRadius: 2,
// 						p: 2,
// 						mb: 2,
// 					}}>
// 					<Box
// 						sx={{
// 							display: 'flex',
// 							gap: '10px',
// 							px: { xs: 2, sm: 2.5 },
// 							py: 1.5,
// 							alignItems: 'center',
// 						}}>
// 						<Box
// 							sx={{
// 								width: { xs: '80%', md: '50%' },
// 								mx: 'auto',
// 								columnSpan: 11,
// 								display: 'flex',
// 								justifyContent: 'flex-end',
// 							}}>
// 							<Button
// 								variant="contained"
// 								size="large"
// 								fullWidth
// 								startIcon={<PlusIcon />}
// 								sx={{
// 									'bgcolor': '#2196f3',
// 									'&:hover': { bgcolor: '#1976d2' },
// 									'&.Mui-disabled': { bgcolor: 'rgba(33,150,243,0.3)' },
// 									'whiteSpace': 'nowrap',
// 								}}>
// 								Create Template
// 							</Button>
// 						</Box>
// 					</Box>
// 				</Paper>

// 				{/* Status Cards - Using Grid for responsive layout */}
// 				<Box
// 					sx={{
// 						display: 'grid',
// 						gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
// 						gap: 2,
// 					}}>
// 					<StatusCard
// 						icon={<InfoIcon />}
// 						iconBg="rgba(33,150,243,0.15)"
// 						title="Dynamic Mapping"
// 						subtitle="Fields are automatically synced"
// 					/>

// 					<StatusCard
// 						icon={<CheckCircleIcon />}
// 						iconBg={hasDuplicates ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)'}
// 						title={`Schema ${hasDuplicates ? 'Invalid' : 'Valid'}`}
// 						subtitle={hasDuplicates ? 'Duplicate system names found' : 'No duplicate system names found'}
// 					/>
// 				</Box>

// 				{/* Payslip Dialog */}
// 				<PayslipDialog
// 					open={payslipDialog.open}
// 					field={fields.find((f) => f.id === payslipDialog.fieldId)}
// 					sections={payslipSections}
// 					onClose={closePayslipDialog}
// 					onSave={handleSavePayslip}
// 					updateFieldPayslip={updateFieldPayslip}
// 				/>

// 				{/* Footer */}
// 				<Typography sx={{ textAlign: 'center', mt: 3, fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>
// 					© 2024 247HR Enterprise Solutions. All rights reserved. • Enterprise Payroll Management System
// 				</Typography>
// 			</Box>
// 		</Box>
// 	);
// }

// <Box
// 	component="main"
// 	sx={{
// 		width: '100%',
// 		// width: '90dvw',
// 		minHeight: '100vh',
// 		bgcolor: '#0a1929',
// 		px: { xs: 2, sm: 4, md: 6 },
// 		py: 4,
// 	}}>
// 	<Box sx={{ width: { sm: '95%', md: '95%' }, mx: 'auto' }}>
// 		{/* Template Details */}
// 		<Paper
// 			elevation={0}
// 			sx={{
// 				bgcolor: '#162033',
// 				border: '1px solid rgba(255,255,255,0.08)',
// 				borderRadius: 2,
// 				p: '20px 24px',
// 				mb: 2,
// 			}}>
// 			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
// 				<DocumentIcon />
// 				<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Template Details</Typography>
// 			</Box>

// 			<Box
// 				sx={{
// 					display: 'grid',
// 					gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
// 					gap: { xs: 2.5, sm: 2 },
// 				}}>
// 				<Box>
// 					<Typography
// 						sx={{
// 							fontSize: '0.75rem',
// 							fontWeight: 600,
// 							textTransform: 'uppercase',
// 							letterSpacing: '0.06em',
// 							color: 'rgba(255,255,255,0.7)',
// 							display: 'block',
// 							mb: 0.75,
// 						}}>
// 						Template Name
// 					</Typography>
// 					<TextField
// 						fullWidth
// 						size="small"
// 						placeholder="e.g. Monthly Salaried Full-Time"
// 						value={templateName}
// 						onChange={(e) => setTemplateName(e.target.value)}
// 						sx={inputSx()}
// 					/>
// 				</Box>
// 				<Box>
// 					<Typography
// 						sx={{
// 							fontSize: '0.75rem',
// 							fontWeight: 600,
// 							textTransform: 'uppercase',
// 							letterSpacing: '0.06em',
// 							color: 'rgba(255,255,255,0.7)',
// 							display: 'block',
// 							mb: 0.75,
// 						}}>
// 						Template Description
// 					</Typography>
// 					<TextField
// 						fullWidth
// 						size="small"
// 						placeholder="Describe the purpose and usage of this template"
// 						value={templateDesc}
// 						onChange={(e) => setTemplateDesc(e.target.value)}
// 						sx={inputSx()}
// 					/>
// 				</Box>
// 			</Box>
// 		</Paper>

// 		{/* Payslip Sections */}
// 		<Paper
// 			elevation={0}
// 			sx={{
// 				bgcolor: '#162033',
// 				border: '1px solid rgba(255,255,255,0.08)',
// 				borderRadius: 2,
// 				p: '20px 24px',
// 				mb: 2,
// 			}}>
// 			{' '}
// 			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
// 				<svg
// 					width="16"
// 					height="16"
// 					viewBox="0 0 24 24"
// 					fill="none"
// 					stroke="#2196f3"
// 					strokeWidth="2"
// 					strokeLinecap="round"
// 					strokeLinejoin="round">
// 					<path d="M4 4h16v16H4z" />
// 					<line
// 						x1="9"
// 						y1="4"
// 						x2="9"
// 						y2="20"
// 					/>
// 					<line
// 						x1="15"
// 						y1="4"
// 						x2="15"
// 						y2="20"
// 					/>
// 					<line
// 						x1="4"
// 						y1="9"
// 						x2="20"
// 						y2="9"
// 					/>
// 					<line
// 						x1="4"
// 						y1="15"
// 						x2="20"
// 						y2="15"
// 					/>
// 				</svg>
// 				<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Payslip Sections</Typography>
// 			</Box>
// 			{/* Input area for new section */}
// 			<Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
// 				<TextField
// 					size="small"
// 					placeholder="Enter section name (e.g. Bonuses, Allowances, Overtime)"
// 					value={newSectionName}
// 					onChange={(e) => setNewSectionName(e.target.value)}
// 					onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
// 					sx={{
// 						'flex': 1,
// 						'& .MuiOutlinedInput-root': {
// 							'backgroundColor': '#222b3f',
// 							'& input': { color: '#fff' },
// 							'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
// 							'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
// 							'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
// 						},
// 					}}
// 				/>
// 				<Button
// 					variant="contained"
// 					size="small"
// 					startIcon={<PlusIcon />}
// 					onClick={handleAddSection}
// 					disabled={!newSectionName.trim()}
// 					sx={{
// 						'bgcolor': '#2196f3',
// 						'&:hover': { bgcolor: '#1976d2' },
// 						'&.Mui-disabled': { bgcolor: 'rgba(33,150,243,0.3)' },
// 					}}>
// 					Add
// 				</Button>
// 			</Box>
// 			{/* Existing sections */}
// 			<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
// 				{payslipSections
// 					.sort((a, b) => a.order - b.order)
// 					.map((section) => (
// 						<Chip
// 							key={section.id}
// 							label={section.name}
// 							onDelete={() => removeSection(section.id)}
// 							sx={{
// 								'bgcolor': '#222b3f',
// 								'color': '#fff',
// 								'& .MuiChip-deleteIcon': {
// 									'color': 'rgba(255,255,255,0.4)',
// 									'&:hover': { color: '#f87171' },
// 								},
// 							}}
// 						/>
// 					))}
// 			</Box>
// 		</Paper>

// 		{/* Fields Table */}
// 		<Paper
// 			elevation={0}
// 			sx={{
// 				borderRadius: 2,
// 				overflow: 'hidden',
// 				bgcolor: '#162033',
// 				maxWidth: '93dvw',
// 				border: '0.5px solid rgba(255,255,255,0.08)',
// 				mb: 2,
// 			}}>
// 			<Box
// 				sx={{
// 					display: 'flex',
// 					justifyContent: 'space-between',
// 					alignItems: 'center',
// 					px: { xs: 2, sm: 3 },
// 					py: 2,
// 					borderBottom: '1px solid rgba(255,255,255,0.06)',
// 				}}>
// 				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
// 					<LayersIcon />
// 					<Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Fields ({fields.length})</Typography>
// 				</Box>

// 				<Box
// 					component="button"
// 					onClick={addField}
// 					sx={{
// 						'display': 'flex',
// 						'alignItems': 'center',
// 						'gap': 0.75,
// 						'background': 'none',
// 						'border': 'none',
// 						'cursor': 'pointer',
// 						'color': '#2196f3',
// 						'fontSize': '0.875rem',
// 						'fontWeight': 700,
// 						'letterSpacing': '0.015em',
// 						'px': 1.25,
// 						'py': 0.75,
// 						'borderRadius': 1,
// 						'fontFamily': 'inherit',
// 						'transition': 'background-color 0.15s',
// 						'&:hover': { backgroundColor: 'rgba(33,150,243,0.1)' },
// 					}}>
// 					<PlusIcon /> Add Field
// 				</Box>
// 			</Box>

// 			<Box
// 				sx={{
// 					'overflowX': 'auto',
// 					'WebkitOverflowScrolling': 'touch',
// 					'scrollbarWidth': 'thin',
// 					'&::-webkit-scrollbar': { height: 6 },
// 					'&::-webkit-scrollbar-thumb': { bgcolor: 'grey.700', borderRadius: '10px' },
// 					'&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
// 				}}>
// 				<Box sx={{ minWidth: { xs: '820px', sm: '940px', lg: 'auto' } }}>
// 					{/* Table Header */}
// 					<Box
// 						sx={{
// 							display: 'grid',
// 							gridTemplateColumns: GRID_COLS,
// 							gap: '10px',
// 							px: { xs: 0, sm: 2.5 },
// 							py: 1.5,
// 							bgcolor: 'hsl(219, 40%, 14%)',
// 							borderBottom: '1px solid rgba(255,255,255,0.06)',
// 							position: 'sticky',
// 							top: 0,
// 							zIndex: 10,
// 						}}>
// 						{['', 'Display Name', 'System Field', 'Data Type', 'Required', 'Aliases', 'Payslip', ''].map((h, i) => (
// 							<Typography
// 								key={i}
// 								sx={{
// 									color: 'rgba(255,255,255,0.7)',
// 									fontWeight: 600,
// 									fontSize: '0.75rem',
// 									textTransform: 'uppercase',
// 									whiteSpace: 'nowrap',
// 								}}>
// 								{h}
// 							</Typography>
// 						))}
// 					</Box>

// 					{/* Table Rows */}
// 					{fields.map((field, index) => (
// 						<Box
// 							key={field.id}
// 							draggable
// 							onDragStart={(e) => handleDragStart(e, field.id)}
// 							onDragOver={(e) => handleDragOver(e, field.id)}
// 							onDrop={(e) => handleDrop(e, field.id)}
// 							onDragEnd={() => {
// 								setDragId(null);
// 								setDragOverId(null);
// 							}}
// 							sx={{
// 								'display': 'grid',
// 								'gridTemplateColumns': GRID_COLS,
// 								'gap': '10px',
// 								'px': { xs: 0, sm: 2.5 },
// 								'py': 1.25,
// 								'alignItems': 'center',
// 								'bgcolor': dragOverId === field.id && dragId !== field.id ? '#1a2332' : '#162033',
// 								'borderBottom': index < fields.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
// 								'transition': 'background-color 0.15s',
// 								'& .drag-handle': { opacity: 0, transition: 'opacity 0.15s' },
// 								'& .delete-btn': { opacity: 0, transition: 'opacity 0.15s' },
// 								'cursor': 'default',
// 								'&:hover': { bgcolor: '#1a2332' },
// 								'&:hover .drag-handle': { opacity: 1 },
// 								'&:hover .delete-btn': { opacity: 1 },
// 							}}>
// 							{/* Drag Handle */}
// 							<Box
// 								className="drag-handle"
// 								sx={{ color: 'rgba(255,255,255,0.3)', cursor: 'grab', display: 'flex', alignItems: 'center' }}>
// 								<GripIcon />
// 							</Box>

// 							{/* Display Name */}
// 							<TextField
// 								fullWidth
// 								size="small"
// 								placeholder="Display name"
// 								value={field.displayName}
// 								onChange={(e) => updateField(field.id, 'displayName', e.target.value)}
// 								sx={inputSx()}
// 							/>

// 							{/* System Field Name */}
// 							<TextField
// 								fullWidth
// 								size="small"
// 								placeholder="system_field"
// 								value={field.systemFieldName}
// 								onChange={(e) => updateField(field.id, 'systemFieldName', e.target.value)}
// 								sx={inputSx(true)}
// 							/>

// 							{/* Data Type Select */}
// 							<FormControl
// 								fullWidth
// 								size="small">
// 								<Select
// 									value={field.dataType}
// 									onChange={(e) => updateField(field.id, 'dataType', e.target.value)}
// 									sx={{
// 										'backgroundColor': '#222b3f',
// 										'color': '#fff',
// 										'& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
// 										'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
// 										'&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
// 										'& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
// 									}}>
// 									{DATA_TYPES.map((t) => (
// 										<MenuItem
// 											key={t}
// 											value={t}>
// 											{t}
// 										</MenuItem>
// 									))}
// 								</Select>
// 							</FormControl>

// 							{/* Required Switch */}
// 							<Box sx={{ display: 'flex', justifyContent: 'center' }}>
// 								<Switch
// 									checked={field.required}
// 									onChange={(e) => updateField(field.id, 'required', e.target.checked)}
// 									sx={{
// 										'width': 36,
// 										'height': 20,
// 										'p': 0,
// 										'& .MuiSwitch-switchBase': {
// 											'p': '2px',
// 											'&.Mui-checked': {
// 												'transform': 'translateX(16px)',
// 												'color': '#fff',
// 												'& + .MuiSwitch-track': { backgroundColor: '#2196f3', opacity: 1 },
// 											},
// 										},
// 										'& .MuiSwitch-thumb': { width: 16, height: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
// 										'& .MuiSwitch-track': { borderRadius: 10, backgroundColor: '#334155', opacity: '1 !important' },
// 									}}
// 								/>
// 							</Box>

// 							{/* Aliases */}
// 							<Box
// 								sx={{
// 									'bgcolor': '#222b3f',
// 									'border': '1px solid rgba(255,255,255,0.15)',
// 									'borderRadius': 1,
// 									'px': 1,
// 									'py': '4px',
// 									'minHeight': 34,
// 									'display': 'flex',
// 									'alignItems': 'center',
// 									'flexWrap': 'wrap',
// 									'gap': 0.5,
// 									'&:focus-within': { borderColor: '#2196f3' },
// 								}}>
// 								{field.aliases?.map((alias, i) => (
// 									<Chip
// 										key={i}
// 										label={alias}
// 										size="small"
// 										onDelete={() => removeAlias(field.id, i)}
// 										sx={{
// 											'height': 20,
// 											'fontSize': 11,
// 											'fontFamily': 'monospace',
// 											'bgcolor': '#334155',
// 											'color': 'rgba(255,255,255,0.8)',
// 											'borderRadius': 1,
// 											'& .MuiChip-deleteIcon': {
// 												'fontSize': 12,
// 												'color': 'rgba(255,255,255,0.4)',
// 												'&:hover': { color: '#fff' },
// 											},
// 										}}
// 									/>
// 								))}
// 								<input
// 									type="text"
// 									placeholder="+"
// 									value={field.aliasInput || ''}
// 									onChange={(e) => updateField(field.id, 'aliasInput', e.target.value)}
// 									onKeyDown={(e) => e.key === 'Enter' && commitAlias(field.id)}
// 									onBlur={() => commitAlias(field.id)}
// 									style={{
// 										background: 'transparent',
// 										border: 'none',
// 										color: 'rgba(255,255,255,0.8)',
// 										width: '30px',
// 										outline: 'none',
// 										fontSize: '12px',
// 									}}
// 								/>
// 							</Box>

// 							{/* Payslip Icon */}
// 							<Box sx={{ display: 'flex', justifyContent: 'center' }}>
// 								<Tooltip title={field.payslip?.visible ? 'Shown on payslip' : 'Hidden on payslip'}>
// 									<IconButton
// 										size="small"
// 										onClick={() => openPayslipDialog(field.id)}
// 										sx={{
// 											'color': field.payslip?.visible ? '#4ade80' : 'rgba(255,255,255,0.3)',
// 											'&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
// 										}}>
// 										{field.payslip?.visible ? <CheckCircleIcon /> : <VisibilityOffIcon />}
// 									</IconButton>
// 								</Tooltip>
// 							</Box>

// 							{/* Delete Button */}
// 							<Tooltip
// 								title="Delete field"
// 								placement="top"
// 								arrow>
// 								<IconButton
// 									className="delete-btn"
// 									size="small"
// 									onClick={() => deleteField(field.id)}
// 									sx={{
// 										'color': 'rgba(255,255,255,0.3)',
// 										'p': '4px',
// 										'&:hover': {
// 											color: '#f87171',
// 											backgroundColor: 'rgba(248,113,113,0.1)',
// 										},
// 									}}>
// 									<TrashIcon />
// 								</IconButton>
// 							</Tooltip>
// 						</Box>
// 					))}
// 				</Box>
// 			</Box>

// 			{/* Table Footer */}
// 			<Box sx={{ textAlign: 'center', px: 3, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
// 				<Typography sx={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)' }}>
// 					Total Fields: {fields.length} • Required: {requiredCount} • System Mapped: {systemMapped}
// 				</Typography>
// 			</Box>
// 		</Paper>

// 		{/* Status Cards */}
// 		<Box
// 			sx={{
// 				display: 'grid',
// 				gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
// 				gap: { xs: 2, sm: 2.5, md: 1.5 },
// 			}}>
// 			<StatusCard
// 				icon={<InfoIcon />}
// 				iconBg="rgba(33,150,243,0.15)"
// 				title="Dynamic Mapping"
// 				subtitle="Fields are automatically synced"
// 			/>

// 			<StatusCard
// 				icon={<CheckCircleIcon />}
// 				iconBg={hasDuplicates ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)'}
// 				title={`Schema ${hasDuplicates ? 'Invalid' : 'Valid'}`}
// 				subtitle={hasDuplicates ? 'Duplicate system names found' : 'No duplicate system names found'}
// 			/>

// 			{/* <StatusCard
// 				icon={<ClockIcon />}
// 				iconBg="rgba(251,146,60,0.15)"
// 				title="Autosave Enabled"
// 				subtitle="Drafted 2 minutes ago"
// 			/> */}
// 		</Box>

// 		{/* Payslip Dialog */}
// 		<PayslipDialog
// 			open={payslipDialog.open}
// 			field={fields.find((f) => f.id === payslipDialog.fieldId)}
// 			sections={payslipSections}
// 			onClose={closePayslipDialog}
// 			onSave={handleSavePayslip}
// 			updateFieldPayslip={updateFieldPayslip}
// 		/>

// 		{/* Footer */}
// 		<Typography sx={{ textAlign: 'center', mt: 3, fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>
// 			© 2024 247HR Enterprise Solutions. All rights reserved. • Enterprise Payroll Management System
// 		</Typography>
// 	</Box>
// </Box>
