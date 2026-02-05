#!/bin/sh
set -e

QDRANT_URL="${QDRANT_URL:-http://qdrant:6333}"

echo "[spellbook] Waiting for Qdrant..."
until wget -q --spider "${QDRANT_URL}/healthz" 2>/dev/null; do
  sleep 1
done
echo "[spellbook] Qdrant is ready."

# Auto-seed on first start (check if collection exists and has system guides)
COLLECTION="${QDRANT_COLLECTION:-chunks}"
COLLECTION_EXISTS=$(wget -q -O - "${QDRANT_URL}/collections/${COLLECTION}" 2>/dev/null || echo "")

if echo "$COLLECTION_EXISTS" | grep -q '"status":"ok"'; then
  POINT_COUNT=$(echo "$COLLECTION_EXISTS" | grep -o '"points_count":[0-9]*' | grep -o '[0-9]*' || echo "0")
  if [ "${POINT_COUNT:-0}" = "0" ]; then
    echo "[spellbook] Empty collection detected. Running seed..."
    bun run src/scripts/seed-system-guides.ts
    echo "[spellbook] Seed complete."
  else
    echo "[spellbook] Collection has ${POINT_COUNT} points. Skipping seed."
  fi
else
  echo "[spellbook] Collection not found. Will seed after server creates it..."
  # Start server in background, wait for collection, then seed
  bun run src/index.ts &
  SERVER_PID=$!

  # Wait for collection to be created by the server
  echo "[spellbook] Waiting for collection to be created..."
  for i in $(seq 1 30); do
    CHECK=$(wget -q -O - "${QDRANT_URL}/collections/${COLLECTION}" 2>/dev/null || echo "")
    if echo "$CHECK" | grep -q '"status":"ok"'; then
      echo "[spellbook] Collection created. Running seed..."
      bun run src/scripts/seed-system-guides.ts
      echo "[spellbook] Seed complete."
      break
    fi
    sleep 1
  done

  # Wait for server process
  wait $SERVER_PID
  exit $?
fi

echo "[spellbook] Starting server..."
exec bun run src/index.ts
