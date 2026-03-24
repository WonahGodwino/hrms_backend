// File: src/components/ui-mui/checkbox.jsx
import React from "react";
import FormControlLabel from "@mui/material/FormControlLabel";
import MuiCheckbox from "@mui/material/Checkbox";

export default function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
  size = "medium",
  ...props
}) {
  return (
    <FormControlLabel
      control={
        <MuiCheckbox
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          size={size}
          {...props}
        />
      }
      label={label}
    />
  );
}
