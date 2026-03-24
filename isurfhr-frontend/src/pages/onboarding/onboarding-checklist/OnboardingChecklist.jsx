import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Grid,
  useTheme,
  alpha,
  Collapse,
  Menu,
  MenuItem,
  TextField,
  Divider,
  ListItemText,
  Popover,
  ListItemIcon,
  useMediaQuery,
  Snackbar,
  Alert,
} from "@mui/material";

// Icons
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import SearchIcon from "@mui/icons-material/Search";

// New Modal & Component Imports
import DeleteTaskModal from "./DeleteTaskModal";
import AddTaskInline from "./AddTaskInline";
import EditTaskInline from "./EditTaskInline";
import ApplyTemplateModal from "./ApplyTemplateModal";

// Extracted Components
import ChecklistHeader from "./ChecklistHeader";
import ActivityLog from "./ActivityLog";
import FloatingActionBar from "./FloatingActionBar";

// --- Mock Data ---
// Added a strict ISO `dueDate` property to easily compute dates logically
const MOCK_TASKS = [
  {
    category: "Pre-boarding & Legal",
    tasks: [
      {
        id: 1,
        title: "Sign Employment Contract",
        description: "Electronic signature via DocuSign portal.",
        assignee: "HR Admin",
        assigneeType: "internal",
        status: "completed",
        statusText: "Completed Apr 02",
        dueDate: "2026-04-02",
        completed: true,
      },
      {
        id: 2,
        title: "Upload Identification Documents",
        description: "Passport scan and tax identification number.",
        assignee: "Candidate",
        assigneeType: "candidate",
        status: "overdue",
        statusText: "Due Mar 05",
        dueDate: "2026-03-05",
        completed: false,
      },
    ],
  },
  {
    category: "IT Provisioning",
    tasks: [
      {
        id: 3,
        title: "Set up Slack & Email",
        description: "Work email creation and Slack channel invites.",
        assignee: "IT Dept",
        assigneeType: "internal",
        status: "completed",
        statusText: "Completed Apr 03",
        dueDate: "2026-04-03",
        completed: true,
      },
      {
        id: 4,
        title: "Hardware Shipment",
        description: "Ship Macbook Pro and peripheral kit to home address.",
        assignee: "IT Dept",
        assigneeType: "internal",
        status: "pending",
        statusText: "Due Apr 14",
        dueDate: "2026-04-14",
        completed: false,
      },
    ],
  },
  {
    category: "Orientation",
    tasks: [
      {
        id: 5,
        title: "Introduction to Team",
        description: "Scheduled 30min intro call on first day.",
        assignee: "Manager",
        assigneeType: "internal",
        status: "pending",
        statusText: "Due Apr 15",
        dueDate: "2026-04-15",
        completed: false,
      },
    ],
  },
];

const MOCK_ASSIGNEES = [
  { name: "HR Admin", type: "internal" },
  { name: "Candidate", type: "candidate" },
  { name: "IT Dept", type: "internal" },
  { name: "Manager", type: "internal" },
  { name: "Finance Dept", type: "internal" },
  { name: "Legal Team", type: "internal" },
  { name: "Facilities", type: "internal" },
];

/**
 * OnboardingChecklist Component
 * Detailed view for an individual hire's onboarding progress, task assignment, and activity timeline.
 */
