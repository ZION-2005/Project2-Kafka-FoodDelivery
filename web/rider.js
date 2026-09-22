const ORDER_API = "http://localhost:4000";
const RIDER_API = "http://localhost:4002";
const POLL_MS = 2000;
const SESSION_KEY = "saffron_rider";

let currentRider = null;
let pollHandle = null;

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

async function claim(orderId) {
  await fetch(`${ORDER_API}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PICKED_UP", riderId: currentRider }),
  });
  refreshRiderView();
}

async function markDelivered(orderId) {
  await fetch(`${ORDER_API}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "DELIVERED" }),
  });
  refreshRiderView();
}

function poolCard(job) {
  return `
    <div class="rider-card">
      <div class="rider-card-top">
        <span class="order-id">#${job.orderId}</span>
        <span class="muted">${timeAgo(job.updatedAt)}</span>
      </div>
      <div class="order-customer">${job.customerId}</div>
      <div class="order-items">${job.restaurantId}</div>
      <button class="claim-btn" data-id="${job.orderId}">Accept Pickup</button>
    </div>
  `;
}

function myCard(order) {
  return `
    <div class="rider-card">
      <div class="rider-card-top">
        <span class="order-id">#${order.orderId}</span>
        <span class="muted">${timeAgo(order.createdAt)}</span>
      </div>
      <div class="order-customer">${order.customerId}</div>
      <div class="order-items">${(order.items || []).join(", ")}</div>
      <button class="claim-btn deliver-btn" data-id="${order.orderId}">Mark Delivered</button>
    </div>
  `;
}

async function refreshRiderView() {
  const [poolRes, ordersRes] = await Promise.all([
    fetch(`${RIDER_API}/pickup-pool`),
    fetch(`${ORDER_API}/orders`),
  ]);
  const pool = await poolRes.json();
  const orders = await ordersRes.json();

  const poolList = document.getElementById("poolList");
  poolList.innerHTML = pool.length
    ? pool.map(poolCard).join("")
    : `<div class="empty-state">No pickups waiting right now.</div>`;
  poolList.querySelectorAll(".claim-btn").forEach((btn) => {
    btn.addEventListener("click", () => claim(btn.dataset.id));
  });

  const mine = orders.filter((o) => o.riderId === currentRider && o.status === "PICKED_UP");
  const myList = document.getElementById("myList");
  myList.innerHTML = mine.length
    ? mine.map(myCard).join("")
    : `<div class="empty-state">Nothing out for delivery right now.</div>`;
  myList.querySelectorAll(".deliver-btn").forEach((btn) => {
    btn.addEventListener("click", () => markDelivered(btn.dataset.id));
  });
}

function startSession(riderId) {
  currentRider = riderId;
  localStorage.setItem(SESSION_KEY, riderId);

  document.getElementById("identifyCard").classList.add("hidden");
  document.getElementById("riderView").classList.remove("hidden");
  document.getElementById("sessionBar").classList.remove("hidden");
  document.getElementById("sessionName").textContent = riderId;

  refreshRiderView();
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(refreshRiderView, POLL_MS);
}

function endSession() {
  currentRider = null;
  localStorage.removeItem(SESSION_KEY);
  if (pollHandle) clearInterval(pollHandle);
  document.getElementById("riderView").classList.add("hidden");
  document.getElementById("sessionBar").classList.add("hidden");
  document.getElementById("identifyCard").classList.remove("hidden");
  document.getElementById("riderIdInput").value = "";
}

document.getElementById("identifyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = document.getElementById("riderIdInput").value.trim();
  if (value) startSession(value);
});
document.getElementById("signOutBtn").addEventListener("click", endSession);

const saved = localStorage.getItem(SESSION_KEY);
if (saved) startSession(saved);
