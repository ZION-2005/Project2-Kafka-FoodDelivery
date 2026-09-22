#!/usr/bin/env bash
# Runs the same demo as demo-requests.http but with plain curl, so it works
# without Postman or any editor extension. Run from any directory once the
# stack is up: ./postman/demo.sh
set -euo pipefail

ORDER_HOST=${ORDER_HOST:-http://localhost:4000}
CUSTOMER_HOST=${CUSTOMER_HOST:-http://localhost:4001}
RIDER_HOST=${RIDER_HOST:-http://localhost:4002}
NOTIFICATION_HOST=${NOTIFICATION_HOST:-http://localhost:4003}

echo "== 1. Create order (PLACED) =="
ORDER=$(curl -s -X POST "$ORDER_HOST/orders" \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"resto-1","customerId":"cust-1","items":["Pad Thai","Thai Iced Tea"]}')
echo "$ORDER"
ORDER_ID=$(echo "$ORDER" | node -pe 'JSON.parse(require("fs").readFileSync(0)).orderId')

sleep 1
echo "== 2. CONFIRMED =="
curl -s -X PATCH "$ORDER_HOST/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d '{"status":"CONFIRMED"}'; echo

sleep 1
echo "== 3. READY_FOR_PICKUP =="
curl -s -X PATCH "$ORDER_HOST/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d '{"status":"READY_FOR_PICKUP"}'; echo

sleep 1
echo "== 4. PICKED_UP by rider-9 =="
curl -s -X PATCH "$ORDER_HOST/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d '{"status":"PICKED_UP","riderId":"rider-9"}'; echo

sleep 1
echo "== 5. DELIVERED =="
curl -s -X PATCH "$ORDER_HOST/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d '{"status":"DELIVERED"}'; echo

sleep 1
echo
echo "== Customer feed (learned everything from Kafka, not from order-service directly) =="
curl -s "$CUSTOMER_HOST/feed/cust-1"; echo
echo
echo "== Rider pickup pool (should be empty - order was already picked up) =="
curl -s "$RIDER_HOST/pickup-pool"; echo
echo
echo "== Notifications sent =="
curl -s "$NOTIFICATION_HOST/notifications"; echo
