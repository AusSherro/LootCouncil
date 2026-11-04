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
echo "--- Database migrations ---"
echo "This script does not run migrations automatically; run them deliberately."
echo ""
echo "FIRST deploy against an existing database that predates migration tracking:"
echo "  1. Back it up:"
echo "       docker compose exec loot-council cp /app/data/loot-council.db /app/data/loot-council.pre-baseline.db"
echo "  2. Baseline it (records the migration as applied WITHOUT running any SQL —"
echo "     the schema already matches, verified via 'prisma migrate diff'):"
echo "       docker compose exec loot-council npx prisma migrate resolve --applied 20260726120000_init"
echo ""
echo "EVERY later deploy:"
echo "       docker compose exec loot-council npx prisma migrate deploy"
echo ""
echo "Verify at any time that the database matches the schema:"
echo "       docker compose exec loot-council npx prisma migrate status"
