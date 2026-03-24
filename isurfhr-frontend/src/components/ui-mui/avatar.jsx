// File: src/components/ui-mui/avatar.jsx
import React from "react";
import MuiAvatar from "@mui/material/Avatar";

export default function Avatar({ src, alt, size = 40, sx = {}, ...props }) {
  return (
    <MuiAvatar
      src={src}
      alt={alt}
      sx={{ width: size, height: size, ...sx }}
      {...props}
    />
  );
}
