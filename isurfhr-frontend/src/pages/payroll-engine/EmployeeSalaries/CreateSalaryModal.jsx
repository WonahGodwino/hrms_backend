// src/pages/payroll-engine/EmployeeSalaries/CreateSalaryModal.jsx
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  useTheme,
  IconButton,
  Grid,
  Divider,
  Autocomplete,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  createSalaryStructure,
  updateSalaryStructure,
  getStaff,
} from "@/services/PayrollEngineService";

const EMPLOYEE_CATEGORIES = [
  { value: "REGULAR", label: "Regular (Full-time)" },
  { value: "CONTRACT", label: "Contract" },
];

const initialFormState = {
  staffId: "",
  employeeCategory: "REGULAR",
  basicSalary: "",
  housingAllowance: "",
  transportAllowance: "",
  dressingAllowance: "",
  leaveAllowance: "",
  entertainmentAllowance: "",
  utilityAllowance: "",
  otherAllowances: "",
  annualRent: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
  pensionFundAdministrator: "",
  pensionPin: "",
  effectiveDate: new Date().toISOString().split("T")[0],
};

const CreateSalaryModal = ({ open, onClose, onSuccess, editData }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

  const isEditing = Boolean(editData);

  // Form State
  const [formData, setFormData] = useState(initialFormState);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffLoading, setStaffLoading] = useState(false);

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load staff options
  useEffect(() => {
    const fetchStaff = async () => {
      setStaffLoading(true);
      try {
        const response = await getStaff({ limit: 500 });
        if (response.data?.data) {
          setStaffOptions(response.data.data);
        }
      } catch (err) {
        console.error("Failed to fetch staff:", err);
      } finally {
        setStaffLoading(false);
      }
    };

    if (open && !isEditing) {
      fetchStaff();
    }
  }, [open, isEditing]);

  // Load edit data
  useEffect(() => {
    if (editData) {
      setFormData({
        staffId: editData.staffId?._id || "",
        employeeCategory: editData.employeeCategory || "REGULAR",
        basicSalary: editData.basicSalary || "",
        housingAllowance: editData.housingAllowance || "",
        transportAllowance: editData.transportAllowance || "",
        dressingAllowance: editData.dressingAllowance || "",
        leaveAllowance: editData.leaveAllowance || "",
        entertainmentAllowance: editData.entertainmentAllowance || "",
        utilityAllowance: editData.utilityAllowance || "",
        otherAllowances: editData.otherAllowances || "",
        annualRent: editData.annualRent || "",
        bankName: editData.bankName || "",
        accountNumber: editData.accountNumber || "",
        accountName: editData.accountName || "",
        pensionFundAdministrator: editData.pensionFundAdministrator || "",
        pensionPin: editData.pensionPin || "",
        effectiveDate:
          editData.effectiveDate?.split("T")[0] ||
          new Date().toISOString().split("T")[0],
      });
      setSelectedStaff(editData.staffId || null);
    } else {
      setFormData(initialFormState);
      setSelectedStaff(null);
    }
  }, [editData, open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    const numValue = value === "" ? "" : parseFloat(value) || 0;
    setFormData((prev) => ({ ...prev, [name]: numValue }));
  };

  const handleStaffChange = (event, newValue) => {
    setSelectedStaff(newValue);
    setFormData((prev) => ({ ...prev, staffId: newValue?._id || newValue?.id || "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        ...formData,
        basicSalary: parseFloat(formData.basicSalary) || 0,
        housingAllowance: parseFloat(formData.housingAllowance) || 0,
        transportAllowance: parseFloat(formData.transportAllowance) || 0,
        dressingAllowance: parseFloat(formData.dressingAllowance) || 0,
        leaveAllowance: parseFloat(formData.leaveAllowance) || 0,
        entertainmentAllowance:
          parseFloat(formData.entertainmentAllowance) || 0,
        utilityAllowance: parseFloat(formData.utilityAllowance) || 0,
        otherAllowances: parseFloat(formData.otherAllowances) || 0,
        annualRent: parseFloat(formData.annualRent) || 0,
      };

      if (isEditing) {
        await updateSalaryStructure(formData.staffId, payload);
      } else {
        await createSalaryStructure(payload);
      }

      onSuccess();
    } catch (err) {
      console.error("Failed to save salary structure:", err);
      const errorMessage =
        err.response?.data?.message ||
        "Failed to save salary structure. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      setFormData(initialFormState);
      setSelectedStaff(null);
      onClose();
    }
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      bgcolor: isDarkMode ? "#0f172a" : "#f8fafc",
    },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
    },
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: isDarkMode ? "#1A2632" : "#ffffff",
          borderRadius: 3,
          maxHeight: "90vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
          pb: 2,
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: isDarkMode ? "#fff" : "#0f172a" }}
          >
            {isEditing ? "Edit Salary Structure" : "Create Salary Structure"}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
          >
            {isEditing
              ? "Update employee compensation details"
              : "Set up compensation for an employee"}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} disabled={loading}>
          <CloseIcon sx={{ color: isDarkMode ? "#94a3b8" : "#64748b" }} />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ py: 3 }}>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 3 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Employee Selection */}
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: isDarkMode ? "#e2e8f0" : "#334155",
              }}
            >
              Employee Information
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                {isEditing ? (
                  <TextField
                    fullWidth
                    label="Employee"
                    value={selectedStaff?.fullName || ""}
                    disabled
                    sx={inputSx}
                  />
                ) : (
                  <Autocomplete
                    options={staffOptions}
                    loading={staffLoading}
                    getOptionLabel={(option) =>
                      `${option.fullName} (${option.email})`
                    }
                    value={selectedStaff}
                    onChange={handleStaffChange}
                    slotProps={{
                      popper: {
                        sx: { minWidth: 400 },
                      },
                      paper: {
                        sx: {
                          "& .MuiAutocomplete-option": {
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          },
                        },
                      },
                    }}
                    renderOption={(props, option) => (
                      <Box
                        component="li"
                        {...props}
                        sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", py: 1 }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {option.fullName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {option.email}
                        </Typography>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Employee"
                        required
                        sx={inputSx}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {staffLoading ? (
                                <CircularProgress size={20} />
                              ) : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                )}
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select
                    name="employeeCategory"
                    value={formData.employeeCategory}
                    label="Category"
                    onChange={handleChange}
                    sx={inputSx}
                  >
                    {EMPLOYEE_CATEGORIES.map((cat) => (
                      <MenuItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Divider sx={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} />

            {/* Salary & Allowances */}
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: isDarkMode ? "#e2e8f0" : "#334155",
              }}
            >
              Salary & Allowances
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Basic Salary"
                  name="basicSalary"
                  type="number"
                  value={formData.basicSalary}
                  onChange={handleNumberChange}
                  required
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Housing Allowance"
                  name="housingAllowance"
                  type="number"
                  value={formData.housingAllowance}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Transport Allowance"
                  name="transportAllowance"
                  type="number"
                  value={formData.transportAllowance}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Dressing Allowance"
                  name="dressingAllowance"
                  type="number"
                  value={formData.dressingAllowance}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Leave Allowance"
                  name="leaveAllowance"
                  type="number"
                  value={formData.leaveAllowance}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Entertainment Allowance"
                  name="entertainmentAllowance"
                  type="number"
                  value={formData.entertainmentAllowance}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Utility Allowance"
                  name="utilityAllowance"
                  type="number"
                  value={formData.utilityAllowance}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Other Allowances"
                  name="otherAllowances"
                  type="number"
                  value={formData.otherAllowances}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Annual Rent (for Tax Relief)"
                  name="annualRent"
                  type="number"
                  value={formData.annualRent}
                  onChange={handleNumberChange}
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <Typography sx={{ mr: 1, color: "#94a3b8" }}>
                        ₦
                      </Typography>
                    ),
                  }}
                />
              </Grid>
            </Grid>

            <Divider sx={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} />

            {/* Banking Details */}
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: isDarkMode ? "#e2e8f0" : "#334155",
              }}
            >
              Banking Details
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Bank Name"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleChange}
                  required
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Account Number"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleChange}
                  required
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Account Name"
                  name="accountName"
                  value={formData.accountName}
                  onChange={handleChange}
                  required
                  sx={inputSx}
                />
              </Grid>
            </Grid>

            <Divider sx={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0" }} />

            {/* Pension Details */}
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: isDarkMode ? "#e2e8f0" : "#334155",
              }}
            >
              Pension Details
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Pension Fund Administrator (PFA)"
                  name="pensionFundAdministrator"
                  value={formData.pensionFundAdministrator}
                  onChange={handleChange}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Pension PIN"
                  name="pensionPin"
                  value={formData.pensionPin}
                  onChange={handleChange}
                  sx={inputSx}
                />
              </Grid>
            </Grid>

            {/* Effective Date */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Effective Date"
                  name="effectiveDate"
                  type="date"
                  value={formData.effectiveDate}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  sx={inputSx}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            py: 2,
            borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
            gap: 1,
          }}
        >
          <Button
            onClick={handleClose}
            disabled={loading}
            sx={{
              color: isDarkMode ? "#94a3b8" : "#64748b",
              fontWeight: 600,
              textTransform: "none",
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || (!isEditing && !formData.staffId)}
            sx={{
              bgcolor: "#137fec",
              fontWeight: 700,
              textTransform: "none",
              px: 3,
              "&:hover": { bgcolor: "#1d4ed8" },
            }}
          >
            {loading ? (
              <CircularProgress size={20} color="inherit" />
            ) : isEditing ? (
              "Update"
            ) : (
              "Create"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateSalaryModal;
