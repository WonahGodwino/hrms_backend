import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  useTheme,
  Avatar,
  IconButton,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FilterListIcon from "@mui/icons-material/FilterList";
import IosShareIcon from "@mui/icons-material/IosShare";
import NextPlanIcon from "@mui/icons-material/NextPlan";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DownloadIcon from "@mui/icons-material/Download";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import StarIcon from "@mui/icons-material/Star";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import VerifiedIcon from "@mui/icons-material/Verified";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SortIcon from "@mui/icons-material/Sort";
import { useNavigate, useParams } from "react-router-dom";
import { TextField, InputAdornment } from "@mui/material";

// React DnD Imports
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

// Import Modals & Drawer Views
import InterviewSchedulingModal from "./InterviewSchedulingModal";
import CandidateCommunicationModal from "./CandidateCommunicationModal";
import GenerateOfferModal from "./GenerateOfferModal";
import OnboardingConfirmationModal from "./OnboardingConfirmationModal";
import ApplicantDetailView from "./ApplicantDetailView";

// Import Extracted Kanban Components
import KanbanColumn from "./KanbanColumn";

// API Services
import { getJobs, getApplicants } from "@/services/RecruitmentService";

/**
 * Kanban Pipeline Configuration (Applied section removed)
 */
const PIPELINE_COLUMNS = [
  {
    id: "Ranked",
    label: "Ranked",
    color: "#bfdbfe",
    bgLight: "#f8fafc",
    bgDark: "rgba(30, 41, 59, 0.5)",
    badgeBg: "#dbeafe",
    badgeText: "#1d4ed8",
  },
  {
    id: "Interview Scheduled",
    label: "Interview Scheduled",
    color: "#137fec",
    bgLight: "#eff6ff",
    bgDark: "rgba(19, 127, 236, 0.1)",
    badgeBg: "#bfdbfe",
    badgeText: "#1e40af",
    isHighlight: true,
  },
  {
    id: "Shortlisted / Offer",
    label: "Shortlisted / Offer",
    color: "#fde68a",
    bgLight: "#f8fafc",
    bgDark: "rgba(30, 41, 59, 0.5)",
    badgeBg: "#fef3c7",
    badgeText: "#b45309",
  },
  {
    id: "Hired",
    label: "Hired",
    color: "#bbf7d0",
    bgLight: "#f0fdf4",
    bgDark: "rgba(22, 163, 74, 0.1)",
    badgeBg: "#bbf7d0",
    badgeText: "#166534",
  },
  {
    id: "Rejected",
    label: "Rejected",
    color: "#fecaca",
    bgLight: "#fef2f2",
    bgDark: "rgba(220, 38, 38, 0.1)",
    badgeBg: "#fecaca",
    badgeText: "#991b1b",
  },
];

// --- Move Validation Logic ---
/**
 * Validates whether a candidate can be moved from their current status to a target status based on business rules.
 */
const validateMove = (sourceStatus, targetStatus) => {
  // --- Forward Moving Constraints ---

  // Constraint 1: Ranked -> Hired
  if (sourceStatus === "Ranked" && targetStatus === "Hired") {
    return {
      valid: false,
      message:
        "Action denied: An offer must be generated and accepted before a candidate can be hired.",
    };
  }

  // Constraint 2: Interview Scheduled -> Hired
  if (sourceStatus === "Interview Scheduled" && targetStatus === "Hired") {
    return {
      valid: false,
      message:
        "Action denied: Please advance the candidate to 'Offer Pending' to generate an offer letter first.",
    };
  }

  // --- Backward Moving Constraints ---

  // Constraint 3: Rejected -> Any Active Stage
  if (sourceStatus === "Rejected" && targetStatus !== "Rejected") {
    return {
      valid: false,
      message:
        "Action denied: Rejected profiles are locked. Please use the 'Restore Applicant' action from their profile.",
    };
  }

  // Constraint 4: Hired -> Any Previous Stage
  if (sourceStatus === "Hired" && targetStatus !== "Hired") {
    return {
      valid: false,
      message:
        "Action denied: This candidate has already been ported to the core employee database.",
    };
  }

  // Constraint 5: Shortlisted -> Ranked or Interview Scheduled
  if (
    sourceStatus === "Shortlisted / Offer" &&
    ["Ranked", "Interview Scheduled"].includes(targetStatus)
  ) {
    return {
      valid: false,
      message:
        "Action denied: Cancel the pending offer in the candidate's profile before moving them backward.",
    };
  }

  return { valid: true };
};

