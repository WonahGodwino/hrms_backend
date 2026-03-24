import { useAuth } from '@/lib/context/AuthContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	Box,
	Typography,
	Button,
	Stack,
	Alert,
	Snackbar,
	CircularProgress,
	Tooltip,
	Select,
	MenuItem,
	FormControl,
	TextField,
	TableContainer,
	Paper,
	Table,
	TableHead,
	TableBody,
	TableRow,
	TableCell,
	Avatar,
	IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { TemplateCards } from './TemplateCard';

const NEWEST_TEMPLATES = [
	{ id: 1, title: 'User Research', status: 'DRAFT', date: '16th Feb 2026', icon: 'shield' },
	{ id: 2, title: 'User Research', status: null, date: '16th Feb 2026', icon: 'doc' },
	{ id: 3, title: 'User Research', status: 'DRAFT', date: '15th Feb 2026', icon: 'shield' },
	{ id: 4, title: 'User Research', status: null, date: '16th Feb 2026', icon: 'doc' },
	// { id: 5, title: 'User Research', status: null, date: '16th Feb 2026', icon: 'doc' },
	// { id: 6, title: 'User Research', status: null, date: '16th Feb 2026', icon: 'doc' },
	// { id: 7, title: 'User Research', status: null, date: '16th Feb 2026', icon: 'doc' },
	// { id: 8, title: 'User Research', status: null, date: '17th Feb 2026', icon: 'doc' },
	// { id: 9, title: 'User Research', status: null, date: '17th Feb 2026', icon: 'doc' },
	// { id: 10, title: 'User Research', status: null, date: '17th Feb 2026', icon: 'doc' },
];

const OLDER_TEMPLATES = [
	{ id: 1, initials: 'NI', color: '#2196f3', name: 'Nexus Innovations', code: '#COMP-001', owner: 'me', date: 'Oct 24, 2023' },
	{ id: 2, initials: 'GL', color: '#9c27b0', name: 'Global Logistics', code: '#COMP-002', owner: 'admin', date: 'Sep 12, 2023' },
	{ id: 3, initials: 'SF', color: '#ff9800', name: 'Summit Financial', code: '#COMP-003', owner: 'me', date: 'Aug 05, 2023' },
	{ id: 4, initials: 'AH', color: '#4caf50', name: 'Alpha Health', code: '#COMP-004', owner: 'me', date: 'Nov 15, 2023' },
	{ id: 5, initials: 'UR', color: '#f44336', name: 'Urban Retailers', code: '#COMP-005', owner: 'admin', date: 'Dec 01, 2023' },
];

const rows = [
	{
		name: 'Nexus Innovations',
		initials: 'NI',
		color: '#1976d2', // blue
		id: '#COMP-001',
		owner: 'mex',
		date: 'Oct 24, 2023',
		ownedByMe: true,
	},
	{
		name: 'Global Logistics',
		initials: 'GL',
		color: '#9c27b0', // purple
		id: '#COMP-002',
		owner: 'admin',
		date: 'Sep 12, 2023',
		ownedByMe: false,
	},
	{
		name: 'Summit Financial',
		initials: 'SF',
		color: '#f57c00', // orange
		id: '#COMP-003',
		owner: 'me',
		date: 'Aug 05, 2023',
		ownedByMe: true,
	},
	{
		name: 'Alpha Health',
		initials: 'AH',
		color: '#2e7d32', // green
		id: '#COMP-004',
		owner: 'me',
		date: 'Nov 15, 2023',
		ownedByMe: true,
	},
	{
		name: 'Urban Retailers',
		initials: 'UR',
		color: '#d32f2f', // red
		id: '#COMP-005',
		owner: 'admin',
		date: 'Dec 01, 2023',
		ownedByMe: false,
	},
];

