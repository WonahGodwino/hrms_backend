import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "@/components/ui-mui/button";
import Card from "@/components/ui-mui/card";
import { useAuth } from "@/lib/context/AuthContext";
import { completeRegistration as apiCompleteRegistration } from "@/services/AuthService";
import {
  Box,
  Typography,
  useTheme,
  useMediaQuery,
  OutlinedInput,
  InputLabel,
  FormControl,
  InputAdornment,
  IconButton,
  CircularProgress,
  Fade,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { tokens } from "../../theme";

const CompleteRegistration = () => {
  // auth + UI state (logic preserved)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [urlValid, setUrlValid] = useState(false);

  const navigate = useNavigate();
  const { login: contextLogin } = useAuth();
  const [searchParams] = useSearchParams();

  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const isSmall = useMediaQuery(theme.breakpoints.down("md"));
  const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Compute right panel background (darker than left)
  const rightBg =
    theme.palette.mode === "dark"
      ? colors.background.dark
      : colors.primary[100];

  useEffect(() => {
    const urlStaffId =
      searchParams.get("staffid") || searchParams.get("staffId");
    const urlEmail = searchParams.get("email");

    if (!urlStaffId || !urlEmail) {
      setUrlValid(false);
      return;
    }

    setUrlValid(true);
    setEmail(urlEmail);
  }, [searchParams]);

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const urlStaffId =
        searchParams.get("staffid") || searchParams.get("staffId");
      const urlEmail = searchParams.get("email");

      if (!urlStaffId || !urlEmail) {
        throw new Error(
          "Invalid registration link. Please use the complete registration link sent to your email.",
        );
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      const response = await apiCompleteRegistration({
        // email,
        email: urlEmail, // Use email from URL
        password,
        staffId: urlStaffId,
        // staffId: 'S002',
      });

      const data = response?.data?.data;

      const accessToken = data?.token;
      const user = data?.user;

      if (!accessToken) throw new Error("Token not returned from server");
      if (!user) throw new Error("User object missing in response");

      // LOGIN
      contextLogin(user, accessToken);

      // ROUTING BASED ON ROLE (Simplified to Unified Dashboard)
      // Regardless of role, we now use the unified overview.
      // Removed unused role variable
      let destination = "/dashboard";

      // Optional: If you strictly need supervisor separation later,
      // you can add it back here, but per plan everything is unified.
      // if (['supervisor', 'manager'].includes(role)) {
      // 	destination = '/supervisor/dashboard';
      // }

      navigate(destination);
    } catch (err) {
      console.error("Complete registration error:", err);
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to complete registration.",
      );
    } finally {
      setLoading(false);
    }
  };

  // password visibility
  const handleClickShowPassword = () => setShowPassword((s) => !s);
  const handleClickShowConfirmPassword = () =>
    setShowConfirmPassword((s) => !s);
  const handleMouseDownPassword = (e) => e.preventDefault();

  return (
    <Box
      component="main"
      sx={{
        maxHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: { xs: "column", lg: "row" },
        // page background uses the theme background
        backgroundColor:
          theme.palette.mode === "dark"
            ? colors.background.dark
            : colors.background.light,
        overflowX: "hidden",
      }}
    >
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
          background: `linear-gradient(135deg, ${colors.primary[700]} 0%, ${colors.primary[800]} 80%)`,
          color: colors.gray[100],
        }}
      >
        <Box sx={{ maxWidth: 460 }}>
          <Box sx={{ position: "relative", mb: 4 }}>
            <Typography variant="h5" fontWeight={700} sx={{ color: "inherit" }}>
              Isurf<span style={{ opacity: 0.9 }}>HR</span>
            </Typography>
          </Box>

          <Typography
            variant="h3"
            fontWeight={800}
            gutterBottom
            sx={{ lineHeight: 1.2 }}
          >
            Finish setting up
            <br />
            Your account
          </Typography>

          <Typography variant="body1" sx={{ opacity: 0.9, mt: 1 }}>
            Finalize your details with us to fully unlock your seamless HR
            management experience.{" "}
          </Typography>
        </Box>
      </Box>

      <Box
        component="section"
        aria-label="Login form"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // flexBasis: { xs: "100%", lg: "50%" },
          flexShrink: 0,
          boxSizing: "border-box",
          p: { xs: 4, sm: 6, lg: 8 },
          // right panel background is intentionally darker than left panel
          bgcolor: rightBg,
        }}
      >
        <Fade in timeout={prefersReduced ? 0 : 300}>
          <Box sx={{ width: "100%", maxWidth: 420 }}>
            {/* Card container: same color as right panel but elevated via boxShadow */}
            <Card
              sx={{
                width: isSmall ? "100%" : "150%",
                borderRadius: 3,
                // same background as right panel (so card visually matches),
                // but with elevated shadow to separate it
                bgcolor: rightBg,
                border:
                  theme.palette.mode === "dark"
                    ? `1px solid rgba(255,255,255,0.03)`
                    : `1px solid rgba(0,0,0,0.04)`,
                boxShadow:
                  "0 8px 30px rgba(2,6,23,0.45), 0 2px 6px rgba(2,6,23,0.25)", // stronger elevation
              }}
            >
              <Box
                sx={{
                  p: { xs: 6, sm: 8 },
                  // remove the default focus outline for autofill while keeping normal focus styles
                  // also set transitions for nice micro-interactions (respect reduce-motion)
                  transition: prefersReduced ? "none" : "all 180ms ease",
                  // apply autofill overrides here to catch browser autofill on input descendants
                  "& input:-webkit-autofill, & input:-webkit-autofill:focus, & input:-webkit-autofill:hover":
                    {
                      WebkitBoxShadow: `0 0 0px 1000px ${rightBg} inset !important`,
                      boxShadow: `0 0 0px 1000px ${rightBg} inset !important`,
                      backgroundClip: "padding-box",
                      // avoid visible caret color issues
                      WebkitTextFillColor:
                        theme.palette.mode === "dark"
                          ? colors.gray[100]
                          : colors.gray[900],
                      transition: "background-color 5000s ease-in-out 0s",
                    },
                }}
              >
                {/* Mobile logo (visible on small only) */}
                <Box
                  sx={{
                    display: { xs: "block", lg: "none" },
                    textAlign: "center",
                    mb: 3,
                  }}
                >
                  <Box
                    component="svg"
                    viewBox="0 0 24 24"
                    sx={{
                      height: 48,
                      width: 48,
                      mx: "auto",
                      color: colors.primary[500],
                    }}
                    aria-hidden
                  >
                    <path
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3V7a3 3 0 013-3h5a3 3 0 013 3v1"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </Box>
                </Box>

                {/* Headline + subcopy */}
                {urlValid && (
                  <Box textAlign="center" mb={4}>
                    <Typography variant="h3" fontWeight={700} sx={{ mb: 1 }}>
                      Complete registration
                    </Typography>
                    <Typography
                      variant="body2"
                      color={
                        theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.75)"
                          : "rgba(17,24,39,0.6)"
                      }
                    >
                      Enter your credentials below
                    </Typography>
                  </Box>
                )}

                {/* Form */}
                <Box
                  component="form"
                  onSubmit={handleCompleteRegistration}
                  noValidate
                  sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
                >
                  {urlValid && (
                    <>
                      {/* Email field (replaced: use OutlinedInput to match Password styling) */}
                      <Box>
                        <InputLabel
                          htmlFor="email"
                          sx={{ fontSize: 13, fontWeight: 600 }}
                        >
                          Email
                        </InputLabel>
                        <FormControl fullWidth sx={{ mt: 1 }}>
                          <OutlinedInput
                            id="email"
                            name="email"
                            type="email"
                            placeholder="Email address"
                            autoComplete="email"
                            required
                            disabled
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            aria-invalid={Boolean(error)}
                            sx={{
                              borderRadius: 2,
                              bgcolor:
                                theme.palette.mode === "dark"
                                  ? "rgba(255,255,255,0.02)"
                                  : "#fff",
                              border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(16,24,40,0.06)"}`,
                              // remove outline like password and normalize inner input sizing
                              "& .MuiOutlinedInput-notchedOutline": {
                                border: "none",
                              },
                              "& .MuiOutlinedInput-input": {
                                padding: "12px 14px",
                                height: 44,
                                boxSizing: "border-box",
                                outline: "none",
                              },
                              "&:focus-within": {
                                boxShadow: `0 0 0 6px ${theme.palette.mode === "dark" ? `${colors.primary[600]}22` : `${colors.primary[600]}10`}`,
                              },
                              // autofill override to match the rightBg, preventing the yellow highlight / outline mismatch
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

                      {/* Password field (fixed: adornment & icon share same background/height as the input) */}
                      <Box>
                        <InputLabel
                          htmlFor="password"
                          sx={{ fontSize: 13, fontWeight: 600 }}
                        >
                          Password
                        </InputLabel>

                        <FormControl fullWidth sx={{ mt: 1 }}>
                          <OutlinedInput
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            aria-invalid={Boolean(error)}
                            endAdornment={
                              <InputAdornment
                                position="end"
                                sx={{
                                  height: "100%",
                                  alignItems: "center",
                                  display: "flex",
                                  // bgcolor: "transparent",
                                  pr: 0,
                                }}
                              >
                                <IconButton
                                  aria-label={
                                    showPassword
                                      ? "Hide password"
                                      : "Show password"
                                  }
                                  onClick={handleClickShowPassword}
                                  onMouseDown={handleMouseDownPassword}
                                  edge="end"
                                  size="large"
                                  sx={{
                                    // make icon button visually flat and match the input surface
                                    // bgcolor: "transparent",
                                    color:
                                      theme.palette.mode === "dark"
                                        ? "rgba(255,255,255,0.85)"
                                        : "rgba(15,23,42,0.7)",
                                    // reduce extra spacing that causes a different-looking box
                                    padding: "8px",
                                    margin: 0,
                                    borderRadius: 1,
                                    // ensure the clickable area matches input height visually
                                    height: "40px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    // subtle hover (keeps same bg but slightly darker icon)
                                    "&:hover": {
                                      bgcolor: "transparent",
                                      color:
                                        theme.palette.mode === "dark"
                                          ? "rgba(255,255,255,0.92)"
                                          : "rgba(15,23,42,0.9)",
                                    },
                                  }}
                                >
                                  {showPassword ? (
                                    <VisibilityOff />
                                  ) : (
                                    <Visibility />
                                  )}
                                </IconButton>
                              </InputAdornment>
                            }
                            sx={{
                              // input root surface
                              borderRadius: 2,
                              bgcolor:
                                theme.palette.mode === "dark"
                                  ? "rgba(255,255,255,0.02)"
                                  : "#fff",
                              border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(16,24,40,0.06)"}`,
                              // remove default MUI outline since we use custom focus ring
                              "& .MuiOutlinedInput-notchedOutline": {
                                border: "none",
                              },
                              // make the inner input area match height/padding so adornment lines up
                              "& .MuiOutlinedInput-input": {
                                padding: "10px 12px 10px 14px",
                                minHeight: 40,
                                boxSizing: "border-box",
                                color:
                                  theme.palette.mode === "dark"
                                    ? colors.gray[100]
                                    : colors.gray[900],
                              },
                              // make adornment container inherit the same surface so it looks continuous
                              "& .MuiInputAdornment-root": {
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                // match input bg so the area behind the icon is identical
                                backgroundColor:
                                  theme.palette.mode === "dark"
                                    ? "rgba(255,255,255,0.02)"
                                    : "#fff",
                                // remove any border or separation
                                borderLeft: "none",
                                boxSizing: "border-box",
                              },
                              // focus styling (whole control)
                              "&:focus-within": {
                                boxShadow: `0 0 0 6px ${theme.palette.mode === "dark" ? `${colors.primary[600]}22` : `${colors.primary[600]}10`}`,
                              },
                              // autofill override
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

                      <Box>
                        <InputLabel
                          htmlFor="password"
                          sx={{ fontSize: 13, fontWeight: 600 }}
                        >
                          Confirm Password
                        </InputLabel>

                        <FormControl fullWidth sx={{ mt: 1 }}>
                          <OutlinedInput
                            id="confirmPassword"
                            name="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm Password"
                            autoComplete="off"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            aria-invalid={Boolean(error)}
                            endAdornment={
                              <InputAdornment
                                position="end"
                                sx={{
                                  height: "100%",
                                  alignItems: "center",
                                  display: "flex",
                                  // bgcolor: "transparent",
                                  pr: 0,
                                }}
                              >
                                <IconButton
                                  aria-label={
                                    showConfirmPassword
                                      ? "Hide password"
                                      : "Show password"
                                  }
                                  onClick={handleClickShowConfirmPassword}
                                  onMouseDown={handleMouseDownPassword}
                                  edge="end"
                                  size="large"
                                  sx={{
                                    // make icon button visually flat and match the input surface
                                    // bgcolor: "transparent",
                                    color:
                                      theme.palette.mode === "dark"
                                        ? "rgba(255,255,255,0.85)"
                                        : "rgba(15,23,42,0.7)",
                                    // reduce extra spacing that causes a different-looking box
                                    padding: "8px",
                                    margin: 0,
                                    borderRadius: 1,
                                    // ensure the clickable area matches input height visually
                                    height: "40px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    // subtle hover (keeps same bg but slightly darker icon)
                                    "&:hover": {
                                      bgcolor: "transparent",
                                      color:
                                        theme.palette.mode === "dark"
                                          ? "rgba(255,255,255,0.92)"
                                          : "rgba(15,23,42,0.9)",
                                    },
                                  }}
                                >
                                  {showConfirmPassword ? (
                                    <VisibilityOff />
                                  ) : (
                                    <Visibility />
                                  )}
                                </IconButton>
                              </InputAdornment>
                            }
                            sx={{
                              // input root surface
                              borderRadius: 2,
                              bgcolor:
                                theme.palette.mode === "dark"
                                  ? "rgba(255,255,255,0.02)"
                                  : "#fff",
                              border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(16,24,40,0.06)"}`,
                              // remove default MUI outline since we use custom focus ring
                              "& .MuiOutlinedInput-notchedOutline": {
                                border: "none",
                              },
                              // make the inner input area match height/padding so adornment lines up
                              "& .MuiOutlinedInput-input": {
                                padding: "10px 12px 10px 14px",
                                minHeight: 40,
                                boxSizing: "border-box",
                                color:
                                  theme.palette.mode === "dark"
                                    ? colors.gray[100]
                                    : colors.gray[900],
                              },
                              // make adornment container inherit the same surface so it looks continuous
                              "& .MuiInputAdornment-root": {
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                // match input bg so the area behind the icon is identical
                                backgroundColor:
                                  theme.palette.mode === "dark"
                                    ? "rgba(255,255,255,0.02)"
                                    : "#fff",
                                // remove any border or separation
                                borderLeft: "none",
                                boxSizing: "border-box",
                              },
                              // focus styling (whole control)
                              "&:focus-within": {
                                boxShadow: `0 0 0 6px ${theme.palette.mode === "dark" ? `${colors.primary[600]}22` : `${colors.primary[600]}10`}`,
                              },
                              // autofill override
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

                      {/* Error message */}
                      {error && (
                        <Typography
                          role="alert"
                          aria-live="assertive"
                          color="error"
                          variant="body2"
                          sx={{ mt: 0 }}
                        >
                          {error}
                        </Typography>
                      )}

                      {/* Submit */}
                      <Box>
                        <Button
                          type="submit"
                          fullWidth
                          disabled={loading}
                          sx={{
                            mt: 1,
                            py: 1.25,
                            borderRadius: 2,
                            fontWeight: 700,
                            textTransform: "none",
                            backgroundColor: colors.primary[500],
                            color:
                              theme.palette.mode === "dark"
                                ? colors.gray[100]
                                : "#fff",
                            "&:hover": {
                              transform: "scale(1.02)",
                              backgroundColor: colors.primary[600],
                            },
                            transition: prefersReduced
                              ? "none"
                              : "transform 180ms ease, box-shadow 180ms ease",
                            boxShadow: 2,
                          }}
                        >
                          {loading ? (
                            <>
                              <CircularProgress
                                size={18}
                                sx={{ color: colors.gray[100], mr: 1 }}
                              />
                              Finalize registration
                            </>
                          ) : (
                            "Finalize registration"
                          )}
                        </Button>
                      </Box>

                      {/* Sign up CTA */}
                      <Box textAlign="center" sx={{ mt: 3 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            color:
                              theme.palette.mode === "dark"
                                ? "rgba(255,255,255,0.75)"
                                : "rgba(17,24,39,0.65)",
                          }}
                        >
                          Already have an account?{" "}
                          <Link
                            to="/login"
                            style={{
                              color: colors.primary[500],
                              fontWeight: 600,
                            }}
                          >
                            Login
                          </Link>
                        </Typography>
                      </Box>
                    </>
                  )}
                  {!urlValid && (
                    <Box
                      sx={{
                        textAlign: "center",
                        py: 4,
                        px: 2,
                      }}
                    >
                      {/* Error Icon */}
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 64,
                          height: 64,
                          borderRadius: "50%",
                          bgcolor:
                            theme.palette.mode === "dark"
                              ? "rgba(239, 68, 68, 0.1)"
                              : "rgba(239, 68, 68, 0.08)",
                          mb: 3,
                        }}
                      >
                        <Box
                          component="svg"
                          viewBox="0 0 24 24"
                          sx={{
                            width: 32,
                            height: 32,
                            color:
                              theme.palette.mode === "dark"
                                ? "#ef4444"
                                : "#dc2626",
                          }}
                        >
                          <path
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </Box>
                      </Box>

                      {/* Error Title */}
                      <Typography
                        variant="h5"
                        fontWeight={700}
                        sx={{
                          mb: 1.5,
                          color:
                            theme.palette.mode === "dark"
                              ? colors.gray[100]
                              : colors.gray[900],
                        }}
                      >
                        Invalid Registration Link
                      </Typography>

                      {/* Error Message */}
                      <Typography
                        variant="body1"
                        sx={{
                          mb: 3,
                          color:
                            theme.palette.mode === "dark"
                              ? "rgba(255,255,255,0.75)"
                              : "rgba(17,24,39,0.7)",
                          maxWidth: 380,
                          mx: "auto",
                          lineHeight: 1.6,
                        }}
                      >
                        The registration link you're using is invalid. Please
                        check your email for the valid complete registration
                        link sent by your administrator.
                      </Typography>

                      {/* Action Button */}
                      <Button
                        onClick={() => navigate("/login")}
                        fullWidth
                        sx={{
                          py: 1.25,
                          borderRadius: 2,
                          fontWeight: 700,
                          textTransform: "none",
                          backgroundColor: colors.primary[500],
                          color:
                            theme.palette.mode === "dark"
                              ? colors.gray[100]
                              : "#fff",
                          "&:hover": {
                            transform: "scale(1.02)",
                            backgroundColor: colors.primary[600],
                          },
                          transition: prefersReduced
                            ? "none"
                            : "transform 180ms ease",
                          boxShadow: 2,
                        }}
                      >
                        Return to Login
                      </Button>
                    </Box>
                  )}
                </Box>
              </Box>
            </Card>
          </Box>
        </Fade>
      </Box>
    </Box>
  );
};

export default CompleteRegistration;
