import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  Pagination,
  PaginationItem,
  useTheme,
  InputAdornment,
  Chip,
  IconButton,
  Tooltip,
  Avatar,
  alpha,
  Grid,
  Stack,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  Slide,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

// Import the checklist component
import OnboardingChecklist from "./onboarding-checklist/OnboardingChecklist";

// --- Mock Data for Onboarding New Hires ---
const MOCK_NEW_HIRES = [
  {
    id: 1,
    name: "Sarah Connor",
    department: "Engineering",
    role: "Senior Dev",
    startDate: "Oct 12, 2023",
    progress: 45,
    status: "Pre-boarding",
    issue:
      "Employee onboarding is delayed due to pending ID verification and contract approval.",
    issueCount: 3,
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBS83GYvrW9iyh67THWk-hv_RsEzJwxGedKlotOLqIrlPcAdYRu_kqM-6SdzlmpgukbZXIKTQYywg7VOJ2ilQimtdhnSu1rnaHJ--1_GvA2qb3RTIOf0BrUPl9L5tPf6eZnX0or3IddyvVjxA0whX8a4XgFtzkeNWXteJiiKPZT029QwNtjV_wVP1UGPrCs6N5jRi_qHa3HWyOjznK9Lo6t19aqHEfKoz0eHbCTfO2qDcNXaUzgtOmvnoqBBvkE9Lz3vkVfc2nNeTzp",
    isCritical: true,
  },
  {
    id: 2,
    name: "Alex Miller",
    department: "Design",
    role: "Product Designer",
    startDate: "Oct 15, 2023",
    progress: 82,
    status: "Ready for Activation",
    issue: null,
    issueCount: 0,
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBcoBhxjRpc3hXNe2dMgSEa1LclsfjmzcAUSPF7k6Kf3vQk-AOkhTsdhdj1cxnqCJv2MNYdby8nflCBkT_rjXxUgFoUy1S1t5UfazIXdZpKJA3j_M-EluRcGJ2sxVtAWHQK9ZbSC3V0cDKwnRDpXZap4eK-mv1QG9q-u9NG45BYd_RpFZesTQEQ3zz38n8AJV1GC1u4m2UImVz3MvwSBptXrcmZLMrHwXaxjOO815B0qxJU9MjyEskzisRHK1JvQyjNiDwN6YM1p7xf",
    isCritical: false,
  },
  {
    id: 3,
    name: "Riley King",
    department: "Marketing",
    role: "Growth Lead",
    startDate: "Oct 18, 2023",
    progress: 15,
    status: "IT Provisioning",
    issue: "Pending hardware assignment",
    issueCount: 1,
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBFptM_bprTAsbpn4YLchGlqsuW686QQScHSyiPla87v-eN8R-sxX2JElcQhoih_6ObbKzFTCFo4Mb8V7UxmbT6HZOerBck-nKtvAfy-aUnLF7LZkQs-N1e7bwQOEWE9zHo8XsgX5i3nUTcbruAlnNBjh0tiVjhIGZ02lAnarjBrD8byhS2TFTouSL3l_CKDc4V5uqQ7ViOTWZG0bWi5Fr6HEB04JqLWH3AGgm1H40N5rMhzP537H02ONxhA244C3kTXIepaNpYULxn",
    isCritical: false,
  },
];

// --- Mock Data for Activity Feed / Pending Approvals ---
const ACTION_ITEMS = [
  {
    id: 1,
    type: "document",
    desc: "Review John Doe's ID upload",
    time: "10 mins ago",
    urgent: false,
  },
  {
    id: 2,
    type: "warning",
    desc: "IT flagged a delay for Jane Smith's laptop provisioning",
    time: "1 hour ago",
    urgent: true,
  },
  {
    id: 3,
    type: "document",
    desc: "Approve background check results for Alex Miller",
    time: "2 hours ago",
    urgent: false,
  },
  {
    id: 4,
    type: "document",
    desc: "Sign offer addendum for Riley King",
    time: "3 hours ago",
    urgent: false,
  },
  {
    id: 5,
    type: "warning",
    desc: "Missing tax forms for newly onboarded marketing staff",
    time: "1 day ago",
    urgent: true,
  },
];

