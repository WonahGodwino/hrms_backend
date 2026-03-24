// File: src/components/ui-mui/dropdown-menu.jsx
import React from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

/**
 * DropdownMenu expects:
 * - anchorEl: element | null
 * - open: boolean
 * - onClose: fn
 * - items: [{ key, label, onClick }]
 * Or you can pass children to render custom menu items.
 */
export default function DropdownMenu({
  anchorEl,
  open,
  onClose,
  items = [],
  children,
  ...props
}) {
  return (
    <Menu anchorEl={anchorEl} open={open} onClose={onClose} {...props}>
      {children ??
        items.map((it) => (
          <MenuItem
            key={it.key ?? it.label}
            onClick={(e) => {
              if (it.onClick) it.onClick(e);
              onClose?.(e);
            }}
          >
            {it.label}
          </MenuItem>
        ))}
    </Menu>
  );
}
