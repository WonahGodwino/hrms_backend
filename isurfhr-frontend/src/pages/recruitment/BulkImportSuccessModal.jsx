import React from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Modal,
  useTheme,
  Link,
  Fade,
  Grid,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import DownloadIcon from "@mui/icons-material/Download";
import { useNavigate } from "react-router-dom";

// Default stats prop structure
const DEFAULT_STATS = {
  created: 142,
  duplicates: 12,
  failed: 3,
  fileName: "staff_data_Q3.csv",
};

const BulkImportSuccessModal = ({
  open,
  onClose,
  stats = DEFAULT_STATS,
  onUploadAnother,
  onViewDashboard,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();

  const handleViewDashboard = () => {
    if (onViewDashboard) {
      onViewDashboard();
    } else {
      navigate("/vacancies"); // Default navigation if no handler provided
    }
  };

  const handleUploadAnother = () => {
    if (onUploadAnother) {
      onUploadAnother();
    } else {
      // If no handler, we at least close this modal
      onClose();
      // Logic to reopen upload modal would be in parent
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        backdropFilter: "blur(4px)",
        "& .MuiBackdrop-root": {
          backgroundColor: "rgba(15, 23, 42, 0.6)",
        },
      }}
    >
      <Fade in={open}>
        <Paper
          elevation={24}
          sx={{
            width: "100%",
            maxWidth: "500px",
            bgcolor: isDarkMode ? "#1c2733" : "#ffffff",
            borderRadius: 3, // rounded-xl
            overflow: "hidden",
            outline: "none",
            border: `1px solid ${isDarkMode ? "#324d67" : "#e6e8eb"}`,
            position: "relative",
          }}
        >
          {/* Close Button */}
          <IconButton
            onClick={onClose}
            sx={{
              position: "absolute",
              top: 16,
              right: 16,
              color: isDarkMode ? "#92adc9" : "#637588",
              "&:hover": {
                color: isDarkMode ? "#ffffff" : "#111418",
                bgcolor: isDarkMode
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.05)",
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>

          {/* Modal Content */}
          <Box
            sx={{
              p: 4,
              pt: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Success Icon */}
            <Box
              sx={{
                mb: 3,
                height: 80,
                width: 80,
                borderRadius: "50%",
                bgcolor: isDarkMode
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(34, 197, 94, 0.1)", // green-500/20 / green-500/10
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 40, color: "#22c55e" }} />
            </Box>

            {/* Text Content */}
            <Box
              sx={{
                textAlign: "center",
                mb: 4,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Typography
                variant="h5"
                component="h1"
                sx={{
                  fontWeight: 700,
                  color: isDarkMode ? "#ffffff" : "#111418",
                  lineHeight: 1.2,
                }}
              >
                Import Completed
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: isDarkMode ? "#94a3b8" : "#637588",
                  fontSize: "1rem",
                }}
              >
                Your file{" "}
                <Box
                  component="span"
                  sx={{
                    fontWeight: 500,
                    color: isDarkMode ? "#cbd5e1" : "#111418",
                  }}
                >
                  {stats.fileName}
                </Box>{" "}
                has been processed successfully.
              </Typography>
            </Box>

            {/* Stats Grid */}
            <Grid container spacing={1.5} sx={{ mb: 3 }}>
              {/* Created */}
              <Grid item xs={4}>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#111a22" : "#f6f7f8",
                    p: 2,
                    border: `1px solid ${isDarkMode ? "#324d67" : "#e6e8eb"}`,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: isDarkMode ? "#92adc9" : "#637588",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Created
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      color: isDarkMode ? "#ffffff" : "#111418",
                    }}
                  >
                    {stats.created}
                  </Typography>
                </Box>
              </Grid>

              {/* Duplicates */}
              <Grid item xs={4}>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#111a22" : "#f6f7f8",
                    p: 2,
                    border: `1px solid ${isDarkMode ? "#324d67" : "#e6e8eb"}`,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: isDarkMode ? "#92adc9" : "#637588",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Duplicates
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      color: isDarkMode ? "#ffffff" : "#111418",
                    }}
                  >
                    {stats.duplicates}
                  </Typography>
                </Box>
              </Grid>

              {/* Failed */}
              <Grid item xs={4}>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#2c1518" : "#fff1f2", // dark red bg / light red bg
                    p: 2,
                    border: `1px solid ${isDarkMode ? "#5c2b2f" : "#ffe4e6"}`,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: isDarkMode ? "#fb7185" : "#be123c",
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Failed
                    </Typography>
                    {stats.failed > 0 && (
                      <ErrorIcon
                        sx={{
                          fontSize: 14,
                          color: isDarkMode ? "#fb7185" : "#be123c",
                        }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      color: isDarkMode ? "#fb7185" : "#be123c",
                    }}
                  >
                    {stats.failed}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* Error Log Link */}
            {stats.failed > 0 && (
              <Box sx={{ mb: 4 }}>
                <Link
                  href="#"
                  underline="none"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "#137fec",
                    transition: "color 0.2s",
                    "&:hover": {
                      color: "rgba(19, 127, 236, 0.8)",
                      textDecoration: "underline",
                      textDecorationColor: "rgba(19, 127, 236, 0.3)",
                      textUnderlineOffset: "4px",
                    },
                  }}
                >
                  <DownloadIcon sx={{ fontSize: 18 }} />
                  Download Error Log
                </Link>
              </Box>
            )}
            {!stats.failed && <Box sx={{ mb: 4 }} />}

            {/* Action Buttons */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                width: "100%",
                gap: 1.5,
              }}
            >
              <Button
                fullWidth
                variant="outlined"
                onClick={handleUploadAnother}
                sx={{
                  height: 40,
                  borderRadius: 2,
                  color: isDarkMode ? "#ffffff" : "#111418",
                  borderColor: isDarkMode ? "#475569" : "#d1d5db",
                  fontWeight: 600,
                  textTransform: "none",
                  "&:hover": {
                    bgcolor: isDarkMode ? "#334155" : "#f1f5f9",
                    borderColor: isDarkMode ? "#475569" : "#d1d5db",
                  },
                }}
              >
                Upload Another File
              </Button>
              <Button
                fullWidth
                variant="contained"
                onClick={handleViewDashboard}
                sx={{
                  height: 40,
                  borderRadius: 2,
                  bgcolor: "#137fec",
                  color: "#ffffff",
                  fontWeight: 700,
                  textTransform: "none",
                  boxShadow: "0 1px 2px 0 rgba(19, 127, 236, 0.2)",
                  "&:hover": {
                    bgcolor: "rgba(19, 127, 236, 0.9)",
                  },
                }}
              >
                View Jobs Dashboard
              </Button>
            </Box>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
};

export default BulkImportSuccessModal;
