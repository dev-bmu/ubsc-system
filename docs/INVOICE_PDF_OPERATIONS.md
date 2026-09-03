# Private invoice PDF operations

## Runtime contract

Booking and membership data in the database remain the source of truth. A PDF
is an immutable, content-addressed derivative. The application renders it once,
stores it privately, records its byte length and SHA-256 checksum, and streams
the same verified artifact on later requests.

The document cache key includes the template version and every source field
that can change the invoice. It contains no customer data. A changed source or
template receives a new key; it never silently overwrites a historically
different invoice.

The renderer has a hard item bound, output byte bounds, PDF signature and EOF
checks, a distributed per-document lock, a temporary object, final object
verification, and a database manifest. A failed render cannot be published as
a valid invoice.

## Production configuration

Use these values as the production baseline:

```dotenv
INVOICE_PDF_PREWARM_ENABLED=true
INVOICE_PDF_ALLOW_SYNCHRONOUS_FALLBACK=false
INVOICE_PDF_QUEUE_CONNECTION=database
INVOICE_PDF_QUEUE=documents
INVOICE_PDF_JOB_TIMEOUT_SECONDS=60
INVOICE_PDF_LOCK_SECONDS=75
INVOICE_PDF_QUEUE_VISIBILITY_TIMEOUT_SECONDS=90
INVOICE_PDF_LOCK_STORE=database
INVOICE_PDF_DISK=invoice-pdf-s3
INVOICE_PDF_ARCHIVE_DISK=invoice-pdf-archive-s3
```

Database is a safe shared baseline for the queue and lock store. Redis can
replace both when it is operated as a durable shared dependency. Never use the
`sync`, `array`, or node-local `file` driver for production document work.

For a single server, the private local `invoice-pdf` disk is supported, but the
directory must live on persistent storage included in capacity alerts. For two
or more application nodes, use shared private object storage. The S3 bucket
policy must block all public access, enforce encryption at rest, enable
versioning, and grant the application only the required object prefix. Do not
publish a bucket URL or create a public storage link for invoices.

The archive retention period is an organizational and legal decision. Approve
it before enabling the archive disk. Object-storage lifecycle rules should
expire abandoned objects under `invoice-pdf/_tmp/` after several days and move
the archive prefix to the selected storage class. Never use a lifecycle rule
that can delete current hot artifacts before the application retention window.

## Dedicated worker

Run document rendering outside web requests:

```text
php artisan queue:work database --queue=documents --sleep=1 --tries=3 --timeout=60 --memory=192 --max-jobs=25 --max-time=1800
```

Use the isolated `ubsc-documents` program in the selected canonical artifact
under `deploy/supervisor/`; do not merge it into another queue worker. The
process restarts automatically after a crash or deployment. Give it a PHP
memory limit of at least 256 MB unless a measured production invoice requires a
different value. The Laravel `--memory` option recycles a worker; it is not a
replacement for the PHP hard memory limit.

The worker timeout must stay below the queue connection's `retry_after` lease.
With the database defaults, use 60 seconds for the job, 75 seconds for its
distributed artifact lock, and at least 90 seconds for `DB_QUEUE_RETRY_AFTER`.
The deployment doctor rejects an unsafe timing relationship.

`INVOICE_PDF_QUEUE_VISIBILITY_TIMEOUT_SECONDS` is the declared lease contract
for the document queue. For database, Redis, and Beanstalkd it must equal that
connection's `retry_after`. For SQS it must equal the queue visibility timeout
configured in AWS; the application cannot query that remote setting safely at
boot time.

Start with one worker per available CPU core but reserve memory for PHP-FPM,
the database client, and the operating system. DomPDF is CPU and memory heavy;
adding workers without a memory budget reduces reliability. Scale from queue
age and measured peak resident memory, not from request count alone.

When the artifact is not ready, production returns HTTP 202 with a bounded
retry interval. It never renders an expensive cache miss in the web process.
This keeps ordinary navigation responsive during traffic bursts.

## Scheduler and lifecycle

The Laravel scheduler runs `invoices:pdf:lifecycle` daily. It processes a
bounded batch, archives verified hot artifacts when an archive disk is set, or
removes only the regenerable artifact when no archive is configured. Booking,
membership, transaction, and audit records are never removed by this command.

Interrupted writes are placed in date-partitioned temporary prefixes. The
command removes only stale partitions older than the configured safety window.
The final deterministic object is created under a distributed lock and is
verified before its manifest is committed.

Useful commands:

```text
php artisan invoices:pdf:doctor --probe-storage
php artisan invoices:pdf:lifecycle --dry-run
php artisan invoices:pdf:lifecycle --limit=250
php artisan schedule:list
```

Run the doctor command in deployment after migration and before accepting
traffic. It reports only boolean checks and never prints credentials, paths,
customer data, or storage responses.

## Deployment sequence

```text
php artisan migrate --force
php artisan optimize:clear
php artisan optimize
php artisan invoices:pdf:doctor --probe-storage
php artisan schedule:list
php artisan queue:restart
```

Confirm that the process manager starts the `documents` worker after
`queue:restart`. Then dispatch or pay one controlled test transaction and
verify that Settings -> System Monitoring reports the private invoice pipeline
as Operational.

## Monitoring and capacity

The monitoring snapshot uses bounded indexed queries. It reports:

- dedicated worker heartbeat and lag;
- bounded queue depth and oldest job age;
- failed document jobs from the last 24 hours;
- latest render duration, size, time, and storage tier;
- expired hot-artifact backlog;
- free disk capacity for the local driver;
- renderer success or the last sanitized failure code.

The dashboard never counts the complete transaction or artifact table and does
not copy customer data into telemetry. A missing worker, excessive queue age,
failed render, missing latest object, lifecycle backlog, or low local disk
capacity opens one deduplicated operational incident.

Object-storage capacity and billing must also be monitored at the provider.
The application cannot infer bucket quota or provider-wide outages from inside
the same failure domain. Configure an off-host alert channel and an external
readiness probe.

## Failure recovery

1. If the queue is growing, verify the document worker heartbeat and process
   manager before adding workers.
2. If jobs fail, inspect the sanitized `invoice_pdf.generation_failed` event and
   the failed job class. Do not log the serialized payload or exception body in
   a public log sink.
3. If a stored file is missing, the next authorized request rejects its
   manifest and queues a clean regeneration.
4. If a checksum or size does not match, the artifact is rejected and rebuilt
   under the same distributed lock.
5. If local disk capacity is low, run lifecycle only after its dry run has been
   reviewed. Never delete booking or transaction rows to free PDF space.
6. If object storage is unavailable, keep the source transaction intact,
   restore connectivity, and retry failed jobs. The source of truth is not the
   cached PDF.

Repeated jobs and requests are safe: the unique job key and distributed
artifact lock prevent duplicate publication, and the deterministic manifest
keeps one current artifact for each exact source version.

## Backup and retention

Back up transaction, booking, membership, invoice manifest, and audit tables as
one consistent database set. Verify backup readability and checksum off-host.
If issued PDFs must be preserved independently, back up or archive their
private object prefixes with versioning. A database backup without its retained
private artifact archive cannot restore those historical binary copies, though
the current source data can regenerate them when the template is still
available.

Retention values in configuration are technical defaults, not legal advice.
The production owner must approve the final financial-document, privacy,
backup, and deletion policy before launch.
