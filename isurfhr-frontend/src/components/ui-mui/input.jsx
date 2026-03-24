// File: src/components/ui-mui/input.jsx
import React from "react";
import TextField from "@mui/material/TextField";

export default function Input({
  label,
  fullWidth = true,
  variant = "outlined",
  multiline = false,
  rows,
  sx = {},
  ...props
}) {
  return (
    <TextField
      label={label}
      fullWidth={fullWidth}
      variant={variant}
      multiline={multiline}
      rows={rows}
      sx={sx}
      {...props}
    />
  );
}
