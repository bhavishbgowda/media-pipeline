#!/usr/bin/env bash
# End-to-end smoke test against a running instance (local or docker compose).
# Usage: BASE_URL=http://localhost:3000 ./scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
IMAGE_PATH="${IMAGE_PATH:-$(dirname "$0")/sample-vehicle.jpg}"

echo "1) Health check"
curl -sf "$BASE_URL/health" | tee /tmp/health.json
echo

if [ ! -f "$IMAGE_PATH" ]; then
  echo "Generating sample image..."
  node "$(dirname "$0")/generate-sample-image.js"
fi

echo "2) Upload image"
UPLOAD_RESPONSE=$(curl -sf -X POST "$BASE_URL/upload" -F "image=@${IMAGE_PATH}")
echo "$UPLOAD_RESPONSE"
PROCESSING_ID=$(echo "$UPLOAD_RESPONSE" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).processingId))")
echo "processingId=$PROCESSING_ID"
echo

echo "3) Poll status until COMPLETED or FAILED (max 30s)"
for i in $(seq 1 15); do
  STATUS_RESPONSE=$(curl -sf "$BASE_URL/status/$PROCESSING_ID")
  STATUS=$(echo "$STATUS_RESPONSE" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).status))")
  echo "  attempt $i: status=$STATUS"
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
    break
  fi
  sleep 2
done

if [ "$STATUS" = "COMPLETED" ]; then
  echo "4) Fetch result"
  curl -sf "$BASE_URL/result/$PROCESSING_ID"
  echo
elif [ "$STATUS" = "FAILED" ]; then
  echo "4) Fetch failure reason"
  curl -sf "$BASE_URL/failure/$PROCESSING_ID"
  echo
else
  echo "Timed out waiting for processing to finish."
  exit 1
fi

echo
echo "Smoke test passed."
