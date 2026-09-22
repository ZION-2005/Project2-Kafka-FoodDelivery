const ORDER_API = "http://localhost:4000";
const POLL_MS = 2000;

// Restaurant only owns the order up through READY_FOR_PICKUP - PICKED_UP -> DELIVERED
// is the rider's job, done from the Rider app instead.
const STATUS_FLOW = {
  PLACED: { next: "CONFIRMED", label: "Confirm" },
  CONFIRMED: { next: "PREPARING", label: "Start Preparing" },
  PREPARING: { next: "READY_FOR_PICKUP", label: "Mark Ready" },
  READY_FOR_PICKUP: null,
  PICKED_UP: null,
  DELIVERED: null,
  CANCELLED: null,
};

const COLUMNS = ["PLACED", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERED"];

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

async function patchStatus(orderId, status) {
  await fetch(`${ORDER_API}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  refreshOrders();
}

function orderCard(order) {
  const flow = STATUS_FLOW[order.status];
  const itemsText = (order.items || []).join(", ");
  let actions = "";
  if (flow) {
    actions += `<button class="action-btn primary" data-action="advance" data-id="${order.orderId}" data-status="${flow.next}">${flow.label}</button>`;
  }
  if (["PLACED", "CONFIRMED", "PREPARING"].includes(order.status)) {
    actions += `<button class="action-btn danger" data-action="cancel" data-id="${order.orderId}">Cancel</button>`;
  }
  const riderLine = order.riderId ? `<div class="order-rider">Rider: ${order.riderId}</div>` : "";

  return `
    <div class="order-card">
      <div class="order-card-top">
        <span class="order-id">#${order.orderId}</span>
        <span class="order-time">${timeAgo(order.createdAt)}</span>
      </div>
      <div class="order-customer">${order.customerId}</div>
      <div class="order-items">${itemsText}</div>
      ${riderLine}
      <div class="card-actions">${actions}</div>
    </div>
  `;
}

async function refreshOrders() {
  const res = await fetch(`${ORDER_API}/orders`);
  const orders = await res.json();

  COLUMNS.forEach((status) => {
    const col = document.getElementById(`col-${status}`);
    const inColumn = orders.filter((o) => o.status === status);
    col.innerHTML = inColumn.length
      ? inColumn.map(orderCard).join("")
      : `<div class="empty-state">No orders</div>`;
  });

  const active = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status)).length;
  const ready = orders.filter((o) => o.status === "READY_FOR_PICKUP").length;
  const transit = orders.filter((o) => o.status === "PICKED_UP").length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;

  document.getElementById("statActive").textContent = active;
  document.getElementById("statReady").textContent = ready;
  document.getElementById("statTransit").textContent = transit;
  document.getElementById("statDelivered").textContent = delivered;

  document.querySelectorAll('[data-action="advance"]').forEach((btn) => {
    btn.addEventListener("click", () => patchStatus(btn.dataset.id, btn.dataset.status));
  });
  document.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener("click", () => patchStatus(btn.dataset.id, "CANCELLED"));
  });
}

// Modal wiring
const backdrop = document.getElementById("modalBackdrop");
document.getElementById("newOrderBtn").addEventListener("click", () => backdrop.classList.add("open"));
document.getElementById("closeModalBtn").addEventListener("click", () => backdrop.classList.remove("open"));
document.getElementById("cancelModalBtn").addEventListener("click", () => backdrop.classList.remove("open"));
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) backdrop.classList.remove("open");
});

document.getElementById("newOrderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const restaurantId = document.getElementById("restaurantId").value;
  const customerId = document.getElementById("customerId").value.trim();
  const items = document.getElementById("items").value.split(",").map((s) => s.trim()).filter(Boolean);

  await fetch(`${ORDER_API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId, customerId, items }),
  });

  e.target.reset();
  backdrop.classList.remove("open");
  refreshOrders();
});

refreshOrders();
setInterval(refreshOrders, POLL_MS);
