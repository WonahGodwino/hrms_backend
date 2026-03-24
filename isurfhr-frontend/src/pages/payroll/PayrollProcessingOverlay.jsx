import React from "react";
import { Box, Typography, keyframes, useTheme } from "@mui/material";

// Custom spin animation for the spinner
const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

const PayrollProcessingOverlay = ({ open = false, progress = 50 }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  if (!open) return null;

  // SVG background pattern from the HTML example
  const bgPattern = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%231f2e3c' fill-opacity='0.4'%3E%3Cpath opacity='.5' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/%3E%3Cpath d='M6 5V0h1v5h9V0h1v5h9V0h1v5h9V0h1v5h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v5h-1v-5h-9v5h-1v-5h-9v5h-1v-5h-9v5h-1v-5h-9v5H0v-1h4v-9H0v-1h4v-9H0v-1h4v-9H0v-1h4v-9H0v-1h4v-9H0V5h6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 9999, // High z-index to cover everything
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isDarkMode ? "#101922" : "#f6f7f8",
        backgroundImage: bgPattern,
        fontFamily: '"Inter", sans-serif',
      }}
    >
      {/* Background content placeholder (optional visual depth) */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          p: 4,
          color: "rgba(203, 213, 225, 0.3)", // slate-300/30
          pointerEvents: "none",
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          Admin Dashboard
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          This is the underlying page content, now dimmed.
        </Typography>
      </Box>

      {/* Fullscreen Overlay with Blur */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0, 0, 0, 0.7)", // bg-black/70
          backdropFilter: "blur(4px)", // backdrop-blur-sm
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            maxWidth: "24rem", // max-w-sm
            p: 4,
            textAlign: "center",
            borderRadius: 3, // rounded-xl
          }}
        >
          {/* Animated Spinner */}
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "4px solid rgba(255, 255, 255, 0.2)",
              borderLeftColor: "#137fec", // primary color
              animation: `${spin} 1s linear infinite`,
              mb: 3, // mb-6
            }}
          />

          {/* Status Text */}
          <Typography
            variant="h6"
            sx={{
              fontWeight: 500, // font-medium
              color: "#f1f5f9", // slate-100
              lineHeight: 1.5,
              fontSize: "1.125rem", // text-lg
            }}
          >
            Processing payroll, generating payslips...
          </Typography>

          {/* Progress Bar */}
          <Box sx={{ mt: 2, width: "100%" }}>
            <Box
              sx={{
                width: "100%",
                height: 8, // h-2
                borderRadius: 9999, // rounded-full
                backgroundColor: "#334155", // slate-700
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  height: "100%",
                  borderRadius: 9999,
                  backgroundColor: "#137fec", // bg-primary
                  width: `${progress}%`,
                  transition: "width 0.3s ease-in-out",
                }}
              />
            </Box>
          </Box>

          {/* Sub-text */}
          <Typography
            variant="body2"
            sx={{
              mt: 1.5, // mt-3
              fontWeight: 400,
              color: "#94a3b8", // slate-400
              fontSize: "0.875rem", // text-sm
            }}
          >
            This may take a few moments. Please do not close this window.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default PayrollProcessingOverlay;
