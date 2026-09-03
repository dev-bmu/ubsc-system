#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-}"
PUBLIC_ORIGIN="${2:-}"
EXPECTED_NODES="${3:-}"
EXPECTED_RELEASE="${4:-}"
SAMPLES="${5:-}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${PRODUCTION_READINESS_COMMAND_TIMEOUT_SECONDS:-120}"
SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
READINESS_OPERATION_ID="${PRODUCTION_READINESS_OPERATION_ID:-}"

if [[ -z "${APP_DIRECTORY}" || -z "${PUBLIC_ORIGIN}" || -z "${EXPECTED_NODES}" || -z "${EXPECTED_RELEASE}" ]]; then
    echo "Usage: verify-production-readiness.sh APP_DIRECTORY https://production-origin expected-nodes expected-release [samples]" >&2
    exit 64
fi

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing production readiness verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if ! APP_DIRECTORY="$(cd -- "${APP_DIRECTORY}" && pwd -P)"; then
    echo "The production application directory cannot be resolved." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 30 || COMMAND_TIMEOUT_SECONDS > 600 )); then
    echo "PRODUCTION_READINESS_COMMAND_TIMEOUT_SECONDS must be between 30 and 600." >&2
    exit 64
fi

if ! [[ "${READINESS_OPERATION_ID}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]; then
    echo "PRODUCTION_READINESS_OPERATION_ID must be a new UUIDv4 for this exact rollout verification." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}" bash; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required production-readiness binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

for script in \
    verify-load-balancer.sh \
    verify-edge-security.sh \
    verify-ddos-protection.sh \
    verify-database-replication.sh \
    verify-recovery-observability.sh \
    verify-process-supervision.sh \
    verify-capacity-control.sh \
    verify-resilience-drills.sh; do
    if [[ ! -f "${SCRIPT_DIRECTORY}/${script}" ]]; then
        echo "Required production-readiness verifier is unavailable: ${script}" >&2
        exit 69
    fi
done

run_bounded() {
    "${TIMEOUT_BINARY}" \
        --signal=TERM \
        --kill-after=5s \
        "${COMMAND_TIMEOUT_SECONDS}s" \
        "$@"
}

cd "${APP_DIRECTORY}"

echo "[1/14] Probing the complete application dependency contract"
run_bounded "${PHP_BINARY}" artisan production:check --strict --probe
run_bounded "${PHP_BINARY}" artisan production:deployment-check --strict
run_bounded "${PHP_BINARY}" artisan production:ddos-check --strict

echo "[2/14] Proving the writer and every isolated Redis HA endpoint"
run_bounded "${PHP_BINARY}" artisan production:ha-check \
    --strict \
    --probe \
    --expected-nodes="${EXPECTED_NODES}" \
    --public-origin="${PUBLIC_ORIGIN}" \
    --expected-release="${EXPECTED_RELEASE}"

echo "[3/14] Proving load-balancer distribution and release convergence"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-edge-security.sh" "${PUBLIC_ORIGIN}"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-ddos-protection.sh" \
    "${APP_DIRECTORY}" "${PUBLIC_ORIGIN}"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-load-balancer.sh" \
    "${PUBLIC_ORIGIN}" "${EXPECTED_NODES}" "${EXPECTED_RELEASE}" "${SAMPLES}"

echo "[4/14] Verifying current single-writer replication and fencing evidence"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-database-replication.sh" "${APP_DIRECTORY}"

echo "[5/14] Probing every background queue and its lease contract"
run_bounded "${PHP_BINARY}" artisan background-jobs:doctor --probe-backends

echo "[6/14] Proving private shared document storage by round trip"
run_bounded "${PHP_BINARY}" artisan invoices:pdf:doctor --probe-storage

echo "[7/14] Sending a signed canary through the off-host alert and log paths"
run_bounded "${PHP_BINARY}" artisan monitoring:alerts:canary \
    --operation-id="${READINESS_OPERATION_ID}" \
    --quiet

echo "[8/14] Requiring provider-signed proof of exact off-host log ingestion"
run_bounded "${PHP_BINARY}" artisan monitoring:logs:await-receipt \
    "${READINESS_OPERATION_ID}" \
    --quiet

echo "[9/14] Collecting a fresh monitoring snapshot"
run_bounded "${PHP_BINARY}" artisan monitoring:collect --quiet

echo "[10/14] Draining durable incident notifications"
run_bounded "${PHP_BINARY}" artisan monitoring:alerts:deliver --quiet

echo "[11/14] Requiring fresh PITR, backup, restore, alert, log, and external-uptime evidence"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-recovery-observability.sh" \
    "${APP_DIRECTORY}" --require-log-receipt

echo "[12/14] Verifying supervisor recovery and worker dead-man heartbeats"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-process-supervision.sh" "${APP_DIRECTORY}"

echo "[13/14] Requiring fresh provider capacity evidence and a safe signed plan"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-capacity-control.sh" "${APP_DIRECTORY}"

echo "[14/14] Requiring a fresh controlled failover campaign for every critical fault domain"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-resilience-drills.sh" "${APP_DIRECTORY}"

echo "Production readiness passed for ${READINESS_OPERATION_ID} with converged application nodes, live dependencies, current signed recovery/failover evidence, and proven off-host monitoring delivery."
