import React, { useState } from "react";
import { Box, TextField, MenuItem, Button, useTheme } from "@mui/material";

/**
 * AddTaskInline Component
 * A localized, inline form for quickly adding a new task to a specific category.
 * * @param {number} sectionIdx - The index of the category receiving the new task.
 * @param {function} onSave - Callback triggered with the new task data.
 * @param {function} onCancel - Callback triggered to close the inline editor.
 * @param {Array} assignees - List of available assignees for the dropdown.
 */
const AddTaskInline = ({ sectionIdx, onSave, onCancel, assignees }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Local state for the new task
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("HR Admin");
  const [assigneeType, setAssigneeType] = useState("internal");
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split("T")[0],
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
    onSave({ title, description, assignee, assigneeType, dueDate }, sectionIdx);
  };

  return (
    <Box
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        bgcolor: isDark ? "rgba(19, 127, 236, 0.05)" : "#f0f9ff",
        borderTop: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
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
          Save Task
        </Button>
      </Box>
    </Box>
  );
};

export default AddTaskInline;
