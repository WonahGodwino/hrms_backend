// src/pages/Public/Register.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "@/components/ui-mui/button";
import Label from "@/components/ui-mui/label";
import Select from "@/components/ui-mui/select";
import Card from "@/components/ui-mui/card";
import { register } from "@/services/AuthService";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  OutlinedInput,
  MenuItem,
  useTheme,
  useMediaQuery,
  Fade
} from "@mui/material";
import { tokens } from "../../theme";

/**
 * Register page — refactored to match visual system used in Login.jsx
 * - Uses same left-panel gradient, right-panel background and Card surface.
 * - All text inputs use OutlinedInput inside FormControl so sizing/autofill/adornments
 *   match the Login page behavior.
 * - Preserves existing registration logic (register() call + navigation).
 */

const Register = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isSmall = useMediaQuery(theme.breakpoints.down("md"));
  const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  const [userData, setUserData] = useState({
    fullName: "",
    dateOfBirth: "",
    gender: "",
    email: "",
    phoneNumber: "",
    department: "",
    role: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (field) => (e) =>
    setUserData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register(userData);
      navigate("/login");
    } catch (err) {
      console.error("Registration error:", err);
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Right panel background (darker than left)
  const rightBg =
    theme.palette.mode === "dark"
      ? colors.background.dark
      : colors.primary[100];

  return (
    <Box
      component="main"
      sx={{
        maxHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: { xs: "column", lg: "row" },
        backgroundColor:
          theme.palette.mode === "dark"
            ? colors.background.dark
            : colors.background.light,
        overflowX: "hidden",
      }}
    >
      {/* Left banner (duotone gradient) */}
      <Box
        component="section"
        aria-hidden={isSmall}
        sx={{
          display: { xs: "none", lg: "flex" },
          alignItems: "center",
          justifyContent: "center",
          flexBasis: "50%",
          flexShrink: 0,
          p: 12,
          boxSizing: "border-box",
          // match Login.jsx gradient exactly
          background: `linear-gradient(135deg, ${colors.primary[700]} 0%, ${colors.primary[800]} 80%)`,
          color: colors.gray[100],
        }}
      >
        <Box sx={{ maxWidth: 460 }}>
          <Box sx={{ position: "relative", mb: 4 }}>
            <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
              <Typography
                variant="h5"
                fontWeight={700}
                sx={{ color: "inherit" }}
              >
                Isurf<span style={{ opacity: 0.9 }}>HR</span>
              </Typography>
            </Link>
          </Box>

          <Typography variant="h3" fontWeight={800} gutterBottom>
            Welcome
            <br />
            to 247HR!
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9 }}>
            Create an account to get started with seamless HR management.
          </Typography>
        </Box>
      </Box>

      {/* Right form panel */}
      <Box
        component="section"
        aria-label="Register form"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexBasis: { xs: "100%", lg: "50%" },
          flexShrink: 0,
          boxSizing: "border-box",
          p: { xs: 4, sm: 6, lg: 10 },
          bgcolor: rightBg,
        }}
      >
        <Fade in timeout={prefersReduced ? 0 : 300}>
          <Box sx={{ width: "100%", maxWidth: 680 }}>
            <Card
              sx={{
                width: "100%",
                borderRadius: 3,
                bgcolor: rightBg, // card same as right panel
                border:
                  theme.palette.mode === "dark"
                    ? `1px solid rgba(255,255,255,0.03)`
                    : `1px solid rgba(0,0,0,0.04)`,
                boxShadow:
                  "0 8px 30px rgba(2,6,23,0.45), 0 2px 6px rgba(2,6,23,0.25)",
              }}
            >
              <Box
                sx={{
                  p: { xs: 2, sm: 4 },
                  transition: prefersReduced ? "none" : "all 180ms ease",
                  // autofill overrides for inputs inside card (same technique used in Login.jsx)
                  "& input:-webkit-autofill, & input:-webkit-autofill:focus, & input:-webkit-autofill:hover":
                    {
                      WebkitBoxShadow: `0 0 0px 1000px ${rightBg} inset !important`,
                      boxShadow: `0 0 0px 1000px ${rightBg} inset !important`,
                      WebkitTextFillColor:
                        theme.palette.mode === "dark"
                          ? colors.gray[100]
                          : colors.gray[900],
                      transition: "background-color 5000s ease-in-out 0s",
                    },
                }}
              >
                <Typography
                  variant={isSmall ? "h5" : "h4"}
                  fontWeight={700}
                  textAlign="center"
                  gutterBottom
                >
                  Sign Up
                </Typography>

                <Box
                  component="form"
                  onSubmit={handleSubmit}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    mt: 3,
                  }}
                >
                  {/* Full Name & DOB */}
                  <Box
                    sx={{
                      display: "flex",
                      gap: 2,
                      flexDirection: { xs: "column", md: "row" },
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Label htmlFor="fullName">Full Name</Label>
                      <FormControl fullWidth sx={{ mt: 1 }}>
                        <OutlinedInput
                          id="fullName"
                          name="fullName"
                          placeholder="Full Name"
                          value={userData.fullName}
                          onChange={handleChange("fullName")}
                          required
                          sx={{
                            borderRadius: 2,
                            bgcolor:
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.02)"
                                : "#fff",
                            border: `1px solid ${
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.04)"
                                : "rgba(16,24,40,0.06)"
                            }`,
                            "& .MuiOutlinedInput-input": {
                              padding: "12px 14px",
                              height: 44,
                              boxSizing: "border-box",
                            },
                            "&:focus-within": {
                              boxShadow: `0 0 0 6px ${
                                theme.palette.mode === "dark"
                                  ? `${colors.primary[600]}22`
                                  : `${colors.primary[600]}10`
                              }`,
                            },
                          }}
                        />
                      </FormControl>
                    </Box>

                    <Box sx={{ flex: 1 }}>
                      <Label htmlFor="dateOfBirth">Date of Birth</Label>
                      <FormControl fullWidth sx={{ mt: 1 }}>
                        <OutlinedInput
                          id="dateOfBirth"
                          name="dateOfBirth"
                          type="date"
                          value={userData.dateOfBirth}
                          onChange={handleChange("dateOfBirth")}
                          required
                          sx={{
                            borderRadius: 2,
                            bgcolor:
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.02)"
                                : "#fff",
                            border: `1px solid ${
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.04)"
                                : "rgba(16,24,40,0.06)"
                            }`,
                            "& .MuiOutlinedInput-input": {
                              padding: "10px 14px",
                              height: 44,
                              boxSizing: "border-box",
                            },
                            "&:focus-within": {
                              boxShadow: `0 0 0 6px ${
                                theme.palette.mode === "dark"
                                  ? `${colors.primary[600]}22`
                                  : `${colors.primary[600]}10`
                              }`,
                            },
                          }}
                        />
                      </FormControl>
                    </Box>
                  </Box>

                  {/* Gender */}
                  <Box>
                    <Label htmlFor="gender">Gender</Label>
                    <Box sx={{ mt: 1 }}>
                      <Select
                        id="gender"
                        value={userData.gender}
                        onChange={handleChange("gender")}
                        displayEmpty
                        fullWidth
                        sx={{
                          borderRadius: 2,
                          bgcolor:
                            theme.palette.mode === "dark"
                              ? "rgba(255,255,255,0.02)"
                              : "#fff",
                          border: `1px solid ${
                            theme.palette.mode === "dark"
                              ? "rgba(255,255,255,0.04)"
                              : "rgba(16,24,40,0.06)"
                          }`,
                          "& .MuiSelect-select": {
                            padding: "12px 14px",
                            height: 44,
                            boxSizing: "border-box",
                          },
                          "&:focus-within": {
                            boxShadow: `0 0 0 6px ${
                              theme.palette.mode === "dark"
                                ? `${colors.primary[600]}22`
                                : `${colors.primary[600]}10`
                            }`,
                          },
                        }}
                      >
                        <MenuItem value="">Select Gender</MenuItem>
                        <MenuItem value="Male">Male</MenuItem>
                        <MenuItem value="Female">Female</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                      </Select>
                    </Box>
                  </Box>

                  {/* Email & Phone */}
                  <Box
                    sx={{
                      display: "flex",
                      gap: 2,
                      flexDirection: { xs: "column", md: "row" },
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Label htmlFor="email">Email</Label>
                      <FormControl fullWidth sx={{ mt: 1 }}>
                        <OutlinedInput
                          id="email"
                          name="email"
                          type="email"
                          placeholder="Email"
                          value={userData.email}
                          onChange={handleChange("email")}
                          required
                          sx={{
                            borderRadius: 2,
                            bgcolor:
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.02)"
                                : "#fff",
                            border: `1px solid ${
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.04)"
                                : "rgba(16,24,40,0.06)"
                            }`,
                            "& .MuiOutlinedInput-input": {
                              padding: "12px 14px",
                              height: 44,
                              boxSizing: "border-box",
                            },
                            "&:focus-within": {
                              boxShadow: `0 0 0 6px ${
                                theme.palette.mode === "dark"
                                  ? `${colors.primary[600]}22`
                                  : `${colors.primary[600]}10`
                              }`,
                            },
                            "& input:-webkit-autofill": {
                              WebkitBoxShadow: `0 0 0px 1000px ${rightBg} inset !important`,
                              boxShadow: `0 0 0px 1000px ${rightBg} inset !important`,
                              WebkitTextFillColor:
                                theme.palette.mode === "dark"
                                  ? colors.gray[100]
                                  : colors.gray[900],
                            },
                          }}
                        />
                      </FormControl>
                    </Box>

                    <Box sx={{ flex: 1 }}>
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <FormControl fullWidth sx={{ mt: 1 }}>
                        <OutlinedInput
                          id="phoneNumber"
                          name="phoneNumber"
                          type="tel"
                          placeholder="Phone Number"
                          value={userData.phoneNumber}
                          onChange={handleChange("phoneNumber")}
                          required
                          sx={{
                            borderRadius: 2,
                            bgcolor:
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.02)"
                                : "#fff",
                            border: `1px solid ${
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.04)"
                                : "rgba(16,24,40,0.06)"
                            }`,
                            "& .MuiOutlinedInput-input": {
                              padding: "12px 14px",
                              height: 44,
                              boxSizing: "border-box",
                            },
                            "&:focus-within": {
                              boxShadow: `0 0 0 6px ${
                                theme.palette.mode === "dark"
                                  ? `${colors.primary[600]}22`
                                  : `${colors.primary[600]}10`
                              }`,
                            },
                          }}
                        />
                      </FormControl>
                    </Box>
                  </Box>

                  {/* Department & Role */}
                  <Box
                    sx={{
                      display: "flex",
                      gap: 2,
                      flexDirection: { xs: "column", md: "row" },
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Label htmlFor="department">Department / Unit</Label>
                      <Box sx={{ mt: 1 }}>
                        <Select
                          id="department"
                          value={userData.department}
                          onChange={handleChange("department")}
                          displayEmpty
                          fullWidth
                          sx={{
                            borderRadius: 2,
                            bgcolor:
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.02)"
                                : "#fff",
                            border: `1px solid ${
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.04)"
                                : "rgba(16,24,40,0.06)"
                            }`,
                            "& .MuiSelect-select": {
                              padding: "12px 14px",
                              height: 44,
                              boxSizing: "border-box",
                            },
                          }}
                        >
                          <MenuItem value="">Select Department</MenuItem>
                          <MenuItem value="Human Resources">
                            Human Resources
                          </MenuItem>
                          <MenuItem value="Finance">Finance</MenuItem>
                          <MenuItem value="IT">IT</MenuItem>
                          <MenuItem value="Operations">Operations</MenuItem>
                        </Select>
                      </Box>
                    </Box>

                    <Box sx={{ flex: 1 }}>
                      <Label htmlFor="role">Role</Label>
                      <Box sx={{ mt: 1 }}>
                        <Select
                          id="role"
                          value={userData.role}
                          onChange={handleChange("role")}
                          displayEmpty
                          fullWidth
                          sx={{
                            borderRadius: 2,
                            bgcolor:
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.02)"
                                : "#fff",
                            border: `1px solid ${
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.04)"
                                : "rgba(16,24,40,0.06)"
                            }`,
                            "& .MuiSelect-select": {
                              padding: "12px 14px",
                              height: 44,
                              boxSizing: "border-box",
                            },
                          }}
                        >
                          <MenuItem value="">Select Role</MenuItem>
                          <MenuItem value="Staff">Staff</MenuItem>
                          <MenuItem value="Supervisor">Supervisor</MenuItem>
                          <MenuItem value="Admin">Admin</MenuItem>
                        </Select>
                      </Box>
                    </Box>
                  </Box>

                  <Typography
                    variant="body2"
                    color="primary"
                    sx={{ fontWeight: 500 }}
                  >
                    A system-generated password will be emailed to you.
                  </Typography>

                  {error && (
                    <Typography variant="body2" color="error">
                      {error}
                    </Typography>
                  )}

                  <Button
                    type="submit"
                    fullWidth
                    disabled={loading}
                    sx={{
                      py: 1.4,
                      fontWeight: "bold",
                      fontSize: "1rem",
                      mt: 1,
                      backgroundColor: colors.primary[500],
                      color:
                        theme.palette.mode === "dark"
                          ? colors.gray[100]
                          : "#fff",
                      "&:hover": {
                        backgroundColor: colors.primary[600],
                        transform: prefersReduced ? "none" : "scale(1.01)",
                      },
                      transition: prefersReduced
                        ? "none"
                        : "transform 180ms ease, box-shadow 180ms ease",
                    }}
                  >
                    {loading ? "Signing up..." : "Sign Up"}
                  </Button>

                  <Typography
                    variant="body2"
                    textAlign="center"
                    sx={{
                      mt: 2,
                      color:
                        theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.75)"
                          : "rgba(17,24,39,0.65)",
                    }}
                  >
                    Already have an account?{" "}
                    <Link
                      to="/login"
                      style={{ color: colors.primary[500], fontWeight: 600 }}
                    >
                      Login
                    </Link>
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Box>
        </Fade>
      </Box>
    </Box>
  );
};

export default Register;
