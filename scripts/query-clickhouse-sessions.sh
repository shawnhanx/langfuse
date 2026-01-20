#!/bin/bash

# ClickHouse Sessions Query Script
# Usage: ./scripts/query-clickhouse-sessions.sh [options]

# Exit on error, but handle curl failures
set -e

# ClickHouse configuration - can be overridden by environment variables
CLICKHOUSE_HOST=${CLICKHOUSE_HOST:-"127.0.0.1"}
CLICKHOUSE_PORT=${CLICKHOUSE_PORT:-"18123"}
CLICKHOUSE_USER=${CLICKHOUSE_USER:-"clickhouse"}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-"clickhouse"}

# Base URL
CLICKHOUSE_URL="http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print usage
print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Query ClickHouse for session information.

OPTIONS:
    -s, --summary       Show summary statistics (total sessions and traces)
    -p, --projects      Show session counts by project
    -a, --all           Show all sessions with detailed information
    -t, --top N         Show top N sessions by trace count (default: 10)
    --project ID        Filter by specific project ID
    --session ID        Get details for specific session ID
    -j, --json          Output in JSON format
    -h, --help          Show this help message

EXAMPLES:
    $0 --summary                           # Show summary statistics
    $0 --projects                         # Show sessions by project
    $0 --all                              # Show all sessions
    $0 --top 20                           # Show top 20 sessions
    $0 --project 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a  # Filter by project
    $0 --session support-chat-session     # Get specific session details
    $0 --all --json                       # Output all sessions as JSON

EOF
}

# Parse command line arguments
QUERY_TYPE=""
PROJECT_ID=""
SESSION_ID=""
TOP_N=10
OUTPUT_FORMAT="pretty"

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--summary)
            QUERY_TYPE="summary"
            shift
            ;;
        -p|--projects)
            QUERY_TYPE="projects"
            shift
            ;;
        -a|--all)
            QUERY_TYPE="all"
            shift
            ;;
        -t|--top)
            QUERY_TYPE="top"
            TOP_N="$2"
            shift 2
            ;;
        --project)
            PROJECT_ID="$2"
            shift 2
            ;;
        --session)
            QUERY_TYPE="session_details"
            SESSION_ID="$2"
            shift 2
            ;;
        -j|--json)
            OUTPUT_FORMAT="json"
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# If no query type specified, default to summary
if [ -z "$QUERY_TYPE" ]; then
    QUERY_TYPE="summary"
fi

# Function to execute ClickHouse query
query_clickhouse() {
    local query=$1
    local format=$2

    # Remove newlines and extra spaces from query, then URL encode
    local cleaned_query=$(echo "$query" | tr '\n' ' ' | tr -s ' ' | sed 's/^ *//;s/ *$//')
    local encoded_query=${cleaned_query// /+}

    if [ "$format" = "json" ]; then
        local result=$(curl -s "${CLICKHOUSE_URL}/?query=${encoded_query}" \
            --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" 2>&1)
        local exit_code=$?
        if [ $exit_code -ne 0 ]; then
            echo -e "${RED}Error: curl failed with exit code $exit_code${NC}" >&2
            echo "$result" >&2
            return $exit_code
        fi
        echo "$result"
    else
        local result=$(curl -s "${CLICKHOUSE_URL}/?query=${encoded_query}+FORMAT+${format}" \
            --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" 2>&1)
        local exit_code=$?
        if [ $exit_code -ne 0 ]; then
            echo -e "${RED}Error: curl failed with exit code $exit_code${NC}" >&2
            echo "$result" >&2
            return $exit_code
        fi
        echo "$result"
    fi
    return 0
}

# Build project filter
PROJECT_FILTER=""
if [ -n "$PROJECT_ID" ]; then
    PROJECT_FILTER="AND project_id = '${PROJECT_ID}'"
    echo -e "${BLUE}Filtering by project: ${PROJECT_ID}${NC}\n"
fi

# Execute queries based on type
case $QUERY_TYPE in
    summary)
        echo -e "${GREEN}=== Session Statistics Summary ===${NC}\n"
        query_clickhouse "
            SELECT
                count(DISTINCT session_id) as total_sessions,
                count(id) as total_traces
            FROM traces
            WHERE session_id IS NOT NULL
            ${PROJECT_FILTER}
        " "$OUTPUT_FORMAT"
        ;;

    projects)
        echo -e "${GREEN}=== Sessions by Project ===${NC}\n"
        query_clickhouse "
            SELECT
                project_id,
                count(DISTINCT session_id) as session_count
            FROM traces
            WHERE session_id IS NOT NULL
            ${PROJECT_FILTER}
            GROUP BY project_id
            ORDER BY session_count DESC
        " "$OUTPUT_FORMAT"
        ;;

    all)
        echo -e "${GREEN}=== All Sessions ===${NC}\n"
        query_clickhouse "
            SELECT
                session_id,
                project_id,
                count(id) as trace_count,
                min(timestamp) as first_trace,
                max(timestamp) as last_trace
            FROM traces
            WHERE session_id IS NOT NULL
            ${PROJECT_FILTER}
            GROUP BY session_id, project_id
            ORDER BY first_trace DESC
        " "$OUTPUT_FORMAT"
        ;;

    top)
        echo -e "${GREEN}=== Top ${TOP_N} Sessions by Trace Count ===${NC}\n"
        query_clickhouse "
            SELECT
                session_id,
                project_id,
                count(id) as trace_count,
                min(timestamp) as first_trace,
                max(timestamp) as last_trace
            FROM traces
            WHERE session_id IS NOT NULL
            ${PROJECT_FILTER}
            GROUP BY session_id, project_id
            ORDER BY trace_count DESC
            LIMIT ${TOP_N}
        " "$OUTPUT_FORMAT"
        ;;

    session_details)
        if [ -z "$SESSION_ID" ]; then
            echo -e "${RED}Error: --session requires a session ID${NC}"
            exit 1
        fi

        echo -e "${GREEN}=== Details for Session: ${SESSION_ID} ===${NC}\n"

        echo -e "${YELLOW}--- Basic Info ---${NC}"
        query_clickhouse "
            SELECT
                session_id,
                project_id,
                count(id) as trace_count,
                min(timestamp) as first_trace,
                max(timestamp) as last_trace
            FROM traces
            WHERE session_id = '${SESSION_ID}'
            ${PROJECT_FILTER}
            GROUP BY session_id, project_id
        " "$OUTPUT_FORMAT"

        echo -e "\n${YELLOW}--- Traces in this Session ---${NC}"
        query_clickhouse "
            SELECT
                id,
                timestamp,
                name,
                user_id,
                tags
            FROM traces
            WHERE session_id = '${SESSION_ID}'
            ${PROJECT_FILTER}
            ORDER BY timestamp ASC
        " "$OUTPUT_FORMAT"
        ;;
esac

echo ""
