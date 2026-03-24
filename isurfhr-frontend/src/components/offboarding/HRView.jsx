import React, { useState, useEffect } from "react";
import {
    Box, Typography, TextField, InputAdornment, IconButton, Badge, Avatar,
    Card, CardContent, Button, Snackbar, Alert, Tooltip, CircularProgress,
} from "@mui/material";
import {
    Search as SearchIcon, NotificationsOutlined as BellIcon,
    Add as AddIcon, Circle as CircleIcon,
} from "@mui/icons-material";

import OffboardingCreateWizard from "@/pages/admin/offboarding/OffboardingCreateWizard";
import OffboardingDetails from "@/pages/admin/offboarding/OffboardingDetails";
import OffboardingList from "@/pages/admin/offboarding/OffboardingList";
import StatsCards from "@/pages/admin/offboarding/StatsCards";
import { offboardingApi } from "@/services/api";

export default function HRView() {
    const [records, setRecords] = useState([]);
    const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, completed: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [view, setView] = useState("hub"); // hub | details | wizard
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

    // Fetch offboarding records from API
    const fetchRecords = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await offboardingApi.getAll();
            setRecords(data);
        } catch (err) {
            setError(err.message || "Failed to load offboarding records");
            setRecords([]);
        } finally {
            setLoading(false);
        }
    };

    // Fetch stats from API
    const fetchStats = async () => {
        try {
            const data = await offboardingApi.getStats();
            setStats(data);
        } catch {
            // Stats will be computed from records if API fails
            setStats({ total: 0, active: 0, pending: 0, completed: 0 });
        }
    };

    useEffect(() => {
        fetchRecords();
        fetchStats();
    }, []);

    const handleViewDetails = (record) => {
        setSelectedRecord(record);
        setView("details");
    };

    const handleBack = () => {
        setView("hub");
        setSelectedRecord(null);
        // Re-fetch records when coming back from wizard/details
        fetchRecords();
        fetchStats();
    };

    const handleTaskToggle = async (taskId) => {
        if (!selectedRecord) return;
        const task = selectedRecord.tasks.find((t) => t.id === taskId);
        if (!task) return;

        const newStatus = task.status === "completed" ? "pending" : "completed";

        try {
            await offboardingApi.updateTask(selectedRecord.id, taskId, { status: newStatus });
        } catch {
            // API call — if it fails, we still update UI optimistically
        }

        const updatedTasks = selectedRecord.tasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus } : t
        );
        const updated = { ...selectedRecord, tasks: updatedTasks };
        setSelectedRecord(updated);
        setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    };

    const handleCaseCreated = (newRecord) => {
        setRecords((prev) => [newRecord, ...prev]);
        setView("hub");
        setToast({ open: true, message: `Offboarding case ${newRecord.id} created successfully!`, severity: "success" });
        // Re-fetch from server to get canonical data
        fetchRecords();
        fetchStats();
    };

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            {/* Top Header */}
            <Box sx={{ px: 4, py: 2, display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h1" fontWeight={700}>
                        {view === "wizard" ? "Start Off-Boarding" : view === "details" ? "Case Details" : "Offboarding Hub"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {view === "wizard"
                            ? "Fill in the steps to initiate a new offboarding case"
                            : view === "details"
                                ? `Viewing ${selectedRecord?.id} — ${selectedRecord?.employeeName}`
                                : "Manage employee separations and offboarding workflows"}
                    </Typography>
                </Box>
                <TextField
                    size="small"
                    placeholder="Search…"
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 20, color: "#94A3B8" }} /></InputAdornment> } }}
                    sx={{ width: 220, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                {/* <Tooltip title="Notifications">
                    <IconButton>
                        <Badge badgeContent={3} color="error"><BellIcon /></Badge>
                    </IconButton>
                </Tooltip> */}
            </Box>

            {/* Content */}
            <Box sx={{ flex: 1, p: 4, overflowY: "auto" }}>
                {view === "wizard" && (
                    <OffboardingCreateWizard onBack={handleBack} onCaseCreated={handleCaseCreated} />
                )}

                {view === "details" && selectedRecord && (
                    <OffboardingDetails record={selectedRecord} onBack={handleBack} onTaskToggle={handleTaskToggle} />
                )}

                {view === "hub" && (
                    <>
                        {/* Stats Bar */}
                        <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
                            {[
                                { label: "Total Cases", value: stats.total, color: "#1180DA" },
                                { label: "Active", value: stats.active, color: "#F59E0B" },
                                { label: "Pending Clearance", value: stats.pending, color: "#EF4444" },
                                { label: "Completed", value: stats.completed, color: "#10B981" },
                            ].map((s) => (
                                <Box key={s.label} sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "#fff", px: 2.5, py: 1.5, borderRadius: 2, border: "1px solid #E2E8F0" }}>
                                    <CircleIcon sx={{ fontSize: 10, color: s.color }} />
                                    <Typography variant="body2" color="text.secondary">{s.label}</Typography>
                                    <Typography variant="h6" fontWeight={700} color="#0F172A">{s.value}</Typography>
                                </Box>
                            ))}
                        </Box>

                        <StatsCards records={records} />

                        {/* Start Off-Boarding Button */}
                        <Box sx={{ my: 3 }}>
                            <Card
                                onClick={() => setView("wizard")}
                                sx={{
                                    maxWidth: 360, cursor: "pointer",
                                    background: "linear-gradient(135deg, #1180DA 0%, #0D6BBF 100%)",
                                    color: "#fff", transition: "transform 0.2s", "&:hover": { transform: "translateY(-2px)" },
                                }}
                            >
                                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                                    <AddIcon sx={{ fontSize: 32 }} />
                                    <Box>
                                        <Typography fontWeight={700}>Start Off-Boarding</Typography>
                                        <Typography variant="caption" sx={{ opacity: 0.85 }}>Initiate a new offboarding case</Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Box>

                        {/* Loading / Error / Table */}
                        {loading ? (
                            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 10 }}>
                                <CircularProgress />
                                <Typography sx={{ ml: 2 }} color="text.secondary">Loading offboarding records…</Typography>
                            </Box>
                        ) : error ? (
                            <Alert severity="error" sx={{ borderRadius: 2 }}>
                                <Typography variant="body2" fontWeight={600}>Failed to load data</Typography>
                                <Typography variant="caption">{error}</Typography>
                                <Button size="small" onClick={fetchRecords} sx={{ ml: 2 }}>Retry</Button>
                            </Alert>
                        ) : records.length === 0 ? (
                            <Card sx={{ borderRadius: 2, p: 4, textAlign: "center" }}>
                                <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>No offboarding records found</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Click "Start Off-Boarding" to initiate a new case.
                                </Typography>
                            </Card>
                        ) : (
                            <OffboardingList records={records} onViewDetails={handleViewDetails} />
                        )}
                    </>
                )}
            </Box>

            <Snackbar
                open={toast.open}
                autoHideDuration={4000}
                onClose={() => setToast({ ...toast, open: false })}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
                <Alert severity={toast.severity} variant="filled" onClose={() => setToast({ ...toast, open: false })}>
                    {toast.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
