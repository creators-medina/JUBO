import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
  };
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg bg-card border border-border hover:border-border/80 hover:bg-surface-2 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">{value}</p>
          {trend && (
            <p
              className={cn(
                "text-xs mt-1 font-medium",
                trend.direction === "up" ? "text-emerald-400" : "",
                trend.direction === "down" ? "text-red-400" : "",
                trend.direction === "neutral" ? "text-muted-foreground" : ""
              )}
            >
              {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "–"}{" "}
              {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
