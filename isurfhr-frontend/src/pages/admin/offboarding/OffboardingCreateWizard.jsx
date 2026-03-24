import React, { useState, useRef, useEffect } from "react";
import {
  Box, Typography, Card, CardContent, Button, TextField, Chip,
  Stepper, Step, StepLabel, StepConnector, Avatar, Checkbox,
  InputAdornment, Paper, Alert, Divider, Grid, CircularProgress,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import {
  ArrowBack as BackIcon, ArrowForward as NextIcon,
  Check as CheckIcon, Search as SearchIcon,
  Person as PersonIcon, Business as DeptIcon,
  CalendarToday as CalendarIcon,
  Computer as ITIcon, AttachMoney as FinanceIcon,
  MeetingRoom as FacilitiesIcon, Gavel as LegalIcon,
  Security as SecurityIcon, People as HRIcon,
  ChevronLeft, ChevronRight,
} from "@mui/icons-material";
import { employeeApi, offboardingApi } from "@/services/api";
import { useNavigate } from "react-router-dom";

const steps = ["Overview", "Scope", "Checklist", "Notifications"];
const CustomConnector = styled(StepConnector)(() => ({
  "& .MuiStepConnector-line": { borderColor: "#E2E8F0", borderTopWidth: 3, borderRadius: 1 },
  "&.Mui-active .MuiStepConnector-line": { borderColor: "#1180DA" },
  "&.Mui-completed .MuiStepConnector-line": { borderColor: "#10B981" },
}));

function CustomStepIcon(props) {
  const { active, completed, icon } = props;
  return (
    <Box sx={{
      width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
      bgcolor: completed ? "#10B981" : active ? "#1180DA" : "#E2E8F0",
      color: completed || active ? "#fff" : "#64748B", fontWeight: 700, fontSize: 14,
      transition: "all 0.3s",
    }}>
      {completed ? <CheckIcon sx={{ fontSize: 18 }} /> : icon}
    </Box>
  );
}

export default function OffboardingCreateWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    employee: "", employeeId: "", department: "", position: "",
    exitType: "", lastDay: "", manager: "", hrOwner: "",
    scope: { IT: true, Finance: true, Facilities: true, Legal: false, HR: true, Security: false },
    template: "Standard Staff",
    notify: { manager: true, it: true, finance: true, facilities: true, security: false, legal: false, hrHead: true },
  });

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeResults, setEmployeeResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const empRef = useRef(null);
  const calRef = useRef(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (empRef.current && !empRef.current.contains(e.target)) setShowEmployeeDropdown(false);
      if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Debounced employee search via API
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!employeeSearch || employeeSearch.length < 2) {
      setEmployeeResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await employeeApi.search(employeeSearch);
        setEmployeeResults(Array.isArray(results) ? results : []);
      } catch {
        setEmployeeResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [employeeSearch]);

  const selectEmployee = (emp) => {
    setForm({
      ...form,
      employee: emp.name,
      employeeId: emp.id,
      department: emp.department,
      position: emp.position,
      manager: emp.manager || "",
    });
    setEmployeeSearch(emp.name);
    setShowEmployeeDropdown(false);
    setErrors({ ...errors, employee: undefined });
  };

  const validateStep = () => {
    const e = {};
    if (step === 0) {
      if (!form.employee) e.employee = "Select an employee";
      if (!form.exitType) e.exitType = "Select exit type";
      if (!form.lastDay) e.lastDay = "Select last working day";
      if (!form.hrOwner) e.hrOwner = "Enter HR owner";
    }
    if (step === 1) {
      const anyScope = Object.values(form.scope).some(Boolean);
      if (!anyScope) e.scope = "Select at least one department";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const DEV_MODE = true; //Allows to skip Steps to see other UI steps, false to disable
  const next = () => { if (DEV_MODE || validateStep()) { setStep((s) => Math.min(3, s + 1)); } };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const createCase = async () => {
    setSubmitting(true);
    const scopeDepts = Object.entries(form.scope).filter(([, v]) => v).map(([k]) => k);
    const notifyList = Object.entries(form.notify).filter(([, v]) => v).map(([k]) => k);

    const payload = {
      employeeId: form.employeeId,
      employeeName: form.employee,
      department: form.department,
      position: form.position,
      separationType: form.exitType,
      lastWorkingDay: form.lastDay,
      manager: form.manager,
      hrOwner: form.hrOwner,
      scope: scopeDepts,
      template: form.template,
      notify: notifyList,
    };

    try {
      await offboardingApi.create(payload);
      navigate("/offboarding", {
        state: {
          snackbar: {
            type: "success",
            message: "Offboarding case created successfully"
          }
        }
      });

    } catch {
      // If API fails, construct a local representation so the UI can still proceed
      const id = `OFF-${Math.floor(Math.random() * 9000 + 1000)}`;
      const tasks = [];
      let taskId = 1;
      const deptTasks = {
        IT: [{ title: "Revoke system access", priority: "high" }, { title: "Collect equipment", priority: "high" }],
        Finance: [{ title: "Final payroll calculation", priority: "high" }, { title: "Benefits termination", priority: "medium" }],
        HR: [{ title: "Exit interview", priority: "medium" }, { title: "Clearance letter", priority: "medium" }],
        Facilities: [{ title: "Return access badge", priority: "low" }, { title: "Clear workspace", priority: "low" }],
        Legal: [{ title: "NDA review", priority: "high" }, { title: "IP assignment verification", priority: "medium" }],
        Security: [{ title: "Security clearance revocation", priority: "high" }],
      };
      scopeDepts.forEach((dept) => {
        (deptTasks[dept] || []).forEach((t) => {
          tasks.push({ id: `T${taskId++}`, title: t.title, category: dept, assignee: `${dept} Admin`, dueDate: form.lastDay, status: "pending", priority: t.priority });
        });
      });

      const newRecord = {
        id, employeeId: form.employeeId, employeeName: form.employee, department: form.department,
        position: form.position, avatar: form.employee.split(" ").map((n) => n[0]).join(""),
        separationType: form.exitType, reason: "", lastWorkingDay: form.lastDay,
        initiatedDate: new Date().toISOString().split("T")[0], initiatedBy: "Karen White",
        status: "initiated", hrOwner: form.hrOwner, manager: form.manager, noticePeriod: "30 days",
        exitInterviewDone: false, fnfStatus: "not-started", tasks,
        timeline: [
          { date: new Date().toISOString().split("T")[0], event: "Offboarding case created", by: "Karen White", type: "system" },
          { date: new Date().toISOString().split("T")[0], event: "Stakeholders notified", by: "System", type: "notification" },
        ],
      };
      navigate("/offboarding", {
        state: {
          snackbar: {
            type: "error",
            message: "Failed to create offboarding case"
          }
        }
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Calendar helpers
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const prevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1));
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const selectDate = (day) => {
    const d = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const iso = d.toISOString().split("T")[0];
    setForm({ ...form, lastDay: iso });
    setShowCalendar(false);
    setErrors({ ...errors, lastDay: undefined });
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", maxWidth: 900, mx: "auto" }}>

      <Stepper activeStep={step} connector={<CustomConnector />} sx={{ my: 5 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel slots={{ stepIcon: CustomStepIcon }}>
              <Typography variant="caption" fontWeight={600}>{label}</Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <Card sx={{ borderRadius: 2, display: "flex", flexDirection: "column", flex: 1, minHeight: 0, mb: 2 }}>
        <CardContent sx={{ p: 4, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <Box sx={{ flex: 1, overflow: "auto", minHeight: 0, pr: 1, pb: 1 }}>
            {/* Step 1: Overview */}
            {step === 0 && (
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>Employee & Separation Details</Typography>
                <Grid container spacing={3}>
                  {/* Employee Search */}
                  <Grid item xs={12} md={6}>
                    <Box ref={empRef} sx={{ position: "relative" }}>
                      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Employee *</Typography>
                      <TextField
                        fullWidth size="small" placeholder="Search employee by name or ID…"
                        value={employeeSearch} error={!!errors.employee} helperText={errors.employee}
                        onChange={(e) => { setEmployeeSearch(e.target.value); setShowEmployeeDropdown(true); setForm({ ...form, employee: "", employeeId: "", department: "", position: "", manager: "" }); }}
                        onFocus={() => { if (employeeSearch.length >= 2) setShowEmployeeDropdown(true); }}
                        slotProps={{
                          input: {
                            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
                            endAdornment: searchLoading ? <CircularProgress size={16} /> : null,
                          }
                        }}
                      />
                      {showEmployeeDropdown && (
                        <Paper sx={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, mt: 0.5, maxHeight: 200, overflow: "auto", boxShadow: 3 }}>
                          {searchLoading ? (
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 3 }}>
                              <CircularProgress size={20} />
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>Searching…</Typography>
                            </Box>
                          ) : employeeResults.length > 0 ? (
                            employeeResults.map((emp) => (
                              <Box key={emp.id} onClick={() => selectEmployee(emp)} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5, cursor: "pointer", "&:hover": { bgcolor: "#F1F5F9" } }}>
                                <Avatar sx={{ width: 32, height: 32, bgcolor: "#1180DA", fontSize: 12 }}>
                                  {(emp.name || "").split(" ").map((n) => n[0]).join("")}
                                </Avatar>
                                <Box>
                                  <Typography variant="body2" fontWeight={600}>{emp.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{emp.id} • {emp.department}</Typography>
                                </Box>
                              </Box>
                            ))
                          ) : employeeSearch.length >= 2 ? (
                            <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
                              <Typography variant="body2" color="text.secondary">No employees found</Typography>
                            </Box>
                          ) : null}
                        </Paper>
                      )}
                    </Box>
                  </Grid>

                  {/* Department (auto-fill) */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Department</Typography>
                    <TextField fullWidth size="small" value={form.department} disabled slotProps={{ input: { startAdornment: <InputAdornment position="start"><DeptIcon sx={{ fontSize: 18, color: "#94A3B8" }} /></InputAdornment> } }} />
                  </Grid>

                  {/* Exit Type */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Exit Type *</Typography>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      {["Resignation", "Termination", "Contract End"].map((t) => (
                        <Chip
                          key={t} label={t} variant={form.exitType === t ? "filled" : "outlined"}
                          onClick={() => { setForm({ ...form, exitType: t }); setErrors({ ...errors, exitType: undefined }); }}
                          sx={{ cursor: "pointer", ...(form.exitType === t && { bgcolor: "#1180DA", color: "#fff" }) }}
                        />
                      ))}
                    </Box>
                    {errors.exitType && <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>{errors.exitType}</Typography>}
                  </Grid>

                  {/* Last Working Day */}
                  <Grid item xs={12} md={6}>
                    <Box ref={calRef} sx={{ position: "relative" }}>
                      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Last Working Day *</Typography>
                      <TextField
                        fullWidth size="small" placeholder="Pick a date" value={form.lastDay}
                        error={!!errors.lastDay} helperText={errors.lastDay}
                        onClick={() => setShowCalendar(true)} readOnly
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><CalendarIcon sx={{ fontSize: 18, color: "#94A3B8" }} /></InputAdornment> } }}
                        sx={{ cursor: "pointer" }}
                      />
                      {showCalendar && (
                        <Paper sx={{ position: "absolute", bottom: "-90%", left: 130, zIndex: 10, mt: 0.5, p: 2, boxShadow: 3, width: 280 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                            <Button size="small" onClick={prevMonth}><ChevronLeft /></Button>
                            <Typography variant="body2" fontWeight={600}>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</Typography>
                            <Button size="small" onClick={nextMonth}><ChevronRight /></Button>
                          </Box>
                          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, textAlign: "center" }}>
                            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                              <Typography key={d} variant="caption" fontWeight={700} color="text.secondary" sx={{ py: 0.5 }}>{d}</Typography>
                            ))}
                            {Array.from({ length: getFirstDayOfMonth(calendarMonth) }).map((_, i) => <Box key={`e${i}`} />)}
                            {Array.from({ length: getDaysInMonth(calendarMonth) }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const isSelected = form.lastDay === dateStr;
                              const isPast = new Date(dateStr) < new Date(new Date().toDateString());
                              return (
                                <Box
                                  key={day} onClick={() => !isPast && selectDate(day)}
                                  sx={{
                                    py: 0.5, borderRadius: 1, cursor: isPast ? "default" : "pointer", fontSize: 13,
                                    bgcolor: isSelected ? "#1180DA" : "transparent", color: isSelected ? "#fff" : isPast ? "#CBD5E1" : "#0F172A",
                                    "&:hover": !isPast && !isSelected ? { bgcolor: "#EBF5FF" } : {},
                                  }}
                                >{day}</Box>
                              );
                            })}
                          </Box>
                        </Paper>
                      )}
                    </Box>
                  </Grid>

                  {/* Manager */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Reporting Manager</Typography>
                    <TextField fullWidth size="small" value={form.manager} disabled slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonIcon sx={{ fontSize: 18, color: "#94A3B8" }} /></InputAdornment> } }} />
                  </Grid>

                  {/* HR Owner */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>HR Owner *</Typography>
                    <TextField
                      fullWidth size="small" value={form.hrOwner} error={!!errors.hrOwner} helperText={errors.hrOwner}
                      onChange={(e) => { setForm({ ...form, hrOwner: e.target.value }); setErrors({ ...errors, hrOwner: undefined }); }}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonIcon sx={{ fontSize: 18, color: "#94A3B8" }} /></InputAdornment> } }}
                    />
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* Step 2: Scope */}
            {step === 1 && (
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Functional Scope</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Select the departments involved in this offboarding</Typography>
                {errors.scope && <Alert severity="error" sx={{ mb: 2 }}>{errors.scope}</Alert>}
                <Grid container spacing={2}>
                  {[
                    { key: "IT", icon: <ITIcon />, desc: "System access, equipment return", color: "#1180DA" },
                    { key: "Finance", icon: <FinanceIcon />, desc: "Payroll, benefits, F&F", color: "#F59E0B" },
                    { key: "Facilities", icon: <FacilitiesIcon />, desc: "Badge, workspace, parking", color: "#7C3AED" },
                    { key: "Legal", icon: <LegalIcon />, desc: "NDA, IP, contracts", color: "#EF4444" },
                    { key: "HR", icon: <HRIcon />, desc: "Exit interview, clearance", color: "#10B981" },
                    { key: "Security", icon: <SecurityIcon />, desc: "Security clearance", color: "#64748B" },
                  ].map((dept) => (
                    <Grid item xs={12} sm={6} md={4} key={dept.key}>
                      <Card
                        variant="outlined"
                        onClick={() => setForm({ ...form, scope: { ...form.scope, [dept.key]: !form.scope[dept.key] } })}
                        sx={{
                          cursor: "pointer", borderRadius: 2, transition: "all 0.2s",
                          borderColor: form.scope[dept.key] ? dept.color : "#E2E8F0",
                          bgcolor: form.scope[dept.key] ? `${dept.color}08` : "transparent",
                          "&:hover": { borderColor: dept.color },
                        }}
                      >
                        <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
                          <Checkbox checked={!!form.scope[dept.key]} sx={{ p: 0, color: dept.color, "&.Mui-checked": { color: dept.color } }} />
                          <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: `${dept.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {React.cloneElement(dept.icon, { sx: { fontSize: 18, color: dept.color } })}
                          </Box>
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{dept.key}</Typography>
                            <Typography variant="caption" color="text.secondary">{dept.desc}</Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
                <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Selected:</Typography>
                  {Object.entries(form.scope).filter(([, v]) => v).map(([k]) => (
                    <Chip key={k} label={k} size="small" color="primary" sx={{ fontWeight: 500, fontSize: 11 }} />
                  ))}
                </Box>
              </Box>
            )}

            {/* Step 3: Checklist */}
            {step === 2 && (
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Checklist Template</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Select a checklist template to preload tasks</Typography>
                <Grid container spacing={2}>
                  {[
                    { name: "Standard Staff", tasks: 12, desc: "Default template for regular employees" },
                    { name: "Manager", tasks: 16, desc: "Extended template with handover requirements" },
                    { name: "Contractor", tasks: 8, desc: "Simplified template for contract workers" },
                    { name: "Executive", tasks: 20, desc: "Comprehensive template for senior leadership" },
                  ].map((tpl) => (
                    <Grid item xs={12} sm={6} key={tpl.name}>
                      <Card
                        variant="outlined"
                        onClick={() => setForm({ ...form, template: tpl.name })}
                        sx={{
                          cursor: "pointer", borderRadius: 2, transition: "all 0.2s",
                          borderColor: form.template === tpl.name ? "#1180DA" : "#E2E8F0",
                          bgcolor: form.template === tpl.name ? "transparent" : "none",
                          "&:hover": { borderColor: "#1180DA" },
                        }}
                      >
                        <CardContent>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                            <Typography variant="body1" fontWeight={700}>{tpl.name}</Typography>
                            <Chip label={`${tpl.tasks} tasks`} size="small" sx={{ bgcolor: form.template === tpl.name ? "#1180DA" : "#F1F5F9", color: form.template === tpl.name ? "#fff" : "#64748B", fontWeight: 600, fontSize: 11 }} />
                          </Box>
                          <Typography variant="body2" color="text.secondary">{tpl.desc}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>

                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Tasks Preview</Typography>
                <Paper variant="outlined" sx={{ maxHeight: 200, overflow: "auto", borderRadius: 2 }}>
                  {Object.entries(form.scope).filter(([, v]) => v).map(([dept]) => {
                    const taskMap = {
                      IT: ["Revoke system access", "Collect equipment"],
                      Finance: ["Final payroll calculation", "Benefits termination"],
                      HR: ["Exit interview", "Clearance letter"],
                      Facilities: ["Return access badge", "Clear workspace"],
                      Legal: ["NDA review", "IP assignment verification"],
                      Security: ["Security clearance revocation"],
                    };
                    return (taskMap[dept] || []).map((t, i) => (
                      <Box key={`${dept}-${i}`} sx={{ display: "flex", alignItems: "center", gap: 2, px: 2, py: 1, borderBottom: "1px solid #F1F5F9" }}>
                        <Avatar sx={{ width: 24, height: 24, bgcolor: "#EBF5FF", color: "#1180DA", fontSize: 11, fontWeight: 700 }}>{i + 1}</Avatar>
                        <Typography variant="body2">{t}</Typography>
                        <Chip label={dept} size="small" variant="outlined" sx={{ ml: "auto", fontSize: 10 }} />
                      </Box>
                    ));
                  })}
                </Paper>
              </Box>
            )}

            {/* Step 4: Notifications */}
            {step === 3 && (
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Notify Stakeholders</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Select who should be notified when this case is created</Typography>
                <Grid container spacing={2}>
                  {[
                    { key: "manager", label: "Manager", desc: `Notify ${form.manager || "the manager"}` },
                    { key: "it", label: "IT Department", desc: "For access revocation & equipment" },
                    { key: "finance", label: "Finance", desc: "For payroll & benefits processing" },
                    { key: "facilities", label: "Facilities", desc: "For badge & workspace clearance" },
                    { key: "security", label: "Security", desc: "For security clearance updates" },
                    { key: "legal", label: "Legal", desc: "For NDA & contract matters" },
                    { key: "hrHead", label: "HR Head", desc: "For oversight and approval" },
                  ].map((s) => (
                    <Grid item xs={12} sm={6} key={s.key}>
                      <Card
                        variant="outlined"
                        onClick={() => setForm({ ...form, notify: { ...form.notify, [s.key]: !form.notify[s.key] } })}
                        sx={{
                          cursor: "pointer", borderRadius: 2,
                          borderColor: form.notify[s.key] ? "#1180DA" : "#E2E8F0",
                          bgcolor: form.notify[s.key] ? "transparent" : "none",
                        }}
                      >
                        <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 1.5, "&:last-child": { pb: 1.5 } }}>
                          <Checkbox checked={!!form.notify[s.key]} sx={{ p: 0, "&.Mui-checked": { color: "#1180DA" } }} />
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{s.label}</Typography>
                            <Typography variant="caption" color="text.secondary">{s.desc}</Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>

                <Alert severity="info" sx={{ mt: 3, borderRadius: 2 }}>
                  <Typography variant="body2" fontWeight={600}>Summary</Typography>
                  <Typography variant="caption">
                    Creating offboarding case for <strong>{form.employee || "—"}</strong> ({form.exitType || "—"}).
                    Last day: <strong>{form.lastDay || "—"}</strong>. <strong><i>{Object.entries(form.notify).filter(([, v]) => v).length}</i></strong> stakeholder(s) will be notified.
                  </Typography>
                </Alert>
              </Box>
            )}

          </Box>

          {/* Navigation */}
          <Box sx={{ display: "flex", justifyContent: "space-between", pt: 3, borderTop: "1px solid #E2E8F0" }}>
            <Button variant="outlined" startIcon={<BackIcon />} onClick={step === 0 ? () => navigate("/offboarding") : back}
              sx={{ borderRadius: 2, ":hover": { color: "#E2E8F0" } }}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              {steps.map((_, i) => (
                <Box key={i} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: i === step ? "#1180DA" : i < step ? "#10B981" : "#E2E8F0" }} />
              ))}
            </Box>
            {step < 3 ? (
              <Button variant="contained" endIcon={<NextIcon />} onClick={next} sx={{ borderRadius: 2, bgcolor: "#1180DA" }}>
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={createCase}
                disabled={submitting}
                sx={{ borderRadius: 2, bgcolor: "#10B981", "&:hover": { bgcolor: "#059669" } }}
              >
                {submitting ? <CircularProgress size={20} sx={{ color: "#fff", mr: 1 }} /> : null}
                {submitting ? "Creating…" : "Create Case"}
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
