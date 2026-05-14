import { ContentContainer } from "@/components/primitives/ContentContainer";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Zap } from "lucide-react";

export default function ActionsPage() {
  return (
    <ContentContainer>
      <PageHeader title="Daily Actions" description="Your daily action checklist" />
      <EmptyState
        icon={Zap}
        title="No actions configured"
        description="The daily actions engine will be built in a future phase."
      />
    </ContentContainer>
  );
}
