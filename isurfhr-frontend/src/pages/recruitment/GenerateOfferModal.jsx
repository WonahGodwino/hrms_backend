import React, { useState } from "react";
import {
  Dialog,
  Slide,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Paper,
  InputAdornment,
  Stack,
  useTheme,
  alpha,
  Divider,
} from "@mui/material";

// Icons
import CloseIcon from "@mui/icons-material/Close";
import BusinessIcon from "@mui/icons-material/Business";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import LinkIcon from "@mui/icons-material/Link";
import VisibilityIcon from "@mui/icons-material/Visibility";
import SaveIcon from "@mui/icons-material/Save";
import PreviewIcon from "@mui/icons-material/Preview";
import VerifiedIcon from "@mui/icons-material/Verified";
import SendIcon from "@mui/icons-material/Send";

// Transition for the full-screen modal
const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

/**
 * HighlightVar Component
 * Creates the yellow highlighted variables in the live preview document.
 */
const HighlightVar = ({ children, isDark }) => (
  <Box
    component="span"
    sx={{
      px: 1,
      py: 0.25,
      mx: 0.5,
      borderRadius: "9999px", // full rounded
      bgcolor: isDark ? "rgba(250, 204, 21, 0.15)" : "#fef08a", // yellow-100 equivalent
      color: isDark ? "#fde047" : "#854d0e", // yellow-800 equivalent
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      transition: "all 0.2s ease",
    }}
  >
    {children || "—"}
  </Box>
);

/**
 * GenerateOfferModal Component
 * Split-pane interface allowing HR/Admins to configure an offer on the left
 * and view a live-updating A4 document preview on the right.
 */
