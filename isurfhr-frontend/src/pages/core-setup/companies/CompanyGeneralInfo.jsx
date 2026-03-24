import React from "react";
import {
  Box,
  Typography,
  Link,
  Chip,
  Grid,
  Paper,
  IconButton,
  useTheme,
  alpha,
} from "@mui/material";
// Removed EditIcon
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import LocationOnOutlined from "@mui/icons-material/LocationOnOutlined";

const CompanyGeneralInfo = ({ companyData }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  // Safely extract data with fallbacks for UI completion
  const name =
    companyData?.name || companyData?.companyName || "Global Tech Nigeria Ltd";
  const industry = companyData?.industry || "TECHNOLOGY";
  const description =
    companyData?.description ||
    "Leading provider of enterprise software solutions and cloud infrastructure in West Africa. Specialized in fintech integrations and secure payment gateways for large scale financial institutions.";
  const logo =
    companyData?.logo ||
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDCVOuS06LjyS4EBlIeriuF0_nAK_HmUD236QCoaUUBggsTf4h-2yj4uy921QPjUAdMeyidtrDZ-2rFYwWlJmab1aY7IDc8HXhURizdqaVE6hsZrua8SU1T7_MjdZpA7JqJXlaoeDS39Jkc0YnhKZdoF_vFS2U3e2svI8FrGbKuifvjxRyBgv8d8UWLFueUmv__gR94Z151YrvwbDJTiOD0UC54hpiWds_SiTWdt-e91A2Z5hvMmJJET9ClFBZ_xBmpnh7SuGbCY-Hu";

  const rcNumber = companyData?.rcNumber || "RC-1298440";
  const taxId = companyData?.taxId || "Not Provided";

  // Format incorporation date fallback appropriately
  const incDate =
    companyData?.date || companyData?.rawDate
      ? new Date(companyData.date || companyData.rawDate).toLocaleDateString(
          "en-US",
          { year: "numeric", month: "long", day: "numeric" },
        )
      : "September 14, 2021";

  const fiscalYear = companyData?.fiscalYear || "Jan 01 — Dec 31";

  const email = companyData?.email || "contact@globaltechnig.com";
  const phone = companyData?.phone || "+234 800 123 4567";
  const website = companyData?.website || "www.globaltechnig.com";
  const address =
    companyData?.address ||
    "15A Victoria Island, Ozumba Mbadiwe Ave, Lagos State, Nigeria";

  return (
    <Grid container spacing={4}>
      {/* Left Column: Company Identity */}
      <Grid size={{ xs: 12, lg: 4 }}>
        <Paper
          elevation={0}
          sx={{
            p: 4,
            height: "100%",
            borderRadius: 3,
            border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              position: "relative",
              width: 128,
              height: 128,
              borderRadius: "50%",
              overflow: "hidden",
              border: `4px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
              bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
              mb: 3,
              boxShadow: "inset 0 2px 4px 0 rgba(0,0,0,0.06)",
              "&:hover .overlay": { opacity: 1 },
            }}
          >
            <Box
              component="img"
              src={logo}
              alt="Company Logo"
              sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <Box
              className="overlay"
              sx={{
                position: "absolute",
                inset: 0,
                bgcolor: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0,
                transition: "opacity 0.2s",
                cursor: "pointer",
              }}
            >
              <CameraAltIcon sx={{ color: "#fff", fontSize: 32 }} />
            </Box>
          </Box>

          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: "text.primary", lineHeight: 1.2 }}
          >
            {name}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", mt: 0.5, mb: 1.5 }}
          >
            {companyData?.tradingName || name}
          </Typography>

          <Chip
            label={industry.toUpperCase()}
            size="small"
            sx={{
              bgcolor: isDarkMode ? alpha("#3b82f6", 0.2) : "#eff6ff",
              color: isDarkMode ? "#93c5fd" : "#1d4ed8",
              fontWeight: 700,
              fontSize: "0.7rem",
              letterSpacing: "0.05em",
              borderRadius: "9999px",
              border: `1px solid ${isDarkMode ? alpha("#3b82f6", 0.3) : "#bfdbfe"}`,
              mb: 4,
            }}
          />

          <Box
            sx={{
              width: "100%",
              mt: "auto",
              pt: 3,
              borderTop: `1px solid ${isDarkMode ? "#334155" : "#f1f5f9"}`,
              textAlign: "left",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "text.primary",
                display: "block",
                mb: 1,
              }}
            >
              About Company
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", lineHeight: 1.6 }}
            >
              {description}
            </Typography>
          </Box>
        </Paper>
      </Grid>

      {/* Right Column: Details */}
      <Grid size={{ xs: 12, lg: 8 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Statutory Info Card */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: "text.primary" }}
              >
                Statutory Information
              </Typography>
              {/* Removed Edit Button */}
            </Box>

            <Grid container spacing={4}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 0.5,
                  }}
                >
                  RC Number
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, color: "text.primary" }}
                >
                  {rcNumber}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 0.5,
                  }}
                >
                  Tax ID (TIN)
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 500, color: "text.primary" }}
                  >
                    {taxId}
                  </Typography>
                  <IconButton
                    size="small"
                    sx={{ p: 0.5, color: "text.secondary" }}
                  >
                    <VisibilityIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 0.5,
                  }}
                >
                  Date of Incorporation
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, color: "text.primary" }}
                >
                  {incDate}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontWeight: 600,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    mb: 0.5,
                  }}
                >
                  Fiscal Year
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, color: "text.primary" }}
                >
                  {fiscalYear}
                </Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Contact Details Card */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
              bgcolor: isDarkMode ? "#1e293b" : "#ffffff",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: "text.primary" }}
              >
                Contact Details
              </Typography>
              {/* Removed Edit Button */}
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Email */}
              <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f8fafc",
                    border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "text.secondary",
                  }}
                >
                  <EmailOutlinedIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      mb: 0.5,
                    }}
                  >
                    Email Address
                  </Typography>
                  <Link
                    href={`mailto:${email}`}
                    underline="hover"
                    sx={{
                      color: "text.primary",
                      fontWeight: 500,
                      "&:hover": { color: "#137fec" },
                    }}
                  >
                    {email}
                  </Link>
                </Box>
              </Box>

              {/* Phone */}
              <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f8fafc",
                    border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "text.secondary",
                  }}
                >
                  <PhoneOutlinedIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      mb: 0.5,
                    }}
                  >
                    Phone Number
                  </Typography>
                  <Link
                    href={`tel:${phone}`}
                    underline="hover"
                    sx={{
                      color: "text.primary",
                      fontWeight: 500,
                      "&:hover": { color: "#137fec" },
                    }}
                  >
                    {phone}
                  </Link>
                </Box>
              </Box>

              {/* Website */}
              <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f8fafc",
                    border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "text.secondary",
                  }}
                >
                  <LanguageIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      mb: 0.5,
                    }}
                  >
                    Website
                  </Typography>
                  <Link
                    href={`https://${website.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{
                      color: "text.primary",
                      fontWeight: 500,
                      "&:hover": { color: "#137fec" },
                    }}
                  >
                    {website}
                  </Link>
                </Box>
              </Box>

              {/* Address */}
              <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    bgcolor: isDarkMode ? "rgba(255,255,255,0.05)" : "#f8fafc",
                    border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "text.secondary",
                  }}
                >
                  <LocationOnOutlined fontSize="small" />
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      mb: 0.5,
                    }}
                  >
                    Head Office Address
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: "text.primary",
                      lineHeight: 1.4,
                    }}
                  >
                    {address}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        </Box>
      </Grid>
    </Grid>
  );
};

export default CompanyGeneralInfo;
