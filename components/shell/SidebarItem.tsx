"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
}

export function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: SidebarItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors group",
        collapsed ? "justify-center" : "",
        active
          ? "bg-sidebar-item-active text-foreground"
          : "text-muted-foreground hover:bg-sidebar-item-hover hover:text-foreground"
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
