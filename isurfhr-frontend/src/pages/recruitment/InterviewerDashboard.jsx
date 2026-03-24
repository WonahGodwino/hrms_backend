import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  useTheme,
  alpha,
  Divider,
  Pagination,
  PaginationItem,
} from "@mui/material";

// Icons
import VideoCameraFrontIcon from "@mui/icons-material/VideoCameraFront";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

// Import Drawer
import EvaluationDrawer from "./EvaluationDrawer";

// --- Mock Data: Today's Schedule ---
const TODAY_SCHEDULE_DATA = [
  {
    id: 1,
    time: "09:00 AM",
    name: "Alex Johnson",
    initials: "AJ",
    position: "Senior Frontend Developer",
    location: "Microsoft Teams",
    type: "virtual",
    avatarColor: "blue",
  },
  {
    id: 2,
    time: "11:30 AM",
    name: "Sarah Kim",
    initials: "SK",
    position: "Product Designer",
    location: "Conference Room B",
    type: "in-person",
    avatarColor: "purple",
  },
  {
    id: 3,
    time: "02:00 PM",
    name: "Michael Park",
    initials: "MP",
    position: "Lead QA Engineer",
    location: "Microsoft Teams",
    type: "virtual",
    avatarColor: "emerald",
  },
  {
    id: 4,
    time: "04:30 PM",
    name: "Ryan Thompson",
    initials: "RT",
    position: "Full Stack Intern",
    location: "Microsoft Teams",
    type: "virtual",
    avatarColor: "orange",
  },
  {
    id: 5,
    time: "05:00 PM",
    name: "Jessica Miller",
    initials: "JM",
    position: "UX Researcher",
    location: "Conference Room A",
    type: "in-person",
    avatarColor: "purple",
  },
  {
    id: 6,
    time: "05:30 PM",
    name: "Omar Davis",
    initials: "OD",
    position: "Backend Engineer",
    location: "Microsoft Teams",
    type: "virtual",
    avatarColor: "blue",
  },
];

// --- Mock Data: This Week's Schedule ---
const WEEKLY_SCHEDULE_DATA = [
  {
    day: "Monday, Oct 14",
    interviews: [
      {
        id: 101,
        time: "09:30 AM",
        name: "Sarah Jenkins",
        position: "Senior Product Designer",
        initials: "SJ",
        avatarColor: "purple",
      },
      {
        id: 102,
        time: "02:00 PM",
        name: "David Chen",
        position: "Frontend Engineer",
        initials: "DC",
        avatarColor: "blue",
      },
    ],
  },
  {
    day: "Tuesday, Oct 15",
    interviews: [
      {
        id: 103,
        time: "11:00 AM",
        name: "Michael Rodriguez",
        position: "Marketing Lead",
        initials: "MR",
        avatarColor: "emerald",
      },
    ],
  },
  {
    day: "Wednesday, Oct 16",
    interviews: [], // Empty state day
  },
  {
    day: "Thursday, Oct 17",
    interviews: [
      {
        id: 104,
        time: "10:00 AM",
        name: "Emily Watson",
        position: "QA Specialist",
        initials: "EW",
        avatarColor: "orange",
      },
      {
        id: 105,
        time: "04:30 PM",
        name: "Robert Taylor",
        position: "DevOps Engineer",
        initials: "RT",
        avatarColor: "blue",
      },
    ],
  },
  {
    day: "Friday, Oct 18",
    interviews: [
      {
        id: 106,
        time: "09:00 AM",
        name: "Jessica Miller",
        position: "UX Researcher",
        initials: "JM",
        avatarColor: "purple",
      },
    ],
  },
];

/**
 * InterviewerDashboard Component
 * A specialized view for interviewers to track their daily/weekly schedules and candidate evaluations.
 */
