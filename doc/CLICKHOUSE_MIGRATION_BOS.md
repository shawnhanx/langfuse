# ClickHouse 数据迁移方案（百度云 BOS）

本文档描述如何使用百度云 BOS 作为中间存储，将 Langfuse 的 ClickHouse 数据从一个实例迁移到另一个实例。

## 概述

- **迁移方式**: ClickHouse 原生 BACKUP/RESTORE + 百度云 BOS（S3 兼容）
- **适用场景**: 生产环境跨实例迁移、单个 Database 迁移
- **优势**: 原子性操作、支持断点续传、数据校验、可回滚

## 前置条件

### 1. ClickHouse 版本要求

- ClickHouse 版本 >= 22.8（支持 BACKUP/RESTORE 命令）

```sql
-- 检查版本
SELECT version();
```

### 2. 百度云 BOS 准备

- 创建 BOS Bucket
- 获取 Access Key 和 Secret Key
- 确保有足够的存储空间

### 3. BOS 权限要求

确保 AK/SK 具有以下权限：
- `GetObject` - 读取对象
- `PutObject` - 写入对象
- `DeleteObject` - 删除对象
- `ListBucket` - 列出 Bucket 内容

## 百度云 BOS Endpoint

| 区域 | Endpoint |
|------|----------|
| 北京 | `bj.bcebos.com` |
| 广州 | `gz.bcebos.com` |
| 苏州 | `su.bcebos.com` |
| 香港 | `hkg.bcebos.com` |
| 新加坡 | `sin.bcebos.com` |

**URL 格式**:
```
https://<bucket-name>.<region>.bcebos.com/<path>/
```

**示例**:
```
https://my-backup-bucket.bj.bcebos.com/clickhouse-migration/20240120/
```

## Langfuse ClickHouse 核心表

| 表名 | 说明 | 重要性 |
|------|------|--------|
| `traces` | 追踪数据 | 核心 |
| `observations` | 观察数据（最大） | 核心 |
| `scores` | 评分数据 | 核心 |
| `event_log` | 事件日志 | 重要 |
| `dataset_run_items_rmt` | 数据集运行项 | 可选 |
| `blob_storage_file_log` | Blob 存储日志 | 可选 |

## 迁移流程

```
┌─────────────────────────────────────────────────────────────┐
│                      迁移流程图                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 停止 Langfuse Worker（停止写入）                         │
│         ↓                                                   │
│  2. 记录源数据量（用于验证）                                  │
│         ↓                                                   │
│  3. 备份到百度云 BOS                                         │
│         ↓                                                   │
│  4. 从 BOS 恢复到目标 ClickHouse                             │
│         ↓                                                   │
│  5. 验证数据量一致性                                         │
│         ↓                                                   │
│  6. 更新 Langfuse CLICKHOUSE_URL 配置                        │
│         ↓                                                   │
│  7. 重启 Langfuse 服务                                       │
│         ↓                                                   │
│  8. 功能验证 → 成功 → 清理 BOS 备份                          │
│              → 失败 → 回滚                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 迁移脚本

### 脚本 1: 迁移前检查 (pre-migration-check.sh)

```bash
#!/bin/bash
# pre-migration-check.sh
# 用途: 迁移前检查源数据库状态并记录数据量

SOURCE_CH="源ClickHouse地址"
SOURCE_DB="langfuse"

echo "=========================================="
echo "ClickHouse 迁移前检查"
echo "时间: $(date)"
echo "=========================================="

echo ""
echo "=== 1. 检查 ClickHouse 版本 ==="
clickhouse-client --host=$SOURCE_CH --query="SELECT version()"

echo ""
echo "=== 2. 检查数据库是否存在 ==="
clickhouse-client --host=$SOURCE_CH --query="SHOW DATABASES LIKE '${SOURCE_DB}'"

echo ""
echo "=== 3. 查看表列表 ==="
clickhouse-client --host=$SOURCE_CH --query="SHOW TABLES FROM ${SOURCE_DB}"

echo ""
echo "=== 4. 查看数据量和磁盘大小 ==="
clickhouse-client --host=$SOURCE_CH --query="
SELECT
    table,
    sum(rows) as total_rows,
    formatReadableSize(sum(bytes_on_disk)) as disk_size,
    count() as parts
FROM system.parts
WHERE database = '${SOURCE_DB}' AND active
GROUP BY table
ORDER BY sum(bytes_on_disk) DESC
FORMAT PrettyCompact
"

echo ""
echo "=== 5. 记录精确行数（用于迁移后验证）==="
clickhouse-client --host=$SOURCE_CH --query="
SELECT 'traces' as table_name, count() as row_count FROM ${SOURCE_DB}.traces
UNION ALL SELECT 'observations', count() FROM ${SOURCE_DB}.observations
UNION ALL SELECT 'scores', count() FROM ${SOURCE_DB}.scores
UNION ALL SELECT 'event_log', count() FROM ${SOURCE_DB}.event_log
FORMAT TSV
" | tee /tmp/source_row_counts.tsv

