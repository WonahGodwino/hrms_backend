// File: src/components/ui-mui/label.jsx
import React from "react";
import FormLabel from "@mui/material/FormLabel";

export default function Label({
  children,
  htmlFor,
  sx = {},
  required = false,
  ...props
}) {
  return (
    <FormLabel htmlFor={htmlFor} required={required} sx={sx} {...props}>
      {children}
    </FormLabel>
  );
}
