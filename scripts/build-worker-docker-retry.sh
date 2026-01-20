#!/bin/bash

# Docker build retry script for worker
# Automatically generates timestamp tag and pushes to Baidu registry

# Generate timestamp tag (YYYYMMDD + sequence number)
TODAY=$(date +%Y%m%d)
SEQUENCE=1

# Find existing images with today's date to determine next sequence number
EXISTING_TAGS=$(docker images --format "{{.Tag}}" registry.baidubce.com/cce-plugin-dev/langfuse-worker 2>/dev/null | grep "^${TODAY}" || true)
if [ -n "$EXISTING_TAGS" ]; then
  # Get the highest sequence number for today
  MAX_SEQ=$(echo "$EXISTING_TAGS" | sed "s/^${TODAY}//" | grep -E "^[0-9]+$" | sort -n | tail -1)
  if [ -n "$MAX_SEQ" ]; then
    SEQUENCE=$((MAX_SEQ + 1))
  fi
fi

IMAGE_TAG="${TODAY}${SEQUENCE}"
LOCAL_IMAGE="langfuse-worker:${IMAGE_TAG}"
REGISTRY_IMAGE="registry.baidubce.com/cce-plugin-dev/langfuse-worker:${IMAGE_TAG}"

DOCKER_BUILD_CMD="docker build --platform linux/amd64 --no-cache -f worker/Dockerfile -t ${LOCAL_IMAGE} ."

ATTEMPT=1

echo "========================================"
echo "Starting Docker build retry loop (Worker)"
echo "Local image: ${LOCAL_IMAGE}"
echo "Registry image: ${REGISTRY_IMAGE}"
echo "Platform: linux/amd64"
echo "========================================"

while true; do
  echo ""
  echo "[Attempt ${ATTEMPT}] Executing: ${DOCKER_BUILD_CMD}"
  echo "Started at: $(date)"

  if eval "${DOCKER_BUILD_CMD}"; then
    echo ""
    echo "========================================"
    echo "SUCCESS! Docker image built successfully!"
    echo "Image: ${LOCAL_IMAGE}"
    echo "Completed at: $(date)"
    echo "Total attempts: ${ATTEMPT}"
    echo "========================================"

    # Verify the image exists
    if docker images | grep -q "langfuse-worker.*${IMAGE_TAG}"; then
      echo "Image verification: PASSED"
      docker images "${LOCAL_IMAGE}"
      echo ""
    else
      echo "Warning: Build reported success but image not found in docker images list"
    fi

    # Tag for registry
    echo "Tagging image for registry..."
    docker tag "${LOCAL_IMAGE}" "${REGISTRY_IMAGE}"
    if [ $? -eq 0 ]; then
      echo "✅ Image tagged: ${REGISTRY_IMAGE}"
    else
      echo "❌ Failed to tag image for registry"
      exit 1
    fi

    # Push to registry
    echo ""
    echo "Pushing to registry: ${REGISTRY_IMAGE}"
    if docker push "${REGISTRY_IMAGE}"; then
      echo ""
      echo "========================================"
      echo "✅ SUCCESS! Image pushed to registry"
      echo "Registry: ${REGISTRY_IMAGE}"
      echo "========================================"
      exit 0
    else
      echo ""
      echo "❌ FAILED! Push to registry failed"
      exit 1
    fi
  else
    EXIT_CODE=$?
    echo ""
    echo "========================================"
    echo "FAILED! Docker build failed with exit code: ${EXIT_CODE}"
    echo "Failed at: $(date)"
    echo "Retrying in 5 seconds..."
    echo "========================================"

    ATTEMPT=$((ATTEMPT + 1))
    sleep 5
  fi
done
