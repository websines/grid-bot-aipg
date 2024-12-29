#!/bin/bash

# Start the backend server
echo "Starting FastAPI backend..."
cd backend
python3 -m uvicorn app.main:app --reload &
BACKEND_PID=$!

# Wait a bit for backend to initialize
sleep 2

# Start the frontend
echo "Starting Next.js frontend..."
cd ..
bun run dev &
FRONTEND_PID=$!

# Handle script termination
trap "kill $BACKEND_PID $FRONTEND_PID" SIGINT SIGTERM EXIT

# Keep script running
wait
