import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  useTheme,
  alpha,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Pagination,
  PaginationItem,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  MapPin,
  Plus,
  List as ListIcon,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
} from "lucide-react";
import AddLocationModal from "./AddLocationModal";
import DeleteLocationModal from "./DeleteLocationModal";

// Mock Data for Locations (Updated with staff count for testing logic)
const MOCK_LOCATIONS = [
  {
    id: 1,
    name: "Lagos HQ",
    code: "LGS-001",
    address: "15A Victoria Island, Ozumba Mbadiwe Ave",
    state: "Lagos",
    region: "Lagos State",
    type: "Head Office",
    color: "purple",
    staffCount: 45, // Example: has staff
  },
  {
    id: 2,
    name: "Abuja Central",
    code: "ABJ-024",
    address: "Plot 1129, Central Business District",
    state: "Abuja",
    region: "FCT Abuja",
    type: "Branch",
    color: "blue",
    staffCount: 12, // Example: has staff
  },
  {
    id: 3,
    name: "Port Harcourt Hub",
    code: "PHC-088",
    address: "45 Aba Road, Opposite GRA Junction",
    state: "Rivers",
    region: "Rivers State",
    type: "Branch",
    color: "blue",
    staffCount: 0, // Example: no staff (can delete)
  },
  {
    id: 4,
    name: "Kano Operations",
    code: "KAN-012",
    address: "12 Bello Road, Nassarawa GRA",
    state: "Kano",
    region: "Kano State",
    type: "Branch",
    color: "blue",
    staffCount: 5,
  },
];

const EmptyState = ({ isDark, theme, onAdd }) => (
  <Box
    sx={{
      position: "relative",
      width: "100%",
      borderRadius: 3,
      border: "2px dashed",
      borderColor: isDark ? theme.palette.divider : "#cbd5e1",
      bgcolor: isDark ? alpha(theme.palette.background.paper, 0.5) : "#f8fafc",
      p: { xs: 4, md: 8 },
      textAlign: "center",
      transition: "background-color 0.2s",
      "&:hover": {
        bgcolor: isDark ? theme.palette.background.paper : "#f1f5f9",
      },
    }}
  >
    <Box
      sx={{
        maxWidth: 450,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
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
          mb: 2,
        }}
      >
        <MapPin size={32} />
      </Box>

      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          color: "text.primary",
          mb: 1,
        }}
      >
        Branch Configuration
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          lineHeight: 1.6,
          mb: 4,
        }}
      >
        You currently have no detailed branch configurations selected. Select an
        existing branch from the list or add a new location to get started.
      </Typography>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Button
          variant="outlined"
          startIcon={<ListIcon size={18} />}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            color: "text.primary",
            borderColor: isDark ? theme.palette.divider : "#cbd5e1",
            bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
            "&:hover": {
              borderColor: theme.palette.divider,
              bgcolor: isDark ? "rgba(255,255,255,0.1)" : "#f8fafc",
            },
          }}
        >
          View Existing Branches
        </Button>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={onAdd}
          sx={{
            bgcolor: "#137fec",
            color: "#fff",
            textTransform: "none",
            fontWeight: 600,
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            "&:hover": { bgcolor: "#1d4ed8" },
          }}
        >
          Add New Location
        </Button>
      </Box>
    </Box>
  </Box>
);

