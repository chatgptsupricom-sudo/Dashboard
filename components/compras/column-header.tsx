"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface ColumnHeaderProps {
  label: string;
  tooltip: string;
  className?: string;
}

export function ColumnHeader({ label, tooltip, className }: ColumnHeaderProps) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-gray-400 hover:text-gray-600 cursor-help">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
