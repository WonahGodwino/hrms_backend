// src/pages/PayrollMain.jsx
import React, { useState, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Paper,
  Avatar,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import {
  ReceiptLong,
  PendingActions,
  AttachMoney,
  Add,
  GroupsOutlined,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import UploadPayrollModal from "./UploadPayrollModal";
import PreviewUploadedPayrollModal from "./PreviewUploadedPayrollModal";

export default function PayrollMain() {
  // ----- State -----
  const [fileId, setFileId] = useState(null);
  const [file, setFile] = useState(null); // ✅ New state for uploaded file
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const navigate = useNavigate();

  // ----- Upload completion handler -----
  const handleUploadComplete = useCallback((uploadedFileId, uploadedFile) => {
    setFileId(uploadedFileId);
    setFile(uploadedFile); // ✅ Store uploaded file
    setIsPreviewOpen(true);
  }, []);

  // ----- Save success handler -----
  const handleSaveSuccess = useCallback(() => {
    setIsPreviewOpen(false);
    navigate(`/admin/process-payroll`);
  }, [navigate]);

  // ----- Dashboard static data -----
  const stats = [
    {
      icon: <GroupsOutlined />,
      label: "Total Employees",
      value: "124",
      bgColor: "hsl(224, 61%, 22%)",
      color: "hsl(213, 94%, 68%)",
    },
    {
      icon: <ReceiptLong />,
      label: "Payrolls Processed",
      value: "36",
      bgColor: "hsl(165, 51%, 14%)",
      color: "hsl(142, 69%, 58%)",
    },
    {
      icon: <PendingActions />,
      label: "Pending Approvals",
      value: "2",
      bgColor: "hsl(14, 40%, 19%)",
      color: "hsl(43, 96%, 56%)",
    },
    {
      icon: <AttachMoney />,
      label: "Total Monthly Cost",
      value: "$152,430.50",
      bgColor: "hsl(217, 33%, 17%)",
      color: "hsl(215, 20%, 65%)",
    },
  ];

  const activities = [
    {
      id: 1,
      month: "June 2024",
      total: "$152,430.50",
      processedBy: "Jane Doe",
      status: "Completed",
      date: "06/30/2024",
    },
    {
      id: 2,
      month: "May 2024",
      total: "$151,987.22",
      processedBy: "Jane Doe",
      status: "Completed",
      date: "05/31/2024",
    },
    {
      id: 3,
      month: "April 2024",
      total: "$153,010.00",
      processedBy: "John Smith",
      status: "Pending",
      date: "04/30/2024",
    },
    {
      id: 4,
      month: "March 2024",
      total: "$150,555.80",
      processedBy: "Jane Doe",
      status: "Failed",
      date: "03/31/2024",
    },
  ];

  const getStatusChip = (status) => {
    let chipStyles;
    switch (status) {
      case "Completed":
        chipStyles = {
          label: "Completed",
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
      case "Failed":
        chipStyles = {
          label: "Failed",
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

  const columns = [
    {
      field: "month",
      headerName: "Month",
      flex: 1,
      minWidth: 150,
      renderCell: (params) => (
        <Typography
          sx={{ color: "hsl(210, 17%, 98%)", mt: 2, fontSize: 12, pl: 1 }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "total",
      headerName: "Total Net Pay",
      flex: 1,
      minWidth: 150,
      renderCell: (params) => (
        <Typography
          sx={{ color: "hsl(215, 19%, 77%)", mt: 2, fontSize: 12, pl: 1 }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "processedBy",
      headerName: "Processed By",
      flex: 1,
      minWidth: 150,
      renderCell: (params) => (
        <Typography
          sx={{ color: "hsl(215, 19%, 77%)", mt: 2, fontSize: 12, pl: 1 }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      minWidth: 150,
      renderCell: (params) => getStatusChip(params.value),
    },
    {
      field: "date",
      headerName: "Date",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <Typography
          sx={{ color: "hsl(215, 19%, 77%)", mt: 2, fontSize: 12, pl: 1 }}
        >
          {params.value}
        </Typography>
      ),
    },
  ];

  const cardBg = "hsl(222, 47%, 11%)";
  const border = "solid 1px rgb(30, 41, 59)";

  return (
    <Box sx={{ p: { xs: 2, sm: 4 } }}>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        mb={4}
      >
        <Typography fontSize={28} fontWeight="800">
          Payroll Dashboard
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Add />}
          sx={{ borderRadius: 1, px: 3, fontWeight: "bold" }}
          onClick={() => setIsUploadOpen(true)}
        >
          Upload Payroll
        </Button>
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={3} mb={5} sx={{ width: "100%", mx: 0 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 1,
                bgcolor: cardBg,
                border: border,
                width: "100%",
              }}
            >
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <Avatar sx={{ bgcolor: stat.bgColor, color: stat.color }}>
                    {stat.icon}
                  </Avatar>
                  <Typography variant="subtitle1" color="text.secondary">
                    {stat.label}
                  </Typography>
                </Box>
                <Typography variant="h2" fontWeight="bold" mt={3} ml={1}>
                  {stat.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Recent Activity Table */}
      <Box>
        <Typography variant="h3" fontWeight="bold" mb={4}>
          Recent Payroll Activity
        </Typography>
        <Paper
          sx={{
            borderRadius: 1,
            overflow: "hidden",
            height: "100%",
            "& .MuiDataGrid-root": { border: border },
          }}
        >
          <DataGrid
            rows={activities}
            columns={columns}
            disableRowSelectionOnClick
            pageSizeOptions={[5]}
            initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
            sx={{
              bgcolor: cardBg,
              border: border,
              "& .MuiDataGrid-columnHeader": {
                bgcolor: cardBg,
                borderBottom: border,
                color: "hsl(215, 19%, 77%)",
                pl: 2,
              },
              "& .MuiDataGrid-cell": { borderTop: border },
              "& .MuiDataGrid-withBorderColor": { borderTop: border },
            }}
          />
        </Paper>
      </Box>

      {/* Upload Payroll Modal */}
      <UploadPayrollModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadComplete={handleUploadComplete}
      />

      {/* Preview Uploaded Payroll Modal */}
      {fileId && (
        <PreviewUploadedPayrollModal
          open={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          fileId={fileId}
          file={file} // ✅ Pass uploaded file here
          onSaveSuccess={handleSaveSuccess}
        />
      )}
    </Box>
  );
}
