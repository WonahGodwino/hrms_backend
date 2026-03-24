// File: src/components/ui-mui/badge.jsx
import React from "react";
import MuiBadge from "@mui/material/Badge";

export default function Badge({
  children,
  badgeContent,
  color = "primary",
  variant = "standard",
  overlap = "circular",
  sx = {},
  ...props
}) {
  return (
    <MuiBadge
      badgeContent={badgeContent}
      color={color}
      variant={variant}
      overlap={overlap}
      sx={sx}
      {...props}
    >
      {children}
    </MuiBadge>
  );
}
