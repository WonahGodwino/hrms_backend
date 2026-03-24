// File: src/components/ui-mui/sheet.jsx
import React from "react";
import Paper from "@mui/material/Paper";

export default function Sheet({
  children,
  elevation = 1,
  sx = {},
  padding = 2,
  ...props
}) {
  return (
    <Paper elevation={elevation} sx={{ p: padding, ...sx }} {...props}>
      {children}
    </Paper>
  );
}
