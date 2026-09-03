#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${REPLICATION_IMPORT_TIMEOUT_SECONDS:-30}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing replication import: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 120 )); then
    echo "REPLICATION_IMPORT_TIMEOUT_SECONDS must be between 5 and 120." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required replication-import binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

cd "${APP_DIRECTORY}"

# The signed envelope is streamed over stdin so application hosts never need
# the observer private key and no transient attestation file is left behind.
"${TIMEOUT_BINARY}" \
    --signal=TERM \
    --kill-after=5s \
    "${COMMAND_TIMEOUT_SECONDS}s" \
    "${PHP_BINARY}" artisan replication:attestation-import \
        --file=- \
        --fail-on-unhealthy \
        --quiet

echo "Signed database-replication observation imported."
