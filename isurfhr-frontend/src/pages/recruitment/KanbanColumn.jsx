import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemText,
} from "@mui/material";
import SortIcon from "@mui/icons-material/Sort";
import AddIcon from "@mui/icons-material/Add";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useDrop } from "react-dnd";

import KanbanCard, { ITEM_TYPE } from "./KanbanCard";

/**
 * Kanban Column Component - Drop Target
 */
const KanbanColumn = ({
  column,
  columnApplicants,
  isDarkMode,
  handleActionClick,
  handleCardClick,
  onDropApplicant,
  currentSort,
  onSortChange,
}) => {
  // Set up React DnD useDrop hook
  const [{ isOver }, dropRef] = useDrop({
    accept: ITEM_TYPE,
    drop: (item) => onDropApplicant(item.id, column.id),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });

  const [sortAnchorEl, setSortAnchorEl] = useState(null);

  // Apply sorting dynamically if a sort order is configured for this column
  const sortedApplicants = useMemo(() => {
    if (!currentSort) return columnApplicants;
    return [...columnApplicants].sort((a, b) => {
      if (currentSort === "score_desc")
        return (b.rawScore || 0) - (a.rawScore || 0);
      if (currentSort === "date_desc")
        return (b.rawDate || 0) - (a.rawDate || 0);
      return 0;
    });
  }, [columnApplicants, currentSort]);

  return (
    <Box
      ref={dropRef}
      sx={{
        minWidth: 320,
        width: 320,
        height: "100%", // Fixed layout for nested scrolling
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden", // CRITICAL FIX: Clips the header background to match the parent's border radius perfectly
        // Dynamic Background based on drag over state directly provided by react-dnd
        bgcolor: isOver
          ? isDarkMode
            ? "rgba(19, 127, 236, 0.15)"
            : "rgba(239, 246, 255, 0.8)"
          : column.isHighlight
            ? isDarkMode
              ? "rgba(19, 127, 236, 0.05)"
              : "rgba(239, 246, 255, 0.5)"
            : isDarkMode
              ? "rgba(30, 41, 59, 0.5)"
              : "rgba(241, 245, 249, 0.5)",
        borderRadius: 3,
        border: `1px solid ${
          isOver
            ? "#137fec" // Distinct active border when dragging over
            : column.isHighlight
              ? "rgba(19, 127, 236, 0.3)"
              : isDarkMode
                ? "#334155"
                : "rgba(226, 232, 240, 0.6)"
        }`,
        transition: "background-color 0.2s ease, border-color 0.2s ease",
        ...(column.isHighlight && {
          boxShadow: isDarkMode
            ? "0 0 15px rgba(19, 127, 236, 0.1)"
            : "0 0 15px rgba(19, 127, 236, 0.1)",
        }),
      }}
    >
      {/* Column Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: `2px solid ${column.color}`,
          bgcolor: column.bgLight,
          ...(isDarkMode && { bgcolor: column.bgDark }),
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              color: isDarkMode ? "#e2e8f0" : "#334155",
              fontSize: "0.875rem",
            }}
          >
            {column.label}
          </Typography>
          <Chip
            label={columnApplicants.length}
            size="small"
            sx={{
              bgcolor: column.badgeBg,
              color: column.badgeText,
              fontWeight: 700,
              height: 24,
              minWidth: 28,
              fontSize: "0.75rem",
            }}
          />
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {/* Column Sort Toggle */}
          <IconButton
            size="small"
            onClick={(e) => setSortAnchorEl(e.currentTarget)}
            sx={{
              color: currentSort
                ? "#137fec"
                : isDarkMode
                  ? "#64748b"
                  : "#94a3b8",
              bgcolor: currentSort
                ? isDarkMode
                  ? "rgba(19,127,236,0.1)"
                  : "#eff6ff"
                : "transparent",
            }}
          >
            <SortIcon fontSize="small" />
          </IconButton>

          <Menu
            anchorEl={sortAnchorEl}
            open={Boolean(sortAnchorEl)}
            onClose={() => setSortAnchorEl(null)}
            PaperProps={{
              sx: {
                bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
                border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              },
            }}
          >
            <MenuItem
              onClick={() => {
                onSortChange(column.id, "score_desc");
                setSortAnchorEl(null);
              }}
              selected={currentSort === "score_desc"}
            >
              <ListItemText
                primaryTypographyProps={{
                  fontSize: "0.875rem",
                  fontWeight: currentSort === "score_desc" ? 600 : 400,
                }}
              >
                Highest Score
              </ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                onSortChange(column.id, "date_desc");
                setSortAnchorEl(null);
              }}
              selected={currentSort === "date_desc"}
            >
              <ListItemText
                primaryTypographyProps={{
                  fontSize: "0.875rem",
                  fontWeight: currentSort === "date_desc" ? 600 : 400,
                }}
              >
                Newest First
              </ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                onSortChange(column.id, null);
                setSortAnchorEl(null);
              }}
              selected={!currentSort}
            >
              <ListItemText
                primaryTypographyProps={{
                  fontSize: "0.875rem",
                  fontWeight: !currentSort ? 600 : 400,
                }}
              >
                Default Order
              </ListItemText>
            </MenuItem>
          </Menu>

          <IconButton
            size="small"
            sx={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}
          >
            {column.id === "Interview Scheduled" ? (
              <AddIcon fontSize="small" sx={{ color: "#137fec" }} />
            ) : (
              <MoreHorizIcon fontSize="small" />
            )}
          </IconButton>
        </Box>
      </Box>

      {/* Column Body (Cards) */}
      <Box
        className="column-scroll"
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flexGrow: 1,
          minHeight: 0, // CRITICAL: Allows vertical nested scrolling inside columns
          overflowY: "auto",
          opacity: column.id === "Rejected" ? 0.7 : 1,
          "&:hover": { opacity: 1 },
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: isDarkMode ? "#475569" : "#cbd5e1",
            borderRadius: 2,
          },
        }}
      >
        {/* Dynamic Visual Drop Indicator - Driven by react-dnd monitor */}
        {isOver && (
          <Box
            sx={{
              border: "2px dashed rgba(19, 127, 236, 0.6)",
              bgcolor: "rgba(19, 127, 236, 0.08)",
              borderRadius: 2,
              height: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 1,
            }}
          >
            <Typography
              variant="body2"
              sx={{ color: "rgba(19, 127, 236, 0.8)", fontWeight: 600 }}
            >
              Drop candidate here
            </Typography>
          </Box>
        )}

        {sortedApplicants.map((app) => (
          <KanbanCard
            key={app.id}
            app={app}
            isDarkMode={isDarkMode}
            handleActionClick={handleActionClick}
            handleCardClick={handleCardClick}
          />
        ))}

        {sortedApplicants.length === 0 && !isOver && (
          <Box sx={{ p: 2, textAlign: "center", opacity: 0.6 }}>
            <Typography variant="body2" color="text.secondary">
              No applicants
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default KanbanColumn;
