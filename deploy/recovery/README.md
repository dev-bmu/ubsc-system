# Database recovery deployment contract

This directory is the provider-neutral handoff between UBSC and the protected
recovery infrastructure. Laravel validates and displays evidence; it does not
pretend to enable PITR, create an immutable vault, or restore production.

## Required topology

Production requires all of the following before traffic activation:

1. A managed database writer with continuous PITR and at least 14 days of
   recovery-log retention.
2. A complete relational-database backup at least every 24 hours. The archive
   is encrypted, checksum-verified, opened by the verifier, and retained at
   least 35 days with compliance object lock.
3. Copies in a different account/security boundary and a region distinct from
   the primary database.
4. A protected verifier with read-only provider/archive access. It owns an RSA
   2048+ or P-256+ private key that is never available to Laravel, the web
   hosts, queue workers, scheduler, or database.
5. An isolated restore target with no production route or credentials. A full
   restore drill runs at least every 90 days and proves application invariants.
6. Off-host alert and log destinations. A failure to read evidence is an
   outage, never a green or empty state.

Laravel verifies the complete local evidence chain hourly. Missing verification
must surface as a warning within two hours and an outage within four hours;
the scheduler and off-host alert path therefore need independent supervision.

Bind the exact provider, opaque dataset, primary/recovery regions, backup
destination, and independent verifier through `deploy/production.env.example`.
The release contract intentionally rejects empty values, placeholders, equal
regions, stale evidence, and inactive keys.

## Independent attestation flow

The protected verifier must derive each field from provider APIs and the
archive it actually opened. This includes the provider's latest-restorable-time
PITR observation; do not let the application generate production success
payloads for itself.

1. Copy the relevant payload example to a protected verifier workspace.
2. Replace every example identity, timestamp, measurement, and checksum with
   observed values. Keep all timestamps strict RFC3339 with an explicit offset.
3. Sign on the verifier host:

   ```bash
   node scripts/sign-recovery-attestation.mjs \
     artifacts/recovery.payload.json \
     /run/secrets/recovery-attestation-private.pem \
     verifier-v1 \
     artifacts/recovery.envelope.json
   ```

4. Transfer only the signed envelope to an application operations host and
   import it without printing the payload:

   ```bash
   php artisan recovery:attestation-import \
     --file=artifacts/recovery.envelope.json
   ```

5. Verify the whole local chain and observed posture:

   ```bash
   php artisan recovery:evidence-verify --record-heartbeat
   bash deploy/scripts/verify-database-recovery.sh /srv/ubsc/current
   ```

The importer is idempotent by globally unique operation ID. Retrying the
same canonical payload with the same key returns the existing append, including
ECDSA signatures whose bytes legitimately differ. Reusing an operation ID with
different content or reusing the ID for another evidence type is rejected. The
required real-InnoDB multi-process gate proves that concurrent cross-type reuse
can append only one fact. A
valid `backup_failed` envelope returns a
successful ingestion acknowledgement while keeping recovery status in Outage;
use `--fail-on-unhealthy` only when the calling shell must also fail. Verification
keys form one historical key ring, and release validation checks every
configured key—including inactive keys—for strength and unique material. Active
key IDs control new imports separately. Because the current ledger is
append-only and retains its complete history, keep every public verification
key and local HMAC key referenced by any row; removing either intentionally
makes complete-chain verification fail.

Every failed backup path must emit `backup_failed` immediately. Never wait for
the freshness timer and never convert a failure into a successful heartbeat.
Allowed failure codes are defined by `RecoveryEvidenceLedger::backupFailureCodes()`.

## Initial production bootstrap

Normal release activation requires fresh signed recovery proof *before* schema
mutation. For the first deployment only, use a controlled bootstrap window:

1. Keep public traffic disabled and verify the target is a new installation.
2. Apply the additive recovery migrations with the shared isolated migration
   lock.
3. Configure provider PITR and the immutable vault outside Laravel.
4. Import one independently attested PITR observation, one verified backup,
   and one successful isolated restore-drill attestation.
5. Verify the chain, collect monitoring, deliver the canary, and run the normal
   `activate-release.sh`. Do not add or retain a bypass flag in production.

For an existing installation, provision the additive migration and attested
evidence on the inactive release before activation. A deployment must stop if
the pre-migration recovery gate fails.

## Break-glass production recovery

There is deliberately no restore button in the admin cockpit. A one-click
restore can overwrite healthy data or create split-brain writes.

1. Declare an incident and appoint one incident commander plus an independent
   approver. Preserve logs and evidence.
2. Fence unsafe writers and customer writes. Record the exact incident and
   chosen recovery-point boundaries.
3. Prefer managed failover for node loss. For logical corruption, restore PITR
   or a verified archive into a new isolated target; never in place.
4. Prove schema/migration state, constraints, users and authorization, content,
   bookings, memberships, payments, audit ledger, and application smoke tests.
5. Reconcile accepted writes after the chosen recovery point, then perform a
   controlled cutover. Keep the original database read-only until acceptance,
   reconciliation, and rollback windows close.
6. Collect a fresh monitoring snapshot, verify SLOs and queues, and retain the
   incident timeline and signed evidence for post-incident review.

The provider-specific commands, IAM roles, promotion mechanics, DNS/load
balancer steps, and approval roster belong in the infrastructure team's sealed
runbook. They must be exercised in the isolated environment, not invented
during an incident.
