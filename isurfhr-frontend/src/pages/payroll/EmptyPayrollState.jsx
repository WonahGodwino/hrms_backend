// src/components/payroll/EmptyPayrollState.jsx
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const EmptyPayrollState = ({ onUpload }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-6">
      <div className="w-full max-w-3xl space-y-8">
        <header className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Payroll Templates
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your payroll templates
          </p>
        </header>

        <Card className="border border-gray-200 dark:border-gray-800">
          <CardContent className="flex flex-col items-center justify-center text-center p-8">
            <div className="mb-6">
              <img
                alt="No templates"
                className="h-40"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDPddYW3RGugmbEezU9tkHvCSYl077hN6FfLhS0SvmM1PS3LfSvCAl9Tz4K1M2wPdLJz5ipigwcouLecvMKQACbNtVOZzpOmJRxnIJKEXzLOuLcNdlNN03Rm694CxdPNISb1MVsGT9MJa71Oc1c7CfWiwJDZY_rKtNLG4CxAyJ4_jkwqUy762M-SW_iEgHC4pj1Ja5aJY5RqKTRCDNpxvS6cu19zNazB8RXSA0RYXzajsu4-M4SjY3xrX5n0cvkrP6DqMA9CVmPpgk"
              />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              No templates yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Upload a template to get started
            </p>

            <Button
              variant="outline"
              className="flex items-center gap-2 text-primary border-primary/30 hover:bg-primary hover:text-white"
              onClick={onUpload}
            >
              <span>Upload Payroll Template</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmptyPayrollState;
