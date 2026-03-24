import React from "react";
import {
  Box,
  Button,
  Typography,
  Grid,
  Dialog,
  DialogContent,
  useTheme,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useNavigate } from "react-router-dom";

const PayrollSuccessModal = ({ open, onClose }) => {
  const theme = useTheme();
  const navigate = useNavigate();

  const handleBackToDashboard = () => {
    onClose(); // close modal first
    navigate("/admin/payroll-dashboard"); // go to Payroll Dashboard
  };

  const handleViewPayslips = () => {
    onClose(); // close modal first
    navigate("/admin/generated-payslips"); // navigate to GeneratedPayslips page
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          background:
            theme.palette.mode === "dark"
              ? "rgba(16, 25, 34, 0.7)"
              : "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0px 8px 32px rgba(0,0,0,0.5)",
          p: { xs: 3, sm: 5 },
        },
      }}
    >
      <DialogContent
        sx={{
          p: 0,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* ✅ Success Icon */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            bgcolor: theme.palette.primary.main + "20",
            borderRadius: "50%",
            width: 96,
            height: 96,
            mb: 4,
          }}
        >
          <CheckCircleIcon
            sx={{ fontSize: 60, color: theme.palette.primary.main }}
          />
        </Box>

        {/* ✅ Title */}
        <Typography variant="h5" fontWeight="bold" gutterBottom color="white">
          Payroll Successfully Processed!
        </Typography>
        <Typography variant="body1" color="rgba(203,213,225,0.9)">
          Payroll for November 2023 has been completed.
        </Typography>

        {/* ✅ Stats */}
        <Box
          sx={{
            mt: 5,
            p: 3,
            borderRadius: 3,
            bgcolor:
              theme.palette.mode === "dark"
                ? "rgba(66, 66, 66, 0.3)"
                : "rgba(240, 245, 255, 0.9)",
            border: `1px solid ${theme.palette.divider}`,
            width: "100%",
          }}
        >
          <Grid container spacing={4}>
            <Grid item xs={12} sm={4} size={4}>
              <Box textAlign="left">
                <Typography variant="body2" color="text.secondary">
                  Employees Paid
                </Typography>
                <Typography variant="h6" fontWeight={700} color="white">
                  42
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} sm={4} size={4}>
              <Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  textAlign={"center"}
                >
                  Amount Processed
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  color="white"
                  textAlign={"center"}
                >
                  ₦12,540,000
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} sm={4} size={4}>
              <Box textAlign="left">
                <Typography
                  variant="body2"
                  color="text.secondary"
                  textAlign={"right"}
                >
                  Payment Date
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  color="white"
                  textAlign={"right"}
                >
                  28 Nov, 2023
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* ✅ Action Buttons */}
        <Box
          sx={{
            mt: 5,
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 2,
            justifyContent: "center",
            width: "100%",
          }}
        >
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={handleViewPayslips}
            sx={{ borderRadius: 2, py: 1.5 }}
          >
            View Payslips
          </Button>

          <Button
            variant="outlined"
            fullWidth
            onClick={handleBackToDashboard}
            sx={{
              borderRadius: 2,
              py: 1.5,
              color: "white",
              borderColor: "rgba(255,255,255,0.3)",
              "&:hover": { borderColor: "white" },
            }}
          >
            Back to Dashboard
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default PayrollSuccessModal;
