"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { WorkspaceTabsProvider } from "@/features/workspace/providers/WorkspaceTabsProvider";
import { WorkspaceTabsBar } from "@/features/workspace/components/WorkspaceTabsBar";
import { WorkspacePanel } from "@/features/workspace/components/WorkspacePanel";
import { CommandPaletteProvider } from "@/features/command/providers/CommandPaletteProvider";
import { CommandPalette } from "@/features/command/components/CommandPalette";
import { ToastProvider } from "@/features/feedback/ToastProvider";
import { AnalyticsProvider } from "@/features/analytics/AnalyticsProvider";

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function AppShell({ children, pageTitle }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ToastProvider>
      <CommandPaletteProvider>
        <WorkspaceTabsProvider>
          <AnalyticsProvider>
          {/* w-full (not w-screen): 100vw includes the scrollbar gutter on
              classic-scrollbar systems, which clips ~15px off the right edge. */}
          <div className="flex h-screen w-full overflow-hidden bg-background">
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <TopHeader title={pageTitle} />
              <WorkspaceTabsBar />
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
            <WorkspacePanel />
            <CommandPalette />
          </div>
          </AnalyticsProvider>
        </WorkspaceTabsProvider>
      </CommandPaletteProvider>
    </ToastProvider>
  );
}
