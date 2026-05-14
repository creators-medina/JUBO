import { ContentContainer } from "@/components/primitives/ContentContainer";
import { PageHeader } from "@/components/primitives/PageHeader";
import { MetricCard } from "@/components/primitives/MetricCard";
import { Activity, Target, TrendingUp, Zap } from "lucide-react";

export default function DashboardPage() {
  return (
    <ContentContainer>
      <PageHeader
        title="Dashboard"
        description="Your command center overview"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Active Items"
          value="—"
          icon={Activity}
        />
        <MetricCard
          label="Goals"
          value="—"
          icon={Target}
        />
        <MetricCard
          label="Actions Today"
          value="—"
          icon={Zap}
        />
        <MetricCard
          label="Forecast"
          value="—"
          icon={TrendingUp}
        />
      </div>
    </ContentContainer>
  );
}
