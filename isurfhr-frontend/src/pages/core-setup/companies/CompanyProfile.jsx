import React, { useState } from "react";
import {
  Box,
  Typography,
  Breadcrumbs,
  Link,
  Button,
  Chip,
  Paper,
  Tabs,
  Tab,
  useTheme,
  alpha,
} from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import EditIcon from "@mui/icons-material/Edit";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined"; // Location
import BusinessCenterOutlinedIcon from "@mui/icons-material/BusinessCenterOutlined"; // Departments
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined"; // Roles/Permissions
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import EditNoteIcon from "@mui/icons-material/EditNote"; // For Edit General Info Tab
import { useLocation } from "react-router-dom";

// Import Components
import CompanyLocations from "./CompanyLocations";
import CompanyGeneralInfo from "./CompanyGeneralInfo";
import CompanyGeneralInfoEdit from "./CompanyGeneralInfoEdit";

const CompanyProfile = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const [activeTab, setActiveTab] = useState(0);
  const [isEditingGeneralInfo, setIsEditingGeneralInfo] = useState(false);

  // Extract the company data passed from the Overview table via Router state
  const location = useLocation();
  const companyData = location.state?.company || null;

  // Use dynamically mapped values or default placeholders
  const displayName =
    companyData?.name || companyData?.companyName || "Global Tech Nigeria Ltd";
  const displayIndustry = companyData?.industry || "Technology";
  const displayLogo =
    companyData?.logo ||
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDCVOuS06LjyS4EBlIeriuF0_nAK_HmUD236QCoaUUBggsTf4h-2yj4uy921QPjUAdMeyidtrDZ-2rFYwWlJmab1aY7IDc8HXhURizdqaVE6hsZrua8SU1T7_MjdZpA7JqJXlaoeDS39Jkc0YnhKZdoF_vFS2U3e2svI8FrGbKuifvjxRyBgv8d8UWLFueUmv__gR94Z151YrvwbDJTiOD0UC54hpiWds_SiTWdt-e91A2Z5hvMmJJET9ClFBZ_xBmpnh7SuGbCY-Hu";
  const displayDate = companyData?.date
    ? new Date(companyData.date).getFullYear()
    : companyData?.rawDate
      ? new Date(companyData.rawDate).getFullYear()
      : "2021";
  const displayStatus = companyData?.status || "Active";

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    // If navigating away from General Info (tab 0), ensure edit mode is off (or handle warn/save)
    if (newValue !== 0) {
      setIsEditingGeneralInfo(false);
    }
  };

  const handleEnterEditMode = () => {
    setActiveTab(0); // Ensure we are on the General Info tab
    setIsEditingGeneralInfo(true);
  };

  const handleSaveGeneralInfo = (data) => {
    console.log("Saving data:", data);
    setIsEditingGeneralInfo(false);
    // Logic to persist data would go here
  };

  const handleCancelEdit = () => {
    setIsEditingGeneralInfo(false);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        p: { xs: 2, sm: 3, md: 4 },
        fontFamily: '"Inter", sans-serif',
      }}
    >
      <Box sx={{ maxWidth: 1280, mx: "auto" }}>
        {/* Breadcrumbs */}
        <Breadcrumbs
          separator={
            <NavigateNextIcon
              fontSize="small"
              sx={{ color: "text.disabled" }}
            />
          }
          aria-label="breadcrumb"
          sx={{ mb: 4 }}
        >
          <Link
            underline="hover"
            color="text.secondary"
            href="#"
            sx={{ fontWeight: 500, fontSize: "0.875rem" }}
          >
            Dashboard
          </Link>
          <Link
            underline="hover"
            color="text.secondary"
            href="#"
            sx={{ fontWeight: 500, fontSize: "0.875rem" }}
          >
            Core Setup
          </Link>
          <Typography
            color="text.primary"
            sx={{ fontWeight: 500, fontSize: "0.875rem" }}
          >
            Company Profile
          </Typography>
        </Breadcrumbs>

        {/* Header Card */}
        {/* Only show Header Card if NOT in edit mode */}
        {!isEditingGeneralInfo && (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 4,
              borderRadius: 3,
              border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
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
              {/* Left: Logo & Info */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Box
                  sx={{
                    position: "relative",
                    width: 96,
                    height: 96,
                    borderRadius: 2,
                    overflow: "hidden",
                    border: `1px solid ${isDarkMode ? "#475569" : "#f1f5f9"}`,
                    bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
                    flexShrink: 0,
                    "&:hover .overlay": { opacity: 1 },
                  }}
                >
                  <Box
                    component="img"
                    src={displayLogo}
                    alt="Company Logo"
                    sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <Box
                    className="overlay"
                    sx={{
                      position: "absolute",
                      inset: 0,
                      bgcolor: "rgba(0,0,0,0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0,
                      transition: "opacity 0.2s",
                      cursor: "pointer",
                    }}
                  >
                    <CameraAltIcon sx={{ color: "#fff" }} />
                  </Box>
                </Box>

                {/* Text Info */}
                <Box>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 700,
                      fontSize: { xs: "1.25rem", sm: "1.5rem" },
                      color: "text.primary",
                      lineHeight: 1.2,
                    }}
                  >
                    {displayName}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary", mt: 0.5, fontWeight: 500 }}
                  >
                    {displayIndustry} • Enterprise Plan
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 1,
                    }}
                  >
                    <Chip
                      label={displayStatus}
                      size="small"
                      icon={
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor:
                              displayStatus === "Active"
                                ? "#16a34a"
                                : "#9ca3af",
                          }}
                        />
                      }
                      sx={{
                        height: 24,
                        bgcolor:
                          displayStatus === "Active"
                            ? isDarkMode
                              ? alpha("#16a34a", 0.2)
                              : "#f0fdf4"
                            : isDarkMode
                              ? alpha("#9ca3af", 0.2)
                              : "#f3f4f6",
                        color:
                          displayStatus === "Active"
                            ? isDarkMode
                              ? "#4ade80"
                              : "#15803d"
                            : isDarkMode
                              ? "#cbd5e1"
                              : "#4b5563",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        border: `1px solid ${
                          displayStatus === "Active"
                            ? isDarkMode
                              ? alpha("#16a34a", 0.3)
                              : "#bbf7d0"
                            : isDarkMode
                              ? alpha("#9ca3af", 0.3)
                              : "#e5e7eb"
                        }`,
                        "& .MuiChip-icon": { ml: 0.5, mr: -0.5 },
                        pl: 0.5,
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary" }}
                    >
                      Since {displayDate}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Right: Actions */}
              <Box
                sx={{
                  display: "flex",
                  gap: 1.5,
                  width: { xs: "100%", md: "auto" },
                  mt: { xs: 2, md: 0 },
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<EditIcon sx={{ fontSize: 18 }} />}
                  onClick={handleEnterEditMode}
                  sx={{
                    flex: 1,
                    whiteSpace: "nowrap",
                    borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                    color: "text.primary",
                    textTransform: "none",
                    fontWeight: 600,
                    "&:hover": {
                      bgcolor: isDarkMode ? "#334155" : "#f8fafc",
                      borderColor: isDarkMode ? "#64748b" : "#94a3b8",
                    },
                  }}
                >
                  Edit General Info
                </Button>
              </Box>
            </Box>
          </Paper>
        )}

        {/* Navigation Tabs */}
        <Box
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            mb: 4,
            overflowX: "auto",
          }}
        >
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="company profile tabs"
            sx={{
              minHeight: "auto",
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.875rem",
                minHeight: 48,
                px: 2,
                mr: 2,
                color: "text.secondary",
                "&.Mui-selected": { color: "#137fec" },
              },
              "& .MuiTabs-indicator": { bgcolor: "#137fec", height: 2 },
            }}
          >
            <Tab
              icon={
                isEditingGeneralInfo && activeTab === 0 ? (
                  <EditNoteIcon sx={{ fontSize: 20, mb: 0, mr: 1 }} />
                ) : (
                  <InfoOutlinedIcon sx={{ fontSize: 20, mb: 0, mr: 1 }} />
                )
              }
              iconPosition="start"
              label={
                isEditingGeneralInfo && activeTab === 0
                  ? "Edit General Info"
                  : "General Info"
              }
            />
            <Tab
              icon={<PlaceOutlinedIcon sx={{ fontSize: 20, mb: 0, mr: 1 }} />}
              iconPosition="start"
              label="Locations / Branches"
            />
            <Tab
              icon={
                <BusinessCenterOutlinedIcon
                  sx={{ fontSize: 20, mb: 0, mr: 1 }}
                />
              }
              iconPosition="start"
              label="Departments"
            />
            <Tab
              icon={<VpnKeyOutlinedIcon sx={{ fontSize: 20, mb: 0, mr: 1 }} />}
              iconPosition="start"
              label="Roles & Permissions"
            />
          </Tabs>
        </Box>

        {/* Content Area */}
        <Box>
          {activeTab === 0 &&
            (isEditingGeneralInfo ? (
              <CompanyGeneralInfoEdit
                onSave={handleSaveGeneralInfo}
                onCancel={handleCancelEdit}
                initialData={companyData}
              />
            ) : (
              <CompanyGeneralInfo companyData={companyData} />
            ))}
          {activeTab === 1 && <CompanyLocations />}
          {activeTab === 2 && (
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ py: 8 }}
            >
              Departments Content Placeholder
            </Typography>
          )}
          {activeTab === 3 && (
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ py: 8 }}
            >
              Roles & Permissions Content Placeholder
            </Typography>
          )}
        </Box>

        {/* Footer Help Link */}
        <Box sx={{ mt: 4, display: "flex", justifyContent: "flex-end" }}>
          <Link
            href="#"
            underline="hover"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: "0.75rem",
              color: "text.secondary",
              "&:hover": { color: "#137fec" },
            }}
          >
            <HelpOutlineIcon sx={{ fontSize: 16 }} />
            Need help setting up your profile?
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default CompanyProfile;
