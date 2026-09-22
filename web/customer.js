const ORDER_API = "http://localhost:4000";
const CUSTOMER_API = "http://localhost:4001";
const POLL_MS = 2000;

const STAGES = [
  { key: "PLACED", label: "Placed" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY_FOR_PICKUP", label: "Ready" },
  { key: "PICKED_UP", label: "On the way" },
  { key: "DELIVERED", label: "Delivered" },
];

let currentCustomer = null;
let pollHandle = null;

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function stepperHtml(order) {
  if (order.status === "CANCELLED") {
    return `<div class="cancelled-banner">This order was cancelled.</div>`;
  }
  const currentIndex = STAGES.findIndex((s) => s.key === order.status);
  return `
    <div class="stepper">
      ${STAGES.map((stage, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
        return `
          <div class="step step-${state}">
            <div class="step-dot"></div>
            <div class="step-label">${stage.label}</div>
          </div>
          ${i < STAGES.length - 1 ? `<div class="step-line step-line-${i < currentIndex ? "done" : "todo"}"></div>` : ""}
        `;
      }).join("")}
    </div>
  `;
}

function orderTrackingCard(order, feedForOrder) {
  const itemsText = (order.items || []).join(", ");
  const riderLine = order.riderId
    ? `<div class="tracking-rider">Your rider: <strong>${order.riderId}</strong></div>`
    : "";

  const historyHtml = feedForOrder.length
    ? `<div class="tracking-history">
        ${feedForOrder
          .slice()
          .reverse()
          .map((f) => `<div class="history-line"><span>${f.message}</span><span class="muted">${timeAgo(f.receivedAt)}</span></div>`)
          .join("")}
      </div>`
    : "";

  return `
    <div class="tracking-card">
      <div class="tracking-card-top">
        <div>
          <div class="tracking-order-id">Order #${order.orderId}</div>
          <div class="muted">${order.restaurantId}</div>
        </div>
        <div class="muted">${timeAgo(order.createdAt)}</div>
      </div>
      <div class="tracking-items">${itemsText}</div>
      ${stepperHtml(order)}
      ${riderLine}
      ${historyHtml}
    </div>
  `;
}

async function refreshTracking() {
  if (!currentCustomer) return;
  const [ordersRes, feedRes] = await Promise.all([
    fetch(`${ORDER_API}/orders`),
    fetch(`${CUSTOMER_API}/feed/${encodeURIComponent(currentCustomer)}`),
  ]);
  const allOrders = await ordersRes.json();
  const feed = await feedRes.json();

  const myOrders = allOrders
    .filter((o) => o.customerId === currentCustomer)
    .sort((a, b) => b.orderId - a.orderId);

  const list = document.getElementById("orderList");
  list.innerHTML = myOrders.length
    ? myOrders.map((o) => orderTrackingCard(o, feed.filter((f) => f.orderId === o.orderId))).join("")
    : `<div class="empty-state">No orders yet for this name.</div>`;
}

function showTracking(customerId) {
  currentCustomer = customerId;
  document.getElementById("identifyCard").classList.add("hidden");
  document.getElementById("trackingView").classList.remove("hidden");
  document.getElementById("customerLabel").textContent = customerId;
  refreshTracking();
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(refreshTracking, POLL_MS);
}

document.getElementById("identifyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = document.getElementById("customerIdInput").value.trim();
  if (value) showTracking(value);
});

document.getElementById("switchUserBtn").addEventListener("click", () => {
  currentCustomer = null;
  if (pollHandle) clearInterval(pollHandle);
  document.getElementById("trackingView").classList.add("hidden");
  document.getElementById("identifyCard").classList.remove("hidden");
  document.getElementById("customerIdInput").value = "";
});
