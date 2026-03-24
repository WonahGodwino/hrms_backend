import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
// Standard MUI components
import {
	Box,
	Typography,
	useTheme,
	useMediaQuery,
	OutlinedInput,
	InputLabel,
	FormControl,
	InputAdornment,
	IconButton,
	CircularProgress,
	Fade,
	Button,
	Card,
	Alert,
} from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
// Import from the co-located context file
import { useAuth } from '../../lib/context/AuthContext';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { resetPassword } from '../../services/PasswordService';

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

export default function ResetPasswordPage() {
	const [urlValid, setUrlValid] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');

	const navigate = useNavigate();
	const { login: contextLogin } = useAuth();
	const [searchParams] = useSearchParams();

	useEffect(() => {
		const token = searchParams.get('token');
		const email = searchParams.get('email');
		const companyId = searchParams.get('companyid') || searchParams.get('companyId');

		if (!token || !email || !companyId) {
			setUrlValid(false);
			return;
		}

		setUrlValid(true);
	}, [searchParams]);

	const theme = useTheme();
	const colors = tokens(theme.palette.mode);
	const isSmall = useMediaQuery(theme.breakpoints.down('md'));
	const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');

	// Compute right panel background (darker than left)
	const rightBg = theme.palette.mode === 'dark' ? colors.background.dark : colors.primary[100];

	// password visibility
	const handleClickShowPassword = () => setShowPassword((s) => !s);
	const handleClickShowConfirmPassword = () => setShowConfirmPassword((s) => !s);

	const handleResetPassword = async (e) => {
		e.preventDefault();
		const token = searchParams.get('token');
		const email = searchParams.get('email');
		const companyId = searchParams.get('companyid') || searchParams.get('companyId');

		const payload = {
			email,
			otp: token,
			newPassword: password,
			confirmPassword,
			companyId,
		};

		try {
			setLoading(true);
			await resetPassword(payload);
			navigate(`/login`);
		} catch (error) {
			setError(error.message || 'Something went wrong, please try again');
		} finally {
			setLoading(false);
		}
	};

	return (
		<Box
			component="main"
			sx={{
				minHeight: '100dvh',
				width: '100%',
				display: 'flex',
				flexDirection: { xs: 'column', lg: 'row' },
				backgroundColor: theme.palette.mode === 'dark' ? colors.background.dark : colors.background.light,
				overflowX: 'hidden',
			}}>
			{/* Left panel */}
			<Box
				component="section"
				aria-hidden={isSmall}
				sx={{
					display: { xs: 'none', lg: 'flex' },
					alignItems: 'center',
					justifyContent: 'center',
					flexBasis: '50%',
					p: 12,
					background: `linear-gradient(135deg, ${colors.primary[700]} 0%, ${colors.primary[800]} 80%)`,
					color: colors.gray[100],
				}}>
				<Box sx={{ textAlign: 'center', maxWidth: 520 }}>
					<LockResetOutlinedIcon sx={{ fontSize: 64, mb: 3 }} />
					<Typography
						variant="h4"
						fontWeight={700}
						mb={1}>
						Set a new password
					</Typography>
					<Typography sx={{ opacity: 0.85 }}>Choose a strong password to secure your account.</Typography>
				</Box>
			</Box>

			{/* Right panel */}
			<Box
				component="section"
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					p: { xs: 4, sm: 6, lg: 8 },
					width: { xs: '100%', lg: '50%' },
					bgcolor: rightBg,
				}}>
				<Fade
					in
					timeout={prefersReduced ? 0 : 300}>
					<Box sx={{ width: '100%', maxWidth: 420 }}>
						<Card
							sx={{
								borderRadius: 3,
								boxShadow: '0 8px 30px rgba(2,6,23,0.45), 0 2px 6px rgba(2,6,23,0.25)',
								bgcolor: rightBg,
							}}>
							<Box sx={{ p: { xs: 6, sm: 8 } }}>
								{/* INVALID TOKEN STATE */}
								{!urlValid ? (
									<>
										<Typography
											variant="h4"
											fontWeight={700}
											mb={1}>
											Invalid or expired link
										</Typography>

										<Typography
											variant="body2"
											color="text.secondary"
											mb={4}>
											This password reset link is no longer valid. Please request a new one.
										</Typography>

										<Alert
											severity="warning"
											sx={{ mb: 3 }}>
											For security reasons, reset links expire after a short time.
										</Alert>

										<Button
											fullWidth
											variant="contained"
											onClick={() => navigate('/forgot-password')}
											sx={{
												py: 1.25,
												borderRadius: 2,
												fontWeight: 700,
												textTransform: 'none',
											}}>
											Request new reset link
										</Button>
									</>
								) : (
									<>
										{/* VALID TOKEN STATE */}
										<Box
											textAlign="center"
											mb={4}>
											<Typography
												variant="h3"
												fontWeight={700}
												mb={1}>
												Create a new password
											</Typography>
											<Typography
												variant="body2"
												color="text.secondary">
												Your new password must be different from previous ones.
											</Typography>
										</Box>

										<Box
											component="form"
											noValidate
											sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
											{/* Password */}
											<Box>
												<InputLabel sx={{ fontSize: 13, fontWeight: 600 }}>New password</InputLabel>
												<FormControl
													fullWidth
													sx={{ mt: 1 }}>
													<OutlinedInput
														type={showPassword ? 'text' : 'password'}
														value={password}
														onChange={(e) => setPassword(e.target.value)}
														endAdornment={
															<InputAdornment position="end">
																<IconButton
																	onClick={handleClickShowPassword}
																	edge="end">
																	{showPassword ? <VisibilityOff /> : <Visibility />}
																</IconButton>
															</InputAdornment>
														}
														sx={{
															borderRadius: 2,
															bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
															boxShadow: 1,
														}}
													/>
												</FormControl>
											</Box>

											{/* Confirm Password */}
											<Box>
												<InputLabel sx={{ fontSize: 13, fontWeight: 600 }}>Confirm password</InputLabel>
												<FormControl
													fullWidth
													sx={{ mt: 1 }}>
													<OutlinedInput
														type={showConfirmPassword ? 'text' : 'password'}
														value={confirmPassword}
														onChange={(e) => setConfirmPassword(e.target.value)}
														endAdornment={
															<InputAdornment position="end">
																<IconButton
																	onClick={handleClickShowConfirmPassword}
																	edge="end">
																	{showConfirmPassword ? <VisibilityOff /> : <Visibility />}
																</IconButton>
															</InputAdornment>
														}
														sx={{
															borderRadius: 2,
															bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
															boxShadow: 1,
														}}
													/>
												</FormControl>
											</Box>

											{/* Info hint */}
											<Box
												sx={{
													mt: 1,
													p: 2,
													borderRadius: 2,
													display: 'flex',
													gap: 1.5,
													bgcolor: theme.palette.mode === 'dark' ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.15)',
												}}>
												<LightbulbOutlinedIcon color="warning" />
												<Typography variant="caption">Use at least 8 characters, including a number or symbol.</Typography>
											</Box>

											{error && <Alert severity="error">{error}</Alert>}

											<Button
												fullWidth
												disabled={loading}
												variant="contained"
												onClick={handleResetPassword}
												sx={{
													mt: 2,
													py: 1.25,
													borderRadius: 2,
													fontWeight: 700,
													textTransform: 'none',
												}}>
												{loading ? (
													<>
														<CircularProgress
															size={18}
															sx={{ mr: 1 }}
														/>
														Resetting…
													</>
												) : (
													'Reset password'
												)}
											</Button>
										</Box>
									</>
								)}
							</Box>
						</Card>
					</Box>
				</Fade>
			</Box>
		</Box>
	);
}
