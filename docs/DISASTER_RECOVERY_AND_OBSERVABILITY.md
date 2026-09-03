# Disaster recovery and observability operations

This runbook is the production contract for point-in-time recovery (PITR),
immutable database backups, restore drills, structured telemetry, SLOs, and
incident delivery. Application code validates and records provider evidence;
it cannot provision a managed database, object-lock bucket, log drain, APM,
synthetic monitor, or pager.

## Safety boundaries

- MariaDB/MySQL remains the authority for bookings, memberships, payments,
  users, news/article metadata, and every other relational record.
- The immutable backup scope is the complete relational database. Gallery,
  video, and image objects are protected separately through object-storage
  versioning and lifecycle policy; they are not duplicated into the database
  archive.
- Managed Multi-AZ failover handles a writer/node failure. PITR and immutable
  backup handle deletion, corruption, operator error, ransomware, and a wider
  provider incident. One is not a substitute for the other.
- No public or admin HTTP route performs a restore. Production restore is an
  explicitly authorized break-glass infrastructure operation because a
  one-click restore can overwrite good data or create split-brain writes.
- The application never calls a backup successful merely because a timer ran.
  Readability, full SHA-256, encryption, off-site placement, and compliance
  object lock must all be independently verified first.

## Recovery objectives

The launch baseline is:

- RPO: 300 seconds. Provider latest-restorable-time must remain no more than
  five minutes behind the observation time.
- RTO: 3,600 seconds. An isolated drill must restore and pass all acceptance
  checks within one hour.
- continuous provider-managed PITR: at least 14 days;
- encrypted cross-account immutable database backup: at least 35 days in
  compliance object-lock mode;
- cross-region immutable copy: mandatory for release and runtime contracts;
- isolated restore drill: every 90 days, with a 14-day outage grace boundary.

Changing an objective requires an operational decision and a successful drill.
Never loosen a target merely to make the monitoring cockpit green.

## Provider provisioning (outside this repository)

Before enabling the production declarations:

1. Enable continuous binary-log/PITR retention on the managed writer cluster.
2. Expose the provider's latest-restorable-time through a restricted automation
   identity. The identity needs observation permission, not database-admin
   permission.
3. Create a backup destination in an independent account/security boundary.
   Enable server-side encryption, versioning, and compliance-mode object lock
   before the first object is written; object lock normally cannot be added
   retroactively.
4. Replicate or copy the immutable archive to another region.
5. Create an isolated, non-production restore network/account with no route to
   production writes or customer notifications.
6. Run a protected verifier outside all application/database hosts. Its private
   RSA-2048+ or P-256+ key never enters Laravel. Configure only its public key
   ring and active key IDs on application hosts.
7. Store the local recovery-ledger HMAC key ring in the hosting secret manager.
   Keep it independent from `APP_KEY`, verifier keys, database credentials, and
   webhook keys.
8. Configure an off-host JSON log drain and preserve
   `recovery.evidence_anchor` events outside all application/database nodes.
   Attach provider-side automation that issues a signed ingestion receipt only
   after the exact `observability.canary` event is queryable in retained
   storage. Its private signing key must stay outside every application host.

The non-secret declarations are documented in
`deploy/production.env.example`. Empty provider, webhook, and key-ring values
are deliberate launch blockers, not defaults to work around.

## PITR observation

Protected provider automation should observe the latest restorable timestamp
at least every five minutes, populate
`deploy/recovery/pitr.payload.example.json`, sign it outside every application
host, and import only the signed envelope:

```text
node scripts/sign-recovery-attestation.mjs \
  artifacts/pitr.payload.json \
  /run/secrets/recovery-attestation-private.pem \
  verifier-v1 \
  artifacts/pitr.envelope.json

php artisan recovery:attestation-import \
  --file=artifacts/pitr.envelope.json
```

