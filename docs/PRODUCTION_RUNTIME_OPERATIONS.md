# Production runtime operations

This runbook activates process supervision, managed-service HA contracts,
independent availability monitoring, capacity testing, and worker-capacity
control. Repository code cannot provision a hosting account, availability
zones, load balancer, managed database/Redis service, DNS, or paging
destination; those external resources must exist before their switches are
enabled.

## 1. Multi-node production contract and stateless runtime

`deploy/production.env.example` is the non-secret production overlay. Supply
all credentials through the hosting secret manager, then run:

```text
php artisan production:check --strict
php artisan production:check --strict --probe
php artisan production:deployment-check --strict
php artisan production:ha-check --strict
php artisan production:ha-check --strict --probe
php artisan production:replication-check --strict
php artisan production:replication-check --strict --live
php artisan production:recovery-check --strict
php artisan production:observability-check --strict
php artisan production:process-check --strict
```

The static commands validate topology and resolved configuration without
touching business data. Their `--probe` variants perform bounded, repeatable
dependency checks; cache and lock probes create only short-lived random keys.
Release activation clears any stale config cache, validates fresh configuration,
builds the exact optimized cache that will serve traffic, validates it again,
and probes dependencies before migration. A release with the wrong environment,
disabled enforcement, placeholder identity, or stale settings fails closed.

Atomic node cutover, provider drain/undrain adapters, private-origin Nginx,
schema compatibility, edge verification, and fleet acceptance are specified in
`docs/PRODUCTION_DEPLOYMENT_AND_EDGE.md`. The application release is not the
traffic switch: every node must be drained, activated, locally accepted, and
returned before the final fleet gate is allowed to pass.

The production contract requires at least two application instances and keeps
sessions, cache, queues, maintenance state, uploads, identity documents,
gallery originals/staging, and invoices outside an individual web node.
Application builds, temporary files, and locally shipped logs may remain
node-local because they are disposable; durable logs must still be exported
off-host. A replacement node must be able to serve a user without copying any
runtime state from the failed node.

`/up` is liveness: it proves the PHP/Laravel process can answer and must not
depend on database, cache, queues, or object storage. `/health/ready` is
readiness: the database endpoint must be reachable **and writable**, while a
shared-session, shared-cache, or distributed-coordination failure also returns
503 so only that node is removed from the load balancer. Required checks use one
attempt, fail fast after the first outage, and respect a bounded request budget.
Queue and object-storage checks run as
deep deployment probes rather than on every load-balancer poll, avoiding extra
latency, object-store cost, and a self-created cascading failure. Their failure
does not eject an otherwise healthy web node at runtime, but the strict release
gate rejects a degraded new release. Readiness exposes no hosts, credentials,
exception text, or driver details and must be rate-limited at the edge rather
than through the cache dependency it is testing.

The cache readiness check performs a short-lived write/read/delete round trip;
the coordination check acquires and releases a unique short-lived lock.
The optional object-storage check is read-only and requires the exact sentinel
configured by `MONITORING_READINESS_STORAGE_SENTINEL` to already exist. Create
that harmless object through infrastructure provisioning before enabling the
`storage` advisory check; do not grant the public health route broader bucket
permissions than the application already needs.

Booking checkout and membership registration accept a UUID in either the
`Idempotency-Key` header or the existing `idempotency_key` form field. If both
are supplied they must match. Mock-only payment routes retain their existing
form-key validation so their production `404` guard always executes first. The
server preserves domain-level unique constraints, fingerprints, row locks, and
transactions, so a client timeout may safely repeat the same request but must
never reuse the key for different data. Dependency retries are bounded and
allowed only for explicitly repeatable probes; business writes are never
blindly retried outside their transaction/idempotency boundary.

Database and Redis connection timeouts are deliberately short. A dead node is
removed quickly instead of accumulating stuck PHP workers, while transaction
deadlock retries remain bounded by `DB_TRANSACTION_ATTEMPTS`. Timeout values
must be calibrated against production telemetry, never disabled to hide a slow
dependency.

### 1A. Managed database Multi-AZ and automatic failover

Provision one managed MariaDB/MySQL writer topology across at least two
availability zones. Laravel must receive the provider's stable **writer**
cluster/proxy DNS endpoint, not an instance IP and not a read-replica endpoint.
Enable automatic promotion/failover in the provider control plane, mount its CA
bundle outside the release, and set every `DB_*` HA declaration from
`deploy/production.env.example`. Do not add a global Laravel `read` split to
the transactional connection: asynchronous replica lag can make booking and
availability decisions stale.

