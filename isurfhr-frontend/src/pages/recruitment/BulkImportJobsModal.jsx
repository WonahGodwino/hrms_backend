import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Modal,
  useTheme,
  Link,
  Fade,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

// Import Modals
import BulkImportSuccessModal from "./BulkImportSuccessModal";
import BulkImportProcessingModal from "./BulkImportProcessingModal";

// Service Import
import { downloadJobTemplate } from "@/services/RecruitmentService";

const BulkImportJobsModal = ({ open, onClose }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Modal States
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Lifted Progress State
  const [uploadProgress, setUploadProgress] = useState(0);
  const progressInterval = useRef(null);

  // Mock stats for success modal
  const [successStats, setSuccessStats] = useState({
    created: 142,
    duplicates: 12,
    failed: 3,
    fileName: "",
  });

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  // --- New Logic: Download Template ---
  const handleDownloadTemplate = async (e) => {
    e.preventDefault(); // Prevent default link behavior
    try {
      const response = await downloadJobTemplate();
      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      // Set filename (can be extracted from headers if needed, or hardcoded)
      link.setAttribute("download", "job_import_template.xlsx");
      document.body.appendChild(link);
      link.click();
      // Cleanup
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download template:", error);
      // Optional: show error toast here
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    setShowProcessingModal(true);
    setUploadProgress(0);

    // Simulate progress
    progressInterval.current = setInterval(() => {
      setUploadProgress((prev) => {
        const next = prev + Math.random() * 15;
        if (next >= 100) {
          clearInterval(progressInterval.current);
          return 100;
        }
        return next;
      });
    }, 400); // Update every 400ms
  };

  // Watch for progress completion to trigger transition
  useEffect(() => {
    if (uploadProgress >= 100 && showProcessingModal) {
      // Small delay to let user see 100%
      const timeout = setTimeout(() => {
        setShowProcessingModal(false);
        setSuccessStats({
          created: 142,
          duplicates: 12,
          failed: 3,
          fileName: selectedFile?.name || "jobs.csv",
        });
        setShowSuccessModal(true);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [uploadProgress, showProcessingModal, selectedFile]);

  const handleClose = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setSelectedFile(null);
    setShowProcessingModal(false);
    setShowSuccessModal(false);
    setUploadProgress(0);
    onClose();
  };

  const handleCancelProcessing = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setShowProcessingModal(false);
    setUploadProgress(0);
  };

  const handleUploadAnother = () => {
    setShowSuccessModal(false);
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const handleViewDashboard = () => {
    setShowSuccessModal(false);
    onClose();
  };

  const isMainModalVisible = open && !showProcessingModal && !showSuccessModal;

  return (
    <>
      {/* Main Import Modal */}
      <Modal
        open={isMainModalVisible}
        onClose={handleClose}
        closeAfterTransition
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          backdropFilter: "blur(4px)",
          "& .MuiBackdrop-root": {
            backgroundColor: "rgba(15, 23, 42, 0.6)",
          },
        }}
      >
        <Fade in={isMainModalVisible}>
          <Paper
            elevation={24}
            sx={{
              width: "100%",
              maxWidth: "540px",
              bgcolor: isDarkMode ? "#101922" : "#ffffff",
              borderRadius: 3,
              overflow: "hidden",
              outline: "none",
              border: `1px solid ${isDarkMode ? "#2a3b4d" : "transparent"}`,
            }}
          >
            {/* Header */}
            <Box sx={{ px: 3, pt: 3, pb: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <Typography
                  variant="h5"
                  component="h3"
                  sx={{
                    fontWeight: 700,
                    color: isDarkMode ? "#fff" : "#111418",
                    lineHeight: 1.2,
                  }}
                >
                  Bulk Import Jobs
                </Typography>
                <IconButton
                  onClick={handleClose}
                  sx={{
                    color: isDarkMode ? "#9ca3af" : "#9ca3af",
                    "&:hover": {
                      bgcolor: isDarkMode ? "#1f2937" : "#f3f4f6",
                      color: isDarkMode ? "#d1d5db" : "#4b5563",
                    },
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>
              <Typography
                variant="body1"
                sx={{
                  mt: 1,
                  color: isDarkMode ? "#9ca3af" : "#6b7280",
                  fontSize: "1rem",
                }}
              >
                Create multiple job postings at once using our template.
              </Typography>
            </Box>

            {/* Content */}
            <Box
              sx={{ p: 3, display: "flex", flexDirection: "column", gap: 3 }}
            >
              {/* Info Box */}
              <Box
                sx={{
                  borderRadius: 2,
                  border: `1px solid ${isDarkMode ? "#1e3a8a" : "#dbeafe"}`,
                  bgcolor: isDarkMode ? "rgba(30, 58, 138, 0.1)" : "#eff6ff",
                  p: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    gap: 1.5,
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Box
                    sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}
                  >
                    <InfoOutlinedIcon
                      sx={{ color: "#137fec", fontSize: 20, mt: 0.25 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: isDarkMode ? "#e5e7eb" : "#111418",
                        fontSize: "0.875rem",
                      }}
                    >
                      Please use the official template to avoid formatting
                      errors.
                    </Typography>
                  </Box>
                  {/* Updated Link with Handler */}
                  <Link
                    href="#"
                    underline="none"
                    onClick={handleDownloadTemplate}
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: "#137fec",
                      flexShrink: 0,
                      cursor: "pointer", // Ensure pointer cursor
                      "&:hover": { color: "#1d4ed8" },
                    }}
                  >
                    Download Template <DownloadIcon sx={{ fontSize: 18 }} />
                  </Link>
                </Box>
              </Box>

              {/* Dropzone */}
              {!selectedFile && (
                <Box
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  component="label"
                  sx={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    borderRadius: 2,
                    borderWidth: 2,
                    borderStyle: "dashed",
                    borderColor: dragActive
                      ? "#137fec"
                      : isDarkMode
                        ? "#374151"
                        : "#e5e7eb",
                    bgcolor: dragActive
                      ? isDarkMode
                        ? "rgba(19, 127, 236, 0.1)"
                        : "rgba(239, 246, 255, 0.5)"
                      : isDarkMode
                        ? "rgba(31, 41, 55, 0.5)"
                        : "#f6f7f8",
                    px: 3,
                    py: 5,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    "&:hover": {
                      borderColor: "#137fec",
                      bgcolor: isDarkMode
                        ? "rgba(31, 41, 55, 0.8)"
                        : "rgba(239, 246, 255, 0.3)",
                    },
                  }}
                >
                  <input
                    type="file"
                    className="hidden"
                    style={{ display: "none" }}
                    onChange={handleChange}
                    accept=".csv, .xlsx"
                  />
                  <Box
                    sx={{
                      height: 48,
                      width: 48,
                      borderRadius: "50%",
                      bgcolor: isDarkMode ? "#374151" : "#ffffff",
                      boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CloudUploadIcon sx={{ color: "#137fec", fontSize: 24 }} />
                  </Box>
                  <Box sx={{ textAlign: "center", maxWidth: "480px" }}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontSize: "1.125rem",
                        fontWeight: 700,
                        color: isDarkMode ? "#fff" : "#111418",
                        mb: 0.5,
                      }}
                    >
                      Drag & drop your CSV/XLSX here
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: isDarkMode ? "#9ca3af" : "#6b7280" }}
                    >
                      or click to{" "}
                      <Box
                        component="span"
                        sx={{
                          color: "#137fec",
                          fontWeight: 600,
                          textDecoration: "underline",
                          textDecorationColor: "transparent",
                          "&:hover": { textDecorationColor: "currentColor" },
                        }}
                      >
                        browse files
                      </Box>
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: isDarkMode ? "#6b7280" : "#9ca3af",
                      fontWeight: 500,
                    }}
                  >
                    Supported formats: .csv, .xlsx (Max 5MB)
                  </Typography>
                </Box>
              )}

              {/* Selected File Item */}
              {selectedFile && (
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: isDarkMode ? "#6b7280" : "#9ca3af",
                    }}
                  >
                    Ready to Upload
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 2,
                      borderRadius: 2,
                      border: `1px solid ${isDarkMode ? "#374151" : "#f3f4f6"}`,
                      bgcolor: isDarkMode ? "#1f2937" : "#ffffff",
                      p: 1.5,
                      boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                      transition: "all 0.2s",
                      "&:hover": {
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          height: 40,
                          width: 40,
                          borderRadius: 2,
                          bgcolor: isDarkMode
                            ? "rgba(20, 83, 45, 0.2)"
                            : "#ecfdf5", // green-900/20 / green-50
                          color: isDarkMode ? "#4ade80" : "#16a34a", // green-400 / green-600
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <InsertDriveFileIcon />
                      </Box>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          overflow: "hidden",
                        }}
                      >
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{
                            fontWeight: 600,
                            color: isDarkMode ? "#fff" : "#111418",
                          }}
                        >
                          {selectedFile.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: isDarkMode ? "#9ca3af" : "#6b7280" }}
                        >
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </Typography>
                      </Box>
                    </Box>
                    <IconButton
                      onClick={handleRemoveFile}
                      size="small"
                      sx={{
                        color: "#9ca3af",
                        "&:hover": {
                          bgcolor: isDarkMode
                            ? "rgba(127, 29, 29, 0.2)"
                            : "#fef2f2",
                          color: "#ef4444",
                        },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Footer */}
            <Box
              sx={{
                px: 3,
                py: 2.5,
                bgcolor: isDarkMode ? "#101922" : "#ffffff",
                borderTop: `1px solid ${isDarkMode ? "#2a3b4d" : "#f3f4f6"}`,
                display: "flex",
                justifyContent: "flex-end",
                gap: 1.5,
              }}
            >
              <Button
                onClick={handleClose}
                sx={{
                  color: isDarkMode ? "#d1d5db" : "#4b5563",
                  fontWeight: 700,
                  textTransform: "none",
                  "&:hover": {
                    bgcolor: isDarkMode ? "#1f2937" : "#f3f4f6",
                  },
                }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleUpload}
                disabled={!selectedFile}
                sx={{
                  bgcolor: "#137fec",
                  color: "#fff",
                  fontWeight: 700,
                  textTransform: "none",
                  borderRadius: 2,
                  px: 3,
                  boxShadow: "0 10px 15px -3px rgba(19, 127, 236, 0.2)",
                  "&:hover": { bgcolor: "#2563eb" },
                  "&.Mui-disabled": {
                    bgcolor: isDarkMode ? "#374151" : "#e5e7eb",
                    color: isDarkMode ? "#9ca3af" : "#9ca3af",
                  },
                }}
              >
                Upload Jobs
              </Button>
            </Box>
          </Paper>
        </Fade>
      </Modal>

      {/* Processing Modal */}
      <BulkImportProcessingModal
        open={showProcessingModal}
        onClose={handleCancelProcessing}
        progress={uploadProgress} // Pass progress down
      />

      {/* Success Modal */}
      <BulkImportSuccessModal
        open={showSuccessModal}
        onClose={handleClose}
        stats={successStats}
        onUploadAnother={handleUploadAnother}
        onViewDashboard={handleViewDashboard}
      />
    </>
  );
};

export default BulkImportJobsModal;
