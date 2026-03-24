// File: src/components/ui-mui/table.jsx
import React from "react";
import MuiTable from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";

/**
 * DataTable wrapper
 * - columns: [{ field, headerName, width, align, renderCell }]
 * - rows: array of objects
 */
export default function DataTable({
  columns = [],
  rows = [],
  stickyHeader = false,
  sx = {},
  rowKey = (r) => r.id ?? r.key ?? JSON.stringify(r),
}) {
  return (
    <TableContainer
      component={Paper}
      sx={{ width: "100%", overflow: "auto", ...sx }}
    >
      <MuiTable stickyHeader={stickyHeader}>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.field}
                align={col.align ?? "left"}
                style={{ width: col.width }}
              >
                {col.headerName ?? col.field}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={rowKey(row) || idx} hover>
              {columns.map((col) => (
                <TableCell key={String(col.field)} align={col.align ?? "left"}>
                  {col.renderCell
                    ? col.renderCell(row[col.field], row)
                    : row[col.field]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </MuiTable>
    </TableContainer>
  );
}
