import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  Avatar,
  Grid,
  useTheme,
  CircularProgress,
  Alert,
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LaptopMacIcon from "@mui/icons-material/LaptopMac";
import ScheduleIcon from "@mui/icons-material/Schedule";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import PaymentsIcon from "@mui/icons-material/Payments";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { useNavigate, useParams } from "react-router-dom";
import { getJobs } from "@/services/RecruitmentService";

/**
 * HRJobDetailsView Component
 * Displays the full details of a job posting for HR/Admin users.
 * Designed identically to the public JobDetailsView but omits the application flow.
 */
const HRJobDetailsView = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const { jobId } = useParams();

  // State Management
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch Job Details on mount
  useEffect(() => {
    const fetchJobDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch jobs from the secure internal API
        const response = await getJobs();

        if (response.data && response.data.success) {
          const jobsList = response.data.data.jobs || [];
          const foundJob = jobsList.find((j) => j.id === jobId);

          if (foundJob) {
            setJob(foundJob);
          } else {
            setError("Job not found or you do not have permission to view it.");
          }
        } else {
          setError("Failed to fetch job details.");
        }
      } catch (err) {
        console.error("Error loading job:", err);
        setError("An error occurred while loading job details.");
      } finally {
        setLoading(false);
      }
    };

    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  // Navigation Handlers
  const handleBack = () => {
    navigate("/jobs");
  };

  const handleEditJob = () => {
    // Navigate to edit page with the job ID
    navigate("/jobs/create", { state: { jobData: job } });
  };

  // Helper to format 'Time Ago'
  const formatTimeAgo = (dateString) => {
    if (!dateString) return "Recently";
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 30) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };

  // Helper for explicit date display
  const formatDate = (dateString) => {
    if (!dateString) return "Until filled";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Loading State
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Error State
  if (error || !job) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        }}
      >
        <Alert severity="error">{error || "Job not found"}</Alert>
        <Button onClick={handleBack} sx={{ ml: 2 }}>
          Back to Jobs
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        color: isDarkMode ? "#f1f5f9" : "#0f172a",
        fontFamily: '"Inter", sans-serif',
        py: { xs: 4, md: 6 },
        px: { xs: 2, sm: 3 },
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Main Content Container */}
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: "900px",
          bgcolor: isDarkMode ? "#0f172a" : "#ffffff",
          borderRadius: 2,
          border: `1px solid ${isDarkMode ? "#1e293b" : "#e2e8f0"}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Job Header Section */}
        <Box
          component="header"
          sx={{
            p: { xs: 3, md: 5 },
            borderBottom: `1px solid ${isDarkMode ? "#1e293b" : "#f1f5f9"}`,
          }}
        >
          <Button
            onClick={handleBack}
            variant="text"
            sx={{
              mb: 2,
              color: isDarkMode ? "#94a3b8" : "#64748b",
              textTransform: "none",
              pl: 0,
              "&:hover": {
                bgcolor: "transparent",
                textDecoration: "underline",
              },
            }}
          >
            &larr; Back to Jobs
          </Button>

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 3,
              alignItems: "flex-start",
            }}
          >
            {/* Company Logo Avatar */}
            <Avatar
              sx={{
                width: { xs: 64, md: 80 },
                height: { xs: 64, md: 80 },
                border: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                boxShadow: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
                bgcolor: isDarkMode ? "#334155" : "#e0e7ff",
                color: isDarkMode ? "#fff" : "#137fec",
                fontSize: "2rem",
                fontWeight: 700,
              }}
            >
              {job.companyName ? job.companyName.charAt(0) : "C"}
            </Avatar>

            {/* Header Information */}
            <Box sx={{ flex: 1, width: "100%" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", md: "row" },
                  justifyContent: "space-between",
                  alignItems: { md: "flex-start" },
                  gap: 2,
                  mb: 1,
                }}
              >
                <Box>
                  <Typography
                    variant="h3"
                    component="h1"
                    sx={{
                      fontSize: { xs: "1.875rem", md: "2.25rem" },
                      fontWeight: 700,
                      lineHeight: 1.2,
                      letterSpacing: "-0.025em",
                      color: isDarkMode ? "#ffffff" : "#0f172a",
                    }}
                  >
                    {job.title}
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 1,
                      mt: 1,
                      color: isDarkMode ? "#94a3b8" : "#64748b",
                      fontWeight: 500,
                      fontSize: "1rem",
                    }}
                  >
                    <Typography
                      component="span"
                      sx={{
                        fontSize: "1.125rem",
                        color: isDarkMode ? "#e2e8f0" : "#334155",
                      }}
                    >
                      {job.companyName || "Company Name"}
                    </Typography>
                    <Typography
                      component="span"
                      sx={{ display: { xs: "none", sm: "inline" } }}
                    >
                      •
                    </Typography>
                    <Box
                      component="span"
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <LocationOnIcon sx={{ fontSize: 18 }} />
                      {job.location || "Remote"}
                    </Box>
                    <Typography
                      component="span"
                      sx={{ display: { xs: "none", sm: "inline" } }}
                    >
                      •
                    </Typography>
                    <Typography
                      component="span"
                      sx={{
                        fontSize: "0.875rem",
                        fontWeight: 400,
                        color: "#94a3b8",
                      }}
                    >
                      Posted {formatTimeAgo(job.publishedAt || job.createdAt)}
                    </Typography>
                  </Box>
                </Box>

                {/* Dynamic Status Badge */}
                <Chip
                  icon={
                    job.status === "ACTIVE" || job.status === "OPEN" ? (
                      <CheckCircleIcon sx={{ fontSize: "16px !important" }} />
                    ) : undefined
                  }
                  label={job.status || "OPEN"}
                  sx={{
                    bgcolor: isDarkMode ? "rgba(6, 78, 59, 0.2)" : "#ecfdf5",
                    color: isDarkMode ? "#34d399" : "#047857",
                    border: `1px solid ${
                      isDarkMode ? "rgba(6, 78, 59, 0.5)" : "#d1fae5"
                    }`,
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    height: 28,
                    alignSelf: "flex-start",
                    flexShrink: 0,
                    "& .MuiChip-icon": { color: "inherit" },
                    // Color fallback based on status
                    ...(job.status === "CLOSED" && {
                      bgcolor: isDarkMode
                        ? "rgba(239, 68, 68, 0.1)"
                        : "#fee2e2",
                      color: isDarkMode ? "#f87171" : "#b91c1c",
                      border: `1px solid ${isDarkMode ? "rgba(239, 68, 68, 0.3)" : "#fecaca"}`,
                    }),
                    ...(job.status === "DRAFT" && {
                      bgcolor: isDarkMode
                        ? "rgba(245, 158, 11, 0.1)"
                        : "#fef3c7",
                      color: isDarkMode ? "#fbbf24" : "#b45309",
                      border: `1px solid ${isDarkMode ? "rgba(245, 158, 11, 0.3)" : "#fde68a"}`,
                    }),
                  }}
                />
              </Box>

              {/* Metadata Quick Chips */}
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 3 }}>
                <Chip
                  icon={<LaptopMacIcon sx={{ fontSize: "20px !important" }} />}
                  label={job.location || "Remote"}
                  sx={{
                    bgcolor: isDarkMode ? "#1e293b" : "#f1f5f9",
                    color: isDarkMode ? "#e2e8f0" : "#334155",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    height: 40,
                    px: 1,
                    border: `1px solid ${
                      isDarkMode ? "#334155" : "transparent"
                    }`,
                    "& .MuiChip-icon": {
                      color: isDarkMode ? "#94a3b8" : "#64748b",
                    },
                  }}
                />
                <Chip
                  icon={<ScheduleIcon sx={{ fontSize: "20px !important" }} />}
                  label={job.employmentType || "Full-time"}
                  sx={{
                    bgcolor: isDarkMode ? "#1e293b" : "#f1f5f9",
                    color: isDarkMode ? "#e2e8f0" : "#334155",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    height: 40,
                    px: 1,
                    border: `1px solid ${
                      isDarkMode ? "#334155" : "transparent"
                    }`,
                    "& .MuiChip-icon": {
                      color: isDarkMode ? "#94a3b8" : "#64748b",
                    },
                  }}
                />
                <Chip
                  icon={
                    <AttachMoneyIcon sx={{ fontSize: "20px !important" }} />
                  }
                  label={job.salary || "Competitive"}
                  sx={{
                    bgcolor: isDarkMode
                      ? "rgba(19, 127, 236, 0.2)"
                      : "rgba(19, 127, 236, 0.1)",
                    color: isDarkMode ? "#60a5fa" : "#137fec",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    height: 40,
                    px: 1,
                    border: "1px solid rgba(19, 127, 236, 0.2)",
                    "& .MuiChip-icon": { color: "inherit" },
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Job Description Body */}
        <Box
          sx={{
            p: { xs: 3, md: 5 },
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {/* Formatted HTML Description */}
          <Box
            component="section"
            sx={{
              "& h1, & h2, & h3": {
                fontWeight: 700,
                color: isDarkMode ? "#fff" : "#0f172a",
                mb: 2,
                mt: 3,
              },
              "& h3": { fontSize: "1.25rem" },
              "& p": {
                color: isDarkMode ? "#cbd5e1" : "#475569",
                lineHeight: 1.7,
                mb: 2,
              },
              "& ul, & ol": {
                pl: 3,
                mb: 2,
                color: isDarkMode ? "#cbd5e1" : "#475569",
              },
              "& li": {
                mb: 1,
                lineHeight: 1.6,
              },
              "& hr": {
                border: "none",
                borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                my: 4,
              },
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: job.description }} />
          </Box>

          {/* Benefits Section */}
          <Box component="section">
            <Typography
              variant="h6"
              component="h2"
              sx={{
                fontWeight: 700,
                mb: 3,
                color: isDarkMode ? "#fff" : "#0f172a",
              }}
            >
              Benefits & Perks
            </Typography>
            <Grid container spacing={2}>
              {[
                {
                  icon: <HealthAndSafetyIcon />,
                  label: "Full Health Coverage",
                  color: "blue",
                },
                {
                  icon: <PaymentsIcon />,
                  label: "Competitive Equity",
                  color: "purple",
                },
                {
                  icon: <FlightTakeoffIcon />,
                  label: "Unlimited PTO",
                  color: "amber",
                },
                {
                  icon: <FitnessCenterIcon />,
                  label: "Gym Stipend",
                  color: "teal",
                },
              ].map((benefit, index) => {
                const colorMap = {
                  blue: {
                    bg: isDarkMode ? "rgba(30, 58, 138, 0.3)" : "#dbeafe",
                    text: isDarkMode ? "#60a5fa" : "#2563eb",
                  },
                  purple: {
                    bg: isDarkMode ? "rgba(88, 28, 135, 0.3)" : "#f3e8ff",
                    text: isDarkMode ? "#c084fc" : "#9333ea",
                  },
                  amber: {
                    bg: isDarkMode ? "rgba(120, 53, 15, 0.3)" : "#fef3c7",
                    text: isDarkMode ? "#fbbf24" : "#d97706",
                  },
                  teal: {
                    bg: isDarkMode ? "rgba(19, 78, 74, 0.3)" : "#ccfbf1",
                    text: isDarkMode ? "#2dd4bf" : "#0d9488",
                  },
                };
                const colors = colorMap[benefit.color];

                return (
                  <Grid size={{ xs: 12, sm: 6 }} key={index}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: isDarkMode
                          ? "rgba(30, 41, 59, 0.5)"
                          : "#f8fafc",
                        border: `1px solid ${
                          isDarkMode ? "#1e293b" : "#f1f5f9"
                        }`,
                      }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          bgcolor: colors.bg,
                          color: colors.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          "& .MuiSvgIcon-root": { fontSize: 20 },
                        }}
                      >
                        {benefit.icon}
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          color: isDarkMode ? "#e2e8f0" : "#334155",
                        }}
                      >
                        {benefit.label}
                      </Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </Box>

        {/* Footer Area without Apply Button */}
        <Box
          component="footer"
          sx={{
            p: { xs: 3, md: 5 },
            bgcolor: isDarkMode ? "rgba(30, 41, 59, 0.3)" : "#f8fafc",
            borderTop: `1px solid ${isDarkMode ? "#1e293b" : "#f1f5f9"}`,
            mt: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Typography
            variant="body2"
            sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
          >
            Applications close on{" "}
            <Box
              component="span"
              sx={{
                fontWeight: 600,
                color: isDarkMode ? "#e2e8f0" : "#0f172a",
              }}
            >
              {formatDate(job.expirationDate)}
            </Box>
          </Typography>

          {/* Quick Actions for HR */}
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="outlined"
              onClick={handleEditJob}
              sx={{
                borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                color: isDarkMode ? "#e2e8f0" : "#475569",
                textTransform: "none",
                fontWeight: 600,
                "&:hover": {
                  borderColor: isDarkMode ? "#94a3b8" : "#94a3b8",
                },
              }}
            >
              Edit Job
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default HRJobDetailsView;
