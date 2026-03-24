import React, { useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Divider,
  Button,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Stack,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmailIcon from "@mui/icons-material/Email";
import DownloadIcon from "@mui/icons-material/Download";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";

const ViewPayslip = () => {
  const navigate = useNavigate();
  const payslipRef = useRef(null);

  const handleBack = () => {
    navigate("/admin/generated-payslips");
  };

  // ✅ Generate text-based PDF instead of screenshot
  const handleDownloadPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    let y = 15;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Payslip", 105, y, { align: "center" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Company: Stellar HR", 15, y);
    doc.text("Address: 123 Business Avenue, Suite 100, Metropolis", 15, y + 6);
    doc.text("Payslip #: PAY-2024-07-007", 150, y);
    y += 15;

    doc.setFont("helvetica", "bold");
    doc.text("Employee Information", 15, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const employeeInfo = [
      ["Employee Name", "Eleanor Vance"],
      ["Employee ID", "EMP-007"],
      ["Job Title", "Lead Designer"],
      ["Pay Date", "15 July 2024"],
      ["Pay Period Start", "01 July 2024"],
      ["Pay Period End", "15 July 2024"],
    ];
    employeeInfo.forEach(([label, value]) => {
      doc.text(`${label}: ${value}`, 20, y);
      y += 6;
    });

    y += 8;
    doc.setDrawColor(180);
    doc.line(15, y, 195, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Earnings", 15, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const earnings = [
      ["Basic Pay", "$3,500.00"],
      ["Allowances", "$250.00"],
      ["Gross Earnings", "$3,750.00"],
    ];
    earnings.forEach(([label, value]) => {
      doc.text(label, 20, y);
      doc.text(value, 180, y, { align: "right" });
      y += 6;
    });

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Deductions", 15, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const deductions = [
      ["Tax", "$450.00"],
      ["Pension", "$175.00"],
      ["Others", "$25.00"],
      ["Total Deductions", "$650.00"],
    ];
    deductions.forEach(([label, value]) => {
      doc.text(label, 20, y);
      doc.text(value, 180, y, { align: "right" });
      y += 6;
    });

    y += 8;
    doc.setDrawColor(180);
    doc.line(15, y, 195, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Summary", 15, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text("Gross Earnings:", 20, y);
    doc.text("$3,750.00", 180, y, { align: "right" });
    y += 6;
    doc.text("Total Deductions:", 20, y);
    doc.text("-$650.00", 180, y, { align: "right" });
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    y += 4;
    doc.text("Net Pay:", 20, y);
    doc.text("$3,100.00", 180, y, { align: "right" });

    // ✅ Save text-based PDF
    doc.save("payslip.pdf");
  };

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 4, md: 6 },
        bgcolor: "background.default",
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        mb={4}
      >
        <Typography variant="h4" fontWeight={900}>
          Payslip
        </Typography>
        <Button
          variant="contained"
          color="inherit"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{
            bgcolor: "action.hover",
            color: "text.primary",
            "&:hover": { bgcolor: "action.selected" },
            textTransform: "none",
            fontWeight: 700,
          }}
        >
          Back to Payslips
        </Button>
      </Box>

      <Paper
        ref={payslipRef}
        elevation={3}
        sx={{ p: { xs: 3, sm: 5 }, borderRadius: 3 }}
      >
        {/* Company Info */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          flexDirection={{ xs: "column", sm: "row" }}
          pb={3}
          mb={3}
          borderBottom="1px solid"
          borderColor="divider"
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 40,
                height: 40,
                bgcolor: "primary.main",
                mask: "url(/icons/company.svg) center / contain no-repeat",
              }}
            />
            <Box>
              <Typography variant="h6" fontWeight="bold">
                Stellar HR
              </Typography>
              <Typography variant="body2" color="text.secondary">
                123 Business Avenue, Suite 100, Metropolis
              </Typography>
            </Box>
          </Box>
          <Box textAlign={{ xs: "left", sm: "right" }} mt={{ xs: 2, sm: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Payslip #
            </Typography>
            <Typography variant="subtitle1" fontWeight={600}>
              PAY-2024-07-007
            </Typography>
          </Box>
        </Box>
        {/* Employee Info */}
        <Grid
          container
          spacing={3}
          pb={3}
          mb={3}
          borderBottom="1px solid"
          borderColor="divider"
        >
          {[
            ["Employee Name", "Eleanor Vance"],
            ["Employee ID", "EMP-007"],
            ["Job Title", "Lead Designer"],
            ["Pay Date", "15 July 2024"],
            ["Pay Period Start", "01 July 2024"],
            ["Pay Period End", "15 July 2024"],
          ].map(([label, value]) => (
            <Grid item xs={12} sm={6} size={2} md={4} key={label}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body1" fontWeight={500}>
                {value}
              </Typography>
            </Grid>
          ))}
        </Grid>
        {/* Earnings & Deductions */}
        <Grid container spacing={5}>
          {/* Earnings */}
          <Grid item xs={12} md={6} size={6}>
            <Typography variant="h6" fontWeight={700} mb={2}>
              Earnings
            </Typography>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell>Basic Pay</TableCell>
                  <TableCell align="right">$3,500.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Allowances</TableCell>
                  <TableCell align="right">$250.00</TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Gross Earnings
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: "bold" }}>
                    $3,750.00
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>
          {/* Deductions */}
          <Grid item xs={12} md={6} size={6}>
            <Typography variant="h6" fontWeight={700} mb={2}>
              Deductions
            </Typography>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell>Tax</TableCell>
                  <TableCell align="right">$450.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Pension</TableCell>
                  <TableCell align="right">$175.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Others</TableCell>
                  <TableCell align="right">$25.00</TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Total Deductions
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: "bold" }}>
                    $650.00
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>
        </Grid>
        {/* Net Summary */}
        <Paper
          variant="outlined"
          sx={{ mt: 5, p: 3, borderRadius: 2, bgcolor: "action.hover" }}
        >
          <Stack spacing={1.5}>
            <Box display="flex" justifyContent="space-between">
              <Typography>Gross Earnings</Typography>
              <Typography fontWeight={500}>$3,750.00</Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Typography>Total Deductions</Typography>
              <Typography fontWeight={500} color="error.main">
                -$650.00
              </Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant="h6" fontWeight={700}>
                Net Pay
              </Typography>
              <Typography variant="h5" fontWeight={900} color="success.main">
                $3,100.00
              </Typography>
            </Box>
          </Stack>
        </Paper>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="flex-end"
          spacing={2}
          mt={5}
        >
          <Button
            variant="outlined"
            startIcon={<EmailIcon />}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Email Payslip
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            sx={{ textTransform: "none", fontWeight: 700 }}
            onClick={handleDownloadPDF}
          >
            Download PDF
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};

export default ViewPayslip;
