import React from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Modal,
  useTheme,
  Fade,
  CircularProgress,
} from "@mui/material";

// Now accepting 'progress' as a prop
const BulkImportProcessingModal = ({ open, onClose, progress }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  return (
    <Modal
      open={open}
      onClose={() => {}} // Prevent closing by clicking backdrop
      closeAfterTransition
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        backdropFilter: "blur(2px)",
        "& .MuiBackdrop-root": {
          backgroundColor: "rgba(0, 0, 0, 0.7)",
        },
      }}
    >
      <Fade in={open}>
        <Paper
          elevation={24}
          sx={{
            width: "100%",
            maxWidth: "450px",
            bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            borderRadius: 2,
            p: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            outline: "none",
            border: `1px solid ${
              isDarkMode ? "rgba(55, 65, 81, 0.5)" : "#e2e8f0"
            }`,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          }}
        >
          {/* Spinner Icon */}
          <Box
            sx={{
              mb: 3,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 64,
              width: 64,
            }}
          >
            <CircularProgress
              size={64}
              thickness={2}
              sx={{
                color: "#137fec",
              }}
              variant="determinate"
              value={progress} // Show progress on spinner ring too if desired, or keep generic
            />
            {/* Overlay a generic spinner if you want movement + progress, but standard determines stop spinning. 
                Let's stick to just the spinner for visual activity, or make it determinate. 
                Prompt implied bar didn't reach 100%. */}
          </Box>

          {/* Text Content */}
          <Box
            sx={{
              mb: 4,
              display: "flex",
              flexDirection: "column",
              gap: 1,
              alignItems: "center",
            }}
          >
            <Typography
              variant="h5"
              component="h2"
              sx={{
                fontWeight: 700,
                color: isDarkMode ? "#fff" : "#0f172a",
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
              }}
            >
              Uploading & Processing...
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: isDarkMode ? "#94a3b8" : "#64748b",
                fontSize: "0.875rem",
                maxWidth: "320px",
                lineHeight: 1.6,
              }}
            >
              We are validating your file and creating job entries. Please do
              not close this window.
            </Typography>
          </Box>

          {/* Progress Bar Section */}
          <Box
            sx={{
              width: "100%",
              mb: 4,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                position: "relative",
                height: 8,
                width: "100%",
                bgcolor: isDarkMode ? "#334155" : "#f1f5f9",
                borderRadius: "9999px",
                overflow: "hidden",
              }}
            >
              {/* Custom Gradient Progress Bar controlled by Prop */}
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: `${progress}%`, // Driven by parent prop
                  background:
                    "linear-gradient(to right, rgba(19, 127, 236, 0.8), #137fec, rgba(19, 127, 236, 0.8))",
                  borderRadius: "9999px",
                  transition: "width 0.2s ease-in-out",
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)",
                  opacity: 0.3,
                }}
              />
            </Box>

            <Box
              sx={{ display: "flex", justifyContent: "space-between", px: 0.5 }}
            >
              <Typography
                variant="caption"
                sx={{ color: "#137fec", fontWeight: 500 }}
              >
                {progress >= 100
                  ? "Processing complete!"
                  : "Validating data..."}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                {Math.round(progress)}%
              </Typography>
            </Box>
          </Box>

          {/* Actions */}
          <Box
            sx={{ width: "100%", display: "flex", justifyContent: "center" }}
          >
            <Button
              onClick={onClose}
              sx={{
                px: 3,
                py: 1,
                borderRadius: 2,
                color: isDarkMode ? "#94a3b8" : "#64748b",
                fontWeight: 700,
                textTransform: "none",
                fontSize: "0.875rem",
                letterSpacing: "0.025em",
                bgcolor: "transparent",
                "&:hover": {
                  color: isDarkMode ? "#ffffff" : "#334155",
                  bgcolor: isDarkMode ? "#1e293b" : "#f1f5f9",
                },
              }}
            >
              Cancel Upload
            </Button>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
};

export default BulkImportProcessingModal;
