import React from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Avatar,
  Chip,
  IconButton,
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import VerifiedIcon from "@mui/icons-material/Verified";
import { useDrag } from "react-dnd";

export const ITEM_TYPE = "APPLICANT";

/**
 * Helper to get proper avatar colors based on theme
 */
const getAvatarColors = (colorName, isDark) => {
  const map = {
    purple: {
      bg: isDark ? "rgba(147, 51, 234, 0.2)" : "#f3e8ff",
      text: isDark ? "#d8b4fe" : "#9333ea",
      border: isDark ? "#7e22ce" : "#e9d5ff",
    },
    blue: {
      bg: isDark ? "rgba(37, 99, 235, 0.2)" : "#dbeafe",
      text: isDark ? "#93c5fd" : "#2563eb",
      border: isDark ? "#1d4ed8" : "#bfdbfe",
    },
    orange: {
      bg: isDark ? "rgba(234, 88, 12, 0.2)" : "#ffedd5",
      text: isDark ? "#fdba74" : "#ea580c",
      border: isDark ? "#c2410c" : "#fed7aa",
    },
    teal: {
      bg: isDark ? "rgba(13, 148, 136, 0.2)" : "#ccfbf1",
      text: isDark ? "#5eead4" : "#0d9488",
      border: isDark ? "#0f766e" : "#99f6e4",
    },
    indigo: {
      bg: isDark ? "rgba(79, 70, 229, 0.2)" : "#e0e7ff",
      text: isDark ? "#a5b4fc" : "#4f46e5",
      border: isDark ? "#4338ca" : "#c7d2fe",
    },
    pink: {
      bg: isDark ? "rgba(219, 39, 119, 0.2)" : "#fce7f3",
      text: isDark ? "#f9a8d4" : "#db2777",
      border: isDark ? "#be185d" : "#fbcfe8",
    },
    green: {
      bg: isDark ? "rgba(22, 163, 74, 0.2)" : "#dcfce7",
      text: isDark ? "#86efac" : "#16a34a",
      border: isDark ? "#15803d" : "#bbf7d0",
    },
    slate: {
      bg: isDark ? "rgba(71, 85, 105, 0.2)" : "#f1f5f9",
      text: isDark ? "#cbd5e1" : "#475569",
      border: isDark ? "#334155" : "#e2e8f0",
    },
  };
  return map[colorName] || map.slate;
};

/**
 * Kanban Card Component - Draggable Item
 */
