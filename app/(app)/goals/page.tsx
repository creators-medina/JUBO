import { ContentContainer } from "@/components/primitives/ContentContainer";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Target } from "lucide-react";

export default function GoalsPage() {
  return (
    <ContentContainer>
      <PageHeader title="Goals" description="Track and manage your team goals" />
      <EmptyState
        icon={Target}
        title="No goals configured"
        description="The goals engine will be built in a future phase."
      />
    </ContentContainer>
  );
}