const GenerateOfferModal = ({
  open,
  onClose,
  onSubmit,
  candidateName = "Alex Thompson",
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Form State
  const [offerData, setOfferData] = useState({
    jobTitle: "Senior Product Designer",
    department: "Product & Design",
    manager: "Sarah Jenkins",
    salary: "145,000",
    startDate: "2024-11-01",
  });

  const handleChange = (field) => (event) => {
    setOfferData({ ...offerData, [field]: event.target.value });
  };

  // Trigger submission and pass data back to the parent to move the card
  const handleSendOffer = () => {
    console.log("Sending Offer to:", candidateName, offerData);
    if (onSubmit) {
      onSubmit(offerData);
    } else {
      onClose();
    }
  };

  // Format date helper for preview
  const formattedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedStartDate = offerData.startDate
    ? new Date(offerData.startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      TransitionComponent={Transition}
      PaperProps={{
        sx: {
          bgcolor: isDark ? "#101922" : "#f6f7f8",
          overflow: "hidden", // Prevent outer scroll, inner panes handle scrolling
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          height: "100vh",
          width: "100%",
          position: "relative",
        }}
      >
        {/* ========================================================= */}
        {/* LEFT COLUMN: CONFIGURATION PANEL */}
        {/* ========================================================= */}
        <Box
          sx={{
            width: { xs: "100%", lg: "33.333%" },
            minWidth: { lg: "450px" },
            borderRight: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
            bgcolor: isDark ? "#0f172a" : "#ffffff",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            zIndex: 10,
          }}
        >
          <Box sx={{ p: 4, overflowY: "auto", flex: 1, pb: "120px" }}>
            {/* Header & Close Action */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 4,
              }}
            >
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 900,
                    color: "text.primary",
                    letterSpacing: "-0.025em",
                  }}
                >
                  Generate Job Offer
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Configure the offer details for the selected candidate.
                </Typography>
              </Box>
              <IconButton
                onClick={onClose}
                sx={{
                  color: "text.secondary",
                  bgcolor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.04)",
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>

            <Stack spacing={4}>
              {/* Role Details Section */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: "primary.main",
                    letterSpacing: "0.05em",
                    mb: 2,
                    display: "block",
                  }}
                >
                  Role Details
                </Typography>
                <Stack spacing={2.5}>
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, color: "text.primary", mb: 1 }}
                    >
                      Job Title
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={offerData.jobTitle}
                      onChange={handleChange("jobTitle")}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, color: "text.primary", mb: 1 }}
                    >
                      Department
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={offerData.department}
                      onChange={handleChange("department")}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, color: "text.primary", mb: 1 }}
                    >
                      Reporting Manager
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={offerData.manager}
                      onChange={handleChange("manager")}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Box>
                </Stack>
              </Box>

              <Divider sx={{ borderColor: isDark ? "#1e293b" : "#f1f5f9" }} />

              {/* Compensation & Timeline Section */}
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    color: "primary.main",
                    letterSpacing: "0.05em",
                    mb: 2,
                    display: "block",
                  }}
                >
                  Compensation & Timeline
                </Typography>
                <Stack spacing={2.5}>
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, color: "text.primary", mb: 1 }}
                    >
                      Proposed Salary (Annual)
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={offerData.salary}
                      onChange={handleChange("salary")}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">$</InputAdornment>
                        ),
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, color: "text.primary", mb: 1 }}
                    >
                      Expected Start Date
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      value={offerData.startDate}
                      onChange={handleChange("startDate")}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Box>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: LIVE PREVIEW PANEL */}
        {/* ========================================================= */}
        <Box
          sx={{
            flex: 1,
            display: { xs: "none", lg: "block" }, // Hide on mobile for better UX, or handle responsive scaling
            bgcolor: isDark ? "#101922" : "#f6f7f8",
            overflowY: "auto",
            position: "relative",
            p: 4,
            pb: "140px", // Padding to account for bottom fixed bar
          }}
        >
          <Box
            sx={{
              maxWidth: "800px",
              mx: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {/* Live Preview Toolbar */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <VisibilityIcon sx={{ color: "primary.main" }} />
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, color: "text.primary" }}
                >
                  Live Preview
                </Typography>
              </Box>

              {/* Mock WYSIWYG Toolbar */}
              <Paper
                elevation={0}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  p: 0.5,
                  borderRadius: 2,
                  border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                  bgcolor: isDark ? "#1e293b" : "#ffffff",
                }}
              >
                <IconButton
                  size="small"
                  sx={{ color: "text.secondary", borderRadius: 1 }}
                >
                  <FormatBoldIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  sx={{ color: "text.secondary", borderRadius: 1 }}
                >
                  <FormatItalicIcon fontSize="small" />
                </IconButton>
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{
                    mx: 0.5,
                    height: 20,
                    alignSelf: "center",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                  }}
                />
                <IconButton
                  size="small"
                  sx={{ color: "text.secondary", borderRadius: 1 }}
                >
                  <FormatListBulletedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  sx={{ color: "text.secondary", borderRadius: 1 }}
                >
                  <LinkIcon fontSize="small" />
                </IconButton>
              </Paper>
            </Box>

            {/* A4 Paper Document Preview */}
            <Paper
              elevation={isDark ? 4 : 12} // Heavier shadow for realism
              sx={{
                width: "100%",
                minHeight: "297mm", // A4 Aspect ratio approximation
                bgcolor: isDark ? "#0f172a" : "#ffffff",
                borderRadius: 2,
                border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                p: { xs: 4, md: 8 },
                transition: "all 0.3s ease",
              }}
            >
              <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {/* Document Header */}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      bgcolor: "primary.main",
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                    }}
                  >
                    <BusinessIcon sx={{ fontSize: 36 }} />
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography
                      variant="overline"
                      sx={{
                        fontWeight: 700,
                        color: "text.disabled",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Offer Letter
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", mt: 0.5 }}
                    >
                      Ref: OFF-2024-8842
                    </Typography>
                  </Box>
                </Box>

                {/* Document Body */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Typography sx={{ color: "text.primary" }}>
                    Date: {formattedDate}
                  </Typography>
                  <Typography sx={{ color: "text.primary" }}>
                    Dear{" "}
                    <HighlightVar isDark={isDark}>{candidateName}</HighlightVar>
                    ,
                  </Typography>
                  <Typography sx={{ color: "text.secondary", lineHeight: 1.8 }}>
                    We are thrilled to offer you the position of{" "}
                    <HighlightVar isDark={isDark}>
                      {offerData.jobTitle}
                    </HighlightVar>{" "}
                    at Acme Corp. Your skills and experience in end-to-end
                    product design made you a standout candidate for our{" "}
                    <HighlightVar isDark={isDark}>
                      {offerData.department}
                    </HighlightVar>{" "}
                    team.
                  </Typography>

                  <Box sx={{ py: 2 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 700, color: "text.primary", mb: 2 }}
                    >
                      Key Offer Terms:
                    </Typography>
                    <Box
                      component="ul"
                      sx={{
                        pl: 3,
                        m: 0,
                        color: "text.secondary",
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                      }}
                    >
                      <li>
                        <strong>Annual Compensation:</strong>{" "}
                        <HighlightVar isDark={isDark}>
                          ${offerData.salary}
                        </HighlightVar>{" "}
                        paid in semi-monthly installments.
                      </li>
                      <li>
                        <strong>Start Date:</strong> {formattedStartDate}.
                      </li>
                      <li>
                        <strong>Reporting To:</strong>{" "}
                        {offerData.manager || "—"}.
                      </li>
                      <li>
                        <strong>Location:</strong> Hybrid (Remote/San Francisco
                        HQ).
                      </li>
                    </Box>
                  </Box>

                  <Typography sx={{ color: "text.secondary", lineHeight: 1.8 }}>
                    At Acme Corp, we are committed to building a world-class
                    environment where professionals can do their best work. We
                    believe your contribution will be instrumental in our
                    mission to simplify enterprise software.
                  </Typography>
                  <Typography sx={{ color: "text.secondary", lineHeight: 1.8 }}>
                    This offer is contingent upon successful completion of
                    background verification. Please review the attached full
                    terms and conditions before signing.
                  </Typography>
                </Box>

                {/* Signatures Area */}
                <Box
                  sx={{
                    pt: 6,
                    mt: 8,
                    borderTop: `1px solid ${isDark ? "#1e293b" : "#f1f5f9"}`,
                  }}
                >
                  <Box sx={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
                      <Box
                        sx={{
                          width: 200,
                          height: "1px",
                          bgcolor: isDark ? "#475569" : "#cbd5e1",
                          mb: 1,
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: "text.primary" }}
                      >
                        Hiring Manager Signature
                      </Typography>
                    </Box>
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
                      <Box
                        sx={{
                          width: 200,
                          height: "1px",
                          bgcolor: isDark ? "#475569" : "#cbd5e1",
                          mb: 1,
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: "text.primary" }}
                      >
                        Candidate Signature
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Paper>
          </Box>
        </Box>

        {/* ========================================================= */}
        {/* BOTTOM ACTION BAR (FIXED TO DIALOG BOTTOM) */}
        {/* ========================================================= */}
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: { xs: "auto", md: "96px" },
            bgcolor: isDark ? "#0f172a" : "#ffffff",
            borderTop: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
            px: { xs: 3, md: 4 },
            py: { xs: 3, md: 0 },
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            zIndex: 20,
            boxShadow: isDark
              ? "0 -4px 6px -1px rgba(0,0,0,0.3)"
              : "0 -4px 6px -1px rgba(0,0,0,0.05)",
          }}
        >
          {/* Left Actions */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              width: { xs: "100%", md: "auto" },
            }}
          >
            <Button
              variant="text"
              startIcon={<SaveIcon />}
              sx={{
                flex: { xs: 1, md: "none" },
                color: isDark ? "#cbd5e1" : "#475569",
                fontWeight: 600,
                textTransform: "none",
                px: 3,
                py: 1.5,
                borderRadius: 2,
                "&:hover": { bgcolor: isDark ? "#1e293b" : "#f1f5f9" },
              }}
            >
              Save Draft
            </Button>
            <Button
              variant="text"
              startIcon={<PreviewIcon />}
              sx={{
                flex: { xs: 1, md: "none" },
                color: isDark ? "#cbd5e1" : "#475569",
                fontWeight: 600,
                textTransform: "none",
                px: 3,
                py: 1.5,
                borderRadius: 2,
                "&:hover": { bgcolor: isDark ? "#1e293b" : "#f1f5f9" },
              }}
            >
              Preview
            </Button>
          </Box>

          {/* Right Actions */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              width: { xs: "100%", md: "auto" },
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            <Button
              variant="contained"
              startIcon={<VerifiedIcon />}
              sx={{
                width: { xs: "100%", sm: "auto" },
                bgcolor: "#059669", // emerald-600
                color: "#fff",
                fontWeight: 700,
                textTransform: "none",
                px: 3,
                py: 1.5,
                borderRadius: 2,
                boxShadow: "0 10px 15px -3px rgba(5, 150, 105, 0.2)",
                "&:hover": { bgcolor: "#047857" },
              }}
            >
              Accept & Onboard
            </Button>
            <Button
              variant="contained"
              endIcon={<SendIcon />}
              onClick={handleSendOffer}
              sx={{
                width: { xs: "100%", sm: "auto" },
                bgcolor: "#137fec", // primary
                color: "#fff",
                fontWeight: 700,
                textTransform: "none",
                px: 4,
                py: 1.5,
                borderRadius: 2,
                boxShadow: "0 10px 15px -3px rgba(19, 127, 236, 0.2)",
                "&:hover": { bgcolor: "rgba(19, 127, 236, 0.9)" },
              }}
            >
              Send Offer
            </Button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
};

export default GenerateOfferModal;
