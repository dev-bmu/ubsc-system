#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
REQUIRE_LOG_RECEIPT="${2:-}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${RECOVERY_OBSERVABILITY_COMMAND_TIMEOUT_SECONDS:-30}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing recovery/observability verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ -n "${REQUIRE_LOG_RECEIPT}" && "${REQUIRE_LOG_RECEIPT}" != "--require-log-receipt" ]]; then
    echo "The optional second argument must be --require-log-receipt." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 120 )); then
    echo "RECOVERY_OBSERVABILITY_COMMAND_TIMEOUT_SECONDS must be between 5 and 120." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required verification binary is unavailable: ${binary}" >&2
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

# A successful empty-chain verification is not sufficient: the live recovery
# contract below separately requires fresh PITR, backup, and restore evidence.
run_bounded "${PHP_BINARY}" artisan recovery:evidence-verify --record-heartbeat --quiet
run_bounded "${PHP_BINARY}" artisan production:recovery-check --strict --live
run_bounded "${PHP_BINARY}" artisan production:observability-check \
    --strict \
    --live \
    ${REQUIRE_LOG_RECEIPT:+"${REQUIRE_LOG_RECEIPT}"}

echo "Recovery evidence, tested restore posture, alert delivery, and observability contracts are healthy."
