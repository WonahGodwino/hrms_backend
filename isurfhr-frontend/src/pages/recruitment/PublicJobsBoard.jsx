import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Chip,
  Select,
  MenuItem,
  Card,
  Paper,
  CardContent,
  useTheme,
  Pagination,
  PaginationItem,
  Grid,
  Container,
  CircularProgress,
  Alert,
  Divider,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import WorkIcon from "@mui/icons-material/Work";
import FilterListIcon from "@mui/icons-material/FilterList";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PentagonIcon from "@mui/icons-material/Pentagon";
import BubbleChartIcon from "@mui/icons-material/BubbleChart";
import ChangeHistoryIcon from "@mui/icons-material/ChangeHistory";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { useNavigate } from "react-router-dom";

// Service Import
import { getPublicJobs } from "@/services/RecruitmentService";

const FILTERS = ["All Jobs", "Remote", "Engineering", "Design", "Marketing"];

const PublicJobsBoard = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();

  // Data State
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("All Jobs");
  const [sortBy, setSortBy] = useState("Newest First");
  const [page, setPage] = useState(1);
  const rowsPerPage = 6;
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch Jobs
  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          page,
          pageSize: rowsPerPage,
          search: searchTerm,
        };

        const response = await getPublicJobs(params);

        if (response.data && response.data.success) {
          const dataObj = response.data.data || {};
          const pagination = dataObj.pagination || {};

          let fetchedJobs = Array.isArray(dataObj.jobs) ? dataObj.jobs : [];

          // Client-side filtering fallback
          if (filterType !== "All Jobs") {
            const lowerFilter = filterType.toLowerCase();
            fetchedJobs = fetchedJobs.filter(
              (job) =>
                (job.location &&
                  job.location.toLowerCase().includes(lowerFilter)) ||
                (job.employmentType &&
                  job.employmentType.toLowerCase().includes(lowerFilter)) ||
                (job.department &&
                  job.department.toLowerCase().includes(lowerFilter)) ||
                (job.title && job.title.toLowerCase().includes(lowerFilter)) ||
                (job.department && job.department.includes(filterType)),
            );
          }

          // Client-side sorting fallback
          if (sortBy === "Newest First") {
            fetchedJobs.sort(
              (a, b) =>
                new Date(b.publishedAt || b.createdAt) -
                new Date(a.publishedAt || a.createdAt),
            );
          } else if (sortBy === "Oldest First") {
            fetchedJobs.sort(
              (a, b) =>
                new Date(a.publishedAt || a.createdAt) -
                new Date(b.publishedAt || b.createdAt),
            );
          }

          setJobs(fetchedJobs);

          if (pagination.total !== undefined) {
            setTotalCount(pagination.total);
            setTotalPages(
              pagination.totalPages ||
                Math.ceil(pagination.total / rowsPerPage),
            );
          } else {
            setTotalCount(fetchedJobs.length);
            setTotalPages(1);
          }
        } else {
          setJobs([]);
          setTotalCount(0);
          setTotalPages(1);
        }
      } catch (err) {
        console.error("Failed to fetch public jobs:", err);
        setError("Unable to load job listings. Please try again later.");
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    const debounceFetch = setTimeout(() => {
      fetchJobs();
    }, 500);

    return () => clearTimeout(debounceFetch);
  }, [page, searchTerm, filterType, sortBy]);

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleFilterClick = (type) => {
    setFilterType(type);
    setPage(1);
  };

  const handleSortChange = (event) => {
    setSortBy(event.target.value);
  };

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleJobClick = (jobId) => {
    navigate(`/careers/${jobId}`);
  };

  const handleBackToHome = () => {
    navigate("/");
  };

  const getJobIcon = (title) => {
    if (title.toLowerCase().includes("designer"))
      return <BubbleChartIcon sx={{ fontSize: 32, color: "white" }} />;
    if (title.toLowerCase().includes("manager"))
      return <WorkIcon sx={{ fontSize: 32, color: "white" }} />;
    if (
      title.toLowerCase().includes("engineer") ||
      title.toLowerCase().includes("developer")
    )
      return <PentagonIcon sx={{ fontSize: 32, color: "white" }} />;
    return <ChangeHistoryIcon sx={{ fontSize: 32, color: "white" }} />;
  };

  const getIconBg = (title) => {
    if (title.toLowerCase().includes("designer"))
      return "linear-gradient(45deg, #a855f7 0%, #ec4899 100%)";
    if (title.toLowerCase().includes("manager"))
      return "linear-gradient(135deg, #10b981 0%, #3b82f6 100%)";
    if (title.toLowerCase().includes("engineer"))
      return "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)";
    return "linear-gradient(225deg, #fb923c 0%, #fde047 100%)";
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return "Recently";
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 30) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        fontFamily: '"Inter", sans-serif',
        pb: 8,
      }}
    >
      <Container maxWidth="xl" sx={{ px: { xs: 2, sm: 4, md: 6, lg: 8 } }}>
        {/* Header Section */}
        <Box sx={{ pt: 8, pb: 6, textAlign: "center" }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: { xs: "center", md: "flex-start" },
              mb: 2,
            }}
          >
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleBackToHome}
              sx={{
                color: isDarkMode ? "#94a3b8" : "#64748b",
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.875rem",
                "&:hover": {
                  bgcolor: "transparent",
                  color: isDarkMode ? "#ffffff" : "#111418",
                  textDecoration: "underline",
                },
                px: 0,
              }}
            >
              Back to Home
            </Button>
          </Box>

          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: "2.5rem", md: "3.5rem" },
              color: isDarkMode ? "#fff" : "#111827",
              mb: 2,
              letterSpacing: "-0.02em",
            }}
          >
            Find Your Next <span style={{ color: "#137fec" }}>Dream Job</span>
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: isDarkMode ? "#94a3b8" : "#6b7280",
              fontSize: { xs: "1rem", md: "1.25rem" },
              fontWeight: 400,
              maxWidth: "600px",
              mx: "auto",
              mb: 6,
            }}
          >
            Browse thousands of job openings from top companies and startups.
            Your future starts here.
          </Typography>

          {/* Search Bar Container */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 1 }, // Adjusted padding for mobile
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { xs: "stretch", md: "center" }, // Stretch on mobile to fill width
              gap: { xs: 2, md: 1 }, // Increased gap on mobile
              maxWidth: "800px",
              mx: "auto",
              // Adjusted borderRadius: less rounded on mobile for better stacking, fully rounded on desktop
              borderRadius: { xs: 3, md: "9999px" },
              border: `1px solid ${isDarkMode ? "#334155" : "#e5e7eb"}`,
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
              boxShadow: isDarkMode
                ? "0 4px 6px -1px rgba(0, 0, 0, 0.5)"
                : "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            }}
          >
            <TextField
              fullWidth
              placeholder="Job title, keywords, or company"
              value={searchTerm}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon
                      sx={{ color: isDarkMode ? "#94a3b8" : "#9ca3af", ml: 1 }}
                    />
                  </InputAdornment>
                ),
                disableUnderline: true,
              }}
              variant="standard"
              sx={{
                flex: 1,
                px: { xs: 0, md: 2 }, // Remove horizontal padding on mobile to align text
                "& input": {
                  fontSize: "1rem",
                  py: 1.5,
                  color: isDarkMode ? "#fff" : "#111827",
                },
              }}
            />

            <Divider
              orientation="vertical"
              flexItem
              sx={{
                display: { xs: "none", md: "block" },
                bgcolor: isDarkMode ? "#334155" : "#e5e7eb",
                my: 1,
              }}
            />

            {/* Divider for mobile (Horizontal) */}
            <Divider
              orientation="horizontal"
              flexItem
              sx={{
                display: { xs: "block", md: "none" },
                bgcolor: isDarkMode ? "#334155" : "#e5e7eb",
                my: 0,
              }}
            />

            <Select
              value={sortBy}
              onChange={handleSortChange}
              displayEmpty
              startAdornment={
                <InputAdornment position="start">
                  <FilterListIcon
                    sx={{ color: isDarkMode ? "#94a3b8" : "#9ca3af" }}
                  />
                </InputAdornment>
              }
              variant="standard"
              disableUnderline
              sx={{
                minWidth: "180px",
                px: { xs: 0, md: 2 },
                color: isDarkMode ? "#fff" : "#111827",
                "& .MuiSelect-select": {
                  py: 1.5,
                  fontSize: "1rem",
                },
              }}
            >
              <MenuItem value="Newest First">Newest First</MenuItem>
              <MenuItem value="Oldest First">Oldest First</MenuItem>
              <MenuItem value="Salary: High to Low">
                Salary: High to Low
              </MenuItem>
            </Select>

            <Button
              variant="contained"
              size="large"
              sx={{
                bgcolor: "#137fec",
                color: "#ffffff",
                borderRadius: "9999px", // Keep fully rounded button
                px: 4,
                py: 1.5,
                textTransform: "none",
                fontSize: "1rem",
                fontWeight: 600,
                boxShadow: "none",
                "&:hover": {
                  bgcolor: "#1d4ed8",
                  boxShadow: "none",
                },
                width: { xs: "100%", md: "auto" }, // Full width button on mobile
                mt: { xs: 1, md: 0 }, // Add margin top on mobile
              }}
            >
              Search
            </Button>
          </Paper>

          {/* Quick Filters */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 1.5,
              mt: 4,
            }}
          >
            {FILTERS.map((filter) => (
              <Chip
                key={filter}
                label={filter}
                clickable
                onClick={() => handleFilterClick(filter)}
                sx={{
                  bgcolor:
                    filterType === filter
                      ? "#137fec"
                      : isDarkMode
                        ? "rgba(255,255,255,0.05)"
                        : "#ffffff",
                  color:
                    filterType === filter
                      ? "#ffffff"
                      : isDarkMode
                        ? "#e2e8f0"
                        : "#4b5563",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  borderRadius: "9999px",
                  border: `1px solid ${
                    filterType === filter
                      ? "#137fec"
                      : isDarkMode
                        ? "rgba(255,255,255,0.1)"
                        : "#e5e7eb"
                  }`,
                  "&:hover": {
                    bgcolor:
                      filterType === filter
                        ? "#1170d0"
                        : isDarkMode
                          ? "rgba(255,255,255,0.1)"
                          : "#f3f4f6",
                  },
                  px: 1,
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Loading / Error States */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
            <CircularProgress size={40} sx={{ color: "#137fec" }} />
          </Box>
        )}

        {error && !loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <Alert severity="error" sx={{ width: "100%", maxWidth: 600 }}>
              {error}
            </Alert>
          </Box>
        )}

        {/* Job Grid - Shortened Card Width & Centered */}
        {!loading && !error && (
          <>
            <Grid container spacing={3} justifyContent="center">
              {jobs.length > 0 ? (
                jobs.map((job) => (
                  // Changed size from xs={12} to md={8} lg={6} to shorten width while centered
                  <Grid item size={{ xs: 12, md: 8, lg: 10 }} key={job.id}>
                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 3,
                        bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                        border: `1px solid ${
                          isDarkMode ? "#334155" : "transparent"
                        }`,
                        boxShadow: isDarkMode
                          ? "none"
                          : "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                        transition: "all 0.2s",
                        // Removed onClick from here to make it non-clickable
                      }}
                    >
                      <CardContent sx={{ p: 4, "&:last-child": { pb: 4 } }}>
                        <Grid container spacing={3} alignItems="flex-start">
                          {/* Logo & Main Info */}
                          <Grid item size={{ xs: 12, sm: 8 }}>
                            <Box sx={{ display: "flex", gap: 3 }}>
                              {/* Logo Placeholder */}
                              <Box
                                sx={{
                                  height: 84,
                                  width: 84,
                                  borderRadius: 2,
                                  background: getIconBg(job.title),
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  boxShadow:
                                    "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
                                  flexShrink: 0,
                                }}
                              >
                                {getJobIcon(job.title)}
                              </Box>

                              <Box>
                                <Typography
                                  variant="h4"
                                  component="h2"
                                  sx={{
                                    fontWeight: 700,
                                    color: isDarkMode ? "#fff" : "#111827",
                                    mb: 1,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {job.title}
                                </Typography>
                                <Typography
                                  variant="body1"
                                  sx={{
                                    color: isDarkMode ? "#94a3b8" : "#6b7280",
                                    fontWeight: 500,
                                    mb: 1, // spacing before metadata
                                  }}
                                >
                                  {job.companyName || "Tech Company"} •{" "}
                                  {job.department || "General"}
                                </Typography>

                                {/* Metadata: Location & Employment Type (Moved here) */}
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 2,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                      color: isDarkMode ? "#94a3b8" : "#617589",
                                    }}
                                  >
                                    <LocationOnIcon
                                      fontSize="small"
                                      sx={{ opacity: 0.8, fontSize: "1.2rem" }}
                                    />
                                    <Typography
                                      variant="body2"
                                      fontWeight={500}
                                    >
                                      {job.location || "Remote"}
                                    </Typography>
                                  </Box>

                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                      color: isDarkMode ? "#94a3b8" : "#617589",
                                    }}
                                  >
                                    <WorkIcon
                                      fontSize="small"
                                      sx={{ opacity: 0.8, fontSize: "1.2rem" }}
                                    />
                                    <Typography
                                      variant="body2"
                                      fontWeight={500}
                                    >
                                      {job.employmentType || "Full-time"}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Box>
                            </Box>
                          </Grid>

                          {/* Status, Price & Apply Button (Right Side) */}
                          <Grid item size={{ xs: 12, sm: 4 }}>
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: {
                                  xs: "flex-start",
                                  sm: "flex-end",
                                },
                                gap: 1.5,
                                height: "100%",
                              }}
                            >
                              {/* Status & Price Row */}
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                }}
                              >
                                <Chip
                                  label={
                                    job.status === "ACTIVE"
                                      ? "Active"
                                      : job.status || "Open"
                                  }
                                  size="small"
                                  sx={{
                                    height: 24,
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    bgcolor: isDarkMode
                                      ? "rgba(20, 83, 45, 0.3)"
                                      : "#f0fdf4",
                                    color: isDarkMode ? "#4ade80" : "#15803d",
                                    border: "1px solid",
                                    borderColor: isDarkMode
                                      ? "rgba(22, 163, 74, 0.2)"
                                      : "rgba(22, 163, 74, 0.2)",
                                  }}
                                />
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 700,
                                    color: isDarkMode ? "#fff" : "#111418",
                                    fontSize: "0.9rem",
                                  }}
                                >
                                  {job.salary || "Competitive"}
                                </Typography>
                              </Box>

                              {/* Time Ago */}
                              <Typography
                                variant="caption"
                                sx={{
                                  color: isDarkMode ? "#64748b" : "#9ca3af",
                                  fontWeight: 500,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  mb: 1,
                                }}
                              >
                                <ScheduleIcon sx={{ fontSize: 14 }} />
                                {formatTimeAgo(
                                  job.publishedAt || job.createdAt,
                                )}
                              </Typography>

                              {/* Apply Now Button */}
                              <Button
                                variant="contained"
                                onClick={() => handleJobClick(job.id)}
                                sx={{
                                  bgcolor: "#137fec",
                                  color: "#ffffff",
                                  textTransform: "none",
                                  fontWeight: 600,
                                  borderRadius: 2,
                                  px: 3,
                                  py: 1,
                                  width: { xs: "100%", sm: "auto" },
                                  "&:hover": {
                                    bgcolor: "#1170d0",
                                  },
                                }}
                              >
                                Apply Now
                              </Button>
                            </Box>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                ))
              ) : (
                <Grid item size={{ xs: 12 }}>
                  <Box sx={{ textAlign: "center", py: 10 }}>
                    <Typography variant="h6" color="text.secondary">
                      No job listings found.
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>

            {/* Pagination */}
            {jobs.length > 0 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  mt: 6,
                }}
              >
                <Pagination
                  count={totalPages}
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
            )}
          </>
        )}
      </Container>
    </Box>
  );
};

export default PublicJobsBoard;
