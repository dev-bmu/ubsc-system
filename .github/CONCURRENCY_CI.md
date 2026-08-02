# Required concurrency gate

The workflow in `workflows/mariadb-concurrency.yml` runs the repository's
small, multi-process booking, payment-attempt, and recovery concurrency suite
against a real MariaDB/InnoDB service.
It intentionally does not use the default SQLite test connection because
SQLite cannot validate the row-locking behaviour used in production.

## Repository ruleset

GitHub does not allow a workflow YAML file to make itself a required merge
check. In the repository settings, add this status check to the protected
branch ruleset:

```text
Critical multi-process concurrency / Required multi-process concurrency (MariaDB/InnoDB)
```

Require the branch to be up to date before merging. Do not mark this workflow
as allowed to fail. The workflow is registered for pull requests, pushes,
merge queues, and manual runs, and its stable job name is kept deliberately so
the ruleset does not silently lose the check after a rename.

The CI database name is generated per workflow run, validated against the
`ubsc_race_` safety prefix, and created inside the ephemeral MariaDB service.
The job also verifies MariaDB and InnoDB explicitly before migrations or race
probes run.