echo ""
echo "=== 检查完成 ==="
echo "源数据行数已保存到: /tmp/source_row_counts.tsv"
```

### 脚本 2: 执行迁移 (migrate-clickhouse-bos.sh)

```bash
#!/bin/bash
# migrate-clickhouse-bos.sh
# 用途: 使用百度云 BOS 执行 ClickHouse 数据迁移

set -e

# ============================================================
# 配置区域 - 请根据实际情况修改
# ============================================================

# ClickHouse 配置
SOURCE_CH="源ClickHouse地址"          # 例: 192.168.1.100
TARGET_CH="目标ClickHouse地址"        # 例: 192.168.1.200
SOURCE_DB="langfuse"                  # 源数据库名
TARGET_DB="langfuse"                  # 目标数据库名（可以改名）

# 百度云 BOS 配置
BOS_BUCKET="your-bucket-name"         # BOS Bucket 名称
BOS_REGION="bj"                       # 区域: bj/gz/su/hkg/sin
BOS_PATH="clickhouse-migration/$(date +%Y%m%d-%H%M%S)"
BOS_ENDPOINT="https://${BOS_BUCKET}.${BOS_REGION}.bcebos.com/${BOS_PATH}/"
ACCESS_KEY="your-bos-access-key"      # BOS Access Key
SECRET_KEY="your-bos-secret-key"      # BOS Secret Key

# ============================================================
# 迁移执行
# ============================================================

echo "=========================================="
echo "ClickHouse 数据迁移（百度云 BOS）"
echo "时间: $(date)"
echo "=========================================="
echo "源: ${SOURCE_CH}/${SOURCE_DB}"
echo "目标: ${TARGET_CH}/${TARGET_DB}"
echo "BOS: ${BOS_ENDPOINT}"
echo "=========================================="

# ------------------------------------------------------------
# 步骤 1: 确认停止写入
# ------------------------------------------------------------
echo ""
echo "[$(date '+%H:%M:%S')] 步骤 1/6: 确认停止写入"
echo "请确保已停止 Langfuse Worker，避免迁移期间有新数据写入"
echo "  - Docker: docker stop langfuse-worker"
echo "  - K8s: kubectl scale deployment worker --replicas=0"
echo ""
read -p "已停止 Langfuse Worker? (y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "请先停止写入再执行迁移"
    exit 1
fi

# ------------------------------------------------------------
# 步骤 2: 记录源数据量
# ------------------------------------------------------------
echo ""
echo "[$(date '+%H:%M:%S')] 步骤 2/6: 记录源数据量"

clickhouse-client --host=$SOURCE_CH --query="
SELECT 'traces' as tbl, count() as cnt FROM ${SOURCE_DB}.traces
UNION ALL SELECT 'observations', count() FROM ${SOURCE_DB}.observations
UNION ALL SELECT 'scores', count() FROM ${SOURCE_DB}.scores
UNION ALL SELECT 'event_log', count() FROM ${SOURCE_DB}.event_log
FORMAT TSV
" | tee /tmp/source_row_counts.tsv

echo "源数据行数:"
cat /tmp/source_row_counts.tsv

# ------------------------------------------------------------
# 步骤 3: 备份到 BOS
# ------------------------------------------------------------
echo ""
echo "[$(date '+%H:%M:%S')] 步骤 3/6: 备份到百度云 BOS"
echo "开始备份，请耐心等待..."

BACKUP_START=$(date +%s)

clickhouse-client --host=$SOURCE_CH --query="
BACKUP DATABASE ${SOURCE_DB}
TO S3('${BOS_ENDPOINT}', '${ACCESS_KEY}', '${SECRET_KEY}')
SETTINGS compression_level=3
"

BACKUP_END=$(date +%s)
BACKUP_DURATION=$((BACKUP_END - BACKUP_START))

