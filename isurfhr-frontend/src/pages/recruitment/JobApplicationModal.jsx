import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
  Modal,
  Grid,
  useTheme,
  InputAdornment,
  CircularProgress,
  Alert,
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CloseIcon from "@mui/icons-material/Close";
import LinkIcon from "@mui/icons-material/Link";
import LanguageIcon from "@mui/icons-material/Language";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";
import * as Yup from "yup";

// Service Import
import { applyForJob } from "@/services/RecruitmentService";

/**
 * JobApplicationModal Component
 * Handles the application form submission for a specific job.
 * Incorporates Yup validation and FormData payload construction for file uploads.
 */
// NOTE: Added companyName to the props so it can be passed dynamically from JobDetailsView
const JobApplicationModal = ({
  open,
  onClose,
  jobId,
  jobTitle,
  companyName,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();

  // --- Form Data State ---
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    linkedInUrl: "",
    portfolioUrl: "",
  });

  // Validation Errors State
  const [errors, setErrors] = useState({});

  // File State
  const [selectedFile, setSelectedFile] = useState(null);

  // --- Status State ---
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  // --- Yup Validation Schema ---
  const validationSchema = Yup.object().shape({
    firstName: Yup.string().required("First name is required"),
    lastName: Yup.string().required("Last name is required"),
    email: Yup.string()
      .email("Please enter a valid email address")
      .required("Email is required"),
    phone: Yup.string()
      .matches(/^[+]?[\d\s-()]*$/, "Please enter a valid phone number")
      .nullable(),
    // Transform empty strings to undefined so they are ignored by .url() validation, keeping the field optional
    linkedInUrl: Yup.string()
      .transform((value) => (value === "" ? undefined : value))
      .url(
        "Please enter a valid URL format (e.g., https://linkedin.com/in/...)",
      )
      .optional(),
    portfolioUrl: Yup.string()
      .transform((value) => (value === "" ? undefined : value))
      .url("Please enter a valid URL format (e.g., https://myportfolio.com)")
      .optional(),
  });

  /**
   * Handles text input changes and dynamically clears errors for the specific field
   */
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Clear general API error when typing
    if (apiError) setApiError(null);

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear specific field validation error when typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  /**
   * Handles CV file selection and ensures it respects the 5MB size limit
   */
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setApiError("File size exceeds 5MB limit.");
        return;
      }
      setSelectedFile(file);
      setApiError(null); // Clear previous errors
    }
  };

  /**
   * Clears the currently selected CV file
   */
  const handleClearFile = () => {
    setSelectedFile(null);
  };

  /**
   * Submits the application
   * Validates inputs, constructs FormData, and hits the API
   */
  const handleSubmit = async (e) => {
    // Prevent default form submission behavior (page reload)
    if (e) {
      e.preventDefault();
    }

    // 1. Validate text fields using Yup schema
    try {
      await validationSchema.validate(formData, { abortEarly: false });
      setErrors({}); // Clear previous validation errors
    } catch (validationErrors) {
      const newErrors = {};
      validationErrors.inner.forEach((err) => {
        newErrors[err.path] = err.message;
      });
      setErrors(newErrors);
      setApiError("Please correct the errors in the form before submitting.");
      return;
    }

    // 2. Validate File Upload manually
    if (!selectedFile) {
      setApiError("Please upload your resume/CV.");
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      // 3. Construct the FormData payload dynamically for multipart/form-data
      const payload = new FormData();

      // Append required fields matching the backend expectations exactly
      payload.append("jobId", jobId);
      payload.append("firstName", formData.firstName);
      payload.append("lastName", formData.lastName);
      payload.append("email", formData.email);

      // Append the file using the specific 'cv' key
      payload.append("cv", selectedFile);

      // Append optional fields only if they have values
      if (formData.phone) payload.append("phone", formData.phone);
      if (formData.linkedInUrl)
        payload.append("linkedInUrl", formData.linkedInUrl);
      if (formData.portfolioUrl)
        payload.append("portfolioUrl", formData.portfolioUrl);

      // 4. Submit via Service
      const response = await applyForJob(payload);

      // Handle both boolean true and nested object success responses securely
      if (response.data && response.data.success) {
        // Extract message and note from response payloads
        const apiMessage = response.data.data?.message || response.data.message;
        const apiNote = response.data.data?.note;

        // Automatically close the modal and redirect to the success page
        // PASSING STATE containing the job properties to use in ApplicationSuccessView
        onClose();
        navigate("/careers/success", {
          state: {
            jobTitle: jobTitle,
            companyName: companyName || "the company",
            email: formData.email,
            message: apiMessage,
            note: apiNote,
          },
        });
      } else {
        setApiError(
          response.data?.message || "Application failed. Please try again.",
        );
      }
    } catch (err) {
      console.error("Application error:", err);
      // Fallback messaging for 405s and other server errors
      setApiError(
        err.response?.data?.message ||
          "An error occurred while submitting your application. Please verify the endpoint.",
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resets the form state and closes the modal when the user explicitly cancels
   */
  const handleClose = () => {
    // Only reset state on close if we are not currently loading
    if (!loading) {
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        linkedInUrl: "",
        portfolioUrl: "",
      });
      setSelectedFile(null);
      setApiError(null);
      setErrors({});
    }

    // Close the modal
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="apply-modal-title"
      aria-describedby="apply-modal-description"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        backdropFilter: "blur(5px)", // Frosted glass effect
      }}
    >
      <Paper
        elevation={24}
        sx={{
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          overflowY: "auto",
          bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
          borderRadius: 4,
          outline: "none",
          position: "relative",
          p: 0,
        }}
      >
        {/* Header Section */}
        <Box
          sx={{
            px: 4,
            py: 3,
            borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            zIndex: 10,
          }}
        >
          <Box>
            <Typography
              id="apply-modal-title"
              variant="h6"
              sx={{
                fontWeight: 700,
                color: isDarkMode ? "#fff" : "#0f172a",
                lineHeight: 1.2,
              }}
            >
              Apply for {jobTitle || "this position"}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b", mt: 0.5 }}
            >
              Share your details and resume with us.
            </Typography>
          </Box>
          <IconButton
            onClick={handleClose}
            sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Form Wrapper:
          Using a <form> element (via Box component="form") ensures that browser extensions 
          (like autofill/fake data generators) and accessibility tools correctly recognize 
          the input fields as a single cohesive form.
        */}
        <Box component="form" noValidate onSubmit={handleSubmit}>
          {/* Form Content Section */}
          <Box sx={{ p: 4 }}>
            {apiError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {apiError}
              </Alert>
            )}

            <Grid container spacing={2}>
              {/* First Name Field */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  First Name*
                </Typography>
                <TextField
                  fullWidth
                  placeholder="Jane"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  error={!!errors.firstName}
                  helperText={errors.firstName}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      },
                    },
                    "& input": { color: isDarkMode ? "#fff" : "#0f172a" },
                  }}
                />
              </Grid>

              {/* Last Name Field */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  Last Name*
                </Typography>
                <TextField
                  fullWidth
                  placeholder="Doe"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  error={!!errors.lastName}
                  helperText={errors.lastName}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      },
                    },
                    "& input": { color: isDarkMode ? "#fff" : "#0f172a" },
                  }}
                />
              </Grid>

              {/* Email Field */}
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  Email Address*
                </Typography>
                <TextField
                  fullWidth
                  placeholder="jane@example.com"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  error={!!errors.email}
                  helperText={errors.email}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      },
                    },
                    "& input": { color: isDarkMode ? "#fff" : "#0f172a" },
                  }}
                />
              </Grid>

              {/* Phone Field */}
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  Phone Number (Optional)
                </Typography>
                <TextField
                  fullWidth
                  placeholder="0803 123 4567"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  error={!!errors.phone}
                  helperText={errors.phone}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      },
                    },
                    "& input": { color: isDarkMode ? "#fff" : "#0f172a" },
                  }}
                />
              </Grid>

              {/* LinkedIn Field */}
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  LinkedIn URL (Optional)
                </Typography>
                <TextField
                  fullWidth
                  type="url" // Enforce browser-level URL validation natively
                  placeholder="https://linkedin.com/in/..."
                  name="linkedInUrl"
                  value={formData.linkedInUrl}
                  onChange={handleInputChange}
                  error={!!errors.linkedInUrl}
                  helperText={errors.linkedInUrl}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LinkIcon sx={{ color: "text.secondary" }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      },
                    },
                    "& input": { color: isDarkMode ? "#fff" : "#0f172a" },
                  }}
                />
              </Grid>

              {/* Portfolio Field */}
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  Portfolio URL (Optional)
                </Typography>
                <TextField
                  fullWidth
                  type="url" // Enforce browser-level URL validation natively
                  placeholder="https://..."
                  name="portfolioUrl"
                  value={formData.portfolioUrl}
                  onChange={handleInputChange}
                  error={!!errors.portfolioUrl}
                  helperText={errors.portfolioUrl}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LanguageIcon sx={{ color: "text.secondary" }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      },
                    },
                    "& input": { color: isDarkMode ? "#fff" : "#0f172a" },
                  }}
                />
              </Grid>

              {/* Resume Upload Box */}
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  Resume/CV*
                </Typography>

                {!selectedFile ? (
                  <Box
                    component="label"
                    sx={{
                      border: `2px dashed ${isDarkMode ? "#334155" : "#cbd5e1"}`,
                      borderRadius: 2,
                      p: 4,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      bgcolor: isDarkMode ? "rgba(30, 41, 59, 0.5)" : "#f8fafc",
                      transition: "all 0.2s",
                      "&:hover": {
                        borderColor: "#137fec",
                        bgcolor: isDarkMode
                          ? "rgba(19, 127, 236, 0.1)"
                          : "rgba(239, 246, 255, 0.5)",
                      },
                    }}
                  >
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.doc,.docx"
                      onChange={handleFileChange}
                    />
                    <CloudUploadIcon
                      sx={{ fontSize: 40, color: "#137fec", mb: 1 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        color: isDarkMode ? "#fff" : "#0f172a",
                        fontWeight: 600,
                      }}
                    >
                      Click to upload or drag and drop
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                    >
                      PDF, DOCX up to 5MB
                    </Typography>
                  </Box>
                ) : (
                  <Paper
                    elevation={0}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      p: 2,
                      borderRadius: 2,
                      border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 1,
                          bgcolor: "rgba(19, 127, 236, 0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <InsertDriveFileIcon sx={{ color: "#137fec" }} />
                      </Box>
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: isDarkMode ? "#fff" : "#0f172a",
                          }}
                        >
                          {selectedFile.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                        >
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </Typography>
                      </Box>
                    </Box>
                    <IconButton onClick={handleClearFile} size="small">
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </Paper>
                )}
              </Grid>
            </Grid>
          </Box>

          {/* Footer Actions */}
          <Box
            sx={{
              p: 3,
              borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 2,
              position: "sticky",
              bottom: 0,
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
              zIndex: 10,
            }}
          >
            <Button
              onClick={handleClose}
              sx={{
                px: 3,
                height: 48,
                borderRadius: 3,
                color: isDarkMode ? "#cbd5e1" : "#475569",
                fontWeight: 500,
                textTransform: "none",
                "&:hover": {
                  bgcolor: isDarkMode ? "#1e293b" : "#f1f5f9",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !selectedFile}
              sx={{
                px: 4,
                height: 48,
                borderRadius: 3,
                bgcolor: "#137fec",
                color: "#fff",
                fontWeight: 500,
                textTransform: "none",
                boxShadow: "0 10px 15px -3px rgba(19, 127, 236, 0.3)",
                "&:hover": {
                  bgcolor: "#2563eb",
                  boxShadow: "0 10px 15px -3px rgba(19, 127, 236, 0.4)",
                },
                // Disabled style
                "&.Mui-disabled": {
                  bgcolor: isDarkMode ? "#334155" : "#e2e8f0",
                  color: isDarkMode ? "#94a3b8" : "#94a3b8",
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Submit Application"
              )}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Modal>
  );
};

export default JobApplicationModal;
