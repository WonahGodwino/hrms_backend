import React from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  useTheme,
  alpha,
  Grid,
} from "@mui/material";
import { AlertTriangle } from "lucide-react";

/**
 * CloseJobModal
 * A safety confirmation modal presented before closing an active job posting.
 */
const CloseJobModal = ({ open, onClose, onConfirm, jobTitle }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: isDark ? "#1e293b" : "#ffffff",
          backgroundImage: "none",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
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
      <DialogContent sx={{ p: 4 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Warning Icon */}
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: isDark
                ? alpha(theme.palette.warning.main, 0.2)
                : "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
              border: `4px solid ${
                isDark ? alpha(theme.palette.warning.main, 0.1) : "#fffbeb"
              }`,
            }}
          >
            <AlertTriangle
              size={32}
              color={isDark ? theme.palette.warning.light : "#d97706"}
              strokeWidth={2}
            />
          </Box>

          {/* Title */}
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              color: "text.primary",
              mb: 1,
            }}
          >
            Close Job Posting?
          </Typography>

          {/* Description */}
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              lineHeight: 1.6,
            }}
          >
            Are you sure you want to close{" "}
            <Box component="span" fontWeight="600" color="text.primary">
              "{jobTitle}"
            </Box>
            ? It will no longer be visible on the public careers page, but you
            can always reopen it later.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          p: 3,
          borderTop: `1px solid ${isDark ? theme.palette.divider : "#f1f5f9"}`,
          bgcolor: isDark ? alpha("#1e293b", 0.5) : "#f8fafc",
        }}
      >
        <Grid container spacing={2} justifyContent="flex-end">
          <Grid size="auto">
            <Button
              onClick={onClose}
              variant="outlined"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                height: 40,
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
          </Grid>
          <Grid size="auto">
            <Button
              onClick={onConfirm}
              variant="contained"
              color="warning"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                height: 40,
                boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                bgcolor: "#f59e0b",
                color: "#ffffff",
                "&:hover": {
                  bgcolor: "#d97706",
                },
              }}
            >
              Close Job
            </Button>
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  );
};

export default CloseJobModal;
