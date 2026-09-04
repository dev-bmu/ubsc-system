#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS:-600}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing single-node preparation: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi
APP_DIRECTORY="$(cd -- "${APP_DIRECTORY}" && pwd -P)"

if ! [[ "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 60 || COMMAND_TIMEOUT_SECONDS > 3600 )); then
    echo "ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS must be between 60 and 3600." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}"; do
    command -v "${binary}" >/dev/null 2>&1 \
        || { echo "Required preparation binary is unavailable: ${binary}" >&2; exit 69; }
done

run_bounded() {
    "${TIMEOUT_BINARY}" --signal=TERM --kill-after=10s "${COMMAND_TIMEOUT_SECONDS}s" "$@"
}

run_artisan() {
    run_bounded "${PHP_BINARY}" artisan "$@" --no-interaction
}

cd "${APP_DIRECTORY}"

echo "[1/11] Removing stale candidate configuration"
run_artisan config:clear

echo "[2/11] Requiring the single-node topology"
[[ "$(run_artisan production:topology)" == 'single_node' ]] \
    || { echo "The single-node preparer refuses a different topology." >&2; exit 78; }

echo "[3/11] Validating application and process contracts before cache creation"
run_artisan production:check --strict
run_artisan production:process-check --strict

echo "[4/11] Building deterministic production caches"
run_artisan optimize

echo "[5/11] Revalidating the cached configuration"
run_artisan production:check --strict
run_artisan production:process-check --strict

echo "[6/11] Provisioning and verifying persistent storage"
run_artisan production:storage-sentinel
run_artisan production:check --strict --probe

echo "[7/11] Applying isolated expand-compatible migrations before traffic switch"
run_artisan migrate --force --isolated
run_artisan reference-data:sync --repair --no-interaction

echo "[8/11] Rechecking schema-visible application dependencies"
run_artisan production:check --strict --probe

echo "[9/11] Verifying durable background queues"
run_artisan background-jobs:doctor --probe-backends

echo "[10/11] Verifying private invoice document storage"
run_artisan invoices:pdf:doctor --probe-storage

echo "[11/11] Requiring current off-site recovery and uptime evidence"
run_artisan production:single-recovery-check

echo "Single-node candidate is prepared; no application traffic has been switched."
