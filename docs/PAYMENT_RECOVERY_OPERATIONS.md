# Payment recovery operations

## Purpose

`payments:recover` repairs durable payment phase boundaries after a PHP worker,
queue worker, deployment, or server stops unexpectedly. It never creates a new
order or provider charge.

The command runs these idempotent phases in order:

1. Project a verified paid attempt/transaction into its booking or membership.
2. Move stale `creating` attempts to `reconciling`.
3. Expire only genuinely unpaid and provider-unbound holds.
4. Reconcile booking and membership lifecycle timestamps.

Provider-bound ambiguous payments deliberately fail closed. Their inventory or
membership is not released until the future official provider adapter can
retrieve a conclusive status using the existing provider identifier.

## Local development

`composer run dev` starts the web server, queue listener, Laravel scheduler,
log viewer, and Vite. The scheduler therefore resumes recovery with the normal
development stack.

Useful checks:

```bash
php artisan payments:recover
php artisan payments:logs:archive --dry-run
php artisan schedule:list
```

## Production scheduler

Laravel cannot start an operating-system process by itself. Production runs
one automatically restarted `schedule:work` process on every node using the
selected artifact under `deploy/supervisor/`. Shared `onOneServer` and bounded
overlap locks elect the executor; another node remains ready to take over.
Database row locks and idempotency remain the final safety layer if ownership
changes around a failure boundary.

The scheduler dispatches recovery to the isolated `critical` queue. At least
two critical workers per node are supervised with automatic restart, so media,
document, notification, and maintenance backlogs cannot starve reconciliation.

## Deployment sequence

```bash
php artisan migrate --force
php artisan optimize:clear
php artisan optimize
php artisan payments:recover
php artisan schedule:list
```

Restart long-lived PHP/queue/scheduler processes after deployment according to
the hosting platform.

## Configuration

```dotenv
PAYMENT_RECOVERY_STALE_SECONDS=120
PAYMENT_LOG_STACK=payment_daily
PAYMENT_LOG_LEVEL=info
PAYMENT_LOG_DAILY_DAYS=45
PAYMENT_LOG_ARCHIVE_AFTER_DAYS=30
PAYMENT_LOG_RETENTION_DAYS=365
# PAYMENT_LOG_ARCHIVE_PATH=/private/durable/payment-log-archive
```

The threshold marks interrupted `creating` attempts as `reconciling`; it does
not mark them paid and does not generate a replacement charge.

## Monitoring

Alert on non-zero exits from `payments:recover` and structured log events named
`payment_recovery_failed`. The logged context contains internal record IDs and
exception class only; it must never include provider secrets, cookies, card
data, authorization headers, or raw webhook payloads.

Repeated execution is expected and safe. A recovered booking, membership, paid
timestamp, and membership history entry remain single after any number of runs.

## Structured payment logs and retention

Payment and recovery operations use the dedicated `payments` channel. Its
default `payment_daily` sink writes JSON Lines to
`storage/logs/payments/payment-YYYY-MM-DD.log`. Event context is enforced by a
central allowlist: only opaque database IDs, normalized states, error class
names, error fingerprints, and aggregate counters are accepted. Customer
names, email addresses, phone numbers, request/webhook payloads, cookies,
tokens, payment instrument data, and provider secrets are never valid fields.

The daily `payments:logs:archive` schedule performs two separate retention
layers:

1. Hot logs remain directly readable for 30 days by default.
2. Logs at least 30 days old are streamed into private gzip archives grouped by
   year/month. Every archive has a `.sha256` sidecar containing the checksum of
   the original uncompressed log.
3. The daily handler keeps a 45-day safety window, so a temporarily failed
   archive job has time to recover before log rotation could remove a source.
4. Archives older than 365 days are purged. The command refuses unsafe settings
   unless `archive threshold < local rotation window < archive retention`, and it never
   deletes a source file before the gzip and checksum are committed.

The local private archive protects normal operation but is not a disaster
recovery backup. Production operations must copy
`storage/app/private/payment-log-archive` to encrypted, access-controlled,
off-host storage with versioning or object lock, and alert on non-zero command
exits. Alternatively add an approved remote sink such as `stderr` or `syslog`
to `PAYMENT_LOG_STACK`; do not place credentials in that variable. The final
retention period must be reviewed against the organization's legal and privacy
requirements before launch.

The payment scheduler uses `withoutOverlapping` and `onOneServer`. Those
guarantees require the production nodes to share a cache driver that supports
atomic locks. Database locks and payment idempotency remain the financial
safety layer if an operational lock expires unexpectedly.
