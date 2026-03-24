// src/pages/tasks/ManagerAssignedTasks.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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

/**
 * ManagerAssignedTasks
 *
 * Page component that shows assigned tasks, filters, reassign and details.
 *
 * Props (optional):
 * - fetchUrl: endpoint to fetch assigned tasks (default '/api/tasks/assigned')
 * - assigneesUrl: endpoint to fetch possible assignees (default '/api/users')
 * - reassignUrl: endpoint to post reassignment (default '/api/tasks/reassign')
 */
export default function ManagerAssignedTasks({
  fetchUrl = "/api/tasks/assigned",
  assigneesUrl = "/api/users",
  reassignUrl = "/api/tasks/reassign",
}) {
  // data states
  const [tasks, setTasks] = useState([]);
  const [assignees, setAssignees] = useState([]);

  // loading / errors
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingAssignees, setLoadingAssignees] = useState(true);
  const [error, setError] = useState(null);

  // filters
  const [filters, setFilters] = useState({
    status: "",
    priority: "",
    assignee: "",
    search: "",
  });

  // reassign dialog state
  const [showAssign, setShowAssign] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newAssignee, setNewAssignee] = useState("");

  // details dialog state
  const [showDetails, setShowDetails] = useState(false);

  // Reset ephemeral state when component unmounts
  useEffect(() => {
    return () => {
      setSelectedTask(null);
      setNewAssignee("");
      setShowAssign(false);
      setShowDetails(false);
      setFilters({ status: "", priority: "", assignee: "", search: "" });
    };
  }, []);

  // fetch tasks on mount (and when fetchUrl changes)
  useEffect(() => {
    let mounted = true;
    setLoadingTasks(true);
    setError(null);
    fetch(fetchUrl)
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Failed to fetch tasks (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setTasks(list);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Error fetching tasks:", err);
        setError(err.message || "Failed to load tasks");
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingTasks(false);
      });
    return () => {
      mounted = false;
    };
  }, [fetchUrl]);

  // fetch assignees on mount (and when assigneesUrl changes)
  useEffect(() => {
    let mounted = true;
    setLoadingAssignees(true);
    fetch(assigneesUrl)
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Failed to fetch users (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setAssignees(list);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Error fetching assignees:", err);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingAssignees(false);
      });

    return () => {
      mounted = false;
    };
  }, [assigneesUrl]);

  // helpers to support different API shapes
  const getAssigneeName = (t) => {
    if (!t) return "";
    return (
      t?.assignee?.name ??
      t?.assigneeName ??
      t?.assignee ??
      (t?.assigneeId ? String(t.assigneeId) : "")
    );
  };

  const getId = (obj) => obj?.id ?? obj?._id ?? obj?.userId ?? obj;

  // filtering logic (client-side)
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const statusMatch = !filters.status || t.status === filters.status;
      const priorityMatch =
        !filters.priority || t.priority === filters.priority;
      const assigneeValue = getAssigneeName(t);
      const assigneeMatch =
        !filters.assignee || String(assigneeValue) === String(filters.assignee);
      const searchMatch =
        !filters.search ||
        (t.title ?? "")
          .toString()
          .toLowerCase()
          .includes(filters.search.toLowerCase());
      return statusMatch && priorityMatch && assigneeMatch && searchMatch;
    });
  }, [tasks, filters]);

  // open reassign dialog
  const openAssignModal = (task) => {
    setSelectedTask(task);
    const current =
      task?.assignee ?? task?.assigneeName ?? task?.assigneeId ?? "";
    setNewAssignee(String(current));
    setShowAssign(true);
  };

  // submit reassign request
  const handleReassign = async () => {
    if (!selectedTask) return;
    const payload = {
      taskId: selectedTask.id ?? selectedTask._id ?? selectedTask.taskId,
      assignee: newAssignee,
    };

    try {
      const res = await fetch(reassignUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Failed to reassign (${res.status})`);
      }

      const body = await res.json();
      const updatedTask = Array.isArray(body) ? body[0] : body?.data ?? body;

      setTasks((prev) =>
        prev.map((x) =>
          (x.id ?? x._id ?? x.taskId) === payload.taskId
            ? { ...x, assignee: updatedTask?.assignee ?? newAssignee }
            : x
        )
      );
      setShowAssign(false);
      setSelectedTask(null);
      setNewAssignee("");
    } catch (err) {
      console.error("Reassign failed:", err);
    }
  };

  // open details dialog
  const openDetails = (task) => {
    setSelectedTask(task);
    setShowDetails(true);
  };

  // UI render helpers
  const priorityBadgeClasses = (p) =>
    p === "High"
      ? "bg-rose-100 text-rose-700"
      : p === "Medium"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  const statusBadgeClasses = (s) =>
    s === "In Progress"
      ? "bg-blue-100 text-blue-700"
      : s === "Completed"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-gray-100 text-gray-600";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assigned Tasks</h1>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {loadingTasks ? "Loading…" : `${tasks.length} total`}
          </div>
          <Button
            size="sm"
            onClick={() => (window.location.href = "/manager-tasks/create")}
          >
            + Create Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label className="text-sm">Status</Label>
              <Select
                value={filters.status === "" ? "__all__" : filters.status}
                onValueChange={(v) =>
                  setFilters((s) => ({
                    ...s,
                    status: v === "__all__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="w-full min-h-[40px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Priority</Label>
              <Select
                value={filters.priority === "" ? "__all__" : filters.priority}
                onValueChange={(v) =>
                  setFilters((s) => ({
                    ...s,
                    priority: v === "__all__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="w-full min-h-[40px]">
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Assignee</Label>
              <Select
                value={filters.assignee === "" ? "__all__" : filters.assignee}
                onValueChange={(v) =>
                  setFilters((s) => ({
                    ...s,
                    assignee: v === "__all__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="w-full min-h-[40px]">
                  <SelectValue placeholder="All assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {assignees.map((a, idx) => {
                    const id = String(
                      getId(a) ?? a?.email ?? a?.name ?? `assignee-${idx}`
                    );
                    const label = a?.name ?? a?.fullName ?? a?.username ?? id;
                    return (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="text-sm">Search</Label>
              <Input
                placeholder="Search title…"
                value={filters.search}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, search: e.target.value }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loadingTasks ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading tasks…
            </div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-rose-600">
              Error loading tasks: {error}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length > 0 ? (
                    filtered.map((t) => {
                      const assigneeName = getAssigneeName(t);
                      return (
                        <TableRow key={t.id ?? t._id ?? JSON.stringify(t)}>
                          <TableCell>{t.title}</TableCell>
                          <TableCell>{assigneeName}</TableCell>
                          <TableCell>
                            <Badge
                              className={`px-2 py-1 text-xs ${priorityBadgeClasses(
                                t.priority
                              )}`}
                            >
                              {t.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`px-2 py-1 text-xs ${statusBadgeClasses(
                                t.status
                              )}`}
                            >
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{t.due ?? t.dueDate ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-4">
                              <button
                                className="text-[#1180DA] hover:underline text-sm"
                                onClick={() => openAssignModal(t)}
                              >
                                Reassign
                              </button>
                              <button
                                className="text-gray-600 hover:underline text-sm"
                                onClick={() => openDetails(t)}
                              >
                                View
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center p-6 text-gray-500"
                      >
                        No tasks match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reassign Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Task</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <div className="text-sm font-medium">{selectedTask?.title}</div>
              <div className="text-xs text-muted-foreground">
                {selectedTask?.description}
              </div>
            </div>

            <div>
              <Label className="text-sm">Assign to</Label>
              <Select
                value={newAssignee}
                onValueChange={(v) => setNewAssignee(v)}
              >
                <SelectTrigger className="w-full min-h-[40px]">
                  <SelectValue placeholder="Choose assignee" />
                </SelectTrigger>
                <SelectContent>
                  {assignees.map((a, idx) => {
                    const id = String(
                      getId(a) ?? a?.email ?? a?.name ?? `assignee-${idx}`
                    );
                    const label = a?.name ?? a?.fullName ?? a?.username ?? id;
                    return (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowAssign(false)}>
                Cancel
              </Button>
              <Button onClick={handleReassign} disabled={!newAssignee}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details Dialog (side-style) */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md ml-auto">
          <DialogHeader>
            <DialogTitle>{selectedTask?.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              {selectedTask?.description}
            </p>

            <div className="space-y-2 text-sm">
              <p>
                <strong>Assignee:</strong> {getAssigneeName(selectedTask)}
              </p>
              <p>
                <strong>Priority:</strong>{" "}
                <Badge
                  className={`px-2 py-1 text-xs ${priorityBadgeClasses(
                    selectedTask?.priority
                  )}`}
                >
                  {selectedTask?.priority}
                </Badge>
              </p>
              <p>
                <strong>Status:</strong>{" "}
                <Badge
                  className={`px-2 py-1 text-xs ${statusBadgeClasses(
                    selectedTask?.status
                  )}`}
                >
                  {selectedTask?.status}
                </Badge>
              </p>
              <p>
                <strong>Due:</strong>{" "}
                {selectedTask?.due ?? selectedTask?.dueDate ?? "—"}
              </p>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowDetails(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* close page action */}
      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
      </div>
    </div>
  );
}
