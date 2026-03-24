import { useState } from 'react';
import { Box, Container, Typography, Card, CardContent, Button, Chip, Stack, Divider } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Header } from '../../components/home/Header';
import { Footer } from '../../components/home/Footer';
import { FaqItem } from '../../components/home/FAQ';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';

const enterpriseFeatures = [
	{
		label: 'SOC2 Type II',
		icon: <GppGoodOutlinedIcon sx={{ fontSize: 26 }} />,
		highlight: false,
	},
	{
		label: 'HR Transformation',
		icon: <GroupAddOutlinedIcon sx={{ fontSize: 26 }} />,
		highlight: false,
	},
	{
		label: 'Global Scale',
		icon: <PublicOutlinedIcon sx={{ fontSize: 26 }} />,
		highlight: false,
	},
	{
		label: 'Priority SLA',
		icon: <VerifiedOutlinedIcon sx={{ fontSize: 26 }} />,
		highlight: true,
	},
];

const compareFeatures = [
	{
		feature: 'Admin Controls',
		foundation: true,
		professional: true,
		enterprise: true,
	},
	{
		feature: 'Custom Reports',
		foundation: false,
		professional: 'Up to 20',
		enterprise: 'Unlimited',
	},
	{
		feature: 'Automation Engine',
		foundation: 'Basic',
		professional: true,
		enterprise: true,
	},
	{
		feature: 'Compliance Vault',
		foundation: false,
		professional: false,
		enterprise: true,
	},
	{
		feature: 'Audit Logs',
		foundation: '30 days',
		professional: '1 year',
		enterprise: 'Lifetime',
	},
];

const addons = [
	{
		name: 'Payroll Plus',
		description: 'Automate global compliance and tax filing.',
		price: '+$12 / user',
		icon: <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 22 }} />,
	},
	{
		name: 'AI Recruiting',
		description: 'Smart applicant matching and auto-scheduling.',
		price: '+$8 / user',
		icon: <PsychologyOutlinedIcon sx={{ fontSize: 22 }} />,
	},
	{
		name: 'Learning Hub',
		description: 'LMS with pre-built compliance training.',
		price: '+$5 / user',
		icon: <SchoolOutlinedIcon sx={{ fontSize: 22 }} />,
	},
	{
		name: 'Benefits Admin',
		description: 'Centralized health and wellness management.',
		price: '+$4 / user',
		icon: <MedicalServicesOutlinedIcon sx={{ fontSize: 22 }} />,
	},
];

const plans = [
	{
		name: 'Foundation',
		description: 'Essential tools for growing teams.',
		monthlyPrice: 49,
		annualPrice: 39,
		cta: 'Start Foundation',
		ctaVariant: 'contained',
		popular: false,
		features: ['Core HR Database', 'Time & Attendance', 'Self-service Portal', 'Email Support'],
	},
	{
		name: 'Professional',
		description: 'Complete performance & analytics.',
		monthlyPrice: 99,
		annualPrice: 79,
		cta: 'Start Professional',
		ctaVariant: 'contained',
		popular: true,
		features: ['Everything in Foundation', 'Performance Reviews', 'Advanced Analytics', 'Custom Workflows', 'API Access'],
	},
	{
		name: 'Enterprise',
		description: 'Global security & custom scale.',
		monthlyPrice: null,
		annualPrice: null,
		cta: 'Contact Sales',
		ctaVariant: 'outlined',
		popular: false,
		features: ['Unlimited Users', 'SSO & SAML 2.0', 'Dedicated Manager', 'Custom Security Audit'],
	},
];

const faqs = [
	{
		question: 'How long does onboarding take?',
		answer:
			'Most teams are fully onboarded within 1–2 weeks. Our dedicated onboarding specialists guide you through data migration, integrations, and team training to ensure a smooth transition.',
	},
	{
		question: 'Can I change plans at any time?',
		answer:
			"Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle, and we'll prorate any difference automatically.",
	},
	{
		question: 'Can companies apply for customized add-ons?',
		answer:
			'Yes, companies can request custom add-ons for our HR suite, including payroll, recruitment, and leave management, by contacting support for a feasibility and pricing assessment.',
	},
];

