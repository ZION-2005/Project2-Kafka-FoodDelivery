const express = require("express");
const cors = require("cors");
const { Kafka } = require("kafkajs");

const PORT = process.env.PORT || 4002;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const TOPIC = "order.status.updated";
const GROUP_ID = "rider-service-group";

const kafka = new Kafka({ clientId: "rider-service", brokers: [KAFKA_BROKER] });
const consumer = kafka.consumer({ groupId: GROUP_ID });

// Orders currently sitting in the "ready for pickup" pool, plus a log of
// everything this service has ever seen (useful to prove replay works).
const pickupPool = new Map();
const eventLog = [];

async function connectWithRetry() {
  await consumer.connect();
  for (let attempt = 1; ; attempt++) {
    try {
      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      return;
    } catch (err) {
      console.warn(`[rider-service] subscribe failed (attempt ${attempt}), retrying in 2s`, err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  await connectWithRetry();

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      console.log(`[rider-service] received`, event);
      eventLog.push(event);

      if (event.status === "READY_FOR_PICKUP") {
        pickupPool.set(event.orderId, event);
      } else {
        // picked up, delivered, cancelled, etc. - no longer waiting for a rider
        pickupPool.delete(event.orderId);
      }
    },
  });

  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // What a rider's app would poll to see available pickups
  app.get("/pickup-pool", (_req, res) => res.json(Array.from(pickupPool.values())));

  app.get("/events", (_req, res) => res.json(eventLog));

  app.listen(PORT, () => {
    console.log(`[rider-service] listening on :${PORT}, kafka broker ${KAFKA_BROKER}`);
  });
}

main().catch((err) => {
  console.error("[rider-service] fatal error", err);
  process.exit(1);
});
