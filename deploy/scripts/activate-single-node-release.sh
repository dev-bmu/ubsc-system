#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

APP_DIRECTORY="${1:-$(pwd)}"
SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS:-600}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing single-node activation: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi
APP_DIRECTORY="$(cd -- "${APP_DIRECTORY}" && pwd -P)"

if ! [[ "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 60 || COMMAND_TIMEOUT_SECONDS > 3600 )); then
    echo "ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS must be between 60 and 3600." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}" bash; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required activation binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

run_bounded() {
    "${TIMEOUT_BINARY}" --signal=TERM --kill-after=10s "${COMMAND_TIMEOUT_SECONDS}s" "$@"
}

run_artisan() {
    run_bounded "${PHP_BINARY}" artisan "$@" --no-interaction
}

cd "${APP_DIRECTORY}"

if [[ "$(run_artisan production:topology)" != 'single_node' ]]; then
    echo "The single-node activator refuses a non-single_node release." >&2
    exit 78
fi

echo "[1/8] Confirming the switched release still satisfies its cached contract"
run_artisan production:check --strict
run_artisan production:process-check --strict

echo "[2/8] Verifying background-job queue and lease contracts"
run_artisan background-jobs:doctor --probe-backends

echo "[3/8] Verifying private invoice document storage"
run_artisan invoices:pdf:doctor --probe-storage

echo "[4/8] Requiring current off-site backup, PITR, restore, and uptime evidence"
run_artisan production:single-recovery-check

echo "[5/8] Reloading the verified Supervisor artifact"
run_bounded bash "${SCRIPT_DIRECTORY}/reload-process-supervision.sh" "${APP_DIRECTORY}"

echo "[6/8] Gracefully recycling long-lived workers"
run_artisan queue:restart

echo "[7/8] Waiting for processes and dead-man heartbeats to converge"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-process-supervision.sh" "${APP_DIRECTORY}"

echo "[8/8] Collecting and delivering a fresh operational snapshot"
run_artisan monitoring:collect --quiet
run_artisan monitoring:alerts:deliver --quiet

echo "Single-node release activation passed every post-switch process and monitoring gate."
