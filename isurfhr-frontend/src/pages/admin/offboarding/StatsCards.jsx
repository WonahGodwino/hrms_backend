import React from "react";
import { Box, Card, CardContent, Typography, Grid } from "@mui/material";
import {
  TrendingUp, TrendingDown,
  ExitToApp as ExitIcon,
  Assignment as TaskIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";

export default function StatsCards({ summary = {} }) {
  const {
    active = 0,
    pendingTasks = 0,
    completed = 0,
    overdue = 0
  } = summary;
  const cards = [
    { label: "Active Offboardings", value: active, change: `${active} ongoing`, trend: "up", color: "#1180DA", bg: "#EBF5FF", icon: <ExitIcon /> },
    { label: "Pending Tasks", value: pendingTasks, change: `${pendingTasks} remaining`, trend: "up", color: "#F59E0B", bg: "#FFFBEB", icon: <TaskIcon /> },
    { label: "Completed", value: completed, change: `${completed} total`, trend: "up", color: "#10B981", bg: "#ECFDF5", icon: <CheckIcon /> },
    { label: "Overdue Tasks", value: overdue, change: overdue > 0 ? "Needs attention" : "All on track", trend: overdue > 0 ? "down" : "up", color: "#EF4444", bg: "#FEF2F2", icon: <WarningIcon /> },
  ];

  return (
    <Grid container spacing={2}>
      {cards.map((c) => (
        <Grid item xs={12} sm={6} md={3} key={c.label}>
          <Card sx={{ borderLeft: `4px solid ${c.color}`, height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500}>{c.label}</Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ my: 0.5 }}>{c.value}</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {c.trend === "up" ? (
                      <TrendingUp sx={{ fontSize: 16, color: c.color === "#EF4444" ? "#EF4444" : "#10B981" }} />
                    ) : (
                      <TrendingDown sx={{ fontSize: 16, color: "#EF4444" }} />
                    )}
                    <Typography variant="caption" color="text.secondary">{c.change}</Typography>
                  </Box>
                </Box>
                <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {React.cloneElement(c.icon, { sx: { color: c.color } })}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
