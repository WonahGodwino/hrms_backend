import React, { useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  Divider,
  Select,
  MenuItem,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import ConfirmPayrollModal from "./ConfirmPayrollModal";

const PayrollPreview = () => {
  const [openModal, setOpenModal] = useState(false);
  const [month, setMonth] = useState("August 2024");

  // rows now include a precomputed `net` field (gross - deductions)
  const rows = [
    {
      id: 1,
      name: "Olivia Rhye",
      dept: "Engineering",
      gross: 8226.84,
      deductions: 2056.71,
    },
    {
      id: 2,
      name: "Phoenix Baker",
      dept: "Design",
      gross: 7500,
      deductions: 1875,
    },
    {
      id: 3,
      name: "Lana Steiner",
      dept: "Marketing",
      gross: 6850.5,
      deductions: 1712.63,
    },
    { id: 4, name: "Candice Wu", dept: "Sales", gross: 9100, deductions: 2275 },
    {
      id: 5,
      name: "Demi Wilkinson",
      dept: "Product",
      gross: 8540.2,
      deductions: 2135.05,
    },
    {
      id: 6,
      name: "Natali Craig",
      dept: "Human Resources",
      gross: 7200,
      deductions: 1800,
    },
  ].map((r) => ({ ...r, net: Number((r.gross - r.deductions).toFixed(2)) })); // add net

  const handleConfirmPayroll = () => {
    console.log("Payroll confirmed!");
    setOpenModal(false);
  };

  const columns = [
    {
      field: "name",
      headerName: "Employee Name",
      flex: 1,
      renderCell: (params) => (
        <Typography
          sx={{ color: "hsl(223, 11%, 88%)", mt: 2, fontSize: 12, pl: 1 }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "dept",
      headerName: "Department",
      flex: 1,
      renderCell: (params) => (
        <Typography
          sx={{ color: "hsl(218, 11%, 65%)", mt: 2, fontSize: 12, pl: 1 }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "gross",
      headerName: "Gross Pay",
      type: "number",
      flex: 1,
      align: "right",
      headerAlign: "right",
      // safe formatter: params may be undefined internally, so guard it
      valueFormatter: (params) =>
        params?.value != null
          ? `$${Number(params.value).toLocaleString()}`
          : "$0",
      renderCell: (params) => (
        <Typography fontWeight={500} mt={2} px={1.5}>
          {params?.value != null
            ? `$${Number(params.value).toLocaleString()}`
            : "$0"}
        </Typography>
      ),
    },
    {
      field: "deductions",
      headerName: "Deductions",
      type: "number",
      flex: 1,
      align: "right",
      headerAlign: "right",
      valueFormatter: (params) =>
        params?.value != null
          ? `$${Number(params.value).toLocaleString()}`
          : "$0",
      renderCell: (params) => (
        <Typography color="warning.main" fontWeight={500} mt={2} px={1.5}>
          {params?.value != null
            ? `$${Number(params.value).toLocaleString()}`
            : "$0"}
        </Typography>
      ),
    },
    {
      field: "net",
      headerName: "Net Pay",
      flex: 1,
      align: "right",
      headerAlign: "right",
      // now net exists on the row so no valueGetter required
      valueFormatter: (params) =>
        params?.value != null
          ? `$${Number(params.value).toLocaleString()}`
          : "$0",
      renderCell: (params) => (
        <Typography color="success.main" fontWeight={500} mt={2} px={1.5}>
          {params?.value != null
            ? `$${Number(params.value).toLocaleString()}`
            : "$0"}
        </Typography>
      ),
    },
  ];

  const border = `solid 1px rgb(55, 65, 81)`;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: (theme) =>
          theme.palette.mode === "dark"
            ? "background.default"
            : "background.paper",
      }}
    >
      {/* Main Content */}
      <Box
        component="main"
        sx={{ flexGrow: 1, py: 6, px: { xs: 2, sm: 4, md: 6 } }}
      >
        {/* Header */}
        <Box
          display="flex"
          flexWrap="wrap"
          justifyContent="space-between"
          alignItems="center"
          mb={4}
        >
          <Box>
            <Typography fontSize={28} fontWeight="800">
              Payroll Preview
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review payroll data before final confirmation.
            </Typography>
          </Box>

          <Box>
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              variant="standard"
              disableUnderline
              sx={{
                bgcolor: "hsl(217, 33%, 17%)",
                height: 40,
                borderRadius: 1.5,
                border: border,
                px: 2,
                "& .MuiSelect-icon": {
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "text.secondary",
                },
              }}
            >
              {["August 2024", "July 2024", "June 2024", "May 2024"].map(
                (m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                )
              )}
            </Select>
          </Box>
        </Box>

        {/* Stat Cards */}
        <Grid container spacing={3} mb={5}>
          {[
            { label: "Total Employees Paid", value: "152" },
            { label: "Total Gross Pay", value: "$1,250,480.00" },
            {
              label: "Total Deductions",
              value: "$312,620.00",
              color: "warning.main",
            },
            {
              label: "Total Net Pay",
              value: "$937,860.00",
              color: "success.main",
            },
          ].map((item) => (
            <Grid item xs={12} sm={6} lg={3} size={3} key={item.label}>
              <Paper
                variant="outlined"
                sx={{ p: 3, bgcolor: "hsl(215, 28%, 17%)", borderRadius: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography
                  variant="h2"
                  fontWeight={700}
                  mt={2}
                  sx={{ color: item.color || "text.primary" }}
                >
                  {item.value}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* Employee Breakdown Table → DataGrid */}
        <Paper
          variant="outlined"
          sx={{ borderRadius: 1, bgcolor: "hsl(215, 28%, 17%)" }}
        >
          <Box p={3}>
            <Typography variant="h5" fontWeight={600}>
              Employee Breakdown
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ height: 350 }}>
            <DataGrid
              rows={rows}
              columns={columns}
              disableRowSelectionOnClick
              // hideFooter
              density="standard"
              sx={{
                border: "none",
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                "& .MuiDataGrid-columnHeader": {
                  backgroundColor: "hsl(216, 23%, 22%)",
                  fontWeight: 600,
                  color: "hsl(216, 12%, 84%)",
                  px: 2.5,
                },
                "& .MuiDataGrid-cell": {
                  borderTop: border,
                  bgcolor: "hsl(215, 28%, 17%)",
                },
                "& .MuiTablePagination-root": {
                  bgcolor: "hsl(216, 23%, 22%)",
                },
              }}
            />
          </Box>
        </Paper>
      </Box>

      {/* Sticky Footer Bar */}
      <Box
        component="footer"
        sx={{
          position: "sticky",
          bottom: 0,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: (theme) =>
            theme.palette.mode === "dark"
              ? "background.default"
              : "background.paper",
          backdropFilter: "blur(8px)",
          px: { xs: 2, sm: 4, md: 6 },
          py: 2,
          zIndex: 10,
        }}
      >
        <Box
          display="flex"
          justifyContent="flex-end"
          gap={2}
          maxWidth="lg"
          mx="auto"
        >
          <Button variant="outlined" color="inherit">
            Edit Payroll
          </Button>
          <Button
            variant="contained"
            sx={{
              bgcolor: "primary.main",
              "&:hover": { bgcolor: "primary.dark" },
            }}
            onClick={() => setOpenModal(true)}
          >
            Confirm &amp; Process
          </Button>
        </Box>
      </Box>

      {/* Confirmation Modal */}
      <ConfirmPayrollModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onConfirm={handleConfirmPayroll}
      />
    </Box>
  );
};

export default PayrollPreview;
