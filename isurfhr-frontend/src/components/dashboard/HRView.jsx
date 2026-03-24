import React from "react";
import { Box, Typography, Grid, useTheme } from "@mui/material";
import { Users, FileText, UserCheck, Calendar, PlusCircle } from "lucide-react";
import {
  DashboardSpinner,
  KPICard,
  QuickActionItem,
} from "./DashboardSharedUI";
import WellnessWidget from "./WellnessWidget";
import DynamicGreeting from "./DynamicGreeting";

/**
 * View geared towards HR personnel managing a specific assigned company.
 * * @param {Object} props
 * @param {Object} props.stats - The statistics to display.
 * @param {boolean} props.loading - Loading state flag.
 * @param {Object} props.user - The currently authenticated user object.
 */
const HRView = ({ stats, loading, user }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (loading) return <DashboardSpinner />;

  const totalStaff = stats?.companyStaff ?? 0;
  const pendingPayslips = stats?.pendingPayslips ?? 0;
  const processedPayslips = stats?.processedPayslips ?? 0;
  const leaveRequests = stats?.leaveRequests ?? 0;

  return (
    <Box sx={{ maxWidth: 1280, mx: "auto", p: { xs: 2, md: 4 } }}>
      {/* Dynamic Header Section */}
      <Box
        sx={{
          mb: 5,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { md: "flex-end" },
          justifyContent: "space-between",
          gap: 3,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              color: isDark ? "#fff" : "#111827",
              mb: 1,
              fontSize: { xs: "2rem", md: "2.5rem" },
            }}
          >
            <DynamicGreeting user={user} />
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: isDark ? "#9ca3af" : "#6b7280",
              fontSize: "1.125rem",
              fontWeight: 500,
            }}
          >
            Operational overview and payroll status. Let's get things done! ✨
          </Typography>
        </Box>
      </Box>

      {/* Wellness Insight Widget */}
      <Box sx={{ mb: 3 }}>
        <WellnessWidget />
      </Box>

      {/* KPI Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Total Staff"
            value={totalStaff}
            icon={Users}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Pending Payslips"
            value={pendingPayslips}
            icon={FileText}
            color="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Processed (Oct)"
            value={processedPayslips}
            icon={UserCheck}
            color="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="Leave Requests"
            value={leaveRequests}
            icon={Calendar}
            color="secondary"
          />
        </Grid>
      </Grid>

      {/* Quick Actions Panel */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Quick Actions
        </Typography>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <QuickActionItem
              title="Run Payroll"
              subtext="Generate monthly slips"
              icon={FileText}
              onClick={() => {}}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <QuickActionItem
              title="Add Employee"
              subtext="Onboard new staff"
              icon={PlusCircle}
              onClick={() => {}}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <QuickActionItem
              title="Leave Calendar"
              subtext="View upcoming absence"
              icon={Calendar}
              onClick={() => {}}
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default HRView;