# 检查备份状态
BACKUP_RESULT=$(clickhouse-client --host=$SOURCE_CH --query="
SELECT
    status,
    ifNull(error, '') as error,
    formatReadableSize(total_size) as size
FROM system.backups
ORDER BY start_time DESC
LIMIT 1
FORMAT TSV
")

BACKUP_STATUS=$(echo "$BACKUP_RESULT" | cut -f1)
BACKUP_ERROR=$(echo "$BACKUP_RESULT" | cut -f2)
BACKUP_SIZE=$(echo "$BACKUP_RESULT" | cut -f3)

if [ "$BACKUP_STATUS" != "BACKUP_CREATED" ]; then
    echo "❌ 备份失败!"
    echo "状态: $BACKUP_STATUS"
    echo "错误: $BACKUP_ERROR"
    exit 1
fi

echo "✅ 备份成功"
echo "   大小: $BACKUP_SIZE"
echo "   耗时: ${BACKUP_DURATION}秒"

# ------------------------------------------------------------
# 步骤 4: 从 BOS 恢复到目标
# ------------------------------------------------------------
echo ""
echo "[$(date '+%H:%M:%S')] 步骤 4/6: 从 BOS 恢复到目标 ClickHouse"
echo "开始恢复，请耐心等待..."

RESTORE_START=$(date +%s)

if [ "$SOURCE_DB" = "$TARGET_DB" ]; then
    clickhouse-client --host=$TARGET_CH --query="
    RESTORE DATABASE ${SOURCE_DB}
    FROM S3('${BOS_ENDPOINT}', '${ACCESS_KEY}', '${SECRET_KEY}')
    "
else
    clickhouse-client --host=$TARGET_CH --query="
    RESTORE DATABASE ${SOURCE_DB} AS ${TARGET_DB}
    FROM S3('${BOS_ENDPOINT}', '${ACCESS_KEY}', '${SECRET_KEY}')
    "
fi

RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))

