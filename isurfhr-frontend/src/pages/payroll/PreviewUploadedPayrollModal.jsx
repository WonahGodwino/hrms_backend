import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import PayrollUploadSuccessModal from "./PayrollUploadSuccessModal";
import { getPayrollData, savePayrollData } from "../../services/PayrollService";

export default function PreviewUploadedPayrollModal({
  open,
  onClose,
  fileId,
  file,
}) {
  const [rows, setRows] = useState({ colDefs: [], rowData: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  useEffect(() => {
    if (!open || !fileId) return;

    const fetchPayroll = async () => {
      setLoading(true);
      try {
        const response = await getPayrollData(fileId);
        const payrollData = response.data;

        if (
          payrollData &&
          Array.isArray(payrollData.headers) &&
          Array.isArray(payrollData.rows)
        ) {
          const colDefs = payrollData.headers.map((header, index) => ({
            field: `col_${index}`,
            headerName: header || "",
            flex: 1,
            minWidth: 150,
          }));

          const rowData = payrollData.rows.map((row, i) => {
            const formattedRow = { id: i };
            payrollData.headers.forEach((_, j) => {
              formattedRow[`col_${j}`] =
                row[j] === null || row[j] === undefined ? "" : row[j];
            });
            return formattedRow;
          });

          setRows({ colDefs, rowData });
        } else {
          setRows({ colDefs: [], rowData: [] });
        }
      } catch (error) {
        console.error("❌ Error fetching payroll data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPayroll();
  }, [open, fileId]);

  const handleSavePayroll = async () => {
    if (!fileId) {
      console.error("❌ fileId is missing, cannot save payroll");
      return;
    }

    setSaving(true);
    try {
      const response = await savePayrollData(fileId, file);

      if (response.status === 201 || response.status === 200) {
        // ✅ Open success modal instead of navigating away
        setSuccessOpen(true);
      } else {
        console.error("❌ Failed to save payroll:", response.statusText);
      }
    } catch (error) {
      console.error("❌ Error saving payroll:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSuccessClose = () => {
    setSuccessOpen(false);
    onClose(); // closes preview modal after success modal closes
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          sx: { borderRadius: 3, bgcolor: "hsl(210, 33%, 16%)", color: "#fff" },
        }}
        BackdropProps={{
          sx: {
            backdropFilter: "blur(4px)",
            backgroundColor: "rgba(0,0,0,0.6)",
          },
        }}
      >
        <DialogTitle>
          <Box>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Preview Uploaded Payroll
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Review payroll details before saving.
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 3 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress color="inherit" />
            </Box>
          ) : !rows.rowData || rows.rowData.length === 0 ? (
            <Typography textAlign="center" color="text.secondary">
              No payroll data available.
            </Typography>
          ) : (
            <Box
              sx={{
                height: 600,
                width: "100%",
                bgcolor: "hsl(210, 33%, 18%)",
                borderRadius: 2,
              }}
            >
              <DataGrid
                rows={rows.rowData}
                columns={rows.colDefs}
                disableSelectionOnClick
                sx={{
                  color: "#fff",
                  border: "none",
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
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ justifyContent: "flex-end", px: 3, py: 2 }}>
          <Button
            onClick={onClose}
            variant="outlined"
            color="inherit"
            sx={{ fontWeight: "bold" }}
            disabled={saving}
          >
            Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            sx={{ fontWeight: "bold" }}
            onClick={handleSavePayroll}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Payroll to System"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ✅ Show success modal after saving */}
      <PayrollUploadSuccessModal
        open={successOpen}
        onClose={handleSuccessClose}
        fileId={fileId} // ✅ pass the fileId here
      />
    </>
  );
}
