import { Outlet } from "react-router-dom";
import { Box, useTheme } from "@mui/material";
import { tokens } from "../theme";
import BreadcrumbsNav from "@/components/BreadcrumbsNav";
import Topbar from "@/pages/global/Topbar"; // Import Topbar

export default function MainLayout() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  return (
    <Box
      display="flex"
      height="100%" // CRITICAL FIX: Use 100% instead of 100vh to respect PrivateRoute's mobile padding
      width="100%"
      className="app"
      sx={{
        backgroundColor:
          theme.palette.mode === "dark"
            ? colors.background.dark
            : colors.primary[100],
        color: colors.gray[100],
        transition: "all 0.3s ease-in-out",
        overflow: "hidden", // FIX: Prevents the entire viewport from overflowing
        minWidth: 0, // FIX: Prevents container blowout
      }}
    >
      {/* Sidebar - Assuming it exists in the layout structure, 
          added here to show relationship with Topbar positioning.
          If Sidebar is handled by a parent wrapper, remove this line. */}

      {/* Main Content Area */}
      <Box
        flexGrow={1}
        display="flex"
        flexDirection="column"
        height="100%"
        sx={{ minWidth: 0 }} // CRITICAL FIX: Forces this column to not exceed the screen width
      >
        {/* Topbar - Sits at the top of the content area, next to Sidebar */}
        <Topbar />

        {/* Scrollable Container */}
        <Box
          flexGrow={1}
          overflow="auto"
          sx={{
            height: "100%",
            minHeight: 0, // FIX: Prevents vertical blowout
          }}
        >
          {/* Global Breadcrumbs Navigation */}
          <BreadcrumbsNav />

          {/* Page Content */}
          <Box p={0} sx={{ minWidth: 0 }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
