# TicketHub System Design

TicketHub is a website that sells tickets for concerts and events. The system
must support normal daily traffic and handle sudden traffic spikes when a
popular concert goes on sale.

## 1. Requirements

### Functional Requirements

- Users can browse upcoming concerts and events.
- Users can view available seats for an event.
- Users can temporarily hold available seats.
- Users can pay for held seats.
- Users can view their purchased tickets.
- Users can view event details such as venue, date, time and ticket price.
- The system must prevent two users from purchasing the same seat.
- The system must release held seats when the hold expires without payment.
- Users must receive a confirmation after a successful purchase.

### Non-Functional Requirements

#### Speed

Normal browsing requests should respond quickly, ideally within a few
hundred milliseconds. During a popular concert sale, the system should remain
responsive even when a very large number of users arrive at the same time.

#### Correctness

Seat availability and orders must be accurate. A seat must never be sold to
two different users, even when many users attempt to purchase it
simultaneously.

#### Fairness

The system should prevent a small number of users from overwhelming the
ticket sale. Requests for a popular event should be controlled through
rate limiting and a virtual waiting room or queue so that users are processed
fairly.

#### Availability

The system should remain available during normal traffic and should continue
serving users if an individual application server fails.

#### Security

Users must be authenticated before purchasing tickets. Payment information
must be handled securely, and users must only be able to view their own
orders and tickets.

## 2. Traffic and Capacity Estimates

### Normal Day

TicketHub has 50,000 visitors on a normal day. If each visitor views
10 pages:

- Page views per day = 50,000 × 10 = 500,000 page views/day
- Average page requests per second = 500,000 ÷ 86,400 ≈ 5.8 requests/second

The system also sells 5,000 tickets per day:

- Ticket purchases per day = 5,000
- Average purchase rate = 5,000 ÷ 86,400 ≈ 0.06 purchases/second

Normal traffic is therefore relatively moderate, with most requests being
read-heavy browsing requests.

### Popular Concert Sale

When a popular concert goes on sale, 200,000 people try to buy
20,000 seats within the first 10 minutes.

The average number of users arriving per second is:

- 200,000 ÷ 600 seconds ≈ 333 users/second

There are only 20,000 seats, so the sale must handle intense competition
for a limited resource.

If each user makes approximately 3 requests during the purchase process
(for example, viewing seats, holding a seat and confirming the order), the
system could receive approximately:

- 200,000 × 3 = 600,000 requests
- 600,000 ÷ 600 ≈ 1,000 requests/second

This is much higher than the normal average traffic of approximately
5.8 page requests/second.

### Comparison

| Metric | Normal Day | Popular Concert Sale |
|---|---:|---:|
| Visitors | 50,000/day | 200,000 in 10 minutes |
| Page views / requests | 500,000/day | Up to ~600,000 purchase-related requests |
| Average request rate | ~5.8/sec | ~1,000/sec |
| Tickets | 5,000/day | 20,000 seats |
| Traffic pattern | Mostly browsing | Highly concentrated and write-heavy |

The popular concert sale is therefore the main scalability challenge. The
architecture must absorb roughly 1,000 requests per second while protecting
the database from a sudden burst of competing seat reservations.

## 3. API Design

TicketHub uses a REST API. JSON is used for request and response bodies, and
standard HTTP status codes communicate success or failure.

| Method | Endpoint | Description | Success |
|---|---|---|---|
| GET | `/api/v1/events` | Browse upcoming events | `200 OK` |
| GET | `/api/v1/events/:id` | View details for one event | `200 OK` |
| GET | `/api/v1/events/:id/seats` | View seat availability for an event | `200 OK` |
| POST | `/api/v1/events/:id/holds` | Temporarily hold one or more available seats | `201 Created` |
| POST | `/api/v1/orders` | Pay for held seats and create an order | `201 Created` |
| GET | `/api/v1/tickets` | View the authenticated user's tickets | `200 OK` |

### Browse Events


    GET /api/v1/events


Returns upcoming events with basic information such as name, venue, date and
ticket prices.

Example response:


    {
      "events": [
        {
          "id": 101,
          "name": "Summer Music Festival",
          "venue": "Nairobi Arena",
          "date": "2026-12-20",
          "availableSeats": 4500
        }
      ]
    }


### View Seats


    GET /api/v1/events/101/seats


Returns the seats for an event and their current availability.

Example response:


    {
      "eventId": 101,
      "seats": [
        {
          "id": 501,
          "number": "A12",
          "status": "available",
          "price": 2500
        },
        {
          "id": 502,
          "number": "A13",
          "status": "held",
          "price": 2500
        }
      ]
    }


