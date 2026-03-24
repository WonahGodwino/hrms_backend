import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  Divider,
  Stack,
  IconButton,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/Upload";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";

const PayrollSettings = () => {
  const [selectedTab, setSelectedTab] = useState("Payroll Template");

  const sidebarTabs = [
    { label: "General Settings", icon: <SettingsIcon /> },
    { label: "Payroll Template", icon: <UploadFileIcon /> },
    { label: "Allowances & Deductions", icon: <ReceiptLongIcon /> },
    { label: "Tax Rules", icon: <AccountBalanceIcon /> },
  ];

  const mappings = [
    { csv: "Employee ID", system: "Employee ID" },
    { csv: "Base Salary", system: "Base Salary" },
    { csv: "Overtime Hours", system: "Overtime Hours" },
    { csv: "Bonus", system: "Bonus" },
    { csv: "Tax Deduction", system: "Tax Deduction" },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
        p: 4,
      }}
    >
      {/* Settings Sidebar */}
      <Box
        sx={{
          width: { xs: "100%", md: 240 },
          display: "flex",
          flexDirection: "column",
          gap: 1,
          mr: 4,
        }}
      >
        {sidebarTabs.map((tab) => (
          <Button
            key={tab.label}
            onClick={() => setSelectedTab(tab.label)}
            startIcon={tab.icon}
            variant={selectedTab === tab.label ? "contained" : "text"}
            sx={{
              justifyContent: "flex-start",
              textTransform: "none",
              borderRadius: 2,
              color:
                selectedTab === tab.label
                  ? "primary.contrastText"
                  : "text.secondary",
              bgcolor:
                selectedTab === tab.label ? "primary.main" : "transparent",
              "&:hover": {
                bgcolor:
                  selectedTab === tab.label ? "primary.dark" : "action.hover",
              },
            }}
          >
            {tab.label}
          </Button>
        ))}
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1 }}>
        {/* Header */}
        <Typography variant="h4" fontWeight="bold" mb={4}>
          Payroll Settings
        </Typography>

        <Paper sx={{ p: 4, borderRadius: 3, boxShadow: 2 }}>
          {/* Section Header */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: 1,
              borderColor: "divider",
              pb: 2,
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight="bold">
                Current Payroll Template
              </Typography>
              <Typography variant="body2" color="text.secondary">
                File: payroll_template_Q4_2023.csv
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5}>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                sx={{ textTransform: "none" }}
              >
                Edit
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                sx={{ textTransform: "none" }}
              >
                Delete
              </Button>
              <Button
                variant="contained"
                startIcon={<UploadIcon />}
                sx={{ textTransform: "none" }}
              >
                Upload New Template
              </Button>
            </Stack>
          </Box>

          {/* Table */}
          <Box sx={{ mt: 4, overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography fontWeight="bold">
                      Template Field (from CSV)
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight="bold">
                      System Field (Map to)
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.map((row) => (
                  <TableRow key={row.csv}>
                    <TableCell>{row.csv}</TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={row.system}
                        sx={{ minWidth: 180, borderRadius: 1 }}
                      >
                        <MenuItem value="Employee ID">Employee ID</MenuItem>
                        <MenuItem value="Base Salary">Base Salary</MenuItem>
                        <MenuItem value="Overtime Hours">
                          Overtime Hours
                        </MenuItem>
                        <MenuItem value="Bonus">Bonus</MenuItem>
                        <MenuItem value="Tax Deduction">Tax Deduction</MenuItem>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default PayrollSettings;
