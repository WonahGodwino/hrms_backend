import React from "react";
import MuiButton from "@mui/material/Button";

export default function Button({ children, variant = "contained", ...props }) {
  return (
    <MuiButton variant={variant} {...props}>
      {children}
    </MuiButton>
  );
}