The stricter single-writer topology, quorum/fencing, signed-observation, lag,
failover/failback, and replica-read policy lives in
`docs/DATABASE_REPLICATION_OPERATIONS.md`. Release activation requires a fresh
operational replication proof before any schema mutation.

`production:ha-check --probe` executes only a role/readiness query; it never
inserts, updates, or deletes customer data. During a writer promotion, an
in-flight transaction is expected to fail and roll back. The stable endpoint
then resolves to the promoted writer, readiness recovers, and the client may
repeat the domain command only with the same idempotency key. The application
does not blindly replay writes whose commit outcome may be ambiguous.

`DB_FAILOVER_RTO_SECONDS` is an objective, not proof. Before launch and at
least quarterly, run a provider-approved staging failover and record detection,
promotion, DNS reconnection, readiness recovery, booking integrity, and absence
of duplicate reservations. Acceptance requires recovery within the declared
target without manually editing application configuration.

### 1B. Two application nodes behind a load balancer

Run at least two identical releases in separate failure domains. Give every
node a unique, non-secret `PRODUCTION_INSTANCE_ID`; readiness publishes only a
16-character SHA-256 prefix so distribution can be proven without exposing a
hostname. `APP_RELEASE` is also exposed only as a 16-character digest so the
acceptance script can reject mixed releases. Check `/health/ready`, reserve `/up`
for process liveness, disable
sticky sessions, and drain connections before terminating a node. Set
`TRUSTED_PROXIES` only to the actual balancer private IPs or bounded CIDRs. The
edge must replace client-supplied `X-Forwarded-For` with its transport source;
appending an untrusted chain is forbidden because it poisons rate limits and
audit attribution. Rate-limit readiness at the edge without cache/session state.

Prefer a managed regional load balancer. The file
`deploy/load-balancer/haproxy.cfg.example` is a self-managed fallback/reference
with round-robin routing, readiness thresholds, slow start, and no affinity.
That file is an emergency/staging reference, not the strict production edge:
one HAProxy process is a single point of failure. Production requires a managed
HA load balancer spanning at least two failure domains with automatic failover
(`LOAD_BALANCER_MANAGED_SERVICE`, `LOAD_BALANCER_HA_ENABLED`, and
`LOAD_BALANCER_AUTOMATIC_FAILOVER` must be true).
After both nodes are registered, run from an authorized network:

```text
bash deploy/scripts/verify-load-balancer.sh \
  https://ubsportcenter.co.id 2 "$APP_RELEASE" 24
```

This read-only check requires two distinct healthy opaque node identities and
requires every sample to match the digest of the exact immutable release being
accepted; multiple nodes consistently serving the previous release still fail. If
a managed algorithm intentionally pins sequential requests, use temporary
round-robin acceptance mode or verify each target through its private health
interface; never weaken the application contract to satisfy sampling.

The exact provisioned/ready count is taken from the fresh signed provider
inventory. Public sampling is a separate routing sanity check: it requires all
nodes for small fleets and a bounded square-root diversity sample for larger
autoscaled fleets, avoiding an impossible requirement to enumerate hundreds of
nodes probabilistically. Omit the final sample argument to select the safe
fleet-sized default, or provide a value that satisfies the verifier's printed
minimum.

After every node has completed its per-node activation, run the consolidated
post-rollout gate from a supervised application node:

```text
PRODUCTION_READINESS_OPERATION_ID="$(uuidgen)" \
  bash deploy/scripts/verify-production-readiness.sh \
  /srv/ubsc/current https://ubsportcenter.co.id 2 "$APP_RELEASE" 24
```

The expected-node argument must equal the current provisioned and ready
application-node count reported by the fresh signed provider inventory, not
merely the minimum number desired. The gate is read-only apart from bounded
health sentinels, a signed alert canary, and monitoring snapshots. It proves
load-balancer distribution onto distinct nodes serving one release, then
requires live replication/fencing, recovery, Redis/queue, shared storage,
process, capacity, resilience, and independently ingested external-uptime
evidence. Run it only after the rolling deployment converges; running it during
a mixed-release window is expected to fail.

`PRODUCTION_READINESS_OPERATION_ID` is mandatory and must be a newly generated
UUIDv4 for each gate execution; reusing a previous value is rejected once its
short idempotent retry window closes. The same identifier is carried by both
the structured-log and signed-webhook canaries. Provider-side log automation
must find that exact retained event and return a release-bound cryptographic
receipt; the gate never treats a local log write or manual console search as
proof of off-host ingestion.