### Hold Seats


    POST /api/v1/events/101/holds


Creates a temporary hold on available seats. A hold expires after a short
period, such as 10 minutes, if the user does not complete payment.

Example request:


    {
      "seatIds": [501, 502]
    }


Example response:


    {
      "holdId": 9001,
      "seatIds": [501, 502],
      "expiresAt": "2026-12-20T18:10:00Z"
    }


The server must verify that the requested seats are still available inside a
database transaction before creating the hold.

### Pay for Held Seats


    POST /api/v1/orders


Creates an order for seats currently held by the authenticated user and
processes payment through the payment provider.

Example request:


    {
      "holdId": 9001,
      "paymentMethodId": "pm_example"
    }


Example response:


    {
      "orderId": 7001,
      "status": "paid",
      "total": 5000,
      "tickets": [
        {
          "ticketId": 30001,
          "seatId": 501
        },
        {
          "ticketId": 30002,
          "seatId": 502
        }
      ]
    }


### View Tickets


    GET /api/v1/tickets


Returns tickets belonging to the authenticated user.

Example response:


    {
      "tickets": [
        {
          "ticketId": 30001,
          "eventId": 101,
          "seatId": 501,
          "status": "valid"
        }
      ]
    }


### API Error Handling

The API uses standard error responses:

* `400 Bad Request` — invalid input or expired hold.
* `401 Unauthorized` — the user is not authenticated.
* `403 Forbidden` — the user cannot access the requested resource.
* `404 Not Found` — the event, seat, hold or order does not exist.
* `409 Conflict` — a requested seat is no longer available.
* `500 Internal Server Error` — unexpected server failure.

## 4. Data Model

TicketHub uses a relational database because ticket sales require strong
consistency, transactions and constraints. The main tables are users, events,
seats and orders.

### Tables

#### users

| Column | Type | Key | Description |
|---|---|---|---|
| id | INTEGER | PK | Unique user ID |
| email | VARCHAR(255) | UNIQUE | User email address |
| name | VARCHAR(100) | | User's name |
| password_hash | VARCHAR(255) | | Hashed password |
| created_at | TIMESTAMP | | Account creation time |

#### events

| Column | Type | Key | Description |
|---|---|---|---|
| id | INTEGER | PK | Unique event ID |
| name | VARCHAR(200) | | Event name |
| venue | VARCHAR(200) | | Event venue |
| starts_at | TIMESTAMP | | Event start time |
| created_at | TIMESTAMP | | Event creation time |

#### seats

| Column | Type | Key | Description |
|---|---|---|---|
| id | INTEGER | PK | Unique seat ID |
| event_id | INTEGER | FK | Event containing the seat |
| seat_number | VARCHAR(20) | | Seat label such as A12 |
| price | DECIMAL(10,2) | | Ticket price |
| status | VARCHAR(20) | | available, held or sold |
| held_by | INTEGER | FK | User currently holding the seat |
| hold_expires_at | TIMESTAMP | | Time when the hold expires |

A seat belongs to exactly one event.

#### orders

| Column | Type | Key | Description |
|---|---|---|---|
| id | INTEGER | PK | Unique order ID |
| user_id | INTEGER | FK | User who placed the order |
| seat_id | INTEGER | FK | Seat purchased |
| amount | DECIMAL(10,2) | | Amount paid |
| status | VARCHAR(20) | | pending, paid or cancelled |
| created_at | TIMESTAMP | | Order creation time |

### Relationships

- One user can create many orders: `users 1 -> many orders`.
- One event has many seats: `events 1 -> many seats`.
- One user can temporarily hold many seats: `users 1 -> many seats`.
- One seat can eventually appear in one successful order.
- Each order references one user and one seat.

### Example SQL Schema


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
        event_id INTEGER NOT NULL,
        seat_number VARCHAR(20) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'available',
        held_by INTEGER,
        hold_expires_at TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id),
        FOREIGN KEY (held_by) REFERENCES users(id),
        UNIQUE (event_id, seat_number)
    );

    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        seat_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (seat_id) REFERENCES seats(id),
        UNIQUE (seat_id)
    );


### Preventing Double-Booking

The most important constraint is:


    UNIQUE (seat_id)


on the `orders` table.

This means the database cannot contain two orders for the same seat.

However, the application must also protect the **hold** operation with a
database transaction.

When a user tries to hold a seat, the application performs the following
steps inside a transaction:

