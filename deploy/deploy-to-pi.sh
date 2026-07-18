#!/bin/bash
# Deploy Loot Council to Raspberry Pi
# Usage: Run from the deploy/ directory on the Pi, OR
#        push from your PC with: deploy-to-pi.sh

set -e

PI_HOST="pi@192.168.68.120"
REMOTE_DIR="/home/pi/services"

echo "=== Creating remote directory ==="
ssh $PI_HOST "mkdir -p $REMOTE_DIR/loot-council"

echo "=== Syncing project files to Pi ==="
cd "$(dirname "$0")/.."

# Sync the app source (respecting .dockerignore-like excludes)
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.planning' \
  --exclude='.agents' \
  --exclude='tmp-*' \
  --exclude='docs' \
  --exclude='deploy' \
  --exclude='*.lnk' \
  --exclude='start-budget.bat' \
  ./ "$PI_HOST:$REMOTE_DIR/loot-council/"

echo "=== Syncing deploy configs ==="
rsync -avz --progress \
  deploy/docker-compose.yml \
  deploy/Caddyfile \
  "$PI_HOST:$REMOTE_DIR/"

echo "=== Building and starting containers on Pi ==="
ssh $PI_HOST "cd $REMOTE_DIR && docker compose up -d --build"

echo ""
echo "=== Deploy complete! ==="
echo "Loot Council: http://192.168.68.120/"
echo ""
echo "Database migration requires manual review."
echo "Back up the database and resolve ISSUES.md CRIT-6 before running prisma migrate deploy."
echo "The Compose file does not yet define the Loot Council app service; resolve CRIT-7 before relying on this script for app deployment."
