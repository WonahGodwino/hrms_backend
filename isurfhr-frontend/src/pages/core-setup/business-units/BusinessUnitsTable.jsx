// src/components/admin/BusinessUnitsTable.jsx
import React from "react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import TableLoading from "@/components/TableLoading";

/**
 * BusinessUnitsTable
 * - businessUnits: []
 * - loading: boolean (new)
 * - onEdit(businessUnit)
 * - onDelete(businessUnit)
 * - onView(businessUnit)
 */
const BusinessUnitsTable = ({
  businessUnits = [],
  loading = false,
  onEdit = () => {},
  onDelete = () => {},
  onView = () => {},
}) => {
  // Show skeleton loader if loading
  if (loading) {
    return <TableLoading loading={true} columns={6} rowCount={6} />;
  }

  // Not loading -> if empty, show empty state
  if (!businessUnits || businessUnits.length === 0) {
    return <EmptyState message="No business units found" />;
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unit</TableHead>
            <TableHead>Direct report</TableHead>
            <TableHead>Unit Head</TableHead>
            <TableHead>Head email</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead>Position</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {businessUnits.map((u) => {
            const unitName =
              u.name ||
              u.unitName ||
              u.businessUnitName ||
              (u.businessUnit && u.businessUnit.name) ||
              "—";

            const deptLabel =
              u.departmentName ||
              (u.department && u.department.name) ||
              u.directReportName ||
              "—";

            const headName =
              u.unitHeadName || (u.unitHead && u.unitHead.name) || "—";

            const headEmail =
              u.unitHeadEmail || (u.unitHead && u.unitHead.email) || "";

            const designation =
              u.designation ||
              (u.unitHead && u.unitHead.designation) ||
              "Unit Head";

            const position = u.position ?? "Unit Head";

            return (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{unitName}</div>
                  {u.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {u.description}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  <div className="font-medium">{deptLabel}</div>
                  {u.departmentCode && (
                    <div className="text-xs text-muted-foreground truncate">
                      {u.departmentCode}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  <div className="text-sm">{headName}</div>
                </TableCell>

                <TableCell>
                  <div className="text-xs text-muted-foreground truncate">
                    {headEmail || "—"}
                  </div>
                </TableCell>

                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {designation}
                  </Badge>
                </TableCell>

                <TableCell>{position}</TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onView(u)}
                      className="p-2"
                    >
                      View
                    </Button>
                    <Button size="sm" onClick={() => onEdit(u)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDelete(u)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default BusinessUnitsTable;
