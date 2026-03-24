import React from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  useTheme,
  Chip,
  Stack,
  alpha,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import { TrendingUp, ChevronRight } from "lucide-react";

/**
 * A simple centered loading spinner for dashboard views.
 * * @returns {JSX.Element} The loading spinner component.
 */
export const DashboardSpinner = () => (
  <Box
    sx={{
      minHeight: "60vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <CircularProgress size={48} thickness={4} />
  </Box>
);

/**
 * Base Card component wrapper providing uniform styling and hover effects.
 * Used across multiple dashboard widgets to maintain a consistent UI.
 *
 * @param {Object} props - Component props.
 * @param {React.ReactNode} props.children - Content to be rendered inside the card.
 * @param {Object} [props.sx] - Additional MUI system styles.
 * @param {Function} [props.onClick] - Optional click handler.
 * @returns {JSX.Element} The styled card component.
 */
export const DashboardCard = ({ children, sx, onClick }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        height: "100%",
        borderRadius: 3,
        bgcolor: isDark ? "#1a2632" : "#ffffff",
        border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
        boxShadow: isDark ? "none" : "0px 1px 3px rgba(0, 0, 0, 0.05)",
        transition: "all 0.2s ease-in-out",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick
          ? {
              boxShadow: "0px 4px 6px -1px rgba(0, 0, 0, 0.1)",
              borderColor: theme.palette.primary.main,
              transform: "translateY(-2px)",
            }
          : {},
        ...sx,
      }}
    >
      {children}
    </Card>
  );
};

/**
 * Key Performance Indicator (KPI) Card.
 * Displays a single stat metric with an icon, value, and optional trend/tooltip.
 *
 * @param {Object} props - Component props.
 * @param {string} props.title - The title of the KPI.
 * @param {string|number} props.value - The main metric value to display.
 * @param {React.ElementType} props.icon - The icon component reference (renamed to IconComponent).
 * @param {string} [props.trend] - Optional trend text (e.g., "+5%").
 * @param {string} [props.color="primary"] - The theme color palette to use.
 * @param {string} [props.tooltip] - Optional tooltip text explaining the metric.
 * @returns {JSX.Element} The KPI card component.
 */
export const KPICard = ({
  title,
  value,
  icon: IconComponent,
  trend,
  color = "primary",
  tooltip,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const cardContent = (
    <DashboardCard>
      <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          {/* Icon Wrapper */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: alpha(theme.palette[color].main, 0.1),
              color: theme.palette[color].main,
            }}
          >
            {/* Render the dynamically passed icon component securely */}
            {IconComponent && <IconComponent size={24} />}
          </Box>
          {/* Optional Trend Chip */}
          {trend && (
            <Chip
              icon={<TrendingUp size={14} />}
              label={trend}
              size="small"
              sx={{
                bgcolor: isDark ? alpha("#22c55e", 0.2) : "#ecfdf5",
                color: isDark ? "#4ade80" : "#16a34a",
                fontWeight: 600,
                fontSize: "0.75rem",
                height: 24,
                "& .MuiChip-icon": { color: "inherit" },
              }}
            />
          )}
        </Box>
        <Box>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontWeight: 500, mb: 0.5 }}
          >
            {title}
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: "text.primary" }}
          >
            {value}
          </Typography>
        </Box>
      </CardContent>
    </DashboardCard>
  );

  // Wrap in Tooltip if tooltip text is provided, otherwise return raw card
  return tooltip ? (
    <Tooltip title={tooltip} arrow placement="top">
      {cardContent}
    </Tooltip>
  ) : (
    cardContent
  );
};

/**
 * Quick Action Item.
 * A clickable card for routing users to frequently used actions.
 *
 * @param {Object} props - Component props.
 * @param {string} props.title - The primary action title.
 * @param {string} props.subtext - Subtitle describing the action.
 * @param {React.ElementType} props.icon - The icon component reference (renamed to IconComponent).
 * @param {Function} props.onClick - Handler triggered on click.
 * @returns {JSX.Element} The Quick Action card component.
 */
export const QuickActionItem = ({
  title,
  subtext,
  icon: IconComponent,
  onClick,
}) => {
  const theme = useTheme();

  return (
    <DashboardCard onClick={onClick}>
      <Box
        sx={{
          p: 2.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Render the dynamically passed icon component securely */}
            {IconComponent && <IconComponent size={24} />}
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {subtext}
            </Typography>
          </Box>
        </Box>
        <ChevronRight size={20} color={theme.palette.text.disabled} />
      </Box>
    </DashboardCard>
  );
};

/**
 * Header Section.
 * Reusable header block for the top of each view, supporting optional actions.
 *
 * @param {Object} props - Component props.
 * @param {string} props.title - The main page title.
 * @param {string} props.subtitle - Contextual subtitle.
 * @param {React.ReactNode} [props.actions] - Optional action buttons (rendered on the right).
 * @returns {JSX.Element} The formatted header section.
 */
export const HeaderSection = ({ title, subtitle, actions }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: { xs: "column", md: "row" },
      justifyContent: "space-between",
      alignItems: { md: "center" },
      gap: 2,
      mb: 4,
    }}
  >
    <Box>
      <Typography
        variant="h3"
        sx={{
          fontWeight: 800,
          fontSize: { xs: "2rem", sm: "2.5rem" },
          color: "primary.main",
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="h6"
        sx={{ fontWeight: 400, color: "text.secondary", fontSize: "1.125rem" }}
      >
        {subtitle}
      </Typography>
    </Box>
    {actions && (
      <Stack direction="row" spacing={2}>
        {actions}
      </Stack>
    )}
  </Box>
);
