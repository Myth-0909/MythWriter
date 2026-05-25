#!/bin/bash

# MythWriter 一键启动脚本 - 同时启动后端、前端和 Redis

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/document"
BACKEND_DIR="$ROOT_DIR/server"
BACKEND_PORT=3000
FRONTEND_PORT=1420
REDIS_PORT=6379
REDIS_DATA_DIR="$ROOT_DIR/.redis-data"
REDIS_PID=""
REDIS_STARTED_BY_US=false

cleanup() {
  echo ""
  echo "正在停止所有服务..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null

  if [ "$REDIS_STARTED_BY_US" = true ] && [ -n "$REDIS_PID" ]; then
    echo "[Redis] 停止本地 Redis (PID: $REDIS_PID)..."
    kill $REDIS_PID 2>/dev/null
    wait $REDIS_PID 2>/dev/null
  fi

  echo "服务已停止"
  exit 0
}

trap cleanup SIGINT SIGTERM

# 检查目录是否存在
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "错误: 前端目录不存在 $FRONTEND_DIR"
  exit 1
fi

if [ ! -d "$BACKEND_DIR" ]; then
  echo "错误: 后端目录不存在 $BACKEND_DIR"
  exit 1
fi

# 关闭已占用的端口
kill_port() {
  local port=$1
  local pid=$(lsof -ti :"$port" 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "[端口] 检测到端口 $port 已被占用 (PID: $pid)，正在释放..."
    kill -9 $pid 2>/dev/null
    sleep 0.5
  fi
}

# 检查是否支持桌面端
has_cargo() {
  command -v cargo &>/dev/null
}

echo "==============================="
echo "  MythWriter 一键启动"
echo "==============================="

# 释放端口
kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT

# 启动 Redis（如果本地未运行）
start_redis() {
  if command -v redis-server &>/dev/null; then
    # 检查 Redis 是否已经在运行
    if redis-cli -p $REDIS_PORT ping &>/dev/null 2>&1; then
      echo "[Redis] 检测到 Redis 已在运行 (port $REDIS_PORT)，直接复用"
      REDIS_STARTED_BY_US=false
    else
      echo "[Redis] 启动本地 Redis (port $REDIS_PORT)..."
      mkdir -p "$REDIS_DATA_DIR"
      redis-server \
        --port $REDIS_PORT \
        --dir "$REDIS_DATA_DIR" \
        --dbfilename dump.rdb \
        --daemonize no \
        --save "" \
        --appendonly no \
        --logfile /dev/null &
      REDIS_PID=$!
      REDIS_STARTED_BY_US=true

      # 等待 Redis 就绪
      for i in $(seq 1 10); do
        if redis-cli -p $REDIS_PORT ping &>/dev/null 2>&1; then
          echo "[Redis] 就绪"
          break
        fi
        sleep 0.3
      done
    fi
  else
    echo "[Redis] redis-server 未安装，跳过（速率限制/会话管理将不可用）"
    echo "[Redis] 安装: brew install redis"
  fi
}

start_redis

# 启动后端
echo "[后端] 启动 API 服务 (port $BACKEND_PORT)..."
cd "$BACKEND_DIR" && npm run dev &
BACKEND_PID=$!

# 启动前端
if has_cargo; then
  echo "[桌面端] 启动 Tauri 应用..."
  cd "$FRONTEND_DIR" && pnpm tauri dev &
  FRONTEND_PID=$!
  echo ""
  echo "后端 API: http://localhost:$BACKEND_PORT"
  echo "后端健康检查: http://localhost:$BACKEND_PORT/api/health"
else
  echo "[前端] Rust/Cargo 未安装，使用网页模式 (port $FRONTEND_PORT)..."
  echo "[前端] 如需桌面端，请安装 Rust: https://rustup.rs"
  cd "$FRONTEND_DIR" && pnpm dev &
  FRONTEND_PID=$!
  echo ""
  echo "前端: http://localhost:$FRONTEND_PORT"
  echo "后端 API: http://localhost:$BACKEND_PORT"
  echo "后端健康检查: http://localhost:$BACKEND_PORT/api/health"
fi

echo ""
echo "按 Ctrl+C 停止所有服务"
echo "==============================="

wait
