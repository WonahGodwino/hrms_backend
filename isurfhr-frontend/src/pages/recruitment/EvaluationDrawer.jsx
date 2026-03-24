import React, { useState, useEffect } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  Grid,
  Paper,
  Avatar,
  useTheme,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import ThumbDownAltOutlinedIcon from "@mui/icons-material/ThumbDownAltOutlined";

/**
 * EvaluationDrawer Component
 * A side drawer for interviewers to provide structured feedback and scores for a candidate.
 * * @param {boolean} open - Controls drawer visibility
 * @param {function} onClose - Closes the drawer
 * @param {object} candidate - Candidate details to evaluate
 */
const EvaluationDrawer = ({ open, onClose, candidate }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Form State
  const [scores, setScores] = useState({
    technical: null,
    communication: null,
    culture: null,
  });
  const [notes, setNotes] = useState("");
  const [recommendation, setRecommendation] = useState(null);

  // Reset form when opening for a new candidate
  useEffect(() => {
    if (open) {
      setScores({ technical: null, communication: null, culture: null });
      setNotes("");
      setRecommendation(null);
    }
  }, [open, candidate]);

  const handleScoreChange = (metric, value) => {
    setScores((prev) => ({ ...prev, [metric]: value }));
  };

  // Helper to render the 1-5 rating scales
  const renderRatingRow = (label, metric) => {
    const value = scores[metric];
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: isDark ? "#ffffff" : "#0f172a" }}
          >
            {label}
          </Typography>
          {value ? (
            <Box
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: alpha("#137fec", 0.1),
                color: "#137fec",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {value}/5
            </Box>
          ) : (
            <Typography
              variant="caption"
              sx={{ color: isDark ? "#94a3b8" : "#64748b" }}
            >
              Rate skill
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {[1, 2, 3, 4, 5].map((num) => (
            <Button
              key={num}
              onClick={() => handleScoreChange(metric, num)}
              sx={{
                flex: 1,
                height: 40,
                minWidth: 0,
                borderRadius: 2,
                bgcolor: value === num ? "#137fec" : "transparent",
                color:
                  value === num ? "#ffffff" : isDark ? "#e2e8f0" : "#334155",
                border: `1px solid ${
                  value === num ? "#137fec" : isDark ? "#334155" : "#e2e8f0"
                }`,
                fontWeight: value === num ? 700 : 500,
                "&:hover": {
                  bgcolor:
                    value === num
                      ? "#1170d0"
                      : isDark
                        ? "rgba(255,255,255,0.05)"
                        : "#f8fafc",
                  borderColor: value === num ? "#1170d0" : "#137fec",
                  color: value === num ? "#ffffff" : "#137fec",
                },
                "&:focus": {
                  boxShadow: `0 0 0 2px ${alpha("#137fec", 0.2)}`,
                },
              }}
            >
              {num}
            </Button>
          ))}
        </Box>
      </Box>
    );
  };

  // Helper to determine Avatar styles
  const getAvatarStyles = (colorTheme) => {
    const maps = {
      blue: {
        bg: isDark ? alpha("#3b82f6", 0.2) : "#dbeafe",
        color: isDark ? "#93c5fd" : "#2563eb",
      },
      purple: {
        bg: isDark ? alpha("#a855f7", 0.2) : "#f3e8ff",
        color: isDark ? "#d8b4fe" : "#9333ea",
      },
      emerald: {
        bg: isDark ? alpha("#10b981", 0.2) : "#d1fae5",
        color: isDark ? "#6ee7b7" : "#059669",
      },
      orange: {
        bg: isDark ? alpha("#f97316", 0.2) : "#ffedd5",
        color: isDark ? "#fdba74" : "#ea580c",
      },
    };
    return maps[colorTheme] || maps.blue;
  };

  const avatarTheme = candidate
    ? getAvatarStyles(candidate.avatarColor)
    : getAvatarStyles("blue");

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: "500px" },
          bgcolor: isDark ? "#1a2632" : "#ffffff",
          backgroundImage: "none",
          display: "flex",
          flexDirection: "column",
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(4px)",
            backgroundColor: "rgba(15, 23, 42, 0.6)",
          },
        },
      }}
    >
      {/* Drawer Header */}
      <Box
        sx={{
          px: 3,
          py: 2.5,
          borderBottom: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: isDark ? "#1a2632" : "#ffffff",
          zIndex: 10,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: avatarTheme.bg,
              color: avatarTheme.color,
              fontSize: "1.125rem",
              fontWeight: 700,
            }}
          >
            {candidate?.initials || "C"}
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: isDark ? "#ffffff" : "#0f172a",
                lineHeight: 1.2,
              }}
            >
              {candidate?.name || "Candidate Name"}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: isDark ? "#94a3b8" : "#475569" }}
            >
              {candidate?.position || "Position"}
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            color: isDark ? "#94a3b8" : "#64748b",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9",
              color: isDark ? "#ffffff" : "#0f172a",
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Drawer Body */}
      <Box
        sx={{
          p: 3,
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* Scoring Section */}
        <Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: isDark ? "#94a3b8" : "#64748b",
              display: "block",
              mb: 3,
            }}
          >
            Competency Evaluation
          </Typography>
          {renderRatingRow("Technical Fit", "technical")}
          {renderRatingRow("Communication", "communication")}
          {renderRatingRow("Culture Fit", "culture")}
        </Box>

        {/* Notes Section */}
        <Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: isDark ? "#94a3b8" : "#64748b",
              display: "block",
              mb: 1.5,
            }}
          >
            Interview Notes
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter detailed feedback about the candidate's performance, strengths, and areas for improvement..."
            variant="outlined"
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 3,
                bgcolor: isDark ? "#101922" : "#f6f7f8",
                "& fieldset": { borderColor: isDark ? "#334155" : "#e2e8f0" },
                "&:hover fieldset": { borderColor: "#137fec" },
                "&.Mui-focused fieldset": {
                  borderColor: "#137fec",
                  borderWidth: 2,
                },
              },
            }}
          />
        </Box>

        {/* Decision Toggle */}
        <Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: isDark ? "#94a3b8" : "#64748b",
              display: "block",
              mb: 2,
            }}
          >
            Recommendation
          </Typography>
          <Grid container spacing={2}>
            {/* No Hire Option */}
            <Grid size={{ xs: 6 }}>
              <Paper
                elevation={0}
                onClick={() => setRecommendation("nohire")}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  cursor: "pointer",
                  border: `2px solid ${
                    recommendation === "nohire"
                      ? "#ef4444" // danger color
                      : isDark
                        ? "#334155"
                        : "#e2e8f0"
                  }`,
                  bgcolor:
                    recommendation === "nohire"
                      ? isDark
                        ? alpha("#ef4444", 0.1)
                        : "#fef2f2"
                      : isDark
                        ? "#1a2632"
                        : "#ffffff",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  "&:hover": {
                    bgcolor: isDark ? alpha("#ef4444", 0.05) : "#fef2f2",
                    borderColor: "#ef4444",
                  },
                }}
              >
                <Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color:
                        recommendation === "nohire"
                          ? "#ef4444"
                          : "text.primary",
                    }}
                  >
                    No Hire
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", mt: 0.5, display: "block" }}
                  >
                    Do not advance
                  </Typography>
                </Box>
                <ThumbDownAltOutlinedIcon
                  sx={{
                    color:
                      recommendation === "nohire"
                        ? "#ef4444"
                        : isDark
                          ? "#475569"
                          : "#cbd5e1",
                  }}
                />
              </Paper>
            </Grid>

            {/* Hire Option */}
            <Grid size={{ xs: 6 }}>
              <Paper
                elevation={0}
                onClick={() => setRecommendation("hire")}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  cursor: "pointer",
                  border: `2px solid ${
                    recommendation === "hire"
                      ? "#22c55e" // success color
                      : isDark
                        ? "#334155"
                        : "#e2e8f0"
                  }`,
                  bgcolor:
                    recommendation === "hire"
                      ? isDark
                        ? alpha("#22c55e", 0.1)
                        : "#f0fdf4"
                      : isDark
                        ? "#1a2632"
                        : "#ffffff",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  "&:hover": {
                    bgcolor: isDark ? alpha("#22c55e", 0.05) : "#f0fdf4",
                    borderColor: "#22c55e",
                  },
                }}
              >
                <Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color:
                        recommendation === "hire" ? "#22c55e" : "text.primary",
                    }}
                  >
                    Hire
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", mt: 0.5, display: "block" }}
                  >
                    Recommend to advance
                  </Typography>
                </Box>
                <ThumbUpAltOutlinedIcon
                  sx={{
                    color:
                      recommendation === "hire"
                        ? "#22c55e"
                        : isDark
                          ? "#475569"
                          : "#cbd5e1",
                  }}
                />
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Box>

      {/* Drawer Footer */}
      <Box
        sx={{
          p: 3,
          borderTop: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
          bgcolor: isDark ? "#1a2632" : "#ffffff",
          display: "flex",
          gap: 2,
          position: "sticky",
          bottom: 0,
        }}
      >
        <Button
          variant="outlined"
          fullWidth
          onClick={onClose}
          sx={{
            borderRadius: 3,
            color: isDark ? "#e2e8f0" : "#0f172a",
            borderColor: isDark ? "#475569" : "#e2e8f0",
            textTransform: "none",
            fontWeight: 600,
            py: 1.2,
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f6f7f8",
              borderColor: isDark ? "#64748b" : "#cbd5e1",
            },
          }}
        >
          Save Draft
        </Button>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            console.log("Submitting feedback", {
              scores,
              notes,
              recommendation,
            });
            onClose();
          }}
          disabled={!recommendation} // Require a recommendation to submit
          sx={{
            borderRadius: 3,
            bgcolor: "#137fec",
            color: "#ffffff",
            textTransform: "none",
            fontWeight: 600,
            py: 1.2,
            boxShadow: "0 4px 6px -1px rgba(19, 127, 236, 0.2)",
            "&:hover": {
              bgcolor: "#1170d0",
            },
            "&.Mui-disabled": {
              bgcolor: isDark ? "#334155" : "#e2e8f0",
              color: isDark ? "#94a3b8" : "#94a3b8",
            },
          }}
        >
          Submit Feedback
        </Button>
      </Box>
    </Drawer>
  );
};

export default EvaluationDrawer;
