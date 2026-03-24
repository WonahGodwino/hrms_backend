import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  Paper,
  useTheme,
  alpha,
  Radio,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LibraryAddIcon from "@mui/icons-material/LibraryAdd";

const MOCK_TEMPLATES = [
  {
    id: "sales_addon",
    name: "Sales Add-on",
    description:
      "Appends standard CRM training, sales playbook review, and shadowing sessions.",
    tasks: [
      {
        category: "Sales Training & CRM",
        tasks: [
          {
            title: "CRM Setup & Walkthrough",
            description:
              "Get access to Salesforce and complete the basic tutorial.",
            assignee: "Sales Ops",
            assigneeType: "internal",
            status: "pending",
            statusText: "Due Day 1",
            dueDate: new Date().toISOString().split("T")[0],
            completed: false,
          },
          {
            title: "Review Sales Playbook",
            description: "Read through the Q3 outbound sales strategy.",
            assignee: "Candidate",
            assigneeType: "candidate",
            status: "pending",
            statusText: "Due Day 3",
            dueDate: new Date().toISOString().split("T")[0],
            completed: false,
          },
        ],
      },
    ],
  },
  {
    id: "leadership_addon",
    name: "Leadership Onboarding",
    description:
      "Managerial access provisioning, 1-on-1s with department heads, and budget review.",
    tasks: [
      {
        category: "Leadership Syncs",
        tasks: [
          {
            title: "Meet with CEO",
            description: "Introductory 1-on-1 vision alignment.",
            assignee: "Candidate",
            assigneeType: "candidate",
            status: "pending",
            statusText: "Due Week 1",
            dueDate: new Date().toISOString().split("T")[0],
            completed: false,
          },
          {
            title: "Budget Review",
            description: "Review Q3/Q4 department budget with Finance.",
            assignee: "Finance Dept",
            assigneeType: "internal",
            status: "pending",
            statusText: "Due Week 2",
            dueDate: new Date().toISOString().split("T")[0],
            completed: false,
          },
        ],
      },
    ],
  },
];

const ApplyTemplateModal = ({ open, onClose, onApply }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  const handleApply = () => {
    const selectedTemplate = MOCK_TEMPLATES.find(
      (t) => t.id === selectedTemplateId,
    );
    if (selectedTemplate) {
      onApply(selectedTemplate);
      setSelectedTemplateId(null); // Reset for future opens
    }
  };

  const handleClose = () => {
    setSelectedTemplateId(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: isDark ? "#1e293b" : "#ffffff",
          backgroundImage: "none",
          boxShadow: isDark
            ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
            : "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
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
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 4,
          py: 3,
          borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          bgcolor: isDark ? "#1e293b" : "#ffffff",
        }}
      >
        <DialogTitle
          sx={{
            p: 0,
            fontWeight: 700,
            fontSize: "1.25rem", // Reduced from 1.5rem
            color: "text.primary",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <LibraryAddIcon sx={{ color: "#137fec", fontSize: 24 }} />
          Apply New Template
        </DialogTitle>
        <IconButton
          onClick={handleClose}
          sx={{
            color: "text.secondary",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
              color: "text.primary",
            },
          }}
        >
          <CloseIcon size={24} />
        </IconButton>
      </Box>

      <DialogContent
        sx={{ p: 4, display: "flex", flexDirection: "column", gap: 3 }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Select an onboarding template to seamlessly append its associated
          tasks to the current checklist.
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {MOCK_TEMPLATES.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            return (
              <Paper
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  cursor: "pointer",
                  border: `2px solid ${
                    isSelected ? "#137fec" : isDark ? "#334155" : "#e2e8f0"
                  }`,
                  bgcolor: isSelected
                    ? isDark
                      ? alpha("#137fec", 0.1)
                      : "#eff6ff"
                    : isDark
                      ? "#0f172a"
                      : "#ffffff",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                  transition: "all 0.2s ease",
                  "&:hover": {
                    borderColor: isSelected
                      ? "#137fec"
                      : isDark
                        ? "#64748b"
                        : "#cbd5e1",
                    bgcolor: isSelected
                      ? isDark
                        ? alpha("#137fec", 0.15)
                        : "#e0f2fe"
                      : isDark
                        ? "rgba(255,255,255,0.02)"
                        : "#f8fafc",
                  },
                }}
              >
                <Radio
                  checked={isSelected}
                  onChange={() => setSelectedTemplateId(template.id)}
                  value={template.id}
                  name="template-radio-buttons"
                  sx={{
                    p: 0,
                    mt: 0.5,
                    color: isDark ? "#475569" : "#cbd5e1",
                    "&.Mui-checked": { color: "#137fec" },
                  }}
                />
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}
                  >
                    {template.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary", lineHeight: 1.5 }}
                  >
                    {template.description}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#137fec",
                      fontWeight: 600,
                      mt: 1,
                      display: "block",
                    }}
                  >
                    Includes{" "}
                    {template.tasks.reduce(
                      (acc, cat) => acc + cat.tasks.length,
                      0,
                    )}{" "}
                    tasks
                  </Typography>
                </Box>
              </Paper>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          p: 3,
          px: 4,
          borderTop: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          bgcolor: isDark ? alpha("#1e293b", 0.5) : "#f9fafb",
          gap: 2,
        }}
      >
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.875rem", // Reduced from 1rem
            py: 1,
            px: 3,
            color: "text.secondary",
            borderColor: isDark ? theme.palette.divider : "#cbd5e1",
            bgcolor: isDark ? "#1e293b" : "#ffffff",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
              borderColor: theme.palette.divider,
              color: "text.primary",
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={!selectedTemplateId}
          sx={{
            bgcolor: "#137fec",
            textTransform: "none",
            fontWeight: 700,
            fontSize: "0.875rem", // Reduced from 1rem
            py: 1,
            px: 3,
            boxShadow: "0 4px 6px -1px rgba(19, 127, 236, 0.2)",
            "&:hover": {
              bgcolor: "#1d4ed8",
              boxShadow: "0 6px 8px -1px rgba(19, 127, 236, 0.3)",
            },
          }}
        >
          Apply Template
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ApplyTemplateModal;
