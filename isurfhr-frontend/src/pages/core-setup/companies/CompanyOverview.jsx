import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  useTheme,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
  Paper,
  TextField,
  InputAdornment,
  CircularProgress,
  Pagination,
  PaginationItem,
  Alert,
} from "@mui/material";
import { useAuth } from "@/lib/context/AuthContext";
import CompanyRegistrationModal from "./RegisterCompanyModal";
import { useNavigate } from "react-router-dom";

// --- API Services ---
import { getAccessibleCompany, getAssignment } from "@/services/CompanyService";
import { getDashboardStats } from "@/services/DashboardService";
import { downloadCompanyAssignmentReport } from "@/services/RecruitmentService";

import {
  Building2,
  Plus,
  UserPlus,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Search,
  Building,
  Group,
  ShieldCheck,
  CheckCircle,
  XCircle,
  EyeOff,
  Download,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";

// ============================================================================
// SHARED UI COMPONENTS
// ============================================================================

/**
 * Custom base card component with standard styling and hover effects.
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to render inside the card
 * @param {Object} props.sx - Additional MUI styles
 * @param {Function} props.onClick - Click handler
 * @param {string} props.className - Additional CSS classes
 */
const DashboardCard = ({ children, sx, onClick, className }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Card
      elevation={0}
      onClick={onClick}
      className={className}
      sx={{
        height: "100%",
        borderRadius: 3,
        bgcolor: isDark ? "#1e2832" : "#ffffff",
        border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
        boxShadow: isDark ? "none" : "0px 1px 3px rgba(0, 0, 0, 0.05)",
        transition: "all 0.2s ease-in-out",
        cursor: onClick ? "pointer" : "default",
        ...sx,
      }}
    >
      {children}
    </Card>
  );
};

/**
 * KPI Stat Card Component
 * Renders individual top-level metrics with a specific icon and color scheme.
 * @param {Object} props
 * @param {string} props.title - Metric title
 * @param {string|number} props.value - Metric value
 * @param {React.ElementType} props.icon - Lucide/MUI Icon component
 * @param {string} props.colorBg - Background color for icon
 * @param {string} props.colorText - Text/Icon color
 */
const StatCard = ({ title, value, icon, colorBg, colorText }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const StatIcon = icon;

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        borderRadius: 3,
        bgcolor: isDark ? "#1e2832" : "#ffffff",
        border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
        boxShadow: isDark ? "none" : "0px 1px 3px rgba(0, 0, 0, 0.05)",
        transition: "all 0.2s",
        "&:hover": { boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" },
      }}
    >
      <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: isDark ? alpha(colorText, 0.2) : colorBg,
              color: colorText,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <StatIcon size={20} />
          </Box>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontSize: "0.75rem",
            }}
          >
            {title}
          </Typography>
        </Box>
        <Typography
          variant="h4"
          sx={{ fontWeight: 700, color: "text.primary" }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
};

/**
 * Action Card Component
 * Displays a quick action shortcut link. Updated to handle loading states.
 */
const ActionCard = ({
  title,
  subtitle,
  icon,
  primary = false,
  onClick,
  loading = false,
}) => {
  const theme = useTheme();
  const LucideIcon = icon;

  return (
    <DashboardCard
      onClick={loading ? undefined : onClick}
      sx={{
        opacity: loading ? 0.7 : 1,
        ...(primary
          ? {
              bgcolor: "primary.main",
              borderColor: "primary.main",
              "&:hover": {
                bgcolor: "primary.dark",
                borderColor: "primary.dark",
                transform: loading ? "none" : "translateY(-2px)",
                boxShadow: loading
                  ? "none"
                  : "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              },
            }
          : {
              "&:hover": {
                borderColor: theme.palette.primary.main,
                transform: loading ? "none" : "translateY(-2px)",
                boxShadow: loading
                  ? "none"
                  : "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              },
            }),
      }}
    >
      <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 2 }}>
        {loading ? (
          <CircularProgress
            size={32}
            sx={{ color: primary ? "#ffffff" : theme.palette.text.primary }}
          />
        ) : (
          <LucideIcon
            size={32}
            color={primary ? "#ffffff" : theme.palette.text.primary}
          />
        )}
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              color: primary ? "#ffffff" : "text.primary",
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: primary ? "primary.100" : "text.secondary", mt: 0.5 }}
          >
            {subtitle}
          </Typography>
        </Box>
      </Box>
    </DashboardCard>
  );
};

