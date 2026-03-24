import React, { useEffect, useRef, useState } from 'react';
import { Modal, Backdrop, Box, Card, Typography, IconButton, Button, CircularProgress, useTheme } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ReplayIcon from '@mui/icons-material/Replay';
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

export function OtpVerificationModal({ open, onOpenChange, onVerify, onResend, email }) {
	const theme = useTheme();
	const [error, setError] = useState('');
	const [otpValues, setOtpValues] = useState(Array(6).fill(''));
	const [loading, setLoading] = useState(false);
	const [resendTimer, setResendTimer] = useState(0);
	const [resending, setResending] = useState(false);
	const inputsRef = useRef([]);

	const colors = tokens(theme.palette.mode);

	async function handleChange(index, value) {
		if (!/^\d?$/.test(value)) return;

		const next = [...otpValues];
		next[index] = value;
		setOtpValues(next);

		if (value && index < 5) {
			inputsRef.current[index + 1]?.focus();
		}

		if (index === 5 && next.every(Boolean) && !loading) {
			await handleSubmit(next.join(''));
		}
	}

	function handleKeyDown(e, index) {
		if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
			inputsRef.current[index - 1]?.focus();
		}
	}

	async function handleSubmit(forcedOtp) {
		const otp = forcedOtp ?? otpValues.join('');
		if (otp.length < 6) {
			setError('Please enter the full 6-digit code');
			return;
		}

		try {
			setLoading(true);
			await onVerify(otp);

			// onOpenChange(false);
		} catch (err) {
			setError(err.message || 'Invalid or expired code');
		} finally {
			setLoading(false);
		}
	}

	async function handleResend() {
		try {
			setResending(true);
			setResendTimer(30);
			await onResend();
		} catch {
			setError('Failed to resend code');
			setResendTimer(0);
		} finally {
			setResending(false);
		}
	}

	useEffect(() => {
		if (!resendTimer) return;
		const id = setInterval(() => setResendTimer((t) => t - 1), 1000);
		return () => clearInterval(id);
	}, [resendTimer]);

	useEffect(() => {
		if (!open) return;
		setOtpValues(Array(6).fill(''));
		setResendTimer(0);
		setTimeout(() => inputsRef.current[0]?.focus(), 120);
	}, [open]);

	return (
		<Modal
			open={open}
			onClose={() => onOpenChange(false)}
			closeAfterTransition
			slots={{ backdrop: Backdrop }}
			slotProps={{
				backdrop: {
					sx: {
						'backgroundColor': 'rgba(0,0,0,0.55)',
						'&::before': {
							content: '""',
							position: 'fixed',
							inset: 0,
							backdropFilter: 'blur(6px)',
							WebkitBackdropFilter: 'blur(6px)',
							zIndex: -1,
						},
					},
				},
			}}>
			<Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
				<Card
					sx={{
						isolation: 'isolate',
						width: '100%',
						maxWidth: 420,
						borderRadius: 3,
						overflow: 'hidden',
						boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
					}}>
					{/* Header */}
					<Box
						sx={{
							p: 3,
							color: '#fff',
							background: `linear-gradient(135deg, ${colors.primary[700]} 0%, ${colors.primary[800]} 80%)`,
						}}>
						<Box
							display="flex"
							justifyContent="space-between"
							alignItems="center">
							<Box
								display="flex"
								gap={1.5}
								alignItems="center">
								<ShieldOutlinedIcon />
								<Box>
									<Typography fontWeight={700}>Verify your email</Typography>
									<Typography
										variant="caption"
										sx={{ opacity: 0.85 }}>
										{email ? `Code sent to ${email}` : 'Enter your 6-digit code'}
									</Typography>
								</Box>
							</Box>
							<IconButton
								onClick={() => onOpenChange(false)}
								sx={{ color: '#fff' }}>
								<CloseIcon />
							</IconButton>
						</Box>
					</Box>

					{/* Body */}
					<Box sx={{ p: 4 }}>
						<Typography
							variant="body2"
							color="text.secondary"
							align="center"
							sx={{ mb: 4 }}>
							Enter the 6-digit verification code sent to your email.
						</Typography>

						{/* OTP Inputs */}
						<Box
							display="flex"
							justifyContent="center"
							gap={1.5}
							mb={4}>
							{otpValues.map((value, index) => (
								<Box
									key={index}
									component="input"
									ref={(el) => el && (inputsRef.current[index] = el)}
									value={value}
									maxLength={1}
									inputMode="numeric"
									onChange={(e) => handleChange(index, e.target.value)}
									onKeyDown={(e) => handleKeyDown(e, index)}
									disabled={loading}
									sx={{
										'width': 48,
										'height': 56,
										'textAlign': 'center',
										'fontSize': 22,
										'fontWeight': 700,
										'borderRadius': 2,
										'border': '2px solid',
										'borderColor': value ? 'primary.main' : 'divider',
										'outline': 'none',
										'color': theme.palette.mode === 'dark' ? '#fff' : 'rgba(255,255,255,0.04)',
										'bgcolor': theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#fff',
										'&:focus': {
											borderColor: 'primary.main',
											boxShadow: `0 0 0 3px ${theme.palette.primary.main}22`,
										},
									}}
								/>
							))}
						</Box>

						{/* Verify Button */}
						<Button
							fullWidth
							disabled={loading || otpValues.some((v) => !v)}
							onClick={() => handleSubmit()}
							variant="contained"
							sx={{
								py: 1.25,
								fontWeight: 700,
								borderRadius: 2,
								mb: 3,
							}}>
							{loading ? (
								<>
									<CircularProgress
										size={18}
										sx={{ mr: 1, color: '#fff' }}
									/>
									Verifying…
								</>
							) : (
								'Verify code'
							)}
						</Button>

						{/* Resend */}
						<Box textAlign="center">
							<Typography
								variant="caption"
								color="text.secondary"
								display="block"
								mb={1}>
								Didn’t receive the code?
							</Typography>

							<Button
								size="small"
								startIcon={<ReplayIcon />}
								disabled={resendTimer > 0 || resending}
								onClick={handleResend}>
								{resending ? 'Sending…' : resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Send new code'}
							</Button>
						</Box>
					</Box>
				</Card>
			</Box>
		</Modal>
	);
}
