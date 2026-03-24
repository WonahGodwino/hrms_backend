// File: src/components/ui-mui/popover.jsx
import React from "react";
import MuiPopover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";

export default function Popover({
  anchorEl,
  open,
  onClose,
  children,
  paperSx = {},
  ...props
}) {
  return (
    <MuiPopover
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      {...props}
    >
      <div style={{ padding: 8 }}>
        <Typography component="div" sx={paperSx}>
          {children}
        </Typography>
      </div>
    </MuiPopover>
  );
}
