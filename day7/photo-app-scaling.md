# SnapShare Scaling Plan

## 1. Assumptions

The starting facts give us the following assumptions:

- SnapShare has 10,000,000 registered users.
- 10% of registered users are active each day.
- Each daily active user uploads 1 photo per day.
- Each daily active user views 50 feed pages per day.
- The average original photo is 2 MB.
- Each photo also has a 50 KB thumbnail.
- A day has 86,400 seconds.
- Peak traffic is estimated at 5 times the average traffic.
- Storage calculations use 365 days per year and do not include extra copies for backups or replication.

### Daily active users

10,000,000 × 10% = 1,000,000 daily active users.

So SnapShare has approximately **1 million daily active users**.

## 2. Traffic and Storage Estimates

### Photo uploads

There are 1,000,000 uploads per day.

Average uploads per second:

1,000,000 ÷ 86,400 ≈ **11.6 uploads/second**

Peak uploads per second:

11.6 × 5 ≈ **57.9 uploads/second**

### Feed views

Each active user views 50 feed pages per day.

1,000,000 × 50 = **50,000,000 feed views/day**

Average feed views per second:

50,000,000 ÷ 86,400 ≈ **578.7 feed views/second**

Peak feed views per second:

578.7 × 5 ≈ **2,894 feed views/second**

### Photo storage

Each photo requires:

- Original photo: 2 MB
- Thumbnail: 50 KB
- Total: approximately 2.05 MB

Daily storage:

1,000,000 × 2.05 MB = approximately **2.05 TB/day**

Annual storage:

2.05 TB × 365 = approximately **748.25 TB/year**

This estimate does not include database storage, backups, replication, or additional copies.

## 3. Read-Heavy or Write-Heavy?

SnapShare is a **read-heavy system**. There are approximately 579 average feed views per second compared with about 12 photo uploads per second. At peak, the system could receive about 2,894 feed views per second compared with about 58 uploads per second.

This means the architecture should prioritize fast reads using caching, a CDN, efficient database queries, and a database read replica. Writes still need to be reliable, but the much larger volume of feed requests makes read scaling the bigger concern.

## 4. Why Photos Should Not Be Stored in the Database

The actual photo files should not be stored inside the relational database because large binary files would make the database much larger, increase backup and replication costs, and compete with normal metadata queries for database resources.

Instead, the original photos and thumbnails should be stored in **object storage**. The database should store metadata such as the photo ID, user ID, object-storage key, caption, and upload timestamp. A CDN can then deliver frequently requested photos and thumbnails efficiently to users.

## 5. Architecture Diagram

```text
                         ┌───────────────┐
                         │     Users     │
                         └───────┬───────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │      CDN      │
                         └───────┬───────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │ Load Balancer │
                         └───────┬───────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
             ┌──────────────┐          ┌──────────────┐
             │  App Server  │          │  App Server  │
             │      #1      │          │      #2      │
             └──────┬───────┘          └──────┬───────┘
                    │                         │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 │               │                │
                 ▼               ▼                ▼
          ┌────────────┐  ┌──────────────┐  ┌───────────────┐
          │   Cache    │  │   Database   │  │    Queue      │
          │   (Redis)  │  │   Primary    │  │               │
          └────────────┘  └───────┬──────┘  └───────┬───────┘
                                  │                  │
                                  ▼                  ▼
                           ┌──────────────┐   ┌──────────────┐
                           │ Read Replica │   │    Worker    │
                           └──────────────┘   │  Thumbnails  │
                                              └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │    Object    │
                                              │   Storage    │
                                              │ Photos +     │
                                              │ Thumbnails   │
                                              └──────────────┘
```

## 6. Component Responsibilities

* **CDN:** Delivers photos and thumbnails from locations close to users, reducing latency and load on the application servers.
* **Load Balancer:** Distributes incoming requests across multiple application servers so one server does not become a bottleneck.
* **App Servers:** Handle application logic such as authentication, uploads, feed requests, and metadata operations.
* **Cache:** Stores frequently requested data such as popular feed results to reduce repeated database queries.
* **Primary Database:** Stores structured metadata such as users, follows, photo records, captions, and timestamps.
* **Read Replica:** Handles read queries so that feed requests do not place all of the read load on the primary database.
* **Object Storage:** Stores the large original photo files and generated thumbnails separately from the database.
* **Queue:** Holds thumbnail-generation jobs so uploading a photo does not have to wait for thumbnail processing to finish.
* **Worker:** Takes thumbnail jobs from the queue, creates thumbnails, and stores them in object storage.

## 7. Photo Upload Flow

1. The user selects a photo and sends an upload request to SnapShare.
2. The load balancer sends the request to an available application server.
3. The application server validates the user and the uploaded file.
4. The original photo is stored in object storage.
5. The application stores the photo metadata and object-storage key in the primary database.
6. The application places a thumbnail-generation job on the queue.
7. The application can respond to the user without waiting for thumbnail generation to finish.
8. A thumbnail worker takes the job from the queue.
9. The worker downloads or accesses the original photo from object storage and creates a 50 KB thumbnail.
10. The worker stores the thumbnail in object storage and records or updates its object-storage key.
11. The CDN can then deliver the original photo and thumbnail efficiently when users view them.

## 8. Trade-offs

### Consistency vs. availability

Using a queue for thumbnail generation means a newly uploaded photo may temporarily exist without its thumbnail. This improves upload speed and reliability, but users may briefly see a placeholder while the background job completes.

### Cache speed vs. data freshness

Caching feed data makes reads much faster and reduces database load, but cached results can become temporarily stale. The system needs cache expiration or invalidation rules to balance performance with freshness.

### Database replication vs. write complexity

Using a read replica allows the system to handle many more feed reads, but replicated databases introduce additional infrastructure and can have a small delay before new data appears on the replica.

### Object storage vs. simpler database storage

Object storage is much better suited to large photo files and scales independently, but it adds another service that the application must manage and monitor.
