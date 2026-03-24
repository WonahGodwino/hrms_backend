import React from "react";
import { Box, Typography, Paper, useTheme } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";

const MOCK_ACTIVITY = [
  {
    id: 1,
    title: "Contract Signed",
    description: "System - Contract signed via DocuSign",
    time: "2 hours ago",
    color: "success",
  },
  {
    id: 2,
    title: "Email Provisioned",
    description: "IT Dept created a.yusuf@company.com",
    time: "5 hours ago",
    color: "primary",
  },
  {
    id: 3,
    title: "Template Applied",
    description: "HR Admin applied Engineering Baseline",
    time: "Yesterday, 4:15 PM",
    color: "default",
  },
  {
    id: 4,
    title: "Profile Created",
    description: "Initial candidate record generated",
    time: "Apr 01, 10:20 AM",
    color: "default",
  },
  {
    id: 5,
    title: "Welcome Email Drafted",
    description: "Drafted by Ibrahim Okafor",
    time: "Mar 30, 2:30 PM",
    color: "primary",
  },
  {
    id: 6,
    title: "Background Check Initiated",
    description: "Sent to Checkr for verification",
    time: "Mar 28, 11:00 AM",
    color: "default",
  },
  {
    id: 7,
    title: "Offer Accepted",
    description: "Candidate signed the offer letter",
    time: "Mar 27, 4:45 PM",
    color: "success",
  },
  {
    id: 8,
    title: "Offer Sent",
    description: "HR Admin sent the offer letter",
    time: "Mar 26, 1:15 PM",
    color: "primary",
  },
];

const ActivityLog = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
        bgcolor: isDark ? "#1e293b" : "#ffffff",
        display: "flex",
        flexDirection: "column",
        position: { lg: "sticky" },
        top: { lg: 120 }, // Offsets the main page sticky header
        maxHeight: { lg: "calc(100vh - 160px)" }, // Constrains the height so it can scroll internally
        overflow: "hidden", // Clips the inner header's background to respect the border radius
      }}
    >
      {/* Sticky Header inside the log */}
      <Box
        sx={{
          p: 3,
          pb: 2,
          borderBottom: `1px solid ${isDark ? "#334155" : "#f1f5f9"}`,
          bgcolor: isDark ? "#1e293b" : "#ffffff",
          zIndex: 2,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            color: isDark ? "#fff" : "#1e293b",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <HistoryIcon sx={{ color: isDark ? "#64748b" : "#94a3b8" }} />
          Recent Activity
        </Typography>
      </Box>

      {/* Scrollable Timeline */}
      <Box
        sx={{
          p: 3,
          overflowY: "auto",
          flexGrow: 1,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: isDark ? "#475569" : "#cbd5e1",
            borderRadius: 3,
          },
        }}
      >
        <Box
          sx={{
            position: "relative",
            pl: 2,
            ml: 1,
            borderLeft: `2px solid ${isDark ? "#334155" : "#f1f5f9"}`,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {MOCK_ACTIVITY.map((activity) => {
            // Map conceptual colors to theme colors
            const dotColorMap = {
              success: "#10b981",
              primary: "#137fec",
              default: isDark ? "#475569" : "#cbd5e1",
            };

            return (
              <Box key={activity.id} sx={{ position: "relative" }}>
                {/* Timeline Dot */}
                <Box
                  sx={{
                    position: "absolute",
                    left: "-25px", // Offset to sit exactly on the border
                    top: "4px",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    bgcolor: dotColorMap[activity.color],
                    border: `3px solid ${isDark ? "#1e293b" : "#ffffff"}`,
                  }}
                />
                <Box>
                  <Typography
                    variant="body1"
                    sx={{
                      fontWeight: 600,
                      color: isDark ? "#e2e8f0" : "#1e293b",
                    }}
                  >
                    {activity.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: isDark ? "#94a3b8" : "#64748b", mt: 0.5 }}
                  >
                    {activity.description}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      color: isDark ? "#64748b" : "#94a3b8",
                      fontWeight: 600,
                      mt: 1,
                    }}
                  >
                    {activity.time}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
};

export default ActivityLog;
