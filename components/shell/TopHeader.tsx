"use client";

import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "./AccountMenu";

interface TopHeaderProps {
  title?: string;
}

export function TopHeader({ title }: TopHeaderProps) {
  return (
    <header className="flex items-center h-12 px-4 border-b border-border bg-background flex-shrink-0 gap-3">
      {title && (
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      )}
      <div className="flex-1" />
      {/* Search — UI only (Phase 30C scope cut; Cmd+K palette is the real entry). */}
      <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-1 border border-border text-muted-foreground text-xs hover:text-foreground hover:bg-surface-2 transition-colors">
        <Search className="w-3.5 h-3.5" />
        <span>Search</span>
        <kbd className="ml-1 text-2xs px-1 py-0.5 rounded bg-surface-2 font-mono">⌘K</kbd>
      </button>
      {/* Notifications — UI only for now. */}
      <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground">
        <Bell className="w-4 h-4" />
      </Button>
      <AccountMenu />
    </header>
  );
}
