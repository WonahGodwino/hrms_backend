import React from "react";
import { Box, Typography, Grid, useTheme } from "@mui/material";
import { FileText, Calendar, Briefcase, Download, Users } from "lucide-react";
import {
  DashboardSpinner,
  KPICard,
  QuickActionItem,
} from "./DashboardSharedUI";
import WellnessWidget from "./WellnessWidget";
import DynamicGreeting from "./DynamicGreeting";

/**
 * Helper function to safely format numerical amounts.
 * @param {number|string} value - The numerical value to format.
 * @returns {string} Formatted string or a dash if invalid.
 */
const formatAmount = (value) => {
  if (value === null || value === undefined) return "—";

  const num = Number(value);
  if (Number.isNaN(num)) return "—";

  return num.toLocaleString("en-US");
};

/**
 * Individual employee dashboard for personal records, leave, and payments.
 * * @param {Object} props
 * @param {Object} props.stats - The statistics to display.
 * @param {boolean} props.loading - Loading state flag.
 * @param {Object} props.user - The currently authenticated user object.
 */
const StaffView = ({ stats, loading, user }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (loading) return <DashboardSpinner />;

  const latestPayment = formatAmount(stats?.latestPaymentAmount) ?? "—";
  const nextPayDate = "-"; //stats?.nextPayDate ?? '—';
  const leaveBalance = stats?.leaveBalance ?? 0;

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
            Your employment overview. Your next payday is in{" "}
            <Box component="span" sx={{ color: "#3b82f6", fontWeight: 700 }}>
              3 days
            </Box>{" "}
            💰
          </Typography>
        </Box>
      </Box>

      {/* Wellness Insight Widget */}
      <Box sx={{ mb: 3 }}>
        <WellnessWidget />
      </Box>

      {/* KPI Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <KPICard
            title="Latest Payment"
            value={latestPayment}
            icon={FileText}
            color="success"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KPICard
            title="Next Pay Date"
            value={nextPayDate}
            icon={Calendar}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KPICard
            title="Leave Balance"
            value={`${leaveBalance} Days`}
            icon={Briefcase}
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
              title="Download Slip"
              subtext="Get latest PDF"
              icon={Download}
              onClick={() => {}}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <QuickActionItem
              title="Request Leave"
              subtext="Submit new request"
              icon={Calendar}
              onClick={() => {}}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <QuickActionItem
              title="Update Profile"
              subtext="Edit personal info"
              icon={Users}
              onClick={() => {}}
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default StaffView;
