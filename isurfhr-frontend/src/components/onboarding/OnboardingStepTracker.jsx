// src/components/onboarding/OnboardingStepTracker.jsx
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, MessageSquare, Bell } from "lucide-react";
import ProgressStatusBadge from "./ProgressStatusBadge";

/**
 * OnboardingStepTracker
 *
 * Props:
 *  - employeeId?: string               // optional (used when calling handlers)
 *  - tasks: OnboardingTask[]           // [{id, title, status, stage, dueDate, notes: [{by,text,date}], ...}]
 *  - stages?: string[]                 // ordered stage list (optional, for display)
 *  - compact?: boolean                 // smaller layout for lists
 *
 *  - onToggleTaskStatus(employeeId, taskId) => Promise|void
 *  - onSaveNote(employeeId, taskId, note) => Promise|void
 *  - onSendReminder(employeeId, taskId) => Promise|void
 *
 * Notes:
 *  - Component does not mutate incoming `tasks` array directly; it keeps a small local copy for UI editing of notes.
 *  - Handlers may be synchronous or return a Promise. The component shows a basic "saving" state while awaiting a Promise.
 */
const OnboardingStepTracker = ({
  employeeId = null,
  tasks = [],
  stages = [],
  compact = false,
  onToggleTaskStatus = () => {},
  onSaveNote = () => {},
  onSendReminder = () => {},
}) => {
  // local copy of tasks for optimistic UI (does not replace server-of-truth)
  const [localTasks, setLocalTasks] = useState(tasks || []);
  const [editingNotes, setEditingNotes] = useState({}); // { taskId: "text" }
  const [savingTask, setSavingTask] = useState(null); // taskId being saved

  useEffect(() => {
    setLocalTasks(tasks || []);
    // reset editing notes for tasks not present
    setEditingNotes((prev) => {
      const next = {};
      (tasks || []).forEach((t) => {
        next[t.id] = prev[t.id] ?? "";
      });
      return next;
    });
  }, [tasks]);

  const humanStatus = (s) => {
    if (!s) return "PENDING";
    return s.toString().toUpperCase();
  };

  const toggleTaskStatus = async (taskId) => {
    const task = localTasks.find((t) => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";

    // optimistic update
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    setSavingTask(taskId);
    try {
      const maybePromise = onToggleTaskStatus(employeeId, taskId, newStatus);
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }
    } catch (err) {
      // rollback on error
      setLocalTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)));
      console.error("toggleTaskStatus failed:", err);
    } finally {
      setSavingTask(null);
    }
  };

  const saveNote = async (taskId) => {
    const noteText = (editingNotes[taskId] || "").trim();
    if (!noteText) return;
    setSavingTask(taskId);
    // optimistic: append note locally
    const notePayload = {
      by: "admin",
      text: noteText,
      date: new Date().toISOString(),
    };
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, notes: [...(t.notes || []), notePayload] } : t
      )
    );

    try {
      const maybePromise = onSaveNote(employeeId, taskId, noteText);
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }
      // clear editor
      setEditingNotes((prev) => ({ ...prev, [taskId]: "" }));
    } catch (err) {
      console.error("saveNote failed:", err);
      // note: we do not rollback notes for simplicity; caller can re-fetch if needed
    } finally {
      setSavingTask(null);
    }
  };

  const sendReminder = async (taskId = null) => {
    try {
      const maybePromise = onSendReminder(employeeId, taskId);
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      } else {
        // no-op
      }
    } catch (err) {
      console.error("sendReminder failed:", err);
    }
  };

  return (
    <div className={`${compact ? "space-y-2" : "space-y-4"}`}>
      {(localTasks || []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          No onboarding tasks assigned.
        </p>
      )}

      {(localTasks || []).map((task, idx) => {
        const status = humanStatus(task.status);
        const isSaving = savingTask === task.id;

        return (
          <Card key={task.id}>
            <CardContent className={compact ? "p-3" : "p-4"}>
              <div className="flex items-start gap-4">
                {/* step number */}
                <div className="flex-shrink-0">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold bg-muted`}
                  >
                    {idx + 1}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {task.stage ??
                            (stages && stages.length > 0
                              ? stages[0]
                              : "General")}
                        </span>
                        <span className="hidden sm:inline-block">•</span>
                        <span className="text-xs text-muted-foreground">
                          {task.dueDate
                            ? `Due ${new Date(
                                task.dueDate
                              ).toLocaleDateString()}`
                            : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="hidden md:block">
                        <ProgressStatusBadge
                          percent={
                            typeof task.progressPercent === "number"
                              ? task.progressPercent
                              : undefined
                          }
                          status={task.status}
                        />
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {status}
                      </Badge>
                    </div>
                  </div>

                  {/* notes */}
                  <div className="mt-3 text-sm">
                    {task.notes && task.notes.length > 0 ? (
                      <div className="space-y-2">
                        {task.notes.map((n, i) => (
                          <div
                            key={i}
                            className="text-xs text-muted-foreground"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium">{n.by}</span>
                                <span className="ml-2 text-xs">
                                  {new Date(n.date).toLocaleString()}
                                </span>
                              </div>
                            </div>
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

                  {/* add note */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
                    <Input
                      placeholder="Add a quick note..."
                      value={editingNotes[task.id] ?? ""}
                      onChange={(e) =>
                        setEditingNotes((prev) => ({
                          ...prev,
                          [task.id]: e.target.value,
                        }))
                      }
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveNote(task.id)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingNotes((prev) => ({
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
              </div>

              {/* actions row */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleTaskStatus(task.id)}
                    disabled={isSaving}
                    title={
                      task.status === "COMPLETED"
                        ? "Mark In progress"
                        : "Mark Completed"
                    }
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {task.status === "COMPLETED"
                      ? "Mark In progress"
                      : "Mark Completed"}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => sendReminder(task.id)}
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Reminder
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">
                  {isSaving ? "Saving..." : ""}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default OnboardingStepTracker;
