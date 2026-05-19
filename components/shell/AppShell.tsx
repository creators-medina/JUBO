"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { WorkspaceTabsProvider } from "@/features/workspace/providers/WorkspaceTabsProvider";
import { WorkspaceTabsBar } from "@/features/workspace/components/WorkspaceTabsBar";
import { WorkspacePanel } from "@/features/workspace/components/WorkspacePanel";

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function AppShell({ children, pageTitle }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <WorkspaceTabsProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopHeader title={pageTitle} />
          <WorkspaceTabsBar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <WorkspacePanel />
      </div>
    </WorkspaceTabsProvider>
  );
}