1. Start a database transaction.
2. Check the requested seat's current status.
3. If the seat is available, change its status to `held`.
4. Store the user's ID and hold expiration time.
5. Commit the transaction.
6. If another transaction tries to hold the same seat at the same time, the
   database locking/transaction mechanism ensures that only one transaction
   can successfully claim it.

The hold uses this transaction. SELECT FOR UPDATE locks the seat row so two
requests cannot treat it as available at the same time. The conditional
UPDATE is a second database check. If it changes 1 row, the hold succeeded.
If it changes 0 rows, the API returns 409 Conflict. The database, not the
browser, is the final authority for seat ownership.

    BEGIN;

    SELECT id, status, held_by, hold_expires_at
    FROM seats
    WHERE id = 501
    FOR UPDATE;

    UPDATE seats
    SET status = 'held',
        held_by = 123,
        hold_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    WHERE id = 501
      AND (
          status = 'available'
          OR (
              status = 'held'
              AND hold_expires_at < CURRENT_TIMESTAMP
          )
      );

    COMMIT;

When payment is completed, another transaction changes the seat to `sold`
and creates the order. The unique constraint on `orders.seat_id` provides an
additional database-level safety check.

If the hold has expired, the seat can be returned to `available` before
another user is allowed to claim it.

This combination of transactions, row-level locking or equivalent database
concurrency control, and a unique constraint prevents two users from buying
the same seat even during a very busy sale.

## 5. System Architecture

The architecture separates normal browsing traffic from the high-contention
ticket purchasing path. Static content and event information can be cached,
while seat holds and orders always go through the application servers and
primary database.

### Architecture Diagram


                             ┌─────────────────┐
                             │      Users      │
                             └────────┬────────┘
                                      │
                                      ▼
                             ┌─────────────────┐
                             │       DNS       │
                             └────────┬────────┘
                                      │
                                      ▼
                             ┌─────────────────┐
                             │       CDN       │
                             │ Static content  │
                             │ Cached event    │
                             │ information     │
                             └────────┬────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │  Waiting Room /     │
                           │  Rate Limiter       │
                           └──────────┬──────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │   Load Balancer     │
                           └──────────┬──────────┘
                                      │
                        ┌─────────────┼─────────────┐
                        ▼             ▼             ▼
                  ┌──────────┐ ┌──────────┐ ┌──────────┐
                  │ App      │ │ App      │ │ App      │
                  │ Server 1 │ │ Server 2 │ │ Server 3 │
                  └────┬─────┘ └────┬─────┘ └────┬─────┘
                       │             │             │
                       └─────────────┼─────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │                         │
                        ▼                         ▼
                 ┌──────────────┐        ┌────────────────┐
                 │    Cache     │        │ Primary DB     │
                 │    Redis     │        │ Transactions   │
                 └──────────────┘        │ + seat locks   │
                                         └───────┬────────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │ Read Replica │
                                          └──────────────┘

                     Purchase / background work
                               │
                               ▼
                        ┌─────────────┐
                        │    Queue    │
                        └──────┬──────┘
                               │
                               ▼
                        ┌─────────────┐
                        │   Workers   │
                        └─────────────┘


### Component Responsibilities

#### DNS

DNS directs users to the TicketHub service and can route traffic to healthy
infrastructure.

#### CDN

The CDN serves static files such as HTML, CSS, JavaScript and images. It can
also cache event information that does not change frequently, reducing traffic
to the application servers.

#### Waiting Room and Rate Limiter

The waiting room controls the number of users entering the ticket purchasing
system during a major sale. The rate limiter prevents individual users or
clients from sending excessive requests.

This is especially important when 200,000 users compete for only 20,000
seats.

#### Load Balancer

The load balancer distributes requests across multiple healthy application
servers and removes failed servers from the traffic pool.

#### Application Servers

Multiple application servers handle authentication, event browsing, seat
availability, seat holds, orders and API responses.

#### Cache

Redis or another distributed cache stores frequently requested event
information and other read-heavy data. Seat purchase decisions are not
trusted to the cache because the primary database must remain the source of
truth for seat ownership.

#### Primary Database

The primary relational database stores users, events, seats and orders.
Seat holds and purchases use database transactions so concurrent requests
cannot sell the same seat twice.

#### Read Replica

A read replica handles read-heavy queries such as browsing events and
non-critical availability information. This reduces load on the primary
database.

Seat purchase decisions are sent to the primary database rather than relying
on potentially stale replica data.

#### Queue

The queue handles asynchronous work such as sending purchase confirmation
emails, generating ticket documents and other background tasks.

#### Workers

Multiple workers consume jobs from the queue. If one worker fails, another
worker can process the job.

