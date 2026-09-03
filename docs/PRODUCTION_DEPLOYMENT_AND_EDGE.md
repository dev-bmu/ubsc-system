# Production deployment and edge operations

This document is the infrastructure hand-off for a zero-downtime UBSC release.
It complements the application, replication, recovery, observability, capacity,
and resilience contracts already enforced by the repository. Code can reject an
unsafe topology, but it cannot create availability zones, provider accounts,
DNS, WAF rules, certificates, load-balancer targets, managed databases, Redis,
or object-storage buckets without the infrastructure holder provisioning them.

## 1. Required production topology

Production acceptance requires all of the following:

1. managed DNS, CDN, WAF, DDoS protection, and automatically renewed public TLS;
2. a managed regional load balancer spanning at least two failure domains;
3. at least two immutable UBSC application releases on separate hosts/zones;
4. verified TLS from the edge/load balancer to each private origin;
5. a stable managed MariaDB/MySQL writer endpoint with automatic Multi-AZ failover;
6. physically isolated managed Redis endpoints for sessions, cache, queues, and
   coordination, each with replication and automatic promotion;
7. shared S3-compatible storage for every durable file class;
8. PITR, encrypted immutable off-site backup, and independently tested restore;
9. off-host logs, external synthetic availability monitoring, APM, and paging.

Never represent two processes, containers, databases, Redis databases, or
virtual hosts on one physical VPS as separate failure domains. That arrangement
can be useful locally, but it does not satisfy production high availability.

## 2. Release filesystem and identity

The provider-neutral node fallback uses this bounded layout:

```text
/srv/ubsc/
  current  -> /srv/ubsc/releases/<active-release>
  previous -> /srv/ubsc/releases/<previous-release>
  releases/
    <immutable-release-a>/
    <immutable-release-b>/
```

Each release is complete and immutable: PHP dependencies and Vite assets are
built in CI, `public/hot` is absent, and its protected `.env` or secret mount
contains the exact `APP_RELEASE`. Runtime uploads, sessions, queues, caches,
invoices, and logs must not live inside a release directory.

Retain at least five releases operationally. Pruning is intentionally absent
from `atomic-node-rollout.sh`; a separately reviewed retention job may remove an
old release only when it is neither `current` nor `previous`, no process has an
open file under it, the compatibility window has closed, and the fleet has
passed its final gate.

## 3. Provider drain and undrain adapters

Create two root-owned, non-symlink executables outside the repository, for
example:

```text
/usr/local/libexec/ubsc-drain-node
/usr/local/libexec/ubsc-undrain-node
```

The rollout invokes each as:

```text
ADAPTER PRODUCTION_INSTANCE_ID APP_RELEASE
```

The drain adapter must authenticate through workload identity or a narrowly
scoped secret manager reference, locate exactly one load-balancer target,
request deregistration, wait until that target is no longer receiving new
requests, and wait for connection draining to complete. The undrain adapter
must register exactly that target and wait until the provider reports it healthy.
Ambiguous target identity, provider timeout, a non-terminal state, or more than
one match must return non-zero. Do not put provider tokens in the adapter,
repository, process list, command arguments, or application `.env`.

## 4. Per-node atomic rollout

Install the private-origin template from
`deploy/nginx/ubsc-origin.conf.example`, replace every uppercase placeholder,
restrict port 8443 in both the cloud firewall and Nginx to the load balancer,
install the private origin CA on the load balancer, and expose the loopback
readiness listener only on `127.0.0.1:8080`. The load balancer must connect to
each node on TLS port 8443 with certificate and hostname verification; port
8080 must never be used between hosts. Replace `PUBLIC_HOSTNAME`,
`ORIGIN_HOSTNAME`, and `ORIGIN_CA_FILE` in the HAProxy reference, and size the
per-node `maxconn` only after measuring PHP-FPM capacity; retain a short,
bounded backend queue so overload is shed instead of accumulating indefinitely.
`PUBLIC_HOSTNAME` is the canonical HTTP Host seen by Laravel; `ORIGIN_HOSTNAME`
is used only for backend TLS SNI and certificate hostname verification.
Nginx restores the LB-verified user address for limiter keys, then explicitly
pins FastCGI `HTTPS` and `SERVER_PORT=443`; do not remove those parameters or
Laravel may mistake private origin port 8443 for the public canonical port.

For one node at a time:

```text
export PRODUCTION_INSTANCE_ID=ubsc-app-01
export DEPLOYMENT_DRAIN_HOOK=/usr/local/libexec/ubsc-drain-node
export DEPLOYMENT_UNDRAIN_HOOK=/usr/local/libexec/ubsc-undrain-node

bash deploy/scripts/atomic-node-rollout.sh \
  /srv/ubsc \
  /srv/ubsc/releases/release-2026.08.25-a1b2c3d \
  release-2026.08.25-a1b2c3d
```

The script refuses root execution, concurrent deployment, paths outside the
bounded release directory, mutable/missing assets, unsafe secret permissions,
insufficient disk headroom, unsynchronized clocks, missing PHP extensions,
placeholder release identity, and absent provider adapters. It then drains the
node, atomically moves `current`, executes the complete existing activation
gate, verifies the exact release digest through loopback readiness, records
`previous`, and only then returns the node to traffic.

If activation or acceptance fails, the code pointer and long-lived workers are
returned to the previous release. The node remains drained if rollback cannot
be proven healthy. Database migrations are never reversed automatically.

Repeat only after the previous node is healthy again. With two nodes,
`DEPLOYMENT_MAX_UNAVAILABLE=1` is an absolute ceiling, not a target.

## 5. Schema compatibility

Every production schema change uses expand-contract:

1. add nullable columns, new tables, or parallel indexes first;
2. deploy code that can read both old and new representations;
3. backfill through bounded, resumable background jobs;
4. switch writes only after telemetry proves the backfill complete;
5. remove obsolete data in a later release after at least two compatible
   application releases and the documented rollback window.

Do not rename/drop a live column, tighten nullability, rebuild a large table, or
change an enum in the same release that first stops using it. A failed release
rolls application code back; a data-loss incident uses PITR/restore procedures.

## 6. Fleet and edge acceptance

After every node has converged, execute the fleet gate from a supervised node:

```text
export PRODUCTION_READINESS_OPERATION_ID="$(uuidgen)"

bash deploy/scripts/verify-production-readiness.sh \
  /srv/ubsc/current \
  https://ubsportcenter.co.id \
  2 \
  release-2026.08.25-a1b2c3d \
  24
```

The gate now also verifies the deployment contract and public edge. It requires
canonical HTTP-to-HTTPS redirection, TLS 1.2+, sufficient certificate lifetime,
HSTS, CSP and browser-security headers, uncached dependency-aware readiness,
distinct load-balanced nodes on the exact release, and all existing signed
replication/recovery/monitoring/capacity/resilience evidence.

A passing per-node check does not authorize a release by itself. A passing
fleet gate, external synthetic probe, and provider inventory together are the
acceptance record.

## 7. One-VPS transition path

If production must temporarily begin on one VPS, do not enable the strict
multi-node switches or describe it as highly available. Harden the host, use
external managed database/Redis/object storage, activate off-site backup and
external monitoring, and keep a tested rebuild procedure. The first availability
upgrade is a second application node in another failure domain behind the
managed load balancer; creating replicas on the original VPS does not improve
survival of a host failure.

The strict deployment contract is designed to block the final production label
until the real external topology exists. Never bypass a failed check to meet a
launch date; record the missing provider control and keep the deployment in a
declared transitional environment instead.
