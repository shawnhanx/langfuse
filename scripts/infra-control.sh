#!/bin/bash

# Control script for Docker infrastructure containers
# Usage: ./scripts/infra-control.sh [stop|start]

ACTION=$1

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Docker Compose project name (based on docker-compose.yml in the root)
COMPOSE_PROJECT_NAME="langfuse"

if [ "$ACTION" = "stop" ]; then
    echo "Stopping Docker containers..."
    cd "$PROJECT_ROOT"
    docker compose -f docker-compose.dev.yml stop
    echo "✓ Containers stopped (not removed)"
elif [ "$ACTION" = "start" ]; then
    echo "Starting Docker containers..."
    cd "$PROJECT_ROOT"
    docker compose -f docker-compose.dev.yml start
    echo "✓ Containers started"
else
    echo "Usage: $0 [stop|start]"
    echo ""
    echo "Examples:"
    echo "  $0 stop   # Pause containers"
    echo "  $0 start  # Resume containers"
    exit 1
fi