Production accepts only the independently signed path. Payloads require strict
RFC3339 offsets, bounded target identities, and a five-minute future clock
tolerance. A non-continuous or non-restorable provider state immediately records
Outage. Delayed or replayed observations cannot make PITR fresh or hide a newer
failure because monitoring orders by the provider observation timestamp, not
ingestion time. `monitoring:pitr-observed` remains a local/non-attested
diagnostic command and cannot bypass the production trust boundary.

## Immutable backup evidence

After the protected external workflow has opened/read the archive, recomputed
SHA-256, verified encryption, checked the independent destination, and read
provider object-lock metadata, it signs the exact payload. Use
`deploy/recovery/backup.payload.example.json`, sign on the protected verifier,
then import only the envelope:

```text
node scripts/sign-recovery-attestation.mjs \
  artifacts/backup.payload.json \
  /run/secrets/recovery-attestation-private.pem \
  verifier-v1 \
  artifacts/backup.envelope.json

php artisan recovery:attestation-import \
  --file=artifacts/backup.envelope.json
```

`operation-id` is the idempotency boundary. A retry with the same canonical
payload and signing key returns the original signed record, including a fresh
valid ECDSA signature; reuse with different evidence is rejected.
The original completion timestamp remains authoritative, so replaying an old
command cannot disguise a stale backup. The verified recovery point must follow
the source snapshot and meet the configured RPO; a readable but stale archive
is retained as signed Outage evidence. Ingestion acknowledges valid evidence;
use `--fail-on-unhealthy` when the calling shell must also exit non-zero.

On any failed backup/verification path, sign and import
`deploy/recovery/backup-failure.payload.example.json` immediately rather than
waiting for freshness to expire. A failed import or absent evidence remains an
Outage; it cannot be converted into a green heartbeat.

Allowed failure codes are intentionally finite and contain no provider payload
or credentials. Legacy direct recording commands are restricted to local or
explicitly non-attested environments and cannot bypass production attestation.

## Isolated restore drill

Restore a verified archive plus provider recovery logs into the isolated drill
target. Do not record success until schema, critical aggregate row counts,
booking uniqueness, memberships, payments, users/authorization, content,
database constraints, migration state, the audit ledger, and a read-only
application smoke test pass. Populate and externally sign
`deploy/recovery/restore-drill.payload.example.json`, then import it with
`recovery:attestation-import`.

`started-at` is the simulated incident/cutover boundary. The restored recovery
point determines observed RPO; start-to-completion determines observed RTO.
The point cannot predate the signed backup, and a newer point is accepted only
as a failed-or-passed check together with explicit verified provider-log replay.
Production-like target names are rejected. Isolation and absence of production
credentials/write paths are explicit acceptance checks. Failed checks and
missed objectives remain append-only Outage evidence; run a corrected drill
with a new drill ID.

## Evidence integrity and key rotation

PITR, backup, and drill evidence is serialized into an append-only sequence.
Every record includes its predecessor hash, canonical content hash, local HMAC
signature, and—on schema v2—its externally signed source payload. App-level
and database-trigger update/delete are denied, concurrent appenders serialize
on a locked chain head, and an hourly job re-verifies the complete chain and
the external signature:

```text
php artisan recovery:evidence-verify --record-heartbeat
```

Every append locks and cryptographically validates the current head, latest
record, predecessor link, and external source binding in constant time. The
hourly and release gates verify the complete chain in bounded chunks against an
optimistic immutable-head snapshot, so ingestion is not blocked by lifetime
history and a concurrent append cannot produce a false tamper alert. Every
accepted append emits a sanitized `recovery.evidence_anchor` containing its
sequence and signed record hash to the off-host structured log path. Preserve those anchors
independently; they let operators detect database tail rollback or truncation
that a database-local head alone cannot prove.

To rotate keys, add `v2` while retaining `v1`, rebuild configuration, verify the
entire configured key ring, switch the external signer and active IDs, then
append and verify new evidence. Inactive keys are still checked for valid,
distinct material. The current ledger retains complete append-only history, so
retain every public verification and local HMAC key referenced by a row;
removing an old key intentionally makes complete-chain verification fail.

