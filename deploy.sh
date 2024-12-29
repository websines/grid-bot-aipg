#!/bin/bash

# Install dependencies
echo "Installing dependencies..."
npm install
pip install -r backend/requirements.txt
pip install gunicorn uvicorn

# Build frontend
echo "Building frontend..."
npm run build

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Start or restart the applications using PM2
echo "Starting applications with PM2..."
pm2 start ecosystem.config.js

# Save PM2 process list and configure to start on system startup
pm2 save
pm2 startup

echo "Deployment complete! Make sure to:"
echo "1. Copy nginx.conf to /etc/nginx/sites-available/"
echo "2. Create symbolic link to sites-enabled"
echo "3. Test and reload nginx configuration"
echo "4. Configure SSL with certbot if needed"
