// File: src/components/ui-mui/scroll-area.jsx
import React from "react";
import Box from "@mui/material/Box";

/**
 * Simple ScrollArea wrapper using a Box with overflow auto.
 * Props:
 * - maxHeight: numeric or string to limit height
 * - sx: additional styles
 */
export default function ScrollArea({
  children,
  maxHeight = "400px",
  sx = {},
  ...props
}) {
  return (
    <Box
      sx={{ overflow: "auto", maxHeight: maxHeight, width: "100%", ...sx }}
      {...props}
    >
      {children}
    </Box>
  );
}
