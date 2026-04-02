#!/bin/bash

echo "=================================================="
echo "  Voice AI Spanish Tutor - Startup Script"
echo "=================================================="

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Install it with: brew install node"
    echo "   Or download from: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd web
npm install

# Go back to root
cd ..

# Check for Python dependencies
echo ""
echo "Checking Python dependencies..."
pip3 install -q fastapi uvicorn python-multipart elevenlabs aiofiles python-dotenv google-genai

echo ""
echo "=================================================="
echo "  Starting servers..."
echo "=================================================="
echo ""
echo "Starting backend on http://localhost:8000"
echo "Starting frontend on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start backend in background
python3 -m uvicorn server.main:app --reload --port 8000 &
BACKEND_PID=$!

# Give backend time to start
sleep 2

# Start frontend
cd web
npm run dev &
FRONTEND_PID=$!

cd ..

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