# 检查恢复状态
RESTORE_STATUS=$(clickhouse-client --host=$TARGET_CH --query="
SELECT status FROM system.backups ORDER BY start_time DESC LIMIT 1
")

if [ "$RESTORE_STATUS" != "RESTORED" ]; then
    echo "❌ 恢复失败!"
    clickhouse-client --host=$TARGET_CH --query="
    SELECT status, error FROM system.backups ORDER BY start_time DESC LIMIT 1
    "
    exit 1
fi

echo "✅ 恢复成功"
echo "   耗时: ${RESTORE_DURATION}秒"

# ------------------------------------------------------------
# 步骤 5: 验证数据
# ------------------------------------------------------------
echo ""
echo "[$(date '+%H:%M:%S')] 步骤 5/6: 验证数据一致性"

clickhouse-client --host=$TARGET_CH --query="
SELECT 'traces' as tbl, count() as cnt FROM ${TARGET_DB}.traces
UNION ALL SELECT 'observations', count() FROM ${TARGET_DB}.observations
UNION ALL SELECT 'scores', count() FROM ${TARGET_DB}.scores
UNION ALL SELECT 'event_log', count() FROM ${TARGET_DB}.event_log
FORMAT TSV
" | tee /tmp/target_row_counts.tsv

echo ""
echo "数据对比:"
echo "--------------------"
printf "%-20s %15s %15s\n" "表" "源" "目标"
echo "--------------------"
paste /tmp/source_row_counts.tsv /tmp/target_row_counts.tsv | while read line; do
    src_tbl=$(echo "$line" | cut -f1)
    src_cnt=$(echo "$line" | cut -f2)
    tgt_cnt=$(echo "$line" | cut -f4)
    printf "%-20s %15s %15s\n" "$src_tbl" "$src_cnt" "$tgt_cnt"
done
echo "--------------------"

if diff /tmp/source_row_counts.tsv /tmp/target_row_counts.tsv > /dev/null; then
    echo "✅ 数据验证通过，行数完全一致"
else
    echo "⚠️  数据行数不一致，请检查!"
fi

# ------------------------------------------------------------
# 步骤 6: 完成
# ------------------------------------------------------------
echo ""
echo "[$(date '+%H:%M:%S')] 步骤 6/6: 迁移完成"
echo ""
echo "=========================================="
echo "迁移摘要"
echo "=========================================="
echo "备份耗时: ${BACKUP_DURATION}秒"
echo "恢复耗时: ${RESTORE_DURATION}秒"
echo "总耗时: $((BACKUP_DURATION + RESTORE_DURATION))秒"
echo "BOS 备份位置: ${BOS_ENDPOINT}"
echo ""
echo "=========================================="
echo "后续步骤"
echo "=========================================="
echo "1. 更新 Langfuse 配置文件中的 CLICKHOUSE_URL"
echo "   旧: clickhouse://${SOURCE_CH}:8123"
echo "   新: clickhouse://${TARGET_CH}:8123"
echo ""
echo "2. 重启 Langfuse 服务"
echo "   - Docker: docker-compose restart"
echo "   - K8s: kubectl rollout restart deployment"
echo ""
echo "3. 验证 Langfuse 功能正常"
echo ""
echo "4. 确认无问题后，可清理 BOS 备份节省存储费用"
echo "=========================================="
```

### 脚本 3: 回滚 (rollback.sh)

```bash
#!/bin/bash
# rollback.sh
# 用途: 迁移失败时回滚

set -e

# 配置 - 使用迁移时的相同配置
TARGET_CH="目标ClickHouse地址"
TARGET_DB="langfuse"
BOS_ENDPOINT="https://your-bucket.bj.bcebos.com/clickhouse-migration/xxxxxxxx/"  # 迁移时的备份路径
ACCESS_KEY="your-bos-access-key"
SECRET_KEY="your-bos-secret-key"

echo "=========================================="
echo "回滚操作"
echo "时间: $(date)"
echo "=========================================="
echo "⚠️  警告: 此操作将删除目标数据库并重新恢复"
read -p "确认执行回滚? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "取消回滚"
    exit 0
fi

echo ""
echo "[$(date '+%H:%M:%S')] 删除目标数据库..."
clickhouse-client --host=$TARGET_CH --query="DROP DATABASE IF EXISTS ${TARGET_DB}"

echo ""
echo "[$(date '+%H:%M:%S')] 从 BOS 重新恢复..."
clickhouse-client --host=$TARGET_CH --query="
RESTORE DATABASE langfuse AS ${TARGET_DB}
FROM S3('${BOS_ENDPOINT}', '${ACCESS_KEY}', '${SECRET_KEY}')
"

echo ""
echo "✅ 回滚完成"
```

## SQL 命令参考

### 备份命令

```sql
-- 备份整个数据库
BACKUP DATABASE langfuse
TO S3('https://bucket.bj.bcebos.com/backup/', 'AK', 'SK');

-- 备份指定表
BACKUP TABLE langfuse.traces, langfuse.observations, langfuse.scores
TO S3('https://bucket.bj.bcebos.com/backup/', 'AK', 'SK');

-- 带压缩级别
BACKUP DATABASE langfuse
TO S3('https://bucket.bj.bcebos.com/backup/', 'AK', 'SK')
SETTINGS compression_level=3;
```

### 恢复命令

```sql
-- 恢复到同名数据库
RESTORE DATABASE langfuse
FROM S3('https://bucket.bj.bcebos.com/backup/', 'AK', 'SK');

-- 恢复并重命名数据库
RESTORE DATABASE langfuse AS langfuse_new
FROM S3('https://bucket.bj.bcebos.com/backup/', 'AK', 'SK');

-- 恢复到已存在的表（追加数据）
RESTORE DATABASE langfuse
FROM S3('https://bucket.bj.bcebos.com/backup/', 'AK', 'SK')
SETTINGS allow_non_empty_tables=true;
```

### 查看备份状态

```sql
-- 查看备份/恢复历史
SELECT
    name,
    status,
    error,
    start_time,
    end_time,
    formatReadableSize(total_size) as size,
    end_time - start_time as duration
FROM system.backups
ORDER BY start_time DESC
LIMIT 10;
```

## 常见问题

### 1. 连接 BOS 失败

**症状**: `Connection refused` 或 `Access denied`

**解决方案**:
```sql
-- 检查 endpoint 格式是否正确
-- 正确: https://bucket.bj.bcebos.com/path/
-- 错误: https://bj.bcebos.com/bucket/path/

-- 检查 AK/SK 是否正确
-- 检查 Bucket 权限设置
```

### 2. 备份超时

**症状**: 大表备份时间过长

**解决方案**:
```sql
-- 分表备份
BACKUP TABLE langfuse.traces
TO S3('https://bucket.bj.bcebos.com/backup/traces/', 'AK', 'SK');

BACKUP TABLE langfuse.observations
TO S3('https://bucket.bj.bcebos.com/backup/observations/', 'AK', 'SK');
```

### 3. 目标数据库已存在

**症状**: `Database already exists`

**解决方案**:
```sql
-- 方案1: 重命名恢复
RESTORE DATABASE langfuse AS langfuse_new
FROM S3('...', 'AK', 'SK');

-- 方案2: 先删除再恢复（危险）
DROP DATABASE langfuse;
RESTORE DATABASE langfuse FROM S3('...', 'AK', 'SK');
```

### 4. SSL 证书问题

**症状**: `SSL certificate problem`

**解决方案**:
```sql
-- 临时使用 HTTP（仅测试环境）
BACKUP DATABASE langfuse
TO S3('http://bucket.bj.bcebos.com/backup/', 'AK', 'SK');
```

## 注意事项

1. **停机窗口**: 迁移期间必须停止 Langfuse Worker，避免数据不一致
2. **网络带宽**: 大数据量迁移需要充足的网络带宽
3. **存储空间**: 确保 BOS 有足够空间存放备份
4. **保留备份**: 建议保留 BOS 备份 7 天，确认无问题后再删除
5. **增量迁移**: 如果数据量特别大，可考虑先全量迁移，再增量同步

## 参考链接

- [ClickHouse BACKUP 文档](https://clickhouse.com/docs/en/operations/backup)
- [百度云 BOS 文档](https://cloud.baidu.com/doc/BOS/index.html)
- [Langfuse 官方文档](https://langfuse.com/docs)
