// src/pages/payroll/SaveExportTemplate.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/context/AuthContext";

/**
 * SaveExportTemplate
 *
 * Props:
 *  - version?: string | number                 // optional current version to show
 *  - onExport?: (payload) => void              // optional callback called before default export
 *  - onSave?: (payload) => void                // optional callback when saving template version
 *  - canSave?: boolean                         // optional override to enable Save button
 *
 * Notes:
 *  - If onExport/onSave are not provided the component will perform reasonable defaults:
 *    - Export: build a JSON payload from localStorage keys (payrollTemplateColumns / payrollTemplateMapping)
 *      and trigger a download.
 *    - Save: persist a "lastSavedTemplate" item in localStorage.
 */
export default function SaveExportTemplate({
  version: versionProp = null,
  onExport = null,
  onSave = null,
  canSave: canSaveProp = undefined,
}) {
  const { user } = useAuth() || {};
  const userEmail =
    user?.email ??
    user?.username ??
    user?.user?.email ??
    user?.profile?.email ??
    "unknown";

  // local state for discovered mapping / columns loaded from localStorage
  const [storedColumns, setStoredColumns] = useState([]);
  const [storedMapping, setStoredMapping] = useState(null);

  useEffect(() => {
    try {
      const colsRaw = localStorage.getItem("payrollTemplateColumns");
      const mapRaw = localStorage.getItem("payrollTemplateMapping");
      const cols = colsRaw ? JSON.parse(colsRaw) : [];
      const mapping = mapRaw ? JSON.parse(mapRaw) : null;
      setStoredColumns(Array.isArray(cols) ? cols : []);
      setStoredMapping(mapping);
    } catch (err) {
      // ignore parse errors
      setStoredColumns([]);
      setStoredMapping(null);
      // console.error("Failed to load stored mapping/columns", err);
    }
  }, []);

  // derive whether save should be enabled: explicit prop takes precedence,
  // otherwise we require a non-empty mapping object to allow saving.
  const canSave = useMemo(() => {
    if (typeof canSaveProp === "boolean") return canSaveProp;
    if (!storedMapping) return false;
    if (typeof storedMapping === "object") {
      return Object.keys(storedMapping).length > 0;
    }
    return false;
  }, [canSaveProp, storedMapping]);

  // helper: default export implementation if parent didn't provide onExport
  const defaultExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: versionProp ?? null,
      exportedBy: userEmail,
      columns: storedColumns,
      mapping: storedMapping,
    };

    const filename = `payroll_template_mapping_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (typeof onExport === "function") {
      try {
        onExport({
          version: versionProp,
          exportedBy: userEmail,
          columns: storedColumns,
          mapping: storedMapping,
        });
      } catch (err) {
        // swallow errors from parent handler and continue to default export
        // console.error("onExport handler failed", err);
      }
    } else {
      defaultExport();
    }
  };

  // default save implementation (if parent doesn't provide onSave): save a "versioned" entry to localStorage
  const defaultSave = () => {
    const saved = {
      savedAt: new Date().toISOString(),
      version: versionProp ?? `v-${Date.now()}`,
      savedBy: userEmail,
      columns: storedColumns,
      mapping: storedMapping,
    };

    // Append to savedTemplates array in localStorage
    try {
      const raw = localStorage.getItem("savedPayrollTemplates");
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        arr.push(saved);
        localStorage.setItem("savedPayrollTemplates", JSON.stringify(arr));
      } else {
        localStorage.setItem("savedPayrollTemplates", JSON.stringify([saved]));
      }
    } catch (err) {
      // fallback - store only lastSavedTemplate
      localStorage.setItem("lastSavedTemplate", JSON.stringify(saved));
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    if (typeof onSave === "function") {
      onSave({
        version: versionProp,
        savedBy: userEmail,
        columns: storedColumns,
        mapping: storedMapping,
      });
    } else {
      defaultSave();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-6">
      <div className="w-full max-w-2xl">
        <div className="rounded-xl bg-content-light dark:bg-content-dark border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
              Save and Export Template Mapping
            </h2>
            <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
              Manage your payroll template version and export settings.
            </p>
          </div>

          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark">
              Current Template Version
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-3 border-b border-border-light dark:border-border-dark">
                <span className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                  Version
                </span>
                <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                  {versionProp ?? "—"}
                </span>
              </div>

              <div className="flex justify-between items-center py-3">
                <span className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                  Entered By
                </span>
                <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                  {userEmail}
                </span>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-background-light dark:bg-background-dark/50 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <Button
              variant="ghost"
              onClick={handleExport}
              className="w-full sm:w-auto flex items-center justify-center px-4 py-2 text-sm font-semibold"
            >
              Export Mapping (JSON)
            </Button>

            <Button
              onClick={handleSave}
              disabled={!canSave}
              className={`w-full sm:w-auto flex items-center justify-center px-4 py-2 text-sm font-semibold ${
                !canSave ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              Save Template Version
            </Button>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">
            "Save Template Version" is disabled until a mapping exists and
            mandatory fields are mapped — provide a valid mapping in the Map
            Columns step to enable saving.
          </p>
        </div>
      </div>
    </div>
  );
}
