// File: src/components/ui-mui/separator.jsx
import React from "react";
import Divider from "@mui/material/Divider";

export default function Separator({
  vertical = false,
  text = null,
  sx = {},
  ...props
}) {
  if (vertical)
    return <Divider orientation="vertical" flexItem sx={sx} {...props} />;
  if (text)
    return (
      <Divider sx={sx} {...props}>
        {text}
      </Divider>
    );
  return <Divider sx={sx} {...props} />;
}
