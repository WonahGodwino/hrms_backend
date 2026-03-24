import React, { useState } from 'react';
import { Box, Typography, Grid, Card, CardContent, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RegisterUserModal from './RegisterUserModal'; // Adjust path if necessary
import CompanyRegistrationModal from './RegisterCompanyModal';

const SuperAdminDashboard = () => {
	// State for Modal visibility
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

	// Handlers for Modal
	const handleOpenModal = () => {
		setIsModalOpen(true);
	};

	const handleOpenCompanyModal = () => {
		setIsCompanyModalOpen(true);
	};

	const handleCloseModal = () => {
		setIsModalOpen(false);
	};
	const handleCloseCompanyModal = () => {
		setIsCompanyModalOpen(false);
	};

	const handleRegisterUser = (formData) => {
		// Close modal after submission
		handleCloseModal();
	};

	return (
		<Box
			sx={{
				minHeight: '100vh',
				bgcolor: 'background.default',
				display: 'flex',
				flexDirection: 'column',
			}}>
			{/* Main Content */}
			<Box sx={{ p: 4, flexGrow: 1 }}>
				<Box
					sx={{
						maxWidth: '1200px',
						mx: 'auto',
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
					}}>
					{/* Page Heading */}
					<Box
						sx={{
							display: 'flex',
							flexWrap: 'wrap',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 2,
						}}>
						<Typography
							variant="h3"
							fontWeight={800}>
							Dashboard Overview
						</Typography>

						<Box
							sx={{
								display: 'flex',
								flexWrap: 'wrap',
								alignItems: 'center',
								justifyContent: 'left',
								gap: 1,
							}}>
							<Button
								variant="contained"
								startIcon={<AddIcon />}
								sx={{ fontWeight: 600 }}
								onClick={handleOpenModal}>
								Register User
							</Button>
							<Button
								variant="contained"
								startIcon={<AddIcon />}
								sx={{ fontWeight: 600 }}
								onClick={handleOpenCompanyModal}>
								Register Company
							</Button>
						</Box>
					</Box>

					{/* Stats Grid */}
					<Grid
						container
						spacing={3}>
						<Grid
							item
							xs={12}
							sm={6}
							lg={3}
							size={3}>
							<Card sx={{ borderRadius: 2, boxShadow: 2 }}>
								<CardContent>
									<Typography
										variant="body1"
										color="text.secondary">
										Total Employees
									</Typography>
									<Typography
										variant="h4"
										fontWeight={700}>
										0
									</Typography>
								</CardContent>
							</Card>
						</Grid>

						<Grid
							item
							xs={12}
							sm={6}
							lg={3}
							size={3}>
							<Card sx={{ borderRadius: 2, boxShadow: 2 }}>
								<CardContent>
									<Typography
										variant="body1"
										color="text.secondary">
										HR Users
									</Typography>
									<Typography
										variant="h4"
										fontWeight={700}>
										0
									</Typography>
								</CardContent>
							</Card>
						</Grid>

						<Grid
							item
							xs={12}
							sm={6}
							lg={3}
							size={3}>
							<Card sx={{ borderRadius: 2, boxShadow: 2 }}>
								<CardContent>
									<Typography
										variant="body1"
										color="text.secondary">
										Admin Users
									</Typography>
									<Typography
										variant="h4"
										fontWeight={700}>
										0
									</Typography>
								</CardContent>
							</Card>
						</Grid>

						<Grid
							item
							xs={12}
							sm={6}
							lg={3}
							size={3}>
							<Card sx={{ borderRadius: 2, boxShadow: 2 }}>
								<CardContent>
									<Typography
										variant="body1"
										color="text.secondary">
										Registered Companies
									</Typography>
									<Typography
										variant="h4"
										fontWeight={700}>
										0
									</Typography>
								</CardContent>
							</Card>
						</Grid>
					</Grid>
				</Box>
			</Box>

			{/* Register User Modal */}
			<RegisterUserModal
				open={isModalOpen}
				onClose={handleCloseModal}
				onSubmit={handleRegisterUser}
			/>

			<CompanyRegistrationModal
				open={isCompanyModalOpen}
				onClose={handleCloseCompanyModal}
				onSubmit={handleCloseCompanyModal}
			/>
		</Box>
	);
};

export default SuperAdminDashboard;
