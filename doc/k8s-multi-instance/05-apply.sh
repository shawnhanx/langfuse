#!/bin/bash

# Langfuse 多实例部署脚本
# 用于在现有 langfuse 命名空间中部署第二个 Langfuse 实例

set -e

NAMESPACE="langfuse"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 kubectl
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        echo_error "kubectl 未安装"
        exit 1
    fi
}

# 检查命名空间
check_namespace() {
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        echo_error "命名空间 $NAMESPACE 不存在"
        exit 1
    fi
}

# 步骤 1: 创建数据库
create_databases() {
    echo_info "步骤 1: 创建数据库..."

    # 创建 PostgreSQL 数据库
    echo_info "创建 PostgreSQL 数据库 langfuse_b..."
    kubectl exec -it langfuse-postgresql-0 -n $NAMESPACE -- psql -U postgres -c "CREATE DATABASE langfuse_b;" 2>/dev/null || echo_warn "数据库可能已存在"
    kubectl exec -it langfuse-postgresql-0 -n $NAMESPACE -- psql -U postgres -c "CREATE USER langfuse_b WITH PASSWORD '164b984bcc748c7369651c13e22ef34795a46f59fc6bfff0';" 2>/dev/null || echo_warn "用户可能已存在"
    kubectl exec -it langfuse-postgresql-0 -n $NAMESPACE -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE langfuse_b TO langfuse_b;" 2>/dev/null || true

    # 创建 ClickHouse 数据库
    echo_info "创建 ClickHouse 数据库 langfuse_b..."
    kubectl exec -it langfuse-clickhouse-shard0-0 -n $NAMESPACE -- clickhouse-client --password mlbvhiUlXSnEicXgsrVUQ== -q "CREATE DATABASE IF NOT EXISTS langfuse_b ON CLUSTER default;" 2>/dev/null || echo_warn "数据库可能已存在"

    echo_info "数据库创建完成"
}

# 步骤 2: 更新实例 A 配置（添加 S3 PREFIX）
update_instance_a() {
    echo_info "步骤 2: 更新实例 A 配置（添加 S3 PREFIX）..."

    read -p "是否更新实例 A 的 S3 PREFIX 配置？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl set env deployment/langfuse-web -n $NAMESPACE \
            LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-a/events/ \
            LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-a/media/ \
            LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-a/exports/

        kubectl set env deployment/langfuse-worker -n $NAMESPACE \
            LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-a/events/ \
            LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-a/media/ \
            LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-a/exports/

        echo_info "实例 A 配置更新完成"
    else
        echo_info "跳过实例 A 配置更新"
    fi
}

# 步骤 3: 部署实例 B 的 Redis
deploy_redis_b() {
    echo_info "步骤 3: 部署实例 B 的 Redis..."

    kubectl apply -f "$SCRIPT_DIR/02-redis-b.yaml"

    echo_info "等待 Redis 就绪..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=langfuse-b,app.kubernetes.io/name=redis -n $NAMESPACE --timeout=120s || {
        echo_warn "Redis 启动超时，请手动检查"
    }

    echo_info "Redis 部署完成"
}

# 步骤 4: 部署实例 B 的 Web 和 Worker
deploy_langfuse_b() {
    echo_info "步骤 4: 部署实例 B 的 Langfuse Web 和 Worker..."

    kubectl apply -f "$SCRIPT_DIR/03-langfuse-web-b.yaml"
    kubectl apply -f "$SCRIPT_DIR/04-langfuse-worker-b.yaml"

    echo_info "等待 Pod 就绪..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=langfuse-b,app.kubernetes.io/component=web -n $NAMESPACE --timeout=300s || {
        echo_warn "Web 启动超时，请手动检查"
    }
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=langfuse-b,app.kubernetes.io/component=worker -n $NAMESPACE --timeout=300s || {
        echo_warn "Worker 启动超时，请手动检查"
    }

    echo_info "Langfuse B 部署完成"
}

# 步骤 5: 验证部署
verify_deployment() {
    echo_info "步骤 5: 验证部署..."

    echo ""
    echo "========== 所有 Pod 状态 =========="
    kubectl get pods -n $NAMESPACE -o wide

    echo ""
    echo "========== 实例 B 资源 =========="
    kubectl get all -n $NAMESPACE -l app.kubernetes.io/instance=langfuse-b

    echo ""
    echo "========== 数据库验证 =========="
    echo "PostgreSQL 数据库:"
    kubectl exec -it langfuse-postgresql-0 -n $NAMESPACE -- psql -U postgres -c "\l" 2>/dev/null | grep -E "langfuse|Name" || true

    echo ""
    echo "ClickHouse 数据库:"
    kubectl exec -it langfuse-clickhouse-shard0-0 -n $NAMESPACE -- clickhouse-client --password mlbvhiUlXSnEicXgsrVUQ== -q "SHOW DATABASES" 2>/dev/null || true
}

# 主函数
main() {
    echo "=========================================="
    echo "  Langfuse 多实例共享部署脚本"
    echo "=========================================="
    echo ""

    check_kubectl
    check_namespace

    case "${1:-all}" in
        db)
            create_databases
            ;;
        update-a)
            update_instance_a
            ;;
        redis)
            deploy_redis_b
            ;;
        langfuse)
            deploy_langfuse_b
            ;;
        verify)
            verify_deployment
            ;;
        all)
            create_databases
            update_instance_a
            deploy_redis_b
            deploy_langfuse_b
            verify_deployment
            ;;
        *)
            echo "用法: $0 {all|db|update-a|redis|langfuse|verify}"
            echo ""
            echo "  all      - 执行所有步骤"
            echo "  db       - 仅创建数据库"
            echo "  update-a - 仅更新实例 A 配置"
            echo "  redis    - 仅部署 Redis B"
            echo "  langfuse - 仅部署 Langfuse B"
            echo "  verify   - 仅验证部署"
            exit 1
            ;;
    esac

    echo ""
    echo_info "部署完成！"
    echo ""
    echo "访问实例 B:"
    echo "  kubectl port-forward svc/langfuse-web-b 3001:3000 -n $NAMESPACE"
    echo "  然后访问 http://localhost:3001"
}

main "$@"