### 1C. Managed Redis HA for session, cache, traffic limits, queue, and coordination

Provision five independent managed replicated primary endpoints: session,
cache, traffic limits, queue, and coordination. Each needs TLS, authentication, automatic promotion, at least
one replica in another failure domain, bounded client timeouts, and provider
monitoring. Use database `0` because physical endpoints provide isolation.
Configure `noeviction` for session, queue, and coordination; use `allkeys-lru`
or `allkeys-lfu` for cache, prefer `allkeys-lfu` for the isolated traffic-limit
endpoint, and use provider-managed durable queue persistence. Cache
pressure or a cache flush must never terminate sessions, discard queued work,
or invalidate cross-node locks. `REDIS_QUEUE_READ_TIMEOUT_SECONDS` must remain
strictly greater than `REDIS_QUEUE_BLOCK_FOR` so an idle blocking pop does not
create reconnect churn. Shared maintenance mode also uses the coordination
store so an evicted cache key cannot accidentally return a node to traffic.

The live HA probe sends `PING` separately to all five endpoints and never
reads keys or user data. A passing probe proves reachability only. Cross-zone
placement, replica health, failover settings, memory policy, persistence,
backup, and promotion time still require provider evidence and a failover
drill. Critical booking/payment state remains authoritative in the database;
existing recovery jobs reconcile interrupted asynchronous work after Redis
recovers.

### 1D. PITR, immutable backup, and off-host observability

Managed failover preserves availability when infrastructure fails; it does not
undo logical deletion, corruption, or ransomware. Production therefore also
requires continuous provider PITR, a database-only encrypted immutable copy in
an independent account, a cross-region copy, and recurring isolated restore
drills. The application stores signed append-only evidence and exports each
chain head through the structured off-host log path. It never pretends that an
environment declaration enabled a provider feature.

Provision the provider controls, protected recovery verifier, log drain with
provider-side signed-receipt automation, external synthetic monitor, APM,
centralized security-event stream, and signed incident webhook before setting
their declarations true. Supply the recovery evidence key ring and alert HMAC
secret from the hosting secret manager. Then bootstrap PITR, backup, restore,
and alert-dispatcher observations according to
`docs/DISASTER_RECOVERY_AND_OBSERVABILITY.md`.

Static and live recovery validation run before schema changes. After migrations,
release activation re-verifies the complete evidence chain, primes alert delivery,
collects a fresh snapshot, drains newly opened incidents, and runs:

```text
bash deploy/scripts/verify-database-recovery.sh APP_DIRECTORY
bash deploy/scripts/verify-recovery-observability.sh APP_DIRECTORY --require-log-receipt
```

The verifiers are time-bounded and fail closed when PITR is stale, the immutable
backup is stale/expired, the restore drill is overdue or failed, evidence was
tampered with, the exact release canary lacks a provider-signed log receipt, or
the incident-delivery control plane is unhealthy. Provider availability SLO
evidence remains off-host because an unavailable application cannot truthfully
receive its own failed probes.
The independently signed payload contract, first-production bootstrap, key
rotation, and break-glass sequence are in `deploy/recovery/README.md`.

## 2. Production process supervision

Choose exactly one queue mode:

- `deploy/supervisor/ubsc-database.conf.example` is the safe initial baseline.
- `deploy/supervisor/ubsc-redis.conf.example` is used only after the Redis
  cutover procedure below has completed.

Replace `APP_DIRECTORY` and `RUN_AS_USER`, copy the selected file to
`/etc/supervisor/conf.d/ubsc.conf`, set
`PROCESS_SUPERVISOR_CONFIG_PATH=/etc/supervisor/conf.d/ubsc.conf`, and set
`PROCESS_SUPERVISION_MAX_CLOCK_SKEW_SECONDS=30`. Keep every node synchronized
with a production NTP service; a future-dated heartbeat outside that tolerance
is rejected rather than being mistaken for fresh evidence.

Supervisor restarts PHP children, but it cannot restart its own daemon. Copy
`deploy/systemd/supervisor-ubsc-recovery.conf.example` as a drop-in under the
actual `supervisor.service` or `supervisord.service` unit, then run:

```text
sudo systemctl daemon-reload
sudo systemctl enable --now supervisor.service
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status ubsc:*
```

