import React from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  Tooltip,
  IconButton,
  Stack,
  Avatar,
  Chip,
  useTheme,
} from "@mui/material";
import {
  FileText,
  Users,
  Building2,
  TrendingUp,
  Briefcase,
  Info,
} from "lucide-react";
import { DashboardSpinner } from "./DashboardSharedUI";
import WellnessWidget from "./WellnessWidget";
import DynamicGreeting from "./DynamicGreeting";

/**
 * Displays multi-company metrics tailored for organizational administrators.
 */
const AdminView = ({ stats, loading, user }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (loading) return <DashboardSpinner />;

  // Mapped Data
  const companies = stats?.companiesAssigned ?? 0;
  const staff = stats?.totalStaff ?? 0;
  const payslipsThisMonth = stats?.payslipsThisMonth ?? 0;
  const hrManagers = stats?.hrUsers ?? 0;

  return (
    <Box sx={{ maxWidth: 1280, mx: "auto", p: { xs: 2, md: 4 } }}>
      {/* Dynamic Header */}
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
            Your next payday is in{" "}
            <Box component="span" sx={{ color: "#3b82f6", fontWeight: 700 }}>
              3 days
            </Box>{" "}
            💰
          </Typography>
        </Box>
      </Box>

      {/* Wellness Insight */}
      <Box sx={{ mb: 3 }}>
        <WellnessWidget />
      </Box>

      {/* Advanced Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 5 }}>
        {/* Companies Stat */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff",
              border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`,
              transition: "border-color 0.2s",
              "&:hover": { borderColor: isDark ? "#374151" : "#d1d5db" },
              height: "100%",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: isDark ? "rgba(88, 28, 135, 0.3)" : "#f3e8ff",
                  color: isDark ? "#c084fc" : "#9333ea",
                  border: `1px solid ${isDark ? "rgba(88, 28, 135, 0.3)" : "#e9d5ff"}`,
                }}
              >
                <Building2 size={24} />
              </Box>
              <Tooltip
                title="Total number of companies assigned to you"
                arrow
                placement="top"
              >
                <IconButton size="small" sx={{ color: "text.secondary" }}>
                  <Info size={20} />
                </IconButton>
              </Tooltip>
            </Box>
            <Box>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", fontWeight: 500, mb: 0.5 }}
              >
                My Companies
              </Typography>
              <Typography
                variant="h4"
                sx={{ fontWeight: 700, color: isDark ? "#fff" : "#111827" }}
              >
                {companies}
              </Typography>
            </Box>
          </Card>
        </Grid>

        {/* Total Staff Stat */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff",
              border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`,
              transition: "border-color 0.2s",
              "&:hover": { borderColor: isDark ? "#374151" : "#d1d5db" },
              height: "100%",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: isDark ? "rgba(30, 58, 138, 0.3)" : "#dbeafe",
                  color: isDark ? "#60a5fa" : "#2563eb",
                  border: `1px solid ${isDark ? "rgba(30, 58, 138, 0.3)" : "#bfdbfe"}`,
                }}
              >
                <Users size={24} />
              </Box>
              <Tooltip
                title="Total staff across all your companies"
                arrow
                placement="top"
              >
                <IconButton size="small" sx={{ color: "text.secondary" }}>
                  <Info size={20} />
                </IconButton>
              </Tooltip>
            </Box>
            <Box>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", fontWeight: 500, mb: 0.5 }}
              >
                Total Staff
              </Typography>
              <Typography
                variant="h4"
                sx={{ fontWeight: 700, color: isDark ? "#fff" : "#111827" }}
              >
                {staff.toLocaleString()}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                mt: 2,
                color: isDark ? "#4ade80" : "#16a34a",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              <TrendingUp size={14} />
              <span>+4.5% vs last month</span>
            </Box>
          </Card>
        </Grid>

        {/* Payslips Stat */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff",
              border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`,
              transition: "border-color 0.2s",
              "&:hover": { borderColor: isDark ? "#374151" : "#d1d5db" },
              height: "100%",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: isDark ? "rgba(20, 83, 45, 0.3)" : "#dcfce7",
                  color: isDark ? "#4ade80" : "#16a34a",
                  border: `1px solid ${isDark ? "rgba(20, 83, 45, 0.3)" : "#bbf7d0"}`,
                }}
              >
                <FileText size={24} />
              </Box>
              <Tooltip
                title="Payslips generated this month"
                arrow
                placement="top"
              >
                <IconButton size="small" sx={{ color: "text.secondary" }}>
                  <Info size={20} />
                </IconButton>
              </Tooltip>
            </Box>
            <Box>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", fontWeight: 500, mb: 0.5 }}
              >
                Payslips (This Month)
              </Typography>
              <Typography
                variant="h4"
                sx={{ fontWeight: 700, color: isDark ? "#fff" : "#111827" }}
              >
                {payslipsThisMonth.toLocaleString()}
              </Typography>
            </Box>
          </Card>
        </Grid>

        {/* HR Managers Stat */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff",
              border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`,
              transition: "border-color 0.2s",
              "&:hover": { borderColor: isDark ? "#374151" : "#d1d5db" },
              height: "100%",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: isDark ? "rgba(124, 45, 18, 0.3)" : "#ffedd5",
                  color: isDark ? "#fb923c" : "#ea580c",
                  border: `1px solid ${isDark ? "rgba(124, 45, 18, 0.3)" : "#fed7aa"}`,
                }}
              >
                <Briefcase size={24} />
              </Box>
              <Tooltip title="Total HR managers" arrow placement="top">
                <IconButton size="small" sx={{ color: "text.secondary" }}>
                  <Info size={20} />
                </IconButton>
              </Tooltip>
            </Box>
            <Box>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", fontWeight: 500, mb: 0.5 }}
              >
                HR Managers
              </Typography>
              <Typography
                variant="h4"
                sx={{ fontWeight: 700, color: isDark ? "#fff" : "#111827" }}
              >
                {hrManagers}
              </Typography>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activity Log */}
      <Box>
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, color: isDark ? "#fff" : "#111827", mb: 3 }}
        >
          Recent Activity
        </Typography>
        <Card
          elevation={0}
          sx={{
            borderRadius: 3,
            bgcolor: isDark ? "#1a2632" : "#ffffff",
            border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`,
            overflow: "hidden",
          }}
        >
          <Stack
            divider={
              <Box
                component="div"
                sx={{
                  borderBottom: `1px solid ${isDark ? "#334155" : "#f3f4f6"}`,
                }}
              />
            }
          >
            {[
              {
                initial: "JD",
                name: "John Doe updated payroll settings",
                time: "2 hours ago",
                tag: "Payroll",
                color: "blue",
              },
              {
                initial: "AL",
                name: "Sarah Smith onboarded 3 new employees",
                time: "4 hours ago",
                tag: "Onboarding",
                color: "green",
              },
              {
                initial: "HR",
                name: "System generated monthly reports",
                time: "Yesterday at 5:00 PM",
                tag: "System",
                color: "purple",
              },
            ].map((activity, index) => (
              <Box
                key={index}
                sx={{
                  p: 2.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "background-color 0.2s",
                  "&:hover": {
                    bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f9fafb",
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      bgcolor: isDark
                        ? `rgba(${activity.color === "blue" ? "30, 58, 138" : activity.color === "green" ? "20, 83, 45" : "88, 28, 135"}, 0.3)`
                        : activity.color === "blue"
                          ? "#dbeafe"
                          : activity.color === "green"
                            ? "#dcfce7"
                            : "#f3e8ff",
                      color: isDark
                        ? activity.color === "blue"
                          ? "#60a5fa"
                          : activity.color === "green"
                            ? "#4ade80"
                            : "#c084fc"
                        : activity.color === "blue"
                          ? "#2563eb"
                          : activity.color === "green"
                            ? "#16a34a"
                            : "#9333ea",
                      border: `1px solid ${isDark ? `rgba(${activity.color === "blue" ? "30, 58, 138" : activity.color === "green" ? "20, 83, 45" : "88, 28, 135"}, 0.3)` : "transparent"}`,
                    }}
                  >
                    {activity.initial}
                  </Avatar>
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: isDark ? "#fff" : "#111827",
                      }}
                    >
                      {activity.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary" }}
                    >
                      {activity.time}
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={activity.tag}
                  size="small"
                  sx={{
                    borderRadius: 1,
                    height: 24,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    bgcolor: isDark
                      ? `rgba(${activity.color === "blue" ? "30, 58, 138" : activity.color === "green" ? "20, 83, 45" : "88, 28, 135"}, 0.3)`
                      : activity.color === "blue"
                        ? "#eff6ff"
                        : activity.color === "green"
                          ? "#f0fdf4"
                          : "#faf5ff",
                    color: isDark
                      ? activity.color === "blue"
                        ? "#93c5fd"
                        : activity.color === "green"
                          ? "#86efac"
                          : "#d8b4fe"
                      : activity.color === "blue"
                        ? "#1d4ed8"
                        : activity.color === "green"
                          ? "#15803d"
                          : "#7e22ce",
                    border: `1px solid ${
                      isDark
                        ? `rgba(${activity.color === "blue" ? "30, 58, 138" : activity.color === "green" ? "20, 83, 45" : "88, 28, 135"}, 0.5)`
                        : activity.color === "blue"
                          ? "#bfdbfe"
                          : activity.color === "green"
                            ? "#bbf7d0"
                            : "#e9d5ff"
                    }`,
                  }}
                />
              </Box>
            ))}
          </Stack>
        </Card>
      </Box>
    </Box>
  );
};

export default AdminView;
