import React from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  useTheme,
  keyframes,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useNavigate, useLocation } from "react-router-dom";

// --- Animations ---
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const popUp = keyframes`
  0% { opacity: 0; transform: scale(0.5); }
  100% { opacity: 1; transform: scale(1); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
`;

/**
 * ApplicationSuccessView Component
 * Displays a success confirmation page after a candidate submits a job application.
 * Retrieves dynamic data (job title, company name, messages) via React Router state.
 */
const ApplicationSuccessView = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const location = useLocation();

  // Extract data passed from the application modal via routing state.
  // Fallback values are provided just in case the page is accessed directly.
  const {
    jobTitle = "the position",
    companyName = "the company",
    email = "your email address",
    message = "Application submitted successfully.",
    note = "You can apply to other jobs at this company, but cannot apply again to this same job.",
  } = location.state || {};

  const handleBackToJobs = () => {
    navigate("/careers");
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8", // background-dark : background-light
        color: isDarkMode ? "#ffffff" : "#0f172a", // white : slate-900
        fontFamily: '"Inter", sans-serif',
      }}
    >
      {/* Background Pattern */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage: `radial-gradient(circle at 1px 1px, ${
            isDarkMode ? "rgba(19, 127, 236, 0.1)" : "rgba(19, 127, 236, 0.1)"
          } 1px, transparent 0)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Top Gradient Blob */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: "768px", // max-w-3xl
          height: "256px", // h-64
          bgcolor: "rgba(19, 127, 236, 0.2)", // primary/20
          filter: "blur(100px)",
          borderRadius: "9999px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 3 }, // p-4 sm:p-6
          zIndex: 10,
        }}
      >
        {/* Success Card */}
        <Paper
          elevation={isDarkMode ? 8 : 3}
          sx={{
            width: "100%",
            maxWidth: "600px",
            bgcolor: isDarkMode ? "#1A2632" : "#ffffff", // card-dark : card-light
            borderRadius: 3, // rounded-xl
            border: `1px solid ${isDarkMode ? "#1e293b" : "#e2e8f0"}`, // slate-800 : slate-200
            p: { xs: 4, sm: 5 }, // p-8 sm:p-10
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
            animation: `${fadeIn} 0.5s ease-out`,
            boxShadow: isDarkMode
              ? "0 20px 25px -5px rgba(0, 0, 0, 0.4)" // Darker shadow
              : "0 20px 25px -5px rgba(0, 0, 0, 0.1)", // Default shadow-xl
          }}
        >
          {/* Confetti Decoration (SVG) */}
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              opacity: isDarkMode ? 0.2 : 0.4,
              zIndex: 0,
            }}
          >
            <svg
              width="100%"
              height="100%"
              fill="none"
              viewBox="0 0 600 600"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="50"
                cy="50"
                r="4"
                fill="#137fec"
                style={{ animation: `${pulse} 3s infinite` }}
              />
              <circle
                cx="550"
                cy="80"
                r="6"
                fill="#10b981"
                style={{ animation: `${pulse} 4s infinite` }}
              />
              <circle
                cx="520"
                cy="500"
                r="3"
                fill="#137fec"
                style={{ animation: `${pulse} 2.5s infinite` }}
              />
              <circle
                cx="80"
                cy="550"
                r="5"
                fill="#f59e0b"
                style={{ animation: `${pulse} 3.5s infinite` }}
              />
            </svg>
          </Box>

          <Box sx={{ position: "relative", zIndex: 10 }}>
            {/* Success Icon */}
            <Box
              sx={{
                mx: "auto",
                mb: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 80,
                width: 80,
                borderRadius: "50%",
                bgcolor: isDarkMode
                  ? "rgba(6, 78, 59, 0.3)" // green-900/30
                  : "#dcfce7", // green-100
                color: isDarkMode ? "#4ade80" : "#16a34a", // green-400 : green-600
                animation: `${popUp} 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards 0.2s`,
                opacity: 0, // Starts invisible for animation
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 48 }} />
            </Box>

            {/* Headings */}
            <Typography
              variant="h4"
              component="h1"
              sx={{
                fontWeight: 700,
                mb: 1,
                letterSpacing: "-0.025em",
                color: isDarkMode ? "#fff" : "#0f172a",
              }}
            >
              Application Received!
            </Typography>

            {/* Dynamic Job Title and Company Name */}
            <Typography
              variant="subtitle1"
              sx={{
                fontSize: "1.125rem", // text-lg
                color: isDarkMode ? "#cbd5e1" : "#475569", // slate-300 : slate-600
                fontWeight: 500,
                mb: 3,
              }}
            >
              Thanks for applying to{" "}
              <Box component="span" sx={{ color: "#137fec", fontWeight: 600 }}>
                {companyName}
              </Box>{" "}
              as a{" "}
              <Box component="span" sx={{ color: "#137fec", fontWeight: 600 }}>
                {jobTitle}
              </Box>
            </Typography>

            {/* Body Copy dynamically incorporating backend message */}
            <Typography
              variant="body1"
              sx={{
                color: isDarkMode ? "#94a3b8" : "#64748b", // slate-400 : slate-500
                mb: 4,
                maxWidth: "28rem", // max-w-md
                mx: "auto",
                lineHeight: 1.6,
              }}
            >
              {message}. We have sent a confirmation email to{" "}
              <Box
                component="span"
                sx={{
                  color: isDarkMode ? "#e2e8f0" : "#334155", // slate-200 : slate-700
                  fontWeight: 500,
                }}
              >
                {email}
              </Box>
              . Our team will review your application and get back to you
              shortly.
            </Typography>

            {/* Dynamic Note Info Box */}
            <Box
              sx={{
                bgcolor: isDarkMode
                  ? "rgba(19, 127, 236, 0.1)"
                  : "rgba(19, 127, 236, 0.05)", // primary/10 : primary/5
                border: `1px solid ${
                  isDarkMode
                    ? "rgba(19, 127, 236, 0.2)"
                    : "rgba(19, 127, 236, 0.1)"
                }`,
                borderRadius: 2, // rounded-lg
                p: 2,
                mb: 4,
                textAlign: "left",
                display: "flex",
                alignItems: "flex-start",
                gap: 1.5,
              }}
            >
              <LightbulbIcon
                sx={{
                  color: "#137fec", // primary
                  fontSize: 20,
                  mt: 0.25,
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  color: isDarkMode ? "#cbd5e1" : "#475569", // slate-300 : slate-600
                  fontSize: "0.875rem",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontWeight: 600,
                    color: "#137fec",
                    display: "block",
                    mb: 0.25,
                  }}
                >
                  Note
                </Box>
                {note}
              </Typography>
            </Box>

            {/* Action Footer */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                width: "100%",
              }}
            >
              <Button
                variant="contained"
                startIcon={<ArrowBackIcon />}
                onClick={handleBackToJobs}
                sx={{
                  width: { xs: "100%", sm: "auto" },
                  px: 4,
                  py: 1.5,
                  bgcolor: "#137fec", // primary
                  color: "#fff",
                  fontWeight: 500,
                  textTransform: "none",
                  borderRadius: 2,
                  boxShadow: "0 4px 6px -1px rgba(19, 127, 236, 0.2)",
                  "&:hover": {
                    bgcolor: "#2563eb", // blue-600
                  },
                }}
              >
                Back to Jobs
              </Button>
              <Button
                variant="outlined"
                endIcon={<OpenInNewIcon />}
                sx={{
                  width: { xs: "100%", sm: "auto" },
                  px: 4,
                  py: 1.5,
                  fontWeight: 500,
                  textTransform: "none",
                  borderRadius: 2,
                  color: isDarkMode ? "#cbd5e1" : "#475569", // slate-300 : slate-600
                  borderColor: isDarkMode ? "#334155" : "#e2e8f0", // slate-700 : slate-200
                  bgcolor: "transparent",
                  "&:hover": {
                    bgcolor: isDarkMode ? "#1e293b" : "#f1f5f9", // slate-800 : slate-100
                    borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                  },
                }}
              >
                View Company Website
              </Button>
            </Box>
          </Box>
        </Paper>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ py: 3, textAlign: "center", zIndex: 10 }}>
        <Typography
          variant="body2"
          sx={{ color: isDarkMode ? "#64748b" : "#94a3b8" }} // slate-500 : slate-400
        >
          © 2023 RecruitPlatform. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
};

export default ApplicationSuccessView;