/**
 * Empty State Component
 * Displayed when no companies are available in the system yet.
 */
const EmptyState = ({ role, onRegister }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 10,
        px: 3,
        textAlign: "center",
        bgcolor: isDark ? alpha("#1e293b", 0.5) : "#f8fafc",
        borderRadius: 3,
        border: `2px dashed ${isDark ? theme.palette.divider : "#e2e8f0"}`,
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          bgcolor: isDark ? alpha("#3b82f6", 0.2) : "#dbeafe",
          color: "#137fec",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 3,
        }}
      >
        <Inbox size={32} />
      </Box>
      <Typography variant="h6" fontWeight={700} color="text.primary" mb={1}>
        No Companies Found
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4} maxWidth={400}>
        There are currently no companies registered or assigned to your account.
      </Typography>

      {role === "SUPER_ADMIN" && (
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={onRegister}
          sx={{
            bgcolor: "#137fec",
            color: "#fff",
            textTransform: "none",
            fontWeight: 600,
            "&:hover": { bgcolor: "#1d4ed8" },
          }}
        >
          Register First Company
        </Button>
      )}
    </Box>
  );
};

// ============================================================================
// LIST / TABLE COMPONENT
// ============================================================================

/**
 * Company List Table
 * Displays the list of accessible companies with sorting and pagination.
 * Handles data dynamically injected for admins and staff counts.
 */