export default function Pricing() {
	const [billing, setBilling] = useState('monthly');

	return (
		<>
			<Box
				component="main"
				sx={{
					width: '100%',
					bgcolor: '#f6f7f8',
					backgroundImage:
						'radial-gradient(at 0% 0%, rgba(25,120,229,0.1) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(25,120,229,0.05) 0px, transparent 50%)',
				}}>
				<Header ctaType="sales" />

				<Box
					component="section"
					sx={{
						py: { xs: 8, md: 12 },
						px: 2,
					}}>
					<Container
						maxWidth={false}
						sx={{
							width: { xs: '95%', md: '90%' },
						}}>
						<Box
							textAlign="center"
							mb={6}>
							<Typography
								variant="h2"
								sx={{
									fontWeight: 800,
									fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem' },
									color: '#0d1b2a',
									lineHeight: 1.15,
									mb: 0.5,
								}}>
								Scaling your workforce
							</Typography>
							<Typography
								variant="h2"
								sx={{
									fontWeight: 800,
									fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem' },
									color: '#2563eb',
									lineHeight: 1.15,
									mb: 3,
								}}>
								just got easier
							</Typography>
							<Typography
								variant="body1"
								sx={{
									color: '#4b5563',
									fontSize: { xs: '0.95rem', md: '1.05rem' },
									maxWidth: 480,
									mx: 'auto',
									fontFamily: "'DM Sans', sans-serif",
								}}>
								Transparent pricing built for teams from 10 to 10,000. Save up to 20% with annual billing.
							</Typography>
						</Box>

						<Box
							display="flex"
							justifyContent="center"
							mb={7}>
							<Box
								sx={{
									display: 'inline-flex',
									alignItems: 'center',
									bgcolor: '#e8edf5',
									borderRadius: '14px',
									p: '5px',
									gap: '2px',
								}}>
								{['monthly', 'annual'].map((option) => (
									<Box
										key={option}
										onClick={() => setBilling(option)}
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 0.75,
											px: 2.5,
											py: 1,
											borderRadius: '10px',
											cursor: 'pointer',
											transition: 'all 0.2s ease',
											bgcolor: billing === option ? '#fff' : 'transparent',
											boxShadow: billing === option ? '0 1px 8px rgba(0,0,0,0.10)' : 'none',
											fontFamily: "'DM Sans', sans-serif",
											fontWeight: billing === option ? 700 : 500,
											fontSize: '0.9rem',
											color: billing === option ? '#0d1b2a' : '#8a96a8',
											userSelect: 'none',
										}}>
										{option === 'monthly' ? (
											'Monthly'
										) : (
											<>
												Annual
												<Box
													component="span"
													sx={{
														color: '#2563eb',
														fontWeight: 700,
														fontSize: '0.85rem',
														ml: 0.25,
													}}>
													-20%
												</Box>
											</>
										)}
									</Box>
								))}
							</Box>
						</Box>

						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
								gap: 3,
								alignItems: 'center',
							}}>
							{plans.map((plan) => (
								<Box
									key={plan.name}
									sx={{
										position: 'relative',
										mt: { md: plan.popular ? -2 : 0 },
										mb: { md: plan.popular ? -2 : 0 },
									}}>
									<Card
										elevation={0}
										sx={{
											'height': '490px',
											'borderRadius': '20px',
											'border': plan.popular ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
											'bgcolor': '#fff',
											'overflow': 'visible',
											'boxShadow': plan.popular ? '0 8px 40px rgba(37,99,235,0.12)' : '0 2px 16px rgba(0,0,0,0.05)',
											'transition': 'box-shadow 0.25s ease, transform 0.25s ease',
											'position': 'relative', // Added for absolute positioning context
											'&:hover': {
												transform: 'translateY(-4px)',
												boxShadow: plan.popular ? '0 16px 48px rgba(37,99,235,0.18)' : '0 8px 32px rgba(0,0,0,0.10)',
											},
										}}>
										{/* MOST POPULAR chip - now inside the Card */}
										{plan.popular && (
											<Box
												sx={{
													position: 'absolute',
													top: -14,
													left: '50%',
													transform: 'translateX(-50%)',
													zIndex: 2,
												}}>
												<Chip
													label="MOST POPULAR"
													size="small"
													sx={{
														bgcolor: '#2563eb',
														color: '#fff',
														fontWeight: 700,
														fontSize: '0.65rem',
														letterSpacing: '0.08em',
														px: 1.5,
														height: 26,
														borderRadius: '999px',
														boxShadow: '0 4px 8px rgba(37,99,235,0.3)', // Optional: adds a subtle shadow for depth
													}}
												/>
											</Box>
										)}

										<CardContent sx={{ p: { xs: 3, md: 4 }, pt: plan.popular ? { xs: 4, md: 5 } : { xs: 3, md: 4 } }}>
											<Typography
												variant="h5"
												sx={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, color: '#0d1b2a', mb: 0.5 }}>
												{plan.name}
											</Typography>
											<Typography
												variant="body2"
												sx={{ color: '#64748b', fontFamily: "'DM Sans', sans-serif", mb: 3 }}>
												{plan.description}
											</Typography>

											<Box
												mb={3}
												minHeight={64}
												display="flex"
												alignItems="flex-end">
												{plan.monthlyPrice !== null ? (
													<>
														<Typography
															component="span"
															sx={{
																fontWeight: 800,
																fontSize: { xs: '2.8rem', md: '3.2rem' },
																color: '#0d1b2a',
																lineHeight: 1,
															}}>
															${billing === 'annual' ? plan.annualPrice : plan.monthlyPrice}
														</Typography>
														<Typography
															component="span"
															sx={{ color: '#94a3b8', fontSize: '0.9rem', ml: 0.75, mb: 0.5 }}>
															/ month
														</Typography>
													</>
												) : (
													<Typography
														sx={{
															fontWeight: 800,
															fontSize: { xs: '2.8rem', md: '3.2rem' },
															color: '#0d1b2a',
															lineHeight: 1,
														}}>
														Custom
													</Typography>
												)}
											</Box>

											<Button
												fullWidth
												variant={plan.ctaVariant}
												size="large"
												sx={{
													borderRadius: '10px',
													py: 1.4,
													fontWeight: 700,
													fontSize: '0.95rem',
													textTransform: 'none',
													mb: 3,
													...(plan.popular
														? { 'bgcolor': '#2563eb', 'color': '#fff', '&:hover': { bgcolor: '#1d4ed8' } }
														: plan.ctaVariant === 'outlined'
														? { 'borderColor': '#cbd5e1', 'color': '#0d1b2a', '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' } }
														: { 'bgcolor': '#0d1b2a', 'color': '#fff', '&:hover': { bgcolor: '#1e293b' } }),
												}}>
												{plan.cta}
											</Button>

											<Divider sx={{ mb: 2.5, borderColor: '#f1f5f9' }} />

											<Stack spacing={1.5}>
												{plan.features.map((feature) => (
													<Box
														key={feature}
														display="flex"
														alignItems="center"
														gap={1.25}>
														<CheckCircleOutlineIcon sx={{ fontSize: 18, color: plan.popular ? '#2563eb' : '#64748b', flexShrink: 0 }} />
														<Typography
															variant="body2"
															sx={{
																color: '#374151',
																fontWeight: plan.popular ? 500 : 400,
																fontSize: '0.9rem',
															}}>
															{feature}
														</Typography>
													</Box>
												))}
											</Stack>
										</CardContent>
									</Card>
								</Box>
							))}
						</Box>
					</Container>
				</Box>

				<Box
					component="section"
					sx={{
						py: { xs: 8, md: 12 },
						px: 2,
					}}>
					<Container
						maxWidth={false}
						sx={{
							width: { xs: '95%', md: '90%' },
						}}>
						<Typography
							variant="h4"
							sx={{
								fontWeight: 800,
								fontSize: { xs: '1.5rem', md: '1.75rem' },
								color: '#0d1b2a',
								mb: 0.5,
							}}>
							Add-on Modules
						</Typography>
						<Typography
							variant="body2"
							sx={{ color: '#64748b', mb: 4, fontSize: '0.95rem' }}>
							Extend your platform with specialized tools.
						</Typography>

						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: {
									xs: '1fr',
									sm: '1fr 1fr',
									md: 'repeat(4, 1fr)',
								},
								gap: 2.5,
							}}>
							{addons.map((addon) => (
								<Card
									key={addon.name}
									elevation={0}
									sx={{
										'borderRadius': '16px',
										'bgcolor': '#fff',
										'p': 0,
										'boxShadow': 'none',
										'&:hover': {
											transform: 'translateY(-3px)',
											boxShadow: 'none',
										},
									}}>
									<CardContent sx={{ p: 3 }}>
										<Box
											sx={{
												width: 44,
												height: 44,
												borderRadius: '10px',
												bgcolor: '#eff6ff',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												mb: 2.5,
												color: '#2563eb',
											}}>
											{addon.icon}
										</Box>

										<Typography
											variant="subtitle1"
											sx={{ fontWeight: 700, color: '#0d1b2a', mb: 0.5, fontSize: '0.95rem' }}>
											{addon.name}
										</Typography>
										<Typography
											variant="body2"
											sx={{ color: '#64748b', fontSize: '0.85rem', mb: 2, lineHeight: 1.5 }}>
											{addon.description}
										</Typography>
										<Typography
											variant="body2"
											sx={{ color: '#2563eb', fontWeight: 700, fontSize: '0.9rem' }}>
											{addon.price}
										</Typography>
									</CardContent>
								</Card>
							))}
						</Box>
					</Container>
				</Box>

				<Box
					component="section"
					sx={{
						py: { xs: 8, md: 12 },
						px: 2,
					}}>
					<Container
						maxWidth={false}
						sx={{
							width: { xs: '95%', md: '90%' },
						}}>
						<Typography
							variant="h4"
							textAlign="center"
							sx={{
								fontWeight: 800,
								fontSize: { xs: '1.6rem', md: '2rem' },
								color: '#0d1b2a',
								mb: 6,
							}}>
							Compare features
						</Typography>

						<Box sx={{ overflowX: 'auto' }}>
							<Box sx={{ minWidth: 600 }}>
								<Box
									sx={{
										display: 'grid',
										gridTemplateColumns: '1fr 1fr 1fr 1fr',
										pb: 2,
										borderBottom: '1.5px solid #e2e8f0',
										mb: 1,
									}}>
									<Typography
										sx={{
											fontSize: '0.7rem',
											fontWeight: 700,
											letterSpacing: '0.1em',
											color: '#94a3b8',
											textTransform: 'uppercase',
											alignSelf: 'flex-end',
										}}>
										Features
									</Typography>
									{['Foundation', 'Professional', 'Enterprise'].map((col) => (
										<Typography
											key={col}
											sx={{
												fontWeight: 700,
												fontSize: '1rem',
												color: '#0d1b2a',
												textAlign: 'center',
											}}>
											{col}
										</Typography>
									))}
								</Box>

								{/* Feature Rows */}
								{compareFeatures.map((row, i) => (
									<Box
										key={row.feature}
										sx={{
											display: 'grid',
											gridTemplateColumns: '1fr 1fr 1fr 1fr',
											py: 2.25,
											borderBottom: i < compareFeatures.length - 1 ? '1px solid #f1f5f9' : 'none',
											alignItems: 'center',
										}}>
										<Typography
											sx={{
												fontWeight: 600,
												fontSize: '0.9rem',
												color: '#0d1b2a',
											}}>
											{row.feature}
										</Typography>
										{[row.foundation, row.professional, row.enterprise].map((val, j) => (
											<Box
												key={j}
												sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
												{val === true ? (
													<CheckCircleOutlineIcon sx={{ fontSize: 20, color: '#1978e5' }} />
												) : val === false ? (
													<Typography sx={{ color: '#cbd5e1', fontSize: '1rem', fontWeight: 500 }}>—</Typography>
												) : (
													<Typography
														sx={{
															fontSize: '0.88rem',
															fontWeight: 500,
															color: typeof val === 'string' && ['Unlimited', 'Lifetime'].includes(val) ? '#2563eb' : '#64748b',
															textAlign: 'center',
														}}>
														{val}
													</Typography>
												)}
											</Box>
										))}
									</Box>
								))}
							</Box>
						</Box>
					</Container>
				</Box>

				<Box
					component="section"
					sx={{
						// bgcolor: 'white',
						py: { xs: 6, md: 10 },
						px: { xs: 2, md: 0 },
					}}>
					<Container
						maxWidth={false}
						sx={{ width: { xs: '95%', md: '90%' } }}>
						<Box
							sx={{
								background: 'linear-gradient(135deg, #0d1b2a 0%, #0f2444 50%, #0d1b2a 100%)',
								borderRadius: '28px',
								p: { xs: 3, sm: 5, md: 8 },
								display: 'grid',
								gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
								gap: { xs: 6, md: 8 },
								alignItems: 'center',
								overflow: 'hidden',
								position: 'relative',
							}}>
							<Box>
								<Box
									sx={{
										display: 'inline-flex',
										alignItems: 'center',
										bgcolor: 'rgba(25, 120, 229, 0.2)',
										gap: 1,
										border: '1px solid rgba(255,255,255,0.15)',
										borderRadius: '999px',
										px: { xs: 1, md: 2 },
										py: 0.75,
										mb: 4,
									}}>
									<Box
										sx={{
											width: 6,
											height: 6,
											borderRadius: '50%',
											bgcolor: '#2563eb',
										}}
									/>
									<Typography
										sx={{
											fontSize: { xs: '0.5rem', md: '0.7rem' },
											fontWeight: { xs: 500, md: 700 },
											letterSpacing: '0.14em',
											color: '#2563eb',
											textTransform: 'uppercase',
										}}>
										For Global Organizations
									</Typography>
								</Box>

								<Typography
									variant="h3"
									sx={{
										pr: { md: 4 },
										fontWeight: 800,
										fontSize: { xs: '2rem', md: '2.6rem' },
										color: '#fff',
										lineHeight: 1.15,
										mb: 3.5,
									}}>
									Need a custom{' '}
									<Box
										component="span"
										sx={{ color: '#2563eb' }}>
										Enterprise
									</Box>{' '}
									solution?
								</Typography>

								<Typography
									variant="body1"
									sx={{
										color: 'rgba(255,255,255,0.65)',
										fontSize: '1rem',
										lineHeight: 1.8,
										maxWidth: 460,
										mb: 5,
									}}>
									Get a tailored platform with custom security, white-glove onboarding, and dedicated support for your global workforce.
								</Typography>

								<Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
									<Button
										variant="contained"
										size="large"
										sx={{
											'width': { xs: '100%', md: 'auto' },
											'bgcolor': '#2563eb',
											'color': '#fff',
											'fontWeight': 700,
											'fontSize': '0.95rem',
											'textTransform': 'none',
											'borderRadius': '12px',
											'px': 4,
											'py': 1.6,
											'&:hover': { bgcolor: '#1d4ed8' },
										}}>
										Schedule a Demo
									</Button>
									<Button
										variant="outlined"
										size="large"
										sx={{
											'width': { xs: '100%', md: 'auto' },
											'borderColor': 'rgba(255,255,255,0.25)',
											'color': '#fff',
											'fontWeight': 700,
											'fontSize': '0.95rem',
											'textTransform': 'none',
											'borderRadius': '12px',
											'px': 4,
											'py': 1.6,
											'&:hover': {
												bgcolor: 'rgba(255,255,255,0.08)',
												borderColor: 'rgba(255,255,255,0.4)',
											},
										}}>
										Talk to Sales
									</Button>
								</Box>
							</Box>

							<Box
								sx={{
									display: 'grid',
									gridTemplateColumns: {
										xs: '1fr',
										md: 'repeat(2, 1fr)',
									},
									gap: { xs: 2, sm: 3, md: 4 },
								}}>
								{enterpriseFeatures.map((item) => (
									<Box
										key={item.label}
										sx={{
											borderRadius: '18px',
											p: 2.5,
											display: 'flex',
											flexDirection: 'column',
											justifyContent: 'flex-end',
											minHeight: 180,
											bgcolor: item.highlight ? '#2563eb' : 'rgba(255,255,255,0.05)',
											border: item.highlight ? 'none' : '1px solid rgba(255,255,255,0.1)',
										}}>
										<Box
											sx={{
												color: item.highlight ? 'rgba(255,255,255,0.9)' : '#2563eb',
												mb: 2,
											}}>
											{item.icon}
										</Box>
										<Typography
											sx={{
												fontWeight: 600,
												fontSize: '0.95rem',
												color: item.highlight ? '#fff' : 'rgba(255,255,255,0.8)',
											}}>
											{item.label}
										</Typography>
									</Box>
								))}
							</Box>
						</Box>
					</Container>
				</Box>

				<Box
					component="section"
					sx={{
						py: { xs: 8, md: 12 },
						px: 2,
					}}>
					<Container
						maxWidth={false}
						sx={{ width: { xs: '95%', md: '90%' } }}>
						<Typography
							variant="h4"
							textAlign="center"
							sx={{
								fontWeight: 800,
								fontSize: { xs: '1.6rem', md: '2rem' },
								color: '#0d1b2a',
								mb: 6,
							}}>
							Frequently Asked Questions
						</Typography>

						<Box
							sx={{
								maxWidth: 760,
								mx: 'auto',
								display: 'flex',
								flexDirection: 'column',
								gap: 2,
							}}>
							{faqs.map((faq, i) => (
								<FaqItem
									key={i}
									question={faq.question}
									answer={faq.answer}
								/>
							))}
						</Box>
					</Container>
				</Box>

				<Footer />
			</Box>
		</>
	);
}
