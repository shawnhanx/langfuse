import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { useMemo } from "react";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";

export const SessionsOverview = ({
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

  // Query to get total traces count for traces per session
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

  // Query to get total tokens
  const tokensCountQuery: QueryType = {
    view: "observations",
    dimensions: [],
    metrics: [{ measure: "totalTokens", aggregation: "sum" }],
    filters: mapLegacyUiTableFilterToView("observations", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Query to get sessions with errors
  const sessionsWithErrorsQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "sessionId" }],
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

  const tokensData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: tokensCountQuery,
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

  const sessionsWithErrorsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: sessionsWithErrorsQuery,
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

  // Get sessions count (unique sessionIds, excluding null/empty)
  const sessionsCount = useMemo(() => {
    const data = sessionsData.data ?? [];
    // Filter out null or empty sessionIds before counting
    return data.filter((item: any) => {
      const sessionId = item.sessionId;
      return sessionId !== null && sessionId !== undefined && sessionId !== "";
    }).length;
  }, [sessionsData.data]);

  // Get total tokens
  const totalTokens = useMemo(() => {
    const data = tokensData.data ?? [];
    if (data.length > 0) {
      return data[0].sum_totalTokens as number;
    }
    return 0;
  }, [tokensData.data]);

  // Get sessions with errors count
  const sessionsWithErrorsCount = useMemo(() => {
    const data = sessionsWithErrorsData.data ?? [];
    // Filter out null or empty sessionIds before counting
    return data.filter((item: any) => {
      const sessionId = item.sessionId;
      return sessionId !== null && sessionId !== undefined && sessionId !== "";
    }).length;
  }, [sessionsWithErrorsData.data]);

  // Calculate average traces per session
  const avgTracesPerSession = useMemo(() => {
    const totalTraces = Number(tracesData.data?.[0]?.count_count ?? 0);
    if (sessionsCount === 0) return 0;
    return totalTraces / sessionsCount;
  }, [tracesData.data, sessionsCount]);

  const isDataLoading =
    isLoading ||
    sessionsData.isPending ||
    tracesData.isPending ||
    tokensData.isPending ||
    sessionsWithErrorsData.isPending;

  return (
    <DashboardCard
      className={className}
      title="Sessions Overview"
      description={null}
      isLoading={isDataLoading}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Sessions */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Sessions</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : sessionsCount.toLocaleString()}
          </div>
        </div>

        {/* Avg Traces per Session */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">
            Avg Traces per Session
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : avgTracesPerSession.toFixed(1)}
          </div>
        </div>

        {/* Total Tokens */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Tokens</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : totalTokens.toLocaleString()}
          </div>
        </div>

        {/* Sessions with Errors */}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">
            Sessions with Errors
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {isDataLoading ? "-" : sessionsWithErrorsCount.toLocaleString()}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
};
