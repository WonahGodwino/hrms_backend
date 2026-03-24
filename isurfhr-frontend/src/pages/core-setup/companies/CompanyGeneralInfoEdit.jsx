import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Grid,
  Paper,
  TextField,
  MenuItem,
  Button,
  useTheme,
} from "@mui/material";
import { Camera, CheckCircle } from "lucide-react";

const CompanyGeneralInfoEdit = ({ onSave, onCancel, initialData }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Form State: Initiates with passed initialData or safely falls back to defaults
  const [formData, setFormData] = useState({
    companyName:
      initialData?.name ||
      initialData?.companyName ||
      "Global Tech Nigeria Ltd",
    tradingName:
      initialData?.tradingName ||
      initialData?.name ||
      initialData?.companyName ||
      "Global Tech Systems",
    industry: initialData?.industry || "Technology",
    description:
      initialData?.description ||
      "Leading provider of enterprise software solutions and cloud infrastructure in West Africa. Specialized in fintech integrations.",
    rcNumber: initialData?.rcNumber || "RC-1298440",
    taxId: initialData?.taxId || "2209384755",
    incDate:
      initialData?.date || initialData?.rawDate
        ? new Date(initialData.date || initialData.rawDate)
            .toISOString()
            .split("T")[0]
        : "2021-09-14",
    fiscalYear: initialData?.fiscalYear || "January 01",
    email: initialData?.email || "contact@globaltechnig.com",
    phone: initialData?.phone || "+234 800 123 4567",
    website: initialData?.website || "https://www.globaltechnig.com",
    address:
      initialData?.address ||
      "15A Victoria Island, Ozumba Mbadiwe Ave, Lagos State, Nigeria",
  });

  // Re-sync form state if the initial data dynamically changes after mount
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        companyName:
          initialData.name || initialData.companyName || prev.companyName,
        tradingName:
          initialData.tradingName ||
          initialData.name ||
          initialData.companyName ||
          prev.tradingName,
        industry: initialData.industry || prev.industry,
        description: initialData.description || prev.description,
        rcNumber: initialData.rcNumber || prev.rcNumber,
        taxId: initialData.taxId || prev.taxId,
        incDate:
          initialData.date || initialData.rawDate
            ? new Date(initialData.date || initialData.rawDate)
                .toISOString()
                .split("T")[0]
            : prev.incDate,
        fiscalYear: initialData.fiscalYear || prev.fiscalYear,
        email: initialData.email || prev.email,
        phone: initialData.phone || prev.phone,
        website: initialData.website || prev.website,
        address: initialData.address || prev.address,
      }));
    }
  }, [initialData]);

  const handleChange = (field) => (event) => {
    setFormData({ ...formData, [field]: event.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Grid container spacing={4}>
        {/* Left Column: Identity & Basic Info */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 4,
              height: "100%",
              borderRadius: 3,
              border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
              bgcolor: isDark ? "#1e293b" : "#ffffff",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Logo Upload */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                mb: 4,
              }}
            >
              <Box
                sx={{
                  position: "relative",
                  width: 128,
                  height: 128,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `4px solid ${isDark ? "#334155" : "#f1f5f9"}`,
                  bgcolor: isDark ? "#0f172a" : "#f8fafc",
                  cursor: "pointer",
                  group: true,
                  "&:hover .overlay": { opacity: 1 },
                }}
              >
                <Box
                  component="img"
                  src={
                    initialData?.logo ||
                    "https://lh3.googleusercontent.com/aida-public/AB6AXuDCVOuS06LjyS4EBlIeriuF0_nAK_HmUD236QCoaUUBggsTf4h-2yj4uy921QPjUAdMeyidtrDZ-2rFYwWlJmab1aY7IDc8HXhURizdqaVE6hsZrua8SU1T7_MjdZpA7JqJXlaoeDS39Jkc0YnhKZdoF_vFS2U3e2svI8FrGbKuifvjxRyBgv8d8UWLFueUmv__gR94Z151YrvwbDJTiOD0UC54hpiWds_SiTWdt-e91A2Z5hvMmJJET9ClFBZ_xBmpnh7SuGbCY-Hu"
                  }
                  alt="Company Logo"
                  sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <Box
                  className="overlay"
                  sx={{
                    position: "absolute",
                    inset: 0,
                    bgcolor: "rgba(0,0,0,0.6)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0,
                    transition: "opacity 0.2s",
                  }}
                >
                  <Camera color="#fff" size={24} style={{ marginBottom: 4 }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#fff",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      fontSize: "0.625rem",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Change
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Inputs */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2.5,
                flex: 1,
              }}
            >
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Company Name
                </Typography>
                <TextField
                  fullWidth
                  value={formData.companyName}
                  onChange={handleChange("companyName")}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#ffffff",
                    },
                  }}
                />
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Trading Name
                </Typography>
                <TextField
                  fullWidth
                  value={formData.tradingName}
                  onChange={handleChange("tradingName")}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#ffffff",
                    },
                  }}
                />
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Industry
                </Typography>
                <TextField
                  select
                  fullWidth
                  value={formData.industry}
                  onChange={handleChange("industry")}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#ffffff",
                    },
                  }}
                >
                  <MenuItem value="Technology">Technology</MenuItem>
                  <MenuItem value="Finance">Finance</MenuItem>
                  <MenuItem value="Healthcare">Healthcare</MenuItem>
                  <MenuItem value="Education">Education</MenuItem>
                  <MenuItem value="Manufacturing">Manufacturing</MenuItem>
                </TextField>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 1,
                    display: "block",
                  }}
                >
                  Description
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  value={formData.description}
                  onChange={handleChange("description")}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: isDark ? "#0f172a" : "#ffffff",
                    },
                  }}
                />
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Right Column: Details Forms */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Statutory Info Card */}
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
                bgcolor: isDark ? "#1e293b" : "#ffffff",
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: "text.primary", mb: 3 }}
              >
                Statutory Information
              </Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    RC Number
                  </Typography>
                  <TextField
                    fullWidth
                    value={formData.rcNumber}
                    onChange={handleChange("rcNumber")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    Tax ID (TIN)
                  </Typography>
                  <TextField
                    fullWidth
                    value={formData.taxId}
                    onChange={handleChange("taxId")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    Incorporation Date
                  </Typography>
                  <TextField
                    type="date"
                    fullWidth
                    value={formData.incDate}
                    onChange={handleChange("incDate")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    Fiscal Year Start
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    value={formData.fiscalYear}
                    onChange={handleChange("fiscalYear")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  >
                    <MenuItem value="January 01">January 01</MenuItem>
                    <MenuItem value="April 01">April 01</MenuItem>
                    <MenuItem value="July 01">July 01</MenuItem>
                    <MenuItem value="October 01">October 01</MenuItem>
                  </TextField>
                </Grid>
              </Grid>
            </Paper>

            {/* Contact Details Card */}
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                border: `1px solid ${isDark ? theme.palette.divider : "#e2e8f0"}`,
                bgcolor: isDark ? "#1e293b" : "#ffffff",
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: "text.primary", mb: 3 }}
              >
                Contact Details
              </Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    Official Email
                  </Typography>
                  <TextField
                    type="email"
                    fullWidth
                    value={formData.email}
                    onChange={handleChange("email")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    Phone Number
                  </Typography>
                  <TextField
                    type="tel"
                    fullWidth
                    value={formData.phone}
                    onChange={handleChange("phone")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    Website
                  </Typography>
                  <TextField
                    type="url"
                    fullWidth
                    value={formData.website}
                    onChange={handleChange("website")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      textTransform: "uppercase",
                      mb: 1,
                      display: "block",
                    }}
                  >
                    Head Office Address
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    value={formData.address}
                    onChange={handleChange("address")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                      },
                    }}
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Action Buttons */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 2,
                mt: 1,
              }}
            >
              <Button
                variant="outlined"
                onClick={onCancel}
                sx={{
                  px: 4,
                  py: 1.2,
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: 600,
                  borderColor: isDark ? theme.palette.divider : "#cbd5e1",
                  color: "text.secondary",
                  "&:hover": {
                    bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
                    borderColor: theme.palette.divider,
                  },
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={<CheckCircle size={18} />}
                sx={{
                  px: 4,
                  py: 1.2,
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: 600,
                  bgcolor: "#137fec",
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  "&:hover": {
                    bgcolor: "#1d4ed8",
                  },
                }}
              >
                Save Changes
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </form>
  );
};

export default CompanyGeneralInfoEdit;
