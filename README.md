# Real-Time Food Delivery Updates Using Apache Kafka

**Team:** Hsu Shwe Yaung (6611665) · Soe Thura Lwin (6540062) · Khaing Zaw Lin (6611924)

## Scenario / Pain Point

A hypothetical food delivery platform has separate **order**, **customer**,
**rider**, and **notification** services. When an order's status changes,
every one of those services needs to know. If the order service calls each
of them directly over HTTP, the whole system becomes tightly coupled: if the
rider service is briefly down when the restaurant marks an order "ready for
pickup," that update is simply lost, and nobody notices until a rider
complains or an order sits unclaimed.

## Proposed Solution

Use **Apache Kafka** as an event-streaming backbone. The order service is
the only thing that ever writes an order status change. Instead of calling
downstream services directly, it publishes an `order.status.updated` event
to a Kafka topic. The customer, rider, and notification services each
consume that topic independently, at their own pace, in their own consumer
group. Kafka retains events on disk, so a service that was temporarily down
picks up exactly where it left off when it comes back - no missed updates,
and no tight coupling between services.

## Repository layout

```
Project2-Kafka-FoodDelivery/
├── order-service/         # Express API + Kafka producer (the only writer)
├── customer-service/      # Kafka consumer -> customer notification feed
├── rider-service/         # Kafka consumer -> pickup pool for riders
├── notification-service/  # Kafka consumer -> simulated push/SMS log
├── docs/                  # architecture-diagram.svg, sequence-diagram.svg
├── postman/               # demo-requests.http + demo.sh (curl walkthrough)
├── proposal/              # Proposal-2.docx (the 1-pager, worth 2%)
├── presentation/          # slide deck for the 10-minute presentation (8%)
└── docker-compose.yml     # Kafka + Kafka UI + all four services
```

## Technology of interest

- **Apache Kafka** (via `bitnami/kafka`, single-node KRaft mode - no
  Zookeeper needed) - the event-streaming platform itself.
- **Node.js + Express** - HTTP APIs for each service.
- **KafkaJS** - the Kafka client library used by every service.
- **Docker Compose** - runs Kafka, Kafka UI, and all four microservices with
  one command.
- **Kafka UI** (`provectuslabs/kafka-ui`, at http://localhost:8080) - visual
  proof during the demo that the topic and consumer groups are real.

## Running it

Requires Docker Desktop (or any Docker engine with Compose v2).

```bash
docker compose up --build
```

Wait until you see `[order-service] listening on :4000` and similar lines
for the other three services. Then either:

- Run the guided demo script: `./postman/demo.sh`
- Or import `postman/demo-requests.http` into Postman / VS Code REST Client
  and step through the requests one at a time.
- Or open Kafka UI at http://localhost:8090 to watch the topic and consumer
  group offsets update live.

### What to show in the demo

1. `POST /orders` on **order-service** (`:4000`) creates an order.
2. `PATCH /orders/:id/status` walks it through
   `CONFIRMED → READY_FOR_PICKUP → PICKED_UP → DELIVERED`.
3. Each status change publishes one Kafka event - watch the terminal logs
   for `[order-service] published ->`.
4. `GET /feed/:customerId` on **customer-service** (`:4001`) shows the
   customer learned about every step from Kafka, not from a direct call.
5. `GET /pickup-pool` on **rider-service** (`:4002`) shows the order appear
   when it's `READY_FOR_PICKUP` and disappear once it's `PICKED_UP`.
6. `GET /notifications` on **notification-service** (`:4003`) shows a
   notification was "sent" for every event.
7. **Resilience demo:** `docker compose stop rider-service`, run a couple
   more status updates, then `docker compose start rider-service` - it
   catches up on the missed events instead of losing them, which is the
   exact failure mode from the pain point.

## Diagrams

See [`docs/architecture-diagram.svg`](docs/architecture-diagram.svg) and
[`docs/sequence-diagram.svg`](docs/sequence-diagram.svg).

## Expected Result

Order status updates are shared with the customer, rider, and notification
services in real time, without any service calling another directly - and
without losing an update if one service is briefly unavailable.
