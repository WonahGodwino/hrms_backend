import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, Card, CardContent, Button, Chip, Tabs, Tab,
  Avatar, Checkbox, Grid, Paper,
  Accordion, AccordionSummary, AccordionDetails, LinearProgress,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  CheckCircle as CheckIcon,
  RadioButtonUnchecked as UncheckedIcon,
  ExpandMore as ExpandIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { mockData } from "./mock/mockData";

const statusConfig = {
  initiated: { label: "Initiated", color: "#1180DA", bg: "#EBF5FF" },
  "in-progress": { label: "In Progress", color: "#F59E0B", bg: "#FFFBEB" },
  "pending-clearance": { label: "Pending Clearance", color: "#EF4444", bg: "#FEF2F2" },
  completed: { label: "Completed", color: "#10B981", bg: "#ECFDF5" },
};

const priorityConfig = {
  high: { color: "#EF4444", label: "High" },
  medium: { color: "#F59E0B", label: "Medium" },
  low: { color: "#10B981", label: "Low" },
};

const taskStatusConfig = {
  completed: { color: "#10B981", label: "Done" },
  "in-progress": { color: "#1180DA", label: "In Progress" },
  pending: { color: "#94A3B8", label: "Pending" },
};

const fnfStatusConfig = {
  "not-started": { label: "Not Started", color: "default" },
  pending: { label: "Pending", color: "warning" },
  processing: { label: "Processing", color: "info" },
  completed: { label: "Completed", color: "success" },
};

