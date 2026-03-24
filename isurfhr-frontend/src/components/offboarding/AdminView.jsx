import React, { useState, useEffect } from "react";
import {
    Box, Typography, Card, CardContent, TextField, InputAdornment, Avatar,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Tooltip, Badge, Button, Tabs, Tab, Paper,
    Divider, Switch, FormControlLabel, Dialog, DialogTitle,
    DialogContent, DialogActions, Grid, CircularProgress, Alert,
} from "@mui/material";
import {
    Search as SearchIcon, NotificationsOutlined as BellIcon,
    History as AuditIcon, Policy as PolicyIcon, ListAlt as TemplateIcon,
    People as PeopleIcon, Settings as SettingsIcon, Edit as EditIcon,
    Visibility as ViewIcon, Download as DownloadIcon,
    Delete as DeleteIcon, Add as AddIcon, FilterList as FilterIcon,
    Security as SecurityIcon,
} from "@mui/icons-material";
import { adminApi, offboardingApi } from "@/services/api";

export default function AdminView() {
    const [activeTab, setActiveTab] = useState(0);
    const [adminStats, setAdminStats] = useState({ totalOffboardings: 0, activePolicies: 0, templates: 0, auditEvents: 0 });
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            setStatsLoading(true);
            try {
                const [offStats, policies, templates, logs] = await Promise.all([
                    offboardingApi.getStats(),
                    adminApi.getPolicies(),
                    adminApi.getTemplates(),
                    adminApi.getAuditLogs(),
                ]);
                setAdminStats({
                    totalOffboardings: offStats.total || 0,
                    activePolicies: Array.isArray(policies) ? policies.filter((p) => p.status === "active").length : 0,
                    templates: Array.isArray(templates) ? templates.length : 0,
                    auditEvents: Array.isArray(logs) ? logs.length : 0,
                });
            } catch {
                setAdminStats({ totalOffboardings: 0, activePolicies: 0, templates: 0, auditEvents: 0 });
            } finally {
                setStatsLoading(false);
            }
        };
        fetchStats();
    }, []);

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            {/* Header */}
            <Box sx={{ px: 4, py: 2, display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ flex: 1 ,display: "flex", flexDirection: "column", gap: 1 }}>
                    <Typography variant="h1" fontWeight={700}>Admin Dashboard</Typography>
                    <Typography variant="body2" color="text.secondary">System configuration, audit logs, and policy management</Typography>
                </Box>
                <TextField
                    size="small" placeholder="Search…"
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 20, color: "#94A3B8" }} /></InputAdornment> } }}
                    sx={{ width: 220, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
            </Box>

            <Box sx={{ flex: 1, p: 4, overflowY: "auto" }}>
                {/* Stats */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {[
                        { label: "Total Offboardings", value: adminStats.totalOffboardings, icon: <PeopleIcon />, color: "#1180DA", bg: "#EBF5FF" },
                        { label: "Active Policies", value: adminStats.activePolicies, icon: <PolicyIcon />, color: "#7B1FA2", bg: "#F3E5F5" },
                        { label: "Checklist Templates", value: adminStats.templates, icon: <TemplateIcon />, color: "#2E7D32", bg: "#E8F5E9" },
                        { label: "Audit Events (30d)", value: adminStats.auditEvents, icon: <AuditIcon />, color: "#E65100", bg: "#FFF3E0" },
                    ].map((s) => (
                        <Grid item xs={12} sm={6} md={3} key={s.label}>
                            <Card sx={{ borderLeft: `4px solid ${s.color}` }}>
                                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                                    <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {React.cloneElement(s.icon, { sx: { color: s.color } })}
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                                        {statsLoading ? <CircularProgress size={20} /> : <Typography variant="h5" fontWeight={700}>{s.value}</Typography>}
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>

                {/* Tabs */}
                <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
                    <Tabs
                        value={activeTab}
                        onChange={(_, v) => setActiveTab(v)}
                        sx={{ borderBottom: "1px solid #E2E8F0", px: 2, "& .MuiTab-root": { textTransform: "none", fontWeight: 600 } }}
                    >
                        <Tab icon={<AuditIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Audit Logs" />
                        <Tab icon={<PolicyIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Policies" />
                        <Tab icon={<TemplateIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Templates" />
                        <Tab icon={<SettingsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="System Settings" />
                    </Tabs>

                    <Box sx={{ p: 3 }}>
                        {activeTab === 0 && <AuditLogsTab />}
                        {activeTab === 1 && <PoliciesTab />}
                        {activeTab === 2 && <TemplatesTab />}
                        {activeTab === 3 && <SystemSettingsTab />}
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}

/* ─── Audit Logs Tab ─── */
function AuditLogsTab() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await adminApi.getAuditLogs();
                setLogs(Array.isArray(data) ? data : []);
            } catch (err) {
                setError(err.message || "Failed to load audit logs");
                setLogs([]);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    const filtered = logs.filter((l) =>
        (l.action || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.user || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.target || "").toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h6" fontWeight={700}>Audit Trail</Typography>
                <Box sx={{ display: "flex", gap: 1.5 }}>
                    <TextField
                        size="small" placeholder="Search logs…" value={search} onChange={(e) => setSearch(e.target.value)}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> } }}
                        sx={{ width: 250 }}
                    />
                    <Button variant="outlined" startIcon={<FilterIcon />} size="small">Filter</Button>
                    <Button variant="outlined" startIcon={<DownloadIcon />} size="small">Export</Button>
                </Box>
            </Box>

            {filtered.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography color="text.secondary">No audit logs found</Typography>
                </Box>
            ) : (
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: "#F8FAFC" }}>
                                {["Timestamp", "Action", "User", "Role", "Target", "IP"].map((h) => (
                                    <TableCell key={h} sx={{ fontWeight: 700, color: "#64748B", fontSize: 12, textTransform: "uppercase" }}>{h}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map((log) => (
                                <TableRow key={log.id} hover>
                                    <TableCell><Typography variant="caption" color="text.secondary">{log.timestamp}</Typography></TableCell>
                                    <TableCell>
                                        <Chip label={log.action} size="small" variant="outlined"
                                            color={(log.action || "").includes("completed") || (log.action || "").includes("processed") ? "success" : (log.action || "").includes("initiated") ? "primary" : "default"}
                                            sx={{ fontWeight: 500, fontSize: 12 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                            <Avatar sx={{ width: 24, height: 24, fontSize: 10, bgcolor: "#7B1FA2" }}>
                                                {(log.user || "").split(" ").map((n) => n[0]).join("")}
                                            </Avatar>
                                            <Typography variant="body2">{log.user}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell><Typography variant="caption" color="text.secondary">{log.role}</Typography></TableCell>
                                    <TableCell><Typography variant="body2" sx={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.target}</Typography></TableCell>
                                    <TableCell><Typography variant="caption" fontFamily="monospace" color="text.secondary">{log.ip}</Typography></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}

/* ─── Policies Tab ─── */
function PoliciesTab() {
    const [policies, setPolicies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newPolicy, setNewPolicy] = useState({ name: "", description: "", version: "1.0" });
    const [creating, setCreating] = useState(false);

    const fetchPolicies = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await adminApi.getPolicies();
            setPolicies(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || "Failed to load policies");
            setPolicies([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPolicies(); }, []);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await adminApi.createPolicy(newPolicy);
            setDialogOpen(false);
            setNewPolicy({ name: "", description: "", version: "1.0" });
            fetchPolicies();
        } catch {
            // Handle error
        } finally {
            setCreating(false);
        }
    };

    if (loading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h6" fontWeight={700}>Offboarding Policies</Typography>
                <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => setDialogOpen(true)}>New Policy</Button>
            </Box>

            {policies.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography color="text.secondary">No policies configured yet</Typography>
                </Box>
            ) : (
                <Grid container spacing={2}>
                    {policies.map((policy) => (
                        <Grid item xs={12} md={6} key={policy.id}>
                            <Card variant="outlined" sx={{ borderRadius: 2, "&:hover": { borderColor: "#7B1FA2", boxShadow: "0 2px 8px rgba(123,31,162,0.1)" } }}>
                                <CardContent>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                                        <Box>
                                            <Typography variant="subtitle1" fontWeight={700}>{policy.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">Version {policy.version} • Updated {policy.lastUpdated}</Typography>
                                        </Box>
                                        <Chip label={policy.status} size="small" color={policy.status === "active" ? "success" : "warning"} sx={{ fontWeight: 600, fontSize: 11 }} />
                                    </Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{policy.description}</Typography>
                                    <Box sx={{ display: "flex", gap: 1 }}>
                                        <Button size="small" variant="outlined" startIcon={<EditIcon />}>Edit</Button>
                                        <Button size="small" variant="outlined" startIcon={<ViewIcon />}>View</Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New Policy</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
                        <TextField label="Policy Name" fullWidth size="small" value={newPolicy.name} onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })} />
                        <TextField label="Description" fullWidth multiline rows={3} size="small" value={newPolicy.description} onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })} />
                        <TextField label="Version" fullWidth size="small" value={newPolicy.version} onChange={(e) => setNewPolicy({ ...newPolicy, version: e.target.value })} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={creating}>
                        {creating ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

/* ─── Templates Tab ─── */
function TemplatesTab() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchTemplates = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await adminApi.getTemplates();
                setTemplates(Array.isArray(data) ? data : []);
            } catch (err) {
                setError(err.message || "Failed to load templates");
                setTemplates([]);
            } finally {
                setLoading(false);
            }
        };
        fetchTemplates();
    }, []);

    const handleDelete = async (id) => {
        try {
            await adminApi.deleteTemplate(id);
            setTemplates((prev) => prev.filter((t) => t.id !== id));
        } catch {
            // Handle error
        }
    };

    if (loading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h6" fontWeight={700}>Checklist Templates</Typography>
                <Button variant="contained" startIcon={<AddIcon />} size="small">New Template</Button>
            </Box>

            {templates.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography color="text.secondary">No templates found</Typography>
                </Box>
            ) : (
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: "#F8FAFC" }}>
                                {["Template Name", "Tasks", "Departments", "Status", "Actions"].map((h) => (
                                    <TableCell key={h} sx={{ fontWeight: 700, color: "#64748B", fontSize: 12, textTransform: "uppercase" }}>{h}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {templates.map((tpl) => (
                                <TableRow key={tpl.id} hover>
                                    <TableCell>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                            <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: "#F3E5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <TemplateIcon sx={{ fontSize: 18, color: "#7B1FA2" }} />
                                            </Box>
                                            <Typography fontWeight={600}>{tpl.name}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={`${tpl.taskCount} tasks`} size="small" sx={{ bgcolor: "#EBF5FF", color: "#1180DA", fontWeight: 600 }} />
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                                            {(tpl.departments || []).map((d) => (
                                                <Chip key={d} label={d} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                            ))}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={tpl.status} size="small" color={tpl.status === "active" ? "success" : "default"} sx={{ fontWeight: 600, fontSize: 11 }} />
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title="Edit"><IconButton size="small"><EditIcon fontSize="small" /></IconButton></Tooltip>
                                        <Tooltip title="Duplicate"><IconButton size="small"><AddIcon fontSize="small" /></IconButton></Tooltip>
                                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(tpl.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}

/* ─── System Settings Tab ─── */
function SystemSettingsTab() {
    const [settings, setSettings] = useState({
        autoRevokeAccess: true,
        requireManagerApproval: true,
        enableTwoFactor: false,
        logAllActivities: true,
        emailNotifications: true,
        slackNotifications: true,
        reminderDays: true,
        dailyDigest: false,
        defaultNoticePeriod: "30",
        fnfProcessingDays: "15",
        archiveAfterDays: "90",
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            setLoading(true);
            try {
                const data = await adminApi.getSettings();
                if (data && typeof data === "object") setSettings(data);
            } catch {
                // Use defaults
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await adminApi.updateSettings(settings);
        } catch {
            // Handle error
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>System Settings</Typography>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                <SecurityIcon sx={{ fontSize: 18, mr: 1, verticalAlign: "text-bottom", color: "#7B1FA2" }} />
                                Security Settings
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <FormControlLabel control={<Switch checked={settings.autoRevokeAccess} onChange={(e) => setSettings({ ...settings, autoRevokeAccess: e.target.checked })} />} label="Auto-revoke access on last working day" />
                                <FormControlLabel control={<Switch checked={settings.requireManagerApproval} onChange={(e) => setSettings({ ...settings, requireManagerApproval: e.target.checked })} />} label="Require manager approval for offboarding" />
                                <FormControlLabel control={<Switch checked={settings.enableTwoFactor} onChange={(e) => setSettings({ ...settings, enableTwoFactor: e.target.checked })} />} label="Enable two-factor for offboarding actions" />
                                <FormControlLabel control={<Switch checked={settings.logAllActivities} onChange={(e) => setSettings({ ...settings, logAllActivities: e.target.checked })} />} label="Log all offboarding activities" />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                <BellIcon sx={{ fontSize: 18, mr: 1, verticalAlign: "text-bottom", color: "#1180DA" }} />
                                Notification Settings
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <FormControlLabel control={<Switch checked={settings.emailNotifications} onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })} />} label="Email notifications to stakeholders" />
                                <FormControlLabel control={<Switch checked={settings.slackNotifications} onChange={(e) => setSettings({ ...settings, slackNotifications: e.target.checked })} />} label="Slack notifications for task updates" />
                                <FormControlLabel control={<Switch checked={settings.reminderDays} onChange={(e) => setSettings({ ...settings, reminderDays: e.target.checked })} />} label="Reminder 3 days before due date" />
                                <FormControlLabel control={<Switch checked={settings.dailyDigest} onChange={(e) => setSettings({ ...settings, dailyDigest: e.target.checked })} />} label="Daily digest for pending tasks" />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                <SettingsIcon sx={{ fontSize: 18, mr: 1, verticalAlign: "text-bottom", color: "#E65100" }} />
                                General Settings
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <TextField label="Default Notice Period (days)" size="small" value={settings.defaultNoticePeriod} onChange={(e) => setSettings({ ...settings, defaultNoticePeriod: e.target.value })} type="number" fullWidth />
                                <TextField label="FnF Processing Days" size="small" value={settings.fnfProcessingDays} onChange={(e) => setSettings({ ...settings, fnfProcessingDays: e.target.value })} type="number" fullWidth />
                                <TextField label="Archive After (days)" size="small" value={settings.archiveAfterDays} onChange={(e) => setSettings({ ...settings, archiveAfterDays: e.target.value })} type="number" fullWidth />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                <PeopleIcon sx={{ fontSize: 18, mr: 1, verticalAlign: "text-bottom", color: "#2E7D32" }} />
                                Role Permissions
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                                {[
                                    { role: "HR Director", perms: "Full access" },
                                    { role: "HR Specialist", perms: "Create, Edit, View" },
                                    { role: "Manager", perms: "View assigned, Approve tasks" },
                                    { role: "IT Admin", perms: "View IT tasks, Update status" },
                                    { role: "Finance", perms: "View finance tasks, Process FnF" },
                                ].map((r) => (
                                    <Box key={r.role} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1.5, bgcolor: "#F8FAFC", borderRadius: 1 }}>
                                        <Box>
                                            <Typography variant="body2" fontWeight={600}>{r.role}</Typography>
                                            <Typography variant="caption" color="text.secondary">{r.perms}</Typography>
                                        </Box>
                                        <IconButton size="small"><EditIcon fontSize="small" /></IconButton>
                                    </Box>
                                ))}
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Box sx={{ mt: 3, display: "flex", gap: 2, justifyContent: "flex-end" }}>
                <Button variant="outlined">Reset to Defaults</Button>
                <Button variant="contained" onClick={handleSave} disabled={saving}>
                    {saving ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                    Save Settings
                </Button>
            </Box>
        </Box>
    );
}
