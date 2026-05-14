import { ContentContainer } from "@/components/primitives/ContentContainer";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Plug } from "lucide-react";

export default function IntegrationsPage() {
  return (
    <ContentContainer>
      <PageHeader title="Integrations" description="Connect your tools and data sources" />
      <EmptyState
        icon={Plug}
        title="No integrations connected"
        description="Integration connectors will be available in a future phase."
      />
    </ContentContainer>
  );
}
