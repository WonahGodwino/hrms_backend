// File: src/components/ui-mui/calendar.jsx
import React from "react";
import TextField from "@mui/material/TextField";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";


export default function Calendar({
  value,
  onChange,
  label = "Date",
  minDate,
  maxDate,
  renderInputProps = {},
  ...props
}) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DatePicker
        value={value}
        onChange={onChange}
        minDate={minDate}
        maxDate={maxDate}
        renderInput={(params) => (
          <TextField {...params} {...renderInputProps} label={label} />
        )}
        {...props}
      />
    </LocalizationProvider>
  );
}
