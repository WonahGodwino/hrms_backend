export const isExecutorEnabled = (): boolean =>
  process.env.AUTOMATION_EXECUTOR_ENABLED === "true";

export const EXECUTOR_NOTICE =
  "Rules are saved and can be tested, but nothing fires them automatically yet.";

export const EXECUTOR_ENABLED_MESSAGE =
  "Rules run automatically when events happen. Scheduled checks (overdue reviews, deadlines, KPI) run while the system is in use, or on demand with Run checks now.";
