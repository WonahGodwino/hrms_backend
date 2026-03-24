import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Modal,
  useTheme,
  Fade,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Menu,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

// Import the existing RichTextEditor from your project
import RichTextEditor from "@/components/RichTextEditor";

/**
 * CandidateCommunicationModal Component
 * Allows HR/Admins to send templated or custom communications to candidates.
 * Replaces the HTML/Tailwind mockup with a functional MUI component.
 *
 * @param {boolean} open - Controls the visibility of the modal
 * @param {function} onClose - Function to trigger when closing the modal
 * @param {function} onSubmit - Function to trigger when communication is successfully sent
 * @param {object} candidate - The candidate details (e.g., { name: 'Sarah Jenkins', role: 'Senior Product Designer' })
 * @param {string} initialTemplate - The default template to select (e.g., 'rejection')
 */
const CandidateCommunicationModal = ({
  open,
  onClose,
  onSubmit,
  candidate,
  initialTemplate = "interview-invite",
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  // Form State
  const [template, setTemplate] = useState(initialTemplate);
  const [message, setMessage] = useState("");
  const [sendTime, setSendTime] = useState("immediate");

  // Variables Menu State (For the "Add Variable" feature)
  const [anchorEl, setAnchorEl] = useState(null);
  const openVariablesMenu = Boolean(anchorEl);

  // Pre-defined templates mapping
  const templates = {
    "interview-invite": `<p>Dear <strong>[Candidate First Name]</strong>,</p><p>We are pleased to inform you that we would like to invite you to the next stage of the interview process for the <strong>[Role Name]</strong> position.</p><p>The team was very impressed with your background and would love to dive deeper into your technical experience. Please let us know your availability for a 45-minute video call sometime next week.</p><p>Best regards,<br/>The Hiring Team</p>`,
    offer: `<p>Dear <strong>[Candidate First Name]</strong>,</p><p>We are thrilled to offer you the position of <strong>[Role Name]</strong>. We were incredibly impressed by your interviews and believe you will be a fantastic addition to the team.</p><p>Please find the offer details attached. Let us know if you have any questions!</p><p>Best regards,<br/>The Hiring Team</p>`,
    rejection: `<p>Dear <strong>[Candidate First Name]</strong>,</p><p>Thank you for taking the time to speak with us about the <strong>[Role Name]</strong> position. While we were impressed with your background, we have decided to move forward with another candidate whose qualifications more closely match our current needs.</p><p>We wish you the best of luck in your job search.</p><p>Best regards,<br/>The Hiring Team</p>`,
  };

  // Populate editor when template changes or modal opens with a specific initial template
  useEffect(() => {
    if (open) {
      setTemplate(initialTemplate);
      setMessage(templates[initialTemplate] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplate]);

  // Handlers
  const handleTemplateChange = (event) => {
    const selectedTemplate = event.target.value;
    setTemplate(selectedTemplate);
    setMessage(templates[selectedTemplate] || "");
  };

  const handleMessageChange = (htmlContent) => {
    setMessage(htmlContent);
  };

  const handleSendTimeChange = (event, newTime) => {
    if (newTime !== null) {
      setSendTime(newTime);
    }
  };

  const handleSend = () => {
    const payload = {
      candidate: candidate?.name,
      template,
      message,
      sendTime,
    };

    console.log("Sending Communication:", payload);

    // Trigger successful submission callback to resume Kanban flow
    if (onSubmit) {
      onSubmit(payload);
    } else {
      onClose();
    }
  };

  // Handlers for "Add Variable" dropdown
  const handleVariablesClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleVariablesClose = () => {
    setAnchorEl(null);
  };

  const insertVariable = (variableName) => {
    setMessage((prev) => `${prev} <strong>[${variableName}]</strong>`);
    handleVariablesClose();
  };

  // Safe fallback for candidate data
  const candidateName = candidate?.name || "Sarah Jenkins";
  const candidateRole = candidate?.role || "Senior Product Designer";

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
            maxWidth: "768px", // max-w-3xl
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            bgcolor: isDarkMode ? "#1c242d" : "#ffffff",
            borderRadius: 3, // rounded-xl
            overflow: "hidden",
            outline: "none",
            border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              p: 3,
              borderBottom: `1px solid ${isDarkMode ? alpha("#334155", 0.5) : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "#1c242d" : "#f8fafc", // bg-slate-50
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Typography
                variant="h6"
                component="h2"
                sx={{
                  fontWeight: 700,
                  fontSize: "1.25rem", // text-xl
                  color: isDarkMode ? "#ffffff" : "#0f172a",
                  lineHeight: 1.2,
                  letterSpacing: "-0.025em",
                }}
              >
                Send Candidate Communication
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: isDarkMode ? "#94a3b8" : "#64748b",
                  fontWeight: 500,
                }}
              >
                {candidateName} - {candidateRole}
              </Typography>
            </Box>
            <IconButton
              onClick={onClose}
              sx={{
                color: isDarkMode ? "#94a3b8" : "#64748b",
                borderRadius: 2,
                "&:hover": {
                  bgcolor: isDarkMode ? "#334155" : "#e2e8f0",
                },
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Scrollable Content Area */}
          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              p: 3,
              display: "flex",
              flexDirection: "column",
              gap: 3,
              // Custom Scrollbar styling
              "&::-webkit-scrollbar": { width: 8 },
              "&::-webkit-scrollbar-track": {
                background: isDarkMode ? "rgba(255,255,255,0.05)" : "#f1f5f9",
              },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: isDarkMode
                  ? "rgba(255,255,255,0.2)"
                  : "#cbd5e1",
                borderRadius: 4,
              },
            }}
          >
            {/* Email Template Selection */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 500,
                  color: isDarkMode ? "#cbd5e1" : "#334155",
                }}
              >
                Email Template
              </Typography>
              <Select
                value={template}
                onChange={handleTemplateChange}
                fullWidth
                IconComponent={ExpandMoreIcon}
                sx={{
                  bgcolor: isDarkMode ? "#151b22" : "#ffffff",
                  borderRadius: 2,
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: isDarkMode ? "#475569" : "#cbd5e1",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: isDarkMode ? "#64748b" : "#94a3b8",
                  },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#137fec",
                    borderWidth: 2,
                  },
                  color: isDarkMode ? "#ffffff" : "#0f172a",
                }}
              >
                <MenuItem value="interview-invite">
                  Interview Invitation - First Round
                </MenuItem>
                <MenuItem value="offer">Job Offer</MenuItem>
                <MenuItem value="rejection">Standard Rejection</MenuItem>
              </Select>
            </Box>

            {/* WYSIWYG Editor Area using your integrated RichTextEditor */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 500,
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                  }}
                >
                  Message Body
                </Typography>

                {/* Dynamic Variable Inserter */}
                <Button
                  size="small"
                  onClick={handleVariablesClick}
                  startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    bgcolor: isDarkMode ? "#334155" : "#e2e8f0",
                    color: isDarkMode ? "#cbd5e1" : "#334155",
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.75rem",
                    py: 0.5,
                    "&:hover": {
                      bgcolor: isDarkMode ? "#475569" : "#cbd5e1",
                    },
                  }}
                >
                  Variable
                </Button>
                <Menu
                  anchorEl={anchorEl}
                  open={openVariablesMenu}
                  onClose={handleVariablesClose}
                >
                  <MenuItem
                    onClick={() => insertVariable("Candidate First Name")}
                  >
                    [Candidate First Name]
                  </MenuItem>
                  <MenuItem
                    onClick={() => insertVariable("Candidate Full Name")}
                  >
                    [Candidate Full Name]
                  </MenuItem>
                  <MenuItem onClick={() => insertVariable("Role Name")}>
                    [Role Name]
                  </MenuItem>
                  <MenuItem onClick={() => insertVariable("Company Name")}>
                    [Company Name]
                  </MenuItem>
                </Menu>
              </Box>

              {/* Using the standard RichTextEditor connected to our state */}
              <RichTextEditor
                value={message}
                onChange={handleMessageChange}
                isDarkMode={isDarkMode}
                minHeight="240px"
              />
              <Typography
                variant="caption"
                align="right"
                sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
              >
                {message.replace(/<[^>]*>?/gm, "").length} characters
              </Typography>
            </Box>

            {/* Schedule Sending Options */}
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 1 }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 500,
                  color: isDarkMode ? "#cbd5e1" : "#334155",
                }}
              >
                Sending Options
              </Typography>
              <ToggleButtonGroup
                value={sendTime}
                exclusive
                onChange={handleSendTimeChange}
                aria-label="sending options"
                sx={{
                  bgcolor: isDarkMode ? "#151b22" : "#f1f5f9",
                  p: 0.5,
                  borderRadius: 2,
                  border: `1px solid ${
                    isDarkMode ? alpha("#475569", 0.5) : "#e2e8f0"
                  }`,
                  width: "fit-content",
                  "& .MuiToggleButton-root": {
                    border: "none",
                    borderRadius: 1.5,
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    color: isDarkMode ? "#94a3b8" : "#64748b",
                    py: 1,
                    px: 3,
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
                    "&:hover": {
                      bgcolor: isDarkMode
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.02)",
                    },
                  },
                }}
              >
                <ToggleButton value="immediate" aria-label="send immediately">
                  Send Immediately
                </ToggleButton>
                <ToggleButton value="delayed" aria-label="delay by 24 hours">
                  Delay by 24 Hours
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>

          {/* Footer Actions */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 1.5,
              p: 3,
              borderTop: `1px solid ${isDarkMode ? alpha("#334155", 0.5) : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "#1c242d" : "#f8fafc",
              flexShrink: 0,
            }}
          >
            <Button
              onClick={onClose}
              sx={{
                px: 3,
                py: 1.2,
                borderRadius: 2,
                color: isDarkMode ? "#cbd5e1" : "#475569",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  bgcolor: isDarkMode ? "#334155" : "#e2e8f0",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSend}
              endIcon={<SendIcon sx={{ fontSize: 18 }} />}
              sx={{
                px: 3,
                py: 1.2,
                borderRadius: 2,
                bgcolor: "#137fec",
                color: "#ffffff",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "0 10px 15px -3px rgba(19, 127, 236, 0.2)",
                "&:hover": {
                  bgcolor: "#1170d0",
                },
              }}
            >
              Send Communication
            </Button>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
};

export default CandidateCommunicationModal;
