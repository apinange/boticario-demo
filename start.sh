#!/bin/bash

set -e

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    ./stop.sh
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT TERM

echo "🚀 Starting WhatsApp Integration Services..."

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Start PostgreSQL and Redis
echo "📦 Starting PostgreSQL and Redis..."
docker-compose up -d postgres redis

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Start Evolution API
echo "🔧 Starting Evolution API..."
cd evolution-api
npm run start > ../evolution-api.log 2>&1 &
EVOLUTION_PID=$!
echo $EVOLUTION_PID > ../evolution-api.pid
cd "$SCRIPT_DIR"

# Wait for Evolution API to be ready
echo "⏳ Waiting for Evolution API to start..."
sleep 10

# Check if Evolution API is responding
if curl -s http://localhost:8080/ -H "apikey: ${EVOLUTION_API_KEY:-429683C4C977415CAAFCCE10F7D57E11}" > /dev/null 2>&1; then
    echo "✅ Evolution API is running on http://localhost:8080"
    echo "📱 Manager Web: http://localhost:8080/manager/"
else
    echo "⚠️  Evolution API might not be ready yet. Check logs: tail -f evolution-api.log"
fi

# Check and kill any process using port 3000
echo ""
echo "🔍 Checking port 3000..."
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "⚠️  Port 3000 is in use. Killing existing process..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start Webhook Server (in foreground to see logs)
echo ""
echo "🔧 Starting Webhook Server..."
echo "📋 This will run in foreground - you'll see all logs here"
echo "📋 Press Ctrl+C to stop everything"
echo ""
echo "✅ All background services started:"
echo "   - PostgreSQL: docker-compose ps postgres"
echo "   - Redis: docker-compose ps redis"
echo "   - Evolution API: http://localhost:8080 (PID: $EVOLUTION_PID)"
echo ""
echo "🚀 Starting Webhook Server (logs will appear below)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run webhook in foreground so logs appear in terminal
# Make sure we're in the project root
cd "$SCRIPT_DIR"
npm run webhook


