#!/bin/bash
set -e

echo "Starting School Management App..."

# Start API server in background (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev &
API_PID=$!
echo "API server starting (PID $API_PID)..."

# Start Expo web in background (port 18115)
PORT=18115 pnpm --filter @workspace/mobile run dev &
EXPO_PID=$!
echo "Expo web starting (PID $EXPO_PID)..."

# Trap signals to kill children on exit
trap "kill $API_PID $EXPO_PID 2>/dev/null; exit" SIGINT SIGTERM EXIT

# Run the proxy in the foreground (port 5000)
echo "Starting proxy on :5000..."
node proxy.mjs