Use `supervisord.service` in the command when that is the unit name installed
by the Linux distribution. The host verifier fails if the unit is disabled,
inactive, or lacks a failure-recovery `Restart` policy. Do not add a second
Supervisor unit for the same process tree.

Install the same selected artifact on **every** application/worker node. Each
node runs one supervised scheduler. Every scheduled task uses a shared
`onOneServer` election lock and a bounded overlap lock, so one healthy node
executes it while another node can take over after a host failure without
normally duplicating the task.

Every listed process must be `RUNNING`. Critical reconciliation, documents,
notifications, maintenance, media maintenance, default, image, and video each
have their own worker program. This bulkhead prevents a slow external mailer,
large PDF batch, or media spike from consuming payment-recovery capacity. The
configuration rotates logs, restarts crashed processes, starts after host
reboot, recycles workers after bounded time/jobs, terminates complete process
groups, and keeps every worker timeout below its queue visibility lease. The
contract also compares each lane with its largest configured job timeout; for
example, increasing the invoice timeout beyond the documents worker budget
blocks deployment until the worker, shutdown allowance, lock, and queue lease
are redesigned together.

The release gate reads the **active** Supervisor file and refuses placeholders,
pooled queues, missing programs, root execution, disabled auto-restart,
unbounded logs, unsafe process counts, and lease/timeout drift:

```text
php artisan production:process-check --strict
```

After Supervisor has been reloaded, the host-level verifier checks the daemon,
systemd boot and daemon-crash recovery, every required `RUNNING` process,
queue connectivity, and fresh scheduler/worker dead-man heartbeats. Queue
heartbeats must include bounded dispatch-to-execution latency, so a very old
probe draining after an outage cannot falsely certify a backed-up lane:

```text
bash deploy/scripts/verify-process-supervision.sh APP_DIRECTORY
```

The verifier waits for fresh heartbeats for at most three minutes by default.
Every dependency command also has a 20-second hard boundary, configurable from
the deployment shell with `PROCESS_SUPERVISION_COMMAND_TIMEOUT_SECONDS` (5 to
60 seconds), so a hung control socket cannot hang a release indefinitely.
It never changes booking, membership, payment, or customer data. A crashed PHP
worker or scheduler is restarted automatically by Supervisor; loss of an
entire node is handled by the other node plus distributed scheduler election.
Loss of every node or a managed dependency still requires load-balancer,
provider failover, alerting, and the disaster-recovery procedures rather than
being concealed as a healthy state.

For each release, run `bash deploy/scripts/activate-release.sh APP_DIRECTORY`. It
rebuilds and revalidates config before any database mutation, uses an isolated
migration lock on the dedicated coordination endpoint, validates queue leases,
performs read-only backend probes, checks private invoice storage, refreshes
monitoring, loads the validated artifact into the running Supervisor daemon,
restarts the long-lived scheduler onto the activated release, and sends a
graceful queue restart signal. It fails if the deploy account cannot control
Supervisor; grant narrowly scoped socket/sudo permission rather than running
PHP workers as root. Never run `queue:restart` without a process manager
capable of bringing the workers back.
Every activation command is additionally bounded by GNU `timeout`; configure
`ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS` between 60 and 3600 seconds for the
largest reviewed migration. Timeout or forced termination stops the release—it
never skips ahead or claims success after a hung provider/database operation.

## 3. Independent availability monitoring

`.github/workflows/external-availability.yml` runs outside the application
every five minutes only after the repository variable
`UBSC_EXTERNAL_MONITORING_ENABLED` is set to `true`. It checks `/up`,
`/health/ready`, and `/`; retries transient failures; stores bounded evidence;
opens only one GitHub incident during an outage; and closes it after recovery.

Repository configuration:

1. Enable GitHub Actions, scheduled workflows, and repository issues on the
   default branch.
2. Set repository variable `UBSC_PRODUCTION_URL` to the production HTTPS origin.
3. Optionally set secrets `UBSC_UPTIME_ALERT_WEBHOOK_URL` and
   `UBSC_UPTIME_ALERT_WEBHOOK_TOKEN` for an off-site pager/webhook.
4. Run the workflow manually once and confirm all three checks pass.
5. Set repository variable `UBSC_EXTERNAL_MONITORING_ENABLED=true` to activate
   the five-minute schedule.
6. Only then set the production application values:

