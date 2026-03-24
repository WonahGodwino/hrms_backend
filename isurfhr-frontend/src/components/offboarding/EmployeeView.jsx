import React, { useState, useEffect } from "react";
import {
    Box, Typography, Card, CardContent, Avatar,
    Chip, IconButton, Tooltip, Badge, Button, Tabs, Tab, Paper,
    LinearProgress, Checkbox, Stepper, Step, StepLabel,
    Accordion, AccordionSummary, AccordionDetails, Grid, Alert,
    Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem,
    ListItemIcon, ListItemText, CircularProgress,
} from "@mui/material";
import {
    NotificationsOutlined as BellIcon,
    CheckCircle as CheckIcon, RadioButtonUnchecked as UncheckedIcon,
    AccessTime as ClockIcon, CalendarToday as CalendarIcon,
    Assignment as TaskIcon, Description as DocIcon,
    Help as HelpIcon, ExpandMore as ExpandIcon,
    Upload as UploadIcon, Download as DownloadIcon,
    Info as InfoIcon,
    Person as PersonIcon, Email as EmailIcon,
    Business as DeptIcon, Work as WorkIcon,
    EventNote as DateIcon,
} from "@mui/icons-material";
import { employeeSelfApi } from "@/services/api";

export default function EmployeeView() {
    const [activeTab, setActiveTab] = useState(0);
    const [employee, setEmployee] = useState(null);
    const [offboarding, setOffboarding] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [faqs, setFaqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            setError(null);
            try {
                const [profileData, offboardingData, tasksData, docsData, faqsData] = await Promise.all([
                    employeeSelfApi.getMyProfile(),
                    employeeSelfApi.getMyOffboarding(),
                    employeeSelfApi.getMyTasks(),
                    employeeSelfApi.getMyDocuments(),
                    employeeSelfApi.getFaqs(),
                ]);
                setEmployee(profileData);
                setOffboarding(offboardingData);
                setTasks(Array.isArray(tasksData) ? tasksData : []);
                setDocuments(Array.isArray(docsData) ? docsData : []);
                setFaqs(Array.isArray(faqsData) ? faqsData : []);
            } catch (err) {
                setError(err.message || "Failed to load your offboarding data");
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    if (loading) {
        return (
            <Box sx={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", bgcolor: "#F8FAFC" }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }} color="text.secondary">Loading your offboarding details…</Typography>
            </Box>
        );
    }

    if (error || !employee || !offboarding) {
        return (
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
                <Box sx={{ px: 4, py: 2 }}>
                    <Typography variant="h1" fontWeight={700}>My Offboarding</Typography>
                </Box>
                <Box sx={{ flex: 1, p: 4, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <Alert severity={error ? "error" : "info"} sx={{ maxWidth: 500 }}>
                        <Typography variant="body2" fontWeight={600}>{error ? "Failed to load data" : "No active offboarding"}</Typography>
                        <Typography variant="caption">{error || "You don't have an active offboarding case. Contact HR if you believe this is an error."}</Typography>
                    </Alert>
                </Box>
            </Box>
        );
    }

    // Calculate progress
    const offboardingTasks = offboarding.tasks || [];
    const completedTasks = offboardingTasks.filter((t) => t.status === "completed").length;
    const totalTasks = offboardingTasks.length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Days remaining
    const lastDay = new Date(offboarding.lastWorkingDay);
    const today = new Date();
    const daysRemaining = Math.max(0, Math.ceil((lastDay - today) / (1000 * 60 * 60 * 24)));
    const pendingCount = tasks.filter((a) => a.status === "pending").length;

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "#F8FAFC" }}>
            {/* Header */}
            <Box sx={{ px: 4, py: 2, bgcolor: "#fff", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h5" fontWeight={700} color="#0F172A">My Offboarding</Typography>
                    <Typography variant="body2" color="text.secondary">Track your offboarding progress and complete pending tasks</Typography>
                </Box>
                <Tooltip title="Notifications">
                    <IconButton><Badge badgeContent={pendingCount} color="error"><BellIcon /></Badge></IconButton>
                </Tooltip>
                <Avatar sx={{ width: 36, height: 36, bgcolor: "#2E7D32", fontSize: 13 }}>
                    {(employee.name || "").split(" ").map((n) => n[0]).join("")}
                </Avatar>
            </Box>

            <Box sx={{ flex: 1, p: 4, overflowY: "auto" }}>
                {/* Profile Banner */}
                <Card sx={{ mb: 3, background: "linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)", color: "#fff", borderRadius: 3 }}>
                    <CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
                            <Avatar sx={{ width: 64, height: 64, bgcolor: "rgba(255,255,255,0.2)", fontSize: 24, fontWeight: 700 }}>
                                {(employee.name || "").split(" ").map((n) => n[0]).join("")}
                            </Avatar>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="h5" fontWeight={700}>{employee.name}</Typography>
                                <Typography variant="body2" sx={{ opacity: 0.9 }}>{employee.position} • {employee.department}</Typography>
                                <Box sx={{ display: "flex", gap: 2, mt: 1, flexWrap: "wrap" }}>
                                    <Chip icon={<CalendarIcon sx={{ color: "#fff !important", fontSize: 16 }} />} label={`Last Day: ${offboarding.lastWorkingDay}`} size="small" sx={{ bgcolor: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 500 }} />
                                    <Chip icon={<ClockIcon sx={{ color: "#fff !important", fontSize: 16 }} />} label={`${daysRemaining} days remaining`} size="small" sx={{ bgcolor: daysRemaining <= 7 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 500 }} />
                                </Box>
                            </Box>
                            <Box sx={{ textAlign: "center" }}>
                                <Box sx={{ position: "relative", display: "inline-flex" }}>
                                    <Box sx={{ width: 80, height: 80, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                                        <svg width="80" height="80" style={{ position: "absolute", top: -4, left: -4, transform: "rotate(-90deg)" }}>
                                            <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="4" />
                                            <circle cx="40" cy="40" r="36" fill="none" stroke="#fff" strokeWidth="4"
                                                strokeDasharray={`${2 * Math.PI * 36}`}
                                                strokeDashoffset={`${2 * Math.PI * 36 * (1 - progress / 100)}`}
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <Typography variant="h6" fontWeight={700}>{progress}%</Typography>
                                    </Box>
                                </Box>
                                <Typography variant="caption" sx={{ opacity: 0.85, display: "block", mt: 0.5 }}>Overall Progress</Typography>
                            </Box>
                        </Box>
                    </CardContent>
                </Card>

                {/* Quick Info Cards */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {[
                        { label: "Pending Tasks", value: pendingCount, color: "#F59E0B", bg: "#FFFBEB", icon: <TaskIcon /> },
                        { label: "In Progress", value: tasks.filter((a) => a.status === "in-progress").length, color: "#1180DA", bg: "#EBF5FF", icon: <ClockIcon /> },
                        { label: "Completed Tasks", value: completedTasks, color: "#10B981", bg: "#ECFDF5", icon: <CheckIcon /> },
                        { label: "Documents", value: `${documents.filter((d) => d.status !== "pending").length}/${documents.length}`, color: "#7C3AED", bg: "#F5F3FF", icon: <DocIcon /> },
                    ].map((s) => (
                        <Grid item xs={6} md={3} key={s.label}>
                            <Card sx={{ borderTop: `3px solid ${s.color}` }}>
                                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
                                    <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {React.cloneElement(s.icon, { sx: { color: s.color, fontSize: 20 } })}
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                                        <Typography variant="h6" fontWeight={700}>{s.value}</Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>

                {/* Tabs */}
                <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
                    <Tabs
                        value={activeTab} onChange={(_, v) => setActiveTab(v)}
                        sx={{ borderBottom: "1px solid #E2E8F0", px: 2, "& .MuiTab-root": { textTransform: "none", fontWeight: 600 } }}
                    >
                        <Tab icon={<TaskIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="My Tasks" />
                        <Tab icon={<DocIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Documents" />
                        <Tab icon={<HelpIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="FAQs" />
                        <Tab icon={<PersonIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="My Details" />
                    </Tabs>

                    <Box sx={{ p: 3 }}>
                        {activeTab === 0 && <MyTasksTab tasks={tasks} setTasks={setTasks} offboarding={offboarding} />}
                        {activeTab === 1 && <DocumentsTab documents={documents} setDocuments={setDocuments} />}
                        {activeTab === 2 && <FAQsTab faqs={faqs} />}
                        {activeTab === 3 && <MyDetailsTab employee={employee} offboarding={offboarding} />}
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}

/* ─── My Tasks Tab ─── */
function MyTasksTab({ tasks, setTasks, offboarding }) {
    const toggleTask = async (id) => {
        const task = tasks.find((t) => t.id === id);
        if (!task) return;
        const nextStatus = task.status === "pending" ? "in-progress" : task.status === "in-progress" ? "completed" : "pending";

        try {
            await employeeSelfApi.updateTaskStatus(id, nextStatus);
        } catch {
            // Optimistic update even if API fails
        }

        setTasks((prev) =>
            prev.map((t) => t.id === id ? { ...t, status: nextStatus } : t)
        );
    };

    const statusColor = { pending: "#F59E0B", "in-progress": "#1180DA", completed: "#10B981" };
    const statusLabel = { pending: "Pending", "in-progress": "In Progress", completed: "Completed" };

    return (
        <Box>
            <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                Please complete all pending tasks before your last working day ({offboarding.lastWorkingDay}). Contact HR if you need assistance.
            </Alert>

            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Your Action Items</Typography>

            {tasks.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography color="text.secondary">No pending tasks</Typography>
                </Box>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                    {tasks.map((task) => (
                        <Card
                            key={task.id}
                            variant="outlined"
                            sx={{
                                borderRadius: 2,
                                borderLeft: `4px solid ${statusColor[task.status] || "#94A3B8"}`,
                                transition: "all 0.2s",
                                ...(task.status === "completed" && { opacity: 0.7, bgcolor: "#F8FAFC" }),
                            }}
                        >
                            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2, "&:last-child": { pb: 2 } }}>
                                <Checkbox
                                    checked={task.status === "completed"}
                                    onChange={() => toggleTask(task.id)}
                                    icon={<UncheckedIcon />}
                                    checkedIcon={<CheckIcon />}
                                    sx={{ color: statusColor[task.status], "&.Mui-checked": { color: "#10B981" } }}
                                />
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="body1" fontWeight={600} sx={{ textDecoration: task.status === "completed" ? "line-through" : "none" }}>
                                        {task.title}
                                    </Typography>
                                    <Box sx={{ display: "flex", gap: 1.5, mt: 0.5, alignItems: "center" }}>
                                        <Chip label={task.category} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                        <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                            <CalendarIcon sx={{ fontSize: 14 }} /> Due: {task.dueDate}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Chip
                                    label={statusLabel[task.status] || task.status} size="small"
                                    sx={{ bgcolor: `${statusColor[task.status] || "#94A3B8"}15`, color: statusColor[task.status] || "#94A3B8", fontWeight: 600, fontSize: 11 }}
                                />
                            </CardContent>
                        </Card>
                    ))}
                </Box>
            )}

            {/* Overall Offboarding Steps */}
            <Typography variant="h6" fontWeight={700} sx={{ mt: 4, mb: 2 }}>Offboarding Progress</Typography>
            <Card variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                <Stepper alternativeLabel>
                    {[
                        { label: "Resignation Submitted", done: true },
                        { label: "Manager Notified", done: true },
                        { label: "Knowledge Transfer", done: false },
                        { label: "Asset Return", done: false },
                        { label: "Exit Interview", done: false },
                        { label: "Clearance", done: false },
                    ].map((s) => (
                        <Step key={s.label} completed={s.done}>
                            <StepLabel
                                slotProps={{
                                    stepIcon: {
                                        sx: { color: s.done ? "#10B981 !important" : undefined, "&.Mui-completed": { color: "#10B981" } },
                                    },
                                }}
                            >
                                <Typography variant="caption" fontWeight={s.done ? 600 : 400}>{s.label}</Typography>
                            </StepLabel>
                        </Step>
                    ))}
                </Stepper>
            </Card>
        </Box>
    );
}

/* ─── Documents Tab ─── */
function DocumentsTab({ documents, setDocuments }) {
    const [uploadDialog, setUploadDialog] = useState(false);

    const statusConfig = {
        submitted: { color: "#1180DA", bg: "#EBF5FF", label: "Submitted" },
        signed: { color: "#10B981", bg: "#ECFDF5", label: "Signed" },
        pending: { color: "#F59E0B", bg: "#FFFBEB", label: "Pending" },
    };

    const pendingDocs = documents.filter((d) => d.status === "pending").length;

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h6" fontWeight={700}>Documents</Typography>
                <Button variant="contained" startIcon={<UploadIcon />} size="small" onClick={() => setUploadDialog(true)} sx={{ bgcolor: "#2E7D32" }}>
                    Upload Document
                </Button>
            </Box>

            {pendingDocs > 0 && (
                <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
                    {pendingDocs} document(s) require your attention. Please submit before your last working day.
                </Alert>
            )}

            {documents.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography color="text.secondary">No documents found</Typography>
                </Box>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                    {documents.map((doc) => {
                        const sc = statusConfig[doc.status] || statusConfig.pending;
                        return (
                            <Card key={doc.id} variant="outlined" sx={{ borderRadius: 2 }}>
                                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2, "&:last-child": { pb: 2 } }}>
                                    <Box sx={{ width: 44, height: 44, borderRadius: 1.5, bgcolor: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <DocIcon sx={{ color: "#64748B" }} />
                                    </Box>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="body1" fontWeight={600}>{doc.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {doc.uploadDate ? `Uploaded: ${doc.uploadDate}` : "Not yet submitted"}
                                        </Typography>
                                    </Box>
                                    <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, fontSize: 11 }} />
                                    <Box sx={{ display: "flex", gap: 0.5 }}>
                                        {doc.status === "pending" ? (
                                            <Button size="small" variant="outlined" startIcon={<UploadIcon />} onClick={() => setUploadDialog(true)}>Upload</Button>
                                        ) : (
                                            <Tooltip title="Download">
                                                <IconButton size="small"><DownloadIcon fontSize="small" /></IconButton>
                                            </Tooltip>
                                        )}
                                    </Box>
                                </CardContent>
                            </Card>
                        );
                    })}
                </Box>
            )}

            <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Upload Document</DialogTitle>
                <DialogContent>
                    <Box sx={{ border: "2px dashed #CBD5E1", borderRadius: 2, p: 4, textAlign: "center", mt: 1, cursor: "pointer", "&:hover": { borderColor: "#2E7D32", bgcolor: "#F0FFF4" } }}>
                        <UploadIcon sx={{ fontSize: 48, color: "#94A3B8", mb: 1 }} />
                        <Typography color="text.secondary">Drag and drop files here or click to browse</Typography>
                        <Typography variant="caption" color="text.secondary">Supported formats: PDF, DOC, DOCX (Max 10MB)</Typography>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setUploadDialog(false)}>Cancel</Button>
                    <Button variant="contained" onClick={() => setUploadDialog(false)} sx={{ bgcolor: "#2E7D32" }}>Upload</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

/* ─── FAQs Tab ─── */
function FAQsTab({ faqs }) {
    return (
        <Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Frequently Asked Questions</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Find answers to common questions about the offboarding process.</Typography>

            {faqs.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography color="text.secondary">No FAQs available</Typography>
                </Box>
            ) : (
                faqs.map((faq, i) => (
                    <Accordion key={i} sx={{ mb: 1, borderRadius: "8px !important", "&:before": { display: "none" }, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <AccordionSummary expandIcon={<ExpandIcon />} sx={{ fontWeight: 600 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <HelpIcon sx={{ color: "#2E7D32", fontSize: 20 }} />
                                <Typography fontWeight={600}>{faq.q}</Typography>
                            </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ borderTop: "1px solid #E2E8F0" }}>
                            <Typography variant="body2" color="text.secondary" sx={{ pl: 4.5 }}>{faq.a}</Typography>
                        </AccordionDetails>
                    </Accordion>
                ))
            )}

            <Card sx={{ mt: 3, bgcolor: "#F0FFF4", border: "1px solid #A7F3D0", borderRadius: 2 }}>
                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <InfoIcon sx={{ color: "#2E7D32" }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} color="#065F46">Still have questions?</Typography>
                        <Typography variant="caption" color="#047857">Contact your HR representative for further assistance.</Typography>
                    </Box>
                    <Button size="small" variant="outlined" sx={{ borderColor: "#2E7D32", color: "#2E7D32" }}>Contact HR</Button>
                </CardContent>
            </Card>
        </Box>
    );
}

/* ─── My Details Tab ─── */
function MyDetailsTab({ employee, offboarding }) {
    return (
        <Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>Separation Details</Typography>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, color: "#2E7D32" }}>Personal Information</Typography>
                            <List dense>
                                {[
                                    { icon: <PersonIcon />, label: "Name", value: employee.name },
                                    { icon: <EmailIcon />, label: "Email", value: employee.email },
                                    { icon: <DeptIcon />, label: "Department", value: employee.department },
                                    { icon: <WorkIcon />, label: "Position", value: employee.position },
                                    { icon: <DateIcon />, label: "Join Date", value: employee.joinDate },
                                    { icon: <PersonIcon />, label: "Manager", value: employee.manager },
                                ].map((item) => (
                                    <ListItem key={item.label} sx={{ px: 0 }}>
                                        <ListItemIcon sx={{ minWidth: 36 }}>
                                            {React.cloneElement(item.icon, { sx: { fontSize: 18, color: "#64748B" } })}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={<Typography variant="caption" color="text.secondary">{item.label}</Typography>}
                                            secondary={<Typography variant="body2" fontWeight={500}>{item.value || "—"}</Typography>}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, color: "#2E7D32" }}>Offboarding Information</Typography>
                            <List dense>
                                {[
                                    { label: "Case ID", value: offboarding.id },
                                    { label: "Separation Type", value: offboarding.separationType },
                                    { label: "Reason", value: offboarding.reason },
                                    { label: "Last Working Day", value: offboarding.lastWorkingDay },
                                    { label: "Notice Period", value: offboarding.noticePeriod },
                                    { label: "HR Owner", value: offboarding.hrOwner },
                                    { label: "Status", value: offboarding.status, chip: true },
                                    { label: "Exit Interview", value: offboarding.exitInterviewDone ? "Completed" : "Pending", chip: true, chipColor: offboarding.exitInterviewDone ? "success" : "warning" },
                                    { label: "FnF Status", value: offboarding.fnfStatus, chip: true, chipColor: offboarding.fnfStatus === "completed" ? "success" : "warning" },
                                ].map((item) => (
                                    <ListItem key={item.label} sx={{ px: 0 }}>
                                        <ListItemText
                                            primary={<Typography variant="caption" color="text.secondary">{item.label}</Typography>}
                                            secondary={
                                                item.chip ? (
                                                    <Chip label={item.value || "—"} size="small" color={item.chipColor || "primary"} sx={{ fontWeight: 600, fontSize: 11, mt: 0.5 }} />
                                                ) : (
                                                    <Typography variant="body2" fontWeight={500}>{item.value || "—"}</Typography>
                                                )
                                            }
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
