// File: src/components/ui-mui/breadcrumb.jsx
import React from "react";
import MuiBreadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

export default function Breadcrumb({
  items = [],
  separator = "/",
  onClickItem,
}) {
  return (
    <MuiBreadcrumbs separator={separator} aria-label="breadcrumb">
      {items.map((it, idx) => {
        const isLast = idx === items.length - 1;
        if (isLast)
          return (
            <Typography key={idx} color="text.primary">
              {it.label}
            </Typography>
          );

        return (
          <Link
            key={idx}
            href={it.href ?? "#"}
            underline="hover"
            onClick={(e) => {
              if (it.onClick) it.onClick(e);
              if (onClickItem) onClickItem(it, e);
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  );
}
