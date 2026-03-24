import React from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Modal,
  Fade,
  Backdrop,
  useTheme,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

const UserCreatedSuccessModal = ({ open, onClose, onViewUser }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      slots={{ backdrop: Backdrop }}
      slotProps={{
        backdrop: {
          timeout: 500,
          sx: {
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(4px)",
          },
        },
      }}
    >
      <Fade in={open}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "100%",
            maxWidth: 448, // max-w-md
            p: 2, // m-4 equivalent padding wrapper
            outline: "none",
          }}
        >
          <Paper
            elevation={24}
            sx={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              p: { xs: 3, sm: 4 }, // p-6 sm:p-8
              borderRadius: 3, // rounded-xl
              backgroundColor: isDarkMode ? "#1a212e" : "#ffffff",
              color: isDarkMode ? "#ffffff" : "#1e293b", // slate-800
            }}
          >
            {/* Success Icon */}
            <Box
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 80, // w-20
                height: 80, // h-20
                mb: 3, // mb-6
              }}
            >
              {/* Glow Effect */}
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #10b981)", // green-400 to emerald-500
                  opacity: 0.3,
                  filter: "blur(16px)", // blur-lg
                }}
              />
              {/* Icon Container */}
              <Box
                sx={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #10b981)",
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)", // shadow-md
                }}
              >
                <CheckIcon sx={{ color: "#ffffff", fontSize: 48 }} />
              </Box>
            </Box>

            {/* Headline Text */}
            <Typography
              variant="h5"
              component="h2"
              sx={{
                fontWeight: 700,
                letterSpacing: "-0.025em", // tracking-tight
                lineHeight: 1.25, // leading-tight
                mb: 1, // pb-2 (approx)
                color: isDarkMode ? "#ffffff" : "#1e293b", // slate-800
              }}
            >
              User Created Successfully
            </Typography>

            {/* Body Text */}
            <Typography
              variant="body1"
              sx={{
                color: isDarkMode ? "#94a3b8" : "#64748b", // slate-400 / slate-500
                mb: 4, // pb-8
                fontSize: "1rem",
                fontWeight: 400,
                lineHeight: 1.5,
              }}
            >
              The new user account has been added to your organization.
            </Typography>

            {/* Button Group */}
            <Box
              sx={{
                display: "flex",
                width: "100%",
                justifyContent: "flex-end",
                gap: 1.5, // gap-3 (12px)
              }}
            >
              <Button
                variant="text"
                onClick={onClose}
                sx={{
                  minWidth: 84,
                  height: 40,
                  px: 2,
                  borderRadius: 2, // rounded-lg
                  color: isDarkMode ? "#cbd5e1" : "#475569", // slate-300 / slate-600
                  fontWeight: 700,
                  textTransform: "none",
                  letterSpacing: "0.015em",
                  "&:hover": {
                    backgroundColor: isDarkMode
                      ? "rgba(51, 65, 85, 0.5)"
                      : "#f1f5f9", // slate-700/50 / slate-100
                  },
                }}
              >
                Close
              </Button>
              <Button
                variant="contained"
                onClick={onViewUser}
                sx={{
                  minWidth: 84,
                  height: 40,
                  px: 2,
                  borderRadius: 2, // rounded-lg
                  backgroundColor: "#135bec", // primary color from config
                  color: "#ffffff",
                  fontWeight: 700,
                  textTransform: "none",
                  letterSpacing: "0.015em",
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", // shadow-sm
                  "&:hover": {
                    backgroundColor: "rgba(19, 91, 236, 0.9)", // hover:bg-primary/90
                  },
                }}
              >
                View User
              </Button>
            </Box>
          </Paper>
        </Box>
      </Fade>
    </Modal>
  );
};

export default UserCreatedSuccessModal;
