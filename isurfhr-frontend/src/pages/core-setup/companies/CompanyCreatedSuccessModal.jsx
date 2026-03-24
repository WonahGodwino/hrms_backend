import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  useTheme,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

const CompanyCreatedSuccessModal = ({ open, onClose, onViewCompany }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: isDark ? "#1e293b" : "#ffffff",
          backgroundImage: "none",
          boxShadow: isDark
            ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
            : "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
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
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          p: 3,
        }}
      >
        <Typography
          variant="h6"
          component="span"
          sx={{
            fontWeight: 700,
            color: "text.primary",
            fontSize: "1.125rem",
          }}
        >
          Company Created Successfully
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: "text.secondary",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
              color: "text.primary",
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 4, textAlign: "center" }}>
        <Box
          sx={{
            my: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              bgcolor: isDark ? alpha("#10b981", 0.2) : "#dcfce7",
              color: isDark ? "#34d399" : "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
              border: `4px solid ${isDark ? alpha("#10b981", 0.1) : "#f0fdf4"}`,
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 40 }} />
          </Box>

          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: "text.primary", mb: 1 }}
          >
            Registration Complete!
          </Typography>

          <Typography
            variant="body2"
            sx={{ color: "text.secondary", lineHeight: 1.6, maxWidth: "400px" }}
          >
            The company has been successfully registered in the system. You can
            now add users, assign staff, and configure settings for this new
            entity.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          p: 3,
          borderTop: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          bgcolor: isDark ? alpha("#1e293b", 0.5) : "#f8fafc",
          gap: 1.5,
        }}
      >
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            textTransform: "none",
            fontWeight: 600,
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
          Close
        </Button>
        <Button
          onClick={onViewCompany}
          variant="contained"
          sx={{
            bgcolor: "#137fec",
            color: "#ffffff",
            textTransform: "none",
            fontWeight: 600,
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            "&:hover": {
              bgcolor: "#1170d0",
            },
          }}
        >
          View Company Details
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CompanyCreatedSuccessModal;
