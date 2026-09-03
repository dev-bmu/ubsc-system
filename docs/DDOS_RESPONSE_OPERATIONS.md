# DDoS protection and response operations

UBSC treats DDoS resilience as an availability system, not a Laravel feature.
The application rejects abusive work cheaply, but a managed edge must absorb
network and protocol floods before they consume origin bandwidth. No operator
may declare the service protected solely because an environment flag is true.

## Required production topology

1. Public DNS points only to one managed CDN/WAF/DDoS edge.
2. The edge provides always-on L3/L4 and L7 mitigation, global scrubbing,
   managed WAF rules, adaptive rate limiting, bot controls, and an emergency
   challenge mode.
3. The managed load balancer accepts traffic only from provider-maintained
   edge CIDRs. The origin accepts traffic only from load-balancer CIDRs.
4. The origin addresses are absent from public DNS, old records, mail headers,
   analytics, source maps, and public documentation.
5. The edge deletes caller-supplied client-IP headers and writes exactly one
   `X-Verified-Client-IP`. HAProxy validates it and replaces
   `X-Forwarded-For`; Laravel trusts only the explicit load-balancer CIDRs.
6. Static fingerprinted assets are cached at the edge. Personalized HTML,
   authentication, checkout, payment, admin, and signed callbacks are never
   shared-cache responses.
7. Traffic-limit keys use their own managed Redis endpoint with replication,
   automatic failover, TLS, authentication, bounded memory, and an allkeys-LFU
   eviction policy. LFU preferentially retains frequently-hit abusive keys;
   this endpoint is never shared with sessions, queues, or locks.

Do not operate Hostinger CDN and Cloudflare proxying in series. Select one
authoritative public edge and make its origin path explicit.

## Edge policy classes

- **Static assets:** aggressive cache, integrity-safe immutable fingerprints,
  high request ceiling, hotlink controls only when they do not break clients.
- **Public HTML/read APIs:** adaptive per-IP and network limits, verified bot
  allowances, cache only explicitly public data, never cache CSP nonces.
- **Availability and slot discovery:** short edge cache only when business
  semantics permit it; otherwise shield with request coalescing and limits.
- **Login, registration, recovery, and MFA:** strict burst and sustained
  limits, reputation and bot signals, enumeration-safe responses.
- **Checkout, booking, membership, and payment:** authenticated limits,
  idempotency, no challenge after the user begins payment, and explicit
  allowlisted provider callback rules that still require signatures.
- **Admin and uploads:** challenge before authentication, country/network
  restrictions where operationally valid, small resumable chunks, and hard
  body/rate ceilings. Never exempt the entire admin prefix from WAF controls.
- **Monitoring ingestion:** exact methods, small body limits, cryptographic
  authentication, replay protection, and provider source restrictions where
  stable addresses exist.

## Release acceptance

Every production release must pass:

```bash
php artisan production:ddos-check --strict
bash deploy/scripts/verify-ddos-protection.sh /srv/ubsc/current https://ubsportcenter.co.id
```

The root-owned provider hook calls the real provider API with workload
identity or a secret-manager credential. It emits only the allowlisted
`ubsc.ddos-provider-evidence.v2` JSON fields. It must not print API tokens,
account emails, origin addresses, firewall expressions, or credentials.
The release verifier reads its non-secret provider, hook, canonical origin,
provider-zone fingerprint, marker-header, and timeout values from Laravel's
already-validated cached configuration; shell operators do not need to source
`.env`, and conflicting shell values cannot silently select another provider.

The adapter runs with read-only provider permissions, is owned by root, is not
group/world-writable, and should normally be mode `0750`. Its fixed
`/usr/local/libexec` parent must also be root-owned and not writable by group
or other users, preventing adapter replacement between validation and launch.
Its exact stdout is:

```json
{
  "schema": "ubsc.ddos-provider-evidence.v2",
  "evidence_id": "00000000-0000-4000-8000-000000000000",
  "challenge": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "provider": "the-configured-provider-id",
  "origin": "https://ubsportcenter.co.id",
  "zone_id": "the-provider-zone-id",
  "checked_at": "2026-08-26T12:00:00Z",
  "managed_dns": true,
  "cdn": true,
  "waf": true,
  "ddos": true,
  "automatic_l3_l4": true,
  "automatic_l7": true,
  "adaptive_rate_limiting": true,
  "bot_management": true,
  "origin_restricted": true,
  "security_event_stream": true,
  "attack_alerting": true
}
```

Echo the exact one-time `--challenge` and canonical `--origin` supplied by the
verifier, then generate a new UUIDv4 and timestamp for each observation. Set
`DDOS_PROVIDER_ZONE_FINGERPRINT` to the lowercase SHA-256 of the exact zone/site
identifier returned by the provider API:

```bash
printf '%s' 'exact-provider-zone-id' | sha256sum
```

This binds evidence to the current run, public origin, and production provider
property, preventing replay or an accidental staging-zone verification. The
verifier rejects unknown fields, stale timestamps, false controls, malformed
identities, wrong origin/zone, and secret-bearing field names. Adapter stderr
is deliberately suppressed from release logs; detailed errors belong in the
provider's protected audit sink.

The independent `External DDoS posture` workflow verifies TLS/security state
and proves from outside the hosting network that protected origin addresses do
not establish a public connection on plaintext HTTP, normal HTTPS, or the
private origin TLS port. A redirect, direct `403`, or `421` is a failed proof,
because the attack still reached origin network and TLS resources. Certificate
verification is intentionally ignored only for this negative bypass probe, so
a reachable origin cannot hide behind a mismatched certificate.
`EDGE_ORIGIN_IPS` is a GitHub environment secret and must never appear in logs
or repository files.
Configure `UBSC_PRODUCTION_URL` as a protected environment variable, require
reviewers for the `production-observability` environment, and rotate an origin
address immediately if this external proof ever succeeds.

## Detection and alerting

Stream provider security events off-host and page the operator for:

- autonomous mitigation activation or a material rise in challenged traffic;
- origin request rate, connection count, CPU, memory, PHP workers, Redis
  latency, database connections, or 5xx responses approaching capacity;
- a sudden 429 increase combined with falling successful booking throughput;
- cache-hit ratio collapse, expensive endpoint concentration, or egress/cost
  anomalies;
- any origin-bypass probe success or loss of the provider verification hook.

Do not log every rejected request at the application. Aggregate at the edge;
per-request attack logging can become its own disk and ingestion DoS.

## Incident sequence

1. Confirm the alert through the provider dashboard and independent monitor.
2. Enable the prepared emergency profile; do not invent firewall expressions
   during the attack.
3. Preserve booking, authentication for existing customers, and signed
   payment callbacks. Degrade nonessential gallery, search, analytics, and
   editorial functions first.
4. Escalate to the provider within the contracted response window. Record the
   provider incident ID and immutable release ID outside the affected system.
5. Watch origin saturation and successful business throughput, not only total
   requests. Tighten one policy class at a time to avoid blocking customers.
6. If the origin address is exposed, rotate it or move to a new private origin
   after firewall rules are ready; changing DNS alone is insufficient.
7. After recovery, retain sanitized edge evidence, resolve temporary rules,
   review false positives, and update capacity and runbook assumptions.

## Safe exercises

Run at least quarterly and only with written provider/hosting authorization.
Use the provider's simulation or a bounded staging twin; never launch a public
DDoS from this repository, developer machines, or GitHub Actions. Exercises
must cover volumetric escalation, HTTP floods, slow connections, origin bypass,
bot challenges, payment callback continuity, alert delivery, and rollback of
emergency rules. A passing low-rate capacity test is not DDoS certification.
