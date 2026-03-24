import React from "react";
import {
  Box,
  Typography,
  Avatar,
  LinearProgress,
  Grid,
  IconButton,
  Collapse,
  Button,
  useTheme,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import EditIcon from "@mui/icons-material/Edit";

const ChecklistHeader = ({
  progressData,
  appliedTemplateName,
  isMobile,
  showMetaMobile,
  setShowMetaMobile,
  onOpenTemplateModal,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        bgcolor: isDark ? "#1e293b" : "#ffffff",
        borderBottom: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
        boxShadow: isDark ? "none" : "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
        mb: 4,
      }}
    >
      <Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, md: 4 }, py: 3 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { md: "center" },
            justifyContent: "space-between",
            gap: 3,
          }}
        >
          {/* Identity */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Avatar
              sx={{
                width: 56,
                height: 56,
                bgcolor: "#137fec",
                color: "#ffffff",
                fontSize: "1.25rem",
                fontWeight: 600,
                boxShadow: "inset 0 2px 4px 0 rgba(0,0,0,0.1)",
              }}
            >
              AY
            </Avatar>
            <Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  color: isDark ? "#fff" : "#0f172a",
                  lineHeight: 1.2,
                }}
              >
                Amina Yusuf
              </Typography>
              <Typography
                variant="body1"
                sx={{ color: isDark ? "#94a3b8" : "#475569", fontWeight: 500 }}
              >
                Frontend Developer
              </Typography>
            </Box>
          </Box>

          {/* Dynamic Progress Bar */}
          <Box sx={{ flex: 1, maxWidth: { md: "400px" }, width: "100%" }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                mb: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: "#137fec",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Onboarding Progress
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: isDark ? "#e2e8f0" : "#334155" }}
              >
                {progressData.percentage}% Complete
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progressData.percentage}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: isDark ? "#334155" : "#f1f5f9",
                "& .MuiLinearProgress-bar": {
                  bgcolor:
                    progressData.percentage === 100 ? "#10b981" : "#137fec",
                  borderRadius: 5,
                  transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                },
              }}
            />
          </Box>
        </Box>

        {/* Mobile Toggle for Meta Row */}
        {isMobile && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 3, mb: 1 }}>
            <Button
              size="small"
              endIcon={showMetaMobile ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setShowMetaMobile(!showMetaMobile)}
              sx={{
                color: isDark ? "#94a3b8" : "#64748b",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.75rem",
                bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
                px: 2,
                py: 0.5,
                borderRadius: 2,
                "&:hover": {
                  bgcolor: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
                },
              }}
            >
              {showMetaMobile ? "Hide Setup Details" : "View Setup Details"}
            </Button>
          </Box>
        )}

        {/* Meta Row - Collapsible on Mobile */}
        <Collapse in={!isMobile || showMetaMobile}>
          <Grid
            container
            spacing={3}
            sx={{
              mt: isMobile ? 2 : 3,
              pt: 2,
              borderTop: `1px solid ${isDark ? "#334155" : "#f1f5f9"}`,
            }}
          >
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: isDark ? "#64748b" : "#94a3b8",
                  textTransform: "uppercase",
                  display: "block",
                }}
              >
                Expected Start Date
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  fontWeight: 600,
                  color: isDark ? "#e2e8f0" : "#334155",
                  mt: 0.5,
                }}
              >
                15 Apr 2026
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: isDark ? "#64748b" : "#94a3b8",
                  textTransform: "uppercase",
                  display: "block",
                }}
              >
                Assigned Manager
              </Typography>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
              >
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    bgcolor: isDark ? "rgba(249, 115, 22, 0.2)" : "#ffedd5",
                    color: isDark ? "#fdba74" : "#ea580c",
                  }}
                >
                  IO
                </Avatar>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 600,
                    color: isDark ? "#e2e8f0" : "#334155",
                  }}
                >
                  Ibrahim Okafor
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: isDark ? "#64748b" : "#94a3b8",
                  textTransform: "uppercase",
                  display: "block",
                }}
              >
                Applied Template
              </Typography>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 600,
                    color: isDark ? "#e2e8f0" : "#334155",
                    fontStyle: "italic",
                  }}
                >
                  {appliedTemplateName}
                </Typography>
                <IconButton
                  size="small"
                  onClick={onOpenTemplateModal}
                  sx={{
                    color: "#137fec",
                    bgcolor: isDark ? "rgba(19, 127, 236, 0.1)" : "#eff6ff",
                    "&:hover": {
                      bgcolor: isDark ? "rgba(19, 127, 236, 0.2)" : "#dbeafe",
                    },
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Box>
            </Grid>
          </Grid>
        </Collapse>
      </Box>
    </Box>
  );
};

export default ChecklistHeader;
