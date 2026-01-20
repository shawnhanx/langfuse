# Langfuse 多实例共享部署方案验证

本目录包含用于验证 Langfuse 多实例共享部署方案的 Kubernetes 配置文件。

## 架构概览

```
┌─────────────────────┐    ┌─────────────────────┐
│    Langfuse A       │    │    Langfuse B       │
│  ┌───────────────┐  │    │  ┌───────────────┐  │
│  │ langfuse-web  │  │    │  │ langfuse-web-b│  │
│  │ langfuse-worker│ │    │  │ langfuse-worker-b│
│  │ redis-primary │  │    │  │ redis-b-primary│ │
│  └───────────────┘  │    │  └───────────────┘  │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          │ DB: postgres_langfuse    │ DB: langfuse_b
          │ CH: default/langfuse_a   │ CH: langfuse_b
          │ S3: instance-a/*         │ S3: instance-b/*
          │                          │
          └──────────┬───────────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
     ▼               ▼               ▼
┌─────────┐   ┌───────────┐   ┌──────────┐
│ Shared  │   │  Shared   │   │ Shared   │
│ PostgreSQL│   │ClickHouse │   │ S3/MinIO │
└─────────┘   └───────────┘   └──────────┘
```

## 隔离方案

| 组件 | 隔离方式 | 实例 A | 实例 B |
|------|---------|--------|--------|
| **PostgreSQL** | Database 隔离 | `postgres_langfuse` | `langfuse_b` |
| **ClickHouse** | Database 隔离 | `default` (可改为 `langfuse_a`) | `langfuse_b` |
| **S3/MinIO** | Prefix 隔离 | `instance-a/*` | `instance-b/*` |
| **Redis** | 独立实例 | `langfuse-redis-primary` | `langfuse-redis-b-primary` |

## 文件说明

| 文件 | 说明 |
|------|------|
| `00-init-databases.md` | 数据库初始化步骤（PostgreSQL、ClickHouse） |
| `01-patch-instance-a.yaml` | 实例 A 配置更新（添加 S3 PREFIX） |
| `02-redis-b.yaml` | 实例 B 的 Redis StatefulSet |
| `03-langfuse-web-b.yaml` | 实例 B 的 Web Deployment |
| `04-langfuse-worker-b.yaml` | 实例 B 的 Worker Deployment |
| `05-apply.sh` | 一键部署脚本 |

## 部署步骤

### 步骤 1: 初始化数据库

按照 `00-init-databases.md` 中的步骤，在 PostgreSQL 和 ClickHouse 中创建实例 B 所需的数据库。

```bash
# 创建 PostgreSQL 数据库
kubectl exec -it langfuse-postgresql-0 -n langfuse -- psql -U postgres -c "CREATE DATABASE langfuse_b;"
kubectl exec -it langfuse-postgresql-0 -n langfuse -- psql -U postgres -c "CREATE USER langfuse_b WITH PASSWORD 'langfuse_b_password';"
kubectl exec -it langfuse-postgresql-0 -n langfuse -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE langfuse_b TO langfuse_b;"

# 创建 ClickHouse 数据库
kubectl exec -it langfuse-clickhouse-shard0-0 -n langfuse -- clickhouse-client --password mlbvhiUlXSnEicXgsrVUQ== -q "CREATE DATABASE langfuse_b ON CLUSTER default;"
```

### 步骤 2: 更新实例 A 配置（可选）

如果需要为实例 A 添加 S3 PREFIX 隔离：

```bash
# 为实例 A 添加 S3 PREFIX
kubectl set env deployment/langfuse-web -n langfuse \
  LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-a/events/ \
  LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-a/media/ \
  LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-a/exports/

kubectl set env deployment/langfuse-worker -n langfuse \
  LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-a/events/ \
  LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-a/media/ \
  LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-a/exports/
```

### 步骤 3: 部署实例 B

```bash
# 部署 Redis
kubectl apply -f 02-redis-b.yaml

# 等待 Redis 就绪
kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=langfuse-b,app.kubernetes.io/name=redis -n langfuse --timeout=120s

# 部署 Web 和 Worker
kubectl apply -f 03-langfuse-web-b.yaml
kubectl apply -f 04-langfuse-worker-b.yaml

# 等待 Pod 就绪
kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=langfuse-b -n langfuse --timeout=300s
```

### 步骤 4: 验证部署

```bash
# 查看所有 Pod
kubectl get pods -n langfuse

# 查看实例 B 的 Pod
kubectl get pods -n langfuse -l app.kubernetes.io/instance=langfuse-b

# 查看日志
kubectl logs -f deployment/langfuse-web-b -n langfuse
kubectl logs -f deployment/langfuse-worker-b -n langfuse

# 端口转发访问实例 B
kubectl port-forward svc/langfuse-web-b 3001:3000 -n langfuse
# 访问 http://localhost:3001
```

## 验证测试

### 1. 数据库隔离验证

```bash
# 检查 PostgreSQL 数据库
kubectl exec -it langfuse-postgresql-0 -n langfuse -- psql -U postgres -c "\l" | grep langfuse

# 检查 ClickHouse 数据库
kubectl exec -it langfuse-clickhouse-shard0-0 -n langfuse -- clickhouse-client --password mlbvhiUlXSnEicXgsrVUQ== -q "SHOW DATABASES"
```

### 2. S3 隔离验证

```bash
# 进入 MinIO 容器查看目录结构
kubectl exec -it deployment/langfuse-s3 -n langfuse -- sh -c "ls -la /data/langfuse/"

# 应该看到 instance-a/ 和 instance-b/ 目录
```

### 3. 功能验证

1. 分别访问两个实例的 Web UI
2. 在每个实例中创建项目和 traces
3. 验证数据只在对应实例中可见

## 清理

```bash
# 删除实例 B 的资源
kubectl delete -f 04-langfuse-worker-b.yaml
kubectl delete -f 03-langfuse-web-b.yaml
kubectl delete -f 02-redis-b.yaml

# 删除数据库（可选）
kubectl exec -it langfuse-postgresql-0 -n langfuse -- psql -U postgres -c "DROP DATABASE langfuse_b;"
kubectl exec -it langfuse-clickhouse-shard0-0 -n langfuse -- clickhouse-client --password mlbvhiUlXSnEicXgsrVUQ== -q "DROP DATABASE langfuse_b ON CLUSTER default;"
```

## 注意事项

1. **密码安全**: 请替换配置文件中的默认密码
2. **资源配额**: 根据实际需求调整资源 requests 和 limits
3. **存储**: Redis 使用 PVC，确保有足够的存储空间
4. **Migration**: 首次启动时 Langfuse 会自动运行数据库 migration
5. **SALT**: 建议为每个实例生成独立的 SALT 值

## 相关文档

- [多 Langfuse 共享 PostgreSQL 方案](../multi-langfuse-shared-postgresql.md)
- [多 Langfuse 共享 ClickHouse 方案](../multi-langfuse-shared-clickhouse.md)
- [多 Langfuse 共享 S3 方案](../multi-langfuse-shared-s3.md)
