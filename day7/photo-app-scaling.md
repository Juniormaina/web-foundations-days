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

### CDN

The CDN caches and serves thumbnails and frequently requested images from locations close to users. This reduces latency and lowers the amount of traffic reaching the application servers.

### Load Balancer

The load balancer distributes incoming HTTP requests across multiple application servers. It also performs health checks so unhealthy servers can be removed from rotation.

### Application Servers

Application servers handle authentication, feed requests, upload requests, metadata operations, and API responses. Multiple servers allow the system to continue serving traffic if one server fails.

### Cache

The cache stores frequently requested feed data and metadata so application servers do not need to query the database for every feed request. Cached data should have an expiration time or be invalidated when necessary.

### Primary Database

The primary database stores structured metadata such as users, photo records, captions, timestamps, and object-storage keys. Writes are directed to the primary database.

### Read Replica

The read replica handles read-heavy queries such as feed requests. Replication from the primary database increases read capacity without sending every read to the primary database.

### Object Storage

Object storage keeps the original photos and generated thumbnails. It is designed for large binary files and scales independently from the relational database.

### Queue

The queue receives background jobs such as thumbnail generation after an upload. This keeps slow processing work out of the user's upload request.

### Worker

Workers consume jobs from the queue and perform background processing such as resizing photos, generating thumbnails, validating files, and storing the resulting thumbnails in object storage.

## 7. Upload Flow

1. The user selects a photo in the client and starts an upload.
2. The client sends the photo upload request to the load balancer.
3. The load balancer sends the request to a healthy application server.
4. The application server authenticates the user and validates the file type and size.
5. The original photo is uploaded to object storage.
6. The application server creates a photo metadata record in the primary database. The record contains information such as the user ID, object-storage key, upload time, and photo status.
7. The application server places a thumbnail-generation job on the queue.
8. The application server returns a successful upload response to the client without waiting for thumbnail generation to finish.
9. A worker consumes the thumbnail job from the queue.
10. The worker downloads or accesses the original image from object storage and generates the required thumbnail sizes.
11. The worker stores the generated thumbnails in object storage.
12. The worker updates the photo metadata so the thumbnails are marked as ready.
13. Future feed requests retrieve the photo metadata from the database/cache and the image files from the CDN or object storage.

This asynchronous queue and worker design keeps image processing out of the main HTTP request, allowing uploads to remain responsive even when many images need to be resized.

## 8. Architectural Trade-offs

### Strong Consistency vs. Performance

Using read replicas improves read capacity and protects the primary database from heavy feed traffic, but replicas can have replication lag. A user may briefly see older data after uploading a photo. Strong consistency would reduce this problem but would increase database load and potentially increase response latency.

### Cache Performance vs. Freshness

Caching feed data reduces database queries and improves response times, but cached information can become stale. Short cache expiration times improve freshness but reduce the performance benefit of caching. Longer expiration times improve performance but require stronger cache invalidation.

### Synchronous vs. Asynchronous Image Processing

Processing thumbnails during the upload request would make the implementation simpler, but large images could make uploads slow and consume application-server resources. Using a queue and workers adds infrastructure complexity but allows image processing to happen asynchronously and keeps upload requests fast.

### Object Storage vs. Database Storage

Object storage is better suited to large binary files and scales independently from the relational database. However, it introduces another service that must be managed and secured. Storing images directly in the database would simplify the architecture but could increase database size, backup costs, and query performance problems.

## 9. Availability and Failure Handling

The system avoids single points of failure by running multiple application servers behind the load balancer. The database uses a primary and read replica, while object storage provides durable storage for uploaded files. Multiple workers can process queued jobs, and failed jobs can be retried from the queue.

If an application server fails, the load balancer can route traffic to another healthy server. If a worker fails while processing a thumbnail, the job can remain available for another worker to retry. Database backups and replication provide additional protection against data loss.
