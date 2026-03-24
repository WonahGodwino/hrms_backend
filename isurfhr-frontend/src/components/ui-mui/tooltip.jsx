// File: src/components/ui-mui/tooltip.jsx
import React from "react";
import MuiTooltip from "@mui/material/Tooltip";

export default function Tooltip({
  title,
  children,
  placement = "top",
  enterDelay = 100,
  leaveDelay = 0,
  ...props
}) {
  return (
    <MuiTooltip
      title={title}
      placement={placement}
      enterDelay={enterDelay}
      leaveDelay={leaveDelay}
      {...props}
    >
      {children}
    </MuiTooltip>
  );
}
