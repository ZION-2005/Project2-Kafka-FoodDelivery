const ORDER_API = "http://localhost:4000";
const CUSTOMER_API = "http://localhost:4001";
const POLL_MS = 2000;
const SESSION_KEY = "saffron_customer";

const RESTAURANTS = [
  {
    id: "resto-1",
    name: "Baan Thai Kitchen",
    menu: [
      { name: "Pad Thai", price: 65 },
      { name: "Tom Yum Goong", price: 85 },
      { name: "Green Curry", price: 70 },
      { name: "Mango Sticky Rice", price: 60 },
      { name: "Thai Iced Tea", price: 35 },
    ],
  },
  {
    id: "resto-2",
    name: "Golden Wok",
    menu: [
      { name: "Fried Rice", price: 55 },
      { name: "Kung Pao Chicken", price: 75 },
      { name: "Spring Rolls", price: 40 },
      { name: "Wonton Soup", price: 50 },
    ],
  },
  {
    id: "resto-3",
    name: "Riverside Grill",
    menu: [
      { name: "Grilled Fish", price: 120 },
      { name: "BBQ Ribs", price: 140 },
      { name: "Caesar Salad", price: 65 },
      { name: "Grilled Chicken", price: 90 },
    ],
  },
];

const STAGES = [
  { key: "PLACED", label: "Placed" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY_FOR_PICKUP", label: "Ready" },
  { key: "PICKED_UP", label: "On the way" },
  { key: "DELIVERED", label: "Delivered" },
];

let currentCustomer = null;
let activeRestaurantId = RESTAURANTS[0].id;
let cart = [];
let pollHandle = null;

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/* ---------- Menu & cart ---------- */

function renderTabs() {
  const tabs = document.getElementById("restaurantTabs");
  tabs.innerHTML = RESTAURANTS.map(
    (r) => `<button class="resto-tab ${r.id === activeRestaurantId ? "active" : ""}" data-id="${r.id}">${r.name}</button>`
  ).join("");
  tabs.querySelectorAll(".resto-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (cart.length && activeRestaurantId !== btn.dataset.id) {
        if (!confirm("Switching restaurants will clear your cart. Continue?")) return;
        cart = [];
      }
      activeRestaurantId = btn.dataset.id;
      renderTabs();
      renderMenu();
      renderCart();
    });
  });
}

function currentRestaurant() {
  return RESTAURANTS.find((r) => r.id === activeRestaurantId);
}

function qtyInCart(name) {
  const line = cart.find((c) => c.name === name);
  return line ? line.qty : 0;
}

function renderMenu() {
  const grid = document.getElementById("menuGrid");
  grid.innerHTML = currentRestaurant()
    .menu.map(
      (item) => `
      <div class="menu-item">
        <div class="menu-item-name">${item.name}</div>
        <div class="menu-item-price">฿${item.price}</div>
        <div class="qty-control">
          <button class="qty-btn" data-action="dec" data-name="${item.name}">&minus;</button>
          <span class="qty-value">${qtyInCart(item.name)}</span>
          <button class="qty-btn" data-action="inc" data-name="${item.name}" data-price="${item.price}">&plus;</button>
        </div>
      </div>
    `
    )
    .join("");

  grid.querySelectorAll(".qty-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.name;
      if (btn.dataset.action === "inc") {
        const price = Number(btn.dataset.price);
        const line = cart.find((c) => c.name === name);
        if (line) line.qty += 1;
        else cart.push({ name, price, qty: 1 });
      } else {
        const line = cart.find((c) => c.name === name);
        if (line) {
          line.qty -= 1;
          if (line.qty <= 0) cart = cart.filter((c) => c.name !== name);
        }
      }
      renderMenu();
      renderCart();
    });
  });
}

function renderCart() {
  const container = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  const checkoutBtn = document.getElementById("checkoutBtn");

  container.innerHTML = cart.length
    ? cart
        .map(
          (c) => `<div class="cart-line"><span>${c.qty}&times; ${c.name}</span><span>฿${c.qty * c.price}</span></div>`
        )
        .join("")
    : `<div class="empty-state">Your cart is empty.</div>`;

  const total = cart.reduce((sum, c) => sum + c.qty * c.price, 0);
  totalEl.textContent = cart.length ? `Total: ฿${total}` : "";
  checkoutBtn.disabled = cart.length === 0;
}

async function checkout() {
  const items = cart.map((c) => (c.qty > 1 ? `${c.qty}x ${c.name}` : c.name));
  await fetch(`${ORDER_API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId: activeRestaurantId, customerId: currentCustomer, items }),
  });
  cart = [];
  renderMenu();
  renderCart();
  refreshOrders();
}

/* ---------- Order tracking ---------- */

function stepperHtml(order) {
  if (order.status === "CANCELLED") {
    return `<div class="cancelled-banner">Cancelled</div>`;
  }
  const currentIndex = STAGES.findIndex((s) => s.key === order.status);
  return `
    <div class="stepper stepper-compact">
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
  const riderLine = order.riderId ? `<div class="tracking-rider">Rider: <strong>${order.riderId}</strong></div>` : "";
  const lastEvent = feedForOrder[feedForOrder.length - 1];

  return `
    <div class="order-history-card">
      <div class="tracking-card-top">
        <div>
          <div class="tracking-order-id">Order #${order.orderId}</div>
          <div class="muted">${order.items ? itemsText : ""}</div>
        </div>
        <div class="muted">${timeAgo(order.createdAt)}</div>
      </div>
      ${stepperHtml(order)}
      ${riderLine}
      ${lastEvent ? `<div class="muted last-update">${lastEvent.message}</div>` : ""}
    </div>
  `;
}

async function refreshOrders() {
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
    : `<div class="empty-state">No orders yet.</div>`;
}

/* ---------- Session ---------- */

function startSession(name) {
  currentCustomer = name;
  localStorage.setItem(SESSION_KEY, name);

  document.getElementById("identifyCard").classList.add("hidden");
  document.getElementById("orderView").classList.remove("hidden");
  document.getElementById("sessionBar").classList.remove("hidden");
  document.getElementById("sessionName").textContent = name;

  renderTabs();
  renderMenu();
  renderCart();
  refreshOrders();

  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(refreshOrders, POLL_MS);
}

function endSession() {
  currentCustomer = null;
  cart = [];
  localStorage.removeItem(SESSION_KEY);
  if (pollHandle) clearInterval(pollHandle);
  document.getElementById("orderView").classList.add("hidden");
  document.getElementById("sessionBar").classList.add("hidden");
  document.getElementById("identifyCard").classList.remove("hidden");
  document.getElementById("customerIdInput").value = "";
}

document.getElementById("identifyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = document.getElementById("customerIdInput").value.trim();
  if (value) startSession(value);
});

document.getElementById("signOutBtn").addEventListener("click", endSession);
document.getElementById("checkoutBtn").addEventListener("click", checkout);

const saved = localStorage.getItem(SESSION_KEY);
if (saved) startSession(saved);