```text
EXTERNAL_MONITORING_ENABLED=true
EXTERNAL_MONITORING_PROVIDER=github-actions
EXTERNAL_MONITORING_URL=https://ubsportcenter.co.id/health/ready
EXTERNAL_MONITORING_INTERVAL_SECONDS=300
```

The internal dashboard intentionally reports external availability as
`Unknown`: a server cannot truthfully certify the independent observer that is
watching it. Incident state and paging remain off-host, while the dashboard
reports whether that independent contract is configured.

## 4. Authorized load testing and capacity calibration

Use `.github/workflows/capacity-test.yml`; never point an ad-hoc local loop at
production. Protect its `capacity-testing` GitHub environment with required
reviewers and protected-branch deployment rules. Require CODEOWNERS review for
the workflow plus `tests/Load` and `scripts/*capacity*`; otherwise a modified
repository script could misuse a CI signing secret. Prefer short-lived OIDC to
an external KMS signer when the hosting platform supports it. Set
`LOAD_TEST_ALLOWED_ORIGINS` to an exact comma-separated origin
allow-list, and set `CAPACITY_TARGET_ENVIRONMENT`,
`CAPACITY_INFRASTRUCTURE_PROFILE`, and
`CAPACITY_EVIDENCE_EXPECTED_INSTANCES` as protected environment variables.
The instance count must be the immutable ready-instance count encoded by that
profile. The workflow
requires `I_HAVE_AUTHORIZATION`, refuses
redirects, allows only approved HTTPS origins and read-only public routes,
applies strict latency/error/dropped-iteration thresholds, and retains
artifacts for 30 days.

Run profiles in order:

1. `smoke` validates the script and target.
2. `baseline` establishes normal behavior at a small fixed arrival rate.
3. `capacity` ramps to an approved target and holds it long enough to expose
   saturation.

The current suite proves only the `public_read` scope. A successful capacity
run must sustain the approved target during a dedicated five-minute hold,
then emits `PERFORMANCE_PUBLIC_READ_TESTED_RPS`. It must never populate
`PERFORMANCE_TESTED_RPS`, because global capacity requires a separate staging
test with a representative mix of reads, authentication, bookings, payments,
membership operations, queues, and database contention. The evidence also
publishes an operating ceiling at 75% of the proven public-read rate by default.

After updating a tested value, clear/rebuild configuration and verify the
Performance dashboard. Do not copy localhost results into production settings.

## 5. Managed Redis cutover

Redis remains optional for local development, but the HA production contract
requires it before a node receives production traffic. Provision managed,
redundant services with TLS, authentication, automatic failover, monitoring,
and provider persistence, reachable from every application node.

Representative production values:

```text
QUEUE_CONNECTION=redis
BACKGROUND_JOB_CONNECTION=redis
BACKGROUND_MEDIA_CONNECTION=redis-long
INVOICE_PDF_QUEUE_CONNECTION=
MONITORING_QUEUE_CONNECTION=redis
MONITORING_QUEUE_NAME=default
REDIS_QUEUE_CONNECTION=queue
REDIS_SESSION_URL=rediss://USER:PASSWORD@SESSION_HOST:PORT/0
REDIS_QUEUE_URL=rediss://USER:PASSWORD@QUEUE_HOST:PORT/0
REDIS_CACHE_URL=rediss://USER:PASSWORD@CACHE_HOST:PORT/0
REDIS_SESSION_DB=0
REDIS_QUEUE_DB=0
REDIS_CACHE_DB=0
PERFORMANCE_METRICS_DRIVER=redis
PERFORMANCE_METRICS_REDIS_CONNECTION=cache
```

Do not switch drivers while database jobs remain queued. For the first cutover:

1. Verify Redis connectivity in a staging environment.
2. Announce a maintenance window and stop the scheduler from dispatching jobs.
3. Put the application in maintenance mode.
4. Let database workers finish, then run both database connections with
   `--stop-when-empty` and confirm every monitored lane has depth zero.
5. Change environment values and rebuild configuration.
6. Install the Redis Supervisor configuration.
7. Run `php artisan background-jobs:doctor --probe-backends`.
8. Start all workers, confirm fresh queue heartbeats, then leave maintenance.

Changing only the environment does not migrate jobs already stored in the
database. Skipping the drain step strands work in the old backend.

## 6. Worker capacity and autoscaling

The monitoring dashboard displays `recommended / minimum-maximum` for each
queue lane. This legacy command is deliberately advisory only:

```text
php artisan background-jobs:capacity-plan --json
```

