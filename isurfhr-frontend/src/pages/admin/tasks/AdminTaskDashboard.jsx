import React, { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

const ALL = "__all__";

export default function AdminTaskDashboard() {
  const [filters, setFilters] = useState({
    status: ALL,
    priority: ALL,
    assignee: ALL,
    department: ALL,
    search: "",
  });

  const [openDetails, setOpenDetails] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const tasks = [
    {
      id: 1,
      title: "Audit HR Policies",
      assignee: "John Doe",
      assignedBy: "Manager A",
      department: "HR",
      due: "2025-08-20",
      status: "Completed",
      priority: "High",
      description:
        "Conduct a compliance audit of all HR policies and prepare a report.",
    },
    {
      id: 2,
      title: "Data Security Review",
      assignee: "Jane Smith",
      assignedBy: "Manager B",
      department: "IT",
      due: "2025-08-10",
      status: "Overdue",
      priority: "Medium",
      description:
        "Review data access logs and ensure compliance with IT security protocols.",
    },
    {
      id: 3,
      title: "Annual Budget Planning",
      assignee: "David Johnson",
      assignedBy: "Manager A",
      department: "Finance",
      due: "2025-08-28",
      status: "In Progress",
      priority: "High",
      description:
        "Coordinate with finance department to prepare annual budget drafts.",
    },
  ];

  // Derived filter lists
  const statuses = ["Open", "In Progress", "Completed", "Overdue"];
  const priorities = ["High", "Medium", "Low"];
  const assignees = Array.from(new Set(tasks.map((t) => t.assignee)));
  const departments = Array.from(new Set(tasks.map((t) => t.department)));

  // Filtering logic
  const filtered = tasks.filter((t) => {
    return (
      (filters.status === ALL || t.status === filters.status) &&
      (filters.priority === ALL || t.priority === filters.priority) &&
      (filters.assignee === ALL || t.assignee === filters.assignee) &&
      (filters.department === ALL || t.department === filters.department) &&
      (!filters.search ||
        t.title.toLowerCase().includes(filters.search.toLowerCase()))
    );
  });

  const openDetailsFor = (task) => {
    setSelectedTask(task);
    setOpenDetails(true);
  };

  const handleExport = () => {
    console.log("Exporting data:", filtered);
    // Hook up real export logic here
    alert("Export to CSV triggered (mock).");
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  // Chart data
  const statusData = [
    { name: "Open", value: tasks.filter((t) => t.status === "Open").length },
    {
      name: "In Progress",
      value: tasks.filter((t) => t.status === "In Progress").length,
    },
    {
      name: "Completed",
      value: tasks.filter((t) => t.status === "Completed").length,
    },
    {
      name: "Overdue",
      value: tasks.filter((t) => t.status === "Overdue").length,
    },
  ];

  const priorityData = [
    { name: "High", value: tasks.filter((t) => t.priority === "High").length },
    {
      name: "Medium",
      value: tasks.filter((t) => t.priority === "Medium").length,
    },
    { name: "Low", value: tasks.filter((t) => t.priority === "Low").length },
  ];

  const departmentData = departments.map((dept) => {
    return {
      department: dept,
      Open: tasks.filter((t) => t.department === dept && t.status === "Open")
        .length,
      "In Progress": tasks.filter(
        (t) => t.department === dept && t.status === "In Progress"
      ).length,
      Completed: tasks.filter(
        (t) => t.department === dept && t.status === "Completed"
      ).length,
      Overdue: tasks.filter(
        (t) => t.department === dept && t.status === "Overdue"
      ).length,
    };
  });

  const STATUS_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#EF4444"];

  // Reusable Stat Card Component
  const StatCard = ({ label, value, bgcolor, color }) => (
    <Card
      elevation={0}
      sx={{
        bgcolor: bgcolor,
        color: color,
        borderRadius: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <CardContent>
        <Typography
          variant="caption"
          sx={{
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 600,
            opacity: 0.9,
          }}
        >
          {label}
        </Typography>
        <Typography variant="h4" fontWeight="bold" sx={{ mt: 1 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );

  // Helper to get status chip color
  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
        return "success";
      case "In Progress":
        return "primary"; // Blue-ish in MUI default
      case "Overdue":
        return "error";
      case "Open":
      default:
        return "default"; // Grey
    }
  };

  // Helper to get priority chip color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
        return "error";
      case "Medium":
        return "warning";
      case "Low":
        return "success";
      default:
        return "default";
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1600, margin: "0 auto" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography variant="h4" fontWeight="bold" color="primary">
          Task Reports
        </Typography>
        <Button variant="contained" onClick={handleExport}>
          Export CSV
        </Button>
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item size={3}>
          <StatCard
            label="Total Tasks"
            value={tasks.length}
            bgcolor="#EBF5FF" // blue-50 equivalent
            color="#1E40AF" // blue-800 equivalent
          />
        </Grid>
        <Grid item size={3}>
          <StatCard
            label="Completed"
            value={tasks.filter((t) => t.status === "Completed").length}
            bgcolor="#ECFDF5" // emerald-50
            color="#065F46" // emerald-800
          />
        </Grid>
        <Grid item size={3}>
          <StatCard
            label="Open"
            value={tasks.filter((t) => t.status === "Open").length}
            bgcolor="#F3F4F6" // gray-100
            color="#374151" // gray-700
          />
        </Grid>
        <Grid item size={3}>
          <StatCard
            label="Overdue"
            value={tasks.filter((t) => t.status === "Overdue").length}
            bgcolor="#FFF1F2" // rose-50
            color="#9F1239" // rose-800
          />
        </Grid>
      </Grid>

      {/* Charts Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Pie Chart */}
        <Grid item size={4}>
          <Card sx={{ height: "100%", borderRadius: 2 }} elevation={2}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Task Distribution by Status
              </Typography>
              <Box sx={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {statusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Bar Chart - Priority */}
        <Grid item size={4}>
          <Card sx={{ height: "100%", borderRadius: 2 }} elevation={2}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Task Distribution by Priority
              </Typography>
              <Box sx={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={priorityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend verticalAlign="bottom" />
                    <Bar dataKey="value" fill="#1976d2" name="Tasks" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Bar Chart - Department */}
        <Grid item size={4}>
          <Card sx={{ height: "100%", borderRadius: 2 }} elevation={2}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Tasks by Department & Status
              </Typography>
              <Box sx={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={departmentData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="department" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend verticalAlign="bottom" />
                    <Bar dataKey="Open" stackId="a" fill="#3B82F6" />
                    <Bar dataKey="In Progress" stackId="a" fill="#F59E0B" />
                    <Bar dataKey="Completed" stackId="a" fill="#10B981" />
                    <Bar dataKey="Overdue" stackId="a" fill="#EF4444" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters Section */}
      <Card sx={{ mb: 4, borderRadius: 2 }} elevation={2}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                >
                  <MenuItem value={ALL}>All Statuses</MenuItem>
                  {statuses.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select
                  value={filters.priority}
                  label="Priority"
                  onChange={(e) =>
                    handleFilterChange("priority", e.target.value)
                  }
                >
                  <MenuItem value={ALL}>All Priorities</MenuItem>
                  {priorities.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Assignee</InputLabel>
                <Select
                  value={filters.assignee}
                  label="Assignee"
                  onChange={(e) =>
                    handleFilterChange("assignee", e.target.value)
                  }
                >
                  <MenuItem value={ALL}>All Assignees</MenuItem>
                  {assignees.map((a) => (
                    <MenuItem key={a} value={a}>
                      {a}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Department</InputLabel>
                <Select
                  value={filters.department}
                  label="Department"
                  onChange={(e) =>
                    handleFilterChange("department", e.target.value)
                  }
                >
                  <MenuItem value={ALL}>All Departments</MenuItem>
                  {departments.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                label="Search title..."
                variant="outlined"
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <TableContainer
        component={Paper}
        elevation={2}
        sx={{ borderRadius: 2, overflow: "hidden" }}
      >
        <Table sx={{ minWidth: 650 }} aria-label="tasks table">
          <TableHead sx={{ bgcolor: "action.hover" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Task</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Department</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Assignee</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Assigned By</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Priority</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Due Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    {row.title}
                  </TableCell>
                  <TableCell>{row.department}</TableCell>
                  <TableCell>{row.assignee}</TableCell>
                  <TableCell>{row.assignedBy}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.priority}
                      color={getPriorityColor(row.priority)}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 500 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.status}
                      color={getStatusColor(row.status)}
                      size="small"
                      sx={{ fontWeight: 500 }}
                    />
                  </TableCell>
                  <TableCell>{row.due}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => openDetailsFor(row)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" color="text.secondary">
                    No tasks match your filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Task Details Dialog */}
      <Dialog
        open={openDetails}
        onClose={() => setOpenDetails(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Task Details
          <IconButton onClick={() => setOpenDetails(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedTask && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="h6" color="primary" gutterBottom>
                {selectedTask.title}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {selectedTask.description}
              </Typography>

              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Department:
                  </Typography>
                  <Typography variant="body2">
                    {selectedTask.department}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Assignee:
                  </Typography>
                  <Typography variant="body2">
                    {selectedTask.assignee}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Assigned By:
                  </Typography>
                  <Typography variant="body2">
                    {selectedTask.assignedBy}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Due Date:
                  </Typography>
                  <Typography variant="body2">{selectedTask.due}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Priority:
                  </Typography>
                  <Chip
                    label={selectedTask.priority}
                    color={getPriorityColor(selectedTask.priority)}
                    size="small"
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Status:
                  </Typography>
                  <Chip
                    label={selectedTask.status}
                    color={getStatusColor(selectedTask.status)}
                    size="small"
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDetails(false)} color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