## Observability contract

The application provides:

- a fresh server-generated `X-Request-ID` on stateful pages and stateless
  liveness/readiness probes; client-provided IDs never become the server trace;
- bounded, low-cardinality request/queue minute buckets with no URL, payload,
  email, telephone, credential, IP, or customer identity;
- sanitized JSON stderr output for a hosting log collector;
- transactional incident outbox delivery with HMAC-signed HTTPS webhook,
  retry, deduplication, lease fencing, stale-claim recovery, recoverable dead
  letters, and local log fallback; an incident transition and its alert record
  commit together, so a process crash cannot lose the transition notification;
- a dead-man heartbeat for the alert dispatcher, recent delivered canary proof,
  pending-count, and oldest-pending-age boundaries, so a broken pager does not
  silently report healthy;
- request-based booking-success and latency SLIs with exact good/total counts;
- error budgets and 1h/6h/24h burn rates. Fast and sustained burns can alert
  before the full 28-day compliance value falls below target.

The independent availability workflow remains authoritative for total host,
network, DNS, TLS, and application outage. Every result is HMAC-authenticated
and ingested into `sli.public_availability`; expected five-minute intervals that
never arrive conservatively count as bad samples. This preserves total-outage
truth even when the unavailable application cannot receive the failed probe.
The signed payload must cover `/up`, `/health/ready`, and `/` on the same origin
as `APP_URL`; monitoring a different always-green site cannot satisfy the gate.
Configure matching `UBSC_EXTERNAL_SLI_KEY_ID` and
`UBSC_EXTERNAL_SLI_SIGNING_KEY` GitHub secrets; the server keeps the rotatable
key ring in `EXTERNAL_MONITORING_INGEST_KEYS`.

## Alert control plane

Production requires both `log` and `webhook` channels. The webhook must be HTTPS
and use a dedicated 32-byte-or-longer HMAC secret. Run once during deployment to
prove real off-host delivery, collect the snapshot, then drain incidents
opened by that snapshot:

```text
php artisan monitoring:alerts:canary --quiet
php artisan monitoring:collect --quiet
php artisan monitoring:alerts:deliver --quiet
```

The canary uses the same durable outbox, transport, HTTPS destination, and HMAC
signature as real incidents. Its independent heartbeat preserves a failed
canary even if a later empty dispatcher cycle succeeds. A dispatcher heartbeat
without recent successful off-host delivery remains Unknown/Degraded rather
than green. Any dispatcher exception records an Outage heartbeat when the
database is available and always writes a sanitized local error. Pending
records remain durable. Dead letters are retained for investigation; correct
the destination then use `monitoring:alerts:retry-dead --delivery-id=<uuid>`
(or an explicit, bounded `--all`) before the normal dispatcher drains them.
The alert ID is part
of the signed canonical request and remains stable across retries. The receiver
must reject stale timestamps, recompute the HMAC over version, timestamp,
alert ID, and body hash, then deduplicate on `X-UBSC-Alert-Id`. Never place a
credential or customer identity in the payload; use the explicitly reviewed
dead-letter replay command rather than editing outbox rows manually.
Canary operation identifiers are idempotent only for the bounded retry window
configured by `MONITORING_ALERT_CANARY_REUSE_SECONDS`. Reusing older evidence
records an Outage heartbeat and exits non-zero instead of refreshing monitoring
health without a new delivery.

## Release and recurring verification

Static configuration gates run before migration and again after the optimized
configuration cache is built. Normal release activation additionally requires
fresh live recovery proof before any schema mutation:

```text
php artisan production:recovery-check --strict
php artisan production:observability-check --strict
bash deploy/scripts/verify-database-recovery.sh APP_DIRECTORY
```

