import React, { useEffect, useState, useMemo } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  useTheme,
  Chip,
  Stack,
  alpha,
  CircularProgress,
  Tooltip,
  IconButton,
  Avatar,
} from "@mui/material";
import { useAuth } from "@/lib/context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Users,
  Shield,
  Building2,
  TrendingUp,
  Briefcase,
  Settings,
  UserCheck,
  ChevronRight,
  ArrowRight,
  Download,
  PlusCircle,
  Calendar,
  Coffee, // For Wellness Widget
  Heart, // For Wellness Widget
  Info,
  Bell,
  // Removed failing imports: Spa, Business, Receipt, Badge, Plus
} from "lucide-react";
import { getDashboardStats } from "@/services/DashboardService";

// --- Styled Components & Helpers ---
const DashboardSpinner = () => {
  return (
    <Box
      sx={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress size={48} thickness={4} />
    </Box>
  );
};

// ... (Keeping DashboardCard for other views if needed, or reusing)
const DashboardCard = ({ children, sx, onClick }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        height: "100%",
        borderRadius: 3,
        bgcolor: isDark ? "#1a2632" : "#ffffff", // Reverted to lighter dark shade
        border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
        boxShadow: isDark ? "none" : "0px 1px 3px rgba(0, 0, 0, 0.05)",
        transition: "all 0.2s ease-in-out",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick
          ? {
              boxShadow: "0px 4px 6px -1px rgba(0, 0, 0, 0.1)",
              borderColor: theme.palette.primary.main,
              transform: "translateY(-2px)",
            }
          : {},
        ...sx,
      }}
    >
      {children}
    </Card>
  );
};

const KPICard = ({ title, value, icon, trend, color = "primary", tooltip }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Explicitly assign to variable for JSX usage
  const Icon = icon;

  const cardContent = (
    <DashboardCard>
      <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: alpha(theme.palette[color].main, 0.1),
              color: theme.palette[color].main,
            }}
          >
            <Icon size={24} />
          </Box>
          {trend && (
            <Chip
              icon={<TrendingUp size={14} />}
              label={trend}
              size="small"
              sx={{
                bgcolor: isDark ? alpha("#22c55e", 0.2) : "#ecfdf5",
                color: isDark ? "#4ade80" : "#16a34a",
                fontWeight: 600,
                fontSize: "0.75rem",
                height: 24,
                "& .MuiChip-icon": { color: "inherit" },
              }}
            />
          )}
        </Box>
        <Box>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontWeight: 500, mb: 0.5 }}
          >
            {title}
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: "text.primary" }}
          >
            {value}
          </Typography>
        </Box>
      </CardContent>
    </DashboardCard>
  );

  return tooltip ? (
    <Tooltip title={tooltip} arrow placement="top">
      {cardContent}
    </Tooltip>
  ) : (
    cardContent
  );
};

