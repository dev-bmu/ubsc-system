# Performance and background-job operations

This subsystem keeps slow work outside customer-facing requests and exposes
bounded, privacy-safe throughput and latency measurements in **Settings →
Monitoring → Performance**.

## Queue lanes

| Priority | Queue | Work |
|---|---|---|
| 1 | `critical` | Interrupted payment recovery and lifecycle reconciliation |
| 2 | `notifications` | Password reset and email verification delivery |
| 3 | `documents` | Immutable invoice PDF prewarming |
| 4 | `maintenance`, `media-maintenance` | Bounded cleanup work |
| 5 | `default` | Unclassified short work |
| Isolated | `media-image`, `media-video` | CPU-heavy image and video transforms |

Payment recovery is unique, retry-safe, and dispatched by the scheduler once
per minute. The existing recovery service remains the authoritative,
transactional, idempotent boundary; a retry never creates a new charge.
Notifications are encrypted in queue storage. Media jobs have a dedicated
long visibility lease, uniqueness, overlap protection, retry backoff, and
`afterCommit` dispatch.

## Production processes

Run exactly one Laravel scheduler process **per node** under Supervisor. Shared
`onOneServer` and bounded overlap locks elect one executor while preserving a
warm scheduler on every other node. Do not pool unrelated queue names in one
worker: every lane has an isolated process bulkhead. The canonical database
baseline is `deploy/supervisor/ubsc-database.conf.example`; conceptually it
runs:

```text
php artisan schedule:work
php artisan queue:work database --queue=critical --sleep=1 --tries=3 --backoff=5 --timeout=80 --max-time=3600
php artisan queue:work database --queue=documents --sleep=1 --tries=3 --backoff=5 --timeout=80 --max-time=3600
php artisan queue:work database --queue=notifications --sleep=1 --tries=3 --backoff=5 --timeout=80 --max-time=3600
# maintenance, media-maintenance, and default each run in another dedicated worker
php artisan queue:work database-long --queue=media-image --sleep=1 --tries=3 --timeout=1000 --max-time=3600
php artisan queue:work database-long --queue=media-video --sleep=1 --tries=3 --timeout=1000 --max-time=3600
```

Use multiple worker processes only after measuring arrival rate and runtime.
A safe starting estimate is `ceil(peak jobs/second × P95 runtime seconds ×
1.3)`, followed by a load test. Keep image and video workers separate so a
long video cannot starve short customer-facing work. Restart workers after
every deployment with `php artisan queue:restart`. Use
`deploy/scripts/activate-release.sh` for production so the validated Supervisor
artifact is actually reloaded first and the persistent scheduler is restarted
onto the activated release; validating a file without loading it is not a
deployment.

For sustained high traffic, provision shared Redis and set:

```text
BACKGROUND_JOB_CONNECTION=redis
BACKGROUND_MEDIA_CONNECTION=redis-long
PERFORMANCE_METRICS_DRIVER=redis
PERFORMANCE_METRICS_REDIS_CONNECTION=cache
```

Do not switch these values before Redis is redundant, persistent where needed,
monitored, and reachable from every application node.

## Throughput and latency telemetry

HTTP requests are classified into five stable scopes: public reads, booking
and checkout, admin operations, authentication, and other writes. Only minute,
scope, histogram bucket, count, duration sum, and 5xx count are retained. URLs,
route parameters, query strings, payloads, users, email addresses, IPs, and
credentials are never stored.

Queue telemetry records processed/failed counts plus wait and runtime
histograms per configured lane. The dashboard derives requests/minute,
jobs/minute, averages, P50, P95, P99, error rate, queue depth, and worker
freshness. MySQL/MariaDB additionally reports connection utilization, running
threads, query rate, slow-query deltas, lock waits, and buffer-pool hit rate.
Unsupported or insufficient telemetry is shown as **Unknown**, never as a fake
zero or healthy state.

Database metric storage is a zero-infrastructure baseline. Redis uses one
atomic Lua aggregation per request/job and is recommended before high sustained
traffic. Both drivers have fixed low-cardinality keys and seven-day retention;
database buckets are pruned hourly in bounded batches and Redis buckets expire
with TTL.

`PERFORMANCE_TESTED_RPS` must remain empty until a repeatable, production-like
load test proves sustainable throughput while latency and error targets remain
healthy. Once set, the dashboard exposes utilization and measured headroom.
This avoids inventing capacity from hardware specifications.

## Deployment gate

Run these commands after migrations and before routing production traffic:

```text
php artisan migrate --force
php artisan optimize
php artisan production:process-check --strict
php artisan background-jobs:doctor
php artisan invoices:pdf:doctor --probe-storage
php artisan queue:restart
bash deploy/scripts/verify-process-supervision.sh APP_DIRECTORY
```

The doctor fails when a queue is missing, a job timeout can exceed its
visibility lease, failed-job persistence is disabled, metric storage is
missing, or an invalid metrics driver is selected. Queue probes and the
monitoring collector must remain scheduled. Configure off-host alert delivery
and an independent availability probe as documented in
`MONITORING_OPERATIONS.md`; internal telemetry cannot detect a server that is
completely unreachable.

The MariaDB CI gate also races concurrent metric increments to ensure atomic
upserts never lose throughput counts. Keep that workflow as a required branch
check.
