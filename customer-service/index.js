const express = require("express");
const cors = require("cors");
const { Kafka } = require("kafkajs");

const PORT = process.env.PORT || 4001;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const TOPIC = "order.status.updated";
const GROUP_ID = "customer-service-group";

const kafka = new Kafka({ clientId: "customer-service", brokers: [KAFKA_BROKER] });
const consumer = kafka.consumer({ groupId: GROUP_ID });

const feedByCustomer = new Map();

async function connectWithRetry() {
  await consumer.connect();
  for (let attempt = 1; ; attempt++) {
    try {
      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      return;
    } catch (err) {
      console.warn(`[customer-service] subscribe failed (attempt ${attempt}), retrying in 2s`, err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  await connectWithRetry();

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      console.log(`[customer-service] received`, event);

      const feed = feedByCustomer.get(event.customerId) || [];
      feed.push({
        orderId: event.orderId,
        status: event.status,
        message: humanize(event),
        receivedAt: new Date().toISOString(),
      });
      feedByCustomer.set(event.customerId, feed);
    },
  });

  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.get("/feed/:customerId", (req, res) => {
    res.json(feedByCustomer.get(req.params.customerId) || []);
  });

  app.get("/feed", (_req, res) => {
    res.json(Object.fromEntries(feedByCustomer));
  });

  app.listen(PORT, () => {
    console.log(`[customer-service] listening on :${PORT}, kafka broker ${KAFKA_BROKER}`);
  });
}

function humanize(event) {
  switch (event.status) {
    case "PLACED":
      return `Order #${event.orderId} placed.`;
    case "CONFIRMED":
      return `Restaurant confirmed order #${event.orderId}.`;
    case "PREPARING":
      return `Order #${event.orderId} is being prepared.`;
    case "READY_FOR_PICKUP":
      return `Order #${event.orderId} is ready, waiting for a rider.`;
    case "PICKED_UP":
      return `Rider picked up order #${event.orderId}.`;
    case "DELIVERED":
      return `Order #${event.orderId} was delivered. Enjoy!`;
    case "CANCELLED":
      return `Order #${event.orderId} was cancelled.`;
    default:
      return `Order #${event.orderId} status: ${event.status}`;
  }
}

main().catch((err) => {
  console.error("[customer-service] fatal error", err);
  process.exit(1);
});
