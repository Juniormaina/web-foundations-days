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

    Users
      |
     CDN
      |
    Load Balancer
     /           \
App Server #1   App Server #2
     \           /
      |          |          |
    Cache    Primary DB   Queue
    (Redis)      |          |
            Read Replica  Thumbnail Worker
                              |
                        Object Storage
                     (photos + thumbnails)

The CDN sits in front of the load balancer. Application servers talk to the cache, the primary database, and the queue. The primary database replicates to a read replica. Workers consume queue jobs and write generated thumbnails to object storage.

## 6. Component Responsibilities

- **CDN:** Caches and serves thumbnails and popular images close to users, reducing latency and app-server load.
- **Load Balancer:** Spreads HTTP requests across application servers and removes unhealthy servers from rotation.
- **Application Servers:** Handle authentication, feeds, uploads, metadata, and API responses. Extra servers keep traffic flowing if one fails.
- **Cache:** Stores frequent feed data and metadata so every request does not hit the database. Cached entries expire or are invalidated when data changes.
- **Primary Database:** Stores users, photo records, captions, timestamps, and object-storage keys. All writes go to the primary.
- **Read Replica:** Serves read-heavy feed queries so the primary is not overloaded.
- **Object Storage:** Stores original photos and thumbnails. It is built for large files and scales separately from the database.
- **Queue:** Holds thumbnail-generation jobs after upload so slow image work is not part of the user's HTTP request.
- **Worker:** Consumes queue jobs, resizes photos, generates thumbnails, and stores them in object storage.

## 7. Upload Flow

1. The user selects a photo in the client and starts an upload.
2. The client sends the upload request to the load balancer.
3. The load balancer sends the request to a healthy application server.
4. The application server authenticates the user and checks the file type and size.
5. The original photo is stored in object storage.
6. The application server writes photo metadata to the primary database, including user ID, object-storage key, upload time, and status.
7. The application server places a thumbnail-generation job on the queue.
8. The application server returns success to the client without waiting for thumbnail generation.
9. A worker takes the thumbnail job from the queue.
10. The worker reads the original image from object storage and creates the thumbnail sizes.
11. The worker stores the thumbnails in object storage.
12. The worker updates the photo metadata so the thumbnails are marked ready.
13. Later feed requests read metadata from the database or cache and load images from the CDN or object storage.

The queue and worker keep image processing out of the upload request, so the client stays responsive while thumbnails are generated in the background.

## 8. Architectural Trade-offs

**Strong consistency vs. performance:** Read replicas increase feed-read capacity, but replication lag can briefly show older data after an upload. Strong consistency would hide that lag but would put more load on the primary and can increase latency.

**Cache performance vs. freshness:** Caching feeds reduces database queries and speeds responses, but cached data can be stale. Short TTLs stay fresher but help less. Longer TTLs are faster but need stronger invalidation.

**Synchronous vs. asynchronous image processing:** Generating thumbnails during the upload is simpler, but large files would slow uploads and occupy application servers. A queue plus workers adds infrastructure, but uploads stay fast.

**Object storage vs. database storage:** Object storage fits large binary files and scales on its own. It is another service to run and secure. Storing images in the database would be simpler, but it would grow backups, hurt query performance, and mix media with metadata.

## 9. Availability and Failure Handling

Multiple application servers sit behind the load balancer, so a failed server can be taken out of rotation. The database uses a primary and a read replica, and object storage keeps uploaded files durable. Several workers can process the queue, and a failed thumbnail job can be retried by another worker. Backups and replication protect metadata if a database node is lost.
