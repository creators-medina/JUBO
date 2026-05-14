import { cn } from "@/lib/utils";

interface ContentContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const maxWidthMap = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

export function ContentContainer({
  children,
  className,
  maxWidth = "xl",
}: ContentContainerProps) {
  return (
    <div className={cn("p-6 w-full mx-auto", maxWidthMap[maxWidth], className)}>
      {children}
    </div>
  );
}
