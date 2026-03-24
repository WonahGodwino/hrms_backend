// File: src/components/ui-mui/progress.jsx
import React from "react";
import LinearProgress from "@mui/material/LinearProgress";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";

export default function Progress({
  variant = "linear",
  value,
  size = 40,
  sx = {},
  ...props
}) {
  if (variant === "circular") {
    return (
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          ...sx,
        }}
      >
        <CircularProgress
          variant={typeof value === "number" ? "determinate" : "indeterminate"}
          value={value}
          size={size}
          {...props}
        />
      </Box>
    );
  }

  return (
    <LinearProgress
      variant={typeof value === "number" ? "determinate" : "indeterminate"}
      value={value}
      sx={sx}
      {...props}
    />
  );
}
