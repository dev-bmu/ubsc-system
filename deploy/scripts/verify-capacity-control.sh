#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
WAIT_SECONDS="${CAPACITY_VERIFY_WAIT_SECONDS:-180}"
POLL_SECONDS="${CAPACITY_VERIFY_POLL_SECONDS:-3}"
COMMAND_TIMEOUT_SECONDS="${CAPACITY_VERIFY_COMMAND_TIMEOUT_SECONDS:-30}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing capacity verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ ! "${WAIT_SECONDS}" =~ ^[0-9]+$ ]] || (( WAIT_SECONDS < 30 || WAIT_SECONDS > 600 )); then
    echo "CAPACITY_VERIFY_WAIT_SECONDS must be between 30 and 600." >&2
    exit 64
fi

if [[ ! "${POLL_SECONDS}" =~ ^[0-9]+$ ]] || (( POLL_SECONDS < 1 || POLL_SECONDS > 10 )); then
    echo "CAPACITY_VERIFY_POLL_SECONDS must be between 1 and 10." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 120 )); then
    echo "CAPACITY_VERIFY_COMMAND_TIMEOUT_SECONDS must be between 5 and 120." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required capacity verification binary is unavailable: ${binary}" >&2
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
umask 077
PLAN_OUTPUT="$(mktemp)"
CHECK_OUTPUT="$(mktemp)"
trap 'rm -f -- "${PLAN_OUTPUT}" "${CHECK_OUTPUT}"' EXIT

run_bounded "${PHP_BINARY}" artisan production:capacity-check --strict

DEADLINE=$(( $(date +%s) + WAIT_SECONDS ))

capacity_snapshot_is_healthy() {
    : >"${PLAN_OUTPUT}"
    : >"${CHECK_OUTPUT}"

    if ! run_bounded "${PHP_BINARY}" artisan capacity:plan --json --fail-on-blocked >"${PLAN_OUTPUT}" 2>&1; then
        return 1
    fi

    run_bounded "${PHP_BINARY}" artisan production:capacity-check --strict --live >"${CHECK_OUTPUT}" 2>&1
}

until capacity_snapshot_is_healthy; do
    if (( $(date +%s) >= DEADLINE )); then
        echo "Capacity evidence, provider observation, or signed plan did not converge within ${WAIT_SECONDS} seconds." >&2
        echo "Last capacity planner result:" >&2
        sed -n '1,120p' "${PLAN_OUTPUT}" >&2
        echo "Last live capacity contract result:" >&2
        sed -n '1,160p' "${CHECK_OUTPUT}" >&2
        exit 70
    fi

    sleep "${POLL_SECONDS}"
done

echo "Capacity control is healthy: scoped evidence, provider state, guardrails, and the signed plan all passed."
