import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState, useMemo } from "react";
import { useRouter } from "next/router";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";

export const AgentStats = ({
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
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle agent name click - navigate to agents page with filter
  const handleAgentClick = (agentName: string) => {
    // Build filter query parameter: tags;arrayOptions;;any of;{agent-name}
    // Format: column;type;key;operator;value
    // For arrayOptions with single value: tags;arrayOptions;;any of;auto-agent
    // router.push will automatically encode the query parameter
    const filterParam = `tags;arrayOptions;;any of;${agentName}`;

    router.push({
      pathname: `/project/${projectId}/agents`,
      query: { filter: filterParam },
    });
  };

  // Query to get traces grouped by tags for counting traces
  const agentTagsQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "tags" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Query to get traces grouped by sessionId and tags for counting sessions
  const agentSessionsQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "tags" }, { field: "sessionId" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  // Query to get error observations grouped by trace tags
  const agentErrorsQuery: QueryType = {
    view: "observations",
    dimensions: [{ field: "tags" }],
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

  const agentTagsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: agentTagsQuery,
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

  const agentSessionsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: agentSessionsQuery,
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

  const agentErrorsData = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: agentErrorsQuery,
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

  // Extract unique agent tags and count traces per agent
  const agentData = useMemo(() => {
    const data = agentTagsData.data ?? [];
    const agentMap = new Map<string, number>();

    data.forEach((item: any) => {
      const tags = item.tags as string[] | null;
      if (tags && Array.isArray(tags)) {
        tags.forEach((tag) => {
          // Check if tag contains "-agent" pattern
          if (tag.includes("-agent")) {
            const currentCount = agentMap.get(tag) || 0;
            agentMap.set(tag, currentCount + Number(item.count_count));
          }
        });
      }
    });

    // Convert map to array and sort by count
    return Array.from(agentMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [agentTagsData.data]);

  // Count unique sessions per agent
  const agentSessionsMap = useMemo(() => {
    const data = agentSessionsData.data ?? [];
    const agentSessionMap = new Map<string, Set<string>>();

    data.forEach((item: any) => {
      const tags = item.tags as string[] | null;
      const sessionId = item.sessionId as string | null;

      if (tags && Array.isArray(tags) && sessionId) {
        tags.forEach((tag) => {
          // Check if tag contains "-agent" pattern
          if (tag.includes("-agent")) {
            if (!agentSessionMap.has(tag)) {
              agentSessionMap.set(tag, new Set());
            }
            agentSessionMap.get(tag)!.add(sessionId);
          }
        });
      }
    });

    // Convert Sets to counts
    const countMap = new Map<string, number>();
    agentSessionMap.forEach((sessions, agent) => {
      countMap.set(agent, sessions.size);
    });

    return countMap;
  }, [agentSessionsData.data]);

  // Count errors per agent
  const agentErrorsMap = useMemo(() => {
    const data = agentErrorsData.data ?? [];
    const agentErrorMap = new Map<string, number>();

    data.forEach((item: any) => {
      const tags = item.tags as string[] | null;

      if (tags && Array.isArray(tags)) {
        tags.forEach((tag) => {
          // Check if tag contains "-agent" pattern
          if (tag.includes("-agent")) {
            const currentCount = agentErrorMap.get(tag) || 0;
            agentErrorMap.set(tag, currentCount + Number(item.count_count));
          }
        });
      }
    });

    return agentErrorMap;
  }, [agentErrorsData.data]);

  // Combine traces, sessions, and errors data
  const combinedData = useMemo(() => {
    return agentData.map((agent) => ({
      name: agent.name,
      traces: agent.value,
      sessions: agentSessionsMap.get(agent.name) || 0,
      errors: agentErrorsMap.get(agent.name) || 0,
    }));
  }, [agentData, agentSessionsMap, agentErrorsMap]);

  const totalAgents = agentData.length;

  const maxNumberOfEntries = { collapsed: 5, expanded: 20 };

  const adjustedData = isExpanded
    ? combinedData.slice(0, maxNumberOfEntries.expanded)
    : combinedData.slice(0, maxNumberOfEntries.collapsed);

  return (
    <DashboardCard
      className={className}
      title={"Agents"}
      description={null}
      isLoading={
        isLoading ||
        agentTagsData.isPending ||
        agentSessionsData.isPending ||
        agentErrorsData.isPending
      }
    >
      <>
        <TotalMetric
          metric={compactNumberFormatter(totalAgents)}
          description={"Total agents tracked"}
        />
        {adjustedData.length > 0 ? (
          <>
            <div className="mt-6 grid grid-cols-[minmax(0,3fr),auto,auto,auto] gap-4 pr-2">
              <span className="text-xs text-muted-foreground">Name</span>
              <span className="w-16 text-right text-xs text-muted-foreground">
                Sessions
              </span>
              <span className="w-16 text-right text-xs text-muted-foreground">
                Traces
              </span>
              <span className="w-16 text-right text-xs text-muted-foreground">
                Errors
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {adjustedData.map((agent) => (
                <div
                  key={agent.name}
                  className="grid grid-cols-[minmax(0,3fr),auto,auto,auto] items-center gap-4"
                >
                  <button
                    onClick={() => handleAgentClick(agent.name)}
                    className="cursor-pointer truncate text-left text-sm font-medium text-primary hover:underline"
                    title={`Click to view ${agent.name} details`}
                  >
                    {agent.name}
                  </button>
                  <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">
                    {Intl.NumberFormat("en-US").format(agent.sessions)}
                  </span>
                  <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">
                    {Intl.NumberFormat("en-US").format(agent.traces)}
                  </span>
                  <span
                    className={`w-16 text-right text-sm tabular-nums ${
                      agent.errors > 0
                        ? "font-semibold text-red-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {Intl.NumberFormat("en-US").format(agent.errors)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <NoDataOrLoading
            isLoading={
              isLoading ||
              agentTagsData.isPending ||
              agentSessionsData.isPending ||
              agentErrorsData.isPending
            }
            description="Agent statistics will appear here once traces with agent tags are ingested."
            href="https://langfuse.com/docs/get-started"
          />
        )}
        <ExpandListButton
          isExpanded={isExpanded}
          setExpanded={setIsExpanded}
          totalLength={combinedData.length}
          maxLength={maxNumberOfEntries.collapsed}
          expandText={
            combinedData.length > maxNumberOfEntries.expanded
              ? `Show top ${maxNumberOfEntries.expanded}`
              : "Show all"
          }
        />
      </>
    </DashboardCard>
  );
};
