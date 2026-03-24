// src/pages/payroll/PayrollTemplates.jsx
import { useState, useEffect } from "react";
import EmptyPayrollState from "./EmptyPayrollState";
import UploadPayrollTemplate from "./UploadPayrollModal";
import MapColumns from "./MapColumns";
import SaveExportTemplate from "./SaveExportTemplate";

export default function PayrollTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  // "list" | "upload" | "map" | "save"
  const [view, setView] = useState("list");

  // extracted headers & optional preview rows (passed into MapColumns)
  const [headers, setHeaders] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);

  // mapping to hand off to SaveExportTemplate
  const [pendingMapping, setPendingMapping] = useState(null);

  // some sensible canonical fields to offer in the mapper (can be replaced by real list)
  const canonicalFields = [
    "Employee Name",
    "Employee ID",
    "Job Title",
    "Annual Salary",
    "Pay Date",
    "Net Pay",
    "Taxes",
    "Benefits",
  ];

  useEffect(() => {
    // TODO: Replace with real API call
    const t = setTimeout(() => {
      setTemplates([]); // mock: no records
      setLoading(false);
    }, 500);
    return () => clearTimeout(t);
  }, []);

  // callback passed to UploadPayrollTemplate
  const handleColumnsExtracted = (extractedHeaders) => {
    // set extracted headers
    setHeaders(Array.isArray(extractedHeaders) ? extractedHeaders : []);

    // try to read sample rows from localStorage (if Upload component saved them)
    // support a few keys for backward compatibility/experimentation
    const possibleKeys = [
      "payrollTemplatePreviewRows",
      "payrollTemplateRows",
      "payrollTemplateSample",
      "payrollTemplateData",
    ];
    let rows = [];
    for (const k of possibleKeys) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            rows = parsed;
            break;
          }
        }
      } catch (e) {
        // ignore parse errors and continue
        // eslint-disable-next-line no-console
        console.debug(
          "Failed to parse preview rows from localStorage key",
          k,
          e
        );
      }
    }

    // fallback: try generic 'payrollTemplateDataRows'
    if (rows.length === 0) {
      try {
        const raw = localStorage.getItem("payrollTemplateDataRows");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) rows = parsed;
        }
      } catch (e) {
        // ignore
      }
    }

    setSampleRows(rows);
    // navigate to mapping view
    setView("map");
  };

  // Save mapping callback: persist mapping and go to save/export screen
  const handleSaveMapping = (mapping) => {
    // Basic validation not enforced here; mapper's Save button should only be enabled client-side
    const payload = {
      mapping,
      headers,
      sampleRows,
      savedAt: new Date().toISOString(),
    };

    // store the pending mapping in state and navigate to the save view
    setPendingMapping(payload);
    setView("save");
  };

  const handleDiscardMapping = () => {
    // go back to list or upload; choosing list here
    setView("list");
  };

  // callback when save/export screen completes saving or user backs out
  const handleSaveExportDone = ({ saved }) => {
    // optionally refresh local templates list or show success
    // for now, return to list and if saved add a mock template to the UI list
    setView("list");
    if (saved) {
      // add a mock template entry so user sees something in the list after saving
      setTemplates((prev) => [
        {
          id: `local-${Date.now()}`,
          name: `Template (${new Date().toLocaleString()})`,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading payroll templates...</p>
      </div>
    );
  }

  if (view === "upload") {
    return (
      <UploadPayrollTemplate
        onBack={() => setView("list")}
        onColumnsExtracted={handleColumnsExtracted}
      />
    );
  }

  if (view === "map") {
    return (
      <MapColumns
        headers={headers}
        sampleRows={sampleRows}
        canonicalFields={canonicalFields}
        onSave={handleSaveMapping}
        onDiscard={handleDiscardMapping}
      />
    );
  }

  if (view === "save") {
    return (
      <SaveExportTemplate
        mappingPayload={pendingMapping}
        onDone={handleSaveExportDone}
      />
    );
  }

  if (!templates || templates.length === 0) {
    return <EmptyPayrollState onUpload={() => setView("upload")} />;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Payroll Templates</h2>
      {/* Replace with real table later */}
      <p>Templates exist. Show them here.</p>
    </div>
  );
}
