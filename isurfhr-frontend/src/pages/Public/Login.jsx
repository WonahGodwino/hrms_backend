import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// Standard MUI components
import {
	Box,
	Typography,
	useTheme,
	useMediaQuery,
	FormControlLabel,
	Checkbox,
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
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LoginIcon from '@mui/icons-material/Login';

// Import from the co-located context file
import { useAuth } from '../../lib/context/AuthContext';
// Import the login service
import { login as apiLogin } from '../../services/AuthService';

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

const Login = () => {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [remember, setRemember] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	const navigate = useNavigate();
	const { login: contextLogin } = useAuth();

	const theme = useTheme();
	const colors = tokens(theme.palette.mode);
	const isSmall = useMediaQuery(theme.breakpoints.down('md'));
	const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');

	// Compute right panel background (darker than left)
	const rightBg = theme.palette.mode === 'dark' ? colors.background.dark : colors.primary[100];

	// ----------------------------- Handlers -----------------------------
	const handleLogin = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			// Use the AuthService login function
			const response = await apiLogin(email, password);
			const responseBody = response.data;

			// Check for backend success flag
			if (responseBody?.success === false) {
				throw new Error(responseBody?.message || 'Login failed');
			}

			// Extract data safely
			const apiData = responseBody?.data || {};
			const accessToken = apiData.token;
			const user = apiData.user || { email };

			if (!accessToken) throw new Error('No access token returned from server');

			// Pass user and token to Context
			contextLogin(user, accessToken);

			if (remember) {
				localStorage.setItem('remember_email', email);
			}

			// ----------------------------- Navigation Logic -----------------------------
			// UPDATED: All roles redirect to the unified dashboard
			navigate('/dashboard');
		} catch (err) {
			console.error('Login error:', err);
			const errorMessage = err.response?.data?.message || err.message || 'Login failed. Please try again.';
			setError(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const handleClickShowPassword = () => setShowPassword((s) => !s);
	const handleMouseDownPassword = (e) => e.preventDefault();

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
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'center',
							mb: 3,
						}}>
						<Box
							sx={{
								'width': 64,
								'height': 64,
								'borderRadius': 3,
								'display': 'flex',
								'alignItems': 'center',
								'justifyContent': 'center',
								'transition': 'transform 0.2s ease',
								'overflow': 'hidden',
								'boxShadow': '0 4px 12px rgba(0,0,0,0.15)',
								'&:hover': {
									transform: 'scale(1.05)',
								},
							}}>
							<Box
								component="img"
								src="/logo.webp"
								alt="247HR logo"
								sx={{
									width: '100%',
									height: '100%',
									objectFit: 'cover',
								}}
							/>
						</Box>
					</Box>

					<Typography
						component="h1"
						variant="h4"
						fontWeight={700}
						sx={{ color: colors.gray[100], mb: 1 }}>
						Welcome Back
					</Typography>

					<Typography
						variant="body1"
						sx={{ color: 'rgba(255,255,255,0.85)' }}>
						Securely access your dashboard.
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
										display: 'flex',
										justifyContent: 'center',
										mb: 3,
									}}>
									<Box
										sx={{
											'width': 64,
											'height': 64,
											'borderRadius': 3,
											'display': 'flex',
											'alignItems': 'center',
											'justifyContent': 'center',
											'transition': 'transform 0.2s ease',
											'overflow': 'hidden',
											'boxShadow': '0 4px 12px rgba(0,0,0,0.15)',
											'&:hover': {
												transform: 'scale(1.05)',
											},
										}}>
										<Box
											component="img"
											src="/logo.webp"
											alt="247HR logo"
											sx={{
												width: '100%',
												height: '100%',
												objectFit: 'cover',
											}}
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
										Sign in to your account
									</Typography>
									<Typography
										variant="body2"
										color={theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(17,24,39,0.6)'}>
										Enter your credentials below
									</Typography>
								</Box>

								<Box
									component="form"
									onSubmit={handleLogin}
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

									<Box>
										<InputLabel
											htmlFor="password"
											sx={{ fontSize: 13, fontWeight: 600 }}>
											Password
										</InputLabel>

										<FormControl
											fullWidth
											sx={{ mt: 1 }}>
											<OutlinedInput
												id="password"
												name="password"
												type={showPassword ? 'text' : 'password'}
												placeholder="Password"
												autoComplete="current-password"
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												aria-invalid={Boolean(error)}
												endAdornment={
													<InputAdornment position="end">
														<IconButton
															onClick={handleClickShowPassword}
															onMouseDown={handleMouseDownPassword}
															edge="end">
															{showPassword ? <VisibilityOff /> : <Visibility />}
														</IconButton>
													</InputAdornment>
												}
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

									{error && (
										<Alert
											severity="error"
											sx={{ mt: 0 }}>
											{error}
										</Alert>
									)}

									<Box
										sx={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'space-between',
											gap: 2,
											flexWrap: 'wrap',
											mt: 1,
										}}>
										<FormControlLabel
											control={
												<Checkbox
													checked={remember}
													onChange={(e) => setRemember(e.target.checked)}
													name="remember"
													sx={{ color: colors.primary[500] }}
												/>
											}
											label={<Typography sx={{ fontSize: 14 }}>Remember me</Typography>}
										/>

										<Link
											to="/forgot-password"
											style={{
												textDecoration: 'none',
												color: colors.primary[500],
												fontWeight: 600,
											}}>
											Forgot password?
										</Link>
									</Box>

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
													Log in
												</>
											) : (
												'Log in'
											)}
										</Button>
									</Box>

									{/* <Box textAlign="center" sx={{ mt: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Don't have an account?{" "}
                      <Link
                        to="/register"
                        style={{ color: colors.primary[500], fontWeight: 600 }}
                      >
                        Sign up
                      </Link>
                    </Typography>
                  </Box> */}
								</Box>
							</Box>
						</Card>
					</Box>
				</Fade>
			</Box>
		</Box>
	);
};

export default Login;
