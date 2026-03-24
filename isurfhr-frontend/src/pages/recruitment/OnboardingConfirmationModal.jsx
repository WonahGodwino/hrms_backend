import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  Grid,
  useTheme,
  alpha,
  CircularProgress,
  TextField,
  MenuItem,
} from "@mui/material";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CheckIcon from "@mui/icons-material/Check";

/**
 * OnboardingConfirmationModal Component
 * A confirmation dialog presented to the user before finalizing a candidate's hiring
 * and transitioning them into the core HR employee database.
 * * @param {boolean} open - Controls the visibility of the modal
 * @param {function} onClose - Handler for cancelling/closing the modal
 * @param {function} onConfirm - Handler for confirming the hire action, passes the selected template
 * @param {object} candidate - Candidate details to display (name, role, startDate)
 */
const OnboardingConfirmationModal = ({
  open,
  onClose,
  onConfirm,
  candidate,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [loading, setLoading] = useState(false);

  // Template Selection State
  const [template, setTemplate] = useState("standard");

  // Fallback data in case candidate prop is missing
  const candidateName = candidate?.name || "Sarah Jenkins";
  const jobTitle = candidate?.role || "Senior UX Designer";
  const startDate = candidate?.startDate || "Oct 24, 2023";

  // Action primary color (Updated to application primary blue)
  const actionColor = "#137fec";

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (onConfirm) {
        // Pass the selected template back to the handler so it can attach the right checklist
        await onConfirm({ template });
      }
    } finally {
      setLoading(false);
      if (onClose) onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3, // rounded-xl
          bgcolor: isDark ? "#1e293b" : "#ffffff", // Standardized surface colors
          backgroundImage: "none",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(4px)",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      }}
    >
      <DialogContent sx={{ p: { xs: 3, sm: 4 }, pb: 1 }}>
        {/* Header Section */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            mt: 1,
          }}
        >
          {/* Icon Wrapper */}
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              bgcolor: alpha(actionColor, isDark ? 0.2 : 0.1),
              color: actionColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 2,
            }}
          >
            <PersonAddAlt1Icon sx={{ fontSize: 32 }} />
          </Box>

          <Typography
            variant="h5"
            component="h3"
            sx={{
              fontWeight: 700,
              color: isDark ? "#ffffff" : "#0f172a",
              lineHeight: 1.2,
              letterSpacing: "-0.025em",
              mb: 1,
            }}
          >
            Initiate Employee Onboarding?
          </Typography>

          <Typography
            variant="body2"
            sx={{ color: isDark ? "#94a3b8" : "#64748b" }}
          >
            Review the candidate details and assign an onboarding checklist.
          </Typography>
        </Box>

        {/* Candidate Details Container */}
        <Box
          sx={{
            mt: 4,
            p: 2.5,
            borderRadius: 2,
            bgcolor: isDark ? "#0f172a" : "#f8fafc",
            border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
          }}
        >
          <Grid container spacing={2}>
            {/* Candidate Name */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  fontWeight: 600,
                  color: isDark ? alpha(actionColor, 0.8) : "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  mb: 0.5,
                }}
              >
                Candidate Name
              </Typography>
              <Typography
                variant="body1"
                sx={{ fontWeight: 600, color: isDark ? "#ffffff" : "#0f172a" }}
              >
                {candidateName}
              </Typography>
            </Grid>

            {/* Job Title */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  fontWeight: 600,
                  color: isDark ? alpha(actionColor, 0.8) : "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  mb: 0.5,
                }}
              >
                Job Title
              </Typography>
              <Typography
                variant="body1"
                sx={{ fontWeight: 600, color: isDark ? "#ffffff" : "#0f172a" }}
              >
                {jobTitle}
              </Typography>
            </Grid>

            {/* Expected Start Date (Full Width) */}
            <Grid
              size={{ xs: 12 }}
              sx={{
                mt: 1,
                pt: 2,
                borderTop: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  fontWeight: 600,
                  color: isDark ? alpha(actionColor, 0.8) : "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  mb: 0.5,
                }}
              >
                Expected Start Date
              </Typography>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
              >
                <CalendarMonthIcon
                  sx={{ fontSize: 20, color: isDark ? "#64748b" : "#94a3b8" }}
                />
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 600,
                    color: isDark ? "#ffffff" : "#0f172a",
                  }}
                >
                  {startDate}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* Onboarding Template Selection */}
        <Box sx={{ mt: 3 }}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              fontWeight: 600,
              color: isDark ? alpha(actionColor, 0.8) : "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              mb: 1,
            }}
          >
            Assign Onboarding Template
          </Typography>
          <TextField
            select
            fullWidth
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            size="small"
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                bgcolor: isDark ? "#0f172a" : "#ffffff",
                "& fieldset": {
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                },
                "&:hover fieldset": {
                  borderColor: isDark ? "#475569" : "#cbd5e1",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#137fec",
                  borderWidth: 2,
                },
              },
            }}
          >
            <MenuItem value="standard">General / Standard Onboarding</MenuItem>
            <MenuItem value="engineering">Engineering Checklist</MenuItem>
            <MenuItem value="sales">Sales Checklist</MenuItem>
            <MenuItem value="design">Design & Product Checklist</MenuItem>
            <MenuItem value="leadership">Leadership Onboarding</MenuItem>
          </TextField>
        </Box>

        {/* Context Description */}
        <Box sx={{ mt: 3, mb: 1 }}>
          <Typography
            variant="body2"
            align="center"
            sx={{
              lineHeight: 1.6,
              color: isDark ? "#94a3b8" : "#475569",
              bgcolor: isDark ? "transparent" : "#f8fafc",
              borderRadius: 1,
              px: 1,
            }}
          >
            This action will finalize the recruitment process, apply the
            selected checklist, and provision a new active employee profile in
            the core HR database.
          </Typography>
        </Box>
      </DialogContent>

      {/* Footer / Actions */}
      <DialogActions
        sx={{
          p: { xs: 3, sm: 4 },
          pt: 2,
          display: "flex",
          flexDirection: { xs: "column-reverse", sm: "row" },
          justifyContent: "flex-end",
          gap: 1.5,
        }}
      >
        <Button
          onClick={onClose}
          disabled={loading}
          variant="outlined"
          fullWidth={false}
          sx={{
            width: { xs: "100%", sm: "auto" },
            textTransform: "none",
            fontWeight: 600,
            color: isDark ? "#cbd5e1" : "#334155",
            borderColor: isDark ? "#475569" : "#cbd5e1",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
              borderColor: isDark ? "#64748b" : "#94a3b8",
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading}
          variant="contained"
          startIcon={
            loading ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <CheckIcon fontSize="small" />
            )
          }
          fullWidth={false}
          sx={{
            width: { xs: "100%", sm: "auto" },
            textTransform: "none",
            fontWeight: 700,
            bgcolor: actionColor,
            color: "#ffffff", // Standardized to white for blue background
            boxShadow: `0 4px 6px -1px ${alpha(actionColor, 0.2)}`,
            "&:hover": {
              bgcolor: "#1170d0", // Standard hover shade for primary blue
            },
            mb: { xs: 1.5, sm: 0 }, // Mobile spacing adjustment for column-reverse
          }}
        >
          {loading ? "Processing..." : "Confirm & Hire"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OnboardingConfirmationModal;