const InterviewerDashboard = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  // State for the View Toggle (Today, Tomorrow, This Week)
  const [viewScope, setViewScope] = useState("today");

  // State for Pagination (Today/Tomorrow view)
  const [page, setPage] = useState(1);
  const rowsPerPage = 5;

  // Evaluation Drawer State
  const [isEvalDrawerOpen, setIsEvalDrawerOpen] = useState(false);
  const [evalCandidate, setEvalCandidate] = useState(null);

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleViewChange = (event, newView) => {
    if (newView !== null) {
      setViewScope(newView);
      setPage(1); // Reset pagination back to page 1 when tab changes
    }
  };

  // Open Drawer Handler
  const handleOpenEvaluation = (candidate) => {
    setEvalCandidate(candidate);
    setIsEvalDrawerOpen(true);
  };

  // Close Drawer Handler
  const handleCloseEvaluation = () => {
    setIsEvalDrawerOpen(false);
    setEvalCandidate(null);
  };

  // Helper to assign standard avatar colors compatible with light/dark modes
  const getAvatarStyles = (colorTheme) => {
    const maps = {
      blue: {
        bg: isDarkMode ? alpha("#3b82f6", 0.2) : "#dbeafe",
        color: isDarkMode ? "#93c5fd" : "#2563eb",
      },
      purple: {
        bg: isDarkMode ? alpha("#a855f7", 0.2) : "#f3e8ff",
        color: isDarkMode ? "#d8b4fe" : "#9333ea",
      },
      emerald: {
        bg: isDarkMode ? alpha("#10b981", 0.2) : "#d1fae5",
        color: isDarkMode ? "#6ee7b7" : "#059669",
      },
      orange: {
        bg: isDarkMode ? alpha("#f97316", 0.2) : "#ffedd5",
        color: isDarkMode ? "#fdba74" : "#ea580c",
      },
    };
    return maps[colorTheme] || maps.blue;
  };

  // Helper to display correct date based on view scope
  const getHeaderDate = () => {
    const date = new Date();
    if (viewScope === "tomorrow") {
      date.setDate(date.getDate() + 1);
    }
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  // Compute paginated data
  const pageCount = Math.ceil(TODAY_SCHEDULE_DATA.length / rowsPerPage) || 1;
  const displayedSchedule = TODAY_SCHEDULE_DATA.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDarkMode ? "#101922" : "#f8fafc",
        fontFamily: '"Inter", sans-serif',
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* --- Main Header Section --- */}
      <Box
        component="header"
        sx={{
          width: "100%",
          bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
          borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Box
          sx={{
            maxWidth: "1280px",
            mx: "auto",
            px: { xs: 2, sm: 3, lg: 4 },
            py: 3,
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                fontWeight: 800,
                color: isDarkMode ? "#ffffff" : "#0f172a",
                letterSpacing: "-0.025em",
              }}
            >
              Interviewer Dashboard
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b", mt: 0.5 }}
            >
              Manage your daily interview schedule and candidate evaluations.
            </Typography>
          </Box>

          {/* View Scope Toggle Controls */}
          <ToggleButtonGroup
            value={viewScope}
            exclusive
            onChange={handleViewChange}
            aria-label="schedule view toggle"
            sx={{
              bgcolor: isDarkMode ? "#0f172a" : "#f1f5f9",
              p: 0.5,
              borderRadius: 2,
              "& .MuiToggleButton-root": {
                border: "none",
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.875rem",
                color: isDarkMode ? "#94a3b8" : "#475569",
                py: 1,
                px: 3,
                transition: "all 0.2s ease",
                "&.Mui-selected": {
                  bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                  color: "#137fec",
                  boxShadow: isDarkMode ? "none" : "0 1px 3px rgba(0,0,0,0.1)",
                  "&:hover": {
                    bgcolor: isDarkMode ? "#334155" : "#ffffff",
                  },
                },
                "&:hover": {
                  bgcolor: isDarkMode
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.02)",
                },
              },
            }}
          >
            <ToggleButton value="today">Today</ToggleButton>
            <ToggleButton value="tomorrow">Tomorrow</ToggleButton>
            <ToggleButton value="week">This Week</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* --- Main Content Area --- */}
      <Box
        component="main"
        sx={{
          width: "100%",
          maxWidth: "1280px",
          px: { xs: 2, sm: 3, lg: 4 },
          py: 4,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* ========================================================================= */}
        {/* VIEW: TODAY / TOMORROW (Table Layout) */}
        {/* ========================================================================= */}
        {(viewScope === "today" || viewScope === "tomorrow") && (
          <>
            {/* Daily KPI Section */}
            <Grid container spacing={3}>
              {[
                {
                  label: "Interviews Today",
                  value: TODAY_SCHEDULE_DATA.length.toString(),
                  trend: "Full day",
                  trendColor: "#10b981",
                },
                {
                  label: "Pending Evaluations",
                  value: "2",
                  trend: "Priority",
                  trendColor: "#f59e0b",
                },
                {
                  label: "Completed This Week",
                  value: "12",
                  trend: "+15% vs last week",
                  trendColor: "#137fec",
                },
                {
                  label: "Average Score Given",
                  value: "78%",
                  trend: "Benchmark: 75%",
                  trendColor: isDarkMode ? "#94a3b8" : "#94a3b8",
                },
              ].map((kpi, index) => (
                <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={index}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      borderRadius: 3,
                      border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                      bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                      boxShadow: isDarkMode
                        ? "none"
                        : "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: isDarkMode ? "#94a3b8" : "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        display: "block",
                      }}
                    >
                      {kpi.label}
                    </Typography>
                    <Box
                      sx={{
                        mt: 1.5,
                        display: "flex",
                        alignItems: "baseline",
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 700,
                          color: isDarkMode ? "#ffffff" : "#0f172a",
                        }}
                      >
                        {kpi.value}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: kpi.trendColor }}
                      >
                        {kpi.trend}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* Schedule Table Section */}
            <Paper
              elevation={0}
              sx={{
                borderRadius: 3,
                border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                overflow: "hidden",
                boxShadow: isDarkMode
                  ? "none"
                  : "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
              }}
            >
              <Box
                sx={{
                  px: 3,
                  py: 2.5,
                  borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    color: isDarkMode ? "#ffffff" : "#0f172a",
                    fontSize: "1.125rem",
                  }}
                >
                  {viewScope === "today"
                    ? "Today's Interview Schedule"
                    : "Tomorrow's Schedule"}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: isDarkMode ? "#94a3b8" : "#64748b",
                    fontWeight: 500,
                  }}
                >
                  {getHeaderDate()}
                </Typography>
              </Box>

              <TableContainer>
                <Table sx={{ minWidth: 800 }}>
                  <TableHead
                    sx={{
                      bgcolor: isDarkMode ? "rgba(15, 23, 42, 0.5)" : "#f8fafc",
                    }}
                  >
                    <TableRow>
                      {[
                        "Time",
                        "Candidate",
                        "Position",
                        "Location/Platform",
                        "Actions",
                      ].map((head) => (
                        <TableCell
                          key={head}
                          align={head === "Actions" ? "right" : "left"}
                          sx={{
                            py: 2,
                            px: 3,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: isDarkMode ? "#94a3b8" : "#64748b",
                            borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                          }}
                        >
                          {head}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {displayedSchedule.map((row) => {
                      const avatarTheme = getAvatarStyles(row.avatarColor);
                      const isVirtual = row.type === "virtual";

                      return (
                        <TableRow
                          key={row.id}
                          sx={{
                            "&:hover": {
                              bgcolor: isDarkMode
                                ? "rgba(30, 41, 59, 0.5)"
                                : "#f8fafc",
                            },
                            transition: "background-color 150ms",
                          }}
                        >
                          <TableCell
                            sx={{
                              py: 2.5,
                              px: 3,
                              borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color: isDarkMode ? "#e2e8f0" : "#0f172a",
                              }}
                            >
                              {row.time}
                            </Typography>
                          </TableCell>
                          <TableCell
                            sx={{
                              py: 2.5,
                              px: 3,
                              borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                              }}
                            >
                              <Avatar
                                sx={{
                                  width: 32,
                                  height: 32,
                                  bgcolor: avatarTheme.bg,
                                  color: avatarTheme.color,
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                }}
                              >
                                {row.initials}
                              </Avatar>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  color: isDarkMode ? "#ffffff" : "#0f172a",
                                }}
                              >
                                {row.name}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell
                            sx={{
                              py: 2.5,
                              px: 3,
                              borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ color: isDarkMode ? "#cbd5e1" : "#475569" }}
                            >
                              {row.position}
                            </Typography>
                          </TableCell>
                          <TableCell
                            sx={{
                              py: 2.5,
                              px: 3,
                              borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                            }}
                          >
                            <Chip
                              icon={
                                isVirtual ? (
                                  <VideoCameraFrontIcon
                                    sx={{ fontSize: "16px !important" }}
                                  />
                                ) : (
                                  <MeetingRoomIcon
                                    sx={{ fontSize: "16px !important" }}
                                  />
                                )
                              }
                              label={row.location}
                              size="small"
                              sx={{
                                fontWeight: 500,
                                fontSize: "0.75rem",
                                bgcolor: isVirtual
                                  ? isDarkMode
                                    ? "rgba(59, 130, 246, 0.15)"
                                    : "#eff6ff"
                                  : isDarkMode
                                    ? "rgba(148, 163, 184, 0.15)"
                                    : "#f1f5f9",
                                color: isVirtual
                                  ? isDarkMode
                                    ? "#93c5fd"
                                    : "#1d4ed8"
                                  : isDarkMode
                                    ? "#cbd5e1"
                                    : "#334155",
                                "& .MuiChip-icon": { color: "inherit" },
                              }}
                            />
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              py: 2.5,
                              px: 3,
                              borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                gap: 1.5,
                                justifyContent: "flex-end",
                              }}
                            >
                              <Button
                                variant="outlined"
                                startIcon={<DescriptionOutlinedIcon />}
                                sx={{
                                  color: isDarkMode ? "#cbd5e1" : "#475569",
                                  borderColor: isDarkMode
                                    ? "#475569"
                                    : "#cbd5e1",
                                  textTransform: "none",
                                  fontWeight: 600,
                                  borderRadius: 2,
                                  py: 1,
                                  px: 2,
                                  "&:hover": {
                                    bgcolor: isDarkMode
                                      ? "rgba(255,255,255,0.05)"
                                      : "#f8fafc",
                                    borderColor: isDarkMode
                                      ? "#94a3b8"
                                      : "#94a3b8",
                                  },
                                }}
                              >
                                View CV
                              </Button>
                              <Button
                                variant="contained"
                                startIcon={<AssessmentIcon />}
                                onClick={() => handleOpenEvaluation(row)}
                                sx={{
                                  bgcolor: "#137fec",
                                  color: "#fff",
                                  textTransform: "none",
                                  fontWeight: 600,
                                  borderRadius: 2,
                                  py: 1,
                                  px: 2,
                                  boxShadow:
                                    "0 4px 6px -1px rgba(19, 127, 236, 0.2)",
                                  "&:hover": { bgcolor: "#1170d8" },
                                }}
                              >
                                Start Evaluation
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Centered Pagination Footer */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexDirection: { xs: "column", sm: "row" },
                  p: 2,
                  px: 3,
                  borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                  bgcolor: isDarkMode ? "rgba(15, 23, 42, 0.5)" : "#f8fafc",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: isDarkMode ? "#94a3b8" : "#64748b",
                    mb: { xs: 2, sm: 0 },
                    fontSize: "0.875rem",
                  }}
                >
                  Showing{" "}
                  <Box
                    component="span"
                    fontWeight="600"
                    color={isDarkMode ? "#fff" : "#0f172a"}
                  >
                    {TODAY_SCHEDULE_DATA.length > 0
                      ? (page - 1) * rowsPerPage + 1
                      : 0}
                  </Box>{" "}
                  to{" "}
                  <Box
                    component="span"
                    fontWeight="600"
                    color={isDarkMode ? "#fff" : "#0f172a"}
                  >
                    {Math.min(page * rowsPerPage, TODAY_SCHEDULE_DATA.length)}
                  </Box>{" "}
                  of{" "}
                  <Box
                    component="span"
                    fontWeight="600"
                    color={isDarkMode ? "#fff" : "#0f172a"}
                  >
                    {TODAY_SCHEDULE_DATA.length}
                  </Box>{" "}
                  results
                </Typography>

                <Pagination
                  count={pageCount}
                  page={page}
                  onChange={handlePageChange}
                  renderItem={(item) => (
                    <PaginationItem
                      slots={{
                        previous: ChevronLeftIcon,
                        next: ChevronRightIcon,
                      }}
                      {...item}
                      sx={{
                        borderRadius: 2,
                        width: 32,
                        height: 32,
                        margin: "0 2px",
                        color: isDarkMode ? "#94a3b8" : "#475569",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        "&.Mui-selected": {
                          backgroundColor: "#137fec",
                          color: "#ffffff",
                          fontWeight: 700,
                          "&:hover": {
                            backgroundColor: "#1170d0",
                          },
                        },
                        "&:hover": {
                          backgroundColor: isDarkMode ? "#334155" : "#e2e8f0",
                        },
                      }}
                    />
                  )}
                />
              </Box>
            </Paper>
          </>
        )}

        {/* ========================================================================= */}
        {/* VIEW: THIS WEEK (Grouped List Layout) */}
        {/* ========================================================================= */}
        {viewScope === "week" && (
          <Box sx={{ maxWidth: "1000px", mx: "auto", width: "100%" }}>
            {/* Weekly KPI Section */}
            <Grid container spacing={3} sx={{ mb: 5 }}>
              {[
                {
                  label: "Total Interviews This Week",
                  value: "12",
                  isPrimary: false,
                },
                { label: "Pending Evaluations", value: "4", isPrimary: true },
                {
                  label: "Time Spent Interviewing",
                  value: "18h",
                  isPrimary: false,
                },
              ].map((kpi, index) => (
                <Grid size={{ xs: 12, md: 4 }} key={index}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 3,
                      borderRadius: 3,
                      border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                      bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                      boxShadow: isDarkMode
                        ? "none"
                        : "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: isDarkMode ? "#94a3b8" : "#64748b",
                      }}
                    >
                      {kpi.label}
                    </Typography>
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 800,
                        color: kpi.isPrimary
                          ? "#137fec"
                          : isDarkMode
                            ? "#ffffff"
                            : "#0f172a",
                      }}
                    >
                      {kpi.value}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* Weekly Schedule Layout */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {WEEKLY_SCHEDULE_DATA.map((dayGroup, index) => (
                <Box
                  component="section"
                  key={index}
                  sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
                >
                  {/* Day Header with Line Separator */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        color: isDarkMode ? "#ffffff" : "#0f172a",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {dayGroup.day}
                    </Typography>
                    <Divider
                      sx={{
                        flexGrow: 1,
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      }}
                    />
                  </Box>

                  {/* Day's Interviews Container */}
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    {/* Empty State */}
                    {dayGroup.interviews.length === 0 ? (
                      <Box
                        sx={{
                          py: 6,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          border: `2px dashed ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                          borderRadius: 3,
                        }}
                      >
                        <EventBusyIcon
                          sx={{
                            fontSize: 36,
                            color: isDarkMode ? "#475569" : "#94a3b8",
                            mb: 1,
                          }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            color: isDarkMode ? "#64748b" : "#64748b",
                            fontWeight: 500,
                            fontStyle: "italic",
                          }}
                        >
                          No interviews scheduled
                        </Typography>
                      </Box>
                    ) : (
                      /* Interview Cards */
                      dayGroup.interviews.map((interview) => {
                        const avatarTheme = getAvatarStyles(
                          interview.avatarColor,
                        );
                        return (
                          <Paper
                            key={interview.id}
                            elevation={0}
                            sx={{
                              p: { xs: 2.5, md: 3 },
                              borderRadius: 3,
                              border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                              boxShadow: isDarkMode
                                ? "none"
                                : "0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                              display: "flex",
                              flexDirection: { xs: "column", md: "row" },
                              alignItems: { xs: "flex-start", md: "center" },
                              justifyContent: "space-between",
                              gap: 3,
                            }}
                          >
                            {/* Time & Candidate Info */}
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: { xs: 2, md: 3 },
                              }}
                            >
                              {/* Time Badge */}
                              <Box
                                sx={{
                                  bgcolor: isDarkMode
                                    ? "rgba(19, 127, 236, 0.15)"
                                    : "#eff6ff",
                                  color: "#137fec",
                                  px: 2,
                                  py: 1,
                                  borderRadius: 2,
                                  fontWeight: 700,
                                  fontSize: "0.875rem",
                                  minWidth: "90px",
                                  textAlign: "center",
                                }}
                              >
                                {interview.time}
                              </Box>

                              {/* Candidate Identity */}
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 2,
                                }}
                              >
                                <Avatar
                                  sx={{
                                    display: { xs: "none", sm: "flex" },
                                    width: 40,
                                    height: 40,
                                    bgcolor: avatarTheme.bg,
                                    color: avatarTheme.color,
                                    fontSize: "0.875rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {interview.initials}
                                </Avatar>
                                <Box>
                                  <Typography
                                    variant="body1"
                                    sx={{
                                      fontWeight: 700,
                                      color: isDarkMode ? "#ffffff" : "#0f172a",
                                    }}
                                  >
                                    {interview.name}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: isDarkMode ? "#94a3b8" : "#64748b",
                                      mt: 0.25,
                                    }}
                                  >
                                    {interview.position}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>

                            {/* Actions */}
                            <Box
                              sx={{
                                display: "flex",
                                gap: 2,
                                width: { xs: "100%", md: "auto" },
                              }}
                            >
                              <Button
                                variant="outlined"
                                sx={{
                                  flex: { xs: 1, md: "none" },
                                  color: isDarkMode ? "#cbd5e1" : "#475569",
                                  borderColor: isDarkMode
                                    ? "#475569"
                                    : "#cbd5e1",
                                  textTransform: "none",
                                  fontWeight: 600,
                                  borderRadius: 2,
                                  py: 1,
                                  "&:hover": {
                                    bgcolor: isDarkMode
                                      ? "rgba(255,255,255,0.05)"
                                      : "#f8fafc",
                                    borderColor: isDarkMode
                                      ? "#94a3b8"
                                      : "#94a3b8",
                                  },
                                }}
                              >
                                View CV
                              </Button>
                              <Button
                                variant="contained"
                                onClick={() => handleOpenEvaluation(interview)}
                                sx={{
                                  flex: { xs: 1, md: "none" },
                                  bgcolor: "#137fec",
                                  color: "#fff",
                                  textTransform: "none",
                                  fontWeight: 600,
                                  borderRadius: 2,
                                  py: 1,
                                  boxShadow:
                                    "0 4px 6px -1px rgba(19, 127, 236, 0.2)",
                                  "&:hover": { bgcolor: "#1170d8" },
                                }}
                              >
                                Start Evaluation
                              </Button>
                            </Box>
                          </Paper>
                        );
                      })
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* Render the Feedback/Evaluation Drawer */}
      <EvaluationDrawer
        open={isEvalDrawerOpen}
        onClose={handleCloseEvaluation}
        candidate={evalCandidate}
      />
    </Box>
  );
};

export default InterviewerDashboard;
