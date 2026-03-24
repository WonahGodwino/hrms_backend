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

const DeleteLocationModal = ({ open, onClose, locationData, onConfirm }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (!locationData) return null;

  const { name, staffCount, type } = locationData;
  const isHeadOffice = type === "Head Office";
  const hasStaff = staffCount > 0;

  // Determine the warning type and message
  let title = "Delete Location?";
  let description = `Are you sure you want to delete "${name}"? This action cannot be undone.`;
  let canDelete = true;

  if (hasStaff) {
    title = "Cannot Delete Location";
    description = (
      <>
        You cannot delete{" "}
        <Box component="span" fontWeight="600" color="text.primary">
          "{name}"
        </Box>{" "}
        because there are currently{" "}
        <Box component="span" fontWeight="600" color="text.primary">
          {staffCount} active staff members
        </Box>{" "}
        assigned to this location.
      </>
    );
    canDelete = false;
  } else if (isHeadOffice) {
    title = "Cannot Delete Head Office";
    description = (
      <>
        You cannot delete{" "}
        <Box component="span" fontWeight="600" color="text.primary">
          "{name}"
        </Box>{" "}
        because it is currently set as the{" "}
        <Box component="span" fontWeight="600" color="text.primary">
          Head Office
        </Box>
        . Please assign a new Head Office before deleting this location.
      </>
    );
    canDelete = false;
  }

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
          {/* Icon */}
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: isDark
                ? alpha(theme.palette.error.main, 0.2)
                : "#fee2e2", // red-100
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
              border: `4px solid ${
                isDark ? alpha(theme.palette.error.main, 0.1) : "#fef2f2" // red-50
              }`,
            }}
          >
            <AlertTriangle
              size={32}
              color={theme.palette.error.main}
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
            {title}
          </Typography>

          {/* Description */}
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              lineHeight: 1.6,
              mb: canDelete ? 0 : 2,
            }}
          >
            {description}
          </Typography>

          {/* Helper Text for Blocked Action */}
          {!canDelete && (
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                fontWeight: 500,
                mt: 1,
                display: "block",
              }}
            >
              {hasStaff
                ? "Please reassign these staff members to a different location before deleting."
                : "Go to another location's settings to set it as Head Office."}
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          p: 3,
          borderTop: `1px solid ${isDark ? theme.palette.divider : "#f1f5f9"}`, // slate-100
          bgcolor: isDark ? alpha("#1e293b", 0.5) : "#f8fafc", // slate-50
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
            {canDelete ? (
              <Button
                onClick={onConfirm}
                variant="contained"
                color="error"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  height: 40,
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  bgcolor: "#ef4444",
                  "&:hover": {
                    bgcolor: "#dc2626",
                  },
                }}
              >
                Delete
              </Button>
            ) : (
              <Button
                onClick={() => {
                  console.log("View Assigned Staff clicked");
                  onClose();
                }}
                variant="contained"
                color="error"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  height: 40,
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  bgcolor: "#ef4444",
                  color: "#ffffff",
                  px: 2,
                  "&:hover": {
                    bgcolor: "#dc2626",
                  },
                }}
              >
                {hasStaff ? "View Assigned Staff" : "Okay"}
              </Button>
            )}
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteLocationModal;
