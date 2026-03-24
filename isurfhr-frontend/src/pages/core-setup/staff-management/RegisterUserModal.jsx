import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Box,
  Typography,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { register } from "@/services/AuthService";
import UserCreatedSuccessModal from "./UserCreatedSuccessModal";
import RegistrationFailedModal from "@/components/RegistrationFailedModal";// Import the error modal
import { getAccessibleCompany } from "@/services/CompanyService";
import { useAuth } from "@/lib/context/AuthContext";

const RegisterUserModal = ({ open, onClose, onSubmit }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [isCompanyLoading, setIsCompanyLoading] = useState(true);
  const { user } = useAuth();

  // State for modals
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "HR",
    company: "",
  });

  const [errors, setErrors] = useState({
    email: "",
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Clear API errors when user starts typing again
    if (apiError) setApiError("");

    setForm((prev) => ({ ...prev, [name]: value }));

    // Basic email validation logic
    if (name === "email") {
      const isValid = /\S+@\S+\.\S+/.test(value);
      setErrors({ ...errors, email: isValid ? "" : "Email is invalid." });
    }
  };

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  // Success Modal Handlers
  const handleSuccessClose = () => {
    setShowSuccessModal(false);
  };

  const handleViewUser = () => {
    setShowSuccessModal(false);
  };

  // Error Modal Handlers
  const handleErrorClose = () => {
    setShowErrorModal(false);
  };

  const handleTryAgain = () => {
    setShowErrorModal(false);
    // User remains on the form to fix issues
  };

  const handleSubmit = async () => {
    // Validate required fields locally first
    if (
      !form.email ||
      !form.password ||
      !form.firstName ||
      !form.lastName ||
      !form.company
    ) {
      setApiError("Please fill in all required fields.");
      return;
    }

    // Prevent submission if there are validation errors
    if (!errors.email) {
      setLoading(true);
      setApiError("");

      try {
        const payload = {
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          role: form.role,
          companyId: form.company || "",
        };

        const response = await register(payload);
        const data = response.data;

        if (data.success) {
          // Success action
          if (onSubmit) onSubmit(data);
          console.log("User Registered Successfully", data);

          // Reset form
          setForm({
            firstName: "",
            lastName: "",
            email: "",
            password: "",
            role: "HR",
            company: "",
          });

          // Close the registration dialog
          onClose();

          // Open the success modal
          setShowSuccessModal(true);
        } else {
          // Backend returned an error
          const msg = data.message || "Registration failed. Please try again.";
          setApiError(msg);
          setShowErrorModal(true); // Show error modal
        }
      } catch (err) {
        console.error("Registration Error:", err);
        const errorMessage =
          err.response?.data?.message ||
          err.message ||
          "Network error. Unable to connect to server.";
        setApiError(errorMessage);
        setShowErrorModal(true); // Show error modal on catch
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchCompanies = async () => {
    setIsCompanyLoading(true);
    try {
      const result = await getAccessibleCompany();

      if (result.data.success) {
        // Transform the API response to match your component's data structure
        const transformedCompanies = result.data.data.map((company) => ({
          id: company.id,
          name: company.companyName || "Unknown Company",
          code: company.companyName || "",
          status: company.status || "active",
          address: company.address,
          phone: company.phone,
          taxId: company.taxId,
          email: company.email,
        }));

        setCompanies(transformedCompanies);
      } else {
        // Handle API error response
        throw new Error(result.message || "Failed to fetch companies");
      }
    } catch (err) {
      // Show error notification
      setApiError(err.message || "Failed to load companies");
    } finally {
      setIsCompanyLoading(false);
    }
  };

  // Add these animations at the top of your component
  const pageAnimations = {
    "@keyframes fadeIn": {
      "0%": { opacity: 0 },
      "100%": { opacity: 1 },
    },
    "@keyframes slideInUp": {
      "0%": {
        transform: "translateY(30px)",
        opacity: 0,
      },
      "100%": {
        transform: "translateY(0)",
        opacity: 1,
      },
    },
    "@keyframes slideInDown": {
      "0%": {
        transform: "translateY(-30px)",
        opacity: 0,
      },
      "100%": {
        transform: "translateY(0)",
        opacity: 1,
      },
    },
    "@keyframes slideInLeft": {
      "0%": {
        transform: "translateX(-30px)",
        opacity: 0,
      },
      "100%": {
        transform: "translateX(0)",
        opacity: 1,
      },
    },
    "@keyframes slideInRight": {
      "0%": {
        transform: "translateX(30px)",
        opacity: 0,
      },
      "100%": {
        transform: "translateX(0)",
        opacity: 1,
      },
    },
    "@keyframes scaleIn": {
      "0%": {
        transform: "scale(0.95)",
        opacity: 0,
      },
      "100%": {
        transform: "scale(1)",
        opacity: 1,
      },
    },
    "@keyframes pulse-glow": {
      "0%": { boxShadow: "0 0 0 0 rgba(19, 91, 236, 0.4)" },
      "70%": { boxShadow: "0 0 0 8px rgba(19, 91, 236, 0)" },
      "100%": { boxShadow: "0 0 0 0 rgba(19, 91, 236, 0)" },
    },
    "@keyframes shake": {
      "0%, 100%": { transform: "translateX(0)" },
      "25%": { transform: "translateX(-5px)" },
      "75%": { transform: "translateX(5px)" },
    },
  };

  return (
    <>
      {/* Main Registration Form Dialog */}
      <Dialog
        open={open}
        onClose={loading ? null : onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            animation: "scaleIn 0.3s ease-out",
            ...pageAnimations,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #e0e0e0",
            p: 3,
            animation: "slideInDown 0.3s ease-out",
            ...pageAnimations,
          }}
        >
          <Typography variant="h6" component="span" fontWeight={600}>
            Register New User
          </Typography>
          <IconButton
            onClick={onClose}
            aria-label="close"
            disabled={loading}
            sx={{
              transition: "all 0.2s ease",
              "&:hover:not(:disabled)": {
                transform: "rotate(90deg)",
                color: "#f44336",
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 3, mt: 1 }}>
          <Box component="form" noValidate autoComplete="off" mt={2}>
            <Grid container spacing={3}>
              {/* First Name */}
              <Grid
                item
                size={6}
                sx={{
                  animation: "slideInLeft 0.3s ease-out",
                  ...pageAnimations,
                }}
              >
                <TextField
                  fullWidth
                  label="First Name"
                  name="firstName"
                  placeholder="Enter first name"
                  value={form.firstName}
                  onChange={handleChange}
                  variant="outlined"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      transition: "all 0.2s ease",
                      "&:hover:not(.Mui-disabled)": {
                        transform: "scale(1.01)",
                      },
                      "&.Mui-focused": {
                        animation: "pulse-glow 1.5s infinite",
                        ...pageAnimations,
                      },
                    },
                  }}
                />
              </Grid>

              {/* Last Name */}
              <Grid
                item
                size={6}
                sx={{
                  animation: "slideInRight 0.3s ease-out",
                  ...pageAnimations,
                }}
              >
                <TextField
                  fullWidth
                  label="Last Name"
                  name="lastName"
                  placeholder="Enter last name"
                  value={form.lastName}
                  onChange={handleChange}
                  variant="outlined"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      transition: "all 0.2s ease",
                      "&:hover:not(.Mui-disabled)": {
                        transform: "scale(1.01)",
                      },
                      "&.Mui-focused": {
                        animation: "pulse-glow 1.5s infinite",
                        ...pageAnimations,
                      },
                    },
                  }}
                />
              </Grid>

              {/* Email */}
              <Grid
                item
                size={12}
                sx={{
                  animation: "fadeIn 0.3s ease-out 0.1s both",
                  ...pageAnimations,
                }}
              >
                <TextField
                  fullWidth
                  label="Email Address"
                  name="email"
                  placeholder="Enter email address"
                  value={form.email}
                  onChange={handleChange}
                  error={!!errors.email}
                  helperText={errors.email}
                  variant="outlined"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      transition: "all 0.2s ease",
                      "&:hover:not(.Mui-disabled)": {
                        transform: "scale(1.01)",
                      },
                      "&.Mui-focused": {
                        animation: "pulse-glow 1.5s infinite",
                        ...pageAnimations,
                      },
                      "&.Mui-error": {
                        animation: "shake 0.3s ease-out",
                        ...pageAnimations,
                      },
                    },
                  }}
                />
              </Grid>

              {/* Password */}
              <Grid
                item
                size={12}
                sx={{
                  animation: "fadeIn 0.3s ease-out 0.15s both",
                  ...pageAnimations,
                }}
              >
                <TextField
                  fullWidth
                  label="Password"
                  name="password"
                  placeholder="Create a password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={handleChange}
                  variant="outlined"
                  disabled={loading}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={handleClickShowPassword}
                          edge="end"
                          disabled={loading}
                          sx={{
                            transition: "all 0.2s ease",
                            "&:hover:not(:disabled)": {
                              transform: "scale(1.1)",
                            },
                          }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      transition: "all 0.2s ease",
                      "&:hover:not(.Mui-disabled)": {
                        transform: "scale(1.01)",
                      },
                      "&.Mui-focused": {
                        animation: "pulse-glow 1.5s infinite",
                        ...pageAnimations,
                      },
                    },
                  }}
                />
              </Grid>

              {/* Role */}
              <Grid
                item
                size={6}
                sx={{
                  animation: "slideInLeft 0.3s ease-out 0.2s both",
                  ...pageAnimations,
                }}
              >
                <TextField
                  select
                  fullWidth
                  label="Role"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  variant="outlined"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      transition: "all 0.2s ease",
                      "&:hover:not(.Mui-disabled)": {
                        transform: "scale(1.01)",
                      },
                      "&.Mui-focused": {
                        animation: "pulse-glow 1.5s infinite",
                        ...pageAnimations,
                      },
                    },
                  }}
                >
                  {(user.role === "SUPER_ADMIN" ||
                    user.role === "SUPERADMIN") && (
                    <MenuItem value="SUPER_ADMIN">SUPER ADMIN</MenuItem>
                  )}
                  {(user.role === "SUPER_ADMIN" ||
                    user.role === "SUPERADMIN") && (
                    <MenuItem value="ADMIN">ADMIN</MenuItem>
                  )}
                  <MenuItem value="HR">HR</MenuItem>
                  <MenuItem value="STAFF">STAFF</MenuItem>
                </TextField>
              </Grid>

              {/* Company */}
              <Grid
                item
                size={6}
                sx={{
                  animation: "slideInRight 0.3s ease-out 0.2s both",
                  ...pageAnimations,
                }}
              >
                <TextField
                  select
                  fullWidth
                  label="Company"
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  variant="outlined"
                  disabled={loading || isCompanyLoading}
                  InputProps={{
                    endAdornment: isCompanyLoading ? (
                      <InputAdornment position="end">
                        <CircularProgress
                          size={20}
                          sx={{
                            animation: "spin 1s linear infinite",
                            "@keyframes spin": {
                              "0%": { transform: "rotate(0deg)" },
                              "100%": { transform: "rotate(360deg)" },
                            },
                            ...pageAnimations,
                          }}
                        />
                      </InputAdornment>
                    ) : null,
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      transition: "all 0.2s ease",
                      "&:hover:not(.Mui-disabled)": {
                        transform: "scale(1.01)",
                      },
                      "&.Mui-focused": {
                        animation: "pulse-glow 1.5s infinite",
                        ...pageAnimations,
                      },
                    },
                  }}
                >
                  <MenuItem value="">
                    {isCompanyLoading
                      ? "Loading companies..."
                      : "Select company"}
                  </MenuItem>
                  {companies.map((company, index) => (
                    <MenuItem
                      key={company.id}
                      value={company.id}
                      sx={{
                        animation: `fadeIn 0.2s ease-out ${index * 0.02}s both`,
                        ...pageAnimations,
                      }}
                    >
                      {company.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            borderTop: "1px solid #e0e0e0",
            p: 3,
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
            animation: "slideInUp 0.3s ease-out 0.25s both",
            ...pageAnimations,
          }}
        >
          {apiError && (
            <Alert
              severity="error"
              sx={{
                width: "100%",
                mb: 1,
                animation: "shake 0.3s ease-out",
                ...pageAnimations,
              }}
            >
              {apiError}
            </Alert>
          )}

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              onClick={onClose}
              variant="outlined"
              color="inherit"
              disabled={loading}
              sx={{
                borderColor: "#e0e0e0",
                color: "text.secondary",
                textTransform: "none",
                fontWeight: 500,
                transition: "all 0.2s ease",
                "&:hover:not(:disabled)": {
                  borderColor: "#bdbdbd",
                  backgroundColor: "#f5f5f5",
                  transform: "scale(1.02)",
                },
              }}
            >
              Cancel
            </Button>

            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={loading}
              sx={{
                bgcolor: "#135bec",
                textTransform: "none",
                fontWeight: 500,
                position: "relative",
                overflow: "hidden",
                transition: "all 0.3s ease",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: 0,
                  height: 0,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.3)",
                  transform: "translate(-50%, -50%)",
                  transition: "width 0.6s ease, height 0.6s ease",
                },
                "&:hover:not(:disabled)": {
                  bgcolor: "#0d4bd1",
                  transform: "scale(1.02)",
                  "&::before": {
                    width: "200px",
                    height: "200px",
                  },
                },
              }}
            >
              {loading ? "Creating..." : "Create User"}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Success Modal */}
      <UserCreatedSuccessModal
        open={showSuccessModal}
        onClose={handleSuccessClose}
        onViewUser={handleViewUser}
      />

      {/* Error Modal */}
      <RegistrationFailedModal
        open={showErrorModal}
        onClose={handleErrorClose}
        onTryAgain={handleTryAgain}
      />
    </>
  );
};

export default RegisterUserModal;
