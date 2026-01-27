#!/bin/bash

echo "🛑 Stopping WhatsApp Integration Services..."

# Stop Evolution API
if [ -f evolution-api.pid ]; then
    PID=$(cat evolution-api.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "🛑 Stopping Evolution API (PID: $PID)..."
        kill $PID 2>/dev/null || true
        sleep 2
        kill -9 $PID 2>/dev/null || true
        rm evolution-api.pid
    fi
fi

# Kill any remaining node/tsx processes for evolution-api
pkill -f "tsx.*evolution-api" 2>/dev/null || true
pkill -f "node.*evolution-api" 2>/dev/null || true

# Stop Webhook Server
if [ -f webhook.pid ]; then
    PID=$(cat webhook.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "🛑 Stopping Webhook Server (PID: $PID)..."
        kill $PID 2>/dev/null || true
        sleep 2
        kill -9 $PID 2>/dev/null || true
        rm webhook.pid
    fi
fi

# Kill any remaining webhook server processes
pkill -f "tsx.*webhook-server" 2>/dev/null || true
pkill -f "node.*webhook-server" 2>/dev/null || true

# Stop Docker services
echo "📦 Stopping PostgreSQL and Redis..."
docker-compose stop postgres redis

echo "✅ All services stopped"


