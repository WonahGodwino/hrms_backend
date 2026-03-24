import React from "react";
import {
  Snackbar,
  Alert,
  CircularProgress,
  Box,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

const DownloadingToast = ({ open, onClose, status = "downloading" }) => {
  let message = "Downloading file...";
  let severity = "info";
  let icon = <CircularProgress size={20} sx={{ color: "#fff" }} />;
  let bgColor = "#334155"; // slate-700 default

  if (status === "success") {
    message = "Download completed successfully";
    severity = "success";
    icon = <CheckCircleIcon sx={{ color: "#fff" }} />;
    bgColor = "#22c55e"; // green-500
  } else if (status === "error") {
    message = "Download failed";
    severity = "error";
    icon = <ErrorIcon sx={{ color: "#fff" }} />;
    bgColor = "#ef4444"; // red-500
  }

  return (
    <Snackbar
      open={open}
      autoHideDuration={status === "downloading" ? null : 3000} // Auto-hide only when done
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert
        severity={severity}
        variant="filled"
        onClose={status !== "downloading" ? onClose : undefined}
        sx={{
          width: "100%",
          alignItems: "center",
          bgcolor: bgColor,
          color: "#fff",
          "& .MuiAlert-icon": {
            display: "none", // We use our custom icon box
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {icon}
          <Typography variant="body2" fontWeight={500}>
            {message}
          </Typography>
        </Box>
      </Alert>
    </Snackbar>
  );
};

export default DownloadingToast;
