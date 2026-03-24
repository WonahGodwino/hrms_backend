// File: src/components/ui-mui/tabs.jsx
import React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";

/**
 * Simple Tabs wrapper supporting controlled/uncontrolled usage.
 * - tabs: [{label, value, content}]
 */
export default function SimpleTabs({
  tabs = [],
  value: controlledValue,
  onChange,
  orientation = "horizontal",
  variant = "scrollable",
  sx = {},
}) {
  const [value, setValue] = React.useState(tabs[0]?.value ?? 0);
  const current = controlledValue !== undefined ? controlledValue : value;

  const handleChange = (e, newVal) => {
    if (controlledValue === undefined) setValue(newVal);
    onChange?.(newVal);
  };

  return (
    <Box sx={{ width: "100%", ...sx }}>
      <Tabs
        value={current}
        onChange={handleChange}
        orientation={orientation}
        variant={variant}
      >
        {tabs.map((t, i) => (
          <Tab key={t.value ?? i} label={t.label} value={t.value ?? i} />
        ))}
      </Tabs>
      <Box sx={{ mt: 2 }}>
        {tabs.map((t, i) => (
          <div
            key={t.value ?? i}
            hidden={(t.value ?? i) !== current}
            role="tabpanel"
          >
            {(t.value ?? i) === current && <Box>{t.content}</Box>}
          </div>
        ))}
      </Box>
    </Box>
  );
}
