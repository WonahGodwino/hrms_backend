import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Modal,
  useTheme,
  Fade,
  TextField,
  InputAdornment,
  Chip,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import ScheduleIcon from "@mui/icons-material/Schedule";
import LinkIcon from "@mui/icons-material/Link";
import VideoCameraFrontIcon from "@mui/icons-material/VideoCameraFront";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import BusinessIcon from "@mui/icons-material/Business";

/**
 * InterviewSchedulingModal
 * Modal for scheduling an interview with a candidate.
 * Updated to capture the interview type (Virtual/In-person) and location/platform
 * to properly feed data into the Interviewer Dashboard.
 */
const InterviewSchedulingModal = ({
  open,
  onClose,
  onSubmit,
  candidateName,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  // Core Scheduling State
  const [date, setDate] = useState("Oct 24, 2023");
  const [time, setTime] = useState("10:30 AM");

  // Adaptive Location/Type State
  const [interviewType, setInterviewType] = useState("virtual"); // 'virtual' | 'in-person'
  const [platform, setPlatform] = useState("Microsoft Teams");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");

  const [notes, setNotes] = useState("");
  const [interviewers, setInterviewers] = useState([
    "Sarah Jenkins (Hiring Manager)",
    "David Chen",
  ]);

  const handleDeleteInterviewer = (interviewerToDelete) => {
    setInterviewers((prev) =>
      prev.filter((interviewer) => interviewer !== interviewerToDelete),
    );
  };

  const handleTypeChange = (event, newType) => {
    if (newType !== null) {
      setInterviewType(newType);
    }
  };

  const handleSendInvitation = () => {
    // Construct the payload to perfectly match what the Interviewer Dashboard expects
    const interviewData = {
      date,
      time,
      type: interviewType,
      // Pass the platform name if virtual, or physical location if in-person
      location: interviewType === "virtual" ? platform : location,
      meetingUrl: interviewType === "virtual" ? meetingUrl : null,
      notes,
      interviewers,
    };

    if (onSubmit) {
      onSubmit(interviewData);
    } else if (onClose) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        backdropFilter: "blur(4px)",
        "& .MuiBackdrop-root": {
          backgroundColor: "rgba(0, 0, 0, 0.6)",
        },
      }}
    >
      <Fade in={open}>
        <Paper
          elevation={24}
          sx={{
            width: "100%",
            maxWidth: "560px",
            bgcolor: isDarkMode ? "#111a22" : "#ffffff",
            borderRadius: 3,
            overflow: "hidden",
            outline: "none",
            border: `1px solid ${isDarkMode ? "#324d67" : "#e5e7eb"}`,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "90vh",
          }}
        >
          {/* Header */}
          <Box sx={{ px: 4, pt: 4, pb: 2, flexShrink: 0 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Typography
                variant="h5"
                component="h2"
                sx={{
                  fontWeight: 700,
                  fontSize: "1.5rem",
                  color: isDarkMode ? "#ffffff" : "#111a22",
                  lineHeight: 1.2,
                }}
              >
                Schedule Interview
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: isDarkMode ? "#92adc9" : "#6b7280",
                  fontSize: "0.875rem",
                  fontWeight: 400,
                }}
              >
                Send an invitation to{" "}
                <Box
                  component="span"
                  sx={{ color: "#137fec", fontWeight: 500 }}
                >
                  {candidateName || "Candidate"}
                </Box>
              </Typography>
            </Box>
          </Box>

          {/* Form Body - Scrollable */}
          <Box
            sx={{
              px: 4,
              py: 2,
              display: "flex",
              flexDirection: "column",
              gap: 3,
              overflowY: "auto",
            }}
          >
            {/* Date & Time Row */}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: "140px" }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    mb: 1,
                    fontWeight: 500,
                    color: isDarkMode ? "#fff" : "#374151",
                    fontSize: "0.875rem",
                  }}
                >
                  Date
                </Typography>
                <TextField
                  fullWidth
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="Select Date"
                  variant="outlined"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <CalendarTodayIcon
                          sx={{
                            color: isDarkMode ? "#92adc9" : "#9ca3af",
                            fontSize: 20,
                          }}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 3,
                      bgcolor: isDarkMode ? "#192633" : "#f9fafb",
                      "& fieldset": {
                        borderColor: isDarkMode ? "#324d67" : "#d1d5db",
                      },
                      "&:hover fieldset": {
                        borderColor: isDarkMode ? "#475569" : "#9ca3af",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                      "& input": {
                        color: isDarkMode ? "#fff" : "#111827",
                        fontSize: "0.875rem",
                        py: 1.5,
                      },
                    },
                  }}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: "140px" }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    mb: 1,
                    fontWeight: 500,
                    color: isDarkMode ? "#fff" : "#374151",
                    fontSize: "0.875rem",
                  }}
                >
                  Time
                </Typography>
                <TextField
                  fullWidth
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="Select Time"
                  variant="outlined"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <ScheduleIcon
                          sx={{
                            color: isDarkMode ? "#92adc9" : "#9ca3af",
                            fontSize: 20,
                          }}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 3,
                      bgcolor: isDarkMode ? "#192633" : "#f9fafb",
                      "& fieldset": {
                        borderColor: isDarkMode ? "#324d67" : "#d1d5db",
                      },
                      "&:hover fieldset": {
                        borderColor: isDarkMode ? "#475569" : "#9ca3af",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                      "& input": {
                        color: isDarkMode ? "#fff" : "#111827",
                        fontSize: "0.875rem",
                        py: 1.5,
                      },
                    },
                  }}
                />
              </Box>
            </Box>

            {/* Interview Type Toggle */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  mb: 1,
                  fontWeight: 500,
                  color: isDarkMode ? "#fff" : "#374151",
                  fontSize: "0.875rem",
                }}
              >
                Interview Type
              </Typography>
              <ToggleButtonGroup
                value={interviewType}
                exclusive
                onChange={handleTypeChange}
                fullWidth
                sx={{
                  bgcolor: isDarkMode ? "#192633" : "#f1f5f9",
                  p: 0.5,
                  borderRadius: 2,
                  border: `1px solid ${isDarkMode ? alpha("#324d67", 0.5) : "#e2e8f0"}`,
                  "& .MuiToggleButton-root": {
                    border: "none",
                    borderRadius: 1.5,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: isDarkMode ? "#92adc9" : "#64748b",
                    py: 1,
                    transition: "all 0.2s ease",
                    "&.Mui-selected": {
                      bgcolor: isDarkMode ? "#334155" : "#ffffff",
                      color: isDarkMode ? "#ffffff" : "#0f172a",
                      boxShadow: isDarkMode
                        ? "none"
                        : "0 1px 2px 0 rgba(0,0,0,0.05)",
                      "&:hover": {
                        bgcolor: isDarkMode ? "#475569" : "#f8fafc",
                      },
                    },
                  },
                }}
              >
                <ToggleButton value="virtual">
                  <VideoCameraFrontIcon sx={{ fontSize: 18, mr: 1 }} />
                  Virtual Call
                </ToggleButton>
                <ToggleButton value="in-person">
                  <MeetingRoomIcon sx={{ fontSize: 18, mr: 1 }} />
                  In-Person
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Adaptive Platform / Location Fields */}
            {interviewType === "virtual" ? (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: "140px" }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      mb: 1,
                      fontWeight: 500,
                      color: isDarkMode ? "#fff" : "#374151",
                      fontSize: "0.875rem",
                    }}
                  >
                    Platform
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    variant="outlined"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 3,
                        bgcolor: isDarkMode ? "#192633" : "#f9fafb",
                        "& fieldset": {
                          borderColor: isDarkMode ? "#324d67" : "#d1d5db",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "#137fec",
                          borderWidth: 2,
                        },
                        "& .MuiSelect-select": {
                          color: isDarkMode ? "#fff" : "#111827",
                          fontSize: "0.875rem",
                          py: 1.5,
                        },
                      },
                    }}
                  >
                    <MenuItem value="Microsoft Teams">Microsoft Teams</MenuItem>
                    <MenuItem value="Zoom">Zoom</MenuItem>
                    <MenuItem value="Google Meet">Google Meet</MenuItem>
                    <MenuItem value="Webex">Webex</MenuItem>
                  </TextField>
                </Box>
                <Box sx={{ flex: 2, minWidth: "200px" }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      mb: 1,
                      fontWeight: 500,
                      color: isDarkMode ? "#fff" : "#374151",
                      fontSize: "0.875rem",
                    }}
                  >
                    Meeting Link
                  </Typography>
                  <TextField
                    fullWidth
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://..."
                    variant="outlined"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LinkIcon
                            sx={{
                              color: isDarkMode ? "#92adc9" : "#9ca3af",
                              fontSize: 20,
                            }}
                          />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 3,
                        bgcolor: isDarkMode ? "#192633" : "#f9fafb",
                        "& fieldset": {
                          borderColor: isDarkMode ? "#324d67" : "#d1d5db",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "#137fec",
                          borderWidth: 2,
                        },
                        "& input": {
                          color: isDarkMode ? "#fff" : "#111827",
                          fontSize: "0.875rem",
                          py: 1.5,
                        },
                      },
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <Box>
                <Typography
                  variant="subtitle2"
                  sx={{
                    mb: 1,
                    fontWeight: 500,
                    color: isDarkMode ? "#fff" : "#374151",
                    fontSize: "0.875rem",
                  }}
                >
                  Office Location / Room
                </Typography>
                <TextField
                  fullWidth
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. HQ - Conference Room B"
                  variant="outlined"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <BusinessIcon
                          sx={{
                            color: isDarkMode ? "#92adc9" : "#9ca3af",
                            fontSize: 20,
                          }}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 3,
                      bgcolor: isDarkMode ? "#192633" : "#f9fafb",
                      "& fieldset": {
                        borderColor: isDarkMode ? "#324d67" : "#d1d5db",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#137fec",
                        borderWidth: 2,
                      },
                      "& input": {
                        color: isDarkMode ? "#fff" : "#111827",
                        fontSize: "0.875rem",
                        py: 1.5,
                      },
                    },
                  }}
                />
              </Box>
            )}

            {/* Interviewer(s) */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  mb: 1,
                  fontWeight: 500,
                  color: isDarkMode ? "#fff" : "#374151",
                  fontSize: "0.875rem",
                }}
              >
                Interviewer(s)
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                  p: 1.5,
                  minHeight: 48,
                  borderRadius: 3,
                  border: `1px solid ${isDarkMode ? "#324d67" : "#d1d5db"}`,
                  bgcolor: isDarkMode ? "#192633" : "#f9fafb",
                }}
              >
                {interviewers.map((interviewer, index) => (
                  <Chip
                    key={index}
                    label={interviewer}
                    onDelete={() => handleDeleteInterviewer(interviewer)}
                    deleteIcon={<CloseIcon style={{ fontSize: 16 }} />}
                    sx={{
                      height: 28,
                      borderRadius: 2, // rounded-lg
                      bgcolor: isDarkMode
                        ? "rgba(19, 127, 236, 0.2)"
                        : "rgba(19, 127, 236, 0.1)", // primary/20 / primary/10
                      color: "#137fec", // primary
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      border: "1px solid rgba(19, 127, 236, 0.3)",
                      "& .MuiChip-deleteIcon": {
                        color: "#137fec",
                        opacity: 0.7,
                        "&:hover": { color: "#137fec", opacity: 1 },
                      },
                    }}
                  />
                ))}
                <input
                  type="text"
                  placeholder="Add interviewer..."
                  style={{
                    flex: 1,
                    minWidth: "120px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: isDarkMode ? "#fff" : "#111827",
                    fontSize: "0.875rem",
                    padding: "4px",
                  }}
                />
              </Box>
            </Box>

            {/* Notes */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  mb: 1,
                  fontWeight: 500,
                  color: isDarkMode ? "#fff" : "#374151",
                  fontSize: "0.875rem",
                }}
              >
                Notes to Candidate
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any specific instructions, dress code, or preparation materials..."
                variant="outlined"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 3,
                    bgcolor: isDarkMode ? "#192633" : "#f9fafb",
                    "& fieldset": {
                      borderColor: isDarkMode ? "#324d67" : "#d1d5db",
                    },
                    "&:hover fieldset": {
                      borderColor: isDarkMode ? "#475569" : "#9ca3af",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#137fec",
                      borderWidth: 2,
                    },
                    "& textarea": {
                      color: isDarkMode ? "#fff" : "#111827",
                      fontSize: "0.875rem",
                    },
                    p: 2,
                  },
                  "& textarea::placeholder": {
                    color: isDarkMode ? "#92adc9" : "#9ca3af",
                    opacity: 1,
                  },
                }}
              />
            </Box>
          </Box>

          {/* Footer */}
          <Box
            sx={{
              px: 4,
              py: 3,
              display: "flex",
              justifyContent: "flex-end",
              gap: 1.5,
              bgcolor: isDarkMode
                ? "rgba(0, 0, 0, 0.1)"
                : "rgba(249, 250, 251, 0.5)",
              borderTop: `1px solid ${isDarkMode ? "#324d67" : "#e5e7eb"}`,
              flexShrink: 0,
            }}
          >
            <Button
              onClick={onClose}
              sx={{
                px: 3,
                height: 44,
                borderRadius: 3,
                color: isDarkMode ? "#92adc9" : "#4b5563",
                fontWeight: 600,
                textTransform: "none",
                fontSize: "0.875rem",
                "&:hover": {
                  bgcolor: isDarkMode ? "#233648" : "#f3f4f6",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSendInvitation}
              sx={{
                px: 3,
                height: 44,
                borderRadius: 3,
                bgcolor: "#137fec",
                color: "#ffffff",
                fontWeight: 700,
                textTransform: "none",
                fontSize: "0.875rem",
                boxShadow:
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                "&:hover": {
                  bgcolor: "rgba(19, 127, 236, 0.9)",
                },
                "&:active": {
                  transform: "scale(0.98)",
                },
              }}
            >
              Send Invitation
            </Button>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
};

export default InterviewSchedulingModal;
