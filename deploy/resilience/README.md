# Protected resilience orchestrator contract

The application is the verifier and evidence ledger, not the fault injector.
Deploy the provider adapter in a protected non-production operations account,
give it only staging-scoped mutation permissions, and keep its private signing
key in KMS/HSM or the provider secret manager.

Before each scenario the adapter must prove healthy synthetic steady state,
monitoring and alert delivery, an armed provider kill switch, an active abort
guard, and the configured healthy-instance floor. It must execute all five
required scenarios—including managed load-balancer failover—sequentially, stop
immediately when a latency/error/instance boundary is crossed, restore steady
state, then run booking, membership, payment, duplicate-reservation, and
data-loss integrity checks.

The signed campaign also attests that manual approval and its change reference
were verified, the protected orchestrator identity was verified, and its
production provider access was denied. A false attestation is retained as
outage evidence rather than silently discarded.

Treat `orchestrator.env.example` and `production.env.example` as one versioned
contract. Their target identity, mandatory safety flags, duration, blast
radius, health floor, abort thresholds, required scenarios, and recovery
objectives must move together; the repository test suite rejects drift between
the overlapping controls.

The adapter emits one JSON envelope shaped like `evidence.example.json`. It
recursively sorts object keys, preserves list order, serializes JSON without
escaped slashes or Unicode, signs only `payload` using RSA PKCS#1 v1.5 with
SHA-256 or ECDSA with SHA-256, and base64-encodes the detached signature. The
application receives only the matching public key.

Keep historical public keys configured for old evidence, but authorize new
imports only through `RESILIENCE_EVIDENCE_ACTIVE_KEY_IDS`. Removing an ID from
that allowlist retires it without destroying historical verification.

Error rate is encoded as integer basis points (`100` = `1%`) so signatures are
canonical across runtimes and never depend on floating-point formatting.
Every numeric measurement must be a JSON integer, and every timestamp must be a
real RFC3339 calendar instant with an explicit valid offset.

Import and verify with:

```text
php artisan resilience:evidence:record /secure/path/campaign.json
php artisan resilience:evidence:verify --record-heartbeat
php artisan production:resilience-check --strict --live
```

The protected-branch MariaDB concurrency gate must also remain required. It
races both distinct campaigns and duplicate delivery of one campaign against
real InnoDB row locks, then verifies contiguous sequencing, idempotency, the
chain head, and the complete signed ledger.

Never place a private key, provider credential, customer payload, email, IP,
payment value, booking detail, or free-form operator note in the artifact.
