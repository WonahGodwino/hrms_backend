import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  Divider,
  useTheme,
} from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import PayrollSuccessModal from "./PayrollSuccessModal"; // ✅ Renamed to modal version

const ConfirmPayrollModal = ({ open, onClose, onConfirm }) => {
  const theme = useTheme();
  const [showSuccess, setShowSuccess] = useState(false);

  // ✅ Handle payroll confirmation
  const handleRunPayroll = () => {
    if (onConfirm) onConfirm(); // keep existing confirmation logic
    setShowSuccess(true); // show success modal
    onClose(); // close current modal
  };

  return (
    <>
      {/* Confirm Payroll Modal */}
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            position: "relative",
            borderRadius: 3,
            p: 4,
            background:
              theme.palette.mode === "dark"
                ? "rgba(16, 25, 34, 0.7)"
                : "rgba(255, 255, 255, 0.8)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0px 8px 32px rgba(0,0,0,0.5)",
          },
        }}
      >
        <DialogContent
          sx={{
            p: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Icon */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor: "rgba(19, 127, 236, 0.2)",
              color: "#137fec",
              mb: 2,
            }}
          >
            <PaymentsIcon sx={{ fontSize: 40 }} />
          </Box>

          {/* Title & Subtitle */}
          <Typography
            variant="h5"
            fontWeight={700}
            color="white"
            align="center"
          >
            Confirm Payroll
          </Typography>
          <Typography
            variant="body1"
            color="rgba(203,213,225,0.9)"
            align="center"
            mt={1}
          >
            Are you sure you want to process payroll? This action is final for
            this period.
          </Typography>

          {/* Summary List */}
          {/* <Box
            sx={{
              width: "100%",
              mt: 3,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: "rgba(255,255,255,0.05)",
              p: 2,
            }}
          >
            {[
              { label: "Total Employees", value: "152" },
              { label: "Total Gross Pay", value: "$112,450.00" },
              { label: "Total Net Pay", value: "$89,960.00" },
            ].map((item, index) => (
              <React.Fragment key={index}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    py: 1.2,
                  }}
                >
                  <Typography variant="body2" color="rgba(203,213,225,0.8)">
                    {item.label}
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="white">
                    {item.value}
                  </Typography>
                </Box>
                {index < 2 && (
                  <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />
                )}
              </React.Fragment>
            ))}
          </Box> */}

          {/* Buttons */}
          <Box
            sx={{
              mt: 4,
              display: "flex",
              flexDirection: { xs: "column-reverse", sm: "row" },
              gap: 2,
              width: "100%",
            }}
          >
            <Button
              variant="contained"
              onClick={onClose}
              fullWidth
              sx={{
                height: 48,
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "white",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  backgroundColor: "rgba(255,255,255,0.2)",
                },
              }}
            >
              Cancel
            </Button>

            <Button
              variant="contained"
              onClick={handleRunPayroll} // ✅ Trigger success modal
              fullWidth
              sx={{
                height: 48,
                backgroundColor: "#137fec",
                color: "white",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": {
                  backgroundColor: "#0f6cd1",
                },
              }}
            >
              Run Payroll
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* ✅ Success Modal */}
      <PayrollSuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
};

export default ConfirmPayrollModal;
