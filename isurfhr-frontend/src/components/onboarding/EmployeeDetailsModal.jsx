// src/components/onboarding/EmployeeDetailsModal.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Check, Clock, Bell, X } from "lucide-react";
import { Separator } from "@/components/ui/separator"; // shadcn separator
import { ScrollArea } from "@/components/ui/scroll-area"; // shadcn scroll area

const computeProgressPercent = (tasks = []) => {
  if (!tasks || tasks.length === 0) return 0;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  return Math.round((completed / tasks.length) * 100);
};

const humanStatus = (status) => {
  if (!status) return "Pending";
  const s = status.toString().toUpperCase();
  if (s === "COMPLETED") return "Completed";
  if (s === "IN_PROGRESS") return "In progress";
  if (s === "BLOCKED") return "Blocked";
  if (s === "PENDING") return "Pending";
  return s;
};

const EmployeeDetailsModal = ({
  open = false,
  employee = null,
  tasks = [],
  stages = [],
  onOpenChange = undefined,
  onClose = undefined,
  onUpdateTask = async () => {},
  onUpdateStage = async () => {},
  onSendReminder = () => {},
}) => {
  const [localTasks, setLocalTasks] = useState(tasks || []);
  const [editingNote, setEditingNote] = useState({});
  const [savingTask, setSavingTask] = useState(null);
  const [selectedStage, setSelectedStage] = useState(
    employee?.currentStage ?? ""
  );

  // sync logic: only set tasks when modal opens or employee changes
  useEffect(() => {
    if (open) setLocalTasks(tasks || []);
  }, [open, employee?.id]);

  useEffect(() => {
    setSelectedStage(employee?.currentStage ?? "");
  }, [employee?.currentStage]);

  const progressPercent = useMemo(
    () => computeProgressPercent(localTasks),
    [localTasks]
  );

  const handleToggleTaskStatus = async (taskId) => {
    const task = localTasks.find((t) => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";

    setLocalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    setSavingTask(taskId);
    try {
      await onUpdateTask(employee.id, taskId, { status: newStatus });
    } catch (err) {
      console.error("Failed to update task:", err);
      setLocalTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)));
    } finally {
      setSavingTask(null);
    }
  };

  const handleSaveNote = async (taskId) => {
    const note = editingNote[taskId] ?? "";
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              notes: [
                ...(t.notes || []),
                { by: "admin", text: note, date: new Date().toISOString() },
              ],
            }
          : t
      )
    );
    setSavingTask(taskId);
    try {
      await onUpdateTask(employee.id, taskId, { notes: note });
      setEditingNote((prev) => ({ ...prev, [taskId]: "" }));
    } catch (err) {
      console.error("Failed to save note:", err);
    } finally {
      setSavingTask(null);
    }
  };

  const handleStageChange = async (newStage) => {
    setSelectedStage(newStage);
    if (typeof onUpdateStage === "function") {
      try {
        await onUpdateStage(employee.id, newStage);
      } catch (err) {
        console.error("Failed to update stage:", err);
      }
    }
  };

  const handleSendReminder = (taskId = null) => {
    if (typeof onSendReminder === "function") {
      onSendReminder(employee.id, taskId);
    } else {
      console.log("Reminder (simulated) ->", {
        employeeId: employee?.id,
        taskId,
      });
    }
  };

  const renderStatusPill = (status) => {
    const s = (status || "PENDING").toString().toUpperCase();
    const base =
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";
    if (s === "COMPLETED")
      return (
        <span className={`${base} bg-green-100 text-green-800`}>
          {humanStatus(s)}
        </span>
      );
    if (s === "IN_PROGRESS")
      return (
        <span className={`${base} bg-blue-100 text-blue-800`}>
          {humanStatus(s)}
        </span>
      );
    if (s === "BLOCKED")
      return (
        <span className={`${base} bg-red-100 text-red-800`}>
          {humanStatus(s)}
        </span>
      );
    return (
      <span className={`${base} bg-gray-100 text-gray-800`}>
        {humanStatus(s)}
      </span>
    );
  };

  const handleInternalOpenChange = (isOpen) => {
    if (typeof onOpenChange === "function") {
      onOpenChange(isOpen);
      return;
    }
    if (!isOpen && typeof onClose === "function") {
      onClose();
    }
  };

  const descId = employee
    ? `employee-details-desc-${employee.id}`
    : "employee-details-desc";

  return (
    <Dialog open={!!open} onOpenChange={handleInternalOpenChange}>
      <DialogContent className="sm:max-w-3xl" aria-describedby={descId}>
        {/* Header: left = title, right = stage select + close button */}
        <header className="flex items-start justify-evenly gap-4">
          <div>
            <DialogTitle className="text-lg font-semibold">
              {employee ? `Onboarding — ${employee.name}` : "Onboarding"}
            </DialogTitle>

            <p id={descId} className="sr-only">
              {employee
                ? `${employee.name}, ${employee.jobTitle ?? ""}, ${
                    employee.department ?? ""
                  }. Onboarding details and tasks.`
                : "Onboarding details and tasks."}
            </p>

            {employee && (
              <p className="text-sm text-muted-foreground mt-1">
                {employee.jobTitle ?? ""} • {employee.department ?? ""}
              </p>
            )}
          </div>

          {/* Right controls: give stage select breathing room, and place the Close button to the far right */}
          <div className="flex items-center gap-4">
            {/* Stage select container has a little right padding so it doesn't sit flush against the close button */}
            <div className="w-56 pr-2">
              <Label className="text-xs text-muted-foreground mb-1">
                Stage
              </Label>
              <Select
                value={selectedStage ?? ""}
                onValueChange={(v) => handleStageChange(v)}
              >
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages
                    .filter((s) => s && s.trim() !== "")
                    .map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        <Separator className="my-4" />

        {/* Summary cards: items-stretch + cards fill height so they look uniform */}
        <section className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          <Card className="h-full">
            <CardContent className="p-4 h-full flex flex-col justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Start date</p>
                <p className="text-sm font-medium">
                  {employee?.startDate ?? "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardContent className="p-4 h-full flex flex-col justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Progress</p>
                <div className="mt-2">
                  <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, progressPercent)
                        )}%`,
                        background:
                          progressPercent >= 100
                            ? "linear-gradient(90deg,#16a34a,#059669)"
                            : "linear-gradient(90deg,#3b82f6,#06b6d4)",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span>{progressPercent}%</span>
                    <span className="text-muted-foreground text-xs">
                      {localTasks.length} tasks
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardContent className="p-4 h-full flex flex-col justify-between">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current stage</p>
                  <p className="font-medium">{employee?.currentStage ?? "—"}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSendReminder()}
                  >
                    <Bell className="w-4 h-4 mr-2" /> Send reminder
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-4" />

        {/* Tasks list inside scrollable area */}
        <section className="mt-6">
          <h3 className="text-lg font-semibold">Onboarding tasks</h3>

          {localTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">
              No tasks assigned to this employee.
            </p>
          ) : (
            <ScrollArea className="mt-3 max-h-[48vh]">
              <div className="space-y-3 pr-2">
                {localTasks.map((task, idx) => (
                  <Card key={task.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted text-sm font-semibold">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-semibold text-sm truncate">
                                  {task.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {task.stage ? `${task.stage}` : "General"}
                                </p>
                              </div>
                            </div>

                            <div className="ml-3">
                              {renderStatusPill(task.status)}
                            </div>
                          </div>

                          {/* notes */}
                          <div className="mt-3 text-sm">
                            {task.notes && task.notes.length > 0 ? (
                              <div className="space-y-1">
                                {task.notes.map((n, i) => (
                                  <div
                                    key={i}
                                    className="text-xs text-muted-foreground"
                                  >
                                    <span className="font-medium">{n.by}</span>
                                    <span className="ml-2">•</span>
                                    <span className="ml-2">
                                      {new Date(n.date).toLocaleString()}
                                    </span>
                                    <div className="mt-1">{n.text}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">
                                No notes yet.
                              </p>
                            )}
                          </div>

                          {/* quick add note */}
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                            <Input
                              placeholder="Add a quick note..."
                              value={editingNote[task.id] ?? ""}
                              onChange={(e) =>
                                setEditingNote((prev) => ({
                                  ...prev,
                                  [task.id]: e.target.value,
                                }))
                              }
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveNote(task.id)}
                                disabled={savingTask === task.id}
                              >
                                {savingTask === task.id
                                  ? "Saving..."
                                  : "Save note"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditingNote((prev) => ({
                                    ...prev,
                                    [task.id]: "",
                                  }))
                                }
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* action column */}
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleTaskStatus(task.id)}
                              disabled={savingTask === task.id}
                            >
                              <Check className="w-4 h-4 mr-2" />
                              {task.status === "COMPLETED"
                                ? "Mark In progress"
                                : "Mark Completed"}
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSendReminder(task.id)}
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              Reminder
                            </Button>
                          </div>

                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground">
                              Due: {new Date(task.dueDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </section>

        <footer className="flex items-center justify-end gap-2 mt-6">
          <Button
            variant="outline"
            onClick={() => handleInternalOpenChange(false)}
          >
            Close
          </Button>
          <Button onClick={() => handleInternalOpenChange(false)}>Done</Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeDetailsModal;
