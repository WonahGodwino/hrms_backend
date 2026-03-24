// src/pages/attendancemgmt/StaffAttendanceDashboard.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Calendar, Send } from "lucide-react";
import {
  PieChart,
  Pie,
  Tooltip,
  Cell,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  // getAttendanceStaffInfo,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
} from "@/services/AttendanceService";

/**
 * StaffAttendanceDashboard
 *
 * Props (optional, provided by parent AttendanceDashboard):
 *  - me: { id, name, unit }
 *  - myToday: { date, scheduled: {start,end} | shift, punches: {in,out}, status, remark }
 *  - myLogs: []
 *  - myRequests: []
 *
 * Falls back to mock data if props are missing so the component remains usable standalone.
 */
export default function StaffAttendanceDashboard({
  me: meProp,
  myToday: myTodayProp,
  myLogs: myLogsProp,
  myRequests: myRequestsProp,
}) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // API-driven state (empty until populated)
  const [apiToday, setApiToday] = useState(null);
  const [apiLogs, setApiLogs] = useState([]);
  const [apiRequests, setApiRequests] = useState([]);
  const [loadingApi, setLoadingApi] = useState(true);
  const [apiError, setApiError] = useState(null);

  // Clock action states
  const [isClocking, setIsClocking] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  // Fallback / mock data (used only when props/API are not provided)
  const defaultMe = { id: "EMP002", name: "Jane Smith", unit: "IT" };
  const todayStr = new Date().toISOString().split("T")[0];

  const mockToday = {
    date: todayStr,
    scheduled: { start: "09:00", end: "17:00" },
    punches: { in: "09:12", out: "17:10" },
    status: "late",
    remark: "Arrived 12m late",
  };

  const mockLogs = [
    {
      id: 1,
      date: todayStr,
      scheduled: { start: "09:00", end: "17:00" },
      punches: { in: "09:12", out: "17:10" },
      status: "late",
      remark: "12m late",
    },
    {
      id: 2,
      date: "2025-08-20",
      scheduled: { start: "09:00", end: "17:00" },
      punches: { in: "08:57", out: "17:03" },
      status: "present",
      remark: "",
    },
    {
      id: 3,
      date: "2025-08-19",
      scheduled: { start: "09:00", end: "17:00" },
      punches: { in: null, out: null },
      status: "absent",
      remark: "No punches",
    },
    {
      id: 4,
      date: "2025-08-18",
      scheduled: { start: "09:00", end: "17:00" },
      punches: { in: "09:10", out: "16:45" },
      status: "early_departure",
      remark: "Left 15 minutes early",
    },
  ];

  const mockRequests = [
    {
      id: "CR-3021",
      date: "2025-08-19",
      issue: "Missing Punch",
      requestedChange: { in: "09:03" },
      reason: "Reader error",
      status: "Pending",
      createdAt: "2025-08-19 18:02",
    },
    {
      id: "CR-2991",
      date: "2025-08-15",
      issue: "Incorrect Sign-Out",
      requestedChange: { out: "17:05" },
      reason: "Forgot to punch",
      status: "Approved",
      createdAt: "2025-08-15 17:40",
    },
  ];

  // If parent provided props, prefer them as initial values (but API can overwrite)
  const meInitial = meProp || defaultMe;
  const todayInitial = myTodayProp || mockToday;
  const logsInitial =
    Array.isArray(myLogsProp) && myLogsProp.length > 0 ? myLogsProp : mockLogs;
  const requestsInitial =
    Array.isArray(myRequestsProp) && myRequestsProp.length > 0
      ? myRequestsProp
      : mockRequests;

  // Fetch staff-specific attendance info for today on mount
  // useEffect(() => {
  //   let mounted = true;
  //   setLoadingApi(true);
  //   setApiError(null);

  //   (async () => {
  //     try {
  //       const res = await getAttendanceStaffInfo({ day: todayStr });
  //       // backend might return { data: [...] } or the array directly
  //       const raw =
  //         res && res.data && res.data.data
  //           ? res.data.data
  //           : res && res.data
  //           ? res.data
  //           : res;
  //       const arr = Array.isArray(raw) ? raw : [];
  //       if (mounted && arr.length > 0) {
  //         const first = arr[0];
  //         const normalizedToday = {
  //           date: todayStr,
  //           scheduled:
  //             first.scheduled ??
  //             first.shift ??
  //             (first.shiftTime
  //               ? first.shiftTime
  //               : { start: "09:00", end: "17:00" }),
  //           punches:
  //             first.punches ??
  //             (first.signIn || first.signOut
  //               ? { in: first.signIn, out: first.signOut }
  //               : {}),
  //           status: first.status ?? "present",
  //           remark: first.remark ?? "",
  //         };
  //         setApiToday(normalizedToday);
  //         setApiLogs(arr);
  //         if (first.requests && Array.isArray(first.requests)) {
  //           setApiRequests(first.requests);
  //         } else {
  //           setApiRequests([]);
  //         }
  //       }
  //     } catch (err) {
  //       console.error("Failed to fetch staff attendance info:", err);
  //       if (mounted) setApiError(String(err || "Unknown error"));
  //     } finally {
  //       if (mounted) setLoadingApi(false);
  //     }
  //   })();

  //   return () => {
  //     mounted = false;
  //   };
  //   // only run on mount
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // Decide which data to render: API result if present, otherwise props, otherwise mock
  const me = meInitial;
  const myToday = apiToday || myTodayProp || mockToday;
  const myLogs =
    apiLogs && apiLogs.length > 0
      ? apiLogs
      : Array.isArray(myLogsProp) && myLogsProp.length > 0
      ? myLogsProp
      : mockLogs;
  const myRequests =
    apiRequests && apiRequests.length > 0
      ? apiRequests
      : Array.isArray(myRequestsProp) && myRequestsProp.length > 0
      ? myRequestsProp
      : mockRequests;

  const monthSummary = useMemo(() => {
    const counts = {
      present: 0,
      late: 0,
      absent: 0,
      missing_punch: 0,
      early_departure: 0,
    };
    myLogs.forEach((l) => {
      const key = l && l.status ? l.status : "present";
      if (counts[key] !== undefined) counts[key] += 1;
    });
    return [
      { name: "Present", value: counts.present, color: "#10B981" },
      { name: "Late", value: counts.late, color: "#F59E0B" },
      { name: "Absent", value: counts.absent, color: "#EF4444" },
      { name: "Missing Punch", value: counts.missing_punch, color: "#9CA3AF" },
      {
        name: "Early Departure",
        value: counts.early_departure,
        color: "#6366F1",
      },
    ];
  }, [myLogs]);

  const openCorrection = (log) => {
    setSelectedLog(log);
    setShowCorrection(true);
  };

  // utility: format a short time (HH:MM)
  const formatTimeShort = (d = new Date()) => {
    try {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  };

  // Clock in handler
  const handleClockIn = async () => {
    if (!me || !me.id) {
      setActionMessage("Missing staff id");
      return;
    }
    setIsClocking(true);
    setActionMessage("");
    try {
      const res = await apiClockIn({ staff: me.id });
      // try to read data returned by API, otherwise fall back to current time
      const returned =
        res && res.data && res.data.data
          ? res.data.data
          : res && res.data
          ? res.data
          : res;
      const time = (returned && returned.time) || formatTimeShort();
      // update displayed today & logs optimistically
      setApiToday((prev) => {
        const prevToday = prev || {
          date: todayStr,
          scheduled: { start: "09:00", end: "17:00" },
        };
        const newPunches = { ...(prevToday.punches || {}), in: time };
        return { ...prevToday, punches: newPunches };
      });
      setApiLogs((prev) => {
        // either update first item or prepend a new log
        if (Array.isArray(prev) && prev.length > 0) {
          const updated = [...prev];
          updated[0] = {
            ...updated[0],
            punches: { ...(updated[0].punches || {}), in: time },
          };
          return updated;
        }
        return [
          {
            id: `local-${Date.now()}`,
            date: todayStr,
            punches: { in: time },
            status: "present",
          },
          ...(prev || []),
        ];
      });
      setActionMessage("Clock-in successful");
    } catch (err) {
      console.error("Clock-in failed:", err);
      setActionMessage("Clock-in failed");
    } finally {
      setIsClocking(false);
      setTimeout(() => setActionMessage(""), 3000);
    }
  };

  // Clock out handler
  const handleClockOut = async () => {
    if (!me || !me.id) {
      setActionMessage("Missing staff id");
      return;
    }
    setIsClocking(true);
    setActionMessage("");
    try {
      const res = await apiClockOut({ staff: me.id });
      const returned =
        res && res.data && res.data.data
          ? res.data.data
          : res && res.data
          ? res.data
          : res;
      const time = (returned && returned.time) || formatTimeShort();
      setApiToday((prev) => {
        const prevToday = prev || {
          date: todayStr,
          scheduled: { start: "09:00", end: "17:00" },
        };
        const newPunches = { ...(prevToday.punches || {}), out: time };
        return { ...prevToday, punches: newPunches };
      });
      setApiLogs((prev) => {
        if (Array.isArray(prev) && prev.length > 0) {
          const updated = [...prev];
          updated[0] = {
            ...updated[0],
            punches: { ...(updated[0].punches || {}), out: time },
          };
          return updated;
        }
        return [
          {
            id: `local-${Date.now()}`,
            date: todayStr,
            punches: { out: time },
            status: "present",
          },
          ...(prev || []),
        ];
      });
      setActionMessage("Clock-out successful");
    } catch (err) {
      console.error("Clock-out failed:", err);
      setActionMessage("Clock-out failed");
    } finally {
      setIsClocking(false);
      setTimeout(() => setActionMessage(""), 3000);
    }
  };

  // UI helpers to decide which button to show
  const hasSignedIn = !!(myToday && (myToday.punches?.in || myToday.signIn));
  const hasSignedOut = !!(myToday && (myToday.punches?.out || myToday.signOut));

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1180DA]">My Attendance</h1>
        <div className="text-sm text-gray-600 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {myToday && myToday.date ? myToday.date : todayStr}
        </div>
      </div>

      {/* API loading / error state (small, non-blocking) */}
      {loadingApi && (
        <div className="mb-4 text-sm text-gray-500">
          Loading your attendance…
        </div>
      )}
      {apiError && (
        <div className="mb-4 text-sm text-red-600">
          Attendance API error: {apiError}
        </div>
      )}

      {/* small action message */}
      {actionMessage && (
        <div className="mb-4 text-sm text-gray-700">{actionMessage}</div>
      )}

      {/* Policy Banner */}
      <div className="bg-blue-50 border border-blue-100 text-blue-800 text-sm rounded-lg p-3 mb-6">
        <b>Policy:</b> 10-minute grace for sign-in; public holidays
        auto-excluded; weekend rules apply by unit shift policy.
      </div>

      {/* Today Card */}
      <div className="bg-white rounded-2xl shadow p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-sm text-gray-500">Today's Shift</p>
            <p className="text-lg font-semibold">
              {(myToday &&
                (myToday.scheduled?.start || myToday.shift?.start)) ||
                "09:00"}{" "}
              –{" "}
              {(myToday && (myToday.scheduled?.end || myToday.shift?.end)) ||
                "17:00"}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Unit: <span className="font-medium">{me.unit}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-6">
              <InfoBlock
                label="Sign In"
                value={
                  (myToday && (myToday.punches?.in || myToday.signIn)) || "—"
                }
              />
              <InfoBlock
                label="Sign Out"
                value={
                  (myToday && (myToday.punches?.out || myToday.signOut)) || "—"
                }
              />
              <div className="text-center">
                <StatusPill status={myToday && myToday.status} />
                {myToday && myToday.remark && (
                  <p className="text-xs text-gray-500 mt-1">{myToday.remark}</p>
                )}
              </div>
            </div>

            {/* Clock buttons */}
            <div className="flex flex-col gap-2">
              {!hasSignedIn && (
                <button
                  className="px-3 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
                  onClick={handleClockIn}
                  disabled={isClocking || loadingApi}
                >
                  {isClocking ? "Clocking in…" : "Clock In"}
                </button>
              )}

              {hasSignedIn && !hasSignedOut && (
                <button
                  className="px-3 py-2 rounded bg-rose-600 text-white text-sm hover:bg-rose-700 disabled:opacity-60"
                  onClick={handleClockOut}
                  disabled={isClocking || loadingApi}
                >
                  {isClocking ? "Clocking out…" : "Clock Out"}
                </button>
              )}

              {hasSignedIn && hasSignedOut && (
                <button
                  disabled
                  className="px-3 py-2 rounded border text-sm bg-gray-50"
                  aria-disabled="true"
                >
                  Signed out
                </button>
              )}

              <button
                className="px-3 py-2 rounded bg-[#1180DA] text-white text-sm hover:bg-blue-600 disabled:opacity-60"
                onClick={() =>
                  openCorrection({
                    id: "new",
                    date: myToday?.date || todayStr,
                    ...myToday,
                  })
                }
                disabled={loadingApi}
              >
                Request Correction
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Donut Chart Summary */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h3 className="font-semibold mb-4">This Month Summary</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={monthSummary}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
              >
                {monthSummary.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Logs */}
        <div className="bg-white rounded-2xl shadow p-6 lg:col-span-2">
          <h3 className="font-semibold mb-4">Recent Attendance Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {[
                    "Date",
                    "Scheduled",
                    "Sign In",
                    "Sign Out",
                    "Status",
                    "Remark",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className="text-left p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myLogs.map((l) => (
                  <tr
                    key={l.id ?? JSON.stringify(l)}
                    className="border-t hover:bg-gray-50"
                  >
                    <td className="p-2">{l.date}</td>
                    <td className="p-2">
                      {l.scheduled?.start ?? l.shift?.start ?? "09:00"} –{" "}
                      {l.scheduled?.end ?? l.shift?.end ?? "17:00"}
                    </td>
                    <td className="p-2">{l.punches?.in ?? l.signIn ?? "—"}</td>
                    <td className="p-2">
                      {l.punches?.out ?? l.signOut ?? "—"}
                    </td>
                    <td className="p-2">
                      <StatusPill status={l.status} />
                    </td>
                    <td className="p-2 text-gray-600">{l.remark || "—"}</td>
                    <td className="p-2">
                      <button
                        className="text-[#1180DA] text-sm hover:underline"
                        onClick={() => openCorrection(l)}
                      >
                        Request Correction
                      </button>
                    </td>
                  </tr>
                ))}
                {myLogs.length === 0 && (
                  <tr>
                    <td colSpan="7" className="text-center p-4 text-gray-500">
                      No records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Requests */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-semibold mb-4">My Correction Requests</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {[
                  "Request ID",
                  "Date",
                  "Issue",
                  "Requested Change",
                  "Status",
                  "Created",
                ].map((h) => (
                  <th key={h} className="text-left p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myRequests.map((r) => (
                <tr
                  key={r.id ?? JSON.stringify(r)}
                  className="border-t hover:bg-gray-50"
                >
                  <td className="p-2">{r.id}</td>
                  <td className="p-2">{r.date}</td>
                  <td className="p-2">{r.issue}</td>
                  <td className="p-2">
                    {r.requestedChange?.in && (
                      <>
                        In → <b>{r.requestedChange.in}</b>&nbsp;
                      </>
                    )}
                    {r.requestedChange?.out && (
                      <>
                        Out → <b>{r.requestedChange.out}</b>
                      </>
                    )}
                  </td>
                  <td className="p-2">
                    <RequestStatusPill status={r.status} />
                  </td>
                  <td className="p-2">{r.createdAt}</td>
                </tr>
              ))}
              {myRequests.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center p-4 text-gray-500">
                    No requests
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Note: Corrections are reviewed by your manager. You’ll receive an
          email when a decision is made.
        </p>
      </div>

      {/* Correction Modal */}
      {showCorrection && (
        <CorrectionModal
          log={selectedLog}
          onClose={() => setShowCorrection(false)}
          onSubmit={(payload) => {
            console.log("Submit correction (mock)", payload);
            setShowCorrection(false);
            alert("Correction request submitted (mock).");
          }}
        />
      )}
    </div>
  );
}

