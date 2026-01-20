import { useRouter } from "next/router";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import {
  MODEL_WIDGET_PLACEMENTS,
  TRACES_WIDGET_PLACEMENTS,
  SESSIONS_WIDGET_PLACEMENTS,
} from "@/src/features/dashboard/constants/agentWidgets";
import { TracesBarListChart } from "@/src/features/dashboard/components/TracesBarListChart";
import { TracesAndObservationsTimeSeriesChart } from "@/src/features/dashboard/components/TracesTimeSeriesChart";
import { UserChart } from "@/src/features/dashboard/components/UserChart";
import { ModelCostTable } from "@/src/features/dashboard/components/ModelCostTable";
import { ModelUsageChart } from "@/src/features/dashboard/components/ModelUsageChart";
import { GenerationLatencyChart } from "@/src/features/dashboard/components/LatencyChart";
import { LatencyTables } from "@/src/features/dashboard/components/LatencyTables";
import { SessionsOverview } from "@/src/features/dashboard/components/SessionsOverview";
import { SessionCountTrendChart } from "@/src/features/dashboard/components/SessionCountTrendChart";
import { TimeRangePicker } from "@/src/components/date-picker";
import { api } from "@/src/utils/api";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/src/components/ui/tabs";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type FilterState } from "@langfuse/shared";
import { type ColumnDefinition } from "@langfuse/shared";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useMemo, useState, useEffect } from "react";
import {
  findClosestDashboardInterval,
  DASHBOARD_AGGREGATION_OPTIONS,
  toAbsoluteTimeRange,
  type DashboardDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import SetupTracingButton from "@/src/features/setup/components/SetupTracingButton";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import Page from "@/src/components/layouts/page";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  convertSelectedEnvironmentsToFilter,
  useEnvironmentFilter,
} from "@/src/hooks/use-environment-filter";

