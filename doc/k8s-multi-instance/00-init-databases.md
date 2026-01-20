# 数据库初始化步骤

在部署第二个 Langfuse 实例之前，需要先在 PostgreSQL 和 ClickHouse 中创建对应的数据库。

## 1. 创建 PostgreSQL 数据库

```bash
# 连接到 PostgreSQL pod
kubectl exec -it langfuse-postgresql-0 -n langfuse -- bash

# 使用 psql 连接
psql -U postgres

# 创建数据库和用户（用于实例 B）
CREATE DATABASE langfuse_b;
CREATE USER langfuse_b WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE langfuse_b TO langfuse_b;

# 授予 schema 权限
\c langfuse_b
GRANT ALL ON SCHEMA public TO langfuse_b;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO langfuse_b;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO langfuse_b;

# 退出
\q
exit
```

## 2. 创建 ClickHouse 数据库

```bash
# 连接到 ClickHouse pod
kubectl exec -it langfuse-clickhouse-shard0-0 -n langfuse -- bash

# 使用 clickhouse-client 连接
clickhouse-client --password mlbvhiUlXSnEicXgsrVUQ==

# 创建数据库（用于实例 A，如果要改名）
CREATE DATABASE langfuse_a ON CLUSTER default;

# 创建数据库（用于实例 B）
CREATE DATABASE langfuse_b ON CLUSTER default;

# 验证
SHOW DATABASES;

# 退出
exit
exit
```

## 3. 验证数据库创建

```bash
# 验证 PostgreSQL
kubectl exec -it langfuse-postgresql-0 -n langfuse -- psql -U postgres -c "\l" | grep langfuse

# 验证 ClickHouse
kubectl exec -it langfuse-clickhouse-shard0-0 -n langfuse -- clickhouse-client --password mlbvhiUlXSnEicXgsrVUQ== -q "SHOW DATABASES"
```

## 注意事项

1. **PostgreSQL 密码**: 请将 `your_password_here` 替换为实际的安全密码
2. **ClickHouse 密码**: 使用当前集群的 ClickHouse 密码
3. **Migration**: 数据库创建后，Langfuse 启动时会自动执行 migration 创建表结构
