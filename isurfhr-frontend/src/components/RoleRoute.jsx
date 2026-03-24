// src/components/RoleRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
// Adjusted import path to relative to fix resolution error
import { useAuth } from "../lib/context/AuthContext";

/**
 * RoleRoute: protects children by role(s).
 * - allowedRoles: array of roles (strings) that may access the route
 * - superadmin override: user.role === "SUPER_ADMIN" => allowed
 *
 * If allowedRoles is empty, any authenticated user is allowed.
 */
const RoleRoute = ({ children, allowedRoles = [] }) => {
  const { user, isAuthenticated, initializing } = useAuth();

  // While we are restoring auth from storage, don't redirect — show a loader
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  // Not authenticated -> go to login
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Normalized Role
  const role = (user?.role || "").toString();

  // SUPER_ADMIN override
  if (role === "SUPER_ADMIN") return children;

  // if no roles specified, allow any authenticated user
  if (!allowedRoles || allowedRoles.length === 0) return children;

  // Check strict equality
  if (allowedRoles.includes(role)) return children;

  // Fallback: redirect to their dashboard (safe landing)
  // Simplified redirects based on new flattened routes
  const redirectMap = {
    ADMIN: "/dashboard",
    HR: "/dashboard",
    STAFF: "/dashboard",
    SUPER_ADMIN: "/super-dashboard",
  };

  const redirectTo = redirectMap[role] || "/login";
  return <Navigate to={redirectTo} replace />;
};

export default RoleRoute;