### GET /events Request Flow

1. The user requests the list of events.
2. DNS directs the request to TicketHub.
3. The CDN serves cached static resources when possible.
4. The request reaches the load balancer.
5. The load balancer sends it to a healthy application server.
6. The application checks the cache.
7. If the data is cached, it is returned immediately.
8. If the data is not cached, the application reads it from the read replica
   and stores the result in the cache.
9. The event information is returned to the user.

### POST /holds Request Flow

1. The user selects a seat and requests a hold.
2. The request passes through the waiting room/rate limiter.
3. The load balancer sends the request to an application server.
4. The application authenticates the user.
5. The application starts a database transaction on the primary database.
6. The database checks whether the seat is available or whether an existing
   hold has expired.
7. If available, the database changes the seat status to `held`, records the
   user and expiration time, and commits the transaction.
8. If another user attempts to claim the same seat concurrently, the database
   concurrency controls ensure that only one transaction succeeds.
9. The successful user receives a hold ID and expiration time.
10. The unsuccessful request receives a `409 Conflict` response.

### POST /orders Request Flow

1. The user submits payment for a valid seat hold.
2. The application verifies that the hold belongs to the authenticated user
   and has not expired.
3. The application processes payment through the payment provider.
4. A database transaction changes the seat from `held` to `sold`.
5. The transaction creates the order record.
6. The unique constraint on `orders.seat_id` provides an additional
   protection against duplicate purchases.
7. The transaction commits.
8. The user receives a successful order response.
9. A background job can be placed on the queue to send confirmation email or
   generate the final ticket.

### Surviving the Big Sale

The popular concert sale produces approximately 333 new buyers per second
and potentially around 1,000 purchase-related requests per second under the
assumption used earlier.

The waiting room prevents all 200,000 users from overwhelming the application
and database simultaneously. The load balancer distributes requests across
multiple application servers. The CDN and cache absorb read-heavy browsing
traffic.

Most importantly, the primary database is protected from unsafe concurrent
writes by transactions and seat constraints. The read replica handles
non-critical reads, while background workers handle tasks that do not need to
block the user's purchase request.

Multiple application servers, workers and database replicas also reduce
single points of failure.

## 6. Architectural Trade-offs

### 1. Waiting Room vs. Immediate Access

A waiting room protects the application and database from a sudden burst of
200,000 users, making the system more stable during a popular sale. However,
it introduces an additional step for users and means some users must wait
before accessing the purchasing system.

Without a waiting room, users could access the system immediately, but the
large burst of requests could overload the application servers or database.

### 2. Read Replicas vs. Strong Consistency

Read replicas allow TicketHub to handle many browsing requests without
putting all read traffic on the primary database. However, replication can
have a small delay, meaning a replica might briefly contain older data.

For this reason, seat ownership and purchases always use the primary database,
where transactions provide strong consistency.

### 3. Cache Performance vs. Freshness

Caching event information improves response times and reduces database load.
However, cached data can become stale.

This is acceptable for information such as event descriptions, but current
seat ownership should not rely on cached data. The primary database remains
the source of truth for seat availability and purchases.

### 4. Synchronous vs. Asynchronous Processing

Sending confirmation emails and generating ticket documents asynchronously
through a queue makes the purchase request faster and more reliable during
large sales.

The trade-off is additional infrastructure and operational complexity because
the system needs a queue, workers and retry handling.

### Double-Booking Protection Summary

The most important correctness requirement is preventing two people from
purchasing the same seat.

TicketHub protects against this using multiple layers:

1. The application checks the seat before attempting to hold it.
2. The database transaction locks or otherwise serializes concurrent updates
   to the same seat.
3. A seat changes from `available` to `held` inside the transaction.
4. Only the user with a valid hold can complete the purchase.
5. The purchase changes the seat to `sold` and creates an order in a
   transaction.
6. The `UNIQUE (seat_id)` constraint on the orders table prevents two orders
   from being created for the same seat.
7. If two users attempt to purchase the same seat at the same time, only one
   transaction can succeed. The other request receives a conflict response.
The database therefore acts as the final authority for seat ownership rather
than relying on the browser or application code alone.

## 7. Expired Hold Cleanup

A background worker periodically processes expired holds. It uses an index
on hold_expires_at to find those rows efficiently, then changes expired
seats from held back to available. This work is asynchronous, so a large
number of expired holds does not spike the main purchase request path.

End of document. This file includes requirements, estimates, API, data
schema, architecture, trade-offs, seat-lock SQL, and hold cleanup.