export default function AgentsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { timeRange, setTimeRange } = useDashboardDateRange();
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  const lookbackLimit = useEntitlementLimit("data-access-days");

  // Tab state management with URL synchronization
  const [activeTab, setActiveTab] = useState<"model" | "traces" | "sessions">(
    "model",
  );

  // Sync tab with URL on mount
  useEffect(() => {
    const tab = router.query.tab as string;
    if (tab === "model" || tab === "traces" || tab === "sessions") {
      setActiveTab(tab);
    }
  }, [router.query.tab]);

  // Handle tab change with URL update
  const handleTabChange = (value: string) => {
    setActiveTab(value as "model" | "traces" | "sessions");
    router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, tab: value },
      },
      undefined,
      { shallow: true },
    );
  };

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "agents",
    projectId,
  );

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: absoluteTimeRange?.from,
      },
      {
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );
  const environmentOptions: string[] =
    environmentFilterOptions.data?.map((value) => value.environment) || [];

  // Add effect to update filter state when environments change
  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);

  const nameOptions =
    traceFilterOptions.data?.name?.map((n) => ({
      value: n.value,
      count: Number(n.count),
    })) || [];
  const tagsOptions = traceFilterOptions.data?.tags || [];

  const filterColumns: ColumnDefinition[] = [
    {
      name: "Trace Name",
      id: "traceName",
      type: "stringOptions",
      options: nameOptions,
      internal: "internalValue",
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      options: tagsOptions,
      internal: "internalValue",
    },
    {
      name: "User",
      id: "user",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Release",
      id: "release",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Version",
      id: "version",
      type: "string",
      internal: "internalValue",
    },
  ];

  const dashboardTimeRangePresets = DASHBOARD_AGGREGATION_OPTIONS;

  const agg = useMemo(() => {
    if ("range" in timeRange) {
      return timeRange.range as DashboardDateRangeAggregationOption;
    }

    return findClosestDashboardInterval(timeRange) ?? "last7Days";
  }, [timeRange]);

  const fromTimestamp = absoluteTimeRange?.from
    ? absoluteTimeRange.from
    : new Date(new Date().getTime() - 1000);
  const toTimestamp = absoluteTimeRange?.to ? absoluteTimeRange.to : new Date();

  const timeFilter = [
    {
      type: "datetime" as const,
      column: "startTime",
      operator: ">" as const,
      value: fromTimestamp,
    },
    {
      type: "datetime" as const,
      column: "startTime",
      operator: "<" as const,
      value: toTimestamp,
    },
  ];

  const environmentFilter = convertSelectedEnvironmentsToFilter(
    ["environment"],
    selectedEnvironments,
  );

  const mergedFilterState: FilterState = [
    ...userFilterState,
    ...timeFilter,
    ...environmentFilter,
  ];

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Agents",
        actionButtonsLeft: (
          <>
            <TimeRangePicker
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              timeRangePresets={dashboardTimeRangePresets}
              className="my-0 max-w-full overflow-x-auto"
              disabled={
                lookbackLimit
                  ? {
                      before: new Date(
                        new Date().getTime() -
                          lookbackLimit * 24 * 60 * 60 * 1000,
                      ),
                    }
                  : undefined
              }
            />
            <MultiSelect
              title="Environment"
              label="Env"
              values={selectedEnvironments}
              onValueChange={useDebounce(setSelectedEnvironments)}
              options={environmentOptions.map((env) => ({
                value: env,
              }))}
              className="my-0 w-auto overflow-hidden"
            />
            <PopoverFilterBuilder
              columns={filterColumns}
              filterState={userFilterState}
              onChange={useDebounce(setUserFilterState)}
            />
          </>
        ),
        actionButtonsRight: (
          <>
            <SetupTracingButton />
          </>
        ),
      }}
    >
      <Tabs
        defaultValue="model"
        value={activeTab}
        onValueChange={handleTabChange}
      >
        <TabsList className="mb-4">
          <TabsTrigger value="model">Model</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>

        <TabsContent value="model">
          <div className="flex flex-col gap-4">
            {/* Original Components */}
            <div className="grid w-full grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2 xl:grid-cols-6">
              {/* Model Usage - 全宽主图表 */}
              <ModelUsageChart
                className="col-span-1 min-h-24 xl:col-span-6"
                projectId={projectId}
                globalFilterState={mergedFilterState}
                fromTimestamp={fromTimestamp}
                toTimestamp={toTimestamp}
                userAndEnvFilterState={[
                  ...userFilterState,
                  ...environmentFilter,
                ]}
                agg={agg}
                isLoading={environmentFilterOptions.isPending}
              />

              {/* 成本 */}
              <ModelCostTable
                className="col-span-1 xl:col-span-6"
                projectId={projectId}
                globalFilterState={[...userFilterState, ...environmentFilter]}
                fromTimestamp={fromTimestamp}
                toTimestamp={toTimestamp}
                isLoading={environmentFilterOptions.isPending}
              />

              {/* Generation Latency - 全宽性能图表 */}
              <GenerationLatencyChart
                className="col-span-1 flex-auto justify-between lg:col-span-full"
                projectId={projectId}
                agg={agg}
                globalFilterState={[...userFilterState, ...environmentFilter]}
                fromTimestamp={fromTimestamp}
                toTimestamp={toTimestamp}
                isLoading={environmentFilterOptions.isPending}
              />

              {/* 用户维度 */}
              <UserChart
                className="col-span-1 xl:col-span-6"
                projectId={projectId}
                globalFilterState={[...userFilterState, ...environmentFilter]}
                fromTimestamp={fromTimestamp}
                toTimestamp={toTimestamp}
                isLoading={environmentFilterOptions.isPending}
              />
            </div>

            {/* Additional Dashboard Widgets */}
            <div className="border-t pt-4">
              <DashboardGrid
                widgets={MODEL_WIDGET_PLACEMENTS}
                onChange={() => {}}
                canEdit={false}
                dashboardId="agents-model"
                projectId={projectId}
                dateRange={
                  absoluteTimeRange
                    ? { from: absoluteTimeRange.from, to: absoluteTimeRange.to }
                    : undefined
                }
                filterState={[...userFilterState, ...environmentFilter]}
                onDeleteWidget={() => {}}
                dashboardOwner="LANGFUSE"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sessions">
          <div className="flex flex-col gap-4">
            {/* Sessions Overview */}
            <SessionsOverview
              className="col-span-1 xl:col-span-6"
              projectId={projectId}
              globalFilterState={[...userFilterState, ...environmentFilter]}
              fromTimestamp={fromTimestamp}
              toTimestamp={toTimestamp}
              isLoading={environmentFilterOptions.isPending}
            />

            {/* Session Count Trend Chart */}
            <SessionCountTrendChart
              className="col-span-1 xl:col-span-6"
              projectId={projectId}
              globalFilterState={[...userFilterState, ...environmentFilter]}
              fromTimestamp={fromTimestamp}
              toTimestamp={toTimestamp}
              agg={agg}
              isLoading={environmentFilterOptions.isPending}
            />

            {/* Additional Dashboard Widgets */}
            <DashboardGrid
              widgets={SESSIONS_WIDGET_PLACEMENTS}
              onChange={() => {}}
              canEdit={false}
              dashboardId="agents-sessions"
              projectId={projectId}
              dateRange={
                absoluteTimeRange
                  ? { from: absoluteTimeRange.from, to: absoluteTimeRange.to }
                  : undefined
              }
              filterState={[...userFilterState, ...environmentFilter]}
              onDeleteWidget={() => {}}
              dashboardOwner="LANGFUSE"
            />
          </div>
        </TabsContent>

        <TabsContent value="traces">
          <div className="flex flex-col gap-4">
            {/* Original Components */}
            <div className="grid w-full grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2 xl:grid-cols-6">
              {/* Traces & Observations Time Series - 全宽时间趋势 */}
              <TracesAndObservationsTimeSeriesChart
                className="col-span-1 xl:col-span-6"
                projectId={projectId}
                globalFilterState={[...userFilterState, ...environmentFilter]}
                fromTimestamp={fromTimestamp}
                toTimestamp={toTimestamp}
                agg={agg}
                isLoading={environmentFilterOptions.isPending}
              />

              {/* Traces 快速洞察 */}
              <TracesBarListChart
                className="col-span-1 xl:col-span-6"
                projectId={projectId}
                globalFilterState={[...userFilterState, ...environmentFilter]}
                fromTimestamp={fromTimestamp}
                toTimestamp={toTimestamp}
                isLoading={environmentFilterOptions.isPending}
              />

              {/* Latency分析 - 全宽性能指标 */}
              <LatencyTables
                projectId={projectId}
                globalFilterState={[...userFilterState, ...environmentFilter]}
                fromTimestamp={fromTimestamp}
                toTimestamp={toTimestamp}
                isLoading={environmentFilterOptions.isPending}
              />
            </div>

            {/* Additional Dashboard Widgets */}
            <div className="border-t pt-4">
              <DashboardGrid
                widgets={TRACES_WIDGET_PLACEMENTS}
                onChange={() => {}}
                canEdit={false}
                dashboardId="agents-traces"
                projectId={projectId}
                dateRange={
                  absoluteTimeRange
                    ? { from: absoluteTimeRange.from, to: absoluteTimeRange.to }
                    : undefined
                }
                filterState={[...userFilterState, ...environmentFilter]}
                onDeleteWidget={() => {}}
                dashboardOwner="LANGFUSE"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
