// File: src/components/ui-mui/card.jsx
import React from "react";
import MuiCard from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";

export default function Card({
  title,
  subheader,
  children,
  actions,
  sx = {},
  ...props
}) {
  return (
    <MuiCard sx={sx} {...props}>
      {(title || subheader) && (
        <CardHeader title={title} subheader={subheader} />
      )}
      <CardContent>{children}</CardContent>
      {actions && <CardActions>{actions}</CardActions>}
    </MuiCard>
  );
}
