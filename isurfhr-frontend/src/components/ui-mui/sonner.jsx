// File: src/components/ui-mui/sonner.jsx
import React from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

/**
 * Simple Toast wrapper (replacement for sonner). Controlled component:
 * - open: boolean
 * - message: string
 * - severity: 'success'|'info'|'warning'|'error'
 * - onClose: fn
 */
export default function Sonner({
  open = false,
  message = "",
  severity = "info",
  autoHideDuration = 4000,
  onClose,
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert onClose={onClose} severity={severity} sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