// ─── Dashboard Body ───────────────────────────────────────────────────────────
function TemplateDashboardBody() {
	const [search, setSearch] = useState('');
	const [view, setView] = useState('Timeline');
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState(10);

	const totalItems = 1240;
	const totalPages = 12;
	const startItem = (page - 1) * rowsPerPage + 1;
	const endItem = Math.min(page * rowsPerPage, totalItems);

	const filtered = OLDER_TEMPLATES.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase()));

	return (
		<Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
			<Box>
				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						mb: 2,
					}}>
					<Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>Older Templates</Typography>

					<FormControl size="small">
						<Select
							value={view}
							onChange={(e) => setView(e.target.value)}
							IconComponent={KeyboardArrowDownIcon}
							startAdornment={<CalendarTodayIcon sx={{ fontSize: 14, color: '#64748b', mr: 0.8 }} />}
							renderValue={(val) => <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>{val}</Typography>}
							sx={{
								'height': 34,
								'bgcolor': '#111827',
								'border': '1px solid rgba(255,255,255,0.1)',
								'borderRadius': '8px',
								'color': '#94a3b8',
								'& .MuiOutlinedInput-notchedOutline': { border: 'none' },
								'& .MuiSelect-icon': { color: '#64748b', fontSize: 18 },
								'& .MuiSelect-select': { pr: '28px !important', pl: 0.5 },
							}}>
							<MenuItem value="Timeline">Timeline</MenuItem>
							<MenuItem value="List">List</MenuItem>
							<MenuItem value="Grid">Grid</MenuItem>
						</Select>
					</FormControl>
				</Box>

				<Box
					sx={{
						px: 3,
						py: '16px',
						mb: 2,
						bgcolor: '#111827',
						border: '1px solid rgba(255,255,255,0.08)',
						borderRadius: '25px',
					}}>
					<Box sx={{ flexGrow: 1 }}>
						<TextField
							fullWidth
							placeholder="Search by name, email, or ID..."
							size="small"
							// value={searchTerm}
							onChange={(e) => {
								// setPagination((prev) => ({ ...prev, page: 1 })); // Reset page on new search
								// setSearchTerm(e.target.value);
							}}
							InputProps={{
								startAdornment: <SearchIcon sx={{ mr: 1, fontSize: 17, opacity: 1, color: 'rgba(255,255,255,0.5)' }} />,
								sx: {
									// 'bgcolor': '#222b3f',
									'background': '#25303B',

									'borderRadius': 1,
									'borderWidth': '0px',
									'& .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.15)',
									},
									'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
										borderColor: 'rgba(255,255,255,0.08)',
									},
									'color': '#fff',
									'maxWidth': 400,
								},
							}}
							sx={{
								'& .MuiInputBase-input::placeholder': {
									color: 'rgba(255,255,255,0.5)',
									opacity: 1,
								},
							}}
						/>
					</Box>
				</Box>

				<Box sx={{ width: '100%' }}>
					<TableContainer
						component={Paper}
						sx={{ borderRadius: 2, overflow: 'hidden' }}>
						<Table sx={{ minWidth: 650 }}>
							<TableHead>
								<TableRow sx={{ bgcolor: '#1e293b' }}>
									<TableCell sx={{ color: '#aaa', fontWeight: 600, pl: 3 }}>TEMPLATE NAME</TableCell>
									<TableCell sx={{ color: '#aaa', fontWeight: 600 }}>OWNED BY ME</TableCell>
									<TableCell sx={{ color: '#aaa', fontWeight: 600 }}>DATE CREATED</TableCell>
									<TableCell
										align="right"
										sx={{ color: '#aaa', fontWeight: 600, pr: 3 }}>
										ACTIONS
									</TableCell>
								</TableRow>
							</TableHead>

							<TableBody>
								{rows.map((row) => (
									<TableRow
										key={row.id}
										sx={{ bgcolor: '#222D37' }}>
										<TableCell sx={{ pl: 3 }}>
											<Stack
												variant="body2"
												direction="row"
												spacing={2}
												alignItems="center">
												<Avatar
													sx={{
														bgcolor: row.color,
														fontSize: '0.9rem',
														fontWeight: 'bold',
														width: 42,
														height: 42,
													}}>
													{row.initials}
												</Avatar>
												<Box>
													<Typography
														variant="body2"
														fontWeight={500}>
														{row.name}
													</Typography>
													<Typography
														variant="caption"
														sx={{ color: '#888' }}>
														ID: {row.id}
													</Typography>
												</Box>
											</Stack>
										</TableCell>

										<TableCell>
											<Typography
												variant="body2"
												sx={{ color: row.ownedByMe ? '#66bb6a' : '#ff9800' }}>
												{row.ownedByMe ? 'me' : row.owner}
											</Typography>
										</TableCell>

										<TableCell>
											<Typography
												variant="body2"
												sx={{ color: '#bbb' }}>
												{row.date}
											</Typography>
										</TableCell>

										<TableCell
											align="right"
											sx={{ pr: 2 }}>
											<IconButton size="small">
												<MoreVertIcon
													fontSize="small"
													sx={{ color: '#888' }}
												/>
											</IconButton>
										</TableCell>
									</TableRow>
								))}
								<TableRow sx={{ bgcolor: '#222D37' }}>
									<TableCell
										colSpan={4}
										sx={{ p: 0, borderBottom: 'none' }}>
										<Box
											sx={{
												width: '100%',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'space-between',
												py: 2,
												px: 3,
												flexWrap: 'wrap',
												gap: 2,
											}}>
											<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
												<Typography
													sx={{
														fontSize: '0.78rem',
														color: 'white',
														whiteSpace: 'nowrap',
													}}>
													Rows per page:
												</Typography>

												<Select
													value={rowsPerPage}
													onChange={(e) => {
														setRowsPerPage(e.target.value);
														setPage(1);
													}}
													size="small"
													IconComponent={KeyboardArrowDownIcon}
													sx={{
														'height': 28,
														'fontSize': '0.78rem',
														'color': '#94a3b8',
														'bgcolor': '#222D37',
														'border': '1px solid rgba(255,255,255,0.1)',
														'borderRadius': '6px',
														'& .MuiOutlinedInput-notchedOutline': { border: 'none' },
														'& .MuiSelect-icon': { color: '#64748b', fontSize: 16 },
													}}>
													{[5, 10, 25, 50].map((n) => (
														<MenuItem
															key={n}
															value={n}
															sx={{ fontSize: '0.78rem' }}>
															{n}
														</MenuItem>
													))}
												</Select>

												<Typography
													sx={{
														fontSize: '0.78rem',
														color: 'white',
														whiteSpace: 'nowrap',
													}}>
													Showing {startItem}–{endItem} of {totalItems.toLocaleString()}
												</Typography>
											</Box>

											<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
												<IconButton
													size="small"
													disabled={page === 1}
													onClick={() => setPage((p) => Math.max(1, p - 1))}
													sx={{
														'width': 28,
														'height': 28,
														'fontSize': '0.85rem',
														'color': page === 1 ? '#334155' : '#64748b',
														'&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
													}}>
													{'<'}
												</IconButton>

												{[1, 2, 3].map((n) => (
													<IconButton
														key={n}
														size="small"
														onClick={() => setPage(n)}
														sx={{
															'width': 28,
															'height': 28,
															'fontSize': '0.78rem',
															'fontWeight': 600,
															'color': page === n ? '#fff' : '#64748b',
															'bgcolor': page === n ? '#2196f3' : 'transparent',
															'borderRadius': '50%',
															'&:hover': {
																bgcolor: page === n ? '#2196f3' : 'rgba(255,255,255,0.05)',
															},
														}}>
														{n}
													</IconButton>
												))}

												<Typography sx={{ fontSize: '0.78rem', color: '#475569', px: 0.3 }}>…</Typography>

												<IconButton
													size="small"
													onClick={() => setPage(totalPages)}
													sx={{
														'width': 28,
														'height': 28,
														'fontSize': '0.78rem',
														'fontWeight': 600,
														'color': page === totalPages ? '#fff' : '#64748b',
														'bgcolor': page === totalPages ? '#2196f3' : 'transparent',
														'borderRadius': '50%',
														'&:hover': {
															bgcolor: page === totalPages ? '#2196f3' : 'rgba(255,255,255,0.05)',
														},
													}}>
													{totalPages}
												</IconButton>

												<IconButton
													size="small"
													disabled={page === totalPages}
													onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
													sx={{
														'width': 28,
														'height': 28,
														'fontSize': '0.85rem',
														'color': page === totalPages ? '#334155' : '#64748b',
														'&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
													}}>
													{'>'}
												</IconButton>
											</Box>
										</Box>
									</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</TableContainer>
				</Box>
			</Box>
		</Box>
	);
}

