#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-$(pwd)}"
PHP_BINARY="${PHP_BINARY:-php}"
SUPERVISORCTL_BINARY="${SUPERVISORCTL_BINARY:-supervisorctl}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
WAIT_SECONDS="${PROCESS_SUPERVISION_VERIFY_WAIT_SECONDS:-180}"
POLL_SECONDS="${PROCESS_SUPERVISION_VERIFY_POLL_SECONDS:-3}"
COMMAND_TIMEOUT_SECONDS="${PROCESS_SUPERVISION_COMMAND_TIMEOUT_SECONDS:-20}"

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Refusing process verification: ${APP_DIRECTORY} is not a Laravel release." >&2
    exit 64
fi

if [[ ! "${WAIT_SECONDS}" =~ ^[0-9]+$ ]] || (( WAIT_SECONDS < 30 || WAIT_SECONDS > 600 )); then
    echo "PROCESS_SUPERVISION_VERIFY_WAIT_SECONDS must be between 30 and 600." >&2
    exit 64
fi

if [[ ! "${POLL_SECONDS}" =~ ^[0-9]+$ ]] || (( POLL_SECONDS < 1 || POLL_SECONDS > 10 )); then
    echo "PROCESS_SUPERVISION_VERIFY_POLL_SECONDS must be between 1 and 10." >&2
    exit 64
fi

if [[ ! "${COMMAND_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( COMMAND_TIMEOUT_SECONDS < 5 || COMMAND_TIMEOUT_SECONDS > 60 )); then
    echo "PROCESS_SUPERVISION_COMMAND_TIMEOUT_SECONDS must be between 5 and 60." >&2
    exit 64
fi

if ! command -v "${PHP_BINARY}" >/dev/null 2>&1; then
    echo "The configured PHP binary is unavailable." >&2
    exit 69
fi

if ! command -v "${SUPERVISORCTL_BINARY}" >/dev/null 2>&1; then
    echo "supervisorctl is unavailable; production processes cannot be verified." >&2
    exit 69
fi

if ! command -v "${TIMEOUT_BINARY}" >/dev/null 2>&1; then
    echo "The configured timeout utility is unavailable." >&2
    exit 69
fi

run_bounded() {
    "${TIMEOUT_BINARY}" \
        --signal=TERM \
        --kill-after=5s \
        "${COMMAND_TIMEOUT_SECONDS}s" \
        "$@"
}

cd "${APP_DIRECTORY}"

run_bounded "${PHP_BINARY}" artisan production:process-check --strict
run_bounded "${PHP_BINARY}" artisan background-jobs:doctor --probe-backends

REQUIRED_PROGRAMS=(
    ubsc-scheduler
    ubsc-critical
    ubsc-documents
    ubsc-notifications
    ubsc-maintenance
    ubsc-media-maintenance
    ubsc-default
    ubsc-media-image
    ubsc-media-video
)

STATUS_OUTPUT=""

supervisor_snapshot_is_healthy() {
    local candidate_output=""
    local critical_count=0
    local program=""

    if ! candidate_output="$(run_bounded "${SUPERVISORCTL_BINARY}" status 'ubsc:*' 2>&1)"; then
        STATUS_OUTPUT="${candidate_output}"
        return 1
    fi

    STATUS_OUTPUT="${candidate_output}"

    if [[ -z "${STATUS_OUTPUT}" ]] \
        || ! awk 'NF >= 2 { seen = 1; if ($2 != "RUNNING") exit 1 } END { if (!seen) exit 1 }' <<<"${STATUS_OUTPUT}"; then
        return 1
    fi

    for program in "${REQUIRED_PROGRAMS[@]}"; do
        if ! grep -Eq "^ubsc:${program}(_[0-9]+)?[[:space:]]+RUNNING([[:space:]]|$)" <<<"${STATUS_OUTPUT}"; then
            return 1
        fi
    done

    critical_count="$(awk '$1 ~ /^ubsc:ubsc-critical(_[0-9]+)?$/ && $2 == "RUNNING" { count++ } END { print count + 0 }' <<<"${STATUS_OUTPUT}")"
    (( critical_count >= 2 ))
}

SUPERVISOR_DEADLINE=$(( $(date +%s) + WAIT_SECONDS ))

until supervisor_snapshot_is_healthy; do
    if (( $(date +%s) >= SUPERVISOR_DEADLINE )); then
        echo "Supervisor processes did not converge to the required RUNNING state within ${WAIT_SECONDS} seconds:" >&2
        printf '%s\n' "${STATUS_OUTPUT:-no status returned}" >&2
        exit 70
    fi

    sleep "${POLL_SECONDS}"
done

if command -v systemctl >/dev/null 2>&1 \
    && [[ "$(ps -p 1 -o comm= 2>/dev/null | tr -d '[:space:]')" == "systemd" ]]; then
    SUPERVISOR_UNIT=""

    for candidate in supervisor.service supervisord.service; do
        if run_bounded systemctl list-unit-files "${candidate}" --no-legend 2>/dev/null \
            | grep -q "^${candidate}[[:space:]]"; then
            SUPERVISOR_UNIT="${candidate}"
            break
        fi
    done

    if [[ -z "${SUPERVISOR_UNIT}" ]]; then
        echo "No Supervisor systemd unit is installed." >&2
        exit 70
    fi

    run_bounded systemctl is-enabled --quiet "${SUPERVISOR_UNIT}" || {
        echo "${SUPERVISOR_UNIT} is not enabled for host reboot recovery." >&2
        exit 70
    }
    run_bounded systemctl is-active --quiet "${SUPERVISOR_UNIT}" || {
        echo "${SUPERVISOR_UNIT} is not active." >&2
        exit 70
    }

    SUPERVISOR_RESTART_POLICY="$(
        run_bounded systemctl show \
            --property=Restart \
            --value \
            "${SUPERVISOR_UNIT}" 2>/dev/null \
            | tr -d '[:space:]'
    )"

    case "${SUPERVISOR_RESTART_POLICY}" in
        always|on-failure|on-abnormal|on-abort|on-watchdog)
            ;;
        *)
            echo "${SUPERVISOR_UNIT} does not have a failure-recovery Restart policy." >&2
            exit 70
            ;;
    esac
fi

PROBE_OUTPUT="$(mktemp)"
trap 'rm -f -- "${PROBE_OUTPUT}"' EXIT
DEADLINE=$(( $(date +%s) + WAIT_SECONDS ))

until run_bounded "${PHP_BINARY}" artisan production:process-check --strict --live --json >"${PROBE_OUTPUT}" 2>&1; do
    if (( $(date +%s) >= DEADLINE )); then
        echo "Scheduler or queue-worker heartbeat did not become healthy within ${WAIT_SECONDS} seconds." >&2
        sed -n '1,240p' "${PROBE_OUTPUT}" >&2
        exit 70
    fi

    sleep "${POLL_SECONDS}"
done

echo "Process supervision is healthy: local Supervisor state and deployment-level scheduler/queue heartbeats passed."
