const ORDER_API = "http://localhost:4000";
const RIDER_API = "http://localhost:4002";
const NOTIFICATION_API = "http://localhost:4003";

const POLL_MS = 2000;

const STATUS_FLOW = {
  PLACED: { next: "CONFIRMED", label: "Confirm" },
  CONFIRMED: { next: "PREPARING", label: "Start Preparing" },
  PREPARING: { next: "READY_FOR_PICKUP", label: "Mark Ready" },
  READY_FOR_PICKUP: null,
  PICKED_UP: { next: "DELIVERED", label: "Mark Delivered" },
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

async function patchStatus(orderId, status, riderId) {
  const body = { status };
  if (riderId) body.riderId = riderId;
  await fetch(`${ORDER_API}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  refreshAll();
}

function randomRiderId() {
  const names = ["Ren", "Kaito", "Mira", "Suri", "Tao", "Nok"];
  return `${names[Math.floor(Math.random() * names.length)]}-${Math.floor(Math.random() * 90 + 10)}`;
}

function orderCard(order) {
  const flow = STATUS_FLOW[order.status];
  const itemsText = (order.items || []).join(", ");
  let actions = "";
  if (flow) {
    actions += `<button class="action-btn primary" data-action="advance" data-id="${order.orderId}" data-status="${flow.next}">${flow.label}</button>`;
  }
  if (order.status !== "DELIVERED" && order.status !== "CANCELLED" && order.status !== "PICKED_UP") {
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

async function refreshRiderBoard() {
  const res = await fetch(`${RIDER_API}/pickup-pool`);
  const jobs = await res.json();

  document.getElementById("riderCount").textContent = `${jobs.length} open`;
  const list = document.getElementById("riderList");

  list.innerHTML = jobs.length
    ? jobs
        .map(
          (j) => `
      <div class="rider-job">
        <div class="rider-job-top">
          <span class="rider-job-id">#${j.orderId}</span>
          <span class="rider-job-meta">${timeAgo(j.updatedAt)}</span>
        </div>
        <div class="rider-job-meta">${j.customerId} &middot; ${j.restaurantId}</div>
        <button class="claim-btn" data-action="claim" data-id="${j.orderId}">Accept Pickup</button>
      </div>
    `
        )
        .join("")
    : `<div class="empty-state">No pickups waiting right now.</div>`;

  document.querySelectorAll('[data-action="claim"]').forEach((btn) => {
    btn.addEventListener("click", () => patchStatus(btn.dataset.id, "PICKED_UP", randomRiderId()));
  });
}

async function refreshNotifications() {
  const res = await fetch(`${NOTIFICATION_API}/notifications`);
  const notifications = await res.json();

  document.getElementById("notifBadge").textContent = notifications.length;
  const list = document.getElementById("notifList");

  const recent = notifications.slice(-8).reverse();
  list.innerHTML = recent.length
    ? recent
        .map(
          (n) => `
      <div class="notif-item">
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${timeAgo(n.sentAt)}</div>
      </div>
    `
        )
        .join("")
    : `<div class="empty-state">Nothing sent yet.</div>`;
}

async function refreshAll() {
  try {
    await Promise.all([refreshOrders(), refreshRiderBoard(), refreshNotifications()]);
  } catch (err) {
    console.error("refresh failed", err);
  }
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
  refreshAll();
});

refreshAll();
setInterval(refreshAll, POLL_MS);
