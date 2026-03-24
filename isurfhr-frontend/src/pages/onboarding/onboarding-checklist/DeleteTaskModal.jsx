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

const DeleteTaskModal = ({ open, onClose, onConfirm, taskName }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs" // Restored to xs for tighter confirm modal
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
          <Box
            sx={{
              width: 64, // Reduced from 80
              height: 64,
              borderRadius: "50%",
              bgcolor: isDark
                ? alpha(theme.palette.error.main, 0.2)
                : "#fee2e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
              border: `4px solid ${
                isDark ? alpha(theme.palette.error.main, 0.1) : "#fef2f2"
              }`,
            }}
          >
            <AlertTriangle
              size={32} // Reduced from 40
              color={theme.palette.error.main}
              strokeWidth={2}
            />
          </Box>

          <Typography
            variant="h6" // Restored from h4
            sx={{
              fontWeight: 700,
              color: "text.primary",
              mb: 1.5,
            }}
          >
            Delete Task?
          </Typography>

          <Typography
            variant="body2" // Restored from body1
            sx={{
              color: "text.secondary",
              lineHeight: 1.6,
            }}
          >
            Are you sure you want to delete the task{" "}
            <Box component="span" fontWeight="600" color="text.primary">
              "{taskName}"
            </Box>
            ? This action cannot be undone and will update the onboarding
            progress.
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
        <Grid container spacing={1.5} justifyContent="flex-end">
          <Grid size="auto">
            <Button
              onClick={onClose}
              variant="outlined"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.875rem", // Reduced
                height: 36,
                px: 2,
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
              color="error"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.875rem", // Reduced
                height: 36,
                px: 3,
                boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                bgcolor: "#ef4444",
                "&:hover": {
                  bgcolor: "#dc2626",
                  boxShadow: "0 6px 8px -1px rgba(239, 68, 68, 0.4)",
                },
              }}
            >
              Delete Task
            </Button>
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteTaskModal;
