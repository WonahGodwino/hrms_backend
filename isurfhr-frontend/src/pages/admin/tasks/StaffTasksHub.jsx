// src/pages/tasks/StaffTasksHub.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// lucide icons
import {
  Search,
  X,
  List,
  Calendar,
  Clock,
  AlertCircle,
  Check,
  CheckCircle,
} from "lucide-react";

/**
 * StaffTasksHub
 *
 * Props:
 * - fetchUrl: string (where to GET tasks) default '/api/tasks' (should return an array or { data: [] })
 * - updateUrl: string (where to POST updates) - optional
 *
 * Renders an empty-state UI (large centered card) when there are no tasks after fetch.
 */
export default function StaffTasksHub({
  fetchUrl = "/api/tasks",
  updateUrl = "/api/tasks/update",
}) {
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // details panel
  const [selectedTask, setSelectedTask] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [quickUpdate, setQuickUpdate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // fetch tasks on mount
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetch(fetchUrl)
      .then(async (res) => {
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Failed to fetch tasks (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setTasks(Array.isArray(list) ? list.filter(Boolean) : []);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Error fetching tasks:", err);
        setError(err.message || "Failed to load tasks");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [fetchUrl]);

  // helper: get urgency label
  const getUrgency = (dueDateStr) => {
    if (!dueDateStr) return "Normal";
    const due = new Date(dueDateStr);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (Number.isNaN(diffDays)) return "Normal";
    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Due Today";
    if (diffDays <= 3) return "Due Soon";
    return "Normal";
  };

  // computed counts for KPI pills
  const counts = useMemo(() => {
    const c = { all: 0, dueToday: 0, dueSoon: 0, overdue: 0, completed: 0 };
    tasks.forEach((t) => {
      c.all += 1;
      const u = getUrgency(t.due);
      if (u === "Due Today") c.dueToday += 1;
      else if (u === "Due Soon") c.dueSoon += 1;
      else if (u === "Overdue") c.overdue += 1;
      if ((t.status ?? "").toLowerCase() === "completed") c.completed += 1;
    });
    return c;
  }, [tasks]);

  // filter/search logic (supports words like 'soon', 'today', 'week')
  const filteredTasks = useMemo(() => {
    const q = (search || "").toLowerCase().trim();
    if (!q) return tasks;
    return tasks.filter((t) => {
      const title = (t.title ?? "").toString().toLowerCase();
      const status = (t.status ?? "").toString().toLowerCase();
      const urgency = getUrgency(t.due).toLowerCase();
      const withinWeek =
        !isNaN(new Date(t.due)) &&
        Math.ceil((new Date(t.due) - new Date()) / (1000 * 60 * 60 * 24)) <= 7;

      return (
        title.includes(q) ||
        status.includes(q) ||
        urgency.includes(q) ||
        (q.includes("soon") && urgency === "due soon") ||
        (q.includes("today") && urgency === "due today") ||
        (q.includes("week") && withinWeek)
      );
    });
  }, [tasks, search]);

  function urgencyBadge(due) {
    const u = getUrgency(due);
    const base = "px-2 py-1 rounded text-xs font-semibold";
    if (u === "Overdue")
      return <Badge className={`${base} bg-rose-100 text-rose-700`}>{u}</Badge>;
    if (u === "Due Today")
      return (
        <Badge className={`${base} bg-amber-100 text-amber-700`}>{u}</Badge>
      );
    if (u === "Due Soon")
      return (
        <Badge className={`${base} bg-yellow-100 text-yellow-700`}>{u}</Badge>
      );
    return <Badge className={`${base} bg-gray-100 text-gray-700`}>{u}</Badge>;
  }

  function priorityBadge(priority) {
    const base = "px-2 py-1 rounded text-xs font-semibold";
    if ((priority ?? "").toLowerCase() === "high")
      return (
        <Badge className={`${base} bg-rose-100 text-rose-700`}>High</Badge>
      );
    if ((priority ?? "").toLowerCase() === "medium")
      return (
        <Badge className={`${base} bg-amber-100 text-amber-700`}>Medium</Badge>
      );
    return (
      <Badge className={`${base} bg-emerald-100 text-emerald-700`}>Low</Badge>
    );
  }

  // open details panel
  const openDetails = (task) => {
    setSelectedTask(task);
    setQuickUpdate("");
    setShowDetails(true);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedTask(null);
    setQuickUpdate("");
  };

  // mark completed (optimistic) -- posts to updateUrl if provided
  const markCompleted = async (taskId) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: "Completed" } : t))
    );
    if (selectedTask?.id === taskId) {
      setSelectedTask((s) => (s ? { ...s, status: "Completed" } : s));
    }

    try {
      const res = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action: "markCompleted" }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Update failed (${res.status})`);
      }
      const payload = await res.json();
      const updated = Array.isArray(payload)
        ? payload[0]
        : payload?.data ?? payload;
      if (updated) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t))
        );
      }
    } catch (err) {
      console.error("Failed to persist completion:", err);
    }
  };

  // save quick update (optimistic)
  const saveQuickUpdate = async () => {
    if (!selectedTask) return;
    if (!quickUpdate.trim()) return;
    setSubmitting(true);
    try {
      console.log("Task Update:", {
        taskId: selectedTask.id,
        update: quickUpdate,
      });
      await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: selectedTask.id,
          action: "addUpdate",
          update: quickUpdate,
        }),
      }).catch((e) => console.error("Quick update persist failed:", e));
      setQuickUpdate("");
    } finally {
      setSubmitting(false);
    }
  };

  // Render empty state when fetch completed and there are NO tasks at all
  const showEmptyState = !loading && tasks.length === 0;

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-6 gap-4">
        <h1 className="text-3xl font-semibold text-[#1180DA]">My Tasks</h1>

        <div className="relative w-full sm:w-72">
          <Input
            placeholder="Search tasks (e.g. 'soon', 'today', 'week')..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-10 py-2"
          />
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden
          >
            <Search size={16} />
          </span>
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {/* KPI pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Button
          variant="ghost"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-primary/10 hover:bg-primary/20 text-[#1180DA]"
          onClick={() => setSearch("")}
        >
          <List size={18} className="text-current" />
          All
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-[#1180DA] text-white">
            {counts.all}
          </span>
        </Button>

        <Button
          variant="outline"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full"
          onClick={() => setSearch("today")}
        >
          <Calendar size={18} />
          Due Today
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-500 text-white">
            {counts.dueToday}
          </span>
        </Button>

        <Button
          variant="outline"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full"
          onClick={() => setSearch("soon")}
        >
          <Clock size={18} />
          Due Soon
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-500 text-white">
            {counts.dueSoon}
          </span>
        </Button>

        <Button
          variant="outline"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full"
          onClick={() => setSearch("overdue")}
        >
          <AlertCircle size={18} />
          Overdue
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500 text-white">
            {counts.overdue}
          </span>
        </Button>

        <Button
          variant="outline"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full"
          onClick={() => setSearch("completed")}
        >
          <Check size={18} />
          Completed
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-500 text-white">
            {counts.completed}
          </span>
        </Button>
      </div>

      {/* If empty state (no tasks after fetch) show large centered empty illustration/card */}
      {showEmptyState ? (
        <main className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="flex items-center justify-center rounded-xl bg-[#f8fafc] p-16">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1180DA]/10 mb-4">
                <CheckCircle size={32} className="text-[#1180DA]" />
              </div>
              <h3 className="text-lg font-semibold">No tasks found.</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or create a new task.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button
                  onClick={() => {
                    /* open create modal if you have one */
                  }}
                  className="bg-[#1180DA] text-white"
                >
                  New Task
                </Button>
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear filters
                </Button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        // Regular table view (same as previous refactor)
        <main className="bg-white rounded-xl shadow-md overflow-hidden">
          <Card className="rounded-none shadow-none">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Loading tasks…
                  </div>
                ) : error ? (
                  <div className="p-6 text-center text-sm text-rose-600">
                    Error: {error}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Urgency</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.length > 0 ? (
                        filteredTasks.map((t) => (
                          <TableRow key={t.id ?? t._id ?? JSON.stringify(t)}>
                            <TableCell className="whitespace-nowrap">
                              <div className="font-semibold">{t.title}</div>
                              {t.description && (
                                <div className="text-xs text-muted-foreground">
                                  {String(t.description).slice(0, 80)}
                                  {String(t.description).length > 80 ? "…" : ""}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{priorityBadge(t.priority)}</TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {t.status ?? "Open"}
                              </div>
                            </TableCell>
                            <TableCell>{t.due ?? t.dueDate ?? "—"}</TableCell>
                            <TableCell>{urgencyBadge(t.due)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-4">
                                <button
                                  className="text-[#1180DA] hover:underline text-sm"
                                  onClick={() => openDetails(t)}
                                >
                                  View
                                </button>
                                {(t.status ?? "").toLowerCase() !==
                                "completed" ? (
                                  <button
                                    className="text-emerald-700 hover:underline text-sm"
                                    onClick={() => markCompleted(t.id ?? t._id)}
                                  >
                                    Mark Completed
                                  </button>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    Completed
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center p-6 text-gray-500"
                          >
                            No tasks found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      )}

      {/* Details Slide-over using Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md ml-auto">
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <div className="text-sm text-muted-foreground">Title</div>
              <div className="font-semibold">{selectedTask?.title}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="font-medium">{selectedTask?.status}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Priority</div>
                <div className="font-medium">{selectedTask?.priority}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Due Date</div>
                <div className="font-medium">{selectedTask?.due}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Urgency</div>
                <div className="font-medium">
                  {selectedTask ? getUrgency(selectedTask.due) : "—"}
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Description</div>
              <p className="text-gray-700 leading-relaxed">
                {selectedTask?.description ?? "No description provided."}
              </p>
            </div>

            <div className="pt-2">
              <div className="text-sm text-muted-foreground mb-2">
                Quick Update
              </div>
              <textarea
                rows={3}
                value={quickUpdate}
                onChange={(e) => setQuickUpdate(e.target.value)}
                placeholder="Add a quick progress update…"
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-3 mt-3">
                <Button
                  onClick={saveQuickUpdate}
                  disabled={submitting || !quickUpdate.trim()}
                >
                  Save Update
                </Button>
                {selectedTask &&
                  (selectedTask.status ?? "").toLowerCase() !== "completed" && (
                    <Button
                      onClick={() =>
                        markCompleted(selectedTask.id ?? selectedTask._id)
                      }
                      className="bg-emerald-600"
                    >
                      Mark Completed
                    </Button>
                  )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowDetails(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
