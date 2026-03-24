import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  MenuItem,
  Typography,
  IconButton,
  Box,
  useTheme,
  alpha,
  Switch,
  styled,
} from "@mui/material";
import { X } from "lucide-react";
// Import locations-ng
import locationsNg from "locations-ng";

// Custom IOS-style Switch
const IOSSwitch = styled((props) => (
  <Switch focusVisibleClassName=".Mui-focusVisible" disableRipple {...props} />
))(({ theme }) => ({
  width: 56,
  height: 32,
  padding: 0,
  "& .MuiSwitch-switchBase": {
    padding: 0,
    margin: 4,
    transitionDuration: "300ms",
    "&.Mui-checked": {
      transform: "translateX(24px)",
      color: "#fff",
      "& + .MuiSwitch-track": {
        backgroundColor: "#137fec",
        opacity: 1,
        border: 0,
      },
      "&.Mui-disabled + .MuiSwitch-track": {
        opacity: 0.5,
      },
    },
    "&.Mui-focusVisible .MuiSwitch-thumb": {
      color: "#33cf4d",
      border: "6px solid #fff",
    },
    "&.Mui-disabled .MuiSwitch-thumb": {
      color:
        theme.palette.mode === "light"
          ? theme.palette.grey[100]
          : theme.palette.grey[600],
    },
    "&.Mui-disabled + .MuiSwitch-track": {
      opacity: theme.palette.mode === "light" ? 0.7 : 0.3,
    },
  },
  "& .MuiSwitch-thumb": {
    boxSizing: "border-box",
    width: 24,
    height: 24,
    boxShadow:
      "0px 3px 8px rgba(0, 0, 0, 0.15), 0px 3px 1px rgba(0, 0, 0, 0.06)",
  },
  "& .MuiSwitch-track": {
    borderRadius: 32 / 2,
    backgroundColor: theme.palette.mode === "light" ? "#E9E9EA" : "#39393D",
    opacity: 1,
    transition: theme.transitions.create(["background-color"], {
      duration: 500,
    }),
  },
}));

