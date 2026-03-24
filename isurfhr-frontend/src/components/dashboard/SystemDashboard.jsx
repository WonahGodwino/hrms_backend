import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { useAuth } from "@/lib/context/AuthContext";
import { getDashboardStats } from "@/services/DashboardService";

// Import modularized views
import SuperAdminView from "./SuperAdminView";
import AdminView from "./AdminView";
import HRView from "./HRView";
import StaffView from "./StaffView";

/**
 * Maps raw API dashboard data to role-specific statistics.
 * @param {Object} raw - The raw stats object from the backend.
 * @param {string} role - The current user's role.
 * @returns {Object} Extracted stats tailored to the specific role.
 */
const mapDashboardStats = (raw = {}, role) => {
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
        latestPaymentAmount: raw.latestPayment?.amount ?? "—",
        nextPayDate: raw.nextPayDate ?? "—",
        leaveBalance: raw.leaveBalance ?? 0,
      };

    default:
      return {};
  }
};

/**
 * SystemDashboard serves as a dispatcher interface. It detects the user's role
 * from the AuthContext and renders the appropriate dashboard module securely.
 */
const SystemDashboard = () => {
  const { user } = useAuth();
  const role = (user?.role || "").toUpperCase();

  const [dashboardData, setDashboardData] = useState({
    loading: true,
    stats: {},
  });

  // Fetch and resolve the dashboard stats depending on the user's role
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
  }, [role]);

  // Dynamic router to render the correct view component based on Auth role.
  // Passing the 'user' prop to all views so they can access the DynamicGreeting.
  const renderContent = () => {
    switch (role) {
      case "SUPER_ADMIN":
      case "SUPERADMIN":
        return (
          <SuperAdminView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
            user={user}
          />
        );
      case "ADMIN":
        return (
          <AdminView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
            user={user}
          />
        );
      case "HR":
        return (
          <HRView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
            user={user}
          />
        );
      case "STAFF":
      case "EMPLOYEE":
      default:
        return (
          <StaffView
            stats={dashboardData.stats}
            loading={dashboardData.loading}
            user={user}
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
