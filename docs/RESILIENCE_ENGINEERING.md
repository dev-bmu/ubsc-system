# Controlled resilience engineering and game days

## Purpose and boundary

High availability is a design claim until failure has been observed safely.
This control plane turns that claim into recurring, signed evidence for five
failure domains: managed load-balancer failover, application-node loss,
queue-worker restart, cache-primary failover, and database-writer failover.

Laravel deliberately contains no production fault-injection endpoint, button,
provider credential, or arbitrary command runner. A separately credentialed
orchestrator runs one bounded scenario at a time against an isolated staging
twin using synthetic traffic only. The application validates the outcome,
stores it in an append-only hash chain, exports a sanitized chain anchor, and
surfaces freshness/failure through monitoring and incident delivery.

This division matters: compromising the admin application cannot directly
terminate infrastructure, while compromising the orchestrator cannot silently
rewrite accepted evidence without both its signing key and the independent
ledger key.

## Required infrastructure outside this repository

Provision all of the following before enabling enforcement:

1. A production-like staging topology with at least two application instances,
   managed database failover, managed Redis failover, queue workers, a managed
   multi-failure-domain load balancer with automatic failover, and the same
   release topology as production.
2. A protected orchestrator identity with staging-only, least-privilege provider
   permissions and no production target in its policy.
3. Manual approval in the deployment/provider control plane and a durable
   change reference for each campaign.
4. A provider kill switch plus automated aborts for healthy-instance floor,
   p95 latency, error rate, and maximum duration.
5. An RSA 2048+ or ECDSA P-256+ signing key whose private half stays in KMS/HSM
   or the orchestrator secret manager. Laravel receives only its PEM public key.
6. An independent random 32+ byte ledger HMAC key in the application secret
   manager. Never reuse `APP_KEY`, database, Redis, webhook, or provider keys.
7. Off-host logs and paging already required by the observability contract.
8. Separate deploy/runtime database roles. The runtime role must not have DDL,
   trigger-management, or direct update/delete privileges on resilience
   evidence; schema changes remain restricted to the deploy role.

Repository configuration validates these declarations; it cannot provision or
truthfully certify the external resources.

## Campaign sequence

1. Confirm the exact staging environment, immutable infrastructure profile,
   release, approval reference, monitoring, paging, synthetic probes, and kill
   switch. The signed campaign must attest approval/change verification,
   orchestrator identity verification, and denied production access.
2. Establish healthy steady state and verify the data-integrity baseline.
3. Inject only one approved fault with blast radius at or below 50%, retaining
   at least the configured number of healthy instances.
4. Abort immediately when a guardrail is crossed. A clean controlled abort is
   degraded evidence; failed integrity/recovery checks remain an outage even
   when an abort also occurred, so data loss can never be downgraded.
5. Restore steady state and verify readiness, alerts, bookings, memberships,
   payments, duplicate-reservation protection, and absence of data loss.
6. Repeat sequentially for the remaining required scenarios.
7. Sign the complete payload externally, import it, verify both signatures and
   the complete chain, then confirm the live contract.

The JSON shape is documented in
`deploy/resilience/evidence.example.json`. Object keys are recursively sorted;
array order is preserved. The detached signature is RSA PKCS#1 v1.5 SHA-256 or
ECDSA SHA-256 over the canonical `payload`, then base64-encoded. The strict
schema intentionally rejects unknown/free-form fields so customer data cannot
be smuggled into the operational ledger. Error rate uses integer basis points (`100` = `1%`) to
avoid cross-language floating-point signature drift.

## Key rotation

`RESILIENCE_EVIDENCE_VERIFYING_KEYS` maps orchestrator key IDs to base64-encoded
PEM public keys. Add the new public key before the orchestrator starts signing
with it. `RESILIENCE_EVIDENCE_ACTIVE_KEY_IDS` is the separate allowlist for new
imports. During rotation, add and activate the new key, move the orchestrator,
then remove the old ID from the active list while retaining its public key for
historical verification. A retained historical key cannot authorize a new
campaign.

`RESILIENCE_LEDGER_SIGNING_KEYS` is a secret-manager HMAC key ring. Add a new
key, change `RESILIENCE_LEDGER_ACTIVE_KEY_ID`, rebuild configuration, and keep
old keys available for historical verification. Removing either historical
key type makes old evidence unverifiable and correctly fails the live gate.

## Storage and retention

Campaign frequency is quarterly, the canonical signed payload is capped at 128
KiB, and the containing JSON envelope is independently capped at 256 KiB, so
this ledger is intentionally retained rather than periodically pruned.
Indexes serve only latest-environment/status lookups; complete-chain scans run
from bounded operational commands, not user requests. The sanitized chain head
is also exported off-host without customer data or media. Database triggers
reject direct evidence update/delete operations, while the cryptographic chain
detects inconsistent rows and head state. A privileged attacker who disables
database guards and rewinds both rows and head requires comparison with the
immutable off-host anchor; that external log retention and review must remain
enabled and is not replaced by the local database.

All ledger timestamps are persisted and reconstructed as UTC independently of
`APP_TIMEZONE`, so a future display-timezone change cannot invalidate historical
hashes or shift campaign freshness.

## Release and recurring verification

Release activation performs static checks, repeats them after optimized config
is built, and requires current live proof before any schema mutation. It repeats
the bounded live check after activation-side operations to detect evidence that
became invalid during the release:

```text
php artisan production:resilience-check --strict
bash deploy/scripts/verify-resilience-drills.sh APP_DIRECTORY
```

The live check fails closed when the campaign is missing, failed, aborted,
overdue, incomplete, signed by an unknown key, modified, truncated, or when the
ledger verification heartbeat is stale. A daily scheduled verifier refreshes
the integrity heartbeat; monitoring opens or resolves the corresponding
incident without exposing evidence signatures or provider internals.

For first rollout, migrate the new schema under the existing isolated migration
lock, import an already approved staging campaign, and only then enable the full
release gate. `activate-release.sh` remains the release-level activation gate.
The provider-neutral `deploy/scripts/atomic-node-rollout.sh` surrounds it with
bounded locking, provider drain/undrain, an atomic release pointer, exact local
release acceptance, and application rollback. A managed deployment platform
may implement the same contract natively. Do not bypass a failed gate by
inventing evidence.

## Failure response

- **Scenario failed:** keep production unchanged, page operations, preserve the
  signed failed campaign, correct the failure, and run a new campaign.
- **Scenario aborted:** inspect the breached guardrail and capacity envelope;
  an abort remains degraded until a complete passing campaign replaces it.
- **Signature failed:** reject the artifact, inspect orchestrator/KMS audit logs,
  rotate the source key if compromise is suspected, and never edit the ledger.
- **Ledger failed:** stop evidence ingestion, preserve database/off-host logs,
  investigate tampering or key loss, and follow break-glass recovery. Do not
  delete or manually rewrite chain rows.
- **Campaign overdue:** production traffic may continue, but release acceptance
  remains blocked until current resilience proof exists.

No software can promise that every future provider failure is impossible. This
system instead makes unsafe execution difficult, missing proof visible, failed
recovery actionable, and false green status cryptographically harder.
