import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Avatar,
  Chip,
  Grid,
  useTheme,
  Divider,
  IconButton,
  Snackbar,
  Alert,
  Drawer,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import MailIcon from "@mui/icons-material/Mail";
import CallIcon from "@mui/icons-material/Call";
import DownloadIcon from "@mui/icons-material/Download";
import EditNoteIcon from "@mui/icons-material/EditNote";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import UndoIcon from "@mui/icons-material/Undo";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useNavigate, useLocation } from "react-router-dom";
import * as mammoth from "mammoth"; // Imported mammoth for DOCX parsing

// Import the Modal
import InterviewSchedulingModal from "./InterviewSchedulingModal.jsx";

// Import Services
import {
  viewApplicantCV,
  downloadApplicantCV,
} from "@/services/RecruitmentService";

/**
 * ApplicantDetailView Component
 * Displays the complete profile and evaluation of a candidate.
 * * Supports two rendering modes:
 * 1. Full Page (asDrawer = false)
 * 2. Side Drawer (asDrawer = true) - Triggered smoothly from the Kanban board
 *
 * @param {boolean} asDrawer - Toggles whether to wrap content in a Drawer
 * @param {boolean} open - Required if asDrawer is true
 * @param {function} onClose - Required if asDrawer is true
 * @param {number|string} applicantId - Currently selected applicant
 * @param {object} applicantData - Explicitly passed applicant data (optional)
 */