const CompanyLocations = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [locations, setLocations] = useState(MOCK_LOCATIONS);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null); // For edit/delete

  // Menu State
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuLocation, setMenuLocation] = useState(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  // Add/Edit Handlers
  const handleOpenAddModal = () => {
    setSelectedLocation(null); // Ensure clean state for new
    setIsAddModalOpen(true);
  };

  const handleEditLocation = () => {
    setSelectedLocation(menuLocation);
    setIsAddModalOpen(true);
    handleCloseMenu();
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setSelectedLocation(null);
  };

  // Delete Handlers
  const handleDeleteClick = () => {
    setSelectedLocation(menuLocation);
    setIsDeleteModalOpen(true);
    handleCloseMenu();
  };

  const handleConfirmDelete = () => {
    if (selectedLocation) {
      console.log("Deleting location:", selectedLocation.name);
      // Remove from state using setLocations
      setLocations((prev) =>
        prev.filter((loc) => loc.id !== selectedLocation.id),
      );
    }
    setIsDeleteModalOpen(false);
    setSelectedLocation(null);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setSelectedLocation(null);
  };

  // Menu Handlers
  const handleOpenMenu = (event, location) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuLocation(location);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setMenuLocation(null);
  };

  // Check if locations exist
  if (!locations || locations.length === 0) {
    return (
      <>
        <EmptyState isDark={isDark} theme={theme} onAdd={handleOpenAddModal} />
        <AddLocationModal open={isAddModalOpen} onClose={handleCloseAddModal} />
      </>
    );
  }

  // Pagination Calculation
  const pageCount = Math.ceil(locations.length / rowsPerPage);
  const displayedRows = locations.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          bgcolor: isDark ? "#1e293b" : "#ffffff",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 3,
            borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { sm: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, color: "text.primary" }}
            >
              Company Locations
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mt: 0.5 }}
            >
              Manage and organize your company offices and operational hubs.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Plus size={20} />}
            onClick={handleOpenAddModal}
            sx={{
              bgcolor: "#137fec",
              color: "#fff",
              textTransform: "none",
              fontWeight: 600,
              boxShadow: "none",
              "&:hover": { bgcolor: "#1d4ed8", boxShadow: "none" },
            }}
          >
            Add Location
          </Button>
        </Box>

        {/* Table */}
        <TableContainer>
          <Table>
            <TableHead
              sx={{
                bgcolor: isDark ? alpha("#0f172a", 0.5) : "#f8fafc",
              }}
            >
              <TableRow>
                <TableCell
                  sx={{
                    py: 2,
                    px: 3,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
                  }}
                >
                  Branch Name
                </TableCell>
                <TableCell
                  sx={{
                    py: 2,
                    px: 3,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
                  }}
                >
                  Address
                </TableCell>
                <TableCell
                  sx={{
                    py: 2,
                    px: 3,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
                  }}
                >
                  State / Region
                </TableCell>
                <TableCell
                  sx={{
                    py: 2,
                    px: 3,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
                  }}
                >
                  Type
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    py: 2,
                    px: 3,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
                  }}
                >
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedRows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{
                    cursor: "pointer",
                    "&:last-child td, &:last-child th": { border: 0 },
                    transition: "background-color 0.2s",
                  }}
                >
                  <TableCell sx={{ py: 2, px: 3 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: "text.primary" }}
                    >
                      {row.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        display: "block",
                        mt: 0.5,
                      }}
                    >
                      Code: {row.code}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 2, px: 3, maxWidth: 300 }}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ color: "text.secondary" }}
                    >
                      {row.address}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 2, px: 3 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      {row.region}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 2, px: 3 }}>
                    <Chip
                      label={row.type}
                      size="small"
                      icon={
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor:
                              row.color === "purple" ? "#9333ea" : "#2563eb",
                          }}
                        />
                      }
                      sx={{
                        height: 24,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        pl: 0.5,
                        bgcolor:
                          row.color === "purple"
                            ? isDark
                              ? alpha("#9333ea", 0.2)
                              : "#f3e8ff"
                            : isDark
                              ? alpha("#2563eb", 0.2)
                              : "#eff6ff",
                        color:
                          row.color === "purple"
                            ? isDark
                              ? "#d8b4fe"
                              : "#7e22ce"
                            : isDark
                              ? "#93c5fd"
                              : "#1d4ed8",
                        border: `1px solid ${
                          row.color === "purple"
                            ? isDark
                              ? alpha("#9333ea", 0.3)
                              : "#e9d5ff"
                            : isDark
                              ? alpha("#2563eb", 0.3)
                              : "#bfdbfe"
                        }`,
                        "& .MuiChip-icon": {
                          ml: 0.5,
                          mr: -0.5,
                          color: "inherit",
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ py: 2, px: 3 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenMenu(e, row)}
                      sx={{
                        color: "text.secondary",
                        "&:hover": {
                          bgcolor: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
                          color: "text.primary",
                        },
                      }}
                    >
                      <MoreVertical size={18} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination Footer */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            borderTop: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
            bgcolor: isDark ? alpha("#0f172a", 0.3) : "#f8fafc",
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
                    "&:hover": {
                      backgroundColor: "rgba(19, 127, 236, 0.9)",
                    },
                  },
                  "&:hover": {
                    backgroundColor: isDark ? "#334155" : "#e2e8f0",
                  },
                }}
              />
            )}
          />
        </Box>
      </Paper>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        PaperProps={{
          sx: {
            minWidth: 160,
            borderRadius: 2,
            boxShadow:
              "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
            bgcolor: isDark ? "#1e293b" : "#ffffff",
          },
        }}
      >
        <MenuItem onClick={handleEditLocation}>
          <ListItemIcon>
            <Edit size={16} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: "0.875rem" }}>
            Edit Location
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <Trash2 size={16} color={theme.palette.error.main} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: "0.875rem" }}>
            Delete Location
          </ListItemText>
        </MenuItem>
      </Menu>

      {/* Modals */}
      <AddLocationModal
        open={isAddModalOpen}
        onClose={handleCloseAddModal}
        initialData={selectedLocation}
      />

      <DeleteLocationModal
        open={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        locationData={selectedLocation}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};

export default CompanyLocations;
