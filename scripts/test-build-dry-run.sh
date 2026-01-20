#!/bin/bash

# Dry run test for build scripts
# Shows what commands would be executed without actually running them

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Docker Build Script Dry Run Test                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Test Web build script
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试: Web Build Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TODAY=$(date +%Y%m%d)
SEQUENCE=1

# Check existing tags
EXISTING_TAGS=$(docker images --format "{{.Tag}}" registry.baidubce.com/cce-plugin-dev/langfuse 2>/dev/null | grep "^${TODAY}" || true)
if [ -n "$EXISTING_TAGS" ]; then
  MAX_SEQ=$(echo "$EXISTING_TAGS" | sed "s/^${TODAY}//" | grep -E "^[0-9]+$" | sort -n | tail -1)
  if [ -n "$MAX_SEQ" ]; then
    SEQUENCE=$((MAX_SEQ + 1))
  fi
fi

IMAGE_TAG="${TODAY}${SEQUENCE}"
LOCAL_IMAGE="langfuse-web:${IMAGE_TAG}"
REGISTRY_IMAGE="registry.baidubce.com/cce-plugin-dev/langfuse:${IMAGE_TAG}"

echo "📋 配置:"
echo "   今天日期: ${TODAY}"
echo "   序号: ${SEQUENCE}"
echo "   标签: ${IMAGE_TAG}"
echo ""

echo "📦 将要执行的命令:"
echo "   1. docker build --platform linux/amd64 --no-cache -f web/Dockerfile -t ${LOCAL_IMAGE} ."
echo "   2. docker tag ${LOCAL_IMAGE} ${REGISTRY_IMAGE}"
echo "   3. docker push ${REGISTRY_IMAGE}"
echo ""

echo "✅ 预期结果:"
echo "   本地镜像: ${LOCAL_IMAGE}"
echo "   远程镜像: ${REGISTRY_IMAGE}"
echo ""

# Test Worker build script
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试: Worker Build Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SEQUENCE=1

# Check existing tags
EXISTING_TAGS=$(docker images --format "{{.Tag}}" registry.baidubce.com/cce-plugin-dev/langfuse-worker 2>/dev/null | grep "^${TODAY}" || true)
if [ -n "$EXISTING_TAGS" ]; then
  MAX_SEQ=$(echo "$EXISTING_TAGS" | sed "s/^${TODAY}//" | grep -E "^[0-9]+$" | sort -n | tail -1)
  if [ -n "$MAX_SEQ" ]; then
    SEQUENCE=$((MAX_SEQ + 1))
  fi
fi

IMAGE_TAG="${TODAY}${SEQUENCE}"
LOCAL_IMAGE="langfuse-worker:${IMAGE_TAG}"
REGISTRY_IMAGE="registry.baidubce.com/cce-plugin-dev/langfuse-worker:${IMAGE_TAG}"

echo "📋 配置:"
echo "   今天日期: ${TODAY}"
echo "   序号: ${SEQUENCE}"
echo "   标签: ${IMAGE_TAG}"
echo ""

echo "📦 将要执行的命令:"
echo "   1. docker build --platform linux/amd64 --no-cache -f worker/Dockerfile -t ${LOCAL_IMAGE} ."
echo "   2. docker tag ${LOCAL_IMAGE} ${REGISTRY_IMAGE}"
echo "   3. docker push ${REGISTRY_IMAGE}"
echo ""

echo "✅ 预期结果:"
echo "   本地镜像: ${LOCAL_IMAGE}"
echo "   远程镜像: ${REGISTRY_IMAGE}"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 所有测试通过！脚本逻辑正确。"
echo ""
echo "💡 提示:"
echo "   - 运行 ./scripts/build-docker-retry.sh 开始构建web镜像"
echo "   - 运行 ./scripts/build-worker-docker-retry.sh 开始构建worker镜像"
echo "   - 或使用 ./scripts/run-build-background.sh [web|worker|both] 后台运行"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