export default function OffboardingDetails() {
  const [tab, setTab] = useState(0);

  const navigate = useNavigate();
  const { id } = useParams();
  const baseRecord = useMemo(() => {
    return mockData.find((item) => item.id === id) || null;
  }, [id]);

  const [record, setRecord] = useState(baseRecord);

  useEffect(() => {
    setRecord(baseRecord);
  }, [baseRecord]);

  if (!record) {
    return (
      <Box sx={{ px: 3, pb: 2 }}>
        <Typography>Record not found</Typography>
      </Box>
    );
  }

  const sc = statusConfig[record.status] || statusConfig.initiated;
  const tasks = record.tasks || [];
  const timeline = record.timeline || [];
  const fnf = fnfStatusConfig[record.fnfStatus] || fnfStatusConfig["not-started"];
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const totalTasks = tasks.length;

  // const completedTasks = record.tasks.filter((t) => t.status === "completed").length;
  // const totalTasks = record.tasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleTaskToggle = (taskId) => {
    setRecord((prev) => ({
      ...prev,
      tasks: (prev.tasks || []).map((task) =>
        task.id === taskId
          ? {
            ...task,
            status: task.status === "completed" ? "pending" : "completed",
          }
          : task
      ),
    }));
  };


  // Group tasks by category
  const categories = {};
  tasks.forEach((t) => {
    if (!categories[t.category]) categories[t.category] = [];
    categories[t.category].push(t);
  });

  return (
    <Box sx={{ px: 3, pb: 2 }}>
      <Button startIcon={<BackIcon />} onClick={() => navigate("/offboarding")} sx={{ mb: 2, ":hover": { color: "#fff" } }} >
        Back to Offboarding Hub
      </Button>

      {/* Header Card */}
      <Card sx={{ mb: 3, borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: "#1180DA", fontSize: 20, fontWeight: 700 }}>
              {record.avatar || record.employeeName?.[0] || "?"}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5, flexWrap: "wrap" }}>
                <Typography variant="h5" fontWeight={700}>{record.employeeName}</Typography>
                <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600 }} />
              </Box>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {record.position} • {record.department} • {record.id}
              </Typography>
              <Box sx={{ display: "flex", gap: 2, mt: 1, flexWrap: "wrap" }}>
                <Chip icon={<CalendarIcon sx={{ fontSize: 14 }} />} label={`Last Day: ${record.lastWorkingDay}`} size="small" variant="outlined" />
                <Chip icon={<PersonIcon sx={{ fontSize: 14 }} />} label={`HR: ${record.hrOwner}`} size="small" variant="outlined" />
              </Box>
            </Box>
            <Box sx={{ textAlign: "center", minWidth: 100 }}>
              <Typography variant="h3" fontWeight={700}>{progress}%</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>Complete</Typography>
              <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: "#E2E8F0", "& .MuiLinearProgress-bar": { bgcolor: progress === 100 ? "#10B981" : "#1180DA", borderRadius: 3 } }} />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: "1px solid #E2E8F0", px: 2, "& .MuiTab-root": { textTransform: "none", fontWeight: 600 } }}>
          <Tab label={`Checklist & Tasks (${completedTasks}/${totalTasks})`} />
          <Tab label={`Timeline (${timeline.length})`} />
          <Tab label="Separation Details" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* Checklist Tab */}
          {tab === 0 && (
            <Box>
              {Object.entries(categories).length === 0 ? (
                <Typography color="text.secondary">No tasks available</Typography>
              ) : (
                Object.entries(categories).map(([cat, tasks]) => {
                  const catDone = tasks.filter((t) => t.status === "completed").length;
                  return (
                    <Accordion key={cat} defaultExpanded sx={{ mb: 1, borderRadius: "8px !important", "&:before": { display: "none" }, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                      <AccordionSummary expandIcon={<ExpandIcon />}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%" }}>
                          <Typography fontWeight={700}>{cat}</Typography>
                          <Chip label={`${catDone}/${tasks.length}`} size="small" sx={{ bgcolor: catDone === tasks.length ? "#ECFDF5" : "#F1F5F9", color: catDone === tasks.length ? "#10B981" : "#64748B", fontWeight: 600, fontSize: 11 }} />
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0 }}>
                        {tasks.map((task) => {
                          const tc = taskStatusConfig[task.status] || taskStatusConfig.pending;
                          const pc = priorityConfig[task.priority] || priorityConfig.low;
                          return (
                            <Box key={task.id} sx={{ display: "flex", alignItems: "center", gap: 2, py: 1.5, borderBottom: "1px solid #F1F5F9", "&:last-child": { borderBottom: "none" } }}>
                              <Checkbox
                                checked={task.status === "completed"}
                                onChange={() => handleTaskToggle(task.id)}
                                icon={<UncheckedIcon />}
                                checkedIcon={<CheckIcon />}
                                sx={{ color: "#CBD5E1", "&.Mui-checked": { color: "#10B981" } }}
                              />
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" fontWeight={500} sx={{ textDecoration: task.status === "completed" ? "line-through" : "none", color: task.status === "completed" ? "#94A3B8" : "#0F172A" }}>
                                  {task.title}
                                </Typography>
                                <Box sx={{ display: "flex", gap: 1.5, mt: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <PersonIcon sx={{ fontSize: 12 }} /> {task.assignee}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <CalendarIcon sx={{ fontSize: 12 }} /> {task.dueDate}
                                  </Typography>
                                </Box>
                              </Box>
                              <Chip label={pc.label} size="small" sx={{ bgcolor: `${pc.color}15`, color: pc.color, fontWeight: 600, fontSize: 10, height: 22 }} />
                              <Chip label={tc.label} size="small" sx={{ bgcolor: `${tc.color}15`, color: tc.color, fontWeight: 600, fontSize: 10, height: 22 }} />
                            </Box>
                          );
                        })}
                      </AccordionDetails>
                    </Accordion>
                  );
                })
              )
              }

            </Box>
          )}

          {/* Timeline Tab */}
          {tab === 1 && (
            <Box>
              {timeline.length === 0 ? (
                <Typography color="text.secondary">No timeline events available</Typography>
              ) :
                (timeline.map((item, i) => {
                  const typeColor = item.type === "system" ? "#1180DA" : item.type === "notification" ? "#7C3AED" : "#10B981";
                  return (
                    <Box key={i} sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", width: "100%", gap: 3, pb: 3, pl: 3 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: typeColor, border: "2px solid #fff", boxShadow: `0 0 0 2px ${typeColor}40` }} />
                      <Card variant="outlined" sx={{ width: "100%", borderRadius: 2 }}>
                        <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                            <Typography variant="body2" fontWeight={600}>{item.event}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.date}</Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">By: {item.by}</Typography>
                        </CardContent>
                      </Card>
                    </Box>
                  );
                }))}
            </Box>
          )}

          {/* Separation Details Tab */}
          {tab === 2 && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, color: "#1180DA" }}>Employee Info</Typography>
                    {[
                      { label: "Name", value: record.employeeName },
                      { label: "Employee ID", value: record.employeeId },
                      { label: "Department", value: record.department },
                      { label: "Position", value: record.position },
                      { label: "Manager", value: record.manager },
                    ].map((item) => (
                      <Box key={item.label} sx={{ display: "flex", justifyContent: "space-between", gap: 3, py: 1, borderBottom: "1px solid #F1F5F9" }}>
                        <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                        <Typography variant="body2" fontWeight={500}>{item.value}</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, color: "#1180DA" }}>Separation Info</Typography>
                    {[
                      { label: "Type", value: record.separationType },
                      { label: "Reason", value: record.reason },
                      { label: "Last Working Day", value: record.lastWorkingDay },
                      { label: "Notice Period", value: record.noticePeriod },
                      { label: "Initiated Date", value: record.initiatedDate },
                      { label: "Initiated By", value: record.initiatedBy },
                      { label: "HR Owner", value: record.hrOwner },
                    ].map((item) => (
                      <Box key={item.label} sx={{ display: "flex", justifyContent: "space-between", gap: 3, py: 1, borderBottom: "1px solid #F1F5F9" }}>
                        <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                        <Typography variant="body2" fontWeight={500} textAlign="right">{item.value || "—"}</Typography>
                      </Box>
                    ))}
                    <Box sx={{ display: "flex", justifyContent: "space-between", py: 1, borderBottom: "1px solid #F1F5F9" }}>
                      <Typography variant="body2" color="text.secondary">Exit Interview</Typography>
                      <Chip label={record.exitInterviewDone ? "Completed" : "Pending"} size="small" color={record.exitInterviewDone ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 600, fontSize: 11 }} />
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", py: 1 }}>
                      <Typography variant="body2" color="text.secondary">F&F Status</Typography>
                      <Chip label={fnf.label} size="small" color={fnf.color} variant="outlined" sx={{ fontWeight: 600, fontSize: 11 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
