import { ContentContainer } from "@/components/primitives/ContentContainer";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Columns3 } from "lucide-react";

export default function BoardsPage() {
  return (
    <ContentContainer>
      <PageHeader title="Boards" description="Dynamic boards for your workflow" />
      <EmptyState
        icon={Columns3}
        title="No boards yet"
        description="Boards will be configurable dynamically in a future phase."
      />
    </ContentContainer>
  );
}