const KanbanCard = ({
  app,
  isDarkMode,
  handleActionClick,
  handleCardClick,
}) => {
  const avatarStyle = getAvatarColors(app.avatarColor, isDarkMode);

  // Set up React DnD useDrag hook
  const [{ isDragging }, dragRef] = useDrag({
    type: ITEM_TYPE,
    item: { id: app.id, status: app.status },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  });

  return (
    <Paper
      ref={dragRef}
      elevation={0}
      onClick={() => handleCardClick(app.id)} // Trigger Details Drawer on Click
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: isDarkMode ? "#0f172a" : "#ffffff",
        border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
        transition:
          "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.2s",
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1, // Fade out the card being dragged automatically
        "&:active": { cursor: "grabbing" },
        "&:hover": {
          transform: isDragging ? "none" : "translateY(-4px)",
          boxShadow: isDarkMode
            ? "0 12px 24px -4px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)"
            : "0 12px 24px -4px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
          borderColor:
            app.status === "Interview Scheduled"
              ? "rgba(19, 127, 236, 0.5)"
              : isDarkMode
                ? "#475569"
                : "#cbd5e1",
        },
        // Specific highlight borders mapped from data attributes
        ...(app.isTopRanked && {
          border: `1px solid ${isDarkMode ? "rgba(19, 127, 236, 0.5)" : "#bfdbfe"}`,
          boxShadow: isDarkMode
            ? "0 0 10px rgba(19, 127, 236, 0.1)"
            : "0 0 10px rgba(19, 127, 236, 0.15)",
        }),
        ...(app.tagAlert && {
          borderLeft: "4px solid #f59e0b",
        }),
        ...(app.isHired && {
          border: `1px solid ${isDarkMode ? "rgba(22, 163, 74, 0.3)" : "#bbf7d0"}`,
        }),
        ...(app.rejectedReason && {
          filter: "grayscale(100%)",
          "&:hover": { filter: "grayscale(0%)" },
        }),
      }}
    >
      {/* Top row elements (Star, Alert, etc) */}
      {app.isTopRanked && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: -1 }}>
          <StarIcon sx={{ color: "#fbbf24", fontSize: 18 }} />
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Avatar
            src={app.avatar}
            sx={{
              width: 36,
              height: 36,
              bgcolor: avatarStyle.bg,
              color: avatarStyle.text,
              border: `1px solid ${avatarStyle.border}`,
              fontSize: "0.875rem",
              fontWeight: 700,
            }}
          >
            {app.initials}
          </Avatar>
          <Box>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: isDarkMode ? "#f1f5f9" : "#0f172a",
                lineHeight: 1.2,
                mb: 0.2,
                ...(app.rejectedReason && {
                  textDecoration: "line-through",
                  color: isDarkMode ? "#94a3b8" : "#64748b",
                }),
              }}
            >
              {app.name}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: app.isHired
                  ? "#16a34a"
                  : isDarkMode
                    ? "#94a3b8"
                    : "#64748b",
                fontWeight: app.isHired ? 600 : 400,
              }}
            >
              {app.role} {app.timeAgo && `• ${app.timeAgo}`}
            </Typography>
          </Box>
        </Box>

        {app.matchScore && !app.isTopRanked && !app.progress && (
          <Chip
            label={app.matchScore}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.7rem",
              fontWeight: 700,
              bgcolor: isDarkMode ? "rgba(22, 163, 74, 0.1)" : "#f0fdf4",
              color: isDarkMode ? "#4ade80" : "#16a34a",
              border: `1px solid ${
                isDarkMode ? "rgba(22, 163, 74, 0.3)" : "#dcfce7"
              }`,
              borderRadius: 1,
            }}
          />
        )}
        {app.isHired && (
          <VerifiedIcon sx={{ color: "#10b981", fontSize: 20 }} />
        )}
      </Box>

      {/* Middle Elements (Progress Bar, Calendar, Tags) */}
      {app.progress && (
        <Box sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: "100%",
              bgcolor: isDarkMode ? "#334155" : "#f1f5f9",
              borderRadius: "9999px",
              height: 6,
            }}
          >
            <Box
              sx={{
                bgcolor: "#22c55e",
                height: 6,
                borderRadius: "9999px",
                width: `${app.progress}%`,
              }}
            />
          </Box>
        </Box>
      )}

      {app.tags && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
          {app.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              sx={{
                height: 20,
                fontSize: "0.65rem",
                fontWeight: 600,
                bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f8fafc",
                color: isDarkMode ? "#cbd5e1" : "#64748b",
                border: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
                borderRadius: 1,
              }}
            />
          ))}
        </Box>
      )}

      {app.schedule && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1,
            bgcolor: isDarkMode ? "rgba(255,255,255,0.02)" : "#f8fafc",
            borderRadius: 1,
            mt: 1,
          }}
        >
          <CalendarMonthIcon
            sx={{
              fontSize: 16,
              color: isDarkMode ? "#94a3b8" : "#64748b",
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: isDarkMode ? "#cbd5e1" : "#475569",
              fontWeight: 500,
            }}
          >
            {app.schedule}
          </Typography>
        </Box>
      )}

      {app.rejectedReason && (
        <Box sx={{ mt: 1 }}>
          <Chip
            label={app.rejectedReason}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.65rem",
              bgcolor: isDarkMode ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
              color: "#ef4444",
              borderRadius: 1,
            }}
          />
        </Box>
      )}

      {app.tagAlert && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mt: 1,
          }}
        >
          <Chip
            label={app.tagAlert}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.65rem",
              fontWeight: 700,
              textTransform: "uppercase",
              bgcolor: isDarkMode ? "rgba(245, 158, 11, 0.15)" : "#fffbeb",
              color: "#d97706",
              borderRadius: 1,
            }}
          />
        </Box>
      )}

      {/* Bottom Row / Actions */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mt: 1.5,
        }}
      >
        {app.isTopRanked || app.progress ? (
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: "#16a34a" }}
          >
            {app.matchScore}
          </Typography>
        ) : app.isHired ? (
          <Button
            variant="outlined"
            size="small"
            fullWidth
            sx={{
              textTransform: "none",
              fontSize: "0.75rem",
              color: isDarkMode ? "#cbd5e1" : "#64748b",
              borderColor: isDarkMode ? "#334155" : "#e2e8f0",
              borderStyle: "dashed",
            }}
          >
            View Onboarding
          </Button>
        ) : (
          <Box /> // Spacer
        )}

        {!app.isHired && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation(); // VERY IMPORTANT: Prevents the card onClick from firing when opening the menu
              handleActionClick(e, app.id);
            }}
            sx={{
              color: isDarkMode ? "#64748b" : "#94a3b8",
              "&:hover": {
                bgcolor: isDarkMode ? "#1e293b" : "#f1f5f9",
                color: isDarkMode ? "#cbd5e1" : "#475569",
              },
              ml: "auto",
            }}
          >
            <MoreHorizIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Paper>
  );
};

export default KanbanCard;
