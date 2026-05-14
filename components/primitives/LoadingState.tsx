import { cn } from "@/lib/utils";

interface LoadingStateProps {
  className?: string;
  rows?: number;
}

export function LoadingState({ className, rows = 3 }: LoadingStateProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-lg bg-surface-1 animate-pulse"
          style={{ opacity: 1 - i * 0.2 }}
        />
      ))}
    </div>
  );
}
