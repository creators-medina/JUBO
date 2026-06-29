import { cn } from "@/lib/utils";

interface SidebarSectionProps {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}

export function SidebarSection({
  label,
  collapsed,
  children,
}: SidebarSectionProps) {
  return (
    <div className="space-y-0.5">
      {!collapsed && label && (
        <p className="px-2 py-1 text-xs font-semibold text-jubo-gold-soft/80 uppercase tracking-wider">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}
