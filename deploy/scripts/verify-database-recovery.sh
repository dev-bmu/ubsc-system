#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${RECOVERY_COMMAND_TIMEOUT_SECONDS:-30}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing database-recovery verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 120 )); then
    echo "RECOVERY_COMMAND_TIMEOUT_SECONDS must be between 5 and 120." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required database-recovery verification binary is unavailable: ${binary}" >&2
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

# Verify every local predecessor/signature first. The live contract then
# refuses stale PITR, failed/missing attested backups, overdue restore drills,
# invalid targets, and missing evidence-chain verification.
run_bounded "${PHP_BINARY}" artisan recovery:evidence-verify --record-heartbeat --quiet
run_bounded "${PHP_BINARY}" artisan production:recovery-check --strict --live

echo "Database recovery proof is current, independently attested, and inside RPO/RTO boundaries."
