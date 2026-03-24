import React from "react";
import { useLocation, Link as RouterLink } from "react-router-dom";
import { Breadcrumbs, Link, Typography, useTheme, Box } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";

// Map path segments to readable names matching Sidebar titles and App routes
const BREADCRUMB_NAME_MAP = {
  dashboard: "Dashboard",

  // Core Setup
  companies: "Companies",
  profile: "Company Profile", // Mapped from /companies/profile
  "assign-staff": "Assign Staff", // Mapped from /companies/assign-staff
  departments: "Departments",
  "business-units": "Business Units",
  "staff-management": "Staff Management",
  history: "Upload History", // Mapped from /staff-management/history

  // Recruitment
  jobs: "Jobs Dashboard",
  create: "Create Job",
  "job-applications": "Job Applications",
  "aptitude-tests": "Aptitude Tests",
  "internal-vacancies": "Internal Openings",
  applicants: "Applicants",

  // Task Management
  "tasks-dashboard": "Task Dashboard",
  "assigned-tasks": "My Assigned Tasks",

  // Attendance
  "attendance-dashboard": "Attendance Dashboard",

  // Finance & Payroll
  "my-payslips": "My Payslips",
  "company-payslips": "Company Payslips",
  "payroll-dashboard": "Payroll Dashboard",
  "payroll-templates": "Payroll Templates",
  "process-payroll": "Process Payroll",
  "payroll-history": "Payroll History",
  "positions-deductions-allowances": "Positions, Deductions & Allowances",
  "loan-terms": "Loan Terms",
  "all-staff-loans": "All Staff Loans",
  "benefits-catalog": "Benefits Catalog",
  "performance-appraisals": "Performance & Appraisals",
  "payroll-settings": "Payroll Settings",
  "generated-payslips": "Generated Payslips",

  // Employee / Self Service
  "leave-applications": "Leave Applications",
  "my-trainings": "My Trainings",
  certifications: "Certifications",
  "loan-requests": "Loan Requests",
  "year-end-appraisal": "Year End Appraisal",
  "exit-interview": "Exit Interview",

  // Admin / Settings
  "reports-hub": "Reports Hub",
  "training-setup": "Training Setup",
  "certification-setup": "Certification Setup",
  "leave-settings": "Leave Settings",
  "leave-approvers": "Leave Approvers",
  "import-leave-records": "Import Leave Records",

  // Offboarding
  offboarding: "Offboarding",
};

const BreadcrumbsNav = () => {
  const location = useLocation();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  const pathnames = location.pathname.split("/").filter((x) => x);

  // Don't show breadcrumbs on the dashboard home
  if (pathnames.length === 0 || pathnames[0] === "dashboard") {
    return null;
  }

  return (
    // Wrapped in a Box to handle the sticky positioning and background
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 50, // INCREASED: Prevents page headers/content from overshadowing the breadcrumbs when scrolling down
        // Match the background of MainLayout to cover scrolling content
        backgroundColor: isDarkMode ? "#141b2d" : "#fcfcfc",
        // Add a subtle border or shadow to separate from content when scrolling
        borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e0e0e0"}`,
        width: "100%",
        pt: 2,
        pb: 2,
        px: { xs: 2, sm: 3, lg: 4 },
        mb: 3,
      }}
    >
      <Breadcrumbs
        separator={
          <NavigateNextIcon
            fontSize="small"
            sx={{ color: isDarkMode ? "#94a3b8" : "#cbd5e1" }}
          />
        }
        aria-label="breadcrumb"
      >
        <Link
          component={RouterLink}
          to="/dashboard"
          underline="hover"
          sx={{
            display: "flex",
            alignItems: "center",
            color: isDarkMode ? "#94a3b8" : "#64748b",
            fontWeight: 500,
            fontSize: "0.875rem",
            "&:hover": { color: "#137fec" },
          }}
        >
          Dashboard
        </Link>
        {pathnames.map((value, index) => {
          const last = index === pathnames.length - 1;
          const to = `/${pathnames.slice(0, index + 1).join("/")}`;

          // Determine display name
          let displayName = BREADCRUMB_NAME_MAP[value];
          let isClickable = true;

          // Fallback for IDs or unknown routes
          if (!displayName) {
            // If it looks like an ID (alphanumeric > 10 chars usually)
            if (value.length > 10 && /\d/.test(value)) {
              displayName = "Details";
              isClickable = false;
            } else {
              displayName = value
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase());
            }
          }

          if (last) {
            return (
              <Typography
                key={to}
                sx={{
                  color: isDarkMode ? "#f1f5f9" : "#0f172a",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                }}
              >
                {displayName}
              </Typography>
            );
          }

          return isClickable ? (
            <Link
              component={RouterLink}
              to={to}
              key={to}
              underline="hover"
              sx={{
                color: isDarkMode ? "#94a3b8" : "#64748b",
                fontWeight: 500,
                fontSize: "0.875rem",
                "&:hover": { color: "#137fec" },
              }}
            >
              {displayName}
            </Link>
          ) : (
            <Typography
              key={to}
              sx={{
                color: isDarkMode ? "#94a3b8" : "#64748b",
                fontWeight: 500,
                fontSize: "0.875rem",
              }}
            >
              {displayName}
            </Typography>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
};

export default BreadcrumbsNav;
