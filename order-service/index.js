const express = require("express");
const cors = require("cors");
const { Kafka } = require("kafkajs");

const PORT = process.env.PORT || 4000;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const TOPIC = "order.status.updated";

const VALID_STATUSES = [
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "DELIVERED",
  "CANCELLED",
];

const kafka = new Kafka({ clientId: "order-service", brokers: [KAFKA_BROKER] });
const producer = kafka.producer();

const orders = new Map();
let nextId = 1;

async function publishStatusEvent(order) {
  const event = {
    orderId: order.orderId,
    restaurantId: order.restaurantId,
    customerId: order.customerId,
    riderId: order.riderId || null,
    status: order.status,
    updatedAt: new Date().toISOString(),
  };
  await producer.send({
    topic: TOPIC,
    messages: [{ key: String(order.orderId), value: JSON.stringify(event) }],
  });
  console.log(`[order-service] published -> ${TOPIC}`, event);
  return event;
}

async function main() {
  await producer.connect();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/orders", async (req, res) => {
    const { restaurantId, customerId, items } = req.body;
    if (!restaurantId || !customerId) {
      return res.status(400).json({ error: "restaurantId and customerId are required" });
    }
    const order = {
      orderId: nextId++,
      restaurantId,
      customerId,
      items: items || [],
      status: "PLACED",
      riderId: null,
      createdAt: new Date().toISOString(),
    };
    orders.set(order.orderId, order);
    await publishStatusEvent(order);
    res.status(201).json(order);
  });

  app.get("/orders", (_req, res) => res.json(Array.from(orders.values())));

  app.get("/orders/:id", (req, res) => {
    const order = orders.get(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(order);
  });

  app.patch("/orders/:id/status", async (req, res) => {
    const order = orders.get(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "order not found" });

    const { status, riderId } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` });
    }

    order.status = status;
    if (riderId) order.riderId = riderId;

    const event = await publishStatusEvent(order);
    res.json({ order, publishedEvent: event });
  });

  app.listen(PORT, () => {
    console.log(`[order-service] listening on :${PORT}, kafka broker ${KAFKA_BROKER}`);
  });
}

main().catch((err) => {
  console.error("[order-service] fatal error", err);
  process.exit(1);
});
