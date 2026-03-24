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
  Pagination,
  PaginationItem,
  useTheme,
  Avatar,
  IconButton,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Checkbox,
  Snackbar,
  TextField,
  InputAdornment,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FilterListIcon from "@mui/icons-material/FilterList";
import IosShareIcon from "@mui/icons-material/IosShare";
import SearchIcon from "@mui/icons-material/Search";
import NextPlanIcon from "@mui/icons-material/NextPlan";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DownloadIcon from "@mui/icons-material/Download";
import { useNavigate, useParams } from "react-router-dom";

// Import Modals
import ProcessingApplicantsModal from "./ProcessingApplicantsModal";

// Import API Service
import {
  getApplicants,
  downloadApplicantCV,
} from "@/services/RecruitmentService";

const ApplicantList = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();

  // Extract jobId from route params if this view is nested under a specific job
  const { jobId } = useParams();

  // --- Data & Pagination State ---
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const [page, setPage] = useState(1);
  const rowsPerPage = 10;
  const [totalCount, setTotalCount] = useState(0);

  // --- Search & Filter State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All Time");
  const [sortBy, setSortBy] = useState("Newest");

  // --- Bulk Selection State ---
  const [selectedApplicants, setSelectedApplicants] = useState([]);

  // --- Menu & Modal State ---
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedApplicantId, setSelectedApplicantId] = useState(null);
  const openMenu = Boolean(anchorEl);

  const [isProcessingModalOpen, setIsProcessingModalOpen] = useState(false);

  // --- Fetch Applicants Effect ---
  useEffect(() => {
    const fetchApplicantData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Construct params allowing for backend pagination and filtering
        const params = {
          page,
          take: rowsPerPage, // Ensure this matches backend expected pagination keys
          skip: (page - 1) * rowsPerPage,
          ...(jobId && { jobId }), // Filter by jobId if present in the URL
          ...(searchTerm && { search: searchTerm }),
          ...(statusFilter !== "All" && { status: statusFilter }),
          ...(dateFilter !== "All Time" && { dateRange: dateFilter }),
          ...(sortBy && { sort: sortBy }),
        };

        const response = await getApplicants(params);

        if (response.data && response.data.success) {
          const dataObj = response.data.data || {};
          let fetchedApplicants = [];

          // Parse new groupedApplications structure
          if (dataObj.groupedApplications) {
            // Flatten the grouped arrays into a single list for the table
            Object.values(dataObj.groupedApplications).forEach((jobGroup) => {
              fetchedApplicants = [...fetchedApplicants, ...jobGroup];
            });
          } else if (Array.isArray(dataObj.applicants)) {
            fetchedApplicants = dataObj.applicants;
          } else if (Array.isArray(dataObj)) {
            fetchedApplicants = dataObj;
          }

          // --- Client-Side Date Filtering Fallback ---
          if (dateFilter !== "All Time") {
            const now = new Date();
            const today = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
            );

            fetchedApplicants = fetchedApplicants.filter((app) => {
              if (!app.createdAt) return false;
              const appDate = new Date(app.createdAt);
              const appDay = new Date(
                appDate.getFullYear(),
                appDate.getMonth(),
                appDate.getDate(),
              );
              const diffTime = today.getTime() - appDay.getTime();
              const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

              if (dateFilter === "Today") return diffDays === 0;
              if (dateFilter === "Yesterday") return diffDays === 1;
              if (dateFilter === "Last 7 Days")
                return diffDays <= 7 && diffDays >= 0;
              if (dateFilter === "Last 14 Days")
                return diffDays <= 14 && diffDays >= 0;
              if (dateFilter === "Last 30 Days")
                return diffDays <= 30 && diffDays >= 0;
              if (dateFilter === "Older than 30 Days") return diffDays > 30;
              return true;
            });
          }

          // --- Client-Side Sorting Fallback ---
          fetchedApplicants.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();

            const getFullName = (app) => {
              const f =
                app.metadata?.firstName ||
                app.candidate?.firstName ||
                app.firstName ||
                "";
              const l =
                app.metadata?.lastName ||
                app.candidate?.lastName ||
                app.lastName ||
                "";
              return (app.name || `${f} ${l}`).trim().toLowerCase();
            };

            const nameA = getFullName(a);
            const nameB = getFullName(b);

            if (sortBy === "Newest") return dateB - dateA;
            if (sortBy === "Oldest") return dateA - dateB;
            if (sortBy === "A-Z") return nameA.localeCompare(nameB);
            if (sortBy === "Z-A") return nameB.localeCompare(nameA);
            return 0;
          });

          setApplicants(fetchedApplicants);

          // Set pagination safely based on the response's internal pagination object
          if (dataObj.pagination && dataObj.pagination.total !== undefined) {
            setTotalCount(dataObj.pagination.total);
          } else {
            setTotalCount(fetchedApplicants.length);
          }
        } else {
          setApplicants([]);
          setTotalCount(0);
        }
      } catch (err) {
        console.error("Failed to fetch applicants:", err);
        setError("Unable to load applicants. Please try again later.");
        setApplicants([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce API calls to prevent rapid firing on keystrokes
    const timeoutId = setTimeout(() => {
      fetchApplicantData();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [page, jobId, searchTerm, statusFilter, dateFilter, sortBy]);

  // --- Handlers ---
  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleActionClick = (event, id) => {
    setAnchorEl(event.currentTarget);
    setSelectedApplicantId(id);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") return;
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  // --- Selection Handlers ---
  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedApplicants(applicants.map((app) => app.id));
    } else {
      setSelectedApplicants([]);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedApplicants((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // FIX: Restore the selectedApplicant declaration so it can be passed to modals and detail views
  const selectedApplicant = applicants.find(
    (app) => app.id === selectedApplicantId,
  );

  const handleBack = () => {
    navigate("/jobs");
  };

  const handleViewDetails = () => {
    // Dynamically route to the applicant details view, preserving jobId context if available
    if (jobId) {
      navigate(`/jobs/${jobId}/applicants/${selectedApplicantId}`, {
        state: { applicant: selectedApplicant },
      });
    } else {
      navigate(`/applicants/${selectedApplicantId}`, {
        state: { applicant: selectedApplicant },
      });
    }
    handleCloseMenu();
    setSelectedApplicantId(null);
  };

  const handleDownloadCV = async () => {
    if (!selectedApplicantId) {
      handleCloseMenu();
      return;
    }

    // Find the applicant to use their original filename as a reliable fallback
    const applicant = applicants.find((app) => app.id === selectedApplicantId);

    try {
      // Fetch the CV using the new download endpoint with the applicationId
      const response = await downloadApplicantCV(selectedApplicantId);

      // Determine content type from headers or use default PDF type
      const contentType =
        response.headers?.["content-type"] || "application/pdf";
      const blob = new Blob([response.data], { type: contentType });

      // Create a URL for the blob
      const downloadUrl = window.URL.createObjectURL(blob);

      // Extract filename from header if available, otherwise use original db filename or default
      let fileName = applicant?.cvFileName || "Applicant_CV.pdf";
      const disposition = response.headers?.["content-disposition"];
      if (disposition && disposition.includes("attachment")) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          fileName = matches[1].replace(/['"]/g, "");
        }
      }

      // Create a temporary anchor element and trigger download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSnackbar({
        open: true,
        message: "CV downloaded successfully.",
        severity: "success",
      });
    } catch (err) {
      console.error("Failed to download CV:", err);
      setSnackbar({
        open: true,
        message: "Failed to download CV. The file might be unavailable.",
        severity: "error",
      });
    } finally {
      handleCloseMenu();
      setSelectedApplicantId(null);
    }
  };

  const handleProcessNextStage = () => {
    setIsProcessingModalOpen(true);
  };

  const handleCloseProcessingModal = () => {
    setIsProcessingModalOpen(false);
  };

  const handleProcessingComplete = () => {
    setIsProcessingModalOpen(false);
    setSelectedApplicants([]);
    // Redirect securely to the Kanban board for the narrower funnel
    navigate(`/jobs/${jobId || "all"}/kanban`);
  };

  // Helper for dynamic status styling
  const getStatusChipProps = (status) => {
    const normalizedStatus = (status || "Pending").toLowerCase();

    if (
      normalizedStatus.includes("shortlist") ||
      normalizedStatus.includes("hire") ||
      normalizedStatus.includes("accept")
    ) {
      return {
        bgcolor: isDarkMode ? "rgba(16, 185, 129, 0.3)" : "#d1fae5",
        color: isDarkMode ? "#34d399" : "#065f46",
        dotColor: "#10b981",
        borderColor: isDarkMode ? "rgba(16, 185, 129, 0.2)" : "#a7f3d0",
      };
    }
    if (
      normalizedStatus.includes("review") ||
      normalizedStatus.includes("process") ||
      normalizedStatus.includes("interview")
    ) {
      return {
        bgcolor: isDarkMode ? "rgba(245, 158, 11, 0.3)" : "#fef3c7",
        color: isDarkMode ? "#fbbf24" : "#92400e",
        dotColor: "#f59e0b",
        borderColor: isDarkMode ? "rgba(245, 158, 11, 0.2)" : "#fde68a",
      };
    }
    if (
      normalizedStatus.includes("reject") ||
      normalizedStatus.includes("decline") ||
      normalizedStatus.includes("fail")
    ) {
      return {
        bgcolor: isDarkMode ? "rgba(239, 68, 68, 0.3)" : "#fee2e2",
        color: isDarkMode ? "#f87171" : "#991b1b",
        dotColor: "#ef4444",
        borderColor: isDarkMode ? "rgba(239, 68, 68, 0.2)" : "#fecaca",
      };
    }
    if (normalizedStatus.includes("submit")) {
      return {
        bgcolor: isDarkMode ? "rgba(59, 130, 246, 0.2)" : "#dbeafe",
        color: isDarkMode ? "#93c5fd" : "#1d4ed8",
        dotColor: "#3b82f6",
        borderColor: isDarkMode ? "rgba(59, 130, 246, 0.3)" : "#bfdbfe",
      };
    }

    // Default Fallback
    return {
      bgcolor: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
      color: isDarkMode ? "#cbd5e1" : "#475569",
      dotColor: isDarkMode ? "#94a3b8" : "#94a3b8",
      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
    };
  };

  // Safe Math.ceil to prevent NaN if totalCount is 0
  const pageCount = Math.ceil(totalCount / rowsPerPage) || 1;

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
      <Box sx={{ width: "100%", maxWidth: "1280px" }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            overflow: "hidden",
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header Section */}
          <Box
            sx={{
              p: { xs: 3, sm: 4 },
              borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
            }}
          >
            {/* Back Button */}
            <Button
              onClick={handleBack}
              variant="text"
              sx={{
                mb: 2,
                color: isDarkMode ? "#94a3b8" : "#64748b",
                textTransform: "none",
                pl: 0,
                width: "fit-content",
                "&:hover": {
                  bgcolor: "transparent",
                  textDecoration: "underline",
                },
              }}
            >
              &larr; Back to Jobs Dashboard
            </Button>

            {/* Title & Controls Row */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column", // Changed to always be a column
                gap: 2, // Spacing between title and toolbar
              }}
            >
              <Box>
                <Typography
                  variant="h5"
                  component="h1"
                  sx={{
                    fontWeight: 700,
                    color: isDarkMode ? "#fff" : "#0f172a",
                    letterSpacing: "-0.025em",
                    mb: 0.5,
                  }}
                >
                  Candidate Applications
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                >
                  Review and select applicants to advance down the funnel
                </Typography>
              </Box>

              {/* Controls Toolbar */}
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "nowrap",
                  alignItems: "center",
                  gap: 2,
                  overflowX: "auto",
                  width: "100%", // Take up full width of the new line
                  justifyContent: "space-between", // Spread search and filters apart
                  "&::-webkit-scrollbar": { display: "none" },
                  pb: 1,
                  pt: 1, // Slight padding to separate from the title area
                }}
              >
                {/* Search Bar - Flex grow to make it longer */}
                <TextField
                  placeholder="Search applicants..."
                  size="small"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1); // Reset to first page on search
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon
                          fontSize="small"
                          sx={{ color: isDarkMode ? "#94a3b8" : "#9ca3af" }}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    flexGrow: 1,
                    minWidth: { xs: "220px", sm: "320px" }, // Make it longer
                    maxWidth: "500px", // Cap width on large screens
                    mr: "auto", // Push the rest of the items to the far right
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
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
                    "& input": { color: isDarkMode ? "#ffffff" : "#0f172a" },
                  }}
                />

                {/* Filters & Actions Group */}
                <Box
                  sx={{
                    display: "flex",
                    gap: 1.5,
                    flexWrap: "nowrap",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <TextField
                    select
                    size="small"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1); // Reset to first page on filter change
                    }}
                    sx={{
                      minWidth: "140px",
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
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
                      "& .MuiSelect-select": {
                        color: isDarkMode ? "#ffffff" : "#0f172a",
                      },
                    }}
                  >
                    <MenuItem value="All">All Statuses</MenuItem>
                    <MenuItem value="SUBMITTED">Submitted</MenuItem>
                    <MenuItem value="REVIEW">In Review</MenuItem>
                    <MenuItem value="INTERVIEW">Interview</MenuItem>
                    <MenuItem value="SHORTLISTED">Shortlisted</MenuItem>
                    <MenuItem value="REJECTED">Rejected</MenuItem>
                    <MenuItem value="HIRED">Hired</MenuItem>
                  </TextField>

                  <TextField
                    select
                    size="small"
                    value={dateFilter}
                    onChange={(e) => {
                      setDateFilter(e.target.value);
                      setPage(1);
                    }}
                    sx={{
                      minWidth: "140px",
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
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
                      "& .MuiSelect-select": {
                        color: isDarkMode ? "#ffffff" : "#0f172a",
                      },
                    }}
                  >
                    <MenuItem value="All Time">All Time</MenuItem>
                    <MenuItem value="Today">Today</MenuItem>
                    <MenuItem value="Yesterday">Yesterday</MenuItem>
                    <MenuItem value="Last 7 Days">Last 7 Days</MenuItem>
                    <MenuItem value="Last 14 Days">Last 14 Days</MenuItem>
                    <MenuItem value="Last 30 Days">Last 30 Days</MenuItem>
                    <MenuItem value="Older than 30 Days">
                      Older than 30 Days
                    </MenuItem>
                  </TextField>

                  <TextField
                    select
                    size="small"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                    }}
                    sx={{
                      minWidth: "140px",
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
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
                      "& .MuiSelect-select": {
                        color: isDarkMode ? "#ffffff" : "#0f172a",
                      },
                    }}
                  >
                    <MenuItem value="Newest">Newest First</MenuItem>
                    <MenuItem value="Oldest">Oldest First</MenuItem>
                    <MenuItem value="A-Z">Alphabetical (A-Z)</MenuItem>
                    <MenuItem value="Z-A">Alphabetical (Z-A)</MenuItem>
                  </TextField>

                  {/* Vertical Divider */}
                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={{
                      display: "block",
                      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                      height: 32,
                      alignSelf: "center",
                      mx: 0.5,
                      flexShrink: 0,
                    }}
                  />

                  {/* Primary Action - Process Selected Applicants */}
                  <Button
                    onClick={handleProcessNextStage}
                    variant="contained"
                    startIcon={<NextPlanIcon />}
                    disabled={selectedApplicants.length === 0}
                    sx={{
                      flexShrink: 0,
                      bgcolor: "#137fec",
                      color: "#fff",
                      fontWeight: 700,
                      textTransform: "none",
                      borderRadius: 2,
                      height: 40,
                      px: 3,
                      boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                      "&:hover": { bgcolor: "#2563eb" },
                      "&.Mui-disabled": {
                        bgcolor: isDarkMode ? "#334155" : "#e2e8f0",
                        color: isDarkMode ? "#94a3b8" : "#9ca3af",
                      },
                    }}
                  >
                    Process{" "}
                    {selectedApplicants.length > 0
                      ? `(${selectedApplicants.length})`
                      : ""}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Table Section */}
          <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow
                  sx={{
                    bgcolor: isDarkMode ? "rgba(30, 41, 59, 0.5)" : "#f8fafc",
                    borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                  }}
                >
                  {/* Select All Checkbox Column */}
                  <TableCell padding="checkbox" sx={{ borderBottom: "none" }}>
                    <Checkbox
                      checked={
                        applicants.length > 0 &&
                        selectedApplicants.length === applicants.length
                      }
                      indeterminate={
                        selectedApplicants.length > 0 &&
                        selectedApplicants.length < applicants.length
                      }
                      onChange={handleSelectAll}
                      sx={{
                        color: isDarkMode ? "#64748b" : "#94a3b8",
                        "&.Mui-checked": { color: "#137fec" },
                      }}
                    />
                  </TableCell>

                  {/* Updated Columns to reflect actual available data */}
                  {/* Updated Columns to reflect actual available data (Removed CV) */}
                  {[
                    { label: "Candidate", width: "35%" },
                    { label: "Applied Role", width: "30%" },
                    { label: "Applied Date", width: "15%" },
                    { label: "Status", width: "15%" },
                    { label: "Actions", width: "5%", align: "right" },
                  ].map((col) => (
                    <TableCell
                      key={col.label}
                      align={col.align || "left"}
                      width={col.width}
                      sx={{
                        py: 2,
                        px: 3,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: isDarkMode ? "#94a3b8" : "#64748b",
                        borderBottom: "none",
                      }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {/* State: Loading */}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={30} />
                      <Typography
                        variant="body2"
                        sx={{ mt: 1, color: "text.secondary" }}
                      >
                        Loading applicants...
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}

                {/* State: Error */}
                {!loading && error && (
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
                )}

                {/* State: Empty Data */}
                {!loading && !error && applicants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Typography
                        variant="body1"
                        sx={{ color: "text.secondary" }}
                      >
                        No applicants found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}

                {/* State: Render Data */}
                {!loading &&
                  !error &&
                  applicants.length > 0 &&
                  applicants.map((row, index) => {
                    const statusProps = getStatusChipProps(row.status);
                    const isSelected = selectedApplicants.includes(row.id);

                    // --- Safe Data Extraction ---
                    // The backend response uses nested structures or may omit candidate details initially
                    const firstName =
                      row.metadata?.firstName || row.candidate?.firstName || "";
                    const lastName =
                      row.metadata?.lastName || row.candidate?.lastName || "";
                    let computedName = `${firstName} ${lastName}`.trim();

                    // Fallback to Candidate ID if personal information isn't attached
                    if (!computedName) {
                      computedName = row.candidateId
                        ? `Applicant (${row.candidateId.substring(0, 6)})`
                        : "Unknown Applicant";
                    }

                    const computedEmail =
                      row.metadata?.email ||
                      row.candidate?.email ||
                      "No email available";
                    const computedRole = row.job?.title || "Unspecified Role";
                    const appliedDate = row.createdAt
                      ? new Date(row.createdAt).toLocaleDateString()
                      : "--";

                    // Construct initials safely
                    const initials =
                      firstName && lastName
                        ? `${firstName[0]}${lastName[0]}`.toUpperCase()
                        : computedName.substring(0, 2).toUpperCase();

                    return (
                      <TableRow
                        key={row.id || index}
                        selected={isSelected}
                        sx={{
                          height: 72,
                          "&:hover": {
                            bgcolor: isDarkMode
                              ? "rgba(51, 65, 85, 0.5)"
                              : "#f8fafc",
                          },
                          // Highlight selected rows
                          ...(isSelected && {
                            bgcolor: isDarkMode
                              ? "rgba(19, 127, 236, 0.15) !important"
                              : "rgba(19, 127, 236, 0.05) !important",
                          }),
                          borderBottom: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                          transition: "background-color 150ms",
                        }}
                      >
                        {/* Row Selection Checkbox */}
                        <TableCell
                          padding="checkbox"
                          sx={{ borderBottom: "none" }}
                        >
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleSelectRow(row.id)}
                            sx={{
                              color: isDarkMode ? "#64748b" : "#94a3b8",
                              "&.Mui-checked": { color: "#137fec" },
                            }}
                          />
                        </TableCell>

                        {/* Candidate Information */}
                        <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                          <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Avatar
                              src={row.candidate?.avatarUrl || null}
                              alt={computedName}
                              sx={{
                                width: 40,
                                height: 40,
                                mr: 2,
                                bgcolor: isDarkMode ? "#475569" : "#e2e8f0",
                                color: isDarkMode ? "#e2e8f0" : "#475569",
                                fontSize: "0.875rem",
                                fontWeight: 600,
                              }}
                            >
                              {initials}
                            </Avatar>
                            <Box>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 500,
                                  color: isDarkMode ? "#fff" : "#0f172a",
                                }}
                              >
                                {computedName}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: isDarkMode ? "#94a3b8" : "#64748b",
                                }}
                              >
                                {computedEmail}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>

                        {/* Applied Role */}
                        <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              color: isDarkMode ? "#cbd5e1" : "#334155",
                            }}
                          >
                            {computedRole}
                          </Typography>
                        </TableCell>

                        {/* Applied Date */}
                        <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                          <Typography
                            variant="body2"
                            sx={{ color: isDarkMode ? "#cbd5e1" : "#475569" }}
                          >
                            {appliedDate}
                          </Typography>
                        </TableCell>

                        {/* Status */}
                        <TableCell sx={{ py: 2, px: 3, borderBottom: "none" }}>
                          <Box
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              px: 1.5,
                              py: 0.5,
                              borderRadius: "9999px",
                              bgcolor: statusProps.bgcolor,
                              color: statusProps.color,
                              border: `1px solid ${statusProps.borderColor}`,
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                bgcolor: statusProps.dotColor,
                                mr: 1,
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                textTransform: "capitalize",
                              }}
                            >
                              {row.status
                                ? row.status.toLowerCase().replace("_", " ")
                                : "Pending"}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* Actions */}
                        <TableCell
                          align="right"
                          sx={{ py: 2, px: 3, borderBottom: "none" }}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => handleActionClick(e, row.id)}
                            sx={{
                              color: isDarkMode ? "#94a3b8" : "#94a3b8", // slate-400
                              "&:hover": {
                                bgcolor: isDarkMode ? "#334155" : "#f1f5f9",
                                color: isDarkMode ? "#cbd5e1" : "#475569",
                              },
                            }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
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
                {applicants.length > 0 ? (page - 1) * rowsPerPage + 1 : 0}
              </Box>{" "}
              to{" "}
              <Box
                component="span"
                fontWeight="600"
                color={isDarkMode ? "#fff" : "#0f172a"}
              >
                {applicants.length > 0
                  ? Math.min(page * rowsPerPage, applicants.length)
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
                minWidth: 200,
              },
            }}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            <MenuItem onClick={handleViewDetails}>
              <ListItemIcon>
                <VisibilityIcon
                  fontSize="small"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                />
              </ListItemIcon>
              <ListItemText primary="View Details" />
            </MenuItem>
            <MenuItem onClick={handleDownloadCV}>
              <ListItemIcon>
                <DownloadIcon
                  fontSize="small"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                />
              </ListItemIcon>
              <ListItemText primary="Download CV" />
            </MenuItem>
          </Menu>
        </Paper>
      </Box>

      {/* Render the Processing Modal configured for the selected applicants */}
      <ProcessingApplicantsModal
        open={isProcessingModalOpen}
        onClose={handleCloseProcessingModal}
        onComplete={handleProcessingComplete}
        applicantCount={selectedApplicants.length}
      />

      {/* Global Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{
            width: "100%",
            color: "#ffffff",
            fontWeight: 600,
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ApplicantList;
