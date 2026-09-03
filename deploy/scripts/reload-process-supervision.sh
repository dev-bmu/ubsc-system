#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
SUPERVISORCTL_BINARY="${SUPERVISORCTL_BINARY:-supervisorctl}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
COMMAND_TIMEOUT_SECONDS="${PROCESS_SUPERVISION_COMMAND_TIMEOUT_SECONDS:-20}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing Supervisor reload: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 60 )); then
    echo "PROCESS_SUPERVISION_COMMAND_TIMEOUT_SECONDS must be between 5 and 60." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${SUPERVISORCTL_BINARY}" "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required deployment binary is unavailable: ${binary}" >&2
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

# Validate the exact configured artifact before asking the daemon to read it.
run_bounded "${PHP_BINARY}" artisan production:process-check --strict

# `reread` only discovers changes; `update` is what atomically adds, removes,
# or restarts changed process groups in the running supervisord instance.
run_bounded "${SUPERVISORCTL_BINARY}" reread
run_bounded "${SUPERVISORCTL_BINARY}" update

# schedule:work is a long-lived process rooted in the release directory. It
# must be restarted explicitly so a symlink-based deployment cannot leave the
# scheduler executing the previous release indefinitely.
run_bounded "${SUPERVISORCTL_BINARY}" restart ubsc:ubsc-scheduler

echo "The active Supervisor configuration is loaded and the scheduler is running from the activated release."
