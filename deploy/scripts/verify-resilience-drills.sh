#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${RESILIENCE_VERIFY_COMMAND_TIMEOUT_SECONDS:-30}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing resilience verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 120 )); then
    echo "RESILIENCE_VERIFY_COMMAND_TIMEOUT_SECONDS must be between 5 and 120." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required resilience verification binary is unavailable: ${binary}" >&2
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

# Empty or cryptographically valid history is not sufficient. The live
# contract also requires a recent campaign in which every mandatory scenario
# recovered successfully inside its declared objective.
run_bounded "${PHP_BINARY}" artisan resilience:evidence:verify --record-heartbeat --quiet
run_bounded "${PHP_BINARY}" artisan production:resilience-check --strict --live

echo "Resilience posture is healthy: campaign freshness, recovery outcomes, external signatures, and ledger integrity passed."
