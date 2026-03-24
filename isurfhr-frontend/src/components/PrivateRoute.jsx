import React, { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/context/AuthContext";
import AppSidebar from "@/pages/global/Sidebar";
import {
  Box,
  useMediaQuery,
  useTheme,
  IconButton,
  Drawer,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { tokens } from "@/theme";

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, initializing } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const isTabletOrBelow = useMediaQuery(theme.breakpoints.down("md"));
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));

  const handleCollapseToggle = useCallback((collapsed) => {
    setTimeout(() => setIsSidebarCollapsed(collapsed), 0);
  }, []);

  useEffect(() => {
    if (isTabletOrBelow) {
      setIsSidebarCollapsed(true);
    } else {
      setIsSidebarCollapsed(false);
      setMobileSidebarOpen(false);
    }
  }, [isTabletOrBelow]);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const mainContentBg =
    theme.palette.mode === "dark"
      ? colors.background.dark
      : colors.background.light;

  const sidebarBg = colors.primary[800];

  return (
    <Box
      display="flex"
      height="100vh"
      width="100vw"
      className="app"
      position="relative"
      sx={{ overflow: "hidden" }}
    >
      {/* Desktop Sidebar - Hides on Tablets to prevent double rendering */}
      {!isTabletOrBelow && (
        <Box
          sx={{
            transition: "width 0.3s ease-in-out",
            height: "100vh",
            background: sidebarBg,
            overflowY: "auto",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            flexShrink: 0,
          }}
        >
          <AppSidebar
            isCollapsed={isSidebarCollapsed}
            onCollapseToggle={handleCollapseToggle}
          />
        </Box>
      )}

      {/* Mobile and Tablet Sidebar Drawer */}
      {isTabletOrBelow && (
        <Drawer
          anchor="left"
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          ModalProps={{ keepMounted: true }}
          slotProps={{
            paper: {
              sx: {
                width: 250, // Preserved your custom width
                background: "transparent", // Preserved your custom transparent background
                overflowY: "auto",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                zIndex: 1600,
              },
            },
          }}
        >
          {/* We pass toggled & onToggle so AppSidebar can close the Drawer natively */}
          <AppSidebar
            isCollapsed={false} // Drawer sidebars should NEVER be collapsed
            toggled={mobileSidebarOpen}
            onToggle={(val) => setMobileSidebarOpen(Boolean(val))}
            onCollapseToggle={() => setMobileSidebarOpen(false)}
          />
        </Drawer>
      )}

      {isTabletOrBelow && !mobileSidebarOpen && (
        <IconButton
          onClick={() => setMobileSidebarOpen(true)}
          sx={{
            position: "fixed",
            top: 20,
            left: 20,
            zIndex: 1400,
            backgroundColor:
              theme.palette.mode === "dark" ? sidebarBg : colors.gray[100],
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            border: `solid 2px ${colors.gray[300]}`,
            "&:hover": {
              backgroundColor:
                theme.palette.mode === "dark" ? sidebarBg : colors.gray[200],
            },
          }}
          aria-label="Toggle sidebar"
        >
          <MenuIcon />
        </IconButton>
      )}

      {/* Main Content */}
      <Box
        flexGrow={1}
        sx={{
          transition: "all 0.3s ease-in-out",
          height: "100vh",
          backgroundColor: mainContentBg,
          overflow: "hidden",
          paddingTop: isTabletOrBelow ? "60px" : 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          p={isPhone ? 1.5 : 0}
          sx={{
            height: "100%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default PrivateRoute;
