#!/bin/bash

# Configuration
APP_DIR="/var/www/SuperConnections"
LOG_FILE="/var/log/webhook_deploy_superconnections.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "Webhook triggered! Starting deployment..."

# Ensure we are in the right directory
cd "$APP_DIR" || { log "Failed to cd to $APP_DIR"; exit 1; }

# Fetch and Reset
log "Fetching changes..."
git fetch origin main >> "$LOG_FILE" 2>&1
git reset --hard origin/main >> "$LOG_FILE" 2>&1

# Install & Build
log "Installing dependencies..."
npm ci --omit=dev >> "$LOG_FILE" 2>&1

log "Building..."
npm run build >> "$LOG_FILE" 2>&1

# Restart
log "Restarting App..."
pm2 restart superconnections >> "$LOG_FILE" 2>&1

log "Deployment Complete."
