# Database replication operations

This runbook defines the UBSC production database-replication contract. It is
deliberately separate from disaster recovery: replication keeps service
available after a node or availability-zone failure, while PITR and immutable
backups recover from deletion, corruption, ransomware, or operator mistakes
that may replicate immediately.

## Architecture and ownership

- The managed database provider owns replication transport, quorum, election,
  promotion, endpoint convergence, and stale-writer fencing.
- Laravel connects to one stable writer endpoint and never receives provider
  promotion credentials.
- A protected observer reads provider topology plus bounded database role/lag
  metadata. It signs observations with a private key held outside all web,
  queue, scheduler, and database hosts.
- Application hosts receive public observer keys and an independent HMAC ledger
  key through the deployment secret manager.
- Admin monitoring is read-only. Promote, demote, failback, and fencing remain
  break-glass infrastructure operations with dual control.

## Non-negotiable invariants

1. Exactly one writable primary is visible in every topology epoch.
2. At least one caught-up synchronous or semisynchronous standby is available
   in another availability zone.
3. Quorum and provider fencing prevent a partitioned former primary from
   accepting writes.
4. GTID, row-based binary logging, server-enforced replica read-only mode, and
   verified TLS are enabled.
5. Promotion advances a monotonic topology epoch, identifies the former writer,
   proves that writer fenced, proves the new writer caught up, and reports zero
   lost committed bytes.
6. Automatic failover is allowed. Automatic failback is forbidden.
7. Transactional application reads remain on the writer. Replica reads are
   opt-in only for explicitly eventual, idempotent read models.

## Production bootstrap

1. Provision a managed single-writer cluster spanning at least two AZs.
2. Configure one stable writer endpoint and one stable reader endpoint. Store
   only opaque endpoint identities in the application contract.
3. Create a least-privilege application writer credential and a separate
   SELECT-only replica credential. Keep both in the hosting secret manager.
4. Mount the provider CA bundle and require hostname/peer verification.
5. Configure the independent observer and its asymmetric signing key. Export
   only the public key to `DB_REPLICATION_ATTESTATION_VERIFYING_KEYS`.
6. Generate an independent 32-byte-or-longer ledger HMAC key and store it in
   `DB_REPLICATION_LEDGER_SIGNING_KEYS`. Use cryptographically random material,
   never reuse `APP_KEY` or another ledger/signing secret, and retain old keys
   during rotation.
7. Ensure replication provider/dataset/primary-region identities exactly match
   the database-recovery contract.
8. Import a fresh signed topology observation and verify the event ledger.
9. Run the static and live release gates before migrations or traffic.

The very first release is a controlled bootstrap because its migration creates
the control-plane tables. Put a fresh, already-signed envelope at
`DB_REPLICATION_BOOTSTRAP_ATTESTATION_FILE`: the pre-migration gate verifies it
statelessly, migration creates the complete schema, and activation imports it
exactly once. Delete that envelope after activation. Existing or partially
missing tables never fall back to bootstrap; they fail closed for investigation.
If a process dies after creating every table but before migration bookkeeping,
the next release may continue only when the schema is provably pristine: one
zero-sequence chain head, no state, and no events. Any history makes that path
ineligible and preserves the incident for manual investigation.

```text
php artisan production:replication-check --strict
php artisan replication:attestation-import --file=topology.signed.json --fail-on-unhealthy
php artisan replication:ledger-verify --record-heartbeat
php artisan production:replication-check --strict --live
bash deploy/scripts/verify-database-replication.sh /srv/ubsc/current
```

The external observer should deliver an already-signed envelope through the
bounded stdin importer, using a private mTLS/SSH execution channel whose account
can run only this command:

```text
cat topology.signed.json | bash deploy/scripts/import-database-replication-attestation.sh /srv/ubsc/current
```

Do not place the observer private key on an application, queue, scheduler,
database, CI, or admin host. Delivery failure and unhealthy evidence must page
off-host; blind infinite retries are forbidden.

## Runtime write-safety gate

The existing `database` check inside `/health/ready` performs two independent
proofs whenever the replication contract is enforced: it confirms that the
stable endpoint is currently a writable database role, then verifies the signed
control-plane state and its latest ledger anchor. This behavior is inseparable
from the database readiness adapter, so a deployment cannot accidentally omit
replication safety by editing the readiness-check list.

The load balancer removes an application node from write traffic when signed
state is missing, malformed, tampered, or cannot prove all of these immediate
write invariants: exactly one writer, a writable accepted writer, healthy
quorum, stale-writer fencing, and read-only replicas. Public readiness remains
opaque and never returns topology, endpoint, key, or failure details.

Replica lag, loss of standby coverage, a failed automatic-failover mechanism,
or stale observer delivery remains an urgent off-host incident but does not by
itself remove a healthy proven writer. That distinction preserves availability:
degraded redundancy must not be converted into a self-inflicted total outage.
The database writer probe can still remove nodes if their endpoint is no longer
writable during real promotion or endpoint convergence.

## Observation cadence and storage

Produce one signed observation every 30-60 seconds. The current state is one
mutable, externally verifiable row; routine healthy observations therefore do
not create unbounded history. The append-only ledger records only meaningful
changes: initialization, degradation/outage/recovery, topology epoch changes,
failover/failback, drills, split-brain conflicts, and epoch regressions.

