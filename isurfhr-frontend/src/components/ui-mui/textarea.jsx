// File: src/components/ui-mui/textarea.jsx
import React from "react";
import TextField from "@mui/material/TextField";

export default function Textarea({
  label,
  fullWidth = true,
  minRows = 3,
  maxRows = 10,
  variant = "outlined",
  sx = {},
  ...props
}) {
  return (
    <TextField
      label={label}
      fullWidth={fullWidth}
      multiline
      minRows={minRows}
      maxRows={maxRows}
      variant={variant}
      sx={sx}
      {...props}
    />
  );
}
