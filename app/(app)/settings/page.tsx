import { ContentContainer } from "@/components/primitives/ContentContainer";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <ContentContainer>
      <PageHeader title="Settings" description="Manage your workspace settings" />
      <EmptyState
        icon={Settings}
        title="Settings coming soon"
        description="Workspace and organization settings will be built in a future phase."
      />
    </ContentContainer>
  );
}
