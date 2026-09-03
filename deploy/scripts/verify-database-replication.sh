#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${REPLICATION_COMMAND_TIMEOUT_SECONDS:-30}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing replication verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 120 )); then
    echo "REPLICATION_COMMAND_TIMEOUT_SECONDS must be between 5 and 120." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required database-replication verification binary is unavailable: ${binary}" >&2
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

# The live command verifies the ledger when the control-plane schema exists.
# On the first rollout only, an entirely absent schema requires a fresh signed
# bootstrap envelope and verifies it statelessly before migrations. A partial
# or previously initialized schema can never use that bootstrap path.
run_bounded "${PHP_BINARY}" artisan production:replication-check --strict --live

echo "Database replication is current, single-writer, fenced, independently attested, and inside lag/RTO boundaries."
