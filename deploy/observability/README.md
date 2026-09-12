# Off-host log-ingestion receipt contract

This adapter closes the gap between "Laravel wrote a JSON line" and "the
independent log platform retained that exact line". Production release
acceptance fails closed unless the provider returns a fresh cryptographic
receipt for the exact canary operation ID and current release.

## Trust boundary

- Laravel/application nodes hold public verification keys only.
- The provider adapter and private key run outside the application, database,
  queue, and primary hosting failure domains.
- The adapter may sign only after the exact canary is queryable in retained
  provider storage. A transport acknowledgement is insufficient.
- Give the adapter permission to query the narrow canary stream and invoke the
  receipt endpoint; do not give it database, deployment, or admin credentials.
- Keep provider audit logs and restrict private-key use through KMS/HSM policy
  when the platform supports it.

## Provider algorithm

1. Match `event=observability.canary` and the exact `operation_id` emitted by
   the post-rollout gate.
2. Confirm the event belongs to the configured production application and
   current release; reject ambiguous or duplicate source matches.
3. Serialize the exact retained source event canonically according to the log
   platform adapter and calculate SHA-256. The resulting hexadecimal digest is
   `source_event_sha256`.
4. Invoke `scripts/publish-log-ingestion-receipt.mjs` with the operation ID,
   source hash, provider private-key path, active key ID, and a unique durable
   outbox path. Supply provider, environment, release, retention, and the
   credential-free HTTPS origin through its documented environment variables.
   The helper uses exclusive creation, flushes the completed envelope to the
   filesystem, and refuses to overwrite evidence. Place the outbox on durable
   provider storage and use the operation ID in each filename.
5. Deliver that file with `scripts/post-log-ingestion-receipt.mjs`. It performs
   bounded retries using the exact same bytes. Treat HTTP 200/202 with
   `{accepted:true, duplicate:boolean}` as success; HTTP 200 with
   `duplicate:true` safely resolves the case where the first acknowledgement
   was lost.
6. Move the acknowledged file to a retained provider-side sent/archive path.
   On process or network failure, replay the existing outbox file—never
   regenerate a different receipt for an already-used operation ID.

The endpoint is `POST /monitoring/log-receipts`, accepts JSON only, and is
application-rate-limited. Configure an independent edge/WAF body limit of 32
KiB (or the exact lower configured application limit), TLS 1.2+, no caching,
request timeouts, and a provider-source allow-list where stable egress ranges
exist. Signature verification remains mandatory even with an IP allow-list.
The application also enforces per-IP minute/hour and global minute limits and
rejects declared oversized bodies before signature verification. Rate-limit
state must use the production shared cache, not node-local memory.

## First rollout

1. Generate RSA-3072 or P-256 in the provider KMS/HSM; export only the public
   key. RSA-2048 is the enforced minimum, not the preferred new-key size.
2. Configure the public key under a unique ID in
   `OBSERVABILITY_LOG_RECEIPT_VERIFYING_KEYS` and add that ID to
   `OBSERVABILITY_LOG_RECEIPT_ACTIVE_KEY_IDS`.
3. Set the receipt provider exactly equal to
   `OBSERVABILITY_LOG_EXPORT_PROVIDER`, then enable receipts and rebuild the
   Laravel configuration cache.
4. Deploy while traffic is still protected, emit a controlled canary, and
   confirm the provider adapter can return its receipt.
5. Run the complete post-rollout readiness orchestrator. Do not add a bypass if
   the first receipt fails; repair provider matching, signing, routing, or
   release identity and retry with a new UUIDv4 operation ID.

## Zero-downtime key rotation

1. Create a new provider key and add its public key to the Laravel key ring.
2. Mark both old and new IDs active, rebuild config, and verify a receipt signed
   by the new key.
3. Switch the provider adapter to the new private key.
4. Remove the old ID from the active list so it cannot sign new receipts, but
   retain its public key for historical verification.
5. Remove the old public key only after all evidence it signed is outside the
   required retention and audit period.

Compromise response is different: immediately remove the compromised ID from
the active list, preserve provider/application audit evidence, issue a new key,
and treat every affected receipt as untrusted until independently reconciled.

## Release behavior

`deploy/scripts/verify-production-readiness.sh` emits a canary and waits a
bounded time for `monitoring:logs:await-receipt` with the exact operation ID.
Only afterward does the live observability verifier require a current receipt.
This order avoids certifying a previous release and avoids the pre-cutover
deadlock in which a candidate node is not yet reachable by the log provider.

No application success can prove the provider is available while the whole
application is down. Independent synthetic availability and paging therefore
remain separate mandatory controls.
