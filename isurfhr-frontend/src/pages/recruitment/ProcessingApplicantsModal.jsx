import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Modal,
  useTheme,
  Fade,
  Divider,
  CircularProgress,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

/**
 * ProcessingApplicantsModal Component
 * Displays a simulated progression when matching and scoring applicants in bulk.
 * * @param {boolean} open - Modal open state
 * @param {function} onClose - Closes the modal without redirecting
 * @param {function} onComplete - Function triggered when moving to Kanban view
 * @param {number} applicantCount - The total number of applicants being processed
 */
const ProcessingApplicantsModal = ({
  open,
  onClose,
  onComplete,
  applicantCount = 0,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const [step, setStep] = useState(0);

  // Automatically advance steps to simulate a complex background process
  useEffect(() => {
    if (open) {
      setStep(0);
      const t1 = setTimeout(() => setStep(1), 1500); // 1.5s: Analyze -> Match/Score
      const t2 = setTimeout(() => setStep(2), 3000); // 3.0s: Match/Score -> Shortlist
      const t3 = setTimeout(() => setStep(3), 4500); // 4.5s: Complete process

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [open]);

  // Helper for rendering Ping/Spinner combo
  const renderActiveSpinner = () => (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          width: "100%",
          height: "100%",
          bgcolor: "rgba(19, 127, 236, 0.2)",
          borderRadius: "50%",
          animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
          "@keyframes ping": {
            "75%, 100%": { transform: "scale(2)", opacity: 0 },
          },
        }}
      />
      <CircularProgress
        size={28}
        thickness={5}
        sx={{ color: "#137fec", position: "relative", zIndex: 10 }}
      />
    </Box>
  );

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
          backgroundColor: "rgba(15, 23, 42, 0.6)",
        },
      }}
    >
      <Fade in={open}>
        <Paper
          elevation={24}
          sx={{
            width: "100%",
            maxWidth: "580px",
            bgcolor: isDarkMode ? "#1A2633" : "#ffffff",
            borderRadius: 4,
            overflow: "hidden",
            outline: "none",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header Section */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pt: 4,
              pb: 2,
              px: 4,
            }}
          >
            <Typography
              variant="h5"
              component="h2"
              sx={{
                fontWeight: 700,
                fontSize: "1.625rem",
                color: isDarkMode ? "#ffffff" : "#111418",
                lineHeight: 1.2,
                textAlign: "center",
                letterSpacing: "-0.015em",
              }}
            >
              Processing Applicants
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: isDarkMode ? "#9ca3af" : "#617589",
                fontSize: "0.875rem",
                fontWeight: 400,
                mt: 1,
                textAlign: "center",
              }}
            >
              Total: {applicantCount}{" "}
              {applicantCount === 1 ? "Applicant" : "Applicants"}
            </Typography>
          </Box>

          <Divider
            sx={{ borderColor: isDarkMode ? "#374151" : "#e5e7eb", mb: 3 }}
          />

          {/* Body Content: Timeline/Stepper */}
          <Box sx={{ px: 4, pb: 4 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "48px 1fr",
                columnGap: 1,
              }}
            >
              {/* Step 1: Analyze Applications */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  pt: 0.5,
                  height: "100%",
                }}
              >
                {step > 0 ? (
                  <CheckCircleIcon sx={{ color: "#137fec", fontSize: 28 }} />
                ) : (
                  renderActiveSpinner()
                )}
                <Box
                  sx={{
                    width: "2px",
                    bgcolor:
                      step > 0
                        ? "rgba(19, 127, 236, 0.2)"
                        : isDarkMode
                          ? "#4b5563"
                          : "#dbe0e6",
                    flexGrow: 1,
                    minHeight: "40px",
                    my: 0.5,
                    borderRadius: "9999px",
                  }}
                />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  pb: 4,
                  pt: 0.5,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 600,
                    color:
                      step > 0 ? (isDarkMode ? "#fff" : "#111418") : "#137fec",
                    lineHeight: 1.2,
                  }}
                >
                  Analyze Applications
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      step > 0
                        ? isDarkMode
                          ? "#9ca3af"
                          : "#617589"
                        : isDarkMode
                          ? "#d1d5db"
                          : "#111418",
                    fontSize: "0.875rem",
                    mt: 0.5,
                  }}
                >
                  Resumes parsed, formats checked.
                </Typography>
              </Box>

              {/* Step 2: Match & Score Candidates */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  pt: 0.5,
                  height: "100%",
                }}
              >
                {step > 1 ? (
                  <CheckCircleIcon sx={{ color: "#137fec", fontSize: 28 }} />
                ) : step === 1 ? (
                  renderActiveSpinner()
                ) : (
                  <RadioButtonUncheckedIcon
                    sx={{
                      color: isDarkMode ? "#4b5563" : "#9ca3af",
                      fontSize: 28,
                    }}
                  />
                )}
                <Box
                  sx={{
                    width: "2px",
                    bgcolor:
                      step > 1
                        ? "rgba(19, 127, 236, 0.2)"
                        : isDarkMode
                          ? "#4b5563"
                          : "#dbe0e6",
                    flexGrow: 1,
                    minHeight: "40px",
                    my: 0.5,
                    borderRadius: "9999px",
                  }}
                />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  pb: 4,
                  pt: 0.5,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: step >= 1 ? 600 : 500,
                    color:
                      step > 1
                        ? isDarkMode
                          ? "#fff"
                          : "#111418"
                        : step === 1
                          ? "#137fec"
                          : isDarkMode
                            ? "#6b7280"
                            : "#9ca3af",
                    lineHeight: 1.2,
                  }}
                >
                  Match & Score Candidates
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      step >= 1
                        ? isDarkMode
                          ? "#d1d5db"
                          : "#111418"
                        : isDarkMode
                          ? "#6b7280"
                          : "#9ca3af",
                    fontSize: "0.875rem",
                    fontWeight: step === 1 ? 500 : 400,
                    mt: 0.5,
                  }}
                >
                  Ranking applicants by relevance...
                </Typography>
              </Box>

              {/* Step 3: Generate Shortlist */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  pt: 0.5,
                }}
              >
                {step > 2 ? (
                  <CheckCircleIcon sx={{ color: "#137fec", fontSize: 28 }} />
                ) : step === 2 ? (
                  renderActiveSpinner()
                ) : (
                  <RadioButtonUncheckedIcon
                    sx={{
                      color: isDarkMode ? "#4b5563" : "#9ca3af",
                      fontSize: 28,
                    }}
                  />
                )}
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", pt: 0.5 }}>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: step >= 2 ? 600 : 500,
                    color:
                      step > 2
                        ? isDarkMode
                          ? "#fff"
                          : "#111418"
                        : step === 2
                          ? "#137fec"
                          : isDarkMode
                            ? "#6b7280"
                            : "#9ca3af",
                    lineHeight: 1.2,
                  }}
                >
                  Moving to Pipeline
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      step >= 2
                        ? isDarkMode
                          ? "#d1d5db"
                          : "#111418"
                        : isDarkMode
                          ? "#6b7280"
                          : "#9ca3af",
                    fontSize: "0.875rem",
                    mt: 0.5,
                  }}
                >
                  Transferring selected candidates to the hiring pipeline.
                </Typography>
              </Box>
            </Box>
          </Box>

          <Divider sx={{ borderColor: isDarkMode ? "#374151" : "#e5e7eb" }} />

          {/* Action Footer */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 1.5,
              px: 4,
              py: 2.5,
              bgcolor: isDarkMode ? "#15202b" : "rgba(249, 250, 251, 0.5)",
            }}
          >
            <Button
              onClick={onClose}
              sx={{
                minWidth: 84,
                height: 40,
                borderRadius: 3,
                px: 2.5,
                bgcolor: isDarkMode ? "transparent" : "#ffffff",
                border: `1px solid ${isDarkMode ? "#4b5563" : "#dbe0e6"}`,
                color: isDarkMode ? "#ffffff" : "#111418",
                fontSize: "0.875rem",
                fontWeight: 700,
                textTransform: "none",
                "&:hover": {
                  bgcolor: isDarkMode ? "#1f2937" : "#f9fafb",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={step < 3}
              onClick={onComplete}
              sx={{
                minWidth: 84,
                height: 40,
                borderRadius: 3,
                px: 2.5,
                bgcolor: "#137fec",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 700,
                textTransform: "none",
                boxShadow:
                  step >= 3 ? "0 1px 2px 0 rgba(0, 0, 0, 0.05)" : "none",
                transition: "all 0.3s ease",
                "&:hover": {
                  bgcolor: "#1170d0",
                },
                "&.Mui-disabled": {
                  bgcolor: "#137fec",
                  color: "#ffffff",
                  opacity: 0.5,
                },
              }}
            >
              View Pipeline
            </Button>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
};

export default ProcessingApplicantsModal;