const OnboardingChecklist = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // --- Core States ---
  const [tasks, setTasks] = useState(MOCK_TASKS);
  const [appliedTemplateName, setAppliedTemplateName] = useState(
    "Engineering Baseline",
  );
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const [expandedSections, setExpandedSections] = useState(
    MOCK_TASKS.reduce((acc, _, idx) => ({ ...acc, [idx]: true }), {}),
  );

  const [showMetaMobile, setShowMetaMobile] = useState(false);

  // --- Communication States ---
  const [isSendingWelcome, setIsSendingWelcome] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // --- Assignee Dropdown State ---
  const [assigneeAnchorEl, setAssigneeAnchorEl] = useState(null);
  const [activeTaskForAssignee, setActiveTaskForAssignee] = useState({
    categoryIdx: null,
    taskId: null,
  });
  const [assigneeSearch, setAssigneeSearch] = useState("");

  // --- Task Context Menu State ---
  const [taskMenuAnchorEl, setTaskMenuAnchorEl] = useState(null);
  const [activeTaskForMenu, setActiveTaskForMenu] = useState({
    categoryIdx: null,
    taskId: null,
  });

  // --- Edit & Delete Task States ---
  const [editingTask, setEditingTask] = useState({
    categoryIdx: null,
    taskId: null,
  });
  const [deleteTaskModalOpen, setDeleteTaskModalOpen] = useState(false);
  const [selectedTaskData, setSelectedTaskData] = useState(null);

  // --- Inline Note Editor State ---
  const [editingNoteFor, setEditingNoteFor] = useState({
    categoryIdx: null,
    taskId: null,
  });
  const [tempNoteText, setTempNoteText] = useState("");

  // --- Date Picker Popover State ---
  const [dateAnchorEl, setDateAnchorEl] = useState(null);
  const [activeTaskForDate, setActiveTaskForDate] = useState({
    categoryIdx: null,
    taskId: null,
  });
  const [tempDate, setTempDate] = useState("");

  // --- Inline Add Custom Task State ---
  const [addingTaskSectionIdx, setAddingTaskSectionIdx] = useState(null);

  // --- Dynamic Progress Calculation ---
  const progressData = useMemo(() => {
    let total = 0;
    let completed = 0;
    tasks.forEach((section) => {
      section.tasks.forEach((task) => {
        total += 1;
        if (task.completed) completed += 1;
      });
    });
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percentage };
  }, [tasks]);

  const handleToggleSection = (sectionIdx) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionIdx]: !prev[sectionIdx],
    }));
  };

  const handleToggleTask = (categoryIndex, taskId) => {
    setTasks((prevTasks) =>
      prevTasks.map((section, sIdx) => {
        if (sIdx === categoryIndex) {
          return {
            ...section,
            tasks: section.tasks.map((task) => {
              if (task.id === taskId) {
                const isNowCompleted = !task.completed;
                if (isNowCompleted) {
                  const dateString = new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                  });
                  return {
                    ...task,
                    completed: true,
                    status: "completed",
                    statusText: `Completed ${dateString}`,
                  };
                } else {
                  // Unchecking a task reinstates standard pending/overdue evaluation based on its dueDate
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const dueDateObj = task.dueDate
                    ? new Date(task.dueDate)
                    : new Date();
                  dueDateObj.setHours(0, 0, 0, 0);

                  const isOverdue = dueDateObj < today;
                  const dateString = dueDateObj.toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                  });

                  return {
                    ...task,
                    completed: false,
                    status: isOverdue ? "overdue" : "pending",
                    statusText: `Due ${dateString}`,
                  };
                }
              }
              return task;
            }),
          };
        }
        return section;
      }),
    );
  };

  // --- Assignee Menu Handlers ---
  const handleOpenAssigneeMenu = (event, categoryIdx, taskId) => {
    setAssigneeAnchorEl(event.currentTarget);
    setActiveTaskForAssignee({ categoryIdx, taskId });
    setAssigneeSearch("");
  };

  const handleCloseAssigneeMenu = () => {
    setAssigneeAnchorEl(null);
  };

  const handleAssigneeSelect = (newAssignee) => {
    setTasks((prevTasks) =>
      prevTasks.map((section, sIdx) => {
        if (sIdx === activeTaskForAssignee.categoryIdx) {
          return {
            ...section,
            tasks: section.tasks.map((task) =>
              task.id === activeTaskForAssignee.taskId
                ? {
                    ...task,
                    assignee: newAssignee.name,
                    assigneeType: newAssignee.type,
                  }
                : task,
            ),
          };
        }
        return section;
      }),
    );
    handleCloseAssigneeMenu();
  };

  const filteredAssignees = useMemo(() => {
    return MOCK_ASSIGNEES.filter((a) =>
      a.name.toLowerCase().includes(assigneeSearch.toLowerCase()),
    );
  }, [assigneeSearch]);

  // --- Task Context Menu Handlers (Edit, Delete, Note) ---
  const handleOpenTaskMenu = (event, categoryIdx, taskId) => {
    setTaskMenuAnchorEl(event.currentTarget);
    setActiveTaskForMenu({ categoryIdx, taskId });
  };

  const handleCloseTaskMenu = () => {
    setTaskMenuAnchorEl(null);
  };

  const handleInitiateEditTask = () => {
    setEditingTask({
      categoryIdx: activeTaskForMenu.categoryIdx,
      taskId: activeTaskForMenu.taskId,
    });
    handleCloseTaskMenu();
  };

  const handleOpenDeleteModal = () => {
    const task = tasks[activeTaskForMenu.categoryIdx].tasks.find(
      (t) => t.id === activeTaskForMenu.taskId,
    );
    setSelectedTaskData(task);
    setDeleteTaskModalOpen(true);
    handleCloseTaskMenu();
  };

  // --- Note Handlers ---
  const handleOpenAddNote = () => {
    const task = tasks[activeTaskForMenu.categoryIdx].tasks.find(
      (t) => t.id === activeTaskForMenu.taskId,
    );
    setTempNoteText(task.note || "");
    setEditingNoteFor({
      categoryIdx: activeTaskForMenu.categoryIdx,
      taskId: activeTaskForMenu.taskId,
    });
    handleCloseTaskMenu();
  };

  const handleSaveNote = () => {
    setTasks((prevTasks) =>
      prevTasks.map((section, sIdx) => {
        if (sIdx === editingNoteFor.categoryIdx) {
          return {
            ...section,
            tasks: section.tasks.map((task) =>
              task.id === editingNoteFor.taskId
                ? { ...task, note: tempNoteText }
                : task,
            ),
          };
        }
        return section;
      }),
    );
    setEditingNoteFor({ categoryIdx: null, taskId: null });
  };

  const handleCancelNote = () => {
    setEditingNoteFor({ categoryIdx: null, taskId: null });
  };

  // --- Inline Edit Handlers ---
  const handleSaveEditTask = (updatedData) => {
    setTasks((prevTasks) =>
      prevTasks.map((section, sIdx) => {
        if (sIdx === editingTask.categoryIdx) {
          return {
            ...section,
            tasks: section.tasks.map((task) => {
              if (task.id === editingTask.taskId) {
                // Check if the due date is in the past for dynamic status resolution
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const selectedDate = new Date(updatedData.dueDate);
                selectedDate.setHours(0, 0, 0, 0);

                const isOverdue = selectedDate < today;
                const dateString = selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                });

                return {
                  ...task,
                  title: updatedData.title,
                  description: updatedData.description,
                  assignee: updatedData.assignee,
                  assigneeType: updatedData.assigneeType,
                  dueDate: updatedData.dueDate,
                  status: task.completed
                    ? "completed"
                    : isOverdue
                      ? "overdue"
                      : "pending",
                  statusText: task.completed
                    ? task.statusText
                    : `Due ${dateString}`,
                };
              }
              return task;
            }),
          };
        }
        return section;
      }),
    );
    setEditingTask({ categoryIdx: null, taskId: null });
  };

  const handleConfirmDeleteTask = () => {
    setTasks((prevTasks) =>
      prevTasks.map((section, sIdx) => {
        if (sIdx === activeTaskForMenu.categoryIdx) {
          return {
            ...section,
            tasks: section.tasks.filter(
              (t) => t.id !== activeTaskForMenu.taskId,
            ),
          };
        }
        return section;
      }),
    );
    setDeleteTaskModalOpen(false);
  };

  // --- Add Custom Task Handlers ---
  const handleInitiateAddCustomTask = (sectionIdx) => {
    if (!expandedSections[sectionIdx]) {
      handleToggleSection(sectionIdx);
    }
    setAddingTaskSectionIdx(sectionIdx);
  };

  const handleSaveNewTask = (taskData, sectionIdx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(taskData.dueDate);
    selectedDate.setHours(0, 0, 0, 0);

    const isOverdue = selectedDate < today;
    const dateString = selectedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });

    const newTask = {
      id: Date.now(),
      title: taskData.title,
      description: taskData.description,
      assignee: taskData.assignee,
      assigneeType: taskData.assigneeType,
      status: isOverdue ? "overdue" : "pending",
      statusText: `Due ${dateString}`,
      dueDate: taskData.dueDate,
      completed: false,
    };

    setTasks((prevTasks) =>
      prevTasks.map((section, idx) =>
        idx === sectionIdx
          ? { ...section, tasks: [...section.tasks, newTask] }
          : section,
      ),
    );
    setAddingTaskSectionIdx(null);
  };

  const handleCancelNewTask = () => {
    setAddingTaskSectionIdx(null);
  };

  // --- Apply Template Handler ---
  const handleApplyTemplate = (templateData) => {
    const timestamp = Date.now();
    const newCategories = templateData.tasks.map((cat, cIdx) => ({
      ...cat,
      tasks: cat.tasks.map((t, tIdx) => ({
        ...t,
        id: `${timestamp}-${cIdx}-${tIdx}`,
      })),
    }));

    setTasks((prev) => [...prev, ...newCategories]);

    setAppliedTemplateName((prev) =>
      prev.includes(templateData.name)
        ? prev
        : `${prev} + ${templateData.name}`,
    );

    setExpandedSections((prev) => {
      const newExpanded = { ...prev };
      newCategories.forEach((_, idx) => {
        newExpanded[tasks.length + idx] = true;
      });
      return newExpanded;
    });

    setIsTemplateModalOpen(false);
  };

  // --- Due Date Popover Handlers ---
  const handleOpenDateMenu = (event, categoryIdx, taskId, currentDueDate) => {
    setDateAnchorEl(event.currentTarget);
    setActiveTaskForDate({ categoryIdx, taskId });
    setTempDate(currentDueDate || new Date().toISOString().split("T")[0]);
  };

  const handleCloseDateMenu = () => {
    setDateAnchorEl(null);
  };

  const handleSaveDate = () => {
    if (!tempDate) return;

    setTasks((prevTasks) =>
      prevTasks.map((section, sIdx) => {
        if (sIdx === activeTaskForDate.categoryIdx) {
          return {
            ...section,
            tasks: section.tasks.map((task) => {
              if (task.id === activeTaskForDate.taskId) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const selectedDate = new Date(tempDate);
                selectedDate.setHours(0, 0, 0, 0);

                const isOverdue = selectedDate < today;
                const dateString = selectedDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                });

                return {
                  ...task,
                  dueDate: tempDate,
                  status: isOverdue ? "overdue" : "pending",
                  statusText: `Due ${dateString}`,
                };
              }
              return task;
            }),
          };
        }
        return section;
      }),
    );
    handleCloseDateMenu();
  };

  // --- Communication Trigger Handlers ---
  const handleSendWelcomeEmail = async () => {
    setIsSendingWelcome(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSendingWelcome(false);
    setSnackbar({
      open: true,
      message: "Welcome email & magic link sent successfully!",
      severity: "success",
    });
  };

  const handleSendReminders = async () => {
    setIsSendingReminders(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSendingReminders(false);
    setSnackbar({
      open: true,
      message: "Reminders sent to assignees with pending tasks!",
      severity: "success",
    });
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") return;
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  // --- Helper Styling Functions ---
  const getAssigneeChipStyles = (type) => {
    if (type === "candidate") {
      return {
        bgcolor: isDark ? alpha("#137fec", 0.2) : "#eff6ff",
        color: isDark ? "#93c5fd" : "#1d4ed8",
        border: `1px solid ${isDark ? alpha("#137fec", 0.3) : "#bfdbfe"}`,
      };
    }
    return {
      bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9",
      color: isDark ? "#cbd5e1" : "#475569",
      border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
    };
  };

  const getStatusChipStyles = (status) => {
    if (status === "overdue") {
      return {
        bgcolor: isDark ? alpha("#ef4444", 0.2) : "#fee2e2",
        color: isDark ? "#fca5a5" : "#b91c1c",
        border: `1px solid ${isDark ? alpha("#ef4444", 0.3) : "#fecaca"}`,
      };
    }
    if (status === "pending") {
      return {
        bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
        color: isDark ? "#cbd5e1" : "#475569",
        border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
      };
    }
    return {};
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDark ? "#101922" : "#f8fafc",
        fontFamily: '"Inter", sans-serif',
        pb: { xs: 18, md: 24 },
      }}
    >
      {/* --- Sticky Header --- */}
      <ChecklistHeader
        progressData={progressData}
        appliedTemplateName={appliedTemplateName}
        isMobile={isMobile}
        showMetaMobile={showMetaMobile}
        setShowMetaMobile={setShowMetaMobile}
        onOpenTemplateModal={() => setIsTemplateModalOpen(true)}
      />

      {/* --- Main Content Area --- */}
      <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, md: 4 } }}>
        <Grid container spacing={4}>
          {/* LEFT: Task List Container */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tasks.map((section, sectionIdx) => (
                <Paper
                  key={sectionIdx}
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                    bgcolor: isDark ? "#1e293b" : "#ffffff",
                    overflow: "hidden",
                  }}
                >
                  {/* Section Header */}
                  <Box
                    onClick={() => handleToggleSection(sectionIdx)}
                    sx={{
                      bgcolor: isDark ? "rgba(255,255,255,0.02)" : "#f8fafc",
                      px: 3,
                      py: 2,
                      borderBottom: expandedSections[sectionIdx]
                        ? `1px solid ${isDark ? "#334155" : "#e2e8f0"}`
                        : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease",
                      "&:hover": {
                        bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9",
                      },
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: isDark ? "#fff" : "#1e293b",
                      }}
                    >
                      {section.category}
                    </Typography>
                    <IconButton
                      size="small"
                      sx={{
                        color: isDark ? "#94a3b8" : "#64748b",
                        pointerEvents: "none",
                      }}
                    >
                      {expandedSections[sectionIdx] ? (
                        <ExpandLessIcon />
                      ) : (
                        <ExpandMoreIcon />
                      )}
                    </IconButton>
                  </Box>

                  <Collapse
                    in={expandedSections[sectionIdx]}
                    timeout="auto"
                    unmountOnExit
                  >
                    {/* Task Rows */}
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      {section.tasks.map((task, taskIdx) => {
                        const isLast = taskIdx === section.tasks.length - 1;

                        if (
                          editingTask.categoryIdx === sectionIdx &&
                          editingTask.taskId === task.id
                        ) {
                          return (
                            <EditTaskInline
                              key={task.id}
                              task={task}
                              assignees={MOCK_ASSIGNEES}
                              onSave={handleSaveEditTask}
                              onCancel={() =>
                                setEditingTask({
                                  categoryIdx: null,
                                  taskId: null,
                                })
                              }
                              isLast={isLast}
                            />
                          );
                        }

                        return (
                          <Box
                            key={task.id}
                            sx={{
                              p: 3,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 2,
                              borderBottom: isLast
                                ? "none"
                                : `1px solid ${isDark ? "#334155" : "#f1f5f9"}`,
                              transition: "background-color 0.2s",
                              "&:hover": {
                                bgcolor: isDark
                                  ? "rgba(255,255,255,0.02)"
                                  : "#f8fafc",
                              },
                            }}
                          >
                            <Checkbox
                              checked={task.completed}
                              onChange={() =>
                                handleToggleTask(sectionIdx, task.id)
                              }
                              sx={{
                                p: 0,
                                mt: 0.25,
                                color: isDark ? "#475569" : "#cbd5e1",
                                "&.Mui-checked": { color: "#137fec" },
                              }}
                            />
                            <Box sx={{ flex: 1 }}>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 2,
                                  mb: 0.5,
                                }}
                              >
                                <Typography
                                  variant="subtitle1"
                                  sx={{
                                    fontWeight: 700,
                                    color: task.completed
                                      ? isDark
                                        ? "#64748b"
                                        : "#94a3b8"
                                      : isDark
                                        ? "#f1f5f9"
                                        : "#1e293b",
                                    textDecoration: task.completed
                                      ? "line-through"
                                      : "none",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {task.title}
                                </Typography>

                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    flexShrink: 0,
                                  }}
                                >
                                  {/* Interactive Assignee Chip */}
                                  <Chip
                                    label={task.assignee}
                                    size="small"
                                    onClick={(e) =>
                                      handleOpenAssigneeMenu(
                                        e,
                                        sectionIdx,
                                        task.id,
                                      )
                                    }
                                    sx={{
                                      height: 22,
                                      fontSize: "0.65rem",
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      cursor: "pointer",
                                      transition: "all 0.2s ease",
                                      ...getAssigneeChipStyles(
                                        task.assigneeType,
                                      ),
                                      "&:hover": {
                                        opacity: 0.8,
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                      },
                                    }}
                                  />

                                  {/* Status/Date Chip (Interactive if not completed) */}
                                  {!task.completed && (
                                    <Chip
                                      label={task.statusText}
                                      size="small"
                                      onClick={(e) =>
                                        handleOpenDateMenu(
                                          e,
                                          sectionIdx,
                                          task.id,
                                          task.dueDate,
                                        )
                                      }
                                      sx={{
                                        height: 22,
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                          opacity: 0.8,
                                          boxShadow:
                                            "0 2px 4px rgba(0,0,0,0.1)",
                                        },
                                        ...getStatusChipStyles(task.status),
                                      }}
                                    />
                                  )}

                                  {/* Row Kebab Menu Button */}
                                  <IconButton
                                    size="small"
                                    onClick={(e) =>
                                      handleOpenTaskMenu(e, sectionIdx, task.id)
                                    }
                                    sx={{
                                      color: isDark ? "#64748b" : "#94a3b8",
                                      p: 0.5,
                                    }}
                                  >
                                    <MoreVertIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </Box>

                              <Typography
                                variant="body1"
                                sx={{
                                  color: isDark ? "#94a3b8" : "#64748b",
                                  mb: 1,
                                }}
                              >
                                {task.description}
                              </Typography>

                              {/* Completed Timestamp */}
                              {task.completed && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 600,
                                    color: isDark ? "#475569" : "#94a3b8",
                                    display: "block",
                                  }}
                                >
                                  {task.status === "completed"
                                    ? task.statusText
                                    : `Completed recently`}
                                </Typography>
                              )}

                              {/* Display Saved Note */}
                              {task.note &&
                                !(
                                  editingNoteFor.categoryIdx === sectionIdx &&
                                  editingNoteFor.taskId === task.id
                                ) && (
                                  <Box
                                    sx={{
                                      mt: 1.5,
                                      p: 1.5,
                                      bgcolor: isDark
                                        ? "rgba(255,255,255,0.03)"
                                        : "#f8fafc",
                                      borderRadius: 2,
                                      display: "flex",
                                      gap: 1,
                                      border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                                    }}
                                  >
                                    <NoteAddIcon
                                      sx={{
                                        fontSize: 16,
                                        color: isDark ? "#94a3b8" : "#64748b",
                                        mt: 0.25,
                                      }}
                                    />
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        color: isDark ? "#cbd5e1" : "#475569",
                                        fontStyle: "italic",
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {task.note}
                                    </Typography>
                                  </Box>
                                )}

                              {/* Inline Note Editor */}
                              {editingNoteFor.categoryIdx === sectionIdx &&
                                editingNoteFor.taskId === task.id && (
                                  <Box
                                    sx={{
                                      mt: 2,
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 1.5,
                                    }}
                                  >
                                    <TextField
                                      fullWidth
                                      multiline
                                      minRows={2}
                                      placeholder="Add context or updates (e.g., 'Waiting on vendor response')"
                                      value={tempNoteText}
                                      onChange={(e) =>
                                        setTempNoteText(e.target.value)
                                      }
                                      sx={{
                                        "& .MuiOutlinedInput-root": {
                                          bgcolor: isDark
                                            ? "#0f172a"
                                            : "#ffffff",
                                          fontSize: "0.875rem",
                                          p: 1.5,
                                          "& fieldset": {
                                            borderColor: isDark
                                              ? "#475569"
                                              : "#cbd5e1",
                                          },
                                          "&:hover fieldset": {
                                            borderColor: isDark
                                              ? "#64748b"
                                              : "#94a3b8",
                                          },
                                          "&.Mui-focused fieldset": {
                                            borderColor: "#137fec",
                                            borderWidth: 1,
                                          },
                                        },
                                      }}
                                    />
                                    <Box
                                      sx={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        gap: 1,
                                      }}
                                    >
                                      <Button
                                        size="small"
                                        onClick={handleCancelNote}
                                        sx={{
                                          color: isDark ? "#94a3b8" : "#64748b",
                                          textTransform: "none",
                                          fontWeight: 600,
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={handleSaveNote}
                                        sx={{
                                          bgcolor: "#137fec",
                                          color: "#fff",
                                          textTransform: "none",
                                          fontWeight: 600,
                                          boxShadow: "none",
                                          "&:hover": {
                                            bgcolor: "#1170d0",
                                            boxShadow: "none",
                                          },
                                        }}
                                      >
                                        Save Note
                                      </Button>
                                    </Box>
                                  </Box>
                                )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>

                    {/* Inline New Task Editor (Extracted Component) */}
                    {addingTaskSectionIdx === sectionIdx && (
                      <AddTaskInline
                        sectionIdx={sectionIdx}
                        assignees={MOCK_ASSIGNEES}
                        onSave={handleSaveNewTask}
                        onCancel={handleCancelNewTask}
                      />
                    )}

                    {/* Add Custom Task Button */}
                    {addingTaskSectionIdx !== sectionIdx && (
                      <Button
                        fullWidth
                        startIcon={<AddIcon />}
                        onClick={() => handleInitiateAddCustomTask(sectionIdx)}
                        sx={{
                          py: 2,
                          borderTop: `1px dashed ${isDark ? "#475569" : "#cbd5e1"}`,
                          borderRadius: 0,
                          color: isDark ? "#94a3b8" : "#64748b",
                          textTransform: "none",
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          "&:hover": {
                            bgcolor: isDark
                              ? "rgba(255,255,255,0.02)"
                              : "#f8fafc",
                            color: isDark ? "#cbd5e1" : "#475569",
                          },
                        }}
                      >
                        Add Custom Task
                      </Button>
                    )}
                  </Collapse>
                </Paper>
              ))}
            </Box>
          </Grid>

          {/* RIGHT: Activity Log Section */}
          <Grid size={{ xs: 12, lg: 4 }}>
            <ActivityLog />
          </Grid>
        </Grid>
      </Box>

      {/* --- Assignee Search & Selection Menu --- */}
      <Menu
        anchorEl={assigneeAnchorEl}
        open={Boolean(assigneeAnchorEl)}
        onClose={handleCloseAssigneeMenu}
        MenuListProps={{ autoFocusItem: false }}
        PaperProps={{
          sx: {
            width: 260,
            bgcolor: isDark ? "#1e293b" : "#ffffff",
            border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
            boxShadow: isDark
              ? "0 10px 15px -3px rgba(0, 0, 0, 0.5)"
              : "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
            mt: 0.5,
            borderRadius: 2,
            maxHeight: 320,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, outline: "none" }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="Search assignees..."
            value={assigneeSearch}
            onChange={(e) => setAssigneeSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            InputProps={{
              startAdornment: (
                <SearchIcon
                  fontSize="small"
                  sx={{ color: "text.secondary", mr: 1 }}
                />
              ),
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                bgcolor: isDark ? "#0f172a" : "#f8fafc",
                "& fieldset": { borderColor: isDark ? "#334155" : "#e2e8f0" },
                "&:hover fieldset": {
                  borderColor: isDark ? "#475569" : "#cbd5e1",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#137fec",
                  borderWidth: 1,
                },
              },
            }}
          />
        </Box>
        <Divider
          sx={{ borderColor: isDark ? "#334155" : "#e2e8f0", mb: 0.5 }}
        />

        {filteredAssignees.map((assignee) => (
          <MenuItem
            key={assignee.name}
            onClick={() => handleAssigneeSelect(assignee)}
            sx={{
              py: 1,
              px: 2,
              "&:hover": {
                bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9",
              },
            }}
          >
            <ListItemText
              primary={assignee.name}
              secondary={
                assignee.type === "candidate"
                  ? "External / Candidate"
                  : "Internal Department"
              }
              primaryTypographyProps={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: isDark ? "#e2e8f0" : "#1e293b",
              }}
              secondaryTypographyProps={{
                fontSize: "0.7rem",
                color: isDark ? "#94a3b8" : "#64748b",
              }}
            />
          </MenuItem>
        ))}
        {filteredAssignees.length === 0 && (
          <MenuItem disabled>
            <Typography
              variant="body2"
              sx={{ color: isDark ? "#94a3b8" : "#64748b" }}
            >
              No results found
            </Typography>
          </MenuItem>
        )}
      </Menu>

      {/* --- Task Row Kebab Action Menu --- */}
      <Menu
        anchorEl={taskMenuAnchorEl}
        open={Boolean(taskMenuAnchorEl)}
        onClose={handleCloseTaskMenu}
        PaperProps={{
          sx: {
            bgcolor: isDark ? "#1e293b" : "#ffffff",
            border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
            borderRadius: 2,
            minWidth: 160,
            boxShadow: isDark
              ? "0 10px 15px -3px rgba(0,0,0,0.5)"
              : "0 10px 15px -3px rgba(0,0,0,0.1)",
            mt: 0.5,
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <MenuItem onClick={handleInitiateEditTask}>
          <ListItemIcon>
            <EditIcon
              fontSize="small"
              sx={{ color: isDark ? "#94a3b8" : "#64748b" }}
            />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 500 }}
          >
            Edit Task
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleOpenAddNote}>
          <ListItemIcon>
            <NoteAddIcon
              fontSize="small"
              sx={{ color: isDark ? "#94a3b8" : "#64748b" }}
            />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 500 }}
          >
            {taskMenuAnchorEl &&
            activeTaskForMenu.categoryIdx !== null &&
            tasks[activeTaskForMenu.categoryIdx].tasks.find(
              (t) => t.id === activeTaskForMenu.taskId,
            )?.note
              ? "Edit Note"
              : "Add Note"}
          </ListItemText>
        </MenuItem>
        <Divider sx={{ borderColor: isDark ? "#334155" : "#e2e8f0" }} />
        <MenuItem
          onClick={handleOpenDeleteModal}
          sx={{
            color: "#ef4444",
            "&:hover": { bgcolor: isDark ? "rgba(239,68,68,0.1)" : "#fef2f2" },
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" sx={{ color: "#ef4444" }} />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 500 }}
          >
            Delete
          </ListItemText>
        </MenuItem>
      </Menu>

      {/* --- Task Management Modals --- */}
      <DeleteTaskModal
        open={deleteTaskModalOpen}
        onClose={() => setDeleteTaskModalOpen(false)}
        onConfirm={handleConfirmDeleteTask}
        taskName={selectedTaskData?.title || "this task"}
      />

      <ApplyTemplateModal
        open={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onApply={handleApplyTemplate}
      />

      {/* --- Change Due Date Popover --- */}
      <Popover
        open={Boolean(dateAnchorEl)}
        anchorEl={dateAnchorEl}
        onClose={handleCloseDateMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        PaperProps={{
          sx: {
            p: 2,
            mt: 1,
            bgcolor: isDark ? "#1e293b" : "#ffffff",
            border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
            borderRadius: 2,
            boxShadow: isDark
              ? "0 10px 15px -3px rgba(0,0,0,0.5)"
              : "0 10px 15px -3px rgba(0,0,0,0.1)",
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mb: 1.5,
            fontWeight: 600,
            color: "text.secondary",
            textTransform: "uppercase",
          }}
        >
          Modify Due Date
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            type="date"
            size="small"
            value={tempDate}
            onChange={(e) => setTempDate(e.target.value)}
            sx={{
              "& .MuiOutlinedInput-root": {
                bgcolor: isDark ? "#0f172a" : "#f8fafc",
                "& fieldset": { borderColor: isDark ? "#334155" : "#e2e8f0" },
                "& input": { color: isDark ? "#ffffff" : "#0f172a" },
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSaveDate}
            sx={{
              bgcolor: "#137fec",
              color: "#fff",
              textTransform: "none",
              boxShadow: "none",
              fontWeight: 600,
              "&:hover": { bgcolor: "#1170d0", boxShadow: "none" },
            }}
          >
            Save
          </Button>
        </Box>
      </Popover>

      {/* --- Floating Bottom Action Bar --- */}
      <FloatingActionBar
        isSendingWelcome={isSendingWelcome}
        onSendWelcome={handleSendWelcomeEmail}
        isSendingReminders={isSendingReminders}
        onSendReminders={handleSendReminders}
      />

      {/* Global Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: { xs: 12, md: 14 } }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{
            width: "100%",
            color: "#ffffff",
            fontWeight: 600,
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OnboardingChecklist;