export default function TemplateDashboard() {
	const { user } = useAuth();
	const role = user?.role || 'STAFF';
	const navigate = useNavigate();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

	if (loading) {
		return (
			<Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<CircularProgress color="primary" />
			</Box>
		);
	}

	const handleSnackbarClose = () => setSnackbar({ ...snackbar, open: false });

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
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				justifyContent="space-between"
				alignItems={{ xs: 'flex-start' }}
				spacing={2}
				sx={{ mb: 4 }}>
				<Typography
					variant="h4"
					fontWeight={700}
					color="white">
					Template Management
				</Typography>

				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
						alignItems: { sm: 'center' },
						justifyContent: { sm: 'flex-end' },
						gap: 2,
						width: { xs: 'auto', md: 'auto' },
					}}>
					{['HR', 'ADMIN', 'STAFF', 'SUPER_ADMIN'].includes(role) && (
						<Tooltip title="Create a Template">
							<Button
								variant="contained"
								startIcon={<AddIcon />}
								onClick={() => navigate('/templates/create')}
								sx={{
									'height': 40,
									'px': 2,
									'borderRadius': 1,
									'backgroundColor': '#2196f3',
									'color': '#ffffff',
									'fontWeight': 700,
									'textTransform': 'none',
									'letterSpacing': '0.015em',
									'boxShadow': 'none',
									'&:hover': { backgroundColor: '#1976d2', boxShadow: 'none' },
								}}>
								New Template
							</Button>
						</Tooltip>
					)}
				</Box>
			</Stack>

			{error && (
				<Alert
					severity="error"
					sx={{ mb: 3 }}
					onClose={() => setError('')}>
					{error}
				</Alert>
			)}

			<TemplateCards />
			<TemplateDashboardBody />

			{/* Global Snackbar */}
			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={handleSnackbarClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
				<Alert
					onClose={handleSnackbarClose}
					severity={snackbar.severity}
					sx={{ width: '100%' }}>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</Box>
	);
}
