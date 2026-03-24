import React from "react";

/**
 * A shared component that generates a time-aware, personalized greeting.
 * @param {Object} props - The component props.
 * @param {Object} props.user - The currently authenticated user object.
 */
const DynamicGreeting = ({ user }) => {
  const hour = new Date().getHours();

  // Determine time of day and appropriate emoji
  const timeOfDay = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const icon = hour < 12 ? "☀️" : hour < 18 ? "🌤️" : "🌙";

  // Fallback cascade for user name
  const name = user?.name || user?.firstName || "Admin";

  return (
    <React.Fragment>
      Good {timeOfDay}, {name} {icon}
    </React.Fragment>
  );
};

export default DynamicGreeting;
