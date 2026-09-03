# Database replication production contract

This directory is an operator contract, not an infrastructure provisioner.
Laravel never receives credentials that can promote, demote, fence, or delete a
database node. Those privileges remain in the managed provider and a protected
external observer/orchestrator.

## Required topology

1. One managed writer endpoint spanning at least two availability zones.
2. At least one synchronous or semisynchronous standby eligible for automatic
   promotion, with quorum and stale-writer fencing.
3. GTID, row-based binary logging, server-enforced read-only replicas, verified
   TLS, and a zero-data-loss promotion policy.
4. Automatic failover is allowed; automatic failback is forbidden. Failback is
   an approved operation with a new topology epoch and signed evidence.
5. The default Laravel connection remains writer-only. Booking, membership,
   payment, authentication, inventory, admin, and read-after-write queries must
   never use an asynchronous replica.

## Signed observation flow

The protected observer reads provider control-plane and database-role metadata,
builds the exact payload shown in `topology.payload.example.json`, and signs it
outside every web/queue/database host:

```text
node scripts/sign-database-replication-attestation.mjs \
  topology.json /protected/observer-private-key.pem observer-v1 topology.signed.json

php artisan replication:attestation-import \
  --file=topology.signed.json \
  --fail-on-unhealthy
```

For continuous delivery, stream the already-signed envelope from the protected
observer through a private mTLS/SSH runner. The application host receives no
private key and retains no transient payload file:

```text
cat topology.signed.json | \
  ssh protected-deployment-runner \
  'bash /srv/ubsc/current/deploy/scripts/import-database-replication-attestation.sh /srv/ubsc/current'
```

The transport account must be restricted to that bounded import command. Never
grant it provider promotion, database shell, arbitrary SSH, or deployment
permissions. A failed/unhealthy import exits nonzero so the observer must page
the off-host incident channel rather than silently retry forever.

Run the observer at least every 30-60 seconds. The application stores only one
signed current-state row, so steady telemetry does not grow database storage.
Only initialization, status changes, failover/failback, epoch changes, drills,
split-brain conflicts, and epoch regressions enter the append-only event ledger.

The private key must be held by an independent secret manager or signing
service. Application hosts receive public verification keys only. A separate
HMAC key ring protects the local event chain and permits controlled rotation.
Historical events remain verifiable when policy thresholds change; current
health is recalculated from the latest signed provider facts under the active
policy instead of rewriting history. Release validation checks every configured
public and HMAC key—including inactive historical keys—for valid, distinct
material; retain all keys referenced by the append-only event history.

For a self-managed observer bootstrap, generate at least RSA-3072 (or an
approved P-256+ EC key) inside the observer/KMS boundary, export only its public
key, and encode that public PEM into the application key map. Generate the
ledger key independently with at least 32 random bytes and store it as a
`base64:` value. Never paste the observer private key into `.env`, CI variables,
the release directory, application logs, or an admin browser. Provider KMS/HSM
signing is preferred when available because the private key never becomes an
exportable file.

```text
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out observer-private.pem
openssl pkey -in observer-private.pem -pubout -out observer-public.pem
openssl rand -base64 48
```

Run these only in the protected observer environment. Restrict private-key file
permissions immediately and import/delete the file according to the KMS and
secret-manager procedure; none of these commands belong on an application host.

## Failover rules

- A writer change is accepted only with a strictly newer topology epoch.
- The signed payload must name the previous writer, prove it is fenced, prove
  the promoted writer is caught up, and report zero lost bytes.
- Two writers in one epoch become an immediate durable split-brain incident.
- A lower epoch can never replace a newer state and becomes an outage event.
- Delayed observations never regress the current state.
- Recovery from a fencing conflict requires a newer, healthy provider epoch.

## Release and monitoring gates

For the first release that creates the replication control-plane tables, place
one fresh, already-signed topology envelope at the protected path configured by
`DB_REPLICATION_BOOTSTRAP_ATTESTATION_FILE`. The pre-migration gate verifies it
without writing; immediately after migration, activation imports it only if all
three tables exist, the single chain head is pristine, and both state and event
history are empty. A partial schema or an initialized schema with missing state
fails closed and can never enter bootstrap mode.

After the first successful activation, remove the bootstrap envelope. Routine
releases use the signed current state and complete ledger; the configured path
is not read when state exists.

Before migrations and again after activation, run:

```text
bash deploy/scripts/verify-database-replication.sh /srv/ubsc/current
```

The gate verifies the complete event chain and requires fresh operational
topology evidence. Admin monitoring is intentionally read-only; there is no
one-click promote, failback, or fencing action in the application.

## Provider acceptance test

Before routing production traffic and at least quarterly in an isolated staging
twin, prove all of the following:

1. stop the active writer through the provider-approved drill;
2. observe automatic promotion within the declared RTO;
3. confirm the old writer is fenced before accepting traffic;
4. confirm topology epoch increased, GTID continuity, zero lost committed rows,
   and idempotent booking/payment retries;
5. verify the stable writer endpoint converged on every application node;
6. record signed drill/failover evidence and verify the ledger;
7. perform failback only under a separate approved change after replication is
   fully caught up and the new writer is fenced.

Replication improves availability; it does not replace PITR or immutable
backups. Logical corruption can replicate instantly, so disaster recovery
remains an independent mandatory control.
