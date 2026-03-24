// File: src/components/ui-mui/skeleton.jsx
import React from "react";
import MuiSkeleton from "@mui/material/Skeleton";

export default function Skeleton({
  variant = "rectangular",
  width = "100%",
  height = 20,
  animation = "wave",
  ...props
}) {
  return (
    <MuiSkeleton
      variant={variant}
      width={width}
      height={height}
      animation={animation}
      {...props}
    />
  );
}
