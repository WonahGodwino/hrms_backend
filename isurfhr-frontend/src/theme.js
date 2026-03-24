// src/theme.js
import { createContext, useState, useMemo } from "react";
import { createTheme } from "@mui/material/styles";

// Color design tokens (HSL format) based on the requested palette:
// - Indigo-blue primary: #137fec  -> hsl(210 85% 50%)
// - Soft teal secondary: #20c997 -> hsl(162 73% 46%)
// - Warm coral accent: #ff7a59   -> hsl(12 100% 67%)
// - Neutral warm-gray background (light): #f6f7f8 -> hsl(210 13% 97%)
// - Deep slate (dark background): #0f1724 -> hsl(217 41% 10%)
export const tokens = (mode) => {
  // helper to build hsl strings
  const h = (hue, sat, light) => `hsl(${hue} ${sat}% ${light}%)`;

  // base HSL values
  const PRIMARY_H = 210;
  const PRIMARY_S = 85; // indigo-blue saturation
  const SECONDARY_H = 162;
  const SECONDARY_S = 73; // teal saturation
  const ACCENT_H = 12;
  const ACCENT_S = 100; // coral saturation
  const BG_LIGHT = `hsl(210 13% 97%)`;
  const BG_DARK = `hsl(221, 39%, 11%)`;

  return {
    ...(mode === "dark"
      ? {
          // darker mode: lighter numbers correspond to lighter shades
          gray: {
            100: h(0, 0, 90),
            200: h(0, 0, 75),
            300: h(0, 0, 60),
            400: h(0, 0, 48),
            500: h(0, 0, 36),
            600: h(0, 0, 28),
            700: h(0, 0, 20),
            800: h(0, 0, 12),
            900: h(0, 0, 6),
          },
          primary: {
            // Indigo-blue scale (210 H)
            100: h(PRIMARY_H, PRIMARY_S, 92),
            200: h(PRIMARY_H, PRIMARY_S, 80),
            300: h(PRIMARY_H, PRIMARY_S, 70),
            400: h(PRIMARY_H, PRIMARY_S, 60),
            500: h(PRIMARY_H, PRIMARY_S, 50), // base
            600: h(PRIMARY_H, PRIMARY_S, 40),
            700: h(PRIMARY_H, PRIMARY_S, 30),
            800: h(PRIMARY_H, PRIMARY_S, 20),
            900: h(PRIMARY_H, PRIMARY_S, 10),
          },
          greenAccent: {
            // Teal scale (secondary)
            100: h(SECONDARY_H, SECONDARY_S, 92),
            200: h(SECONDARY_H, SECONDARY_S, 80),
            300: h(SECONDARY_H, SECONDARY_S, 70),
            400: h(SECONDARY_H, SECONDARY_S, 58),
            500: h(SECONDARY_H, SECONDARY_S, 46), // base
            600: h(SECONDARY_H, SECONDARY_S, 38),
            700: h(SECONDARY_H, SECONDARY_S, 30),
            800: h(SECONDARY_H, SECONDARY_S, 22),
            900: h(SECONDARY_H, SECONDARY_S, 14),
          },
          redAccent: {
            // Coral accent scale (warm)
            100: h(ACCENT_H, ACCENT_S, 92),
            200: h(ACCENT_H, ACCENT_S, 82),
            300: h(ACCENT_H, ACCENT_S, 72),
            400: h(ACCENT_H, ACCENT_S, 62),
            500: h(ACCENT_H, ACCENT_S, 67), // base coral (slightly lighter)
            600: h(ACCENT_H, ACCENT_S, 58),
            700: h(ACCENT_H, ACCENT_S, 48),
            800: h(ACCENT_H, ACCENT_S, 38),
            900: h(ACCENT_H, ACCENT_S, 28),
          },
          yellowAccent: {
            // Keep a warm yellow ramp for notifications / highlights
            100: h(48, 95, 94),
            200: h(48, 95, 88),
            300: h(48, 95, 78),
            400: h(48, 95, 68),
            500: h(48, 95, 58),
            600: h(48, 95, 50),
            700: h(48, 95, 42),
            800: h(48, 95, 34),
            900: h(48, 95, 26),
          },
          blueAccent: {
            // supporting blue ramp (useful for subtle UI elements)
            100: h(210, 20, 96),
            200: h(210, 22, 88),
            300: h(210, 24, 78),
            400: h(210, 26, 66),
            500: h(210, 28, 54),
            600: h(210, 28, 44),
            700: h(210, 28, 34),
            800: h(210, 28, 24),
            900: h(210, 28, 14),
          },
          // Background tokens for convenience
          background: {
            light: BG_LIGHT,
            dark: BG_DARK,
          },
        }
      : {
          // Light theme token set (inverts / brightens)
          gray: {
            100: h(0, 0, 6),
            200: h(0, 0, 12),
            300: h(0, 0, 20),
            400: h(0, 0, 28),
            500: h(0, 0, 36),
            600: h(0, 0, 48),
            700: h(0, 0, 60),
            800: h(0, 0, 75),
            900: h(0, 0, 90),
          },
          primary: {
            100: h(PRIMARY_H, PRIMARY_S, 10),
            200: h(PRIMARY_H, PRIMARY_S, 20),
            300: h(PRIMARY_H, PRIMARY_S, 30),
            400: h(PRIMARY_H, PRIMARY_S, 42),
            500: h(PRIMARY_H, PRIMARY_S, 50),
            600: h(PRIMARY_H, PRIMARY_S, 60),
            700: h(PRIMARY_H, PRIMARY_S, 70),
            800: h(PRIMARY_H, PRIMARY_S, 80),
            900: h(PRIMARY_H, PRIMARY_S, 92),
          },
          greenAccent: {
            100: h(SECONDARY_H, SECONDARY_S, 14),
            200: h(SECONDARY_H, SECONDARY_S, 22),
            300: h(SECONDARY_H, SECONDARY_S, 32),
            400: h(SECONDARY_H, SECONDARY_S, 44),
            500: h(SECONDARY_H, SECONDARY_S, 46),
            600: h(SECONDARY_H, SECONDARY_S, 58),
            700: h(SECONDARY_H, SECONDARY_S, 70),
            800: h(SECONDARY_H, SECONDARY_S, 82),
            900: h(SECONDARY_H, SECONDARY_S, 92),
          },
          redAccent: {
            100: h(ACCENT_H, ACCENT_S, 28),
            200: h(ACCENT_H, ACCENT_S, 38),
            300: h(ACCENT_H, ACCENT_S, 48),
            400: h(ACCENT_H, ACCENT_S, 58),
            500: h(ACCENT_H, ACCENT_S, 67),
            600: h(ACCENT_H, ACCENT_S, 58),
            700: h(ACCENT_H, ACCENT_S, 48),
            800: h(ACCENT_H, ACCENT_S, 38),
            900: h(ACCENT_H, ACCENT_S, 28),
          },
          yellowAccent: {
            100: h(48, 95, 26),
            200: h(48, 95, 34),
            300: h(48, 95, 42),
            400: h(48, 95, 50),
            500: h(48, 95, 58),
            600: h(48, 95, 68),
            700: h(48, 95, 78),
            800: h(48, 95, 88),
            900: h(48, 95, 94),
          },
          blueAccent: {
            100: h(210, 28, 14),
            200: h(210, 28, 24),
            300: h(210, 28, 34),
            400: h(210, 28, 44),
            500: h(210, 28, 54),
            600: h(210, 28, 66),
            700: h(210, 28, 76),
            800: h(210, 28, 86),
            900: h(210, 28, 96),
          },
          background: {
            light: BG_LIGHT,
            dark: BG_DARK,
          },
        }),
  };
};