/**
 * Main ApplicantKanbanBoard Component
 * Implements the pipeline board with react-dnd handling the movement.
 */
const ApplicantKanbanBoard = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const { jobId } = useParams();

  // Core States
  const [jobDetails, setJobDetails] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Sort State
  const [searchTerm, setSearchTerm] = useState("");
  const [columnSorts, setColumnSorts] = useState({});

  // Empty Pipeline Celebration State (Surprise & Delight)
  const [showEmptyCongrats, setShowEmptyCongrats] = useState(false);
  const [hasInitializedRanked, setHasInitializedRanked] = useState(false);

  // Menu State
  const [anchorEl, setAnchorEl] = useState(null);
  const [subMenuAnchorEl, setSubMenuAnchorEl] = useState(null);
  const [selectedApplicantId, setSelectedApplicantId] = useState(null);
  const openMenu = Boolean(anchorEl);
  const openSubMenu = Boolean(subMenuAnchorEl);

  // Modal State
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [isCommunicationModalOpen, setIsCommunicationModalOpen] =
    useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  // Detail Drawer State
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  // Toast / Snackbar Notification State
  const [toast, setToast] = useState({ open: false, message: "" });

  const showToast = (message) => {
    setToast({ open: true, message });
  };

  const handleCloseToast = (event, reason) => {
    if (reason === "clickaway") return;
    setToast({ ...toast, open: false });
  };

  // --- Check for Empty "Ranked" Column ---
  useEffect(() => {
    if (!loading) {
      const rankedCount = applicants.filter(
        (a) => a.status === "Ranked",
      ).length;

      if (!hasInitializedRanked && rankedCount > 0) {
        // Once we have candidates in the Ranked column, we are "initialized"
        setHasInitializedRanked(true);
      } else if (hasInitializedRanked && rankedCount === 0) {
        // If we were initialized but now it's empty, trigger the congratulatory popup!
        setShowEmptyCongrats(true);
        setHasInitializedRanked(false); // Reset to prevent continuous popups
      }
    }
  }, [applicants, loading, hasInitializedRanked]);

  // --- Dynamic Data Fetching ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Job Details
        if (jobId && jobId !== "all") {
          const jobRes = await getJobs();
          if (jobRes.data && jobRes.data.success) {
            const foundJob = (jobRes.data.data.jobs || []).find(
              (j) => j.id === jobId,
            );
            setJobDetails(foundJob || null);
          }
        }

        // Fetch Applicants processed from the list view
        const appParams = {};
        if (jobId && jobId !== "all") {
          appParams.jobId = jobId;
        }

        const appRes = await getApplicants(appParams);

        if (appRes.data && appRes.data.success) {
          const dataObj = appRes.data.data || {};
          let fetchedApplicants = [];

          if (dataObj.groupedApplications) {
            Object.values(dataObj.groupedApplications).forEach((jobGroup) => {
              fetchedApplicants = [...fetchedApplicants, ...jobGroup];
            });
          } else if (Array.isArray(dataObj.applicants)) {
            fetchedApplicants = dataObj.applicants;
          } else if (Array.isArray(dataObj)) {
            fetchedApplicants = dataObj;
          }

          const mapped = fetchedApplicants.map((app) => {
            const firstName =
              app.metadata?.firstName || app.candidate?.firstName || "";
            const lastName =
              app.metadata?.lastName || app.candidate?.lastName || "";
            let computedName = `${firstName} ${lastName}`.trim();

            if (!computedName) {
              computedName = app.candidateId
                ? `Applicant (${app.candidateId.substring(0, 6)})`
                : "Unknown Applicant";
            }

            const initials =
              firstName && lastName
                ? `${firstName[0]}${lastName[0]}`.toUpperCase()
                : computedName.substring(0, 2).toUpperCase();

            // Map backend status to Kanban columns securely
            const rawStatus = (app.status || "").toUpperCase();
            let kanbanStatus = "Ranked"; // Default entry point in the narrower funnel

            if (["INTERVIEW_SCHEDULED", "INTERVIEW"].includes(rawStatus)) {
              kanbanStatus = "Interview Scheduled";
            } else if (["SHORTLISTED", "OFFER"].includes(rawStatus)) {
              kanbanStatus = "Shortlisted / Offer";
            } else if (["HIRED", "ACCEPTED"].includes(rawStatus)) {
              kanbanStatus = "Hired";
            } else if (["REJECTED"].includes(rawStatus)) {
              kanbanStatus = "Rejected";
            }

            return {
              id: app.id,
              name: computedName,
              role: app.job?.title || "Unspecified Role",
              matchScore: app.score ? `${app.score}%` : null,
              rawScore: app.score || 0, // Used for sorting
              status: kanbanStatus,
              timeAgo: app.createdAt
                ? new Date(app.createdAt).toLocaleDateString()
                : "",
              rawDate: app.createdAt ? new Date(app.createdAt).getTime() : 0, // Used for sorting
              initials: initials,
              avatarColor: "blue",
              avatar: app.candidate?.avatarUrl || null,
            };
          });

          setApplicants(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch Kanban data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobId]);

  // --- Dynamic Kanban Update Logic ---
  const moveCandidateToColumn = (applicantId, newStatus, extraData = {}) => {
    setApplicants((prev) =>
      prev.map((app) => {
        if (app.id !== applicantId) return app;

        // Clone and remove status-specific properties so the card completely resets visually
        const updatedApp = { ...app, status: newStatus, ...extraData };
        delete updatedApp.schedule;
        delete updatedApp.rejectedReason;
        delete updatedApp.isHired;
        delete updatedApp.tagAlert;

        // Inject new visual properties based on destination
        switch (newStatus) {
          case "Interview Scheduled":
            updatedApp.schedule = extraData.schedule || "Pending Schedule";
            break;
          case "Shortlisted / Offer":
            updatedApp.tagAlert = "Reviewing";
            break;
          case "Hired":
            updatedApp.isHired = true;
            break;
          case "Rejected":
            updatedApp.rejectedReason = "Not a fit";
            break;
          default:
            break;
        }

        return updatedApp;
      }),
    );
  };

  // --- React DnD Drop Handler ---
  const handleDropApplicant = (applicantId, targetColumnId) => {
    const applicant = applicants.find((a) => a.id === applicantId);

    // Prevent action if they drop the card back into its current column
    if (applicant && applicant.status === targetColumnId) {
      return;
    }

    // VALIDATE BUSINESS RULE CONSTRAINTS BEFORE PROCEEDING
    const validation = validateMove(applicant.status, targetColumnId);
    if (!validation.valid) {
      showToast(validation.message);
      return; // Stop the drop
    }

    // INTERCEPT: "Interview Scheduled" -> Opens scheduling modal
    if (targetColumnId === "Interview Scheduled") {
      setSelectedApplicantId(applicantId);
      setIsInterviewModalOpen(true);
    }
    // INTERCEPT: "Rejected" -> Opens communication modal defaulting to rejection template
    else if (targetColumnId === "Rejected") {
      setSelectedApplicantId(applicantId);
      setIsCommunicationModalOpen(true);
    }
    // INTERCEPT: "Shortlisted / Offer" -> Opens the Offer Generation Modal
    else if (targetColumnId === "Shortlisted / Offer") {
      setSelectedApplicantId(applicantId);
      setIsOfferModalOpen(true);
    }
    // INTERCEPT: "Hired" -> Opens Onboarding Confirmation Modal
    else if (targetColumnId === "Hired") {
      setSelectedApplicantId(applicantId);
      setIsOnboardingModalOpen(true);
    }
    // Normal direct drop for all other columns
    else {
      moveCandidateToColumn(applicantId, targetColumnId);
    }
  };

  // --- Regular Handlers ---
  const handleCardClick = (id) => {
    setSelectedApplicantId(id);
    setIsDetailDrawerOpen(true);
  };

  const handleActionClick = (event, id) => {
    setAnchorEl(event.currentTarget);
    setSelectedApplicantId(id);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setSubMenuAnchorEl(null);
  };

  const handleViewDetails = () => {
    setIsDetailDrawerOpen(true);
    handleCloseMenu();
  };

  const handleDownloadCV = () => {
    console.log(`Downloading CV for applicant ${selectedApplicantId}`);
    handleCloseMenu();
  };

  // --- Interview Modal Handlers ---
  const handleCloseInterviewModal = () => {
    setIsInterviewModalOpen(false);
    setSelectedApplicantId(null);
  };

  const handleSubmitInterviewModal = (interviewData) => {
    setIsInterviewModalOpen(false);
    if (selectedApplicantId && interviewData) {
      const scheduleString = `${interviewData.date}, ${interviewData.time}`;
      moveCandidateToColumn(selectedApplicantId, "Interview Scheduled", {
        schedule: scheduleString,
      });
    }
    setSelectedApplicantId(null);
  };

  // --- Communication/Rejection Modal Handlers ---
  const handleCloseCommunicationModal = () => {
    setIsCommunicationModalOpen(false);
    setSelectedApplicantId(null);
  };

  const handleSubmitCommunicationModal = () => {
    setIsCommunicationModalOpen(false);
    if (selectedApplicantId) {
      moveCandidateToColumn(selectedApplicantId, "Rejected");
    }
    setSelectedApplicantId(null);
  };

  // --- Offer Modal Handlers ---
  const handleCloseOfferModal = () => {
    setIsOfferModalOpen(false);
    setSelectedApplicantId(null);
  };

  const handleSubmitOfferModal = () => {
    setIsOfferModalOpen(false);
    if (selectedApplicantId) {
      moveCandidateToColumn(selectedApplicantId, "Shortlisted / Offer");
    }
    setSelectedApplicantId(null);
  };

  // --- Onboarding (Hired) Modal Handlers ---
  const handleCloseOnboardingModal = () => {
    setIsOnboardingModalOpen(false);
    setSelectedApplicantId(null); // Cancels the move, keeping the card in its original column
  };

  const handleConfirmOnboardingModal = () => {
    setIsOnboardingModalOpen(false);
    if (selectedApplicantId) {
      // Successfully confirming moves the card to "Hired" and applies the UI changes
      moveCandidateToColumn(selectedApplicantId, "Hired");
    }
    setSelectedApplicantId(null);
  };

  const handleStatusChange = (status) => {
    const applicant = applicants.find((a) => a.id === selectedApplicantId);

    if (applicant) {
      const validation = validateMove(applicant.status, status);
      if (!validation.valid) {
        showToast(validation.message);
        handleCloseMenu();
        return;
      }
    }

    if (status === "Interview Scheduled") {
      setIsInterviewModalOpen(true);
    } else if (status === "Rejected") {
      setIsCommunicationModalOpen(true);
    } else if (status === "Shortlisted / Offer") {
      setIsOfferModalOpen(true);
    } else if (status === "Hired") {
      setIsOnboardingModalOpen(true);
    } else {
      moveCandidateToColumn(selectedApplicantId, status);
    }
    handleCloseMenu();
  };

  const handleSortChange = (columnId, sortType) => {
    setColumnSorts((prev) => ({ ...prev, [columnId]: sortType }));
  };

  const selectedApplicant = applicants.find(
    (app) => app.id === selectedApplicantId,
  );

  // Global search filtering applied across all columns
  const filteredApplicants = applicants.filter((app) => {
    if (
      searchTerm &&
      !app.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <DndProvider backend={HTML5Backend}>
      <Box
        sx={{
          height: { xs: "calc(100vh - 130px)", md: "calc(100vh - 146px)" }, // CRITICAL FIX: Dynamically fills viewport height minus headers to prevent background cutoff
          minHeight: "600px", // Fallback to prevent crushing on very small screens
          overflow: "hidden", // Prevent full-page scrolling
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: isDarkMode ? "#101922" : "#f6f7f8",
          fontFamily: '"Inter", sans-serif',
        }}
      >
        {/* Top Navigation & Job Header */}
        <Box
          sx={{
            flexShrink: 0,
            position: "relative",
            bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            zIndex: 5,
          }}
        >
          {/* Dynamic Job Info Header */}
          <Box
            sx={{
              px: { xs: 2, md: 4 },
              py: 3,
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { md: "center" },
              justifyContent: "space-between",
              gap: 3,
            }}
          >
            <Box>
              {/* Escape Hatch: Persistent Back to Applicant Pool Button */}
              <Button
                onClick={() => navigate(`/jobs/${jobId || "all"}/applicants`)}
                variant="text"
                sx={{
                  mb: 1.5,
                  color: isDarkMode ? "#94a3b8" : "#64748b",
                  textTransform: "none",
                  pl: 0,
                  fontWeight: 600,
                  "&:hover": {
                    bgcolor: "transparent",
                    color: isDarkMode ? "#e2e8f0" : "#334155",
                    textDecoration: "underline",
                  },
                }}
              >
                &larr; Back to Applicant Pool
              </Button>

              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}
              >
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    color: isDarkMode ? "#fff" : "#0f172a",
                    letterSpacing: "-0.025em",
                  }}
                >
                  {jobDetails ? jobDetails.title : "Pipeline Overview"}
                </Typography>
                {jobDetails && (
                  <Chip
                    label={jobDetails.status || "Active"}
                    size="small"
                    sx={{
                      bgcolor: isDarkMode
                        ? "rgba(22, 163, 74, 0.2)"
                        : "#dcfce7",
                      color: isDarkMode ? "#86efac" : "#16a34a",
                      fontWeight: 700,
                      border: `1px solid ${isDarkMode ? "rgba(22, 163, 74, 0.3)" : "#bbf7d0"}`,
                      borderRadius: "4px",
                      height: 22,
                    }}
                  />
                )}
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  color: isDarkMode ? "#94a3b8" : "#64748b",
                  fontSize: "0.875rem",
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="body2">
                  ID:{" "}
                  {jobDetails
                    ? jobDetails.id.substring(0, 8).toUpperCase()
                    : "ALL"}
                </Typography>
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    bgcolor: isDarkMode ? "#475569" : "#cbd5e1",
                  }}
                />
                <Typography variant="body2">
                  {jobDetails?.location || "Remote"}
                </Typography>
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    bgcolor: isDarkMode ? "#475569" : "#cbd5e1",
                  }}
                />
                <Typography variant="body2">
                  {jobDetails?.salary || "Competitive"}
                </Typography>
              </Box>
            </Box>
            {/* Avatars and Add Candidate Button intentionally removed here per instructions */}
          </Box>

          {/* Filters & Search Row */}
          <Box
            sx={{
              px: { xs: 2, md: 4 },
              pb: 2,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              overflowX: "auto",
              "&::-webkit-scrollbar": { display: "none" },
            }}
          >
            {/* Global Search Bar */}
            <TextField
              placeholder="Search candidate name..."
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon
                      sx={{
                        color: isDarkMode ? "#94a3b8" : "#9ca3af",
                        fontSize: 20,
                      }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                minWidth: { xs: "200px", sm: "260px" },
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#ffffff",
                  "& fieldset": {
                    borderColor: isDarkMode ? "#475569" : "#e2e8f0",
                  },
                  "&:hover fieldset": {
                    borderColor: isDarkMode ? "#94a3b8" : "#cbd5e1",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#137fec",
                    borderWidth: 2,
                  },
                },
              }}
            />

            <Divider
              orientation="vertical"
              flexItem
              sx={{
                height: 24,
                alignSelf: "center",
                mx: 0.5,
                borderColor: isDarkMode ? "#334155" : "#cbd5e1",
              }}
            />

            <Button
              variant="outlined"
              startIcon={<FilterListIcon />}
              sx={{
                color: isDarkMode ? "#cbd5e1" : "#475569",
                borderColor: isDarkMode ? "#475569" : "#e2e8f0",
                bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f8fafc",
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2,
                whiteSpace: "nowrap",
                height: 40,
              }}
            >
              More Filters
            </Button>
            <Chip
              label="All Candidates"
              sx={{
                bgcolor: isDarkMode
                  ? "rgba(19, 127, 236, 0.15)"
                  : "rgba(19, 127, 236, 0.1)",
                color: "#137fec",
                fontWeight: 600,
                border: `1px solid rgba(19, 127, 236, 0.2)`,
                borderRadius: 2,
              }}
              clickable
            />
            <Chip
              label="High Match Score"
              variant="outlined"
              sx={{
                color: isDarkMode ? "#cbd5e1" : "#64748b",
                borderColor: isDarkMode ? "#475569" : "#e2e8f0",
                fontWeight: 500,
                borderRadius: 2,
                "&:hover": { borderColor: "#137fec", color: "#137fec" },
              }}
              clickable
            />
            <Chip
              label="Internal Referral"
              variant="outlined"
              sx={{
                color: isDarkMode ? "#cbd5e1" : "#64748b",
                borderColor: isDarkMode ? "#475569" : "#e2e8f0",
                fontWeight: 500,
                borderRadius: 2,
                "&:hover": { borderColor: "#137fec", color: "#137fec" },
              }}
              clickable
            />
            <Chip
              label="Remote Only"
              variant="outlined"
              sx={{
                color: isDarkMode ? "#cbd5e1" : "#64748b",
                borderColor: isDarkMode ? "#475569" : "#e2e8f0",
                fontWeight: 500,
                borderRadius: 2,
                "&:hover": { borderColor: "#137fec", color: "#137fec" },
              }}
              clickable
            />
          </Box>
        </Box>

        {/* Main Kanban Board Area */}
        <Box
          sx={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
                width: "100%",
              }}
            >
              <CircularProgress sx={{ color: "#137fec" }} />
            </Box>
          ) : (
            <Box
              sx={{
                flex: 1, // fill available remaining space
                minHeight: 0, // CRITICAL: allows nested scrolling to function properly without blowing out height
                display: "flex",
                gap: 2.5,
                px: { xs: 2, md: 4 },
                pt: 3,
                pb: 2,
                overflowX: "auto",
                overflowY: "hidden",
                "&::-webkit-scrollbar": {
                  height: 8,
                },
                "&::-webkit-scrollbar-track": {
                  backgroundColor: isDarkMode
                    ? "rgba(255,255,255,0.05)"
                    : "#f1f5f9",
                  borderRadius: 4,
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: isDarkMode ? "#475569" : "#cbd5e1",
                  borderRadius: 4,
                },
                "&::-webkit-scrollbar-thumb:hover": {
                  backgroundColor: isDarkMode ? "#64748b" : "#94a3b8",
                },
              }}
            >
              {PIPELINE_COLUMNS.map((column) => {
                const columnApplicants = filteredApplicants.filter(
                  (app) => app.status === column.id,
                );

                return (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    columnApplicants={columnApplicants}
                    isDarkMode={isDarkMode}
                    handleActionClick={handleActionClick}
                    handleCardClick={handleCardClick}
                    onDropApplicant={handleDropApplicant}
                    currentSort={columnSorts[column.id]}
                    onSortChange={handleSortChange}
                  />
                );
              })}
            </Box>
          )}

          {/* Global Action Menu for Kanban Cards */}
          <Menu
            anchorEl={anchorEl}
            open={openMenu}
            onClose={handleCloseMenu}
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
            transformOrigin={{ horizontal: "center", vertical: "top" }}
            anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
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
            <Divider
              sx={{ my: 0.5, borderColor: isDarkMode ? "#334155" : "#e5e7eb" }}
            />

            {/* Unified Move To Submenu Trigger */}
            <MenuItem onClick={(e) => setSubMenuAnchorEl(e.currentTarget)}>
              <ListItemIcon>
                <NextPlanIcon
                  fontSize="small"
                  sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
                />
              </ListItemIcon>
              <ListItemText primary="Move To..." />
              <ChevronRightIcon
                fontSize="small"
                sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
              />
            </MenuItem>
          </Menu>

          {/* Nested Move To Submenu */}
          <Menu
            anchorEl={subMenuAnchorEl}
            open={openSubMenu}
            onClose={() => setSubMenuAnchorEl(null)}
            PaperProps={{
              elevation: 0,
              sx: {
                overflow: "visible",
                filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.15))",
                bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                color: isDarkMode ? "#e2e8f0" : "#1e293b",
                border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                borderRadius: 2,
                minWidth: 180,
              },
            }}
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
          >
            {PIPELINE_COLUMNS.map((col) => {
              const isCurrent = selectedApplicant?.status === col.id;

              if (isCurrent) return null;

              const isValid = selectedApplicant
                ? validateMove(selectedApplicant.status, col.id).valid
                : false;

              return (
                <MenuItem
                  key={col.id}
                  disabled={!isValid}
                  onClick={() => handleStatusChange(col.id)}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: col.color,
                      mr: 2,
                      opacity: isValid ? 1 : 0.5,
                    }}
                  />
                  <ListItemText
                    primary={col.label}
                    primaryTypographyProps={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  />
                </MenuItem>
              );
            })}
          </Menu>
        </Box>

        {/* Global Toast / Snackbar for validation constraints */}
        <Snackbar
          open={toast.open}
          autoHideDuration={6000}
          onClose={handleCloseToast}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            onClose={handleCloseToast}
            severity="warning"
            sx={{
              width: "100%",
              fontWeight: 600,
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          >
            {toast.message}
          </Alert>
        </Snackbar>

        {/* Render the Drawer and Modals */}
        <ApplicantDetailView
          asDrawer
          open={isDetailDrawerOpen}
          onClose={() => setIsDetailDrawerOpen(false)}
          applicantId={selectedApplicantId}
        />

        <InterviewSchedulingModal
          open={isInterviewModalOpen}
          onClose={handleCloseInterviewModal}
          onSubmit={handleSubmitInterviewModal}
          candidateName={selectedApplicant?.name}
        />

        <CandidateCommunicationModal
          open={isCommunicationModalOpen}
          onClose={handleCloseCommunicationModal}
          onSubmit={handleSubmitCommunicationModal}
          candidate={
            selectedApplicant
              ? { name: selectedApplicant.name, role: selectedApplicant.role }
              : null
          }
          initialTemplate="rejection"
        />

        <GenerateOfferModal
          open={isOfferModalOpen}
          onClose={handleCloseOfferModal}
          onSubmit={handleSubmitOfferModal}
          candidateName={selectedApplicant?.name}
        />

        <OnboardingConfirmationModal
          open={isOnboardingModalOpen}
          onClose={handleCloseOnboardingModal}
          onConfirm={handleConfirmOnboardingModal}
          candidate={
            selectedApplicant
              ? { name: selectedApplicant.name, role: selectedApplicant.role }
              : null
          }
        />

        {/* Empty Column Celebration Popup (Surprise & Delight) */}
        <Dialog
          open={showEmptyCongrats}
          onClose={() => setShowEmptyCongrats(false)}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3, // rounded-xl
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
              backgroundImage: "none",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
            },
          }}
          slotProps={{
            backdrop: {
              sx: {
                backdropFilter: "blur(4px)",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
              },
            },
          }}
        >
          <DialogContent sx={{ p: { xs: 3, sm: 4 }, pb: 2 }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                mt: 1,
              }}
            >
              {/* Celebration Icon Wrapper */}
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  bgcolor: isDarkMode ? "rgba(16, 185, 129, 0.2)" : "#dcfce7",
                  color: isDarkMode ? "#34d399" : "#16a34a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 2,
                  fontSize: "2rem",
                  border: `4px solid ${isDarkMode ? "rgba(16, 185, 129, 0.1)" : "#f0fdf4"}`,
                }}
              >
                🎉
              </Box>

              <Typography
                variant="h5"
                component="h3"
                sx={{
                  fontWeight: 700,
                  color: isDarkMode ? "#ffffff" : "#0f172a",
                  lineHeight: 1.2,
                  letterSpacing: "-0.025em",
                  mb: 1.5,
                }}
              >
                All Caught Up!
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  color: isDarkMode ? "#94a3b8" : "#475569",
                  lineHeight: 1.6,
                }}
              >
                You have successfully processed all candidates in the Ranked
                column. Ready to fetch the next batch from the applicant pool?
              </Typography>
            </Box>
          </DialogContent>

          {/* Action Footer */}
          <DialogActions
            sx={{
              p: { xs: 3, sm: 4 },
              pt: 2,
              display: "flex",
              flexDirection: { xs: "column-reverse", sm: "row" },
              justifyContent: "center",
              gap: 1.5,
              borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "rgba(15, 23, 42, 0.3)" : "#f8fafc",
            }}
          >
            <Button
              onClick={() => setShowEmptyCongrats(false)}
              variant="outlined"
              fullWidth={false}
              sx={{
                width: { xs: "100%", sm: "auto" },
                color: isDarkMode ? "#cbd5e1" : "#334155",
                borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                textTransform: "none",
                fontWeight: 600,
                "&:hover": {
                  bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f1f5f9",
                  borderColor: isDarkMode ? "#64748b" : "#94a3b8",
                },
              }}
            >
              Stay Here
            </Button>
            <Button
              variant="contained"
              onClick={() => navigate(`/jobs/${jobId || "all"}/applicants`)}
              fullWidth={false}
              sx={{
                width: { xs: "100%", sm: "auto" },
                bgcolor: "#137fec",
                color: "#ffffff",
                textTransform: "none",
                fontWeight: 700,
                boxShadow: "0 4px 6px -1px rgba(19, 127, 236, 0.2)",
                mb: { xs: 1.5, sm: 0 },
                "&:hover": { bgcolor: "#1170d0" },
              }}
            >
              Fetch Next Batch
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </DndProvider>
  );
};

export default ApplicantKanbanBoard;
