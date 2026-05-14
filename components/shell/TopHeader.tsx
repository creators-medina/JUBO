"use client";

import { Bell, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface TopHeaderProps {
  title?: string;
}

export function TopHeader({ title }: TopHeaderProps) {
  const { user } = useAuth();

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "??";

  return (
    <header className="flex items-center h-12 px-4 border-b border-border bg-background flex-shrink-0 gap-3">
      {title && (
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      )}
      <div className="flex-1" />
      <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-1 border border-border text-muted-foreground text-xs hover:text-foreground hover:bg-surface-2 transition-colors">
        <Search className="w-3.5 h-3.5" />
        <span>Search</span>
        <kbd className="ml-1 text-2xs px-1 py-0.5 rounded bg-surface-2 font-mono">⌘K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground">
        <Bell className="w-4 h-4" />
      </Button>
      <Avatar className="w-7 h-7">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
    </header>
  );
}
