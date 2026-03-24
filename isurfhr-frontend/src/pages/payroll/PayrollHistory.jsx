import React from "react";
import {
  Box,
  Button,
  Typography,
  Chip,
  useTheme,
  IconButton,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const PayrollHistory = () => {
  const theme = useTheme();

  const columns = [
    { field: "month", headerName: "Month", flex: 1 },
    { field: "grossPay", headerName: "Gross Pay", flex: 1 },
    { field: "deductions", headerName: "Deductions", flex: 1 },
    { field: "netPay", headerName: "Net Pay", flex: 1 },
    { field: "paymentDate", headerName: "Payment Date", flex: 1 },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      renderCell: (params) => {
        const color =
          params.value === "Paid"
            ? "success"
            : params.value === "Pending"
            ? "warning"
            : "error";
        return <Chip label={params.value} color={color} size="small" />;
      },
    },
    {
      field: "action",
      headerName: "",
      flex: 1,
      sortable: false,
      renderCell: () => (
        <Typography
          sx={{
            color: theme.palette.primary.main,
            fontWeight: 600,
            cursor: "pointer",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          View Payslip
        </Typography>
      ),
    },
  ];

  const rows = [
    {
      id: 1,
      month: "November",
      grossPay: "$450,000.00",
      deductions: "$90,000.00",
      netPay: "$360,000.00",
      paymentDate: "Dec 01, 2023",
      status: "Paid",
    },
    {
      id: 2,
      month: "October",
      grossPay: "$445,000.00",
      deductions: "$89,000.00",
      netPay: "$356,000.00",
      paymentDate: "Nov 01, 2023",
      status: "Paid",
    },
    {
      id: 3,
      month: "September",
      grossPay: "$452,000.00",
      deductions: "$91,500.00",
      netPay: "$360,500.00",
      paymentDate: "Oct 01, 2023",
      status: "Paid",
    },
    {
      id: 4,
      month: "August",
      grossPay: "$430,000.00",
      deductions: "$85,000.00",
      netPay: "$345,000.00",
      paymentDate: "Sep 01, 2023",
      status: "Pending",
    },
    {
      id: 5,
      month: "July",
      grossPay: "$460,000.00",
      deductions: "$92,000.00",
      netPay: "$368,000.00",
      paymentDate: "Aug 01, 2023",
      status: "Failed",
    },
  ];

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.default,
        minHeight: "100vh",
        p: { xs: 2, sm: 4, md: 6 },
      }}
    >
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
        flexWrap="wrap"
        gap={2}
      >
        <Typography variant="h4" fontWeight="bold">
          Payroll History
        </Typography>
      </Box>

      {/* Filters + Export */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        flexWrap="wrap"
        gap={2}
      >
        <Box display="flex" gap={2} flexWrap="wrap">
          {["Month: All", "Year: 2023", "Status: All"].map((label, index) => (
            <Button
              key={index}
              variant="outlined"
              endIcon={<ExpandMoreIcon />}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                backgroundColor: theme.palette.background.paper,
              }}
            >
              {label}
            </Button>
          ))}
        </Box>

        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          sx={{
            backgroundColor: theme.palette.primary.main,
            textTransform: "none",
            fontWeight: "bold",
            borderRadius: 2,
          }}
        >
          Export
        </Button>
      </Box>

      {/* Data Grid */}
      <Box
        sx={{
          height: 480,
          width: "100%",
          backgroundColor: theme.palette.background.paper,
          borderRadius: 2,
          boxShadow: 2,
          "& .MuiDataGrid-cell": {
            py: 1.5,
          },
          "& .MuiDataGrid-columnHeaders": {
            fontWeight: "bold",
            textTransform: "uppercase",
            fontSize: "0.75rem",
            backgroundColor: theme.palette.action.hover,
          },
        }}
      >
        <DataGrid
          rows={rows}
          columns={columns}
          pageSize={5}
          rowsPerPageOptions={[5]}
          disableRowSelectionOnClick
          hideFooterSelectedRowCount
        />
      </Box>
    </Box>
  );
};

export default PayrollHistory;
