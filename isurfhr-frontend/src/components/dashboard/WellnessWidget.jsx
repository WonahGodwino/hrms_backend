import React, { useMemo } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { Coffee } from "lucide-react";

/**
 * Array of wellness tips for the WellnessWidget.
 * Defined outside the component to keep the reference stable and prevent recreation on re-renders.
 */
const WELLNESS_TIPS = [
  "Take a 5-minute break to stretch and hydrate! 💧",
  "Remember to rest your eyes every 20 minutes. 👀",
  "A short walk can boost your productivity by 30%. 🚶",
  "Stay hydrated! Your brain needs water to focus. 🥤",
];

/**
 * A motivational widget randomly selecting a tip to display.
 * Restored to match the sleek blue, HTML-converted design from the Admin View.
 * * @returns {JSX.Element} The rendered WellnessWidget component.
 */
const WellnessWidget = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Randomly selects one tip from the WELLNESS_TIPS constant upon mounting
  const randomTip = useMemo(
    () => WELLNESS_TIPS[Math.floor(Math.random() * WELLNESS_TIPS.length)],
    [],
  );

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: isDark ? "rgba(30, 58, 138, 0.2)" : "#eff6ff",
        border: `1px solid ${isDark ? "rgba(30, 58, 138, 0.5)" : "#bfdbfe"}`,
        borderRadius: 3,
        p: 3,
        display: "flex",
        alignItems: "center",
        gap: 2.5,
      }}
    >
      {/* Icon Container */}
      <Box
        sx={{
          flexShrink: 0,
          width: 48,
          height: 48,
          borderRadius: "50%",
          bgcolor: isDark ? "rgba(59, 130, 246, 0.2)" : "#dbeafe",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#3b82f6",
        }}
      >
        <Coffee size={24} />
      </Box>

      {/* Text Content */}
      <Box>
        <Typography
          variant="subtitle2"
          sx={{
            color: "#3b82f6",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 700,
            fontSize: "0.75rem",
            mb: 0.5,
          }}
        >
          Wellness Tip
        </Typography>
        <Typography
          variant="h6"
          sx={{
            color: isDark ? "#e5e7eb" : "#1f2937",
            fontWeight: 600,
            fontSize: { xs: "1rem", md: "1.125rem" },
          }}
        >
          {randomTip}
        </Typography>
      </Box>
    </Box>
  );
};

export default WellnessWidget;
