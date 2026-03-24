// src/components/onboarding/EmptyState.jsx
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileX } from "lucide-react";

export default function EmptyState({
  message = "No onboarding records found",
}) {
  return (
    <Card className="border-dashed border-2 border-gray-300 shadow-none text-center py-12">
      <CardContent className="flex flex-col items-center justify-center space-y-4">
        <FileX className="h-12 w-12 text-gray-400" />
        <p className="text-gray-500">{message}</p>
      </CardContent>
    </Card>
  );
}