const AddLocationModal = ({ open, onClose, initialData }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isEditMode = Boolean(initialData);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    state: "",
    lga: "",
    city: "",
    isHeadOffice: false,
  });

  // Populate form on open/edit
  useEffect(() => {
    if (open) {
      if (initialData) {
        setFormData({
          name: initialData.name || "",
          address: initialData.address || "",
          state: initialData.state || "", // Expecting full state name e.g., 'Lagos'
          lga: initialData.lga || "",
          city: initialData.city || "",
          isHeadOffice: initialData.type === "Head Office",
        });
      } else {
        // Reset for adding new
        setFormData({
          name: "",
          address: "",
          state: "",
          lga: "",
          city: "",
          isHeadOffice: false,
        });
      }
    }
  }, [open, initialData]);

  // Memoize states list
  const stateList = useMemo(() => {
    try {
      const allStates = locationsNg.state.all();
      return allStates.map((s) => s.name).sort();
    } catch (e) {
      console.error("Error fetching states:", e);
      return [];
    }
  }, []);

  // Memoize LGA list based on selected state
  const lgaList = useMemo(() => {
    if (!formData.state) return [];
    try {
      const lgas = locationsNg.lga.lgas(formData.state);
      return lgas ? lgas.sort() : [];
    } catch (e) {
      console.error("Error fetching LGAs:", e);
      return [];
    }
  }, [formData.state]);

  const handleChange = (field) => (event) => {
    const value =
      field === "isHeadOffice" ? event.target.checked : event.target.value;

    setFormData((prev) => {
      const updates = { ...prev, [field]: value };
      // Reset LGA if state changes
      if (field === "state") {
        updates.lga = "";
      }
      return updates;
    });
  };

  const handleSave = () => {
    // Handle save logic here (API call, etc.)
    console.log("Saving location:", formData);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
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
          px: 3,
          py: 2,
          borderBottom: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          bgcolor: isDark ? "#1e293b" : "#ffffff",
        }}
      >
        <DialogTitle
          sx={{
            p: 0,
            fontWeight: 600,
            fontSize: "1.125rem",
            color: "text.primary",
          }}
        >
          {isEditMode ? "Edit Location" : "Add New Location"}
        </DialogTitle>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: "text.secondary",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
              color: "text.primary",
            },
          }}
        >
          <X size={20} />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3 }}>
        <Grid container spacing={3}>
          {/* Head Office Toggle */}
          <Grid size={{ xs: 12 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Typography
                  variant="subtitle2"
                  fontWeight={500}
                  color="text.primary"
                >
                  Head Office?
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Is this the primary headquarters?
                </Typography>
              </Box>
              <IOSSwitch
                size="small"
                checked={formData.isHeadOffice}
                onChange={handleChange("isHeadOffice")}
              />
            </Box>
          </Grid>

          {/* Location Name */}
          <Grid size={{ xs: 12 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                mb: 1,
                display: "block",
                color: "text.primary",
              }}
            >
              Location Name
            </Typography>
            <TextField
              fullWidth
              value={formData.name}
              onChange={handleChange("name")}
              placeholder="e.g. Lagos HQ"
              variant="outlined"
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor: isDark ? "#0f172a" : "#ffffff",
                  "& fieldset": {
                    borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                  },
                  "&:hover fieldset": {
                    borderColor: isDark ? "#94a3b8" : "#94a3b8",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#137fec",
                    borderWidth: 2,
                  },
                },
              }}
            />
          </Grid>

          {/* Address */}
          <Grid size={{ xs: 12 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                mb: 1,
                display: "block",
                color: "text.primary",
              }}
            >
              Address
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              value={formData.address}
              onChange={handleChange("address")}
              placeholder="Street address"
              variant="outlined"
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor: isDark ? "#0f172a" : "#ffffff",
                  "& fieldset": {
                    borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                  },
                  "&:hover fieldset": {
                    borderColor: isDark ? "#94a3b8" : "#94a3b8",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#137fec",
                    borderWidth: 2,
                  },
                },
              }}
            />
          </Grid>

          {/* State & LGA */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                mb: 1,
                display: "block",
                color: "text.primary",
              }}
            >
              State
            </Typography>
            <TextField
              select
              fullWidth
              value={formData.state}
              onChange={handleChange("state")}
              placeholder="Select State"
              variant="outlined"
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor: isDark ? "#0f172a" : "#ffffff",
                  "& fieldset": {
                    borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                  },
                  "&:hover fieldset": {
                    borderColor: isDark ? "#94a3b8" : "#94a3b8",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#137fec",
                    borderWidth: 2,
                  },
                },
              }}
            >
              <MenuItem value="" disabled>
                Select State
              </MenuItem>
              {stateList.map((state) => (
                <MenuItem key={state} value={state}>
                  {state}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                mb: 1,
                display: "block",
                color: !formData.state ? "text.disabled" : "text.primary",
              }}
            >
              LGA
            </Typography>
            <TextField
              select
              fullWidth
              value={formData.lga}
              onChange={handleChange("lga")}
              disabled={!formData.state}
              placeholder="Select LGA"
              variant="outlined"
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor:
                    isDark && !formData.state
                      ? alpha("#1e293b", 0.5)
                      : isDark
                        ? "#0f172a"
                        : !formData.state
                          ? "#f9fafb"
                          : "#ffffff",
                  "& fieldset": {
                    borderColor: isDark ? theme.palette.divider : "#e2e8f0",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#137fec",
                    borderWidth: 2,
                  },
                },
              }}
            >
              <MenuItem value="" disabled>
                Select LGA
              </MenuItem>
              {lgaList.map((lga) => (
                <MenuItem key={lga} value={lga}>
                  {lga}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* City / Town */}
          <Grid size={{ xs: 12 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                mb: 1,
                display: "block",
                color: "text.primary",
              }}
            >
              City / Town
            </Typography>
            <TextField
              fullWidth
              value={formData.city}
              onChange={handleChange("city")}
              placeholder="e.g. Ikeja"
              variant="outlined"
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor: isDark ? "#0f172a" : "#ffffff",
                  "& fieldset": {
                    borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                  },
                  "&:hover fieldset": {
                    borderColor: isDark ? "#94a3b8" : "#94a3b8",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#137fec",
                    borderWidth: 2,
                  },
                },
              }}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions
        sx={{
          p: 3,
          borderTop: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
          bgcolor: isDark ? alpha("#1e293b", 0.5) : "#f9fafb",
          gap: 1.5,
        }}
      >
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            textTransform: "none",
            fontWeight: 600,
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
          onClick={handleSave}
          variant="contained"
          sx={{
            bgcolor: "#137fec",
            textTransform: "none",
            fontWeight: 600,
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            "&:hover": {
              bgcolor: "#1d4ed8",
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            },
          }}
        >
          {isEditMode ? "Save Changes" : "Save Location"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddLocationModal;