const ApplicantDetailView = ({
  asDrawer,
  open,
  onClose,
  applicantId,
  applicantData,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve candidate data
  const candidateData = applicantData || location.state?.applicant || null;

  // Extract details
  const firstName =
    candidateData?.metadata?.firstName ||
    candidateData?.candidate?.firstName ||
    "";
  const lastName =
    candidateData?.metadata?.lastName ||
    candidateData?.candidate?.lastName ||
    "";
  let computedName = `${firstName} ${lastName}`.trim();
  if (!computedName) {
    computedName = candidateData?.candidateId
      ? `Applicant (${candidateData.candidateId.substring(0, 6)})`
      : "Unknown Applicant";
  }
  const computedEmail =
    candidateData?.metadata?.email ||
    candidateData?.candidate?.email ||
    "No email available";
  const computedPhone =
    candidateData?.metadata?.phone ||
    candidateData?.candidate?.phone ||
    "No phone available";
  const computedRole = candidateData?.job?.title || "Unspecified Role";
  const matchScore = candidateData?.score ? `${candidateData.score}%` : "N/A";
  const initials =
    firstName && lastName
      ? `${firstName[0]}${lastName[0]}`.toUpperCase()
      : computedName.substring(0, 2).toUpperCase();

  // State
  const [status, setStatus] = useState(
    candidateData?.status ? candidateData.status : "Pending",
  );
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);

  // CV Viewing States
  const [cvUrl, setCvUrl] = useState(null);
  const [docxHtml, setDocxHtml] = useState(null); // State to hold generated HTML from mammoth
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState(null);
  const [isPreviewable, setIsPreviewable] = useState(true);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // Action Menu State
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState(null);
  const isActionMenuOpen = Boolean(actionMenuAnchorEl);

  // Load CV logic
  useEffect(() => {
    let currentUrl = null;
    const loadCV = async () => {
      const idToFetch = applicantId || candidateData?.id;
      if (!idToFetch || !candidateData?.cvFileId) {
        setCvError("No CV document available for this applicant.");
        return;
      }

      setCvLoading(true);
      setCvError(null);
      setDocxHtml(null); // Reset DOCX HTML state on load

      try {
        const response = await viewApplicantCV(idToFetch);

        const contentType = response.headers?.["content-type"] || "";
        const fileName = (candidateData?.cvFileName || "").toLowerCase();

        // Check formats
        const isDocx =
          contentType.includes("wordprocessingml") ||
          fileName.endsWith(".docx");
        const canPreviewNative =
          contentType.includes("pdf") ||
          contentType.includes("image") ||
          fileName.endsWith(".pdf") ||
          fileName.endsWith(".png") ||
          fileName.endsWith(".jpg") ||
          fileName.endsWith(".jpeg");

        if (isDocx) {
          try {
            // Extract the binary array buffer from the downloaded blob
            const arrayBuffer = await response.data.arrayBuffer();
            // Run mammoth conversion
            const result = await mammoth.convertToHtml({ arrayBuffer });
            setDocxHtml(result.value);
            setIsPreviewable(true);
          } catch (mammothErr) {
            console.error("Mammoth DOCX conversion failed:", mammothErr);
            setIsPreviewable(false); // If conversion fails, fallback to download prompt
          }
        } else if (canPreviewNative) {
          const blobType = contentType || "application/octet-stream";
          const blob = new Blob([response.data], { type: blobType });
          currentUrl = URL.createObjectURL(blob);
          setCvUrl(currentUrl);
          setIsPreviewable(true);
        } else {
          // Unsupported format (e.g. .doc, .xlsx)
          setIsPreviewable(false);
        }
      } catch (err) {
        console.error("Failed to load CV:", err);
        setCvError(
          "Failed to load CV document. It might be unavailable or unsupported.",
        );
      } finally {
        setCvLoading(false);
      }
    };

    loadCV();

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [applicantId, candidateData]);

  // Download Handler
  const handleDownloadOriginal = async () => {
    const idToFetch = applicantId || candidateData?.id;
    if (!idToFetch) return;

    try {
      const response = await downloadApplicantCV(idToFetch);
      const contentType =
        response.headers?.["content-type"] || "application/pdf";
      const blob = new Blob([response.data], { type: contentType });
      const downloadUrl = window.URL.createObjectURL(blob);

      let fileName = candidateData?.cvFileName || "Applicant_CV.pdf";
      const disposition = response.headers?.["content-disposition"];
      if (disposition && disposition.includes("attachment")) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          fileName = matches[1].replace(/['"]/g, "");
        }
      }

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSnackbar({
        open: true,
        message: "CV downloaded successfully.",
        severity: "success",
      });
    } catch (err) {
      console.error("Download failed:", err);
      setSnackbar({
        open: true,
        message: "Failed to download CV.",
        severity: "error",
      });
    }
  };

  // Menu Handlers
  const handleActionMenuOpen = (event) => {
    setActionMenuAnchorEl(event.currentTarget);
  };
  const handleActionMenuClose = () => {
    setActionMenuAnchorEl(null);
  };

  // Status Handlers
  const handleOpenInterviewModal = () => {
    setIsInterviewModalOpen(true);
    handleActionMenuClose();
  };

  const handleCloseInterviewModal = () => {
    setIsInterviewModalOpen(false);
  };

  const handleShortlist = () => {
    setStatus("Shortlisted");
    setSnackbar({
      open: true,
      message: "Applicant has been successfully shortlisted.",
      severity: "success",
    });
    handleActionMenuClose();
  };

  const handleReject = () => {
    setStatus("Rejected");
    setSnackbar({
      open: true,
      message: "Applicant has been marked as rejected.",
      severity: "info",
    });
    handleActionMenuClose();
  };

  const handleUndoStatus = () => {
    setStatus("Pending");
    setSnackbar({
      open: true,
      message: "Status reset to Pending.",
      severity: "info",
    });
    handleActionMenuClose();
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Navigates back if it's a page, or closes the drawer if it's a drawer
  const handleBack = () => {
    if (asDrawer && onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  };

  // The core content extracted so it can be dynamically wrapped
  const viewContent = (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
        color: isDarkMode ? "#f1f5f9" : "#0f172a",
        fontFamily: '"Inter", sans-serif',
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pt: { xs: 3, md: asDrawer ? 4 : 5 },
        px: { xs: 2, sm: 3, md: asDrawer ? 4 : 3 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: "1280px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          flex: 1,
        }}
      >
        {/* Page Header & Actions Row */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box>
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
              {asDrawer ? <>&larr; Close Details</> : <>&larr; Back to List</>}
            </Button>
            <Typography
              variant="h4"
              component="h2"
              sx={{
                fontWeight: 700,
                fontSize: "2rem",
                color: isDarkMode ? "#ffffff" : "#0d141b",
                lineHeight: 1.2,
                mb: 1,
              }}
            >
              Applicant Details
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
            >
              Complete profile and evaluation for the selected candidate
            </Typography>
          </Box>

          {/* Top-Right Action Menu (Only shown in Drawer view) */}
          {asDrawer && (
            <Box sx={{ pt: { xs: 0, sm: 5.5 } }}>
              <Button
                variant="contained"
                onClick={handleActionMenuOpen}
                endIcon={<ExpandMoreIcon />}
                sx={{
                  bgcolor: "#137fec",
                  color: "#ffffff",
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2,
                  px: 3,
                  boxShadow: "0 4px 6px -1px rgba(19, 127, 236, 0.2)",
                  "&:hover": {
                    bgcolor: "#1170d0",
                  },
                }}
              >
                Actions
              </Button>
              <Menu
                anchorEl={actionMenuAnchorEl}
                open={isActionMenuOpen}
                PaperProps={{
                  elevation: 0,
                  sx: {
                    overflow: "visible",
                    filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.15))",
                    mt: 1,
                    bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                    color: isDarkMode ? "#e2e8f0" : "#1e293b",
                    border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                    borderRadius: 2,
                    minWidth: 200,
                  },
                }}
                transformOrigin={{ horizontal: "right", vertical: "top" }}
                anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              >
                {status === "Pending" ? (
                  [
                    <MenuItem key="schedule" onClick={handleOpenInterviewModal}>
                      <ListItemIcon>
                        <CalendarMonthIcon
                          fontSize="small"
                          sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                        />
                      </ListItemIcon>
                      <ListItemText primary="Schedule Interview" />
                    </MenuItem>,
                    <MenuItem key="shortlist" onClick={handleShortlist}>
                      <ListItemIcon>
                        <CheckCircleIcon
                          fontSize="small"
                          sx={{ color: "#10b981" }}
                        />
                      </ListItemIcon>
                      <ListItemText primary="Shortlist" />
                    </MenuItem>,
                    <Divider
                      key="divider"
                      sx={{
                        my: 0.5,
                        borderColor: isDarkMode ? "#334155" : "#e5e7eb",
                      }}
                    />,
                    <MenuItem
                      key="reject"
                      onClick={handleReject}
                      sx={{ color: "#ef4444" }}
                    >
                      <ListItemIcon>
                        <CancelIcon
                          fontSize="small"
                          sx={{ color: "#ef4444" }}
                        />
                      </ListItemIcon>
                      <ListItemText primary="Reject" />
                    </MenuItem>,
                  ]
                ) : (
                  <MenuItem onClick={handleUndoStatus}>
                    <ListItemIcon>
                      <UndoIcon
                        fontSize="small"
                        sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                      />
                    </ListItemIcon>
                    <ListItemText primary="Undo Decision" />
                  </MenuItem>
                )}
              </Menu>
            </Box>
          )}
        </Box>

        {/* Candidate Identity Bar */}
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            bgcolor: isDarkMode ? "#1A2632" : "#f8fafc",
            border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            borderRadius: 2,
            px: 3,
            py: 2,
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <AccountCircleIcon
              sx={{ fontSize: 32, color: isDarkMode ? "#94a3b8" : "#94a3b8" }}
            />
            <Typography
              variant="body1"
              sx={{
                fontSize: "1.125rem",
                fontWeight: 500,
                color: isDarkMode ? "#fff" : "#0d141b",
              }}
            >
              Candidate Name:{" "}
              <Box component="span" sx={{ fontWeight: 700 }}>
                {computedName}
              </Box>
            </Typography>
            {/* Status Badge in Header (Updates dynamically) */}
            {status !== "Pending" && (
              <Chip
                label={status}
                size="small"
                color={
                  status.toLowerCase().includes("shortlist") ||
                  status.toLowerCase().includes("hire")
                    ? "success"
                    : status.toLowerCase().includes("reject")
                      ? "error"
                      : "default"
                }
                sx={{ ml: 1, fontWeight: 700, textTransform: "capitalize" }}
              />
            )}
          </Box>

          {/* Match Score (Only shown in Drawer view) */}
          {asDrawer && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: isDarkMode ? "#94a3b8" : "#64748b",
                }}
              >
                Match Score
              </Typography>
              <Box
                sx={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: `4px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                  borderRightColor: "#137fec",
                  borderTopColor: "#137fec",
                  borderBottomColor: "#137fec",
                  transform: "rotate(-45deg)",
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: "rotate(45deg)",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#137fec",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                    }}
                  >
                    {matchScore}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </Paper>

        {/* Main Content Grid */}
        <Grid container spacing={3} sx={{ flexGrow: 1 }}>
          {/* Left Column: CV Preview Card */}
          <Grid
            size={{ xs: 12, lg: asDrawer ? 8 : 12 }}
            sx={{ display: "flex", flexDirection: "column" }}
          >
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                bgcolor: isDarkMode ? "#1A2632" : "#ffffff",
                border: `1px solid ${"#137fec"}`,
                borderRadius: 2,
                overflow: "hidden",
                boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
              }}
            >
              {/* CV Header */}
              <Box
                sx={{
                  p: 3,
                  borderBottom: `1px solid ${
                    isDarkMode ? "#334155" : "#f1f5f9"
                  }`,
                  display: "flex",
                  flexDirection: { xs: "column", md: "row" },
                  justifyContent: "space-between",
                  alignItems: { xs: "flex-start", md: "flex-start" },
                  gap: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 700, color: "#137fec", mb: 0.5 }}
                  >
                    {computedName}
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 600,
                      color: isDarkMode ? "#e2e8f0" : "#1e293b",
                      fontSize: "1.125rem",
                    }}
                  >
                    {computedRole}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: { xs: "flex-start", md: "flex-end" },
                    gap: 0.5,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      color: "#137fec",
                    }}
                  >
                    <MailIcon sx={{ fontSize: 16 }} />
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 500, fontSize: "0.875rem" }}
                    >
                      {computedEmail}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      color: "#137fec",
                    }}
                  >
                    <CallIcon sx={{ fontSize: 16 }} />
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 500, fontSize: "0.875rem" }}
                    >
                      {computedPhone}
                    </Typography>
                  </Box>
                  <Button
                    onClick={handleDownloadOriginal}
                    startIcon={
                      <DownloadIcon sx={{ fontSize: "16px !important" }} />
                    }
                    sx={{
                      mt: 1,
                      bgcolor: isDarkMode
                        ? "rgba(19, 127, 236, 0.2)"
                        : "rgba(19, 127, 236, 0.1)",
                      color: "#137fec",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.025em",
                      "&:hover": {
                        bgcolor: isDarkMode
                          ? "rgba(19, 127, 236, 0.3)"
                          : "rgba(19, 127, 236, 0.2)",
                      },
                    }}
                  >
                    Download Original
                  </Button>
                </Box>
              </Box>

              {/* CV Body Rendering logic */}
              <Box
                sx={{
                  p: 0,
                  overflowY: "auto",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "500px",
                }}
              >
                {cvLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      flex: 1,
                    }}
                  >
                    <CircularProgress />
                  </Box>
                ) : cvError ? (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      flex: 1,
                      p: 4,
                    }}
                  >
                    <Alert severity="warning">{cvError}</Alert>
                  </Box>
                ) : docxHtml ? (
                  <Box
                    sx={{
                      flex: 1,
                      width: "100%",
                      height: "100%",
                      minHeight: "600px",
                      bgcolor: "transparent",
                      color: isDarkMode ? "#e2e8f0" : "#1e293b",
                      p: { xs: 2, sm: 4, md: 6 },
                      overflowY: "auto",
                    }}
                  >
                    <Box
                      dangerouslySetInnerHTML={{ __html: docxHtml }}
                      sx={{
                        maxWidth: "800px",
                        mx: "auto",
                        fontFamily: '"Inter", sans-serif',
                        lineHeight: 1.7,
                        "& h1, & h2, & h3, & h4, & h5, & h6": {
                          mt: 3,
                          mb: 1.5,
                          fontWeight: 700,
                          color: isDarkMode ? "#ffffff" : "#0f172a",
                        },
                        "& p": {
                          mb: 2,
                          color: isDarkMode ? "#cbd5e1" : "#475569",
                        },
                        "& ul, & ol": {
                          mb: 2,
                          pl: 3,
                          color: isDarkMode ? "#cbd5e1" : "#475569",
                        },
                        "& li": { mb: 1 },
                        "& table": {
                          width: "100%",
                          borderCollapse: "collapse",
                          mb: 2,
                        },
                        "& th, & td": {
                          border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                          p: 1.5,
                        },
                        "& a": {
                          color: "#137fec",
                          textDecoration: "underline",
                        },
                      }}
                    />
                  </Box>
                ) : cvUrl ? (
                  isPreviewable ? (
                    <Box
                      sx={{
                        flex: 1,
                        width: "100%",
                        height: "100%",
                        minHeight: "600px",
                      }}
                    >
                      <iframe
                        src={cvUrl}
                        width="100%"
                        height="100%"
                        style={{
                          border: "none",
                          minHeight: "600px",
                          display: "block",
                        }}
                        title="CV Viewer"
                      />
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        flex: 1,
                        p: 4,
                        textAlign: "center",
                        bgcolor: isDarkMode
                          ? "rgba(255,255,255,0.02)"
                          : "#f8fafc",
                      }}
                    >
                      <DescriptionOutlinedIcon
                        sx={{
                          fontSize: 64,
                          color: isDarkMode ? "#475569" : "#cbd5e1",
                          mb: 2,
                        }}
                      />
                      <Typography
                        variant="h6"
                        color="text.primary"
                        gutterBottom
                      >
                        Browser Preview Not Supported
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 3, maxWidth: 400 }}
                      >
                        This document format (
                        {candidateData?.cvFileName
                          ?.split(".")
                          .pop()
                          ?.toUpperCase() || "DOCUMENT"}
                        ) cannot be viewed directly inside the browser. Please
                        download the file to view it securely on your device.
                      </Typography>
                      <Button
                        variant="contained"
                        startIcon={<DownloadIcon />}
                        onClick={handleDownloadOriginal}
                        sx={{
                          bgcolor: "#137fec",
                          "&:hover": { bgcolor: "#1170d0" },
                          textTransform: "none",
                          fontWeight: 600,
                        }}
                      >
                        Download Document
                      </Button>
                    </Box>
                  )
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      flex: 1,
                      p: 4,
                    }}
                  >
                    <Typography variant="body1" color="text.secondary">
                      No CV document available for this applicant.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>

          {/* Right Column: AI Match & Context (Only shown in Drawer view) */}
          {asDrawer && (
            <Grid
              size={{ xs: 12, lg: 4 }}
              sx={{ display: "flex", flexDirection: "column", gap: 3 }}
            >
              {/* AI Match Analysis Card */}
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  bgcolor: isDarkMode ? "#1A2632" : "#ffffff",
                  border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                  borderRadius: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Score Chart */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      alignSelf: "flex-start",
                      fontSize: "1.125rem",
                      color: isDarkMode ? "#fff" : "#0f172a",
                    }}
                  >
                    AI Match Analysis
                  </Typography>
                  <Box sx={{ position: "relative", width: 160, height: 160 }}>
                    <svg width="100%" height="100%" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={isDarkMode ? "#334155" : "#f1f5f9"}
                        strokeWidth="3.5"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#137fec"
                        strokeDasharray="85, 100"
                        strokeLinecap="round"
                        strokeWidth="3.5"
                        style={{
                          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                        }}
                      />
                    </svg>
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 700,
                          color: isDarkMode ? "#fff" : "#0f172a",
                        }}
                      >
                        85%
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 600,
                          textTransform: "uppercase",
                          color: isDarkMode ? "#94a3b8" : "#64748b",
                        }}
                      >
                        Overall Match
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Skills Scores */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: isDarkMode ? "#94a3b8" : "#64748b",
                    }}
                  >
                    Skill Scores
                  </Typography>

                  {[
                    { label: "Visual Design", val: "92%", color: "#137fec" },
                    { label: "Prototyping", val: "88%", color: "#137fec" },
                    { label: "Communication", val: "90%", color: "#137fec" },
                    { label: "Coding (React)", val: "60%", color: "#fbbf24" },
                  ].map((skill, index) => (
                    <Box key={index}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            color: isDarkMode ? "#cbd5e1" : "#334155",
                          }}
                        >
                          {skill.label}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: isDarkMode ? "#fff" : "#0f172a",
                          }}
                        >
                          {skill.val}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          height: 8,
                          width: "100%",
                          bgcolor: isDarkMode ? "#334155" : "#f1f5f9",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            height: "100%",
                            width: skill.val,
                            bgcolor: skill.color,
                            borderRadius: 4,
                          }}
                        />
                      </Box>
                    </Box>
                  ))}
                </Box>

                <Divider
                  sx={{ borderColor: isDarkMode ? "#334155" : "#f1f5f9" }}
                />

                {/* Keywords */}
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: isDarkMode ? "#94a3b8" : "#64748b",
                    }}
                  >
                    Keywords Matched
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {[
                      "UI/UX",
                      "Figma",
                      "Design Systems",
                      "User Research",
                      "Agile",
                      "HTML/CSS",
                    ].map((kw) => (
                      <Chip
                        key={kw}
                        label={kw}
                        size="small"
                        sx={{
                          fontWeight: 500,
                          fontSize: "0.75rem",
                          bgcolor: isDarkMode ? "#1e293b" : "#e7edf3",
                          color: isDarkMode ? "#e2e8f0" : "#0d141b",
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Paper>

              {/* Recruiter Notes Section */}
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  bgcolor: isDarkMode ? "rgba(19, 127, 236, 0.1)" : "#f0f9ff",
                  border: `1px solid ${
                    isDarkMode ? "rgba(19, 127, 236, 0.3)" : "#bae6fd"
                  }`,
                  borderRadius: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    color: "#137fec",
                  }}
                >
                  <EditNoteIcon />
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      textTransform: "uppercase",
                      fontSize: "0.875rem",
                    }}
                  >
                    Recruiter Notes
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: isDarkMode ? "#e2e8f0" : "#334155",
                    lineHeight: 1.6,
                  }}
                >
                  Strong visual design skills evident in portfolio, particularly
                  in the Fintech case study. The candidate communicates clearly
                  and has a solid understanding of product strategy. Needs
                  verification on React proficiency during the technical
                  interview, as their background is primarily design-focused.
                  Overall, a very strong contender for the Senior role.
                </Typography>
              </Paper>

              {/* Status Indicator (Only shown if a decision was made) */}
              {status !== "Pending" && (
                <Box sx={{ mt: "auto" }}>
                  <Paper
                    sx={{
                      p: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      bgcolor:
                        status === "Shortlisted"
                          ? isDarkMode
                            ? "rgba(16, 185, 129, 0.2)"
                            : "#ecfdf5"
                          : isDarkMode
                            ? "rgba(239, 68, 68, 0.2)"
                            : "#fef2f2",
                      border: `1px solid ${
                        status === "Shortlisted"
                          ? isDarkMode
                            ? "rgba(16, 185, 129, 0.4)"
                            : "#6ee7b7"
                          : isDarkMode
                            ? "rgba(239, 68, 68, 0.4)"
                            : "#fca5a5"
                      }`,
                      borderRadius: 2,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      {status === "Shortlisted" ? (
                        <CheckCircleIcon
                          sx={{ color: "#10b981", fontSize: 32 }}
                        />
                      ) : (
                        <CancelIcon sx={{ color: "#ef4444", fontSize: 32 }} />
                      )}
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 700,
                            color:
                              status === "Shortlisted"
                                ? isDarkMode
                                  ? "#34d399"
                                  : "#047857"
                                : isDarkMode
                                  ? "#f87171"
                                  : "#b91c1c",
                          }}
                        >
                          {status === "Shortlisted"
                            ? "Shortlisted"
                            : "Rejected"}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color:
                              status === "Shortlisted"
                                ? isDarkMode
                                  ? "#a7f3d0"
                                  : "#065f46"
                                : isDarkMode
                                  ? "#fca5a5"
                                  : "#7f1d1d",
                          }}
                        >
                          {status === "Shortlisted"
                            ? "This candidate has been moved to the shortlist."
                            : "This candidate has been marked as rejected."}
                        </Typography>
                      </Box>
                    </Box>
                    <IconButton
                      onClick={handleUndoStatus}
                      size="small"
                      sx={{
                        color:
                          status === "Shortlisted"
                            ? isDarkMode
                              ? "#34d399"
                              : "#047857"
                            : isDarkMode
                              ? "#f87171"
                              : "#b91c1c",
                      }}
                    >
                      <UndoIcon />
                    </IconButton>
                  </Paper>
                </Box>
              )}
            </Grid>
          )}
        </Grid>

        {/* Explicit Bottom Spacer to guarantee padding and prevent containers from touching the viewport edge */}
        <Box
          sx={{ height: { xs: 10, md: 20 }, width: "100%", flexShrink: 0 }}
        />
      </Box>

      {/* Render the Interview Modal */}
      <InterviewSchedulingModal
        open={isInterviewModalOpen}
        onClose={handleCloseInterviewModal}
        candidateName={computedName}
      />

      {/* Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%", color: "#ffffff" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );

  // If instructed to render as Drawer (e.g. from the Kanban Board)
  if (asDrawer) {
    return (
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: "700px", lg: "900px" },
            bgcolor: isDarkMode ? "#101922" : "#f6f7f8",
            backgroundImage: "none",
          },
        }}
      >
        {viewContent}
      </Drawer>
    );
  }

  // Fallback to Standard Page Render
  return viewContent;
};

export default ApplicantDetailView;
