import React from "react";
import {
  Box,
  Paper,
  Button,
  CircularProgress,
  useTheme,
  alpha,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";

const FloatingActionBar = ({
  isSendingWelcome,
  onSendWelcome,
  isSendingReminders,
  onSendReminders,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: { xs: 16, md: 24 },
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        width: "100%",
        maxWidth: "800px",
        px: 2,
      }}
    >
      <Paper
        elevation={isDark ? 8 : 12}
        sx={{
          p: 1.5,
          borderRadius: 4,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 1.5,
          bgcolor: isDark ? alpha("#1e293b", 0.85) : alpha("#ffffff", 0.85),
          backdropFilter: "blur(12px)",
          border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
        }}
      >
        <Button
          variant="contained"
          startIcon={
            isSendingWelcome ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <SendIcon />
            )
          }
          onClick={onSendWelcome}
          disabled={isSendingWelcome}
          sx={{
            flex: 1,
            bgcolor: "#137fec",
            color: "#fff",
            fontWeight: 700,
            py: 1.5,
            borderRadius: 3,
            textTransform: "none",
            fontSize: "0.95rem",
            boxShadow: "0 10px 15px -3px rgba(19, 127, 236, 0.2)",
            "&:hover": { bgcolor: "#1170d0" },
            "&.Mui-disabled": {
              bgcolor: isDark ? "#334155" : "#94a3b8",
              color: isDark ? "#94a3b8" : "#ffffff",
            },
          }}
        >
          {isSendingWelcome ? "Sending..." : "Send Welcome Email & Magic Link"}
        </Button>
        <Button
          variant="outlined"
          startIcon={
            isSendingReminders ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <NotificationsActiveIcon />
            )
          }
          onClick={onSendReminders}
          disabled={isSendingReminders}
          sx={{
            flex: 1,
            bgcolor: isDark ? "rgba(255,255,255,0.02)" : "#ffffff",
            color: isDark ? "#e2e8f0" : "#334155",
            borderColor: isDark ? "#475569" : "#cbd5e1",
            fontWeight: 700,
            py: 1.5,
            borderRadius: 3,
            textTransform: "none",
            fontSize: "0.95rem",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
              borderColor: isDark ? "#64748b" : "#94a3b8",
            },
            "&.Mui-disabled": {
              borderColor: isDark ? "#334155" : "#e2e8f0",
              color: isDark ? "#475569" : "#94a3b8",
              bgcolor: isDark ? "transparent" : "#f1f5f9",
            },
          }}
        >
          {isSendingReminders
            ? "Sending Reminders..."
            : "Send Pending Task Reminders"}
        </Button>
      </Paper>
    </Box>
  );
};

export default FloatingActionBar;