// MUI Theme Settings
export const themeSettings = (mode) => {
  const colors = tokens(mode);

  return {
    palette: {
      mode: mode,
      ...(mode === "dark"
        ? {
            primary: {
              main: "#137fec", // your brand color (indigo-blue)
            },
            secondary: {
              main: colors.greenAccent[500],
            },
            accent: {
              main: colors.redAccent[500],
            },
            neutral: {
              dark: colors.gray[700],
              main: colors.gray[500],
              light: colors.gray[100],
            },
            background: {
              default: colors.background.dark, // main app background
              paper: "#1a1f2b", // softer card background for better layering
            },
            text: {
              primary: "#ffffff",
              secondary: colors.gray[300],
            },
          }
        : {
            primary: {
              main: "#137fec", // same for light mode for consistency
            },
            secondary: {
              main: colors.greenAccent[500],
            },
            accent: {
              main: colors.redAccent[500],
            },
            neutral: {
              dark: colors.gray[700],
              main: colors.gray[500],
              light: colors.gray[100],
            },
            background: {
              default: colors.background.light,
              paper: "#ffffff", // white cards for contrast
            },
            text: {
              primary: colors.gray[900],
              secondary: colors.gray[700],
            },
          }),
    },
    typography: {
      fontFamily: ["Inter", "Helvetica", "Arial", "sans-serif"].join(","),
      fontSize: 12,
      h1: { fontSize: 32 },
      h2: { fontSize: 24 },
      h3: { fontSize: 20 },
      h4: { fontSize: 18 },
      h5: { fontSize: 16 },
      h6: { fontSize: 14 },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: 10,
            fontWeight: 500,
            "&:hover": {
              backgroundColor: "#0f6cd4",
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundColor:
              mode === "dark" ? "#1a1f2b" : "#ffffff", // ensures cards are not pure black
            boxShadow:
              mode === "dark"
                ? "0 2px 10px rgba(0,0,0,0.4)"
                : "0 2px 10px rgba(0,0,0,0.08)",
          },
        },
      },
    },
  };
};


// Context for color mode
export const ColorModeContext = createContext({
  toggleColorMode: () => {},
});

export const useMode = () => {
  const [mode, setMode] = useState("dark"); // default appearance is dark

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () =>
        setMode((prev) => (prev === "light" ? "dark" : "light")),
    }),
    []
  );

  const theme = useMemo(() => createTheme(themeSettings(mode)), [mode]);

  return [theme, colorMode];
};