Recommendations use measured jobs/minute, P95 runtime, backlog, 70% target
utilization, 30% headroom, and a five-minute catch-up objective. Collecting,
unknown, or capped samples are never eligible for automatic scaling. Critical
workers retain a minimum of two; CPU-heavy media lanes have deliberately small
maximums to protect the web tier and database. A `capacity_limited` result and
degraded queue status mean measured demand exceeds that safety ceiling; do not
raise the maximum until database, CPU, memory, and downstream limits are
verified together.

Supervisor provides automatic restart but not elastic process counts. The
authoritative control path is now `capacity:plan`: it requires signed
release/profile-bound load evidence, a complete signed platform observation,
global database guardrails, target-local readiness, bounded steps, cooldown, and
multi-observation scale-down stabilization. Each target is bound to a hashed
provider state/version token, and signed CPU/memory pressure participates in
sizing. The plan expires no later than its earliest source observation or load
evidence, and the live gate
requires multiple properly spaced observer cycles, so a one-shot/manual snapshot
cannot impersonate a running adapter. It emits a short-lived signed plan;
the application itself has no provider mutation credentials.
Evidence/observation ingestion and planning share one distributed control
lease, so a source cannot be replaced halfway through an anti-flap state
transition. The external verifier independently enforces the exact target
bounds and maximum scale steps from deployment/IaC before provider CAS.

Keep `CAPACITY_AUTOSCALING_MODE=advisory` and
`BACKGROUND_WORKER_AUTOMATION_ENABLED=false` during staging integration. Once
the hosting adapter exists, place that adapter in no-write/dry-run mode, switch
the production candidate to `signed_plan`, and run
`php artisan production:capacity-check --strict --live`. Enable provider writes
only after the signed desired counts match observed replica state. Unknown,
stale, capped, replayed, mismatched, or tampered inputs always hold current
capacity.

## 7. Release acceptance gate

Before routing production traffic, all of these must pass:

```text
php artisan production:check --strict --probe
php artisan production:ha-check --strict --probe
php artisan production:replication-check --strict --live
php artisan production:recovery-check --strict --live
php artisan production:observability-check --strict --live
php artisan recovery:evidence-verify --record-heartbeat
php artisan replication:ledger-verify --record-heartbeat
php artisan production:process-check --strict --live
php artisan production:capacity-check --strict --live
php artisan production:resilience-check --strict --live
php artisan resilience:evidence:verify --record-heartbeat
php artisan migrate:status
php artisan background-jobs:doctor --probe-backends
php artisan invoices:pdf:doctor --probe-storage
php artisan schedule:list
php artisan monitoring:collect --quiet
php artisan background-jobs:capacity-plan
php artisan capacity:plan --fail-on-blocked
```

After every application node has activated, run the single post-rollout
orchestrator instead of manually omitting one of the live verifiers:

```text
PRODUCTION_READINESS_OPERATION_ID="$(uuidgen)" \
  bash deploy/scripts/verify-production-readiness.sh \
  APP_DIRECTORY https://ubsportcenter.co.id EXPECTED_NODES "$APP_RELEASE" 24
```

Also confirm both required GitHub checks—`Required application quality` and
`Required multi-process concurrency (MariaDB/InnoDB)`—are green and enforced by
strict, up-to-date branch protection with independent CODEOWNERS review, stale
approval dismissal, resolved review threads, and deletion/force-push guards.
`/up` and `/health/ready` must return 200
without internal details, every expected node must be observed on one release,
queue and process heartbeats must be fresh, and no critical monitoring incident
may remain open. Static flags are not a substitute for provider evidence, a
successful restore drill, or an observed failover campaign.

## 8. Controlled resilience game days

The final production control does not inject faults from Laravel. A separately
credentialed, staging-only orchestrator runs managed load-balancer failover,
application-node loss, queue-worker restart, cache-primary failover, and
database-writer failover sequentially under manual approval, synthetic traffic,
an armed kill switch, bounded blast radius, and automatic abort thresholds. Its
RSA/ECDSA-signed result is ingested into an independently signed append-only
ledger.

Run a complete campaign before launch and at least every 90 days. Failed,
aborted, stale, incomplete, replayed, or modified evidence blocks release
acceptance and appears in the monitoring incident pipeline; it never triggers
an infrastructure mutation from the admin application. Provisioning, campaign
procedure, key rotation, first rollout, and failure response are specified in
`docs/RESILIENCE_ENGINEERING.md`.
