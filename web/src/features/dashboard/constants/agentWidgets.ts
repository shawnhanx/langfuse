// Widget IDs from langfuse-dashboards.json
export const MODEL_WIDGET_IDS = [
  // Token Usage
  "e6ca78cc-a3ec-47b5-9309-4bc2fc06b443", // Total Input Tokens
  "1b17b72d-f9aa-4562-8905-7527f245c415", // Total Output Tokens
  "a1b2c3d4-e5f6-4789-92bc-0123456789ab", // Total Tokens
  "01f91b0f-3eda-4240-a9d7-5bfb30f4d38a", // Token Usage Trend
  "0b1f61ee-3ea3-4434-bd81-71b47513a1f4", // Token Usage by Model
  "259f771f-958f-4319-8516-71051374df23", // Top 20 Users by Token Usage
  "input-p99-tokens", // P99 Input Tokens
  "input-p95-tokens", // P95 Input Tokens
  "input-p50-tokens", // P50 Input Tokens
  "output-p99-tokens", // P99 Output Tokens
  "output-p95-tokens", // P95 Output Tokens
  "output-p50-tokens", // P50 Output Tokens
  "total-p99-tokens", // P99 Total Tokens
  "total-p95-tokens", // P95 Total Tokens
  "total-p50-tokens", // P50 Total Tokens

  // Model Calls
  "model-call-count-number", // Model Call Count
  "model-calls-by-model", // Model Calls by Model
  "model-call-trend", // Model Call Trend

  // Performance/Latency
  "cmawka1fk00kdad07vdipgz04", // Avg Time To First Token by Prompt Name
  "cmawksk8h00phad07s9c7v6d7", // P 95 Time To First Token by Model
  "cmawktot400pkad07m8gy30vq", // P 95 Latency by Model
  "cmawl83ks001ead076pk2wcex", // Avg Output Tokens Per Second by Model
  "cmawk617300iiad07zaes6h3l", // P 95 Latency by Use Case
  "cmawk6isp00kbad07t66dohjn", // P 95 Latency by Level (Observations)
  "cmawk94z800ldad07jjox8ugd", // Max Latency by User Id (Traces)
  "p95-latency-number", // P95 Latency
  "p95-latency-by-type", // P95 Latency by Type
  "p95-latency-trend", // P95 Latency Trend by Type
  "tool-latency-by-name", // Tool Latency by Name

  // Cost
  "cma2f2ioc001had07f7810kg1", // Total costs
  "cmawk9xbu00lfad07s9j1bxnx", // Top 20 Users by Cost
  "cmawkfg0m00kzad07jyofrnq2", // Top 20 Use Cases (Observation) by Cost
  "cmawk6nqs00jwad07hwpsj3z2", // Top 20 Use Cases (Trace) by Cost
  "cmawk7btd00khad07g625cqmp", // Cost by Environment
  "cmawk5sik00igad07kjetg17j", // Cost by Model Name
  "cmawle4zj0096ad0650rzeh0z", // P 95 Cost per Trace
  "cmawljmu100v7ad07pd3apnwe", // P 95 Output Cost per Observation
  "cmawlkgt300vsad06g69vqqej", // P 95 Input Cost per Observation
];

export const TRACES_WIDGET_IDS = [
  // Trace Counts (removed duplicates, keeping only one NUMBER type)
  "trace-count-number", // Trace Count
  "cmawlrhom00xhad07phtqc81k", // Total Trace Count (over time)
  "cmawlw4s700zvad07qq4qi0gp", // Total Trace Count (by env)
  "trace-count-trend", // Trace Count Trend
  "traces-by-user", // Traces by User

  // Observation Counts (removed duplicates, keeping only one NUMBER type)
  "observation-count-number", // Observation Count
  "cmawlt6wi00zmad07cvxeeepq", // Total Observation Count (over time)
  "cmawlxdo00106ad07crpey1if", // Total Observation Count (by env)
  "observation-count-trend", // Observation Count Trend

  // Errors
  "error-count-number", // Error Count
  "error-count-trend", // Error Count Trend
  "tool-error-count", // Tool Error Count
  "tool-errors-by-name", // Tool Errors by Name
  "errors-by-name", // Errors by Name
];

export const SESSIONS_WIDGET_IDS = [
  // Session Stats
  "sessions-distribution", // Sessions Distribution
  "tokens-per-session", // Tokens per Session
];

// Helper function to generate widget placements
export function generateWidgetPlacements(widgetIds: string[], startY = 0) {
  let x = 0;
  let y = startY;
  const placements = widgetIds.map((widgetId) => {
    const placement = {
      id: `agent-${widgetId}`,
      widgetId,
      x,
      y,
      x_size: 6, // Half width by default
      y_size: 5,
      type: "widget" as const,
    };

    // Move to next position
    x += 6;
    if (x >= 12) {
      x = 0;
      y += 5;
    }

    return placement;
  });

  return placements;
}

// Generate pre-configured placements for all tabs
export const MODEL_WIDGET_PLACEMENTS =
  generateWidgetPlacements(MODEL_WIDGET_IDS);
export const TRACES_WIDGET_PLACEMENTS =
  generateWidgetPlacements(TRACES_WIDGET_IDS);
export const SESSIONS_WIDGET_PLACEMENTS =
  generateWidgetPlacements(SESSIONS_WIDGET_IDS);