const QuickActionItem = ({ title, subtext, icon, onClick }) => {
  const theme = useTheme();
  const Icon = icon;

  return (
    <DashboardCard onClick={onClick}>
      <Box
        sx={{
          p: 2.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={24} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {subtext}
            </Typography>
          </Box>
        </Box>
        <ChevronRight size={20} color={theme.palette.text.disabled} />
      </Box>
    </DashboardCard>
  );
};

const HeaderSection = ({ title, subtitle, actions }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: { xs: "column", md: "row" },
      justifyContent: "space-between",
      alignItems: { md: "center" },
      gap: 2,
      mb: 4,
    }}
  >
    <Box>
      <Typography
        variant="h3"
        sx={{
          fontWeight: 800,
          fontSize: { xs: "2rem", sm: "2.5rem" },
          color: "primary.main",
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="h6"
        sx={{ fontWeight: 400, color: "text.secondary", fontSize: "1.125rem" }}
      >
        {subtitle}
      </Typography>
    </Box>
    {actions && (
      <Stack direction="row" spacing={2}>
        {actions}
      </Stack>
    )}
  </Box>
);

const WellnessWidget = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Simple random tip logic
  const tips = [
    "Take a 5-minute break to stretch and hydrate! 💧",
    "Remember to rest your eyes every 20 minutes. 👀",
    "A short walk can boost your productivity by 30%. 🚶",
    "Stay hydrated! Your brain needs water to focus. 🥤",
  ];
  const randomTip = useMemo(
    () => tips[Math.floor(Math.random() * tips.length)],
    [],
  );

  return (
    <DashboardCard
      sx={{
        p: 2,
        bgcolor: isDark ? alpha(theme.palette.success.main, 0.15) : "#f0fdf4",
        border: `1px solid ${isDark ? alpha(theme.palette.success.main, 0.3) : "#bbf7d0"}`,
      }}
    >
      <Box display="flex" alignItems="center" gap={2}>
        <Box
          sx={{
            p: 1,
            borderRadius: "50%",
            bgcolor: isDark ? theme.palette.success.dark : "#dcfce7",
            color: isDark ? "#fff" : "#15803d",
          }}
        >
          <Coffee size={20} />
        </Box>
        <Box>
          <Typography
            variant="subtitle2"
            fontWeight={700}
            color={isDark ? "#fff" : "#166534"}
          >
            Wellness Tip
          </Typography>
          <Typography variant="caption" color={isDark ? "#cbd5e1" : "#15803d"}>
            {randomTip}
          </Typography>
        </Box>
      </Box>
    </DashboardCard>
  );
};

const formatAmount = (value) => {
  if (value === null || value === undefined) return "—";

  const num = Number(value);
  if (Number.isNaN(num)) return "—";

  return num.toLocaleString("en-US");
};

export const mapDashboardStats = (raw = {}, role) => {
  switch (role) {
    case "SUPER_ADMIN":
    case "SUPERADMIN":
      return {
        staffAccounts: raw.staffAccounts ?? 0,
        hrUsers: raw.hrUsers ?? 0,
        adminUsers: raw.adminUsers ?? 0,
        superAdmins: raw.superAdmins ?? 0,
        companiesOnboarded: raw.companiesOnboarded ?? 0,
        payslipsGenerated: raw.payslipsGenerated ?? 0,
      };

    case "ADMIN":
      return {
        companiesAssigned: raw.companiesAssigned ?? 0,
        totalStaff: raw.totalStaff ?? 0,
        payslipsThisMonth: raw.payslipsThisMonth ?? 0,
        hrUsers: raw.hrUsers ?? 0,
      };

    case "HR":
      return {
        companyStaff: raw.companyStaff ?? 0,
        pendingPayslips: raw.pendingPayslips ?? 0,
        processedPayslips: raw.processedPayslips ?? 0,
        leaveRequests: raw.leaveRequests ?? 0,
      };

    case "STAFF":
    case "EMPLOYEE":
      return {
        latestPaymentAmount: raw.latestPayment.amount ?? "—",
        nextPayDate: raw.nextPayDate ?? "—",
        leaveBalance: raw.leaveBalance ?? 0,
      };

    default:
      return {};
  }
};

// --- Role Specific Views ---

// 1. SUPER ADMIN VIEW
const SuperAdminView = ({ stats, loading }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isDark = theme.palette.mode === "dark";

  // ---- Derived role distribution (safe + defensive) ----
  const roleDistribution = useMemo(() => {
    const staff = stats?.staffAccounts ?? 0;
    const hr = stats?.hrUsers ?? 0;
    const admin = stats?.adminUsers ?? 0;
    const superAdmin = stats?.superAdmins ?? 0;

    const total = staff + hr + admin + superAdmin;

    return {
      total,
      items: [
        {
          label: "Staff",
          value: staff,
          color: theme.palette.primary.main,
        },
        {
          label: "HR",
          value: hr,
          color: "#60a5fa",
        },
        {
          label: "Admin",
          value: admin,
          color: "#93c5fd",
        },
        {
          label: "Super Admin",
          value: superAdmin,
          color: "#bfdbfe",
        },
      ].filter((i) => i.value > 0), // hide empty roles automatically
    };
  }, [stats, theme]);

  const majorityRole = roleDistribution.items.reduce(
    (max, curr) => (curr.value > max.value ? curr : max),
    roleDistribution.items[0],
  );

  if (loading) {
    return <DashboardSpinner />;
  }
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 4 } }}>
      <HeaderSection
        title="System Dashboard"
        subtitle="System overview and platform statistics"
      />

      {/* KPI Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Payslips Generated"
            value={stats?.payslipsGenerated ?? "0"} // still mock until backend sends it
            icon={FileText}
            // trend="+12%"
            color="primary"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Staff Accounts"
            value={stats?.staffAccounts ?? "0"}
            icon={Users}
            // trend="+5%"
            color="primary"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="HR Users"
            value={stats?.hrUsers ?? "0"} // mock until available
            icon={Briefcase}
            color="primary"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Admin Users"
            value={stats?.adminUsers ?? "0"} // mock
            icon={Shield}
            color="primary"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Super Admins"
            value={stats?.superAdmins ?? "0"} // mock
            icon={Shield}
            color="primary"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <KPICard
            title="Companies Onboarded"
            value={stats?.companiesOnboarded ?? "0"}
            icon={Building2}
            // trend="+2"
            color="primary"
          />
        </Grid>
      </Grid>

      {/* Middle Section */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Chart Card */}
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

              {/* Legend */}
              <Stack spacing={2} sx={{ minWidth: 90 }}>
                {roleDistribution.items.map((item) => {
                  const percent =
                    roleDistribution.total > 0
                      ? Math.round((item.value / roleDistribution.total) * 100)
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

      {/* Quick Actions */}
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

// 2. ADMIN VIEW (Multi-Company) - Replaced with New Design
const AdminView = ({ stats, loading, user }) => {
  if (loading) return <DashboardSpinner />;

  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Data
  const companies = stats?.companiesAssigned ?? 0;
  const staff = stats?.totalStaff ?? 0;
  const payslipsThisMonth = stats?.payslipsThisMonth ?? 0;
  const hrManagers = stats?.hrUsers ?? 0;

  // Dynamic Greeting Logic
  const getGreeting = () => {
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
    const icon = hour < 12 ? "☀️" : hour < 18 ? "🌤️" : "🌙";
    const name = user?.name || user?.firstName || "Admin"; // Use available name
    return `Good ${timeOfDay}, ${name} ${icon}`;
  };

  return (
    <Box sx={{ maxWidth: 1280, mx: "auto", p: { xs: 2, md: 4 } }}>
      {/* Header */}
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
            {getGreeting()}
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
        {/* Buttons removed as requested */}
      </Box>

      {/* Wellness Widget */}
      <Box
        sx={{
          width: "100%",
          bgcolor: isDark ? "rgba(30, 58, 138, 0.2)" : "#eff6ff",
          border: `1px solid ${isDark ? "rgba(30, 58, 138, 0.5)" : "#bfdbfe"}`,
          borderRadius: 3,
          p: 3,
          mb: 4,
          display: "flex",
          alignItems: "center",
          gap: 2.5,
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: "50%",
            bgcolor: isDark ? "rgba(59, 130, 246, 0.2)" : "#dbeafe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#3b82f6",
          }}
        >
          <Coffee size={24} />
        </Box>
        <Box>
          <Typography
            variant="subtitle2"
            sx={{
              color: "#3b82f6",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 700,
              fontSize: "0.75rem",
              mb: 0.5,
            }}
          >
            Wellness Tip
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: isDark ? "#e5e7eb" : "#1f2937",
              fontWeight: 600,
              fontSize: { xs: "1rem", md: "1.125rem" },
            }}
          >
            Take a 5-minute break to stretch. Your body will thank you!
          </Typography>
        </Box>
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 5 }}>
        {/* Companies */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff", // Reverted to lighter dark shade
              border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, // Adjusted border color
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

        {/* Total Staff */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff", // Reverted to lighter dark shade
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

        {/* Payslips */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff", // Reverted to lighter dark shade
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

        {/* HR Managers */}
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              p: 3,
              bgcolor: isDark ? "#1a2632" : "#ffffff", // Reverted to lighter dark shade
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

      {/* Recent Activity Section */}
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
            bgcolor: isDark ? "#1a2632" : "#ffffff", // Reverted to lighter dark shade
            border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, // Adjusted border
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

// 4. STAFF VIEW (Self Service)
const StaffView = ({ stats, loading }) => {
  if (loading) return <DashboardSpinner />;

  const latestPayment = formatAmount(stats?.latestPaymentAmount) ?? "—";
  const nextPayDate = "-"; //stats?.nextPayDate ?? '—';
  const leaveBalance = stats?.leaveBalance ?? 0;

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 4 } }}>
      <HeaderSection
        title="My Dashboard"
        subtitle="Your employment and payment overview"
      />
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

// --- Main Container ---
const SystemDashboard = () => {
  const { user } = useAuth();
  const role = (user?.role || "").toUpperCase();

  const [dashboardData, setDashboardData] = useState({
    loading: true,
  });

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const res = await getDashboardStats();
        const data = res?.data?.data ?? {};

        setDashboardData({
          stats: mapDashboardStats(data.stats, role),
          period: data.period,
          userRole: data.userRole,
          loading: false,
        });
      } catch {
        setDashboardData((d) => ({ ...d, loading: false }));
      }
    };

    loadDashboard();
  }, []);

  const renderContent = () => {
    switch (role) {
      case "SUPER_ADMIN":
      case "SUPERADMIN":
        return (
          <SuperAdminView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
          />
        );

      case "ADMIN":
        return (
          <AdminView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
            user={user} // Pass user prop to AdminView
          />
        );

      case "HR":
        return (
          <HRView stats={dashboardData.stats} loading={dashboardData.loading} />
        );

      case "STAFF":
      case "EMPLOYEE":
        return (
          <StaffView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
          />
        );

      default:
        return (
          <StaffView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
          />
        );
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {renderContent()}
    </Box>
  );
};

export default SystemDashboard;
