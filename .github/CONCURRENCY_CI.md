# Required concurrency gate

The workflow in `workflows/mariadb-concurrency.yml` runs the repository's
small, multi-process booking, payment-attempt, recovery, invoice-artifact,
performance-counter, database-replication control plane, append-only
database-recovery ledger, and resilience-ledger concurrency suite
against a real MariaDB/InnoDB service.
It intentionally does not use the default SQLite test connection because
SQLite cannot validate the row-locking behaviour used in production.

## Repository ruleset

GitHub does not allow workflow YAML files to make themselves required merge
checks. In the repository settings, add both status checks to the protected
branch ruleset:

```text
Required application quality
Required multi-process concurrency (MariaDB/InnoDB)
```

Require the branch to be up to date before merging. Require at least one
approval, CODEOWNERS review, dismissal of stale approvals after new commits,
approval by someone other than the last pusher, and resolution of every review
thread. Block branch deletion and non-fast-forward/force pushes. Do not mark
this workflow as allowed to fail. The workflow is registered for pull requests, pushes,
merge queues, and manual runs, and its stable job name is kept deliberately so
the ruleset does not silently lose the check after a rename.
Before enabling required CODEOWNERS review, add a real independent maintainer or
organization team to `.github/CODEOWNERS`; a pull-request author cannot approve
their own change. Do not invent a placeholder team. Reviews do not add commits
or change commit authorship, so `ibamzjr` can remain the sole contributor while
an authorized maintainer supplies separation of duties.
Select **GitHub Actions** as the required check's expected source; leaving the
source unrestricted allows another integration to publish a colliding name.
The concurrency job also performs a read-only ruleset self-check before running
tests and fails when either strict, source-pinned rule disappears. Initial bootstrap is
deliberate: push the workflow, let its job name register once, create the rule
as a repository administrator, then rerun the workflow.

GitHub identifies a normal workflow status check by its **job name**, not by a
`workflow / job` display label. After the workflow has been pushed, passed on
the default branch, and the active ruleset has been configured, verify both the
policy and the latest branch result with a short-lived, read-only token:

```text
GITHUB_REPOSITORY=dev-bmu/ubsc-system \
GITHUB_DEFAULT_BRANCH=main \
GITHUB_TOKEN=... \
node scripts/verify-github-concurrency-gate.mjs
```

The verifier never changes repository settings. It fails unless the branch is
protected, strict CODEOWNERS review and history protections are active, both
exact job names are source-pinned, and the current branch head has successful
checks supplied by GitHub Actions. Do not
place this token on an application server or commit it to any environment file.

The CI database name is generated per workflow run, validated against the
`ubsc_race_` safety prefix, and created inside the ephemeral MariaDB service.
The job also verifies MariaDB and InnoDB explicitly before migrations or race
probes run.

The booking probe races independent PHP processes against both inventory
models: an arena remains exclusive even when its generic capacity is greater
than one, while a shared class admits exactly its participant capacity and
rejects every excess contender. The assertion checks committed orders and
booking rows after all processes finish, not merely HTTP responses, so a false
success or hidden oversell fails the required merge gate.

The database-replication probe races duplicate topology observations, competing
writer promotions, and repeated split-brain evidence. It proves that only one
writer can win an epoch, two different promotions cannot reuse one operation
identity, a conflicting writer is fenced without replacing the accepted writer,
duplicate provider evidence is idempotent, and the signed event chain remains
valid under InnoDB contention.

The database-recovery and resilience probes each race distinct signed evidence
to prove contiguous sequence allocation, then race identical evidence to prove
one idempotent append. Recovery also races two evidence types using one global
operation ID and proves only one fact can commit. Both paths verify every
signature, predecessor, and locked chain head after all child processes finish;
this check must remain required because SQLite cannot prove these InnoDB locking
and uniqueness guarantees.

Before those races, the same isolated MariaDB service runs the complete
recovery and replication feature contracts. This exercises real InnoDB
uniqueness, database immutability triggers, signed attestation imports,
single-writer fencing, and restore-drill guards.
