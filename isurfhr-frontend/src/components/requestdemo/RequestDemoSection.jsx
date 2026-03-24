import { useState } from 'react';
import {
	Box,
	Container,
	Grid,
	Typography,
	TextField,
	Button,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	FormControlLabel,
	Checkbox,
	RadioGroup,
	Radio,
	Link,
	Paper,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useInView } from 'react-intersection-observer';
import { keyframes } from '@emotion/react';

const fadeUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const fadeInLeft = keyframes`
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const fadeInRight = keyframes`
  from {
    opacity: 0;
    transform: translateX(40px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
`;

const features = ['Centralized operations', 'Automated payroll management', 'Enterprise-grade security', 'Scalable visibility for global teams'];

const companySizes = ['1–10 employees', '11–50 employees', '51–200 employees', '201–500 employees', '501–1000 employees', '1000+ employees'];

const hrFunctions = [
	// 'Recruitment',
	'Payroll',
	// 'Compliance',
	// 'Attendance',
	'Staff Management',
	// 'Full HR Suite'
];

const currentHROptions = ['Yes', 'No', 'Spreadsheets'];

export function RequestDemoSection() {
	const [form, setForm] = useState({
		firstName: '',
		lastName: '',
		workEmail: '',
		phone: '',
		companyName: '',
		jobTitle: '',
		companySize: '',
		hrFunctions: [],
		currentHRSystem: '',
		message: '',
	});

	const [leftRef, leftInView] = useInView({ threshold: 0.2, triggerOnce: true });
	const [formRef, formInView] = useInView({ threshold: 0.1, triggerOnce: true });

	const handleTextChange = (field) => (e) => {
		setForm((prev) => ({ ...prev, [field]: e.target.value }));
	};

	const handleCheckbox = (value) => {
		setForm((prev) => {
			const current = prev.hrFunctions;
			return {
				...prev,
				hrFunctions: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
			};
		});
	};

	const handleSubmit = () => {
		console.log('Form submitted:', form);
	};

	// Shared input sx for consistent styling
	const inputSx = {
		'& .MuiOutlinedInput-root': {
			'borderRadius': 1,
			'bgcolor': 'white',
			'fontSize': '0.9rem',
			'color': 'black',
			'& fieldset': {
				borderColor: '#e2e8f0',
				color: 'primary.main',
			},
			'&:hover fieldset': {
				borderColor: '#94a3b8',
			},
			'&.Mui-focused fieldset': {
				borderColor: 'primary.main',
				color: 'primary.main',
				borderWidth: 1.5,
			},
		},
		'& .MuiInputLabel-root': {
			fontSize: '0.85rem',
			fontWeight: 600,
			color: '#475569',
		},
		'& .MuiInputLabel-root.Mui-focused': {
			color: 'primary.main',
		},
	};

	return (
		<Box
			component="section"
			sx={{
				minHeight: { xs: 'auto', md: '100dvh' },
				position: 'relative',
				display: 'flex',
				alignItems: 'center',
				py: { xs: 8, md: 10 },
				overflow: 'hidden',
			}}>
			{/* Background Image */}
			<Box
				sx={{
					position: 'absolute',
					inset: 0,
					backgroundImage: 'url(/request-demo-image_3.webp)',
					backgroundSize: 'cover',
					backgroundPosition: '40% 40%',
					backgroundRepeat: 'no-repeat',
					zIndex: 0,
				}}
			/>
			{/* Overlay gradient - left side readable, right side subtle */}
			{/* <Box
				sx={{
					position: 'absolute',
					inset: 0,
					background: {
						xs: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.45) 100%)',
						md: 'linear-gradient(to right, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.10) 100%)',
					},
					zIndex: 1,
				}}
			/> */}

			<Container
				maxWidth={false}
				sx={{
					width: { xs: '95%', md: '90%' },
					margin: '0 auto',
					position: 'relative',
					zIndex: 2,
				}}>
				<Grid
					container
					spacing={{ xs: 4, md: 2 }}
					alignItems="flex-start">
					{/* ─── LEFT COLUMN — Copy ─── */}
					<Grid
						item
						size={{ xs: 12, md: 6 }}
						ref={leftRef}>
						<Box
							sx={{
								opacity: leftInView ? 1 : 0,
								animation: leftInView ? `${fadeInLeft} 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards` : 'none',
							}}>
							<Typography
								component="h1"
								sx={{
									fontWeight: 800,
									fontSize: { xs: '2rem', sm: '2.4rem', xl: '3.4rem' },
									color: { xs: 'white', md: '#475569' },
									lineHeight: 1.1,
									mb: 3,
								}}>
								Request a{' '}
								<Box
									component="span"
									sx={{
										display: 'block',
									}}>
									Personalized{' '}
									<Box
										component="span"
										sx={{
											color: 'primary.main',
											display: 'inline',
										}}>
										247HR
									</Box>
								</Box>
								<Box
									component="span"
									sx={{
										color: 'primary.main',
									}}>
									Demo
								</Box>
							</Typography>

							<Typography
								variant="body1"
								sx={{
									color: { xs: 'white', md: '#475569' },
									// color: 'rgba(255,255,255,0.80)',
									fontSize: { xs: '0.8rem', sm: '0.95rem', md: '1rem', xl: '1.1rem' },
									lineHeight: 1.7,
									mb: 4,
									maxWidth: 420,
								}}>
								Unify your entire HR ecosystem with centralized operations and automated payroll. Experience the future of workforce management.
							</Typography>
						</Box>

						{/* Feature list */}
						<Box
							sx={{
								display: 'flex',
								flexDirection: 'column',
								gap: 1.8,
							}}>
							{features.map((feature, index) => (
								<Box
									key={feature}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1.5,
										opacity: leftInView ? 1 : 0,
										animation: leftInView ? `${fadeUp} 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${0.2 + index * 0.1}s forwards` : 'none',
									}}>
									<Box
										component="span"
										sx={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											bgcolor: 'rgba(33, 150, 243, 0.07)',
											borderRadius: '50%',
											width: 36,
											height: 36,
											flexShrink: 0,
										}}>
										<CheckCircleOutlineIcon
											sx={{
												color: 'primary.main',
												fontSize: 22,
											}}
										/>
									</Box>
									<Typography
										sx={{
											color: { xs: 'white', md: '#475569' },
											// color: 'rgba(255,255,255,0.90)',
											fontSize: { xs: '0.8rem', sm: '0.95rem', md: '1rem' },
											fontWeight: 500,
										}}>
										{feature}
									</Typography>
								</Box>
							))}
						</Box>
					</Grid>

					{/* ─── RIGHT COLUMN — Form Card ─── */}
					<Grid
						item
						size={{ xs: 12, md: 6 }}
						ref={formRef}>
						<Paper
							elevation={0}
							sx={{
								borderRadius: 2,
								bgcolor: 'rgba(255, 255, 255, 0.75)',
								backdropFilter: 'blur(2px)',
								border: '1px solid rgba(255,255,255,0.5)',
								p: { xs: 3, md: 4 },
								boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.15)',
								opacity: formInView ? 1 : 0,
								animation: formInView ? `${fadeInRight} 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.15s forwards` : 'none',
							}}>
							{/* Row 1: First + Last Name */}
							<Grid
								container
								spacing={2}
								sx={{ mb: 2 }}>
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<TextField
										label="First Name *"
										placeholder="Jane"
										fullWidth
										value={form.firstName}
										onChange={handleTextChange('firstName')}
										size="small"
										sx={inputSx}
									/>
								</Grid>
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<TextField
										label="Last Name *"
										placeholder="Doe"
										fullWidth
										value={form.lastName}
										onChange={handleTextChange('lastName')}
										size="small"
										sx={inputSx}
									/>
								</Grid>
							</Grid>

							{/* Row 2: Work Email + Phone */}
							<Grid
								container
								spacing={2}
								sx={{ mb: 2 }}>
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<TextField
										label="Email *"
										placeholder="jane@company.com"
										type="email"
										fullWidth
										value={form.workEmail}
										onChange={handleTextChange('workEmail')}
										size="small"
										sx={inputSx}
									/>
								</Grid>
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<TextField
										label="Phone *"
										placeholder="+1 (555) 000-0000"
										fullWidth
										value={form.phone}
										onChange={handleTextChange('phone')}
										size="small"
										sx={inputSx}
									/>
								</Grid>
							</Grid>

							{/* Row 3: Company + Job Title */}
							<Grid
								container
								spacing={2}
								sx={{ mb: 2 }}>
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<TextField
										label="Company Name *"
										placeholder="Acme Inc."
										fullWidth
										value={form.companyName}
										onChange={handleTextChange('companyName')}
										size="small"
										sx={inputSx}
									/>
								</Grid>
								<Grid
									item
									size={{ xs: 12, sm: 6 }}>
									<TextField
										label="Job Title *"
										placeholder="HR Director"
										fullWidth
										value={form.jobTitle}
										onChange={handleTextChange('jobTitle')}
										size="small"
										sx={inputSx}
									/>
								</Grid>
							</Grid>

							{/* Company Size */}
							<FormControl
								fullWidth
								size="small"
								sx={{
									...inputSx,
									mb: 2.5,
								}}>
								<InputLabel>Company Size *</InputLabel>
								<Select
									label="Company Size *"
									value={form.companySize}
									onChange={(e) => setForm((prev) => ({ ...prev, companySize: e.target.value }))}
									sx={{
										'borderRadius': 1,
										'bgcolor': 'white',
										'fontSize': '0.9rem',
										'& .MuiOutlinedInput-notchedOutline': {
											borderColor: '#e2e8f0',
										},
										'&:hover .MuiOutlinedInput-notchedOutline': {
											borderColor: '#94a3b8',
										},
										'&.Mui-focused .MuiOutlinedInput-notchedOutline': {
											borderColor: 'primary.main',
											borderWidth: 1.5,
										},
									}}>
									<MenuItem
										value=""
										disabled>
										Select Company Size
									</MenuItem>
									{companySizes.map((size) => (
										<MenuItem
											key={size}
											value={size}
											sx={{ fontSize: '0.9rem' }}>
											{size}
										</MenuItem>
									))}
								</Select>
							</FormControl>

							{/* HR Functions Checkboxes */}
							<Box sx={{ mb: 2.5 }}>
								<Typography
									sx={{
										fontSize: '0.85rem',
										fontWeight: 600,
										color: '#475569',
										mb: 1.2,
									}}>
									What HR functions are you interested in? *
								</Typography>
								<Box
									sx={{
										display: 'grid',
										gridTemplateColumns: {
											xs: '1fr',
											sm: '1fr',
											md: '1fr 1fr',
										},
										columnGap: 1,
										rowGap: 1,
										overflow: 'hidden',
									}}>
									{hrFunctions.map((fn, index) => (
										<Box
											key={fn}
											sx={{
												'borderRadius': 1,
												'px': 1.5,
												'py': 1.5,
												'border': '1px solid #fff',
												'transition': 'bgcolor 0.2s ease',
												'&:hover': {
													bgcolor: 'rgba(255,255,255,0.25)',
												},
											}}>
											<FormControlLabel
												control={
													<Checkbox
														size="small"
														checked={form.hrFunctions.includes(fn)}
														onChange={() => handleCheckbox(fn)}
														sx={{
															'paddingX': '10px',
															'paddingY': '3px',

															// Unchecked: white background + white border
															'& .MuiSvgIcon-root': {
																fontSize: 16,
																backgroundColor: '#ffffff', // white bg
																borderRadius: '6px',
																padding: '2px', // slight inner space
																boxSizing: 'content-box',
															},

															// Make unchecked border white
															'color': '#ffffff',

															// Checked: switch to primary (MUI handles fill automatically)
															'&.Mui-checked .MuiSvgIcon-root': {
																backgroundColor: 'primary.main',
																color: '#ffffff',
															},

															// Optional hover
															'&:hover .MuiSvgIcon-root': {
																backgroundColor: 'rgba(255, 255, 255, 0.65)',
															},
															'&.Mui-checked:hover .MuiSvgIcon-root': {
																backgroundColor: 'primary.main',
																opacity: 0.9,
															},
														}}
													/>
												}
												label={<Typography sx={{ fontSize: '0.875rem', color: 'black' }}>{fn}</Typography>}
											/>
										</Box>
									))}
								</Box>
							</Box>

							{/* Current HR System */}
							<Box sx={{ mb: 2.5 }}>
								<Typography
									sx={{
										fontSize: '0.85rem',
										fontWeight: 600,
										color: '#475569',
										mb: 0.8,
									}}>
									Do you currently use an HR system? *
								</Typography>

								<RadioGroup
									row
									value={form.currentHRSystem}
									onChange={(e) => setForm((prev) => ({ ...prev, currentHRSystem: e.target.value }))}
									sx={{ gap: 1 }}>
									{currentHROptions.map((opt) => (
										<FormControlLabel
											key={opt}
											value={opt}
											control={
												<Radio
													size="small"
													sx={{
														'color': '#ffffff',
														'& .MuiSvgIcon-root': {
															backgroundColor: '#ffffff',
															borderRadius: '50%',
															padding: '2px',
															boxSizing: 'content-box',
															fontSize: 10,
														},
														'&.Mui-checked': {
															color: 'primary.main',
														},
														'&.Mui-checked .MuiSvgIcon-root': {
															backgroundColor: 'primary.main',
															color: '#ffffff',
														},
														'&:hover': {
															bgcolor: 'rgba(255,255,255,0.12)',
														},
														'&.Mui-checked:hover': {
															bgcolor: 'rgba(25,118,210,0.06)',
														},
													}}
												/>
											}
											label={<Typography sx={{ fontSize: '0.875rem', color: 'black' }}>{opt}</Typography>}
										/>
									))}
								</RadioGroup>
							</Box>

							{/* Optional Message */}
							<TextField
								label="Optional Message"
								placeholder="Tell us about your specific requirements..."
								fullWidth
								multiline
								rows={3}
								value={form.message}
								onChange={handleTextChange('message')}
								sx={{
									...inputSx,
									mb: 3,
								}}
							/>

							{/* Submit Button */}
							<Button
								variant="contained"
								color="primary"
								fullWidth
								size="large"
								onClick={handleSubmit}
								sx={{
									'borderRadius': 1,
									'py': { xs: 1, md: 1.6 },
									'fontWeight': 700,
									'fontSize': { xs: '0.8rem', md: '1rem' },
									'textTransform': 'none',
									'letterSpacing': '0.02em',
									'boxShadow': '0 8px 20px -6px rgba(33, 150, 243, 0.5)',
									'position': 'relative',
									'overflow': 'hidden',
									'mb': 2,
									'&::after': {
										content: '""',
										position: 'absolute',
										top: 0,
										left: '-100%',
										width: '100%',
										height: '100%',
										background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
										transition: 'left 0.5s ease',
									},
									'&:hover': {
										'boxShadow': '0 14px 28px -6px rgba(33, 150, 243, 0.55)',
										'transform': 'translateY(-2px)',
										'&::after': {
											left: '100%',
										},
									},
									'transition': 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
								}}>
								Request My Personalized Demo
							</Button>

							{/* Legal copy */}
							<Typography
								variant="caption"
								sx={{
									display: 'block',
									textAlign: 'center',
									color: { xs: 'black', md: 'grey.500' },
									fontSize: '0.75rem',
									lineHeight: 1.6,
								}}>
								By submitting this form, you agree to our{' '}
								<Link
									href="/privacy-policy"
									underline="hover"
									sx={{ color: 'primary.main', fontWeight: 500 }}>
									Privacy Policy
								</Link>{' '}
								and{' '}
								<Link
									href="/terms-of-service"
									underline="hover"
									sx={{ color: 'primary.main', fontWeight: 500 }}>
									Terms of Service
								</Link>
								. We will never share your email with third parties.
							</Typography>
						</Paper>
					</Grid>
				</Grid>
			</Container>
		</Box>
	);
}
