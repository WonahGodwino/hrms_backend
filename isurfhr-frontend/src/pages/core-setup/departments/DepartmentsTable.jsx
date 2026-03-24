// src/components/admin/DepartmentsTable.jsx
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
 * DepartmentsTable
 * - departments: []
 * - companyOptions: [] (new, used to map companyId -> name)
 * - loading: boolean (new)
 * - onEdit(department)
 * - onDelete(department)
 * - onView(department)
 */
const DepartmentsTable = ({
  departments = [],
  companyOptions = [],
  loading = false,
  onEdit = () => {},
  onDelete = () => {},
  onView = () => {},
}) => {
  // If loading, show skeleton via TableLoading (5 columns in this table)
  if (loading) {
    return <TableLoading loading={true} columns={5} rowCount={6} />;
  }

  // not loading -> if empty show EmptyState
  if (!departments || departments.length === 0) {
    return <EmptyState message="No departments found" />;
  }

  // Helper to resolve company name
  const getCompanyName = (department) => {
    if (department.companyName) return department.companyName;
    if (department.company && department.company.name)
      return department.company.name;
    if (department.companyId) {
      const match = companyOptions.find(
        (c) => String(c.id) === String(department.companyId)
      );
      return match ? match.name : "—";
    }
    return "—";
  };

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>HOD</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {departments.map((d) => {
            const companyLabel = getCompanyName(d);
            const hodLabel = d.hodName || (d.hod && d.hod.name) || "—";
            const hodMeta = d.hodEmail || (d.hod && d.hod.email) || "";

            return (
              <TableRow key={d.id ?? JSON.stringify(d)}>
                <TableCell>
                  <div className="font-medium">{companyLabel}</div>
                  {d.companyWebsite && (
                    <div className="text-xs text-muted-foreground truncate">
                      {d.companyWebsite}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  <div className="font-medium">{d.name ?? "—"}</div>
                  {d.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {d.description}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  {d.code ? (
                    <Badge variant="secondary" className="text-xs">
                      {d.code}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>

                <TableCell>
                  <div className="text-sm">{hodLabel}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {hodMeta}
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onView(d)}
                      className="p-2"
                    >
                      View
                    </Button>
                    <Button size="sm" onClick={() => onEdit(d)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDelete(d)}
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

export default DepartmentsTable;