/* --- Small Reusable UI Helpers --- */
function InfoBlock({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    present: "bg-emerald-100 text-emerald-700",
    late: "bg-amber-100 text-amber-700",
    absent: "bg-rose-100 text-rose-700",
    missing_punch: "bg-gray-100 text-gray-700",
    early_departure: "bg-purple-100 text-purple-700",
  };
  const label =
    {
      present: "Present",
      late: "Late",
      absent: "Absent",
      missing_punch: "Missing Punch",
      early_departure: "Early Departure",
    }[status] ||
    status ||
    "";
  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        map[status] || "bg-gray-100"
      }`}
    >
      {label}
    </span>
  );
}

function RequestStatusPill({ status }) {
  const map = {
    Pending: "bg-amber-100 text-amber-700",
    Approved: "bg-emerald-100 text-emerald-700",
    Rejected: "bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        map[status] || "bg-gray-100"
      }`}
    >
      {status}
    </span>
  );
}

function CorrectionModal({ log, onClose, onSubmit }) {
  const [form, setForm] = useState({
    date: (log && log.date) || "",
    in: (log && (log.punches?.in ?? log.signIn)) || "",
    out: (log && (log.punches?.out ?? log.signOut)) || "",
    reason: "",
    file: null,
  });

  // Keep form in sync if `log` prop changes while modal is open
  useEffect(() => {
    setForm({
      date: (log && log.date) || "",
      in: (log && (log.punches?.in ?? log.signIn)) || "",
      out: (log && (log.punches?.out ?? log.signOut)) || "",
      reason: "",
      file: null,
    });
  }, [log]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#1180DA]">
            Request Attendance Correction
          </h3>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label>
            <div className="mb-1 text-gray-600">Date</div>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              type="date"
            />
          </label>
          <div className="hidden md:block" />
          <label>
            <div className="mb-1 text-gray-600">Sign-In</div>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.in}
              onChange={(e) => setForm({ ...form, in: e.target.value })}
              placeholder="e.g. 09:03"
            />
          </label>
          <label>
            <div className="mb-1 text-gray-600">Sign-Out</div>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.out}
              onChange={(e) => setForm({ ...form, out: e.target.value })}
              placeholder="e.g. 17:05"
            />
          </label>
          <label className="md:col-span-2">
            <div className="mb-1 text-gray-600">Reason</div>
            <textarea
              rows={3}
              className="w-full border rounded px-3 py-2"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Brief explanation…"
            />
          </label>
          <label className="md:col-span-2">
            <div className="mb-1 text-gray-600">Attachment (optional)</div>
            <input
              type="file"
              className="w-full border rounded px-3 py-2"
              onChange={(e) =>
                setForm({ ...form, file: e.target.files?.[0] || null })
              }
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="px-3 py-2 rounded border" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-2 rounded bg-[#1180DA] text-white hover:bg-blue-600"
            onClick={() => onSubmit(form)}
          >
            <Send className="h-4 w-4 inline mr-1" /> Submit
          </button>
        </div>
      </div>
    </div>
  );
}
