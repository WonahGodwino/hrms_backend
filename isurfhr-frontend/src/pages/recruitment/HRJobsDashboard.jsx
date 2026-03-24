import React, { useState, useEffect } from "react";
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
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import PublicIcon from "@mui/icons-material/Public";
import BlockIcon from "@mui/icons-material/Block";
import ArticleIcon from "@mui/icons-material/Article";
import RestoreIcon from "@mui/icons-material/Restore"; // Added for Reopening jobs
import { useNavigate } from "react-router-dom";

// Import Modals
import BulkImportJobsModal from "./BulkImportJobsModal";
import CloseJobModal from "./CloseJobModal"; // New Import

// Import API Service
import { getJobs } from "@/services/RecruitmentService";

const HRJobsDashboard = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();

  // Data State
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const rowsPerPage = 5;
  const [totalCount, setTotalCount] = useState(0);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("All");

  // Context State from API
  const [accessibleCompanies, setAccessibleCompanies] = useState([]);
  const [canFilterByCompany, setCanFilterByCompany] = useState(false);

  // Menu State
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const openMenu = Boolean(anchorEl);

  // Modals State
  const [openBulkImport, setOpenBulkImport] = useState(false);
  const [openCloseJobModal, setOpenCloseJobModal] = useState(false); // Safety Modal State

  // Helper to safely access the active job data based on selection
  const activeJob = Array.isArray(jobs)
    ? jobs.find((j) => j.id === selectedJobId)
    : null;
  const isActiveJobClosed = activeJob?.status === "CLOSED";

  // Fetch Jobs Effect
  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          page,
          take: rowsPerPage,
          skip: (page - 1) * rowsPerPage,
          search: searchTerm || undefined,
          status: statusFilter !== "All" ? statusFilter : undefined,
          companyId: companyFilter !== "All" ? companyFilter : undefined,
        };
        const response = await getJobs(params);

        if (response.data && response.data.success) {
          const dataObj = response.data.data || {};
          const fetchedJobs = Array.isArray(dataObj.jobs) ? dataObj.jobs : [];

          setJobs(fetchedJobs);
          // Safely grab the total count from either pagination object or root
          setTotalCount(dataObj.pagination?.total || dataObj.total || 0);

          // Populate filter contexts from response structure
          if (dataObj.accessibleCompanies) {
            setAccessibleCompanies(dataObj.accessibleCompanies);
          }
          if (dataObj.userContext) {
            setCanFilterByCompany(dataObj.userContext.canFilterByCompany);
          }
        } else {
          setJobs([]);
          setTotalCount(0);
        }
      } catch (err) {
        console.error("Failed to fetch jobs:", err);
        setError("Unable to load job postings.");
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce API calls to prevent rapid firing on keystrokes
    const timeoutId = setTimeout(() => {
      fetchJobs();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [page, searchTerm, statusFilter, companyFilter]);

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handlePostNewJob = () => {
    navigate("/jobs/create");
  };

  const handleActionClick = (event, id) => {
    setAnchorEl(event.currentTarget);
    setSelectedJobId(id);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    // Intentionally do not wipe selectedJobId immediately so modals have access to the context.
  };

  // Bulk Import Handlers
  const handleOpenBulkImport = () => {
    setOpenBulkImport(true);
  };

  const handleCloseBulkImport = () => {
    setOpenBulkImport(false);
  };

  // Action Handlers
  const handleViewApplicants = () => {
    handleCloseMenu();
    navigate(`/jobs/${selectedJobId}/applicants`);
    setSelectedJobId(null);
  };

  const handleViewJobDetails = () => {
    handleCloseMenu();
    navigate(`/jobs/${selectedJobId}/details`);
    setSelectedJobId(null);
  };

  const handleEditJob = () => {
    handleCloseMenu();
    navigate("/jobs/create");
    setSelectedJobId(null);
  };

  const handleViewPublicPage = () => {
    handleCloseMenu();
    window.open(`/careers/${selectedJobId}`, "_blank");
    setSelectedJobId(null);
  };

  // Safe Job Closing/Opening Handlers
  const handleInitiateCloseJob = () => {
    handleCloseMenu();
    setOpenCloseJobModal(true);
  };

  const handleConfirmCloseJob = () => {
    // Update local state to immediately reflect the 'closed' visual status
    setJobs((prevJobs) =>
      prevJobs.map((job) =>
        job.id === selectedJobId ? { ...job, status: "CLOSED" } : job,
      ),
    );
    setOpenCloseJobModal(false);
    setSelectedJobId(null);
    // TODO: Connect actual close job API endpoint here
  };

  const handleOpenJobClick = () => {
    // Re-activates a closed job
    setJobs((prevJobs) =>
      prevJobs.map((job) =>
        job.id === selectedJobId ? { ...job, status: "ACTIVE" } : job,
      ),
    );
    handleCloseMenu();
    setSelectedJobId(null);
    // TODO: Connect actual activate job API endpoint here
  };

  const handleDeleteJob = () => {
    handleCloseMenu();
    console.log(`Deleting job ${selectedJobId}`);
    setSelectedJobId(null);
  };

  // Helper for status styling
  const getStatusChipProps = (status) => {
    const normalized = (status || "").toLowerCase();
    if (normalized === "active" || normalized === "open") {
      return {
        bgcolor: isDarkMode ? "rgba(16, 185, 129, 0.1)" : "#d1fae5",
        color: isDarkMode ? "#34d399" : "#047857",
        border: `1px solid ${isDarkMode ? "transparent" : "#a7f3d0"}`,
      };
    }
    if (normalized === "paused") {
      return {
        bgcolor: isDarkMode ? "#374151" : "#f1f5f9",
        color: isDarkMode ? "#cbd5e1" : "#475569",
        border: "1px solid transparent",
      };
    }
    if (normalized === "draft") {
      return {
        bgcolor: isDarkMode ? "rgba(245, 158, 11, 0.1)" : "#fef3c7",
        color: isDarkMode ? "#fbbf24" : "#b45309",
        border: `1px solid ${isDarkMode ? "transparent" : "#fde68a"}`,
      };
    }
    if (normalized === "expired") {
      return {
        bgcolor: isDarkMode ? "rgba(239, 68, 68, 0.1)" : "#fee2e2",
        color: isDarkMode ? "#f87171" : "#b91c1c",
        border: `1px solid ${isDarkMode ? "transparent" : "#fecaca"}`,
      };
    }
    if (normalized === "closed") {
      // Clean, muted grey-out for fully closed/removed jobs
      return {
        bgcolor: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
        color: isDarkMode ? "#94a3b8" : "#64748b",
        border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
      };
    }
    return {
      bgcolor: "default",
      color: "default",
      border: "1px solid transparent",
    };
  };

  // Format Date Helper
  const formatDate = (dateString) => {
    if (!dateString) return "--";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const safeJobs = Array.isArray(jobs) ? jobs : [];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        p: { xs: 2, sm: 3, lg: 4 },
        backgroundColor: isDarkMode ? "#101922" : "#f6f7f8",
        fontFamily: '"Inter", sans-serif',
      }}
    >
      <Box sx={{ width: "100%", maxWidth: "1200px" }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            bgcolor: isDarkMode ? "#1A2632" : "#ffffff",
            overflow: "hidden",
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
          }}
        >
          {/* Page Heading */}
          <Box
            sx={{
              p: { xs: 3, md: 4 },
              borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                justifyContent: "space-between",
                alignItems: { xs: "flex-start", md: "center" },
                gap: 2,
              }}
            >
              <Box>
                <Typography
                  variant="h4"
                  component="h2"
                  sx={{
                    fontWeight: 900,
                    fontSize: "1.875rem",
                    color: isDarkMode ? "#ffffff" : "#0f172a",
                    letterSpacing: "-0.025em",
                    mb: 0.5,
                  }}
                >
                  Jobs Management
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: isDarkMode ? "#94a3b8" : "#64748b",
                    fontSize: "1rem",
                  }}
                >
                  Create, manage, and track job postings
                </Typography>
              </Box>

              <Box sx={{ display: "flex", gap: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  onClick={handleOpenBulkImport}
                  sx={{
                    borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                    color: isDarkMode ? "#e2e8f0" : "#475569",
                    fontWeight: 600,
                    textTransform: "none",
                    borderRadius: "9999px",
                    height: 48,
                    px: 3,
                    "&:hover": {
                      borderColor: isDarkMode ? "#94a3b8" : "#94a3b8",
                      bgcolor: isDarkMode
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(0, 0, 0, 0.05)",
                    },
                  }}
                >
                  Import Jobs
                </Button>

                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handlePostNewJob}
                  sx={{
                    bgcolor: "#137fec",
                    color: "#fff",
                    fontWeight: 700,
                    textTransform: "none",
                    borderRadius: "9999px",
                    height: 48,
                    px: 3,
                    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                    "&:hover": { bgcolor: "#1d4ed8" },
                  }}
                >
                  Post New Job
                </Button>
              </Box>
            </Box>
          </Box>

          {/* Toolbar */}
          <Box
            sx={{
              px: { xs: 3, md: 4 },
              py: 2,
              bgcolor: isDarkMode ? "#1A2632" : "#ffffff",
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                justifyContent: "space-between",
                alignItems: "center",
                gap: 2,
              }}
            >
              {/* Search */}
              <TextField
                placeholder="Search Jobs"
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{
                  width: { xs: "100%", sm: "320px" },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "9999px",
                    bgcolor: isDarkMode ? "#1e293b" : "#f8fafc",
                    "& fieldset": { border: "none" },
                    "&:hover fieldset": { border: "none" },
                    "&.Mui-focused": {
                      bgcolor: isDarkMode ? "#0f172a" : "#ffffff",
                      boxShadow: `0 0 0 2px ${"#137fec"}`,
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

              {/* Dynamic Filters */}
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  width: { xs: "100%", sm: "auto" },
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                {/* Render Company Filter only if authorized and multiple companies exist */}
                {canFilterByCompany && accessibleCompanies.length > 0 && (
                  <TextField
                    select
                    size="small"
                    value={companyFilter}
                    onChange={(e) => {
                      setCompanyFilter(e.target.value);
                      setPage(1); // Reset to page 1 on filter change
                    }}
                    sx={{
                      minWidth: "160px",
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDarkMode ? "#1e293b" : "#f8fafc",
                        "& fieldset": {
                          borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                        },
                        "&:hover fieldset": {
                          borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "#137fec",
                          borderWidth: 1,
                        },
                      },
                    }}
                  >
                    <MenuItem value="All">All Companies</MenuItem>
                    {accessibleCompanies.map((company) => (
                      <MenuItem key={company.id} value={company.id}>
                        {company.companyName}
                      </MenuItem>
                    ))}
                  </TextField>
                )}

                <TextField
                  select
                  size="small"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1); // Reset to page 1 on filter change
                  }}
                  sx={{
                    minWidth: "140px",
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDarkMode ? "#1e293b" : "#f8fafc",
                      "& fieldset": {
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      },
                      "&:hover fieldset": {
                        borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 1,
                      },
                    },
                  }}
                >
                  <MenuItem value="All">All Statuses</MenuItem>
                  <MenuItem value="ACTIVE">Active</MenuItem>
                  <MenuItem value="DRAFT">Draft</MenuItem>
                  <MenuItem value="CLOSED">Closed</MenuItem>
                </TextField>
              </Box>
            </Box>
          </Box>

          {/* Table */}
          <TableContainer>
            <Table sx={{ minWidth: 800 }}>
              <TableHead>
                <TableRow
                  sx={{
                    bgcolor: isDarkMode ? "rgba(30, 41, 59, 0.5)" : "#f8fafc",
                    borderTop: `1px solid ${
                      isDarkMode ? "#334155" : "#e2e8f0"
                    }`,
                    borderBottom: `1px solid ${
                      isDarkMode ? "#334155" : "#e2e8f0"
                    }`,
                  }}
                >
                  <TableCell
                    sx={{
                      py: 2,
                      px: 3,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: isDarkMode ? "#94a3b8" : "#64748b",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        cursor: "pointer",
                        "&:hover": {
                          color: isDarkMode ? "#e2e8f0" : "#334155",
                        },
                      }}
                    >
                      Job Title <UnfoldMoreIcon sx={{ fontSize: 16 }} />
                    </Box>
                  </TableCell>
                  {[
                    "Position",
                    "Department",
                    "Applicants",
                    "Expiry Date",
                    "Status",
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
                      }}
                    >
                      {head}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={30} />
                      <Typography
                        variant="body2"
                        sx={{ mt: 1, color: "text.secondary" }}
                      >
                        Loading job postings...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Alert
                        severity="error"
                        sx={{ maxWidth: 400, mx: "auto" }}
                      >
                        {error}
                      </Alert>
                    </TableCell>
                  </TableRow>
                ) : safeJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Typography
                        variant="body1"
                        sx={{ color: "text.secondary" }}
                      >
                        No job postings found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  safeJobs.map((row) => {
                    const isClosedRow = row.status === "CLOSED";

                    return (
                      <TableRow
                        key={row.id}
                        sx={{
                          "&:hover": {
                            bgcolor: isDarkMode
                              ? "rgba(30, 41, 59, 0.5)"
                              : "#f8fafc",
                          },
                          borderBottom: `1px solid ${
                            isDarkMode ? "#334155" : "#f1f5f9"
                          }`,
                          transition: "all 150ms",
                          // Gray out the entire row effectively if the job is closed
                          opacity: isClosedRow ? 0.6 : 1,
                          bgcolor: isClosedRow
                            ? isDarkMode
                              ? "rgba(255,255,255,0.02)"
                              : "#f8fafc"
                            : "inherit",
                        }}
                      >
                        <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color: isDarkMode ? "#fff" : "#0f172a",
                              }}
                            >
                              {row.title}
                            </Typography>
                            {/* Mobile View Fallback */}
                            <Typography
                              variant="caption"
                              sx={{
                                display: { xs: "block", md: "none" },
                                color: isDarkMode ? "#94a3b8" : "#64748b",
                                mt: 0.5,
                              }}
                            >
                              {row.position} • {row.department}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell
                          sx={{
                            py: 2,
                            px: 3,
                            borderBottom: "none",
                            color: isDarkMode ? "#cbd5e1" : "#475569",
                            fontSize: "0.875rem",
                          }}
                        >
                          {row.position || "--"}
                        </TableCell>
                        <TableCell
                          sx={{
                            py: 2,
                            px: 3,
                            borderBottom: "none",
                            color: isDarkMode ? "#cbd5e1" : "#475569",
                            fontSize: "0.875rem",
                          }}
                        >
                          {row.department || "--"}
                        </TableCell>
                        <TableCell
                          sx={{
                            py: 2,
                            px: 3,
                            borderBottom: "none",
                            color: isDarkMode ? "#fff" : "#0f172a",
                            fontSize: "0.875rem",
                            fontWeight: 700,
                          }}
                        >
                          {row.applicationCount ??
                            row._count?.applications ??
                            0}
                        </TableCell>
                        <TableCell
                          sx={{
                            py: 2,
                            px: 3,
                            borderBottom: "none",
                            color: isDarkMode ? "#cbd5e1" : "#475569",
                            fontSize: "0.875rem",
                          }}
                        >
                          {row.expirationDate
                            ? formatDate(row.expirationDate)
                            : "--"}
                        </TableCell>
                        <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                          <Chip
                            label={row.status}
                            size="small"
                            sx={{
                              height: 24,
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              ...getStatusChipProps(row.status),
                            }}
                          />
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ py: 2, px: 3, borderBottom: "none" }}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => handleActionClick(e, row.id)}
                            sx={{
                              color: isDarkMode ? "#94a3b8" : "#94a3b8",
                              "&:hover": {
                                color: "#137fec",
                                bgcolor: isDarkMode
                                  ? "rgba(30, 41, 59, 0.5)"
                                  : "#f1f5f9",
                              },
                            }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Centered Pagination */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexDirection: { xs: "column", sm: "row" },
              p: 2,
              px: 3,
              borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "rgba(30, 41, 59, 0.3)" : "#f8fafc",
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
                {safeJobs.length > 0 ? (page - 1) * rowsPerPage + 1 : 0}
              </Box>{" "}
              to{" "}
              <Box
                component="span"
                fontWeight="600"
                color={isDarkMode ? "#fff" : "#0f172a"}
              >
                {safeJobs.length > 0
                  ? (page - 1) * rowsPerPage + safeJobs.length
                  : 0}
              </Box>{" "}
              of{" "}
              <Box
                component="span"
                fontWeight="600"
                color={isDarkMode ? "#fff" : "#0f172a"}
              >
                {totalCount}
              </Box>{" "}
              results
            </Typography>

            <Pagination
              count={Math.ceil(totalCount / rowsPerPage) || 1}
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

        {/* Actions Menu */}
        <Menu
          anchorEl={anchorEl}
          open={openMenu}
          onClose={handleCloseMenu}
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
              minWidth: 180,
            },
          }}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        >
          {/* Conditionally Render elements based on activeJob status */}
          {!isActiveJobClosed && (
            <MenuItem onClick={handleViewApplicants}>
              <ListItemIcon>
                <VisibilityIcon
                  fontSize="small"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                />
              </ListItemIcon>
              <ListItemText primary="View Applicants" />
            </MenuItem>
          )}

          <MenuItem onClick={handleViewJobDetails}>
            <ListItemIcon>
              <ArticleIcon
                fontSize="small"
                sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
              />
            </ListItemIcon>
            <ListItemText primary="View Job Details" />
          </MenuItem>

          <MenuItem onClick={handleEditJob}>
            <ListItemIcon>
              <EditIcon
                fontSize="small"
                sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
              />
            </ListItemIcon>
            <ListItemText primary="Edit Job" />
          </MenuItem>

          {!isActiveJobClosed && (
            <MenuItem onClick={handleViewPublicPage}>
              <ListItemIcon>
                <PublicIcon
                  fontSize="small"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                />
              </ListItemIcon>
              <ListItemText primary="View Public Page" />
            </MenuItem>
          )}

          {/* Toggle between Close and Reopen */}
          {isActiveJobClosed ? (
            <MenuItem onClick={handleOpenJobClick}>
              <ListItemIcon>
                <RestoreIcon
                  fontSize="small"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                />
              </ListItemIcon>
              <ListItemText primary="Open Job" />
            </MenuItem>
          ) : (
            <MenuItem onClick={handleInitiateCloseJob}>
              <ListItemIcon>
                <BlockIcon
                  fontSize="small"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                />
              </ListItemIcon>
              <ListItemText primary="Close Job" />
            </MenuItem>
          )}

          <MenuItem onClick={handleDeleteJob} sx={{ color: "#ef4444" }}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: "#ef4444" }} />
            </ListItemIcon>
            <ListItemText primary="Delete" />
          </MenuItem>
        </Menu>

        {/* Bulk Import Modal */}
        <BulkImportJobsModal
          open={openBulkImport}
          onClose={handleCloseBulkImport}
        />

        {/* Safety Close Job Confirmation Modal */}
        <CloseJobModal
          open={openCloseJobModal}
          onClose={() => setOpenCloseJobModal(false)}
          onConfirm={handleConfirmCloseJob}
          jobTitle={activeJob?.title || "this job"}
        />
      </Box>
    </Box>
  );
};

export default HRJobsDashboard;