After migration and fresh monitoring cycles, require observed evidence. The
receipt flag is mandatory in the post-rollout path because this is the point at
which the newly activated release is publicly reachable:

```text
bash deploy/scripts/verify-recovery-observability.sh APP_DIRECTORY --require-log-receipt
```

The live recovery gate requires operational PITR, immutable backup, restore
drill, mandatory independent attestation, and evidence-chain signals. The live
observability gate requires a healthy off-host alert path, a fresh provider-
signed log-ingestion receipt, and a fresh authenticated external synthetic
heartbeat. SLO burn incidents remain visible
and pageable but do not prevent deployment of a release that may be needed to
repair an outage.

`monitoring:alerts:canary` writes the same opaque operation identifier through
the structured log channel and the signed HTTPS alert channel, and succeeds
only when both local transports accept delivery. Local acceptance is not
treated as proof of off-host retention. The log platform must independently:

1. locate that exact operation ID in retained JSON;
2. hash the exact canonical retained event with SHA-256;
3. bind the receipt to provider, environment, release, retention deadline, and
   a unique receipt ID;
4. sign the canonical receipt payload with an RSA-2048+ or approved P-256+
   private key held outside Laravel; and
5. POST it to `/monitoring/log-receipts` before the bounded release wait ends.

The reference provider-side helper is:

```text
UBSC_LOG_RECEIPT_BASE_URL=https://ubsportcenter.co.id \
UBSC_LOG_RECEIPT_PROVIDER=YOUR_LOG_PROVIDER \
UBSC_LOG_RECEIPT_ENVIRONMENT=production \
UBSC_LOG_RECEIPT_RELEASE="$APP_RELEASE" \
UBSC_LOG_RETENTION_DAYS=90 \
node scripts/publish-log-ingestion-receipt.mjs \
  "$PRODUCTION_READINESS_OPERATION_ID" \
  "$RETAINED_CANONICAL_EVENT_SHA256" \
  /run/secrets/off-host-log-receipt-private.pem \
  log-provider-v1 \
  "/var/lib/ubsc-log-receipts/outbox/${PRODUCTION_READINESS_OPERATION_ID}.json"

UBSC_LOG_RECEIPT_BASE_URL=https://ubsportcenter.co.id \
node scripts/post-log-ingestion-receipt.mjs \
  "/var/lib/ubsc-log-receipts/outbox/${PRODUCTION_READINESS_OPERATION_ID}.json"
```

Laravel stores only the matching public key ring. New receipts accept active
key IDs only; old public keys must remain configured until every receipt they
signed is outside its evidence-retention window. Receipt IDs, operation IDs,
and payload hashes are append-only and unique. Stale, future-dated, replayed,
conflicting, wrong-release, wrong-environment, weak-key, private-key, or
database-tampered evidence fails closed. The exact endpoint, edge body limit,
durable replay sequence, key rotation, and provider adapter contract are documented in
`deploy/observability/README.md`.
First-production bootstrap is a controlled, traffic-disabled procedure; follow
`deploy/recovery/README.md` and never add a persistent bypass flag.

## Break-glass production recovery

For an actual destructive incident:

1. Declare the incident, freeze deployments and non-essential writes, retain
   all logs/evidence, and identify the last known-good point.
2. Prefer provider failover for infrastructure loss. Use PITR only when logical
   state itself must be rewound.
3. Restore to an isolated target first. Verify schema and all booking,
   membership, and payment invariants before any traffic switch.
4. Reconcile writes between the selected recovery point and incident freeze.
   Never silently discard acknowledged bookings or settled payments.
5. Promote/switch through the provider's approved procedure, update the stable
   writer endpoint if required, run readiness and smoke checks, then reopen
   traffic gradually.
6. Record actual RPO/RTO, preserve evidence, and conduct a post-incident review.

Do not run an in-place destructive restore over the only production writer and
do not delete the original failed database until recovery is independently
accepted.
