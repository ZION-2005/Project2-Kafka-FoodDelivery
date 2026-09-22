const express = require("express");
const cors = require("cors");
const { Kafka } = require("kafkajs");

const PORT = process.env.PORT || 4003;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const TOPIC = "order.status.updated";
const GROUP_ID = "notification-service-group";

const kafka = new Kafka({ clientId: "notification-service", brokers: [KAFKA_BROKER] });
const consumer = kafka.consumer({ groupId: GROUP_ID });

const notifications = [];

// Stand-in for a real push/SMS provider - logs instead of calling one out.
function sendPushNotification(event) {
  const notification = {
    to: `customer:${event.customerId}`,
    text: `Your order #${event.orderId} is now ${event.status}.`,
    sentAt: new Date().toISOString(),
  };
  notifications.push(notification);
  console.log(`[notification-service] sent`, notification);
}

async function connectWithRetry() {
  await consumer.connect();
  for (let attempt = 1; ; attempt++) {
    try {
      await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
      return;
    } catch (err) {
      console.warn(`[notification-service] subscribe failed (attempt ${attempt}), retrying in 2s`, err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  await connectWithRetry();

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      sendPushNotification(event);
    },
  });

  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/notifications", (_req, res) => res.json(notifications));

  app.listen(PORT, () => {
    console.log(`[notification-service] listening on :${PORT}, kafka broker ${KAFKA_BROKER}`);
  });
}

main().catch((err) => {
  console.error("[notification-service] fatal error", err);
  process.exit(1);
});
