#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${PRODUCTION_READINESS_COMMAND_TIMEOUT_SECONDS:-300}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing readiness verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi
APP_DIRECTORY="$(cd -- "${APP_DIRECTORY}" && pwd -P)"
if ! [[ "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 30 || COMMAND_TIMEOUT_SECONDS > 600 )); then
    echo "PRODUCTION_READINESS_COMMAND_TIMEOUT_SECONDS must be between 30 and 600." >&2
    exit 64
fi
for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}" bash; do
    command -v "${binary}" >/dev/null 2>&1 || { echo "Required readiness binary is unavailable: ${binary}" >&2; exit 69; }
done
run_bounded() {
    "${TIMEOUT_BINARY}" --signal=TERM --kill-after=5s "${COMMAND_TIMEOUT_SECONDS}s" "$@"
}

cd "${APP_DIRECTORY}"
[[ "$(run_bounded "${PHP_BINARY}" artisan production:topology --no-interaction)" == 'single_node' ]] \
    || { echo "Single-node readiness refuses a different topology." >&2; exit 78; }

echo "[1/7] Probing application dependencies and persistent storage"
run_bounded "${PHP_BINARY}" artisan production:check --strict --probe --no-interaction

echo "[2/7] Verifying backup, PITR, restore-drill, and external uptime evidence"
run_bounded "${PHP_BINARY}" artisan production:single-recovery-check --no-interaction

echo "[3/7] Verifying every background queue backend"
run_bounded "${PHP_BINARY}" artisan background-jobs:doctor --probe-backends --no-interaction

echo "[4/7] Verifying private invoice storage"
run_bounded "${PHP_BINARY}" artisan invoices:pdf:doctor --probe-storage --no-interaction

echo "[5/7] Verifying Supervisor recovery and live process heartbeats"
run_bounded bash "$(dirname -- "${BASH_SOURCE[0]}")/verify-process-supervision.sh" "${APP_DIRECTORY}"

echo "[6/7] Collecting and delivering a fresh monitoring cycle"
run_bounded "${PHP_BINARY}" artisan monitoring:collect --quiet --no-interaction
run_bounded "${PHP_BINARY}" artisan monitoring:alerts:deliver --quiet --no-interaction

echo "[7/7] Rechecking durable-storage sentinel and the cached contract"
run_bounded "${PHP_BINARY}" artisan production:storage-sentinel --check --no-interaction
run_bounded "${PHP_BINARY}" artisan production:check --strict --no-interaction

echo "Single-node readiness passed: runtime, dependencies, recovery, storage, queues, and supervised processes are healthy."
