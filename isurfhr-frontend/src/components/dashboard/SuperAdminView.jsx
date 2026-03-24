import React, { useMemo } from "react";
import { Box, Typography, Grid, Stack, useTheme } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { FileText, Users, Shield, Building2, Briefcase } from "lucide-react";
import {
  DashboardSpinner,
  DashboardCard,
  KPICard,
  QuickActionItem,
} from "./DashboardSharedUI";
import WellnessWidget from "./WellnessWidget";
import DynamicGreeting from "./DynamicGreeting";

/**
 * Displays overall platform analytics and global user statistics for Super Admins.
 * * @param {Object} props
 * @param {Object} props.stats - The statistics to display.
 * @param {boolean} props.loading - Loading state flag.
 * @param {Object} props.user - The currently authenticated user object.
 */
const SuperAdminView = ({ stats, loading, user }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isDark = theme.palette.mode === "dark";

  // Derive data for the role distribution donut chart safely
  const roleDistribution = useMemo(() => {
    const staff = stats?.staffAccounts ?? 0;
    const hr = stats?.hrUsers ?? 0;
    const admin = stats?.adminUsers ?? 0;
    const superAdmin = stats?.superAdmins ?? 0;

    const total = staff + hr + admin + superAdmin;

    return {
      total,
      items: [
        { label: "Staff", value: staff, color: theme.palette.primary.main },
        { label: "HR", value: hr, color: "#60a5fa" },
        { label: "Admin", value: admin, color: "#93c5fd" },
        { label: "Super Admin", value: superAdmin, color: "#bfdbfe" },
      ].filter((i) => i.value > 0), // Filter out roles with 0 count
    };
  }, [stats, theme]);

  // Safely find the role with the maximum value for the center of the donut chart
  const majorityRole = roleDistribution.items.reduce(
    (max, curr) => (curr.value > max.value ? curr : max),
    roleDistribution.items[0] || { label: "—", value: 0 },
  );

  if (loading) return <DashboardSpinner />;

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
            System overview and platform statistics. Here's to a productive day!
            🚀
          </Typography>
        </Box>
      </Box>

      {/* Wellness Insight Widget */}
      <Box sx={{ mb: 3 }}>
        <WellnessWidget />
      </Box>

      {/* KPI Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Payslips Generated"
            value={stats?.payslipsGenerated ?? "0"}
            icon={FileText}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Staff Accounts"
            value={stats?.staffAccounts ?? "0"}
            icon={Users}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="HR Users"
            value={stats?.hrUsers ?? "0"}
            icon={Briefcase}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Admin Users"
            value={stats?.adminUsers ?? "0"}
            icon={Shield}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Super Admins"
            value={stats?.superAdmins ?? "0"}
            icon={Shield}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Companies Onboarded"
            value={stats?.companiesOnboarded ?? "0"}
            icon={Building2}
            color="primary"
          />
        </Grid>
      </Grid>

      {/* Analytics Section */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <DashboardCard sx={{ p: 3 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>
                User Role Distribution
              </Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography variant="h4" fontWeight={700}>
                  {roleDistribution.total.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Users
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              {/* CSS-only Donut Chart */}
              <Box
                sx={{
                  position: "relative",
                  width: 192,
                  height: 192,
                  borderRadius: "50%",
                  background: (() => {
                    if (!roleDistribution.total) return theme.palette.divider;
                    let start = 0;
                    return `conic-gradient(${roleDistribution.items
                      .map((item) => {
                        const percent =
                          (item.value / roleDistribution.total) * 100;
                        const from = start;
                        const to = start + percent;
                        start = to;
                        return `${item.color} ${from}% ${to}%`;
                      })
                      .join(", ")})`;
                  })(),
                }}
              >
                {/* Inner Donut Hole */}
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    m: "auto",
                    width: 128,
                    height: 128,
                    borderRadius: "50%",
                    bgcolor: isDark ? "#1a2632" : "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    Majority
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 700, color: "primary.main" }}
                  >
                    {majorityRole?.label ?? "—"}
                  </Typography>
                </Box>
              </Box>

              {/* Chart Legend */}
              <Stack spacing={2} sx={{ minWidth: 90 }}>
                {roleDistribution.items.map((item) => {
                  const percent =
                    roleDistribution.total > 0
                      ? Number(
                          ((item.value / roleDistribution.total) * 100).toFixed(
                            2,
                          ),
                        )
                      : 0;

                  return (
                    <Box
                      key={item.label}
                      sx={{ display: "flex", gap: 1.5, alignItems: "center" }}
                    >
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          bgcolor: item.color,
                        }}
                      />
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {item.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {percent}% ({item.value.toLocaleString()})
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </DashboardCard>
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
              title="View All Payslips"
              subtext="Access full history"
              icon={FileText}
              onClick={() => navigate("/company-payslips")}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <QuickActionItem
              title="Manage Staff"
              subtext="Add or edit roles"
              icon={Users}
              onClick={() => navigate("/staff-management")}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <QuickActionItem
              title="Manage Companies"
              subtext="Onboard new entities"
              icon={Building2}
              onClick={() => navigate("/companies")}
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default SuperAdminView;
