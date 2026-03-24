// src/components/onboarding/OnboardingHeader.jsx
import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const OnboardingHeader = ({ employees = [], stages = [] }) => {
  const stats = useMemo(() => {
    const total = employees.length;
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let sumProgress = 0;

    employees.forEach((e) => {
      const p = Number(e.progressPercent ?? 0);
      sumProgress += isNaN(p) ? 0 : p;

      if (
        p >= 100 ||
        (e.currentStage && e.currentStage === "Fully Onboarded")
      ) {
        completed += 1;
      } else if (p > 0) {
        inProgress += 1;
      } else {
        notStarted += 1;
      }
    });

    const avgProgress = total === 0 ? 0 : Math.round(sumProgress / total);
    return { total, completed, inProgress, notStarted, avgProgress };
  }, [employees]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-9 gap-8">
      {/* Title / summary card */}
      <Card className="md:col-span-3 px-2 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Onboarding Progress</h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total hires</p>
              <div className="mt-1">
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs">Average progress</span>
              <span className="text-xs font-medium">{stats.avgProgress}%</span>
            </div>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, stats.avgProgress))}%`,
                  background:
                    "linear-gradient(90deg, rgba(59,130,246,1) 0%, rgba(34,197,94,1) 100%)",
                }}
              />
            </div>
            <div className="flex gap-2 items-center mt-2">
              {stages && stages.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] py-0.5 px-1.5"
                >
                  {stages[0]}
                </Badge>
              )}
              <p className="text-[11px] text-muted-foreground">
                {stats.completed} completed • {stats.inProgress} in progress •{" "}
                {stats.notStarted} not started
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual stat cards */}
      <Card className="md:col-span-2 py-5 px-2 bg-green-50 border-green-200 shadow-md">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">Completed</p>
            <Badge
              variant="outline"
              className="bg-green-100 text-green-700 border-green-200 text-[10px]"
            >
              {stats.total === 0
                ? "0%"
                : `${Math.round(
                    (stats.completed / Math.max(1, stats.total)) * 100
                  )}%`}
            </Badge>
          </div>

          <div className="flex items-center justify-between mt-1">
            <p className="text-xl font-bold text-green-600">
              {stats.completed}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 py-5 px-2 bg-blue-50 border-blue-200 shadow-md">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">In progress</p>
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]"
            >
              Active
            </Badge>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xl font-bold text-blue-600">
              {stats.inProgress}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 py-5 px-2 bg-yellow-50 border-yellow-200 shadow-md">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">Not started</p>
            <Badge
              variant="outline"
              className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]"
            >
              Pending
            </Badge>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xl font-bold text-yellow-600">
              {stats.notStarted}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingHeader;
