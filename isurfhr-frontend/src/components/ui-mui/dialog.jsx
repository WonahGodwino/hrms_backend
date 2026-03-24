// File: src/components/ui-mui/dialog.jsx
import React from "react";
import MuiDialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "./button";

export default function Dialog({ open, onClose, title, children, actions }) {
  return (
    <MuiDialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      {title && <DialogTitle>{title}</DialogTitle>}
      <DialogContent dividers>{children}</DialogContent>
      <DialogActions>
        {actions ? (
          actions
        ) : (
          <>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>OK</Button>
          </>
        )}
      </DialogActions>
    </MuiDialog>
  );
}
