import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  MenuItem,
  Grid,
  useTheme,
  CircularProgress,
  Alert,
} from "@mui/material";
import PublishIcon from "@mui/icons-material/Publish";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";

// Local Components
import JobSubmissionSuccessView from "./JobSubmissionSuccessView";
import RichTextEditor from "@/components/RichTextEditor";

// Services & Context
import { createJob } from "@/services/RecruitmentService";
import { useAuth } from "@/lib/context/AuthContext";
import { getAccessibleCompany } from "@/services/CompanyService";

const CreateJobForm = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const { user } = useAuth();

  // State to manage submission view
  const [submissionStatus, setSubmissionStatus] = useState("idle");

  // Form Data State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    department: "",
    position: "",
    expirationDate: "",
    companyId: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Company Data State
  const [companies, setCompanies] = useState([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  // Fetch Accessible Companies
  useEffect(() => {
    const fetchCompanies = async () => {
      setIsLoadingCompanies(true);
      try {
        const response = await getAccessibleCompany();
        if (response.data && response.data.success) {
          const fetchedCompanies = response.data.data || [];
          setCompanies(fetchedCompanies);

          if (fetchedCompanies.length === 1) {
            setFormData((prev) => ({
              ...prev,
              companyId: fetchedCompanies[0].id,
            }));
          } else if (user?.companyId) {
            setFormData((prev) => ({ ...prev, companyId: user.companyId }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch companies:", err);
      } finally {
        setIsLoadingCompanies(false);
      }
    };

    fetchCompanies();
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleDescriptionChange = (htmlContent) => {
    setFormData((prev) => ({ ...prev, description: htmlContent }));
  };

  const handleCancel = () => {
    navigate("/jobs");
  };

  const handlePublish = async () => {
    setLoading(true);
    setError(null);

    try {
      if (
        !formData.title ||
        !formData.description ||
        !formData.description.trim() === "<p></p>" ||
        !formData.department ||
        !formData.position ||
        !formData.companyId
      ) {
        throw new Error(
          "Please fill in all required fields, including Company and Description.",
        );
      }

      const payload = {
        title: formData.title,
        description: formData.description,
        department: formData.department,
        position: formData.position,
        status: "ACTIVE",
        expirationDate: formData.expirationDate || null,
        companyId: formData.companyId,
      };

      const response = await createJob(payload);

      if (response.data) {
        console.log("Job published:", response.data);
        setSubmissionStatus("published");
      }
    } catch (err) {
      console.error("Failed to publish job:", err);
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to publish job. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!formData.title || !formData.companyId) {
        throw new Error("Title and Company are required even for a draft.");
      }

      const payload = {
        title: formData.title,
        description: formData.description,
        department: formData.department,
        position: formData.position,
        status: "DRAFT",
        expirationDate: formData.expirationDate || null,
        companyId: formData.companyId,
      };

      const response = await createJob(payload);

      if (response.data) {
        console.log("Job saved as draft:", response.data);
        setSubmissionStatus("draft");
      }
    } catch (err) {
      console.error("Failed to save draft:", err);
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to save draft. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmissionStatus("idle");
    setFormData({
      title: "",
      description: "",
      department: "",
      position: "",
      expirationDate: "",
      companyId: "",
    });
    if (companies.length === 1) {
      setFormData((prev) => ({ ...prev, companyId: companies[0].id }));
    }
    setError(null);
  };

  if (submissionStatus !== "idle") {
    return (
      <JobSubmissionSuccessView
        status={submissionStatus}
        jobTitle={formData.title}
        onReset={handleReset}
      />
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        fontFamily: '"Inter", sans-serif',
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: { xs: 5, sm: 6 },
        px: { xs: 2, sm: 3 },
        overflowX: "hidden",
      }}
    >
      {/* Form Card */}
      <Paper
        elevation={isDarkMode ? 2 : 1}
        sx={{
          width: "100%",
          maxWidth: "1000px",
          bgcolor: isDarkMode ? "#1C2733" : "#ffffff",
          borderRadius: 3,
          border: `1px solid ${isDarkMode ? "#262626" : "#e5e5e5"}`,
          overflow: "hidden",
          boxShadow: isDarkMode
            ? "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)"
            : "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Header Section */}
        <Box
          sx={{
            px: { xs: 3, sm: 4 },
            py: 3,
            borderBottom: `1px solid ${isDarkMode ? "#262626" : "#e5e5e5"}`,
          }}
        >
          <Typography
            variant="h4"
            component="h2"
            sx={{
              fontWeight: 700,
              fontSize: "1.875rem",
              color: isDarkMode ? "#ffffff" : "#111418",
              lineHeight: 1.25,
            }}
          >
            Create Job
          </Typography>
          <Typography
            variant="body2"
            sx={{
              mt: 1,
              color: isDarkMode ? "#a3a3a3" : "#617589",
              fontSize: "0.875rem",
              fontWeight: 400,
            }}
          >
            Define role details and matching criteria
          </Typography>
        </Box>

        {/* Form Content */}
        <Box
          component="form"
          sx={{ p: { xs: 3, sm: 4 } }}
          onSubmit={(e) => e.preventDefault()}
        >
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {/* Grid Layout for Inputs */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Title */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography
                variant="subtitle2"
                component="label"
                sx={{
                  display: "block",
                  mb: 1,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: isDarkMode ? "#e5e5e5" : "#111418",
                }}
              >
                Title*
              </Typography>
              <TextField
                fullWidth
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. Senior Product Designer"
                variant="outlined"
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#262626" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#111418",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#404040" : "#d4d4d4",
                    },
                    "&:hover fieldset": {
                      borderColor: isDarkMode ? "#525252" : "#a3a3a3",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#137fec",
                      borderWidth: 2,
                    },
                  },
                }}
              />
            </Grid>

            {/* Position */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography
                variant="subtitle2"
                component="label"
                sx={{
                  display: "block",
                  mb: 1,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: isDarkMode ? "#e5e5e5" : "#111418",
                }}
              >
                Position*
              </Typography>
              <TextField
                fullWidth
                name="position"
                value={formData.position}
                onChange={handleChange}
                placeholder="e.g. Lead Developer"
                variant="outlined"
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#262626" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#111418",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#404040" : "#d4d4d4",
                    },
                    "&:hover fieldset": {
                      borderColor: isDarkMode ? "#525252" : "#a3a3a3",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#137fec",
                      borderWidth: 2,
                    },
                  },
                }}
              />
            </Grid>

            {/* Department */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography
                variant="subtitle2"
                component="label"
                sx={{
                  display: "block",
                  mb: 1,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: isDarkMode ? "#e5e5e5" : "#111418",
                }}
              >
                Department*
              </Typography>
              <TextField
                fullWidth
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder="e.g. Engineering"
                variant="outlined"
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#262626" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#111418",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#404040" : "#d4d4d4",
                    },
                    "&:hover fieldset": {
                      borderColor: isDarkMode ? "#525252" : "#a3a3a3",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#137fec",
                      borderWidth: 2,
                    },
                  },
                }}
              />
            </Grid>

            {/* Expiration Date */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography
                variant="subtitle2"
                component="label"
                sx={{
                  display: "block",
                  mb: 1,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: isDarkMode ? "#e5e5e5" : "#111418",
                }}
              >
                Expiration Date
              </Typography>
              <TextField
                fullWidth
                type="date"
                name="expirationDate"
                value={formData.expirationDate}
                onChange={handleChange}
                variant="outlined"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#262626" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#111418",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#404040" : "#d4d4d4",
                    },
                    "&:hover fieldset": {
                      borderColor: isDarkMode ? "#525252" : "#a3a3a3",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#137fec",
                      borderWidth: 2,
                    },
                  },
                  "& input": {
                    colorScheme: isDarkMode ? "dark" : "light",
                  },
                }}
              />
            </Grid>

            {/* Company Selection */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography
                variant="subtitle2"
                component="label"
                sx={{
                  display: "block",
                  mb: 1,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: isDarkMode ? "#e5e5e5" : "#111418",
                }}
              >
                Company*
              </Typography>
              <TextField
                select
                fullWidth
                name="companyId"
                value={formData.companyId}
                onChange={handleChange}
                disabled={isLoadingCompanies || companies.length === 0}
                placeholder="Select a company"
                variant="outlined"
                required
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#262626" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#111418",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#404040" : "#d4d4d4",
                    },
                    "&:hover fieldset": {
                      borderColor: isDarkMode ? "#525252" : "#a3a3a3",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#137fec",
                      borderWidth: 2,
                    },
                  },
                }}
                SelectProps={{
                  displayEmpty: true,
                  renderValue: (selected) => {
                    if (!selected) {
                      return (
                        <span
                          style={{ color: isDarkMode ? "#a3a3a3" : "#9ca3af" }}
                        >
                          Select a company
                        </span>
                      );
                    }
                    const selectedCompany = companies.find(
                      (c) => c.id === selected,
                    );
                    return selectedCompany
                      ? selectedCompany.companyName
                      : selected;
                  },
                }}
              >
                <MenuItem disabled value="">
                  <em>Select a company</em>
                </MenuItem>
                {companies.map((company) => (
                  <MenuItem key={company.id} value={company.id}>
                    {company.companyName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          {/* Full Width Text Areas */}
          <Box sx={{ mb: 3 }}>
            {/* Description using Custom RichTextEditor */}
            <Box>
              <Typography
                variant="subtitle2"
                component="label"
                sx={{
                  display: "block",
                  mb: 1,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: isDarkMode ? "#e5e5e5" : "#111418",
                }}
              >
                Description*
              </Typography>
              <RichTextEditor
                value={formData.description}
                onChange={handleDescriptionChange}
                isDarkMode={isDarkMode}
              />
            </Box>
          </Box>
        </Box>

        {/* Action Footer */}
        <Box
          sx={{
            px: { xs: 3, sm: 4 },
            py: 3,
            bgcolor: isDarkMode ? "#151e29" : "#f9fafb",
            borderTop: `1px solid ${isDarkMode ? "#262626" : "#e5e5e5"}`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Button
            variant="contained"
            startIcon={
              loading ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <PublishIcon />
              )
            }
            onClick={handlePublish}
            disabled={loading}
            sx={{
              bgcolor: "#059669",
              color: "#fff",
              fontWeight: 500,
              textTransform: "none",
              borderRadius: 2,
              height: 48,
              px: 3,
              "&:hover": { bgcolor: "#047857" },
              "&.Mui-disabled": {
                bgcolor: "#059669",
                opacity: 0.7,
                color: "#fff",
              },
            }}
          >
            {loading ? "Publishing..." : "Publish"}
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveDraft}
            disabled={loading}
            sx={{
              bgcolor: "#137fec",
              color: "#fff",
              fontWeight: 500,
              textTransform: "none",
              borderRadius: 2,
              height: 48,
              px: 3,
              "&:hover": { bgcolor: "#1170d2" },
            }}
          >
            Save as Draft
          </Button>
          <Button
            variant="contained"
            startIcon={<CloseIcon />}
            onClick={handleCancel}
            disabled={loading}
            sx={{
              bgcolor: "#dc2626",
              color: "#fff",
              fontWeight: 500,
              textTransform: "none",
              borderRadius: 2,
              height: 48,
              px: 3,
              ml: "auto",
              "&:hover": { bgcolor: "#b91c1c" },
            }}
          >
            Cancel
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default CreateJobForm;