const FILTERS = [
  "All Statuses",
  "Pre-boarding",
  "IT Provisioning",
  "Ready for Activation",
];

// Full-screen Slide Transition for Checklist Modal
const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

/**
 * OnboardingCommandCenter Component
 * A dashboard for HR/Admins to manage and track the journey of newest team members.
 */
const OnboardingCommandCenter = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  // States
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All Statuses");
  const [page, setPage] = useState(1);
  const rowsPerPage = 5;

  // Sorting State
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  // Action Menu State
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedHireId, setSelectedHireId] = useState(null);
  const openMenu = Boolean(anchorEl);

  // Checklist Modal State
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);

  // Filter logic
  const filteredHires = useMemo(() => {
    return MOCK_NEW_HIRES.filter((hire) => {
      const matchesSearch =
        hire.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        hire.role.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        activeFilter === "All Statuses" || hire.status === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [searchTerm, activeFilter]);

  // Sorting logic applied after filtering
  const sortedHires = useMemo(() => {
    let sortableItems = [...filteredHires];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Parse dates for accurate chronological sorting
        if (sortConfig.key === "startDate") {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        }

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredHires, sortConfig]);

  // Pagination logic mapped to the newly sorted array
  const pageCount = Math.ceil(sortedHires.length / rowsPerPage) || 1;
  const displayedHires = sortedHires.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
    setPage(1); // Reset to first page on sort
  };

  // Menu Handlers
  const handleMenuOpen = (event, id) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedHireId(id);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleAction = (actionName) => {
    if (actionName === "View Full Checklist") {
      setIsChecklistOpen(true);
    } else {
      console.log(`${actionName} triggered for new hire ID: ${selectedHireId}`);
    }
    handleMenuClose();
  };

  // Static stats calculation for the summary donut chart
  const stats = {
    total: 18,
    preBoarding: 10,
    itProvisioning: 6,
    readyForActivation: 2,
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        fontFamily: '"Inter", sans-serif',
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* --- Sticky Header Area --- */}
      <Box
        component="header"
        sx={{
          bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
          borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <Box
          sx={{
            maxWidth: 1440,
            mx: "auto",
            px: { xs: 2, sm: 3, md: 4 },
            py: 3,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { xs: "flex-start", md: "center" },
              justifyContent: "space-between",
              gap: 3,
            }}
          >
            {/* Title & Description */}
            <Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  color: isDarkMode ? "#ffffff" : "#0f172a",
                  letterSpacing: "-0.025em",
                  mb: 0.5,
                }}
              >
                Onboarding Command Center
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
              >
                Manage and track the journey of your newest team members.
              </Typography>
            </Box>

            {/* Global Search Input */}
            <TextField
              placeholder="Search New Hires..."
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{
                width: { xs: "100%", md: "320px" },
                "& .MuiOutlinedInput-root": {
                  borderRadius: "9999px",
                  bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                  "& fieldset": {
                    borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                  },
                  "&:hover fieldset": {
                    borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                  },
                  "&.Mui-focused": {
                    bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                    boxShadow: `0 0 0 2px #137fec`,
                  },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon
                      sx={{ color: isDarkMode ? "#94a3b8" : "#9ca3af" }}
                    />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          {/* Quick Filters */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mt: 3,
              overflowX: "auto",
              "&::-webkit-scrollbar": { display: "none" }, // Hide scrollbar for clean look
            }}
          >
            {FILTERS.map((filter) => (
              <Chip
                key={filter}
                label={filter}
                clickable
                onClick={() => {
                  setActiveFilter(filter);
                  setPage(1); // Reset pagination on filter change
                }}
                sx={{
                  bgcolor:
                    activeFilter === filter
                      ? "#137fec"
                      : isDarkMode
                        ? "transparent"
                        : "#ffffff",
                  color:
                    activeFilter === filter
                      ? "#ffffff"
                      : isDarkMode
                        ? "#cbd5e1"
                        : "#475569",
                  fontWeight: 600,
                  border: `1px solid ${activeFilter === filter ? "#137fec" : isDarkMode ? "#475569" : "#e2e8f0"}`,
                  "&:hover": {
                    bgcolor:
                      activeFilter === filter
                        ? "#1170d0"
                        : isDarkMode
                          ? "rgba(255,255,255,0.05)"
                          : "#f8fafc",
                  },
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* --- Main Dashboard Layout --- */}
      <Box
        component="main"
        sx={{
          maxWidth: 1440,
          mx: "auto",
          px: { xs: 2, sm: 3, md: 4 },
          py: 4,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          width: "100%",
        }}
      >
        {/* Top Section: Master Data Table (Full Width) */}
        <Box sx={{ width: "100%" }}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
              overflow: "hidden",
              boxShadow: isDarkMode ? "none" : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
            }}
          >
            <TableContainer>
              <Table sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow
                    sx={{
                      bgcolor: isDarkMode ? "rgba(15, 23, 42, 0.5)" : "#f8fafc",
                    }}
                  >
                    {[
                      { label: "New Hire", sortKey: "name" },
                      { label: "Role", sortKey: "role" },
                      { label: "Start Date", sortKey: "startDate" },
                      { label: "Progress", sortKey: "progress" },
                      { label: "Blocking Issues", sortKey: "issueCount" },
                      { label: "Actions", sortKey: null },
                    ].map((head, idx) => (
                      <TableCell
                        key={head.label}
                        align={idx === 5 ? "right" : "left"}
                        onClick={() =>
                          head.sortKey ? handleSort(head.sortKey) : null
                        }
                        sx={{
                          py: 2,
                          px: 3,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: isDarkMode ? "#94a3b8" : "#64748b",
                          borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                          cursor: head.sortKey ? "pointer" : "default",
                          transition: "color 0.2s ease",
                          "&:hover": head.sortKey
                            ? { color: isDarkMode ? "#e2e8f0" : "#334155" }
                            : {},
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            justifyContent:
                              idx === 5 ? "flex-end" : "flex-start",
                          }}
                        >
                          {head.label}
                          {head.sortKey &&
                            (sortConfig.key === head.sortKey ? (
                              sortConfig.direction === "asc" ? (
                                <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
                              ) : (
                                <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
                              )
                            ) : (
                              <UnfoldMoreIcon
                                sx={{ fontSize: 16, opacity: 0.4 }}
                              />
                            ))}
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedHires.map((row) => (
                    <TableRow
                      key={row.id}
                      hover
                      onClick={() => {
                        setSelectedHireId(row.id);
                        setIsChecklistOpen(true);
                      }}
                      sx={{
                        cursor: "pointer",
                        borderLeft: row.isCritical
                          ? "4px solid #ef4444"
                          : "4px solid transparent",
                        bgcolor: row.isCritical
                          ? isDarkMode
                            ? alpha("#ef4444", 0.05)
                            : alpha("#ef4444", 0.05)
                          : "transparent",
                        "&:hover": {
                          bgcolor: row.isCritical
                            ? isDarkMode
                              ? alpha("#ef4444", 0.1)
                              : alpha("#ef4444", 0.1)
                            : isDarkMode
                              ? "rgba(30, 41, 59, 0.5)"
                              : "#f9fafb", // gray-50 equivalent
                        },
                        borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                        transition: "background-color 150ms",
                      }}
                    >
                      {/* Identity Cell */}
                      <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 2 }}
                        >
                          <Avatar
                            src={row.avatar}
                            sx={{ width: 40, height: 40 }}
                          />
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color: isDarkMode ? "#ffffff" : "#0f172a",
                              }}
                            >
                              {row.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                            >
                              {row.department}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Role Cell */}
                      <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                        <Typography
                          variant="body2"
                          sx={{ color: isDarkMode ? "#cbd5e1" : "#475569" }}
                        >
                          {row.role}
                        </Typography>
                      </TableCell>

                      {/* Start Date Cell */}
                      <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                        <Typography
                          variant="body2"
                          sx={{ color: isDarkMode ? "#cbd5e1" : "#475569" }}
                        >
                          {row.startDate}
                        </Typography>
                      </TableCell>

                      {/* Progress Bar Cell */}
                      <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                            maxWidth: "120px",
                          }}
                        >
                          <Box
                            sx={{
                              width: "100%",
                              height: 8,
                              bgcolor: isDarkMode ? "#334155" : "#e2e8f0",
                              borderRadius: 4,
                              overflow: "hidden",
                            }}
                          >
                            <Box
                              sx={{
                                width: `${row.progress}%`,
                                height: "100%",
                                bgcolor: "#137fec",
                                borderRadius: 4,
                              }}
                            />
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              color: isDarkMode ? "#94a3b8" : "#64748b",
                            }}
                          >
                            {row.progress}%
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Blocking Issues / Status Cell */}
                      <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                        {row.isCritical ? (
                          <Tooltip
                            title={
                              <Box sx={{ p: 0.5 }}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 700,
                                    display: "block",
                                    mb: 0.5,
                                    color: "#fca5a5",
                                  }}
                                >
                                  CRITICAL BLOCKER
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ lineHeight: 1.5 }}
                                >
                                  {row.issue}
                                </Typography>
                              </Box>
                            }
                            arrow
                            placement="top"
                            slotProps={{
                              tooltip: {
                                sx: {
                                  bgcolor: isDarkMode ? "#0f172a" : "#1e293b",
                                  color: "#f8fafc",
                                  boxShadow:
                                    "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
                                  border: `1px solid ${isDarkMode ? "#334155" : "#475569"}`,
                                  borderRadius: 2,
                                  maxWidth: 260,
                                  p: 1.5,
                                },
                              },
                              arrow: {
                                sx: {
                                  color: isDarkMode ? "#0f172a" : "#1e293b",
                                },
                              },
                            }}
                          >
                            <Chip
                              icon={
                                <WarningAmberIcon
                                  sx={{
                                    fontSize: "16px !important",
                                    color: "inherit",
                                  }}
                                />
                              }
                              label={`${row.issueCount} Overdue Task${row.issueCount > 1 ? "s" : ""}`}
                              size="small"
                              sx={{
                                bgcolor: isDarkMode
                                  ? alpha("#ef4444", 0.2)
                                  : "#fee2e2",
                                color: isDarkMode ? "#fca5a5" : "#991b1b",
                                fontWeight: 600,
                                border: `1px solid ${isDarkMode ? alpha("#ef4444", 0.3) : "#fecaca"}`,
                                "& .MuiChip-icon": { color: "inherit" },
                                cursor: "help",
                              }}
                            />
                          </Tooltip>
                        ) : row.issueCount > 0 ? (
                          <Tooltip
                            title={
                              <Box sx={{ p: 0.5 }}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 700,
                                    display: "block",
                                    mb: 0.5,
                                    color: "#fcd34d",
                                  }}
                                >
                                  PENDING ACTION
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ lineHeight: 1.5 }}
                                >
                                  {row.issue}
                                </Typography>
                              </Box>
                            }
                            arrow
                            placement="top"
                            slotProps={{
                              tooltip: {
                                sx: {
                                  bgcolor: isDarkMode ? "#0f172a" : "#1e293b",
                                  color: "#f8fafc",
                                  boxShadow:
                                    "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
                                  border: `1px solid ${isDarkMode ? "#334155" : "#475569"}`,
                                  borderRadius: 2,
                                  maxWidth: 260,
                                  p: 1.5,
                                },
                              },
                              arrow: {
                                sx: {
                                  color: isDarkMode ? "#0f172a" : "#1e293b",
                                },
                              },
                            }}
                          >
                            <Chip
                              icon={
                                <InfoOutlinedIcon
                                  sx={{
                                    fontSize: "16px !important",
                                    color: "inherit",
                                  }}
                                />
                              }
                              label={`${row.issueCount} Pending Action${row.issueCount > 1 ? "s" : ""}`}
                              size="small"
                              sx={{
                                bgcolor: isDarkMode
                                  ? alpha("#f59e0b", 0.2)
                                  : "#fef3c7",
                                color: isDarkMode ? "#fcd34d" : "#92400e",
                                fontWeight: 600,
                                border: `1px solid ${isDarkMode ? alpha("#f59e0b", 0.3) : "#fde68a"}`,
                                "& .MuiChip-icon": { color: "inherit" },
                                cursor: "help",
                              }}
                            />
                          </Tooltip>
                        ) : (
                          <Chip
                            label="On Track"
                            size="small"
                            sx={{
                              bgcolor: isDarkMode
                                ? alpha("#10b981", 0.2)
                                : "#d1fae5",
                              color: isDarkMode ? "#6ee7b7" : "#065f46",
                              fontWeight: 600,
                              border: `1px solid ${isDarkMode ? alpha("#10b981", 0.3) : "#a7f3d0"}`,
                            }}
                          />
                        )}
                      </TableCell>

                      {/* Actions Cell */}
                      <TableCell
                        align="right"
                        sx={{ py: 2, px: 3, borderBottom: "none" }}
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, row.id)}
                          sx={{
                            color: isDarkMode ? "#64748b" : "#9ca3af",
                            "&:hover": {
                              color: isDarkMode ? "#cbd5e1" : "#4b5563",
                            },
                          }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Empty State Fallback */}
                  {displayedHires.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                        <Typography
                          variant="body1"
                          sx={{ color: "text.secondary" }}
                        >
                          No onboarding records found matching your criteria.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Centered Pagination Footer */}
            {sortedHires.length > 0 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexDirection: { xs: "column", sm: "row" },
                  p: 2,
                  px: 3,
                  borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                  bgcolor: isDarkMode ? "rgba(15, 23, 42, 0.5)" : "#ffffff",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: isDarkMode ? "#94a3b8" : "#64748b",
                    mb: { xs: 2, sm: 0 },
                  }}
                >
                  Showing{" "}
                  <Box
                    component="span"
                    fontWeight="600"
                    color={isDarkMode ? "#fff" : "#0f172a"}
                  >
                    {(page - 1) * rowsPerPage + 1}
                  </Box>{" "}
                  to{" "}
                  <Box
                    component="span"
                    fontWeight="600"
                    color={isDarkMode ? "#fff" : "#0f172a"}
                  >
                    {Math.min(page * rowsPerPage, sortedHires.length)}
                  </Box>{" "}
                  of{" "}
                  <Box
                    component="span"
                    fontWeight="600"
                    color={isDarkMode ? "#fff" : "#0f172a"}
                  >
                    {sortedHires.length}
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
                          bgcolor: "#137fec",
                          color: "#ffffff",
                          fontWeight: 700,
                          "&:hover": { bgcolor: "#1170d0" },
                        },
                        "&:hover": {
                          bgcolor: isDarkMode ? "#334155" : "#e2e8f0",
                        },
                      }}
                    />
                  )}
                />
              </Box>
            )}
          </Paper>
        </Box>

        {/* Bottom Section: Split Columns for Analytics and Activity Feed */}
        <Grid container spacing={4}>
          {/* Left: Summary Panel (Donut Chart) */}
          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper
              elevation={0}
              sx={{
                p: 4,
                height: "100%",
                borderRadius: 3,
                border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: isDarkMode ? "#ffffff" : "#0f172a",
                  mb: 4,
                }}
              >
                Onboarding at a Glance
              </Typography>

              {/* SVG Donut Chart with Interactive Segments */}
              <Box sx={{ display: "flex", justifyContent: "center", mb: 5 }}>
                <Box sx={{ position: "relative", width: 160, height: 160 }}>
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 36 36"
                    style={{ transform: "rotate(-90deg)", overflow: "visible" }}
                  >
                    {/* Background Track */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      stroke={isDarkMode ? "#334155" : "#f1f5f9"}
                      strokeWidth="5"
                    />

                    {/* Data Segments */}
                    {(() => {
                      const preBoardingPct =
                        (stats.preBoarding / stats.total) * 100 || 0;
                      const itProvPct =
                        (stats.itProvisioning / stats.total) * 100 || 0;
                      const readyPct =
                        (stats.readyForActivation / stats.total) * 100 || 0;

                      const segments = [
                        {
                          id: "pre",
                          label: "Pre-boarding",
                          value: stats.preBoarding,
                          pct: preBoardingPct,
                          color: "#3b82f6",
                          offset: 0,
                        },
                        {
                          id: "it",
                          label: "IT Provisioning",
                          value: stats.itProvisioning,
                          pct: itProvPct,
                          color: "#f59e0b",
                          offset: preBoardingPct,
                        },
                        {
                          id: "ready",
                          label: "Ready for Activation",
                          value: stats.readyForActivation,
                          pct: readyPct,
                          color: "#10b981",
                          offset: preBoardingPct + itProvPct,
                        },
                      ];

                      return segments.map((seg) => {
                        if (seg.value === 0) return null; // Don't render empty segments

                        // Calculate middle point of segment to determine dynamic tooltip direction
                        const midPoint = seg.offset + seg.pct / 2;
                        let placement = "top";
                        if (midPoint >= 12.5 && midPoint < 37.5)
                          placement = "right";
                        else if (midPoint >= 37.5 && midPoint < 62.5)
                          placement = "bottom";
                        else if (midPoint >= 62.5 && midPoint < 87.5)
                          placement = "left";

                        return (
                          <Tooltip
                            key={seg.id}
                            title={
                              <Box sx={{ textAlign: "center" }}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 700, mb: 0.5 }}
                                >
                                  {seg.label}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ display: "block" }}
                                >
                                  {seg.value} Candidates
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ color: "rgba(255,255,255,0.7)" }}
                                >
                                  {seg.pct.toFixed(1)}% of total
                                </Typography>
                              </Box>
                            }
                            arrow
                            placement={placement}
                            slotProps={{
                              tooltip: {
                                sx: {
                                  bgcolor: isDarkMode ? "#0f172a" : "#1e293b",
                                  color: "#f8fafc",
                                  boxShadow:
                                    "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
                                  border: `1px solid ${isDarkMode ? "#334155" : "#475569"}`,
                                  borderRadius: 2,
                                  p: 1.5,
                                },
                              },
                              arrow: {
                                sx: {
                                  color: isDarkMode ? "#0f172a" : "#1e293b",
                                },
                              },
                            }}
                          >
                            <circle
                              cx="18"
                              cy="18"
                              r="15.9155"
                              fill="none"
                              stroke={seg.color}
                              strokeWidth="5"
                              strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                              strokeDashoffset="0"
                              transform={`rotate(${(seg.offset / 100) * 360} 18 18)`}
                              style={{
                                cursor: "pointer",
                                transition: "stroke-width 0.2s",
                                outline: "none",
                                pointerEvents: "stroke", // CRITICAL: Ensures hover only triggers exactly on the ring, not inside the transparent hole
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.strokeWidth = "7";
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.strokeWidth = "5";
                              }}
                            />
                          </Tooltip>
                        );
                      });
                    })()}
                  </svg>

                  {/* Inner Donut Hole */}
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      m: "auto",
                      width: 110,
                      height: 110,
                      borderRadius: "50%",
                      bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none", // Allows hover events to pass through to inner circle edges
                    }}
                  >
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 800,
                        color: isDarkMode ? "#ffffff" : "#0f172a",
                        lineHeight: 1,
                      }}
                    >
                      {stats.total}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: isDarkMode ? "#94a3b8" : "#9ca3af",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        mt: 0.5,
                        fontSize: "0.65rem",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Employees
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Chart Legend */}
              <Stack spacing={2.5} sx={{ mb: "auto" }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        bgcolor: "#3b82f6",
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        color: isDarkMode ? "#cbd5e1" : "#4b5563",
                        fontWeight: 500,
                      }}
                    >
                      Pre-boarding
                    </Typography>
                  </Box>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: isDarkMode ? "#ffffff" : "#0f172a",
                    }}
                  >
                    {stats.preBoarding}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        bgcolor: "#f59e0b",
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        color: isDarkMode ? "#cbd5e1" : "#4b5563",
                        fontWeight: 500,
                      }}
                    >
                      IT Provisioning
                    </Typography>
                  </Box>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: isDarkMode ? "#ffffff" : "#0f172a",
                    }}
                  >
                    {stats.itProvisioning}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        bgcolor: "#10b981",
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        color: isDarkMode ? "#cbd5e1" : "#4b5563",
                        fontWeight: 500,
                      }}
                    >
                      Ready for Activation
                    </Typography>
                  </Box>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: isDarkMode ? "#ffffff" : "#0f172a",
                    }}
                  >
                    {stats.readyForActivation}
                  </Typography>
                </Box>
              </Stack>

              {/* Quick Action CTA */}
              <Button
                variant="contained"
                fullWidth
                startIcon={<DownloadIcon size={18} />}
                sx={{
                  mt: 5,
                  bgcolor: isDarkMode ? "#ffffff" : "#0f172a",
                  color: isDarkMode ? "#0f172a" : "#ffffff",
                  fontWeight: 600,
                  textTransform: "none",
                  py: 1.5,
                  borderRadius: 2,
                  "&:hover": {
                    bgcolor: isDarkMode ? "#e2e8f0" : "#1e293b",
                  },
                }}
              >
                Download Monthly Report
              </Button>
            </Paper>
          </Grid>

          {/* Right: Requires Attention (Pending Approvals & Activity Feed) */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 3, md: 4 },
                borderRadius: 3,
                border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                maxHeight: { xs: "auto", lg: "500px" }, // Prevents it from getting absurdly long on large screens
              }}
            >
              <Box sx={{ mb: 3 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: isDarkMode ? "#ffffff" : "#0f172a",
                  }}
                >
                  Requires Attention
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b", mt: 0.5 }}
                >
                  Pending approvals and recent system alerts needing your
                  review.
                </Typography>
              </Box>

              <Box
                sx={{
                  flexGrow: 1,
                  overflowY: "auto",
                  pr: 1, // Padding to give space for the scrollbar
                  mr: -1, // Offset the padding so items stay aligned
                  "&::-webkit-scrollbar": { width: 6 },
                  "&::-webkit-scrollbar-track": { background: "transparent" },
                  "&::-webkit-scrollbar-thumb": {
                    backgroundColor: isDarkMode ? "#475569" : "#cbd5e1",
                    borderRadius: 3,
                  },
                }}
              >
                {ACTION_ITEMS.map((item, idx) => (
                  <Box
                    key={item.id}
                    sx={{
                      display: "flex",
                      alignItems: { xs: "flex-start", sm: "center" },
                      justifyContent: "space-between",
                      flexDirection: { xs: "column", sm: "row" },
                      gap: 2,
                      p: 2,
                      borderBottom:
                        idx === ACTION_ITEMS.length - 1
                          ? "none"
                          : `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                      transition: "background-color 0.2s",
                      "&:hover": {
                        bgcolor: isDarkMode
                          ? "rgba(255,255,255,0.03)"
                          : "#f8fafc",
                        borderRadius: 2,
                      },
                    }}
                  >
                    <Box
                      sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          bgcolor: item.urgent
                            ? isDarkMode
                              ? alpha("#ef4444", 0.2)
                              : "#fee2e2"
                            : isDarkMode
                              ? alpha("#137fec", 0.2)
                              : "#eff6ff",
                          color: item.urgent
                            ? isDarkMode
                              ? "#fca5a5"
                              : "#ef4444"
                            : isDarkMode
                              ? "#93c5fd"
                              : "#137fec",
                        }}
                      >
                        {item.type === "warning" ? (
                          <WarningAmberIcon fontSize="small" />
                        ) : (
                          <AssignmentOutlinedIcon fontSize="small" />
                        )}
                      </Box>
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: isDarkMode ? "#e2e8f0" : "#1e293b",
                            mb: 0.25,
                          }}
                        >
                          {item.desc}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                        >
                          {item.time}
                        </Typography>
                      </Box>
                    </Box>

                    <Button
                      variant="text"
                      size="small"
                      sx={{
                        textTransform: "none",
                        fontWeight: 600,
                        color: "#137fec",
                        minWidth: "auto",
                        alignSelf: { xs: "flex-end", sm: "center" },
                        "&:hover": {
                          bgcolor: "transparent",
                          textDecoration: "underline",
                        },
                      }}
                    >
                      Review
                    </Button>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Action Menu (Kebab) Dropdown */}
      <Menu
        anchorEl={anchorEl}
        open={openMenu}
        onClose={handleMenuClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: "visible",
            filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.15))",
            mt: 1.5,
            bgcolor: isDarkMode ? "#1A2632" : "#ffffff",
            color: isDarkMode ? "#e2e8f0" : "#1e293b",
            border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            borderRadius: 2,
            minWidth: 220,
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <MenuItem onClick={() => handleAction("View Full Checklist")}>
          <ListItemIcon>
            <AssignmentOutlinedIcon
              fontSize="small"
              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
            />
          </ListItemIcon>
          <ListItemText primary="View Full Checklist" />
        </MenuItem>

        <MenuItem onClick={() => handleAction("Resend Welcome Link")}>
          <ListItemIcon>
            <MailOutlinedIcon
              fontSize="small"
              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
            />
          </ListItemIcon>
          <ListItemText primary="Resend Welcome Link" />
        </MenuItem>

        <MenuItem onClick={() => handleAction("Send Nudge / Reminder")}>
          <ListItemIcon>
            <NotificationsActiveOutlinedIcon
              fontSize="small"
              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
            />
          </ListItemIcon>
          <ListItemText primary="Send Nudge / Reminder" />
        </MenuItem>

        <MenuItem onClick={() => handleAction("Edit Handoff Details")}>
          <ListItemIcon>
            <EditOutlinedIcon
              fontSize="small"
              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
            />
          </ListItemIcon>
          <ListItemText primary="Edit Handoff Details" />
        </MenuItem>

        <Divider
          sx={{ my: 0.5, borderColor: isDarkMode ? "#334155" : "#e5e7eb" }}
        />

        <MenuItem
          onClick={() => handleAction("Cancel Onboarding")}
          sx={{ color: "#ef4444" }}
        >
          <ListItemIcon>
            <CancelOutlinedIcon fontSize="small" sx={{ color: "#ef4444" }} />
          </ListItemIcon>
          <ListItemText primary="Cancel Onboarding" />
        </MenuItem>
      </Menu>

      {/* Full Screen Checklist Modal */}
      <Dialog
        fullScreen
        open={isChecklistOpen}
        onClose={() => setIsChecklistOpen(false)}
        TransitionComponent={Transition}
        PaperProps={{
          sx: {
            bgcolor: isDarkMode ? "#101922" : "#f8fafc",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: { xs: 2, md: 4 },
            py: 2,
            bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => setIsChecklistOpen(false)}
            sx={{
              color: isDarkMode ? "#cbd5e1" : "#475569",
              fontWeight: 600,
              textTransform: "none",
              "&:hover": {
                bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f1f5f9",
              },
            }}
          >
            Back to Command Center
          </Button>
        </Box>

        {/* Render the Checklist Component inside the Dialog */}
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          <OnboardingChecklist hireId={selectedHireId} />
        </Box>
      </Dialog>
    </Box>
  );
};

export default OnboardingCommandCenter;
