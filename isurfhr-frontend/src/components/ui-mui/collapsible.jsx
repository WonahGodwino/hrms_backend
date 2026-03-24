// File: src/components/ui-mui/collapsible.jsx
import React from "react";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export default function Collapsible({
  title,
  children,
  defaultExpanded = false,
  summarySx = {},
  ...props
}) {
  return (
    <Accordion defaultExpanded={defaultExpanded} {...props}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={summarySx}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}
