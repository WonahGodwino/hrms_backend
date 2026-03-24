import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
  Link,
  useTheme,
  Container,
  Tooltip,
  InputAdornment,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SaveIcon from "@mui/icons-material/Save";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useNavigate } from "react-router-dom";

// Prop to toggle state: 'published' | 'draft'
const JobSubmissionSuccessView = ({ status = "published", onReset }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const jobUrl = "https://company.com/careers/senior-product-designer";

  const handleCopy = () => {
    navigator.clipboard.writeText(jobUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBackToDashboard = () => {
    navigate("/jobs");
  };

  const isPublished = status === "published";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        color: isDarkMode ? "#ffffff" : "#111418",
        fontFamily: '"Inter", sans-serif',
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: { xs: 4, md: 6 },
        px: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={isDarkMode ? 8 : 3}
          sx={{
            width: "100%",
            bgcolor: isDarkMode ? "#1a2632" : "#ffffff",
            borderRadius: 3, // rounded-xl
            border: `1px solid ${isDarkMode ? "#2a3b4d" : "#e5e7eb"}`,
            overflow: "hidden",
            boxShadow: isDarkMode
              ? "0 10px 15px -3px rgba(0, 0, 0, 0.5)"
              : "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Box
            sx={{
              p: { xs: 4, md: 5 }, // p-8 md:p-10
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* Icon */}
            <Box
              sx={{
                width: 80, // size-20
                height: 80,
                borderRadius: "50%",
                bgcolor: isPublished
                  ? isDarkMode
                    ? "rgba(20, 83, 45, 0.2)"
                    : "#f0fdf4" // green-900/20 / green-50
                  : isDarkMode
                  ? "rgba(30, 58, 138, 0.2)"
                  : "#eff6ff", // blue-900/20 / blue-50
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 3, // mb-6
              }}
            >
              {isPublished ? (
                <CheckCircleIcon
                  sx={{
                    fontSize: 48, // text-5xl (approx)
                    color: isDarkMode ? "#4ade80" : "#16a34a", // green-400 / green-600
                  }}
                />
              ) : (
                <SaveIcon
                  sx={{
                    fontSize: 48,
                    color: "#137fec", // primary
                  }}
                />
              )}
            </Box>

            {/* Headings */}
            <Typography
              variant="h4"
              component="h1"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.5rem", md: "2rem" }, // text-2xl / 32px
                lineHeight: 1.25,
                color: isDarkMode ? "#fff" : "#111418",
                mb: 1.5, // mb-3
              }}
            >
              {isPublished ? "Job Posted Successfully!" : "Job Saved as Draft"}
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: isDarkMode ? "#9ca3af" : "#6b7280", // gray-400 / gray-500
                fontSize: "1rem",
                lineHeight: 1.6,
                maxWidth: "90%",
                mb: isPublished ? 4 : 3,
              }}
            >
              The position{" "}
              <Box
                component="span"
                sx={{ fontWeight: 600, color: isDarkMode ? "#fff" : "#111418" }}
              >
                Senior Product Designer
              </Box>{" "}
              {isPublished
                ? "is now live and accepting applications."
                : "has been saved. You can edit and publish it later from the dashboard."}
            </Typography>

            {/* Conditional Content based on State */}
            {isPublished ? (
              // Published State: Job URL Input
              <Box sx={{ width: "100%", mb: 4, position: "relative" }}>
                <TextField
                  fullWidth
                  value={jobUrl}
                  variant="outlined"
                  InputProps={{
                    readOnly: true,
                    startAdornment: (
                      <InputAdornment position="start">
                        <LinkIcon sx={{ color: "#9ca3af" }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={copied ? "Copied!" : "Copy URL"}>
                          <IconButton onClick={handleCopy} edge="end">
                            <ContentCopyIcon
                              sx={{
                                color: copied ? "#10b981" : "#9ca3af", // green if copied
                                transition: "color 0.2s",
                                "&:hover": { color: "#137fec" },
                              }}
                            />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2, // rounded-lg
                      bgcolor: isDarkMode ? "#101922" : "#f9fafb", // gray-900 / gray-50
                      "& fieldset": {
                        borderColor: isDarkMode ? "#374151" : "#e5e7eb", // gray-700 / gray-200
                      },
                      "&:hover fieldset": {
                        borderColor: isDarkMode ? "#4b5563" : "#d1d5db",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                      },
                      input: {
                        color: isDarkMode ? "#d1d5db" : "#4b5563", // gray-300 / gray-600
                        fontSize: "0.875rem",
                      },
                    },
                  }}
                />
              </Box>
            ) : (
              // Draft State: Preview Link
              <Box
                sx={{
                  width: "100%",
                  mt: 1,
                  mb: 4,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Link
                  href="#"
                  underline="none"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    color: "#137fec", // primary
                    fontWeight: 600,
                    "&:hover": {
                      color: isDarkMode ? "#60a5fa" : "#1d4ed8", // blue-400 / blue-700
                      "& .MuiSvgIcon-root": { transform: "scale(1.1)" },
                    },
                  }}
                >
                  <VisibilityIcon
                    sx={{
                      fontSize: 20,
                      transition: "transform 0.2s",
                      mr: 0.5,
                    }}
                  />
                  Preview Job Details
                </Link>
              </Box>
            )}

            {/* Actions */}
            <Box
              sx={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              <Button
                fullWidth
                variant="contained"
                onClick={() => navigate("/jobs/1")} // Mock View Job
                sx={{
                  bgcolor: "#137fec", // primary
                  color: "#fff",
                  fontWeight: 700,
                  textTransform: "none",
                  borderRadius: 2,
                  height: 48,
                  fontSize: "1rem",
                  "&:hover": { bgcolor: "#2563eb" }, // blue-600
                }}
              >
                View Job
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleBackToDashboard}
                sx={{
                  bgcolor: "transparent",
                  color: isDarkMode ? "#fff" : "#111418",
                  borderColor: isDarkMode ? "#4b5563" : "#e5e7eb", // gray-600 / gray-200
                  fontWeight: 700,
                  textTransform: "none",
                  borderRadius: 2,
                  height: 48,
                  fontSize: "1rem",
                  "&:hover": {
                    bgcolor: isDarkMode ? "#253341" : "#f9fafb", // custom dark hover / gray-50
                    borderColor: isDarkMode ? "#4b5563" : "#d1d5db",
                  },
                }}
              >
                Back to Dashboard
              </Button>
              <Link
                component="button"
                onClick={onReset}
                underline="none"
                sx={{
                  mt: 1,
                  color: "#137fec",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  "&:hover": {
                    color: isDarkMode ? "#60a5fa" : "#1d4ed8", // blue-400 / blue-700
                  },
                }}
              >
                Post Another Job
              </Link>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default JobSubmissionSuccessView;
