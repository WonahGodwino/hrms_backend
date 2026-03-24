import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Copy, Printer, Download } from "lucide-react";

/**
 * TableOptionsDropdown
 *
 * props:
 * - onCopy()
 * - onPrint()
 * - onExport(format)   // format: 'csv'|'excel'|'pdf'
 */
const TableOptions = ({
  onCopy = () => {},
  onPrint = () => {},
  onExport = (f) => {},
  className = "",
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={`h-9 ${className}`}>
          Options
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="start" className="w-48">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onPrint();
          }}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Export submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download className="mr-2 h-4 w-4" />
            Export
          </DropdownMenuSubTrigger>

          <DropdownMenuSubContent side="right" className="w-44">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onExport("csv");
              }}
            >
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onExport("excel");
              }}
            >
              Excel
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onExport("pdf");
              }}
            >
              PDF
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TableOptions;
