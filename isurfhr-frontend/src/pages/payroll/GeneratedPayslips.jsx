import React from "react";
import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  InputAdornment,
  TextField,
  Chip,
  IconButton,
  Stack,
  Paper,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import DownloadIcon from "@mui/icons-material/Download";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useNavigate } from "react-router-dom"; // ✅ Added

const payslipData = [
  {
    id: 1,
    name: "Eleanor Vance",
    department: "Engineering",
    netPay: 4500,
    status: "Paid",
  },
  {
    id: 2,
    name: "Marcus Holloway",
    department: "Marketing",
    netPay: 3800,
    status: "Paid",
  },
  {
    id: 3,
    name: "Clara Oswald",
    department: "Design",
    netPay: 4200,
    status: "Pending",
  },
  {
    id: 4,
    name: "Arthur Pendelton",
    department: "Sales",
    netPay: 5100,
    status: "Failed",
  },
  {
    id: 5,
    name: "Jasmine Kaur",
    department: "Human Resources",
    netPay: 4050,
    status: "Paid",
  },
];

const getStatusChip = (status) => {
  const colors = {
    Paid: { bg: "success", label: "Paid" },
    Pending: { bg: "warning", label: "Pending" },
    Failed: { bg: "error", label: "Failed" },
  };
  const { bg, label } = colors[status] || {};
  return <Chip label={label} color={bg} variant="outlined" size="small" />;
};

const GeneratedPayslips = () => {
  const [month, setMonth] = React.useState("June 2024");
  const [search, setSearch] = React.useState("");
  const navigate = useNavigate(); // ✅ Hook for navigation

  // ✅ Handler for viewing individual payslip
  const handleViewPayslip = () => {
    navigate(`/admin/view-payslip`);
  };

  const columns = [
    { field: "name", headerName: "Employee Name", flex: 1.5, minWidth: 180 },
    { field: "department", headerName: "Department", flex: 1 },
    {
      field: "netPay",
      headerName: "Net Pay",
      type: "number",
      flex: 1,
      align: "right",
      headerAlign: "right",
      valueFormatter: (params) =>
        params.value ? `$${params.value.toLocaleString()}` : "$0",
    },
    {
      field: "status",
      headerName: "Payment Status",
      flex: 1,
      renderCell: (params) => getStatusChip(params.value),
    },
    {
      field: "actions",
      headerName: "Actions",
      flex: 1,
      align: "right",
      headerAlign: "right",
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          {/* ✅ View Payslip Button */}
          <IconButton
            size="small"
            color="inherit"
            onClick={() => handleViewPayslip(params.row.id)}
          >
            <VisibilityIcon fontSize="small" />
          </IconButton>

          <IconButton size="small" color="inherit">
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  const filteredRows = payslipData.filter((row) =>
    row.name.toLowerCase().includes(search.toLowerCase())
  );

  const border = `solid 1px rgb(47, 61, 80)`;

  return (
    <Box p={{ xs: 2, md: 4 }}>
      {/* Header */}
      <Box mb={3}>
        <Typography fontSize={28} fontWeight="800">
          Generated Payslips
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Review, manage, and export payslips for processed payroll periods.
        </Typography>
      </Box>

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, bgcolor: "transparent", border: border }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              size="small"
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="June 2024">June 2024</MenuItem>
              <MenuItem value="May 2024">May 2024</MenuItem>
              <MenuItem value="April 2024">April 2024</MenuItem>
            </Select>

            <TextField
              size="small"
              placeholder="Search by Employee Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <IconButton color="default">
              <FilterListIcon />
            </IconButton>
          </Stack>

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            sx={{ textTransform: "none" }}
          >
            Export All Payslips
          </Button>
        </Stack>

        {/* Data Table */}
        <DataGrid
          rows={filteredRows}
          columns={columns}
          pageSize={5}
          rowsPerPageOptions={[5, 10, 25]}
          disableRowSelectionOnClick
          sx={{
            border: "none",
            py: 2,
            bgcolor: "transparent",
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "transparent",
              fontWeight: 600,
              color: "hsl(216, 12%, 84%)",
              px: 2.5,
            },
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "transparent",
            },
            // "& .MuiDataGrid-cell": {
            //   borderTop: border,
            //   bgcolor: "hsl(215, 28%, 17%)",
            // },
            // "& .MuiTablePagination-root": {
            //   bgcolor: "hsl(216, 23%, 22%)",
            // },
          }}
        />
      </Paper>
    </Box>
  );
};

export default GeneratedPayslips;