Observation ingestion and load-balancer readiness validate only the locked
chain head, signed current state, and cryptographic ledger tail, so their work
remains constant as history grows. The scheduled and release verification path
separately streams the complete ledger in bounded sequence chunks every hour;
long-term history therefore strengthens auditability without adding linear
latency to requests or observer delivery.

Historical event integrity is evaluated against provider facts and the policy
outcome preserved in that signed/HMAC-protected event, not against today's lag
or replica thresholds. Current topology health is recomputed from the latest
signed provider payload using the active policy on every read and readiness
decision. Tightening or relaxing policy can therefore change current health
without corrupting old evidence or blocking the next valid observation.

The observer timestamp must be recent and explicitly RFC3339. Older delivery
cannot overwrite newer state. An identical timestamp with different content is
rejected. The UI becomes degraded after 120 silent seconds and outage after
300; ledger verification is hourly and becomes outage after four silent hours.

## Automatic failover

During a writer failure:

1. the provider removes/fences the failed writer;
2. quorum elects an eligible caught-up standby;
3. the provider advances its topology generation and updates the stable writer
   endpoint;
4. in-flight transactions fail and roll back rather than being guessed;
5. application readiness removes nodes until their writer probe reconnects;
6. clients repeat mutation requests only with the original idempotency key;
7. the observer emits `failover_completed` evidence with the old/new writers,
   newer epoch, fencing/catch-up proof, incident/change reference, and data loss;
8. monitoring and off-host alerts remain active until all safety checks recover.

If any payload reports two writers in one epoch, a lower epoch, missing fencing,
missing catch-up, or nonzero loss, the control plane records an outage and does
not silently replace the accepted writer state.

## Controlled failback

Never automatically return to the previous writer. Failback requires:

1. an incident commander and approved change reference;
2. confirmed full catch-up and healthy quorum;
3. maintenance or bounded connection draining when required by the provider;
4. fencing of the current writer before the replacement accepts traffic;
5. a strictly newer topology epoch and signed `failback_completed` evidence;
6. post-cutover booking, membership, payment, authentication, integrity, and
   idempotency probes;
7. sustained lag/SLO observation before closing the incident.

## Split-brain response

Treat split-brain as a critical data-integrity incident, not a normal failover.

1. Stop routing mutations through the affected topology.
2. Preserve provider logs and signed evidence; do not delete the event ledger.
3. Fence every uncertain writer through the provider control plane.
4. Identify the authoritative GTID lineage and reconcile divergent writes under
   an incident-specific, reviewed procedure.
5. If correctness cannot be proven, switch to the database-recovery runbook and
   restore an isolated PITR target rather than merging data heuristically.
6. Resume only with one writer, a newer epoch, healthy quorum, zero unresolved
   divergence, and signed evidence.

## Lag and replica loss

- Warning: maximum replica lag at or above 2 seconds.
- Outage: lag at or above 10 seconds, no required synchronous standby, unhealthy
  quorum, non-read-only replicas, unavailable writer, or missing fencing proof.
- Do not promote a lagging replica merely to satisfy availability.
- Add capacity or reduce workload after determining whether lag is caused by
  write volume, long transactions, DDL, network saturation, storage latency, or
  replica compute pressure.

## Application replica reads

`DB_REPLICA_READS_ENABLED` remains false by default. Enabling it does not change
Laravel's default connection and does not authorize global `read`/`write` split.
Only a reviewed read model may explicitly select `mariadb_replica`, and only if:

- stale data is harmless to the user and business decision;
- the query is idempotent and has writer fallback;
- the request is outside the read-after-write causal window;
- signed topology/lag state is operational;
- the signed reader-endpoint signal is healthy, otherwise the read model falls
  back to the writer;
- the credential is SELECT-only and the server enforces read-only mode.

Never route availability, booking, cart, checkout, payment, membership status,
login/session, authorization, admin mutation, invoice correctness, or recovery
control-plane reads to an asynchronous replica.

## Drills and acceptance

Run a provider-approved database-writer failover drill at least quarterly in an
isolated production-like staging twin. Verify bounded RTO, zero committed-row
loss, endpoint convergence on every app node, stale-writer fencing, transaction
rollback behavior, idempotent retries, monitoring detection/recovery, and signed
evidence ingestion. The required MariaDB CI gate separately races ledger appends
to prove contiguous sequence allocation, conflicting-writer fencing, and
operation-identity idempotency under real InnoDB locks.

## Key rotation

Add the new observer public key and ledger HMAC key before switching active key
IDs. Confirm both old and new evidence verify, switch the external observer,
then switch active IDs. Retain old verification/HMAC material for as long as its
events remain in the ledger. The release contract validates inactive historical
keys as well as active keys and rejects malformed or duplicate material. Never
put a private observer key in `.env`, source, CI logs, an application container,
or an admin browser.

## Release rollback

After the first replication event exists, the migration intentionally refuses
to drop the append-only ledger. Roll back application code with a compatible
release while retaining the schema, or ship a reviewed forward migration; do
not run `migrate:rollback` across the replication control-plane migration. A
rollback that deletes signed incident history is not an acceptable recovery
mechanism.
