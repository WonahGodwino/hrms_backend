import React, { useEffect, useMemo, useState } from "react";
import { Box, Typography, Button, Snackbar, Alert, Slide } from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/context/AuthContext";
import OffboardingList from "./OffboardingList";
import StatsCards from "./StatsCards";
import { mockData } from "./mock/mockData";

export default function OffboardingHub({ records = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [snackbar, setSnackbar] = useState({ open: false, type: "success", message: "" });
  const { user } = useAuth();
  const role = (user?.role || '').toString();
  const useMock = true; // Toggle this to switch between mock data and real API data


  useEffect(() => {
    if (location.state?.snackbar) {
      setSnackbar({
        open: true,
        type: location.state.snackbar.type,
        message: location.state.snackbar.message
      });
      // Clear router state so it doesn't trigger again
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const isAdminOrHR = ["ADMIN", "HR"].includes(role);
  const isStaff = role === "STAFF";

  const dataSource = useMock ? mockData : records;

  const visibleRecords = useMemo(() => {
    if (!user) return [];
    // if (isStaff) {
    //   return dataSource.filter(r => r.employeeId === user.employeeId);
    // }
    return dataSource; // Admin/HR see all
  }, [dataSource, records, user]);

  const summary = {
    active: dataSource.filter(r =>
      ["initiated", "in-progress"].includes(r.status)
    ).length,

    pendingTasks: dataSource.reduce(
      (acc, r) =>
        acc + (r.tasks || []).filter(t => t.status === "pending").length,
      0
    ),

    completed: dataSource.filter(
      r => r.status === "completed"
    ).length,

    overdue: dataSource.reduce(
      (acc, r) =>
        acc +
        (r.tasks || []).filter(
          t =>
            t.status === "pending" &&
            new Date(t.dueDate) < new Date()
        ).length,
      0
    )
  };


  return (
    <Box sx={{ px: 4, pb: 2 }}>
      {/* Page Header */}
      <Box mb={4}>
        <Typography sx={{mb: 1}} variant="h4" fontWeight={800}>
          Offboarding Hub
        </Typography>
        {isAdminOrHR ? (
          <Typography color="text.secondary">
            Manage employee separations and offboarding workflows
          </Typography>
        ) : <Typography color="text.secondary">
          View your offboarding case status below
        </Typography>}
      </Box>

      {/* Create Button (Only HR/Admin) */}
      {isAdminOrHR && (
        <Box sx={{ mb: 4, display: "flex", flexDirection: "column", gap: 3 }}>

          {/* Summary Cards */}
          <StatsCards summary={summary} />

          <Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              sx={{ borderRadius: 3, px: 4 }}
              onClick={() => navigate("/offboarding/create")}
            >
              Start Off-Boarding
            </Button>
          </Box>
        </Box>
      )}

      {/* Records Table */}

      <OffboardingList
        records={visibleRecords}
      />

      {/* Success/Fail Popup state */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        slots={{ transition: Slide }}
        slotProps={{ transition: { direction: "left" } }}
      >
        <Alert
          severity={snackbar.type}
          variant="filled"
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          sx={{
            color: "#fff",
            mt: 15,
            borderRadius: 3,
            fontWeight: 500,
            px: 2,
            py: 1.2,
            minWidth: 320,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
