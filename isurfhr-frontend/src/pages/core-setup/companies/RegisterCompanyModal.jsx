import React, { useState, useEffect } from "react";
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
  Box,
  Typography,
  Alert,
  useTheme,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CompanyCreatedSuccessModal from "./CompanyCreatedSuccessModal";
import RegistrationFailedModal from "../../../components/RegistrationFailedModal";
import { registerCompany } from "@/services/CompanyService";
import * as Yup from "yup";
import { useNavigate } from "react-router-dom";

/**
 * Default state for the registration form.
 * Defined outside the component to prevent unnecessary re-creations on render
 * and resolve React Hook useEffect missing dependency warnings.
 */
const defaultFormState = {
  companyName: "",
  email: "",
  phone: "",
  address: "",
  taxId: "",
  logo: "",
};

/**
 * Modal component for Registering and Editing companies.
 * Integrates Yup validation to handle error tracking seamlessly.
 */
const CompanyRegistrationModal = ({ open, onClose, onSubmit, initialData }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const isEditMode = Boolean(initialData);

  // State for modals
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const [form, setForm] = useState(defaultFormState);
  const [errors, setErrors] = useState({});

  // Populate data when modal opens (handles both Edit and Register modes)
  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          companyName: initialData.name || "",
          email: initialData.email || "",
          phone: initialData.phone || "",
          address: initialData.address || "",
          taxId: initialData.taxId || "",
          logo: initialData.logo || "",
        });
      } else {
        setForm(defaultFormState);
      }
      setErrors({});
      setApiError("");
    }
  }, [open, initialData]);

  // Yup Validation Schema
  const validationSchema = Yup.object().shape({
    companyName: Yup.string().required("Company name is required"),
    taxId: Yup.string().required("Tax ID is required"),
    email: Yup.string()
      .email("Email must be a valid email address")
      .required("Email is required"),
    phone: Yup.string()
      .matches(/^[+]?[\d\s-()]*$/, "Please enter a valid phone number")
      .required("Phone number is required"),
    address: Yup.string().required("Company address is required"),
    logo: Yup.string(), // Optional
  });

  const handleLogoChange = (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, logo: "Only image files are allowed" }));
      return;
    }

    // Optional: Add file size validation (e.g., max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setErrors((prev) => ({
        ...prev,
        logo: "File size should be less than 5MB",
      }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((prev) => ({
        ...prev,
        logo: reader.result,
      }));
      setErrors((prev) => ({ ...prev, logo: "" }));
    };
    reader.onerror = () => {
      setErrors((prev) => ({ ...prev, logo: "Failed to read the image file" }));
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleLogoChange(file);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Clear API errors when user starts typing again
    if (apiError) setApiError("");

    setForm((prev) => ({ ...prev, [name]: value }));

    // Clear specific field errors dynamically when typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const removeLogo = (e) => {
    if (e) e.stopPropagation();
    setForm((prev) => ({ ...prev, logo: "" }));
    setErrors((prev) => ({ ...prev, logo: "" }));
  };

  // Success Modal Handlers
  const handleSuccessClose = () => {
    setShowSuccessModal(false);
  };

  const handleViewCompany = () => {
    setShowSuccessModal(false);

    // Map the form data to immediately populate the profile view
    const newCompanyData = {
      name: form.companyName,
      email: form.email,
      phone: form.phone,
      address: form.address,
      taxId: form.taxId,
      logo: form.logo,
      status: "Active",
    };

    navigate("/companies/profile", { state: { company: newCompanyData } });
    onClose(); // Ensure the underlying registration modal is also closed
  };

  // Error Modal Handlers
  const handleErrorClose = () => {
    setShowErrorModal(false);
  };

  const handleTryAgain = () => {
    setShowErrorModal(false);
  };

  const handleSubmit = async () => {
    try {
      // Validate form strictly using Yup schema
      await validationSchema.validate(form, { abortEarly: false });
      setErrors({});
    } catch (validationErrors) {
      const newErrors = {};
      // Extract specific path errors from Yup's validation exception
      validationErrors.inner.forEach((err) => {
        newErrors[err.path] = err.message;
      });
      setErrors(newErrors);
      setApiError("Please fill in all required fields correctly.");
      return;
    }

    setLoading(true);
    setApiError("");

    try {
      // Prepare payload securely
      const payload = {
        companyName: form.companyName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        taxId: form.taxId,
      };

      if (form.logo) {
        payload.logo = form.logo;
      }

      if (isEditMode) {
        // Logic for editing mode
        // TODO: Replace setTimeout with your actual API endpoint for updating a company (e.g. `updateCompany(initialData.id, payload)`)
        await new Promise((resolve) => setTimeout(resolve, 800)); // Simulate mock delay for edit resolving

        console.log("Successfully Simulated Edit Mode for Company:", payload);

        setLoading(false);
        onClose();
        onSubmit();
      } else {
        // Normal Creation Mode using existing API
        const response = await registerCompany(payload);

        if (response.data.success) {
          setLoading(false);
          onClose();
          setShowSuccessModal(true);
        }
      }
    } catch (err) {
      console.error("Company Registration Error:", err);
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Network error. Unable to connect to server.";
      setApiError(errorMessage);
      setShowErrorModal(true);
      setLoading(false);
    }
  };

  const resetFormAndClose = () => {
    if (loading) return;
    setForm(defaultFormState);
    setErrors({});
    setApiError("");
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={resetFormAndClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: isDark ? "#1e293b" : "#ffffff",
            backgroundImage: "none",
            boxShadow: isDark
              ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
              : "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          },
        }}
        slotProps={{
          backdrop: {
            sx: {
              backdropFilter: "blur(4px)",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
            p: 3,
          }}
        >
          <Typography
            variant="h6"
            component="span"
            sx={{
              fontWeight: 700,
              color: "text.primary",
              fontSize: "1.125rem",
            }}
          >
            {isEditMode ? "Edit Company Details" : "Register New Company"}
          </Typography>
          <IconButton
            onClick={resetFormAndClose}
            aria-label="close"
            disabled={loading}
            size="small"
            sx={{
              color: "text.secondary",
              "&:hover": {
                bgcolor: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
                color: "text.primary",
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 4 }}>
          {apiError && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {apiError}
            </Alert>
          )}

          <Box component="form" noValidate autoComplete="off">
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Company Name
                </Typography>
                <TextField
                  fullWidth
                  name="companyName"
                  placeholder="e.g. Global Tech Ltd"
                  value={form.companyName}
                  onChange={handleChange}
                  error={!!errors.companyName}
                  helperText={errors.companyName}
                  variant="outlined"
                  size="small"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#f8fafc",
                      "& fieldset": {
                        borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                      },
                      "&:hover fieldset": {
                        borderColor: isDark ? "#94a3b8" : "#94a3b8",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                    },
                    "& input": { color: "text.primary" },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Tax ID
                </Typography>
                <TextField
                  fullWidth
                  name="taxId"
                  placeholder="TAX-123456789"
                  value={form.taxId}
                  onChange={handleChange}
                  error={!!errors.taxId}
                  helperText={errors.taxId}
                  variant="outlined"
                  size="small"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#f8fafc",
                      "& fieldset": {
                        borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                      },
                      "&:hover fieldset": {
                        borderColor: isDark ? "#94a3b8" : "#94a3b8",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                    },
                    "& input": { color: "text.primary" },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Official Email
                </Typography>
                <TextField
                  fullWidth
                  name="email"
                  type="email"
                  placeholder="company@example.com"
                  value={form.email}
                  onChange={handleChange}
                  error={!!errors.email}
                  helperText={errors.email}
                  variant="outlined"
                  size="small"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#f8fafc",
                      "& fieldset": {
                        borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                      },
                      "&:hover fieldset": {
                        borderColor: isDark ? "#94a3b8" : "#94a3b8",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                    },
                    "& input": { color: "text.primary" },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Mobile Number
                </Typography>
                <TextField
                  fullWidth
                  name="phone"
                  placeholder="+1 (555) 123-4567"
                  value={form.phone}
                  onChange={handleChange}
                  error={!!errors.phone}
                  helperText={errors.phone}
                  variant="outlined"
                  size="small"
                  disabled={loading}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#f8fafc",
                      "& fieldset": {
                        borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                      },
                      "&:hover fieldset": {
                        borderColor: isDark ? "#94a3b8" : "#94a3b8",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                    },
                    "& input": { color: "text.primary" },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Company Address
                </Typography>
                <TextField
                  fullWidth
                  name="address"
                  placeholder="123 Tech Street, Silicon Valley, CA"
                  value={form.address}
                  onChange={handleChange}
                  error={!!errors.address}
                  helperText={errors.address}
                  variant="outlined"
                  multiline
                  rows={3}
                  disabled={loading}
                  inputProps={{ maxLength: 500 }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#f8fafc",
                      "& fieldset": {
                        borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                      },
                      "&:hover fieldset": {
                        borderColor: isDark ? "#94a3b8" : "#94a3b8",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                    },
                    "& textarea": { color: "text.primary" },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Upload Company Logo (Optional)
                </Typography>
                <Box
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() =>
                    !loading &&
                    document.getElementById("logo-upload-input").click()
                  }
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1.5,
                    p: 4,
                    width: "100%",
                    textAlign: "center",
                    borderRadius: 2,
                    border: `2px dashed ${
                      isDragging
                        ? "#137fec"
                        : form.logo
                          ? isDark
                            ? "#475569"
                            : "#cbd5e1"
                          : isDark
                            ? "#334155"
                            : "#cbd5e1"
                    }`,
                    bgcolor: isDragging
                      ? isDark
                        ? alpha("#137fec", 0.15)
                        : "rgba(19, 127, 236, 0.05)"
                      : form.logo
                        ? isDark
                          ? "rgba(255,255,255,0.02)"
                          : "#f8fafc"
                        : isDark
                          ? "#0f172a"
                          : "#f8fafc",
                    cursor: loading ? "default" : "pointer",
                    transition: "all 0.2s ease",
                    opacity: loading ? 0.7 : 1,
                    "&:hover": {
                      bgcolor:
                        !loading &&
                        (isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9"),
                      borderColor: !loading && (isDark ? "#64748b" : "#94a3b8"),
                    },
                  }}
                >
                  <input
                    id="logo-upload-input"
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={loading}
                    onChange={(e) => handleLogoChange(e.target.files[0])}
                  />

                  {form.logo ? (
                    <>
                      <Box
                        component="img"
                        src={form.logo}
                        alt="Company Logo Preview"
                        sx={{
                          width: "100%",
                          maxHeight: 120,
                          objectFit: "contain",
                          borderRadius: 1,
                          bgcolor: "#fff",
                          p: 1,
                          border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                        }}
                      />
                      <Box sx={{ mt: 1 }}>
                        <Button
                          size="small"
                          color="error"
                          onClick={removeLogo}
                          sx={{ textTransform: "none", fontWeight: 600 }}
                        >
                          Remove logo
                        </Button>
                      </Box>
                    </>
                  ) : (
                    <>
                      <CloudUploadIcon
                        sx={{
                          fontSize: 40,
                          color: isDark ? "#475569" : "#94a3b8",
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ color: "text.primary", fontWeight: 500 }}
                      >
                        Drag & drop or click to browse
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        PNG, JPG, SVG up to 5MB
                      </Typography>
                    </>
                  )}
                </Box>
                {errors.logo && (
                  <Typography
                    variant="caption"
                    color="error"
                    sx={{ mt: 1, display: "block" }}
                  >
                    {errors.logo}
                  </Typography>
                )}
              </Grid>
            </Grid>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            p: 3,
            borderTop: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
            bgcolor: isDark ? alpha("#1e293b", 0.5) : "#f8fafc",
            gap: 1.5,
          }}
        >
          <Button
            onClick={resetFormAndClose}
            variant="outlined"
            disabled={loading}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              px: 3,
              color: "text.secondary",
              borderColor: isDark ? theme.palette.divider : "#cbd5e1",
              bgcolor: isDark ? "#1e293b" : "#ffffff",
              "&:hover": {
                bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
                borderColor: theme.palette.divider,
                color: "text.primary",
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
              bgcolor: "#137fec",
              color: "#ffffff",
              textTransform: "none",
              fontWeight: 600,
              px: 3,
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
              "&:hover": {
                bgcolor: "#1170d0",
              },
            }}
          >
            {loading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1, color: "inherit" }} />
                {isEditMode ? "Saving..." : "Creating..."}
              </>
            ) : isEditMode ? (
              "Save Changes"
            ) : (
              "Create Company"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Modal */}
      <CompanyCreatedSuccessModal
        open={showSuccessModal}
        onClose={handleSuccessClose}
        onViewCompany={handleViewCompany}
      />

      {/* Error Modal */}
      <RegistrationFailedModal
        isCompany
        open={showErrorModal}
        onClose={handleErrorClose}
        onTryAgain={handleTryAgain}
      />
    </>
  );
};

export default CompanyRegistrationModal;
