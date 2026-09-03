#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS:-600}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing deployment activation: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if ! APP_DIRECTORY="$(cd -- "${APP_DIRECTORY}" && pwd -P)"; then
    echo "The release application directory cannot be resolved." >&2
    exit 64
fi

if ! [[ "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 60 || COMMAND_TIMEOUT_SECONDS > 3600 )); then
    echo "ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS must be between 60 and 3600." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}" bash; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required release-activation binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

run_bounded() {
    "${TIMEOUT_BINARY}" \
        --signal=TERM \
        --kill-after=10s \
        "${COMMAND_TIMEOUT_SECONDS}s" \
        "$@"
}

run_artisan() {
    run_bounded "${PHP_BINARY}" artisan "$@"
}

run_verifier() {
    local script="${1}"
    shift
    run_bounded bash "${SCRIPT_DIRECTORY}/${script}" "$@"
}

cd "${APP_DIRECTORY}"

echo "[1/39] Removing any stale cached configuration"
run_artisan config:clear --no-interaction

echo "[2/39] Validating the freshly resolved production contract"
run_artisan production:check --strict
run_artisan production:deployment-check --strict
run_artisan production:ddos-check --strict

echo "[3/39] Validating freshly resolved high-availability declarations"
run_artisan production:ha-check --strict

echo "[4/39] Validating database-replication topology and fencing declarations"
run_artisan production:replication-check --strict

echo "[5/39] Validating disaster-recovery declarations and recovery objectives"
run_artisan production:recovery-check --strict

echo "[6/39] Validating observability, SLO, and off-host alert declarations"
run_artisan production:observability-check --strict

echo "[7/39] Validating the active process-supervision artifact"
run_artisan production:process-check --strict

echo "[8/39] Validating capacity policy, trust boundaries, and bounded history"
run_artisan production:capacity-check --strict

echo "[9/39] Validating controlled resilience and game-day safety boundaries"
run_artisan production:resilience-check --strict

echo "[10/39] Building the exact optimized configuration that will serve traffic"
run_artisan optimize

echo "[11/39] Revalidating the cached production contract"
run_artisan production:check --strict
run_artisan production:deployment-check --strict
run_artisan production:ddos-check --strict

echo "[12/39] Revalidating cached high-availability declarations"
run_artisan production:ha-check --strict

echo "[13/39] Revalidating cached database-replication declarations"
run_artisan production:replication-check --strict

echo "[14/39] Revalidating cached disaster-recovery declarations"
run_artisan production:recovery-check --strict

echo "[15/39] Revalidating cached observability declarations"
run_artisan production:observability-check --strict

echo "[16/39] Revalidating cached process-supervision declarations"
run_artisan production:process-check --strict

echo "[17/39] Revalidating cached capacity declarations"
run_artisan production:capacity-check --strict

echo "[18/39] Revalidating cached resilience declarations"
run_artisan production:resilience-check --strict

echo "[19/39] Probing required dependencies with cached configuration"
run_artisan production:check --strict --probe

echo "[20/39] Probing the writer and every Redis failover endpoint"
run_artisan production:ha-check --strict --probe

echo "[21/39] Requiring current signed replication proof before any schema mutation"
run_verifier verify-database-replication.sh "${APP_DIRECTORY}"

echo "[22/39] Requiring current database-recovery proof before any schema mutation"
run_verifier verify-database-recovery.sh "${APP_DIRECTORY}"

echo "[23/39] Requiring current resilience proof before any schema mutation"
run_verifier verify-resilience-drills.sh "${APP_DIRECTORY}"

echo "[24/39] Applying migrations and sealing first-run replication state"
run_artisan migrate --force --isolated --no-interaction
run_artisan replication:attestation-import --bootstrap-if-empty --fail-on-unhealthy --quiet

echo "[25/39] Verifying background-job safety contracts"
run_artisan background-jobs:doctor --probe-backends

echo "[26/39] Verifying invoice document storage"
run_artisan invoices:pdf:doctor --probe-storage

echo "[27/39] Rechecking the application after schema changes"
run_artisan production:check --strict --probe

echo "[28/39] Verifying the complete signed recovery evidence chain"
run_artisan recovery:evidence-verify --record-heartbeat --quiet

echo "[29/39] Verifying the complete signed replication event chain"
run_artisan replication:ledger-verify --record-heartbeat --quiet

echo "[30/39] Proving signed delivery through the off-host alert path"
run_artisan monitoring:alerts:canary --quiet

echo "[31/39] Collecting a fresh operational snapshot"
run_artisan monitoring:collect --quiet

echo "[32/39] Delivering incidents opened by the fresh snapshot"
run_artisan monitoring:alerts:deliver --quiet

echo "[33/39] Requiring fresh recovery and observability evidence"
run_verifier verify-recovery-observability.sh "${APP_DIRECTORY}"

echo "[34/39] Requiring fresh replication proof after activation-side operations"
run_verifier verify-database-replication.sh "${APP_DIRECTORY}"

echo "[35/39] Loading the verified configuration into the running Supervisor daemon"
run_verifier reload-process-supervision.sh "${APP_DIRECTORY}"

echo "[36/39] Gracefully recycling long-lived workers"
run_artisan queue:restart

echo "[37/39] Verifying supervised processes and live dead-man heartbeats"
run_verifier verify-process-supervision.sh "${APP_DIRECTORY}"

echo "[38/39] Requiring fresh capacity evidence, provider state, and a signed safe plan"
run_verifier verify-capacity-control.sh "${APP_DIRECTORY}"

echo "[39/39] Rechecking resilience proof after activation-side operations"
run_verifier verify-resilience-drills.sh "${APP_DIRECTORY}"

echo "Release activation completed with verified replication, recovery, observability, process supervision, capacity control, and resilience proof."
