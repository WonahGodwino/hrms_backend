import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// Standard MUI components
import { Box, Typography, useTheme, useMediaQuery, OutlinedInput, InputLabel, FormControl, CircularProgress, Fade, Button, Card, Alert } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import { OtpVerificationModal } from '@/pages/Public/OtpVerificationModal';
// Import from the co-located context file
import { useAuth } from '../../lib/context/AuthContext';
import { forgotPassword, verifyOTP } from '../../services/PasswordService';
import { CompanySelectionModal } from '@/pages/Public/CompanySelectionModal';

// Inlined tokens
const tokens = () => ({
	primary: {
		100: '#d0dfff',
		500: '#135bec',
		600: '#0d4bd1',
		700: '#0938a0',
		800: '#06266f',
	},
	gray: {
		100: '#f6f6f8',
		900: '#101622',
	},
	background: {
		light: '#f6f6f8',
		dark: '#101622',
	},
});

export default function ForgotPasswordPage() {
	const [loading, setLoading] = useState(false);
	const [email, setEmail] = useState('');
	const [error, setError] = useState('');
	const [submittedEmail, setSubmittedEmail] = useState('');
	const [showOtpModal, setShowOtpModal] = useState(false);
	const [showCompanyModal, setShowCompanyModal] = useState(false);
	const [companies, setCompanies] = useState([]);
	const [selectedCompanyId, setSelectedCompanyId] = useState('');

	const navigate = useNavigate();
	const { login: contextLogin } = useAuth();

	const theme = useTheme();
	const colors = tokens(theme.palette.mode);
	const isSmall = useMediaQuery(theme.breakpoints.down('md'));
	const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');

	// Compute right panel background (darker than left)
	const rightBg = theme.palette.mode === 'dark' ? colors.background.dark : colors.primary[100];

	const validateEmail = (email) => {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!email) return 'Email is required';
		if (!emailRegex.test(email)) return 'Please enter a valid email address';
		return null;
	};

	const handleCompanySelect = async (companyId) => {
		setSelectedCompanyId(companyId);
		setSubmittedEmail(email);
		setShowOtpModal(true);
	};

	const handleForgetPassword = async (e) => {
		e.preventDefault();
		setError('');

		const validationError = validateEmail(email);
		if (validationError) {
			setError(validationError);
			return;
		}

		setLoading(true);

		try {
			await forgotPassword(email);
			setSubmittedEmail(email);
			setShowOtpModal(true);
			// setIsSubmitted(true);
		} catch (error) {
			// Handle different error cases
			let errorMessage = error.message || 'Something went wrong. Please try again.';

			if (errorMessage.toLowerCase().includes('user not found')) {
				errorMessage = 'No account found with this email address.';
			} else if (errorMessage.toLowerCase().includes('email')) {
				errorMessage = 'Please check the email address and try again.';
			}

			setError(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const handleVerifyOtp = async (otp) => {
		const payload = { email, otp };
		if (selectedCompanyId) {
			payload.companyId = selectedCompanyId;
		}

		try {
			const response = await verifyOTP(payload);

			const data = response.data.data;

			// Check if company selection is required
			if (data.requiresCompanySelection && data.companies) {
				setCompanies(data.companies);
				setShowOtpModal(false);
				setShowCompanyModal(true);
				return;
			}

			const resetToken = data.resetToken;
			const companyId = data.companyId;
			navigate(`/forgot-password/reset-password?token=${resetToken}&email=${email}&companyid=${companyId}`);
			setShowOtpModal(false);
		} catch (error) {
			setError(error.message);
		}
	};

	const handleResendOtp = async () => {
		try {
			await forgotPassword(email || submittedEmail);
			setSubmittedEmail(email);
			setShowOtpModal(true);
			// setIsSubmitted(true);
		} catch (error) {
			// Handle different error cases
			let errorMessage = error.message || 'Something went wrong. Please try again.';

			if (errorMessage.toLowerCase().includes('user not found')) {
				errorMessage = 'No account found with this email address.';
			} else if (errorMessage.toLowerCase().includes('email')) {
				errorMessage = 'Please check the email address and try again.';
			}

			setError(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Box
			component="main"
			sx={{
				maxHeight: '100vh',
				width: '100%',
				display: 'flex',
				flexDirection: { xs: 'column', lg: 'row' },
				backgroundColor: theme.palette.mode === 'dark' ? colors.background.dark : colors.background.light,
				overflowX: 'hidden',
			}}>
			{/* Left panel (brand + visual) - hidden on small screens */}
			<Box
				component="section"
				aria-hidden={isSmall}
				sx={{
					display: { xs: 'none', lg: 'flex' },
					alignItems: 'center',
					justifyContent: 'center',
					flexBasis: '50%',
					flexShrink: 0,
					boxSizing: 'border-box',
					p: 12,
					background: `linear-gradient(135deg, ${colors.primary[700]} 0%, ${colors.primary[800]} 80%)`,
					color: colors.gray[100],
				}}>
				<Box sx={{ textAlign: 'center', maxWidth: 520 }}>
					{/* Logo */}
					<Box
						component="svg"
						viewBox="0 0 24 24"
						sx={{
							height: 64,
							width: 64,
							mx: 'auto',
							mb: 3,
							color: colors.primary[500],
						}}
						aria-hidden>
						<LockResetOutlinedIcon />
					</Box>

					<Typography
						component="h1"
						variant="h4"
						fontWeight={700}
						sx={{ color: colors.gray[100], mb: 1 }}>
						Reset your password
					</Typography>

					<Typography
						variant="body1"
						sx={{ color: 'rgba(255,255,255,0.85)' }}>
						{"We'll help you regain secure access to your account."}
					</Typography>
				</Box>
			</Box>

			{/* Right panel (form) */}
			<Box
				component="section"
				aria-label="Login form"
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0,
					boxSizing: 'border-box',
					p: { xs: 4, sm: 6, lg: 8 },
					bgcolor: rightBg,
					width: { xs: '100%', lg: '50%' },
				}}>
				<Fade
					in
					timeout={prefersReduced ? 0 : 300}>
					<Box sx={{ width: '100%', maxWidth: 420 }}>
						<Card
							sx={{
								width: '100%',
								borderRadius: 3,
								bgcolor: rightBg,
								border: theme.palette.mode === 'dark' ? `1px solid rgba(255,255,255,0.03)` : `1px solid rgba(0,0,0,0.04)`,
								boxShadow: '0 8px 30px rgba(2,6,23,0.45), 0 2px 6px rgba(2,6,23,0.25)',
							}}>
							<Box
								sx={{
									p: { xs: 6, sm: 8 },
									transition: prefersReduced ? 'none' : 'all 180ms ease',
								}}>
								{/* Mobile logo */}
								<Box
									sx={{
										display: { xs: 'block', lg: 'none' },
										textAlign: 'center',
										mb: 3,
									}}>
									<Box
										component="svg"
										viewBox="0 0 24 24"
										sx={{
											height: 48,
											width: 48,
											mx: 'auto',
											color: colors.primary[500],
										}}
										aria-hidden>
										<path
											d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h5a3 3 0 013 3v1"
											stroke="currentColor"
											strokeWidth="1.6"
											strokeLinecap="round"
											strokeLinejoin="round"
											fill="none"
										/>
									</Box>
								</Box>

								<Box
									textAlign="center"
									mb={4}>
									<Typography
										variant="h3"
										fontWeight={700}
										sx={{ mb: 1 }}>
										Forgot your password?
									</Typography>

									<Typography
										variant="body2"
										color={theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(17,24,39,0.6)'}>
										Enter your email address and we’ll send you a verification code.
									</Typography>
								</Box>

								<Box
									component="form"
									onSubmit={handleForgetPassword}
									noValidate
									sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
									<Box>
										<InputLabel
											htmlFor="email"
											sx={{ fontSize: 13, fontWeight: 600 }}>
											Email
										</InputLabel>
										<FormControl
											fullWidth
											sx={{ mt: 1 }}>
											<OutlinedInput
												id="email"
												name="email"
												type="email"
												placeholder="Email address"
												autoComplete="email"
												required
												value={email}
												onChange={(e) => setEmail(e.target.value)}
												aria-invalid={Boolean(error)}
												sx={{
													'borderRadius': 2,
													'bgcolor': theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
													'& .MuiOutlinedInput-notchedOutline': {
														border: 'none',
													},
													'& .MuiOutlinedInput-input': {
														padding: '12px 14px',
														height: 44,
														boxSizing: 'border-box',
													},
													'boxShadow': 1,
												}}
											/>
										</FormControl>
									</Box>

									<Box
										sx={{
											mt: 2,
											p: 2,
											borderRadius: 2,
											border: '1px solid',
											borderColor: theme.palette.mode === 'dark' ? 'rgba(251,191,36,0.25)' : 'rgba(251,191,36,0.4)',
											bgcolor: theme.palette.mode === 'dark' ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.15)',
											display: 'flex',
											alignItems: 'flex-start',
											gap: 1.5,
										}}>
										{/* Icon */}
										<Box
											sx={{
												color: theme.palette.warning.main,
												mt: '2px',
												display: 'flex',
												alignItems: 'center',
											}}>
											<LightbulbOutlinedIcon sx={{ fontSize: 20 }} />
										</Box>

										{/* Text */}
										<Box>
											<Typography
												variant="body2"
												fontWeight={600}
												sx={{ color: theme.palette.warning.dark }}>
												What happens next?
											</Typography>
											<Typography
												variant="caption"
												sx={{
													display: 'block',
													mt: 0.5,
													color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(120,53,15,0.9)',
													lineHeight: 1.5,
												}}>
												You'll receive a 6-digit verification code via email. Use it to reset your password. The code expires in 10 minutes.
											</Typography>
										</Box>
									</Box>

									{error && (
										<Alert
											severity="error"
											sx={{ mt: 0 }}>
											{error}
										</Alert>
									)}

									<Box>
										<Button
											type="submit"
											fullWidth
											disabled={loading}
											variant="contained"
											sx={{
												'mt': 1,
												'py': 1.25,
												'borderRadius': 2,
												'fontWeight': 700,
												'textTransform': 'none',
												'backgroundColor': colors.primary[500],
												'&:hover': {
													backgroundColor: colors.primary[600],
												},
											}}>
											{loading ? (
												<>
													<CircularProgress
														size={18}
														sx={{ color: 'white', mr: 1 }}
													/>
													Request OTP
												</>
											) : (
												'Request OTP'
											)}
										</Button>
									</Box>

									<Box
										textAlign="center"
										sx={{ mt: 3 }}>
										<Typography
											variant="body2"
											color="text.secondary">
											Remembered your password?{' '}
											<Link
												to="/login"
												style={{ color: colors.primary[500], fontWeight: 600 }}>
												Login
											</Link>
										</Typography>
									</Box>
								</Box>
							</Box>
						</Card>
					</Box>
				</Fade>
			</Box>

			<OtpVerificationModal
				open={showOtpModal}
				onOpenChange={setShowOtpModal}
				onVerify={handleVerifyOtp}
				onResend={handleResendOtp}
				email={submittedEmail}
			/>

			<CompanySelectionModal
				open={showCompanyModal}
				onOpenChange={setShowCompanyModal}
				companies={companies}
				onSelect={handleCompanySelect}
				loading={loading}
			/>
		</Box>
	);
}
