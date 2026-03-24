// src/components/payroll/MapColumns.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Inbox,
  User,
  Tag,
  Calendar,
  DollarSign,
  Mail,
  Phone,
  FileText,
} from "lucide-react";

export default function MapColumns({
  headers = [],
  sampleRows = [],
  onSave = () => {},
  onDiscard = () => {},
}) {
  // Build normalized headers
  const normalizedHeaders = useMemo(() => {
    if (!Array.isArray(headers)) return [];
    const seen = new Map();
    return headers.map((h, idx) => {
      let label = (h ?? "").toString().trim();
      if (!label) label = `column_${idx + 1}`;
      if (seen.has(label)) {
        let i = 1;
        while (seen.has(`${label}_${i}`)) i++;
        label = `${label}_${i}`;
      }
      seen.set(label, true);
      return { id: idx, name: label };
    });
  }, [headers]);

  // State: track ignore/keep per column
  const [mapping, setMapping] = useState({});

  useEffect(() => {
    const initial = {};
    normalizedHeaders.forEach((h) => {
      initial[h.name] = { ignore: false };
    });
    setMapping(initial);
  }, [normalizedHeaders]);

  const toggleIgnore = (colName) => {
    setMapping((prev) => ({
      ...prev,
      [colName]: { ignore: !prev[colName]?.ignore },
    }));
  };

  const handleSave = () => {
    const keptColumns = normalizedHeaders
      .filter((h) => !mapping[h.name]?.ignore)
      .map((h) => h.name);
    onSave(keptColumns);
  };

  // Helper: sample value for column
  const getSampleForColumn = (colIndex) => {
    if (!Array.isArray(sampleRows) || sampleRows.length === 0) return "";
    const first = sampleRows[0];
    if (Array.isArray(first)) return first[colIndex] ?? "";
    if (typeof first === "object" && first !== null) {
      const key = headers[colIndex];
      return key ? first[key] ?? "" : "";
    }
    return "";
  };

  // Decide icon
  const pickIconForColumn = (colName, sampleValue) => {
    const s = (colName || "").toLowerCase();
    if (/\b(name|employee)\b/.test(s)) return User;
    if (s.includes("email")) return Mail;
    if (/\b(phone|mobile|tel)\b/.test(s)) return Phone;
    if (/\bid\b/.test(s)) return Tag;
    if (/\b(date|paydate)\b/.test(s)) return Calendar;
    if (/\b(salary|pay|amount|net|gross)\b/.test(s)) return DollarSign;
    if (/\b(job|title|role|position)\b/.test(s)) return FileText;
    const sv = (sampleValue ?? "").toString();
    if (/^\d+(\.\d+)?$/.test(sv)) return DollarSign;
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(sv)) return Calendar;
    return Inbox;
  };

  // Filtered headers for preview (ignore removed)
  const visibleHeaders = normalizedHeaders.filter(
    (h) => !mapping[h.name]?.ignore
  );

  return (
    <div className="min-h-[70vh] p-6">
      <div className="grid grid-cols-12 gap-6">
        {/* Left column: Detected Columns */}
        <div className="col-span-4 flex flex-col border-r border-slate-200/80 dark:border-slate-800">
          <div className="p-4 border-b dark:border-slate-800">
            <h2 className="text-lg font-semibold">Detected Columns</h2>
            <p className="text-sm text-slate-500">
              Choose which columns to keep or ignore
            </p>
          </div>

          <div className="p-4 overflow-y-auto space-y-3">
            {normalizedHeaders.length === 0 && (
              <div className="text-sm text-slate-500">No columns found.</div>
            )}

            {normalizedHeaders.map((col, idx) => {
              const sample = getSampleForColumn(idx);
              const colMap = mapping[col.name] || { ignore: false };
              const IconComp = pickIconForColumn(col.name, sample);

              return (
                <div
                  key={col.name}
                  className={`group flex items-center justify-between rounded-lg p-3 ${
                    colMap.ignore
                      ? "bg-slate-100/40 dark:bg-slate-800/40"
                      : "bg-slate-100 dark:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded bg-white dark:bg-slate-700">
                      <IconComp className="h-5 w-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium">{col.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        Sample: {sample?.toString?.() ?? ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleIgnore(col.name)}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        colMap.ignore
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-50 text-slate-700 dark:bg-slate-700"
                      }`}
                    >
                      {colMap.ignore ? "Ignored" : "Keep"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t dark:border-slate-800">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onDiscard}>
                Discard
              </Button>
              <Button className="flex-1" onClick={handleSave}>
                Save Template
              </Button>
            </div>
          </div>
        </div>

        {/* Right column: Preview Table */}
        <div className="col-span-8 flex flex-col">
          <div className="p-4 border-b dark:border-slate-800">
            <h3 className="text-base font-semibold">Preview Table</h3>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-800">
                <tr>
                  {visibleHeaders.map((h) => (
                    <th key={h.name} className="px-4 py-2 font-medium">
                      {h.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {Array.isArray(sampleRows) && sampleRows.length > 0 ? (
                  sampleRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {visibleHeaders.map((h, cIdx) => {
                        let value = "";
                        if (Array.isArray(row)) value = row[h.id];
                        else if (row && typeof row === "object") {
                          const originalKey = headers[h.id];
                          value = originalKey
                            ? row[originalKey] ?? ""
                            : row[h.name] ?? "";
                        }
                        return (
                          <td
                            key={cIdx}
                            className="whitespace-nowrap px-4 py-3"
                          >
                            {value?.toString?.() ?? ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={visibleHeaders.length || 1}
                      className="px-4 py-6 text-center text-sm text-slate-500"
                    >
                      No preview rows available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
