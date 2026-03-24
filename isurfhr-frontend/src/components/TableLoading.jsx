// src/components/ui/TableWithLoading.jsx
import React from "react";

/**
 * TableWithLoading
 *
 * A small reusable wrapper for tables that need a loading skeleton.
 *
 * Props:
 *  - loading: boolean
 *  - columns: number (how many columns the table has — used to render skeleton cells)
 *  - rowCount?: number (how many skeleton rows to render while loading) default 6
 *  - children: the actual table markup to render when not loading
 *  - emptyNode?: node to render when items are empty (optional, wrapper doesn't decide emptiness)
 *
 * Usage:
 *  <TableWithLoading loading={loading} columns={7}>
 *    <table>...</table>
 *  </TableWithLoading>
 */
export default function TableLoading({
  loading = false,
  columns = 5,
  rowCount = 6,
  children,
  emptyNode = null,
}) {
  if (loading) {
    const cols = Array.from({ length: columns });
    const rows = Array.from({ length: rowCount });
    return (
      <div className="overflow-auto">
        <div className="w-full">
          <table className="w-full table-auto border-separate border-spacing-0">
            <thead>
              <tr>
                {cols.map((_, i) => (
                  <th key={i} className="py-2 px-3">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((_, r) => (
                <tr key={r} className={r % 2 === 0 ? "" : ""}>
                  {cols.map((__, c) => (
                    <td key={c} className="py-3 px-3">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // not loading -> render children (table) or provided emptyNode
  return children ? <>{children}</> : emptyNode;
}
