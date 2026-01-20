#!/bin/bash

# Background Docker build launcher
# Usage: ./run-build-background.sh [web|worker|both]

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

start_build() {
  local NAME=$1
  local SCRIPT=$2
  local LOG_FILE="${LOG_DIR}/${NAME}-build-$(date +%Y%m%d-%H%M%S).log"
  local PID_FILE="${LOG_DIR}/${NAME}-build.pid"

  if [ -f "$PID_FILE" ]; then
    local PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "⚠️  ${NAME} build is already running (PID: $PID)"
      echo "   Log file: $(ls -t ${LOG_DIR}/${NAME}-build-*.log 2>/dev/null | head -1)"
      return 1
    else
      rm -f "$PID_FILE"
    fi
  fi

  echo "🚀 Starting ${NAME} build in background..."
  echo "   Script: $SCRIPT"
  echo "   Log file: $LOG_FILE"

  nohup bash "$SCRIPT" > "$LOG_FILE" 2>&1 &
  local PID=$!
  echo $PID > "$PID_FILE"

  echo "✅ ${NAME} build started (PID: $PID)"
  echo "   Monitor: tail -f $LOG_FILE"
  echo "   Stop: kill $PID"
  echo ""
}

case "${1:-both}" in
  web)
    start_build "web" "./scripts/build-docker-retry.sh"
    ;;
  worker)
    start_build "worker" "./scripts/build-worker-docker-retry.sh"
    ;;
  both)
    start_build "web" "./scripts/build-docker-retry.sh"
    start_build "worker" "./scripts/build-worker-docker-retry.sh"
    ;;
  status)
    echo "=== Build Status ==="
    for name in web worker; do
      PID_FILE="${LOG_DIR}/${name}-build.pid"
      if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
          echo "✅ ${name}: Running (PID: $PID)"
          LOG=$(ls -t ${LOG_DIR}/${name}-build-*.log 2>/dev/null | head -1)
          if [ -n "$LOG" ]; then
            echo "   Log: $LOG"
            echo "   Last 5 lines:"
            tail -5 "$LOG"
          fi
        else
          echo "❌ ${name}: Not running (stale PID file)"
          rm -f "$PID_FILE"
        fi
      else
        echo "⭕ ${name}: Not running"
      fi
      echo ""
    done
    ;;
  stop)
    echo "=== Stopping Builds ==="
    for name in web worker; do
      PID_FILE="${LOG_DIR}/${name}-build.pid"
      if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
          echo "Stopping ${name} (PID: $PID)..."
          kill "$PID"
          rm -f "$PID_FILE"
          echo "✅ ${name} stopped"
        else
          echo "⚠️  ${name}: Not running (stale PID file)"
          rm -f "$PID_FILE"
        fi
      else
        echo "⭕ ${name}: Not running"
      fi
    done
    ;;
  *)
    echo "Usage: $0 [web|worker|both|status|stop]"
    echo ""
    echo "Commands:"
    echo "  web     - Start web image build"
    echo "  worker  - Start worker image build"
    echo "  both    - Start both builds (default)"
    echo "  status  - Show build status and recent logs"
    echo "  stop    - Stop all running builds"
    echo ""
    echo "Examples:"
    echo "  $0 web                # Start web build"
    echo "  $0 status             # Check status"
    echo "  $0 stop               # Stop all builds"
    exit 1
    ;;
esac