const CompanyList = ({ companies, role, loading, onEditCompany }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  // Reset pagination to 1 whenever the underlying list of companies changes (e.g. from filtering)
  useEffect(() => {
    setPage(1);
  }, [companies]);

  const handleMenuOpen = (event, id) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedId(id);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedId(null);
  };

  const handleViewCompany = () => {
    if (selectedId) {
      const company = companies.find((c) => c.id === selectedId);
      navigate("/companies/profile", { state: { company } });
      handleMenuClose();
    }
  };

  const handleEdit = () => {
    const company = companies.find((c) => c.id === selectedId);
    if (company && onEditCompany) {
      onEditCompany(company);
    }
    handleMenuClose();
  };

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Pagination Calculation
  const pageCount = Math.ceil(companies.length / rowsPerPage);
  const displayedCompanies = companies.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  return (
    <Box>
      <TableContainer
        component={Card}
        elevation={0}
        sx={{
          borderRadius: 3,
          border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          overflow: "hidden",
        }}
      >
        <Table>
          <TableHead sx={{ bgcolor: isDark ? "#25303b" : "#f9fafb" }}>
            <TableRow>
              <TableCell
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  py: 2,
                }}
              >
                Company Name
              </TableCell>
              <TableCell
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  py: 2,
                }}
              >
                Sector
              </TableCell>
              <TableCell
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  py: 2,
                }}
              >
                Assigned Admin
              </TableCell>
              <TableCell
                align="center"
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  py: 2,
                }}
              >
                Staff Count
              </TableCell>
              <TableCell
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  py: 2,
                }}
              >
                Status
              </TableCell>
              <TableCell
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  py: 2,
                }}
              >
                Date Created
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  py: 2,
                }}
              >
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedCompanies.length > 0 ? (
              displayedCompanies.map((company) => (
                <TableRow
                  key={company.id}
                  hover
                  sx={{
                    cursor: "pointer",
                    "&:last-child td, &:last-child th": { border: 0 },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Avatar
                        sx={{
                          width: 40,
                          height: 40,
                          bgcolor: isDark
                            ? alpha(
                                theme.palette[company.color || "primary"].main,
                                0.2,
                              )
                            : alpha(
                                theme.palette[company.color || "primary"].main,
                                0.1,
                              ),
                          color: theme.palette[company.color || "primary"].main,
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          borderRadius: 2,
                        }}
                      >
                        {company.initials}
                      </Avatar>
                      <Box>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color="text.primary"
                        >
                          {company.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ID: #COMP-{String(company.id).padStart(3, "0")}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={company.industry || "Technology"}
                      size="small"
                      sx={{
                        borderRadius: 1,
                        bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6",
                        color: "text.secondary",
                        fontWeight: 500,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {company.admin === "Unassigned" ? (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            color: "text.disabled",
                            fontStyle: "italic",
                          }}
                        >
                          <UserPlus size={16} />{" "}
                          <Typography variant="caption">Unassigned</Typography>
                        </Box>
                      ) : (
                        <>
                          <Avatar
                            sx={{
                              width: 24,
                              height: 24,
                              fontSize: "0.7rem",
                              bgcolor: theme.palette.primary.main,
                            }}
                          >
                            {(company.admin || "U").charAt(0)}
                          </Avatar>
                          <Typography variant="body2">
                            {company.admin}
                          </Typography>
                          {company.additionalAdmins > 0 && (
                            <Chip
                              label={`+${company.additionalAdmins}`}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: "0.65rem",
                                bgcolor: isDark
                                  ? "rgba(255,255,255,0.1)"
                                  : "#f1f5f9",
                                color: "text.secondary",
                                fontWeight: 600,
                              }}
                            />
                          )}
                        </>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" fontWeight={500}>
                      {(company.staff || 0).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={company.status || "Active"}
                      size="small"
                      icon={
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: "currentColor",
                          }}
                        />
                      }
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        pl: 0.5,
                        ...(company.status === "Active" && {
                          bgcolor: isDark ? alpha("#22c55e", 0.2) : "#ecfdf5",
                          color: isDark ? "#4ade80" : "#15803d",
                          "& .MuiChip-icon": { color: "inherit" },
                        }),
                        ...(company.status === "Inactive" && {
                          bgcolor: isDark ? alpha("#64748b", 0.2) : "#f1f5f9",
                          color: isDark ? "#94a3b8" : "#475569",
                        }),
                        ...(company.status === "Pending" && {
                          bgcolor: isDark ? alpha("#f59e0b", 0.2) : "#fffbeb",
                          color: isDark ? "#fbbf24" : "#b45309",
                        }),
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {company.date || "N/A"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, company.id)}
                    >
                      <MoreVertical size={18} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    No companies found matching filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        {companies.length > 0 && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 2,
              borderTop: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
            }}
          >
            <Pagination
              count={pageCount}
              page={page}
              onChange={handlePageChange}
              renderItem={(item) => (
                <PaginationItem
                  slots={{ previous: ChevronLeft, next: ChevronRight }}
                  {...item}
                  sx={{
                    borderRadius: 2,
                    width: 40,
                    height: 40,
                    margin: "0 2px",
                    color: isDark ? "#ffffff" : "#0d141b",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    "&.Mui-selected": {
                      backgroundColor: "#137fec",
                      color: "#ffffff",
                      fontWeight: 700,
                      "&:hover": { backgroundColor: "rgba(19, 127, 236, 0.9)" },
                    },
                    "&:hover": {
                      backgroundColor: isDark ? "#334155" : "#e2e8f0",
                    },
                  }}
                />
              )}
            />
          </Box>
        )}
      </TableContainer>

      {/* Row Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{ sx: { minWidth: 160, borderRadius: 2 } }}
      >
        <MenuItem onClick={handleViewCompany}>
          <ListItemIcon>
            <Eye size={16} />
          </ListItemIcon>
          <ListItemText>View</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <Edit size={16} />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleMenuClose}>
          <ListItemIcon>
            <ShieldCheck size={16} />
          </ListItemIcon>
          <ListItemText>Assign</ListItemText>
        </MenuItem>
        {role === "SUPER_ADMIN" && (
          <MenuItem onClick={handleMenuClose} sx={{ color: "error.main" }}>
            <ListItemIcon>
              <Trash2 size={16} color={theme.palette.error.main} />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

const CompanyOverview = () => {
  const { user } = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const isDarkMode = theme.palette.mode === "dark";

  const role = (user?.role || "").toString().toUpperCase();
  const isSuperAdmin = role === "SUPER_ADMIN" || role === "SUPERADMIN";

  // Data States
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null); // Track the company being edited
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // --- Real-time Search, Sort & Filter States ---
  const [searchTerm, setSearchTerm] = useState("");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Newest");

  // Dashboard Metrics State
  const [dashboardStats, setDashboardStats] = useState(null);
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // --------------------------------------------------------------------------
  // Fetch Companies and Assignments
  // --------------------------------------------------------------------------
  useEffect(() => {
    const fetchCompaniesAndRelations = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch accessible companies & admin assignments concurrently
        const [companiesRes, assignmentsRes] = await Promise.all([
          getAccessibleCompany(),
          getAssignment().catch((err) => {
            console.error("Failed to fetch assignments", err);
            return { data: { success: false, data: { assignments: [] } } };
          }),
        ]);

        // 2. Build a map of admins by companyId
        const adminMap = {};
        if (assignmentsRes?.data?.success) {
          const assignmentsList = assignmentsRes.data.data.assignments || [];
          assignmentsList.forEach((assignment) => {
            if (
              assignment.role === "ADMIN" ||
              assignment.role === "SUPER_ADMIN"
            ) {
              if (!adminMap[assignment.companyId]) {
                adminMap[assignment.companyId] = [];
              }
              const adminName =
                assignment.user?.fullName ||
                assignment.user?.firstName ||
                "Unknown Admin";
              adminMap[assignment.companyId].push(adminName);
            }
          });
        }

        // 3. Transform raw company data to UI Model blending in admins
        if (companiesRes.data && companiesRes.data.success) {
          const companiesData = companiesRes.data.data || [];

          // Adding an index parameter to map to safely store original fetching/insertion order
          const mappedCompanies = companiesData.map((c, index) => {
            const assignedAdmins = adminMap[c.id] || [];
            const primaryAdmin =
              assignedAdmins.length > 0 ? assignedAdmins[0] : "Unassigned";
            const additionalAdminsCount =
              assignedAdmins.length > 1 ? assignedAdmins.length - 1 : 0;

            return {
              id: c.id,
              name: c.companyName || "Unknown",
              industry: c.industry || "Technology",
              status: c.status || "Active",
              initials: (c.companyName || "U").substring(0, 2).toUpperCase(),
              staff: c.staffCount || 0, // Fallback to 0 if staffCount is missing
              admin: primaryAdmin,
              additionalAdmins: additionalAdminsCount,
              date: c.createdAt
                ? new Date(c.createdAt).toLocaleDateString()
                : "N/A",

              // Store a raw date timestamp if it exists, otherwise explicitly set to null
              rawDate: c.createdAt ? new Date(c.createdAt).getTime() : null,

              // We store the original array index so we have a fallback order sequence "when it entered the list"
              originalIndex: index,

              color: "primary",
              // Raw fields retained for population during the editing process
              email: c.email || "",
              phone: c.phone || "",
              address: c.address || "",
              taxId: c.taxId || "",
              logo: c.logo || "",
            };
          });
          setCompanies(mappedCompanies);
        }
      } catch (error) {
        console.error("Failed to fetch companies:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompaniesAndRelations();
  }, []);

  // --------------------------------------------------------------------------
  // Fetch Overall Dashboard KPIs
  // --------------------------------------------------------------------------
  useEffect(() => {
    const fetchStats = async () => {
      setIsStatsLoading(true);
      try {
        const response = await getDashboardStats();
        if (response.data && response.data.success) {
          setDashboardStats(response.data.data.stats);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchStats();
  }, []);

  // --------------------------------------------------------------------------
  // Dynamic Extraction of Filter Options
  // --------------------------------------------------------------------------
  const availableSectors = useMemo(() => {
    const sectors = new Set(companies.map((c) => c.industry || "Technology"));
    return ["All", ...Array.from(sectors)].sort();
  }, [companies]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set(companies.map((c) => c.status || "Active"));
    return ["All", ...Array.from(statuses)].sort();
  }, [companies]);

  // --------------------------------------------------------------------------
  // Real-time Search, Sort, and Filter Execution
  // --------------------------------------------------------------------------
  const processedCompanies = useMemo(() => {
    let result = [...companies];

    // 1. Search Filter (Real-time matching against name or industry)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.industry.toLowerCase().includes(searchLower),
      );
    }

    // 2. Sector Filter
    if (sectorFilter !== "All") {
      result = result.filter((c) => c.industry === sectorFilter);
    }

    // 3. Status Filter
    if (statusFilter !== "All") {
      result = result.filter((c) => c.status === statusFilter);
    }

    // 4. Advanced Sorting Logic handles missing dates gracefully
    result.sort((a, b) => {
      if (sortBy === "Newest") {
        // Condition A: Both have valid created dates
        if (a.rawDate && b.rawDate) return b.rawDate - a.rawDate;

        // Condition B: Fallback if date is missing but IDs are sequential numbers (Highest ID = newest)
        if (typeof a.id === "number" && typeof b.id === "number")
          return b.id - a.id;

        // Condition C: Final fallback to when they entered the list (Reversing the array to show latest additions at top)
        return b.originalIndex - a.originalIndex;
      }

      if (sortBy === "Oldest") {
        if (a.rawDate && b.rawDate) return a.rawDate - b.rawDate;
        if (typeof a.id === "number" && typeof b.id === "number")
          return a.id - b.id;
        return a.originalIndex - b.originalIndex;
      }

      if (sortBy === "A-Z") {
        return a.name.localeCompare(b.name);
      }

      return 0;
    });

    return result;
  }, [companies, searchTerm, sectorFilter, statusFilter, sortBy]);

  // --------------------------------------------------------------------------
  // Handle Export Data
  // --------------------------------------------------------------------------
  const handleExportData = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const response = await downloadCompanyAssignmentReport();

      // Determine content type from headers or use default CSV type
      const contentType = response.headers["content-type"] || "text/csv";
      const blob = new Blob([response.data], { type: contentType });

      // Create a URL for the blob
      const downloadUrl = window.URL.createObjectURL(blob);

      // Create a temporary anchor element and trigger download
      const link = document.createElement("a");
      link.href = downloadUrl;

      // Extract filename from header if available, otherwise use default
      let fileName = "company-assignment-report.csv";
      const disposition = response.headers["content-disposition"];
      if (disposition && disposition.includes("attachment")) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          fileName = matches[1].replace(/['"]/g, "");
        }
      }

      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Failed to export data:", error);
      setExportError("Failed to download the report. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenCompanyModal = () => {
    setEditingCompany(null);
    setIsCompanyModalOpen(true);
  };

  const handleEditCompany = (company) => {
    setEditingCompany(company);
    setIsCompanyModalOpen(true);
  };

  const handleCloseCompanyModal = () => {
    setIsCompanyModalOpen(false);
    setEditingCompany(null);
  };

  const handleSuccessRegistration = () => {
    setIsCompanyModalOpen(false);
    setEditingCompany(null);
    // Note: Would trigger data refetch here in complete implementation to show new/updated data
  };

  const hasCompanies = companies.length > 0;

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", p: { xs: 2, md: 4 } }}>
      {/* Header Section */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 2,
          mb: 4,
          pb: 3,
          borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e5e7eb"}`,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, color: "text.primary", mb: 0.5 }}
          >
            Companies Overview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isSuperAdmin
              ? "Unified command center for managing organization records and access."
              : "Manage companies assigned to you."}
          </Typography>
        </Box>

        {isSuperAdmin && (
          <Button
            variant="contained"
            startIcon={<Plus size={20} />}
            onClick={handleOpenCompanyModal}
            sx={{
              bgcolor: "#137fec",
              color: "#fff",
              fontWeight: 700,
              textTransform: "none",
              borderRadius: 2,
              px: 3,
              py: 1.2,
              boxShadow: "0 4px 6px -1px rgba(19, 127, 236, 0.4)",
              "&:hover": { bgcolor: "#1d4ed8" },
            }}
          >
            Register Company
          </Button>
        )}
      </Box>

      {/* KPI Stats Grid */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard
            title="Total Companies"
            value={
              isStatsLoading
                ? "..."
                : (dashboardStats?.totalCompanies ?? companies.length)
            }
            icon={Building}
            colorBg="#eff6ff"
            colorText="#2563eb"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard
            title="Total Staff"
            value={
              isStatsLoading
                ? "..."
                : (dashboardStats?.staffAccounts?.toLocaleString() ?? "--")
            }
            icon={Group}
            colorBg="#f3e8ff"
            colorText="#9333ea"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard
            title="Assigned Admins"
            value={
              isStatsLoading
                ? "..."
                : (dashboardStats?.adminUsers?.toLocaleString() ?? "--")
            }
            icon={ShieldCheck}
            colorBg="#fff7ed"
            colorText="#ea580c"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard
            title="Active"
            value={
              isLoading
                ? "..."
                : companies.filter((c) => c.status === "Active").length
            }
            icon={CheckCircle}
            colorBg="#f0fdf4"
            colorText="#16a34a"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard
            title="Inactive"
            value={
              isLoading
                ? "..."
                : companies.filter((c) => c.status !== "Active").length
            }
            icon={XCircle}
            colorBg="#f3f4f6"
            colorText="#4b5563"
          />
        </Grid>
      </Grid>

      {/* Quick Actions Panel */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
          Quick Actions
        </Typography>

        {/* Display export errors seamlessly above quick actions */}
        {exportError && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            onClose={() => setExportError(null)}
          >
            {exportError}
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <ActionCard
              title="Assign Admin"
              subtitle="Manage company administrators"
              icon={ShieldCheck}
              onClick={() => navigate("/companies/assign-staff")}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <ActionCard
              title="View Inactive"
              subtitle="Filter by inactive status"
              icon={EyeOff}
              onClick={() => {}}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <ActionCard
              title="Export Data"
              subtitle="Download company report"
              icon={Download}
              onClick={handleExportData}
              loading={isExporting}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Real-time Search, Sort & Filters Bar */}
      <Box sx={{ mb: 4 }}>
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: 3,
            bgcolor: isDarkMode ? "#1e2832" : "#ffffff",
            border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
          }}
        >
          <Grid container spacing={2} alignItems="center">
            {/* Real-time Search Input */}
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Search"
                placeholder="By company or sector..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={20} color={theme.palette.text.disabled} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#25303b" : "#f9fafb",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                    },
                  },
                }}
              />
            </Grid>

            {/* Sector Filter Dropdown */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                select
                fullWidth
                label="Sector"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#25303b" : "#f9fafb",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                    },
                  },
                }}
              >
                {availableSectors.map((sector) => (
                  <MenuItem key={sector} value={sector}>
                    {sector}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Status Filter Dropdown */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                select
                fullWidth
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#25303b" : "#f9fafb",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                    },
                  },
                }}
              >
                {availableStatuses.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Sort Dropdown */}
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                select
                fullWidth
                label="Sort By"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: isDarkMode ? "#25303b" : "#f9fafb",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                    },
                  },
                }}
              >
                <MenuItem value="Newest">Newest First</MenuItem>
                <MenuItem value="Oldest">Oldest First</MenuItem>
                <MenuItem value="A-Z">A - Z</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {/* Dynamic Company List Table / Empty State */}
      {hasCompanies || isLoading ? (
        <CompanyList
          companies={processedCompanies}
          role={role}
          loading={isLoading}
          onEditCompany={handleEditCompany}
        />
      ) : (
        <EmptyState
          role={isSuperAdmin ? "SUPER_ADMIN" : "ADMIN"}
          onRegister={handleOpenCompanyModal}
        />
      )}

      {/* Registration / Edit Modal */}
      {isSuperAdmin && (
        <CompanyRegistrationModal
          open={isCompanyModalOpen}
          onClose={handleCloseCompanyModal}
          onSubmit={handleSuccessRegistration}
          initialData={editingCompany}
        />
      )}
    </Box>
  );
};

export default CompanyOverview;
