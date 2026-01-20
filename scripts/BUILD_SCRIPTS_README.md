# Docker Build Scripts

自动重试的Docker镜像构建脚本，支持后台运行。

## 脚本说明

### 1. build-docker-retry.sh
构建 web 镜像（langfuse-web:20260109）

### 2. build-worker-docker-retry.sh
构建 worker 镜像（langfuse:20260108）

### 3. run-build-background.sh
后台构建启动器，管理构建任务

## 使用方法

### 启动构建

```bash
# 启动web和worker两个构建任务（后台运行）
./scripts/run-build-background.sh

# 只启动web构建
./scripts/run-build-background.sh web

# 只启动worker构建
./scripts/run-build-background.sh worker
```

### 查看状态

```bash
# 查看构建状态和最近日志
./scripts/run-build-background.sh status
```

### 停止构建

```bash
# 停止所有构建任务
./scripts/run-build-background.sh stop
```

### 手动查看日志

```bash
# 实时查看最新日志
tail -f logs/web-build-*.log
tail -f logs/worker-build-*.log

# 查看所有日志文件
ls -lh logs/
```

## 特性

✅ 自动重试直到构建成功
✅ 后台运行，可关闭终端
✅ 日志自动记录到 `logs/` 目录
✅ 支持同时运行多个构建任务
✅ 防止重复启动
✅ PID管理，可随时停止

## 注意事项

- 脚本会无限重试直到成功，如遇到持续性问题请手动停止
- 每次启动会创建新的日志文件，旧日志会保留
- 构建成功后脚本会自动退出
