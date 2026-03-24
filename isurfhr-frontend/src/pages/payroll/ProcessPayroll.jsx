import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Chip,
  Paper,
  InputAdornment,
  Button,
  CircularProgress,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { styled } from "@mui/material/styles";
import { toggleButtonGroupClasses } from "@mui/material/ToggleButtonGroup";
import { DataGrid } from "@mui/x-data-grid";
import { useLocation, useParams } from "react-router-dom";
import { getPayrollData } from "../../services/PayrollService";
import ConfirmPayrollModal from "./ConfirmPayrollModal";

const StyledToggleButtonGroup = styled(ToggleButtonGroup)(({ theme }) => ({
  [`& .${toggleButtonGroupClasses.grouped}`]: {
    margin: theme.spacing(0.5),
    border: 0,
    borderRadius: 6,
    color: "hsl(216, 16%, 58%)",
    "&.Mui-selected": {
      backgroundColor: "hsl(215, 25%, 27%)",
      color: "hsl(216, 16%, 58%)",
    },
    [`&.${toggleButtonGroupClasses.disabled}`]: {
      border: 0,
      opacity: 0.5,
    },
  },
}));

const border = `solid 1px rgb(47, 61, 80)`;

export default function ProcessPayroll({ fileId: propFileId }) {
  const location = useLocation();
  const { fileId: paramFileId } = useParams();
  const fileId = propFileId || location.state?.fileId || paramFileId || null;

  const [month, setMonth] = useState("April 2024");
  const [period, setPeriod] = useState("Monthly");
  const [search, setSearch] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!fileId) {
      console.warn("⚠️ No fileId found for payroll data.");
      return;
    }

    const loadPayroll = async () => {
      setLoading(true);
      try {
        const response = await getPayrollData(fileId);
        const data = response.data;

        if (data && Array.isArray(data.headers) && Array.isArray(data.rows)) {
          const colDefs = data.headers.map((header, index) => ({
            field: `col_${index}`,
            headerName: header || "ID",
            flex: 1,
            minWidth: 150,
          }));

          const rowData = data.rows.map((row, i) => {
            const formattedRow = { id: i };
            data.headers.forEach((_, j) => {
              formattedRow[`col_${j}`] =
                row[j] === null || row[j] === undefined ? "" : row[j];
            });

            // ✅ Safe check for col_status
            if (
              !Object.prototype.hasOwnProperty.call(formattedRow, "col_status")
            ) {
              formattedRow.col_status = "Pending";
            }

            return formattedRow;
          });

          setColumns([
            ...colDefs,
            {
              field: "col_status",
              headerName: "Status",
              flex: 1,
              minWidth: 120,
            },
          ]);
          setRows(rowData);
        } else {
          setColumns([]);
          setRows([]);
        }
      } catch (error) {
        console.error("❌ Error fetching payroll data:", error);
        setColumns([]);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadPayroll();
  }, [fileId]);

  const filteredRows = rows.filter((row) =>
    columns.some((col) =>
      String(row[col.field]).toLowerCase().includes(search.toLowerCase())
    )
  );

  // ✅ Updated to pass to ConfirmPayrollModal
  const handleRunPayroll = () => {
    setModalOpen(true);
  };

  const confirmPayroll = () => {
    const updatedRows = rows.map((r) => ({ ...r, col_status: "Paid" }));
    setRows(updatedRows);
  };

  const getStatusChip = (status) => {
    let chipStyles = {};
    switch (status) {
      case "Paid":
        chipStyles = {
          label: "Paid",
          bgColor: "hsl(165, 51%, 14%)",
          color: "hsl(142, 69%, 58%)",
        };
        break;
      case "Pending":
        chipStyles = {
          label: "Pending",
          bgColor: "hsl(14, 40%, 19%)",
          color: "hsl(43, 96%, 56%)",
        };
        break;
      case "Error":
        chipStyles = {
          label: "Error",
          bgColor: "hsl(347, 46%, 19%)",
          color: "hsl(0, 90%, 81%)",
        };
        break;
      default:
        chipStyles = {
          label: status,
          bgColor: "hsl(215, 25%, 25%)",
          color: "#fff",
        };
    }
    return (
      <Chip
        label={chipStyles.label}
        size="small"
        sx={{
          bgcolor: chipStyles.bgColor,
          color: chipStyles.color,
          borderRadius: 3,
          "& .MuiChip-label": { fontSize: "0.8rem" },
        }}
      />
    );
  };

  const renderCell = (params) => {
    if (params.field === "col_status") return getStatusChip(params.value);
    return params.value;
  };

  return (
    <Box sx={{ p: 0 }}>
      <Box sx={{ p: { xs: 1, md: 4 }, pb: 10 }}>
        <Typography fontSize={28} fontWeight="800" mb={3}>
          Process Payroll
        </Typography>

        {/* Filters */}
        <Grid container spacing={3} alignItems="center" mb={3}>
          <Grid item xs={12} md={4}>
            <Box display="flex" flexDirection="column" width="100%">
              <Typography variant="body2" mb={1} color="hsl(213, 22%, 81%)">
                Select Month
              </Typography>
              <Select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                variant="standard"
                disableUnderline
                sx={{
                  bgcolor: "hsl(217, 33%, 17%)",
                  height: 40,
                  borderRadius: 1,
                  border: border,
                  px: 2,
                }}
              >
                {[
                  "April 2024",
                  "March 2024",
                  "February 2024",
                  "January 2024",
                ].map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          </Grid>

          <Grid item xs={12} md={8}>
            <Box display="flex" flexDirection="column" width="100%">
              <Typography variant="body2" mb={1} color="hsl(213, 22%, 81%)">
                Select Pay Period
              </Typography>
              <Paper elevation={2}>
                <StyledToggleButtonGroup
                  exclusive
                  fullWidth
                  sx={{
                    height: 40,
                    display: "flex",
                    justifyContent: "space-between",
                    bgcolor: "hsl(217, 33%, 17%)",
                  }}
                  value={period}
                  onChange={(e, val) => val && setPeriod(val)}
                >
                  <ToggleButton value="Monthly">Monthly</ToggleButton>
                  <ToggleButton value="Mid-Month">Mid-Month</ToggleButton>
                  <ToggleButton value="End-of-Month">End-of-Month</ToggleButton>
                </StyledToggleButtonGroup>
              </Paper>
            </Box>
          </Grid>
        </Grid>

        {/* Employee Search */}
        <Box
          p={2}
          sx={{
            border,
            borderBottom: "none",
            borderRadius: 1,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }}
        >
          <TextField
            fullWidth
            variant="standard"
            placeholder="Search for an employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                disableUnderline: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              bgcolor: "hsl(217, 33%, 17%)",
              height: 36,
              borderRadius: 4,
              px: 2,
              py: 0.5,
            }}
          />
        </Box>

        {/* Payroll DataGrid */}
        <Box sx={{ height: 600, border: border, borderTop: "none" }}>
          {loading ? (
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              height="100%"
            >
              <CircularProgress color="inherit" />
            </Box>
          ) : (
            <DataGrid
              rows={filteredRows}
              columns={columns.map((col) => ({ ...col, renderCell }))}
              disableRowSelectionOnClick
              sx={{
                color: "#fff",
                "& .MuiDataGrid-columnHeaders": {
                  bgcolor: "hsl(215, 28%, 17%)",
                  color: "#fff",
                  fontWeight: 700,
                },
                "& .MuiDataGrid-cell": {
                  borderBottom: "1px solid hsl(215, 20%, 20%)",
                },
              }}
            />
          )}
        </Box>

        <Box display="flex" justifyContent="flex-end" mt={3}>
          <Button variant="contained" onClick={handleRunPayroll}>
            Run Payroll
          </Button>
        </Box>
      </Box>

      {/* Confirm Payroll Modal */}
      <ConfirmPayrollModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={confirmPayroll}
      />
    </Box>
  );
}
