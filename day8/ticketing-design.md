# TicketHub System Design

TicketHub sells concert tickets for normal days and for sudden popular
sales. One seat can belong to only one successful order.

## 1. Requirements

Functional: browse events, view seats, hold seats, pay, view tickets, view
event details, prevent double-booking, release expired holds, send purchase
confirmation.

Non-functional:

- Speed: browsing should take a few hundred milliseconds.
- Correctness: a seat must never be sold twice.
- Fairness: waiting room and rate limiting during a big sale.
- Availability: continue if one app server fails.
- Security: authenticate buyers; users see only their own orders.

## 2. Traffic and Capacity Estimates

Normal day: 50,000 visitors x 10 pages = 500,000 page views/day.
Average: 500,000 / 86,400 ≈ 5.8 requests/second.
Purchases: 5,000 / 86,400 ≈ 0.06 purchases/second. Mostly read-heavy.

Popular sale: 200,000 people compete for 20,000 seats in 10 minutes (600s).
Arrivals: 200,000 / 600 ≈ 333 users/second.
Assumption: 3 requests per buyer (view, hold, pay).
Requests: 200,000 x 3 = 600,000. Rate: 600,000 / 600 ≈ 1,000 requests/second.

| Metric | Normal day | Popular sale |
|---|---|---|
| Visitors | 50,000/day | 200,000 in 10 minutes |
| Request rate | ~5.8/sec | ~1,000/sec |
| Tickets | 5,000/day | 20,000 seats |
| Pattern | browsing | concentrated writes |

## 3. API Design

| Method | Endpoint | Success |
|---|---|---|
| GET | `/api/v1/events` | 200 |
| GET | `/api/v1/events/:id` | 200 |
| GET | `/api/v1/events/:id/seats` | 200 |
| POST | `/api/v1/events/:id/holds` | 201 |
| POST | `/api/v1/orders` | 201 |
| GET | `/api/v1/tickets` | 200 |

Hold request: `{ "seatIds": [501] }`.
Hold response: `{ "holdId": 9001, "expiresAt": "2026-12-20T18:10:00Z" }`.
Order request: `{ "holdId": 9001, "paymentMethodId": "pm_example" }`.
Order response: `{ "orderId": 7001, "status": "paid", "tickets": [{ "ticketId": 30001, "seatId": 501 }] }`.

Errors: 400 expired/invalid hold, 401 unauthenticated, 403 forbidden,
404 not found, 409 seat taken, 500 server error.

### Hold SQL

```sql
BEGIN;
SELECT id, status, held_by, hold_expires_at FROM seats WHERE id = 501 FOR UPDATE;
UPDATE seats
SET status = 'held', held_by = 123,
    hold_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
WHERE id = 501 AND (status = 'available'
   OR (status = 'held' AND hold_expires_at < CURRENT_TIMESTAMP));
COMMIT;
```

`SELECT ... FOR UPDATE` locks the seat row. If the UPDATE changes 1 row, the
hold succeeded. If 0 rows, return 409 Conflict. The database is the authority.

Expired holds: a worker uses an index on `hold_expires_at` and sets those
seats back to `available`. It does not scan the whole table on each purchase.

## 4. Data Schema

Tables: `users`, `events`, `seats`, `orders`.

- users: id PK, email UNIQUE, name, password_hash, created_at
- events: id PK, name, venue, starts_at, created_at
- seats: id PK, event_id FK, seat_number, price, status
  (available|held|sold), held_by FK, hold_expires_at,
  UNIQUE(event_id, seat_number), INDEX(hold_expires_at)
- orders: id PK, user_id FK, seat_id FK, amount, status, created_at,
  UNIQUE(seat_id)

Relationships: users 1-to-many orders; events 1-to-many seats; users
1-to-many held seats; one successful order per seat.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  venue VARCHAR(200) NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE seats (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  seat_number VARCHAR(20) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  held_by INTEGER REFERENCES users(id),
  hold_expires_at TIMESTAMP,
  UNIQUE (event_id, seat_number)
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  seat_id INTEGER NOT NULL REFERENCES seats(id),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (seat_id)
);
CREATE INDEX seats_hold_expires_at_idx ON seats (hold_expires_at);
```

## 5. Architecture Diagram

```text
Users -> DNS -> CDN -> Waiting Room / Rate Limiter -> Load Balancer
                 App1   App2   App3
                  |      |      |
            Cache(Redis)  Primary DB (transactions + row locks)
                                |
                          Read Replica
Queue -> Workers (email, tickets, expired-hold cleanup)
```

Browsing uses CDN, cache and the read replica. Holds and orders always use
the primary database. Cache is not trusted for seat ownership.

Components: CDN (static + event pages), waiting room (fair entry at 200,000
users), rate limiter, load balancer, app servers, Redis cache, primary DB,
read replica, queue, workers.

## 6. Surviving 1,000 Requests/Second

GET /events: CDN/cache, then replica if needed.
POST /holds: waiting room -> app server -> primary DB transaction above.
POST /orders: verify hold, take payment, set seat sold, INSERT order.
UNIQUE(seat_id) blocks a second order for the same seat.

The waiting room stops 200,000 users hitting the DB at once. Cache absorbs
reads. Workers handle email and expired holds off the purchase path.

## 7. Trade-offs

Waiting room vs immediate access: more wait, but the DB survives the spike.
Replica vs strong consistency: replicas help reads; purchases use primary.
Cache vs freshness: cache events, never cache seat ownership.
Async vs sync: queue makes checkout fast; extra ops cost for workers.

End of document. Sections 1-7 are complete: requirements, estimates, API,
schema, architecture, sale survival, and trade-offs.
