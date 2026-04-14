#!/bin/bash

PORT=4000
echo "---------------------------------------"
echo "🚀 正在启动 Agent DevTools 后端服务..."
echo "---------------------------------------"

# 检查端口占用
PID=$(lsof -t -i:$PORT)

if [ -z "$PID" ]; then
    echo "[1/2] 端口 $PORT 是空闲的。"
else
    echo "[1/2] 端口 $PORT 被进程 $PID 占用。正在清理..."
    kill -9 $PID
    sleep 1
    echo "      旧进程已终止。"
fi

echo "[2/2] 正在运行 node server.cjs..."
node server.cjs
