import React, { useState } from "react";
import { Box, TextField, MenuItem, Button, useTheme } from "@mui/material";

/**
 * EditTaskInline Component
 * A localized, inline form for quickly editing an existing task's details.
 */
const EditTaskInline = ({ task, assignees, onSave, onCancel, isLast }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Local state initialized with the existing task's data
  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [assignee, setAssignee] = useState(task.assignee || "");
  const [assigneeType, setAssigneeType] = useState(
    task.assigneeType || "internal",
  );
  const [dueDate, setDueDate] = useState(
    task.dueDate || new Date().toISOString().split("T")[0],
  );

  const handleAssigneeChange = (e) => {
    const selected = assignees.find((a) => a.name === e.target.value);
    if (selected) {
      setAssignee(selected.name);
      setAssigneeType(selected.type);
    }
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title, description, assignee, assigneeType, dueDate });
  };

  return (
    <Box
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        bgcolor: isDark ? "rgba(19, 127, 236, 0.05)" : "#f0f9ff",
        borderBottom: isLast
          ? "none"
          : `1px solid ${isDark ? "#334155" : "#f1f5f9"}`,
      }}
    >
      <TextField
        size="small"
        placeholder="Task Title (e.g., Set up access badges)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        sx={{
          "& .MuiOutlinedInput-root": {
            bgcolor: isDark ? "#0f172a" : "#ffffff",
            borderRadius: 2,
          },
        }}
      />
      <TextField
        size="small"
        placeholder="Task Description (Optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        multiline
        rows={2}
        sx={{
          "& .MuiOutlinedInput-root": {
            bgcolor: isDark ? "#0f172a" : "#ffffff",
            borderRadius: 2,
          },
        }}
      />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          label="Assignee"
          value={assignee}
          onChange={handleAssigneeChange}
          sx={{
            flex: 1,
            minWidth: "150px",
            "& .MuiOutlinedInput-root": {
              bgcolor: isDark ? "#0f172a" : "#ffffff",
              borderRadius: 2,
            },
          }}
        >
          {assignees.map((a) => (
            <MenuItem key={a.name} value={a.name}>
              {a.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          size="small"
          label="Due Date"
          InputLabelProps={{ shrink: true }}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          sx={{
            flex: 1,
            minWidth: "150px",
            "& .MuiOutlinedInput-root": {
              bgcolor: isDark ? "#0f172a" : "#ffffff",
              borderRadius: 2,
            },
          }}
        />
      </Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
        <Button
          onClick={onCancel}
          sx={{
            color: isDark ? "#cbd5e1" : "#475569",
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!title.trim()}
          sx={{
            bgcolor: "#137fec",
            color: "#fff",
            textTransform: "none",
            fontWeight: 600,
            boxShadow: "none",
            "&:hover": { bgcolor: "#1170d0", boxShadow: "none" },
          }}
        >
          Save Changes
        </Button>
      </Box>
    </Box>
  );
};

export default EditTaskInline;
