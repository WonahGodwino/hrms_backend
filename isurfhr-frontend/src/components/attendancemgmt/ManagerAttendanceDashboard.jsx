import React, { useMemo, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { Users, Clock, AlertTriangle, Download, Search, Eye, Check, X } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";



export default function ManagerAttendanceDashboard() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const myUnit = "IT";

  // ✅ Mock team & attendance (from your code above)
  const team = [
    { id: "EMP002", name: "Jane Smith", role: "Engineer" },
    { id: "EMP004", name: "Sarah Wilson", role: "Support" },
    { id: "EMP006", name: "Alex King", role: "Engineer" },
  ];

  const attendance = [
    {
      id: 1,
      staffId: "EMP002",
      name: "Jane Smith",
      unit: "IT",
      date,
      scheduled: { start: "09:00", end: "17:00" },
      punches: { in: "08:57", out: "17:02" },
      status: "present",
      remark: "",
    },
    {
      id: 2,
      staffId: "EMP004",
      name: "Sarah Wilson",
      unit: "IT",
      date,
      scheduled: { start: "09:00", end: "17:00" },
      punches: { in: "09:18", out: null },
      status: "late",
      remark: "Arrived 18m late",
    },
    {
      id: 3,
      staffId: "EMP006",
      name: "Alex King",
      unit: "IT",
      date,
      scheduled: { start: "22:00", end: "06:00" },
      punches: { in: null, out: null },
      status: "absent",
      remark: "No punches",
    },
  ];

  const anomalies = [
    { id: "AN-9901", type: "late_arrival", staffId: "EMP004", name: "Sarah Wilson", time: "09:18", details: "18m late" },
    { id: "AN-9902", type: "missing_punch", staffId: "EMP006", name: "Alex King", time: null, details: "No sign-in recorded" },
  ];

  // ✅ Derive these instead of using undefined variables
  const presentStaff = attendance
    .filter(a => a.status === "present" || a.status === "late") // treat late as present too
    .map(a => ({
      name: a.name,
      signInTime: a.punches.in || "—",
    }));

  const recentAnomalies = anomalies.map(a => ({
    name: a.name,
    type: a.type.replace("_", " "),
    time: a.time || "—",
  }));

  const corrections = [
    {
      id: "CR-4101",
      staffId: "EMP004",
      staffName: "Sarah Wilson",
      unit: "IT",
      date,
      issue: "Incorrect Sign-Out",
      requestedChange: { out: "17:05" },
      reason: "Forgot to punch out",
      status: "Pending",
      createdAt: `${date} 17:45`,
    },
  ];

  const stats = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, missing_punch: 0, early_departure: 0 };
    attendance.forEach(a => counts[a.status] = (counts[a.status] || 0) + 1);
    const currentlyClockedIn = attendance.filter(a => !!a.punches.in && !a.punches.out).length;
    return {
      present: counts.present,
      late: counts.late,
      absent: counts.absent,
      missing: counts.missing_punch,
      earlyOut: counts.early_departure,
      current: currentlyClockedIn,
      pendingCorrections: corrections.filter(c => c.status === "Pending").length,
    };
  }, [attendance, corrections]);

  const filteredAttendance = attendance.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.staffId.toLowerCase().includes(search.toLowerCase())
  );

  const statusChart = [
    { name: "Present", value: stats.present },
    { name: "Late", value: stats.late },
    { name: "Absent", value: stats.absent },
    { name: "Missing", value: stats.missing },
    { name: "Early Out", value: stats.earlyOut },
  ];
  const STATUS_COLORS = ["#10B981", "#F59E0B", "#EF4444", "#9CA3AF", "#6366F1"];

  const barData = [
    { name: "Engineer", present: 1, late: 1, absent: 1 },
    { name: "Support", present: 0, late: 1, absent: 0 },
  ];

  const downloadCSV = () => {
    const headers = ["Staff ID", "Name", "Unit", "Date", "Scheduled", "Sign In", "Sign Out", "Status", "Remark"];
    const csvContent = [
      headers.join(","),
      ...attendance.map(a => [
        a.staffId,
        a.name,
        a.unit,
        a.date,
        `${a.scheduled.start}-${a.scheduled.end}`,
        a.punches.in || "N/A",
        a.punches.out || "N/A",
        a.status,
        a.remark || "",
      ].join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unit_attendance_${date}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const approveCorrection = (id) => {
    console.log("Approve correction (mock):", id);
    alert("Correction approved (mock).");
  };
  const rejectCorrection = (id) => {
    console.log("Reject correction (mock):", id);
    alert("Correction rejected (mock).");
  };

  return (
    <DashboardLayout role="manager">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1180DA]">Attendance — {myUnit} Unit</h1>
          <div className="flex items-center gap-3">
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button
              className="bg-[#1180DA] text-white px-4 py-2 rounded hover:bg-blue-600"
              onClick={downloadCSV}
            >
              <Download className="inline h-4 w-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 border-b">
          {["overview", "attendance", "corrections"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-4 text-sm font-medium border-b-2 capitalize
                ${activeTab === tab ? "border-[#1180DA] text-[#1180DA]" : "border-transparent text-gray-600 hover:text-gray-800"}`}
            >
              {tab}
            </button>
          ))}
        </div>

          {/* Manager Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[
              { label: "Team Size", value: team.length, color: "text-gray-900", icon: <Users className="h-7 w-7 text-blue-600" /> },
              { label: "Present Today", value: stats.present, color: "text-green-600", icon: <Clock className="h-7 w-7 text-green-600" /> },
              { label: "Late Arrivals", value: stats.late, color: "text-yellow-600", icon: <AlertTriangle className="h-7 w-7 text-yellow-600" /> },
              { label: "Absent", value: stats.absent, color: "text-red-600", icon: <Users className="h-7 w-7 text-red-600" /> },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl shadow hover:shadow-md">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">{stat.label}</p>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                  {stat.icon}
                </div>
              </div>
            ))}
          </div>

        {activeTab === "overview" && (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Present Staff */}
    <div className="bg-white p-6 rounded-2xl shadow">
      <h3 className="text-lg font-semibold mb-4">Present Staff (Today)</h3>
      {presentStaff.length > 0 ? (
        presentStaff.map((staff, idx) => (
          <div
            key={idx}
            className="flex items-center bg-green-50 p-3 rounded-lg mb-2"
          >
            <Users className="h-5 w-5 text-green-600 mr-3" />
            <div className="flex-1">
              <p className="font-medium">{staff.name}</p>
              <p className="text-sm text-gray-600">
                Signed in at {staff.signInTime}
              </p>
            </div>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
              Present
            </span>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm">No staff currently present</p>
      )}
    </div>

    {/* Recent Anomalies */}
    <div className="bg-white p-6 rounded-2xl shadow">
      <h3 className="text-lg font-semibold mb-4">Recent Anomalies</h3>
      {recentAnomalies.length > 0 ? (
        recentAnomalies.map((anomaly, idx) => (
          <div
            key={idx}
            className="flex items-center bg-red-50 p-3 rounded-lg mb-2"
          >
            <AlertTriangle className="h-5 w-5 text-red-500 mr-3" />
            <div className="flex-1">
              <p className="font-medium">{anomaly.name}</p>
              <p className="text-sm text-gray-600">{anomaly.details}</p>
            </div>
            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
              {anomaly.type}
            </span>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm">No anomalies recorded today</p>
      )}
    </div>
  </div>
)}

        {activeTab === "attendance" && (
          <div className="bg-white rounded-lg shadow p-5 mb-6">
            {/* Search */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-500" />
                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Search by staff name or ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Staff</th>
                    <th className="text-left p-2">Scheduled</th>
                    <th className="text-left p-2">Sign In</th>
                    <th className="text-left p-2">Sign Out</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Remark</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-gray-50">
                      <td className="p-2">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-gray-500">{a.staffId}</div>
                      </td>
                      <td className="p-2">{a.scheduled.start} – {a.scheduled.end}</td>
                      <td className="p-2">{a.punches.in || "—"}</td>
                      <td className="p-2">{a.punches.out || "—"}</td>
                      <td className="p-2"><StatusPill status={a.status} /></td>
                      <td className="p-2 text-gray-600">{a.remark || "—"}</td>
                      <td className="p-2">
                        <button className="text-[#1180DA] hover:underline"><Eye className="inline h-4 w-4 mr-1" /> View</button>
                      </td>
                    </tr>
                  ))}
                  {filteredAttendance.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center p-4 text-gray-500">No records</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "corrections" && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-semibold">Correction Requests</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Request ID</th>
                    <th className="text-left p-2">Staff</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Issue</th>
                    <th className="text-left p-2">Requested Change</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-gray-50">
                      <td className="p-2">{c.id}</td>
                      <td className="p-2">
                        <div className="font-medium">{c.staffName}</div>
                        <div className="text-xs text-gray-500">{c.staffId}</div>
                      </td>
                      <td className="p-2">{c.date}</td>
                      <td className="p-2">{c.issue}</td>
                      <td className="p-2">
                        {c.requestedChange.in && <>In → <b>{c.requestedChange.in}</b>&nbsp;</>}
                        {c.requestedChange.out && <>Out → <b>{c.requestedChange.out}</b></>}
                      </td>
                      <td className="p-2"><RequestStatusPill status={c.status} /></td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <button
                            className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            onClick={() => approveCorrection(c.id)}
                          >
                            <Check className="inline h-3 w-3 mr-1" /> Approve
                          </button>
                          <button
                            className="px-2 py-1 text-xs rounded bg-rose-100 text-rose-700 hover:bg-rose-200"
                            onClick={() => rejectCorrection(c.id)}
                          >
                            <X className="inline h-3 w-3 mr-1" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {corrections.length === 0 && (
                    <tr>
                      <td colSpan="7" className="text-center p-4 text-gray-500">No pending requests</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Recent Anomalies */}
            <div className="p-5 border-t">
              <h4 className="font-semibold mb-3">Recent Anomalies</h4>
              <div className="space-y-3">
                {anomalies.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded border">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-rose-500" />
                      <div>
                        <div className="font-medium">{a.name} <span className="text-xs text-gray-500">({a.staffId})</span></div>
                        <div className="text-xs text-gray-600">{a.type.replace("_", " ")} • {a.details}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{a.time || "—"}</div>
                  </div>
                ))}
                {anomalies.length === 0 && (
                  <div className="text-sm text-gray-500">No anomalies</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, color, Icon }) {
  return (
    <div className={`p-4 rounded-lg ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
        {Icon && <Icon className="h-6 w-6 opacity-70" />}
      </div>
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
  const label = {
    present: "Present",
    late: "Late",
    absent: "Absent",
    missing_punch: "Missing Punch",
    early_departure: "Early Departure",
  }[status] || status;

  return <span className={`px-2 py-1 rounded text-xs font-medium ${map[status] || "bg-gray-100"}`}>{label}</span>;
}

function RequestStatusPill({ status }) {
  const map = {
    Pending: "bg-amber-100 text-amber-700",
    Approved: "bg-emerald-100 text-emerald-700",
    Rejected: "bg-rose-100 text-rose-700",
  };
  return <span className={`px-2 py-1 rounded text-xs font-medium ${map[status] || "bg-gray-100"}`}>{status}</span>;
}