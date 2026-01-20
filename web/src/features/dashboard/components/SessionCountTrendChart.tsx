import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { useMemo } from "react";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const SessionCountTrendChart = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  agg = "last7Days",
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg?: string;
  isLoading?: boolean;
}) => {
  // Query to get session count per time period
  const sessionCountTrendQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "sessionId" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: { granularity: "day" },
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const sessionCountTrendData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: sessionCountTrendQuery,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  // Process data: group by time_dimension and count unique sessionIds
  const chartData = useMemo(() => {
    const rawData = sessionCountTrendData.data ?? [];

    // Group by time_dimension
    const groupedByTime = rawData.reduce(
      (acc: Record<string, Set<string>>, item: any) => {
        const timeDim = item.time_dimension;
        if (!timeDim) return acc;

        if (!acc[timeDim]) {
          acc[timeDim] = new Set<string>();
        }

        // Add sessionId to set (exclude null/empty)
        const sessionId = item.sessionId;
        if (sessionId && sessionId !== null && sessionId !== "") {
          acc[timeDim].add(sessionId);
        }

        return acc;
      },
      {} as Record<string, Set<string>>,
    );

    // Convert to chart data format
    return Object.entries(groupedByTime)
      .map(([timeDim, sessionSet]) => ({
        time: timeDim,
        count: sessionSet.size,
      }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [sessionCountTrendData.data]);

  const isDataLoading = isLoading || sessionCountTrendData.isPending;

  return (
    <DashboardCard
      className={className}
      title="Session Count Trend"
      description="Unique sessions over time"
      isLoading={isDataLoading}
    >
      <div className="h-[300px] w-full">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data available
          </div>
        )}
      </div>
    </DashboardCard>
  );
};
