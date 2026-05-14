import { ContentContainer } from "@/components/primitives/ContentContainer";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import { TrendingUp } from "lucide-react";

export default function ForecastsPage() {
  return (
    <ContentContainer>
      <PageHeader title="Forecasts" description="Pipeline and revenue forecasting" />
      <EmptyState
        icon={TrendingUp}
        title="No forecast data"
        description="The forecasting engine will be built in a future phase."
      />
    </ContentContainer>
  );
}
