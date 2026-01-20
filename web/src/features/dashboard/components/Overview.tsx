import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { useState, useMemo } from "react";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";

export const Overview = ({
  className,
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  isLoading = false,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  isLoading?: boolean;
}) => {
  // Query to get agent count (traces with -agent tags)
  const agentCountQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "tags" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Query to get total sessions count (unique sessionIds)
  const sessionsCountQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "sessionId" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Query to get total traces count
  const tracesCountQuery: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Query to get error observations count
  const errorsCountQuery: QueryType = {
    view: "observations",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [
      ...mapLegacyUiTableFilterToView("observations", globalFilterState),
      {
        column: "level",
        operator: "=",
        value: "ERROR",
        type: "string",
      },
    ],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Query to get total observations count for error rate calculation
  const totalObservationsQuery: QueryType = {
    view: "observations",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("observations", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const agentTagsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: agentCountQuery,
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

  const sessionsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: sessionsCountQuery,
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

  const tracesData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: tracesCountQuery,
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

  const errorsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: errorsCountQuery,
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

  const totalObservationsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: totalObservationsQuery,
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

  // Calculate unique agent tags
  const agentCount = useMemo(() => {
    const data = agentTagsData.data ?? [];
    const agentSet = new Set<string>();

    data.forEach((item: any) => {
      const tags = item.tags as string[] | null;
      if (tags && Array.isArray(tags)) {
        tags.forEach((tag) => {
          if (tag.includes("-agent")) {
            agentSet.add(tag);
          }
        });
      }
    });

    return agentSet.size;
  }, [agentTagsData.data]);

  // Get sessions count (unique sessionIds, excluding null/empty)
  const sessionsCount = useMemo(() => {
    const data = sessionsData.data ?? [];
    // Filter out null or empty sessionIds before counting
    return data.filter((item: any) => {
      const sessionId = item.sessionId;
      return sessionId !== null && sessionId !== undefined && sessionId !== "";
    }).length;
  }, [sessionsData.data]);

  // Get traces count
  const tracesCount = useMemo(() => {
    const data = tracesData.data ?? [];
    if (data.length > 0) {
      return data[0].count_count as number;
    }
    return 0;
  }, [tracesData.data]);

  // Calculate error rate (observation level)
  const errorRate = useMemo(() => {
    const errors = errorsData.data ?? [];
    const total = totalObservationsData.data ?? [];

    const errorCount =
      errors.length > 0 ? (errors[0].count_count as number) : 0;
    const totalCount = total.length > 0 ? (total[0].count_count as number) : 0;

    if (totalCount === 0) return 0;
    return (errorCount / totalCount) * 100;
  }, [errorsData.data, totalObservationsData.data]);

  const isDataLoading =
    isLoading ||
    agentTagsData.isPending ||
    sessionsData.isPending ||
    tracesData.isPending ||
    errorsData.isPending ||
    totalObservationsData.isPending;

  return (
    <DashboardCard
      className={className}
      title="Overview"
      description={null}
      isLoading={isDataLoading}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* Agent Count */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Agents</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : agentCount}
          </div>
        </div>

        {/* Sessions Count */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Sessions</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : sessionsCount.toLocaleString()}
          </div>
        </div>

        {/* Traces Count */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Traces</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : tracesCount.toLocaleString()}
          </div>
        </div>

        {/* Error Rate */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Error Rate</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : `${errorRate.toFixed(2)}%`}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
};
