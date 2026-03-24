import React, { useState } from "react";
import { useAuth } from "@/lib/context/AuthContext";
import {
  Box, Card, CardContent, Typography, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton, Tooltip, Avatar, LinearProgress, ToggleButtonGroup, ToggleButton, Menu,
  MenuItem, ListItemIcon, ListItemText, Divider
} from "@mui/material";
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  MoreVert as MoreIcon,
} from "@mui/icons-material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";

const statusConfig = {
  initiated: { label: "Initiated", color: "#1180DA", bg: "#EBF5FF" },
  "in-progress": { label: "In Progress", color: "#F59E0B", bg: "#FFFBEB" },
  "pending-clearance": { label: "Pending Clearance", color: "#EF4444", bg: "#FEF2F2" },
  completed: { label: "Completed", color: "#10B981", bg: "#ECFDF5" },
};

const fnfConfig = {
  "not-started": { label: "Not Started", color: "default" },
  pending: { label: "Pending", color: "warning" },
  processing: { label: "Processing", color: "info" },
  completed: { label: "Completed", color: "success" },
};

export default function OffboardingList({ records = [], onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { user } = useAuth();
  const role = (user?.role || "").toString();

  const isAdminOrHR = ["ADMIN", "HR"].includes(role);
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const open = Boolean(anchorEl);

  const handleViewRecord = (record) => {
    if (!record) return;
    if (isAdminOrHR) {
      navigate(`/offboarding/${record.id}`);
    } else {
      navigate(`/offboarding/staff/${record.id}`);
    }
  };

  const handleMenuOpen = (event, record) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedRecord(record);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedRecord(null);
  };

  const filtered = records.filter((r) => {
    const matchSearch =
      (r.employeeName || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.id || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.department || "").toLowerCase().includes(search.toLowerCase());

    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });


  return (
    <Card sx={{ borderRadius: 2 }}>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 2 }}>
          <Typography variant="h6" fontWeight={700}>Offboarding Records</Typography>
          <TextField
            size="small" placeholder="Search by name, ID, department…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 20, color: "#94A3B8" }} /></InputAdornment> } }}
            sx={{ width: 300 }}
          />
        </Box>

        {/* Status Filter */}
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          onChange={(_, v) => v && setStatusFilter(v)}
          size="small"
          sx={{ mb: 2, "& .MuiToggleButton-root": { textTransform: "none", px: 2, fontSize: 13 } }}
        >
          <ToggleButton value="all">All ({records.length})</ToggleButton>
          {Object.entries(statusConfig).map(([key, cfg]) => (
            <ToggleButton key={key} value={key}>
              {cfg.label} ({records.filter((r) => r.status === key).length})
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {["Employee", "Case ID", "Type", "Status", "Last Day", "Progress", "F&F", "Actions"].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, color: "#64748B", fontSize: 12, textTransform: "uppercase" }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: "center", py: 6 }}>
                    <Typography color="text.secondary">No records found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const sc = statusConfig[r.status] || statusConfig.initiated;
                  const fnf = fnfConfig[r.fnfStatus] || fnfConfig["not-started"];
                  const tasks = r.tasks || [];
                  const completed = tasks.filter((t) => t.status === "completed").length;
                  const total = tasks.length;

                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                  return (
                    <TableRow key={r.id} hover sx={{ cursor: "pointer", "&:hover": { bgcolor: "#F8FAFC" } }} onClick={() => handleViewRecord(r)}>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Avatar sx={{ width: 36, height: 36, bgcolor: "#1180DA", fontSize: 13 }}>{r.avatar || (r.employeeName ? r.employeeName[0] : "?")}</Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{r.employeeName}</Typography>
                            <Typography variant="caption" color="text.secondary">{r.department || "—"} • {r.position || "—"}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} fontFamily="monospace">{r.id}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={r.separationType} size="small" variant="outlined" sx={{ fontSize: 12 }} />
                      </TableCell>
                      <TableCell>
                        <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, fontSize: 11 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{r.lastWorkingDay}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 120 }}>
                          <LinearProgress
                            variant="determinate" value={pct}
                            sx={{
                              flex: 1, height: 6, borderRadius: 3, bgcolor: "#E2E8F0",
                              "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: pct === 100 ? "#10B981" : "#1180DA" },
                            }}
                          />
                          <Typography variant="body2" color="text.secondary" fontWeight={600}>{pct}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={fnf.label} size="small" color={fnf.color} variant="outlined" sx={{ fontSize: 11, fontWeight: 500 }} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="More Actions">
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, r)}
                          >
                            <MoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem
            onClick={() => {
              if (selectedRecord) {
                handleViewRecord(selectedRecord);
              }
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <ViewIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>View</ListItemText>
          </MenuItem>

          {/* Edit & Delete - Only HR/Admin */}
          {isAdminOrHR && (
            <>
              <MenuItem
                onClick={() => {
                  onEdit?.(selectedRecord);
                  handleMenuClose();
                }}
              >
                <ListItemIcon>
                  <EditIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Edit</ListItemText>
              </MenuItem>

              <Divider />

              <MenuItem
                onClick={() => {
                  onDelete?.(selectedRecord);
                  handleMenuClose();
                }}
                sx={{ color: "#EF4444" }}
              >
                <ListItemIcon>
                  <DeleteIcon fontSize="small" sx={{ color: "#EF4444" }} />
                </ListItemIcon>
                <ListItemText>Delete</ListItemText>
              </MenuItem>
            </>
          )}
        </Menu>
      </CardContent>
    </Card >
  );
}
