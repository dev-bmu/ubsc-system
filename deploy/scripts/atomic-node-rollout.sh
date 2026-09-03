#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

APPLICATION_ROOT="${1:-}"
CANDIDATE_RELEASE="${2:-}"
EXPECTED_RELEASE="${3:-}"
SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
LOCK_TIMEOUT_SECONDS="${DEPLOYMENT_LOCK_TIMEOUT_SECONDS:-1800}"
COMMAND_TIMEOUT_SECONDS="${DEPLOYMENT_COMMAND_TIMEOUT_SECONDS:-900}"
LOCAL_READINESS_URL="${DEPLOYMENT_LOCAL_READINESS_URL:-http://127.0.0.1:8080/health/ready}"
DRAIN_HOOK="${DEPLOYMENT_DRAIN_HOOK:-}"
UNDRAIN_HOOK="${DEPLOYMENT_UNDRAIN_HOOK:-}"
INSTANCE_ID="${PRODUCTION_INSTANCE_ID:-}"

usage() {
    echo "Usage: atomic-node-rollout.sh /srv/ubsc /srv/ubsc/releases/release-id immutable-release-id" >&2
}

if [[ -z "${APPLICATION_ROOT}" || -z "${CANDIDATE_RELEASE}" || -z "${EXPECTED_RELEASE}" ]]; then
    usage
    exit 64
fi

if [[ "$(id -u)" == '0' ]]; then
    echo "Refusing rollout as root; use the dedicated unprivileged deployment account." >&2
    exit 77
fi

if ! [[ "${EXPECTED_RELEASE}" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{6,127}$ ]] \
    || [[ "${EXPECTED_RELEASE}" =~ [Rr][Ee][Pp][Ll][Aa][Cc][Ee]|[Ee][Xx][Aa][Mm][Pp][Ll][Ee]|[Uu][Nn][Kk][Nn][Oo][Ww][Nn]|[Ll][Aa][Tt][Ee][Ss][Tt]|[Pp][Ll][Aa][Cc][Ee][Hh][Oo][Ll][Dd][Ee][Rr] ]]; then
    echo "The expected release must be an immutable non-placeholder identifier." >&2
    exit 64
fi

for value in "${LOCK_TIMEOUT_SECONDS}" "${COMMAND_TIMEOUT_SECONDS}"; do
    if ! [[ "${value}" =~ ^[0-9]+$ ]]; then
        echo "Deployment timeouts must be integer seconds." >&2
        exit 64
    fi
done
if (( LOCK_TIMEOUT_SECONDS < 300 || LOCK_TIMEOUT_SECONDS > 7200 \
    || COMMAND_TIMEOUT_SECONDS < 300 || COMMAND_TIMEOUT_SECONDS > LOCK_TIMEOUT_SECONDS )); then
    echo "Deployment lock/command timeout contract is invalid." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}" bash curl flock realpath ln mv awk sha256sum mktemp rm; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required rollout binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

for hook in "${DRAIN_HOOK}" "${UNDRAIN_HOOK}"; do
    if [[ -z "${hook}" || "${hook}" != /* || ! -f "${hook}" || ! -x "${hook}" || -L "${hook}" ]]; then
        echo "Drain and undrain hooks must be absolute, executable, non-symlink provider adapters." >&2
        exit 78
    fi
done

if ! [[ "${INSTANCE_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$ ]]; then
    echo "PRODUCTION_INSTANCE_ID must identify this exact load-balancer target." >&2
    exit 78
fi

if ! APPLICATION_ROOT="$(realpath -e -- "${APPLICATION_ROOT}")" \
    || ! CANDIDATE_RELEASE="$(realpath -e -- "${CANDIDATE_RELEASE}")"; then
    echo "Application root and candidate release must already exist." >&2
    exit 64
fi

RELEASES_ROOT="${APPLICATION_ROOT}/releases"
CURRENT_LINK="${APPLICATION_ROOT}/current"
PREVIOUS_LINK="${APPLICATION_ROOT}/previous"
if [[ ! -d "${RELEASES_ROOT}" ]] || ! RELEASES_ROOT="$(realpath -e -- "${RELEASES_ROOT}")"; then
    echo "The bounded releases directory is unavailable." >&2
    exit 64
fi

if [[ "$(dirname -- "${CANDIDATE_RELEASE}")" != "${RELEASES_ROOT}" \
    || ! -f "${CANDIDATE_RELEASE}/artisan" \
    || ! -f "${CANDIDATE_RELEASE}/composer.json" ]]; then
    echo "The candidate must be one direct, complete child of the bounded releases directory." >&2
    exit 64
fi

if [[ ! -L "${CURRENT_LINK}" ]] || ! OLD_RELEASE="$(realpath -e -- "${CURRENT_LINK}")"; then
    echo "The current release pointer must be an existing symlink." >&2
    exit 64
fi
if [[ "$(dirname -- "${OLD_RELEASE}")" != "${RELEASES_ROOT}" ]]; then
    echo "The current release resolves outside the bounded releases directory." >&2
    exit 64
fi
if [[ "${OLD_RELEASE}" == "${CANDIDATE_RELEASE}" ]]; then
    echo "The candidate is already active; refusing an ambiguous replay." >&2
    exit 65
fi

exec 9>"${APPLICATION_ROOT}/.deployment.lock"
if ! flock --exclusive --timeout "${LOCK_TIMEOUT_SECONDS}" 9; then
    echo "Another deployment owns the node rollout lease." >&2
    exit 75
fi

run_bounded() {
    "${TIMEOUT_BINARY}" --signal=TERM --kill-after=10s "${COMMAND_TIMEOUT_SECONDS}s" "$@"
}

atomic_link() {
    local target="$1"
    local link="$2"
    local temporary="${link}.next.${BASHPID}"

    if [[ "$(dirname -- "${link}")" != "${APPLICATION_ROOT}" ]]; then
        echo "Refusing to update a release pointer outside the application root." >&2
        return 1
    fi

    ln -s -- "${target}" "${temporary}"
    mv -Tf -- "${temporary}" "${link}"
}

verify_local_release() {
    local expected_digest header_file observed_release health_state
    header_file="$(mktemp)"
    expected_digest="$(printf '%s' "${EXPECTED_RELEASE}" | sha256sum | awk '{print substr($1, 1, 16)}')"

    if ! curl --fail --silent --show-error \
        --connect-timeout 3 \
        --max-time 10 \
        --header 'Cache-Control: no-cache' \
        --dump-header "${header_file}" \
        --output /dev/null \
        "${LOCAL_READINESS_URL}?node-rollout=${BASHPID}"; then
        rm -f -- "${header_file}"
        return 1
    fi

    observed_release="$(awk 'tolower($1) == "x-ubsc-release:" {gsub("\\r", "", $2); print $2; exit}' "${header_file}")"
    health_state="$(awk 'tolower($1) == "x-ubsc-health-state:" {gsub("\\r", "", $2); print tolower($2); exit}' "${header_file}")"
    rm -f -- "${header_file}"

    [[ "${observed_release}" == "${expected_digest}" && "${health_state}" == 'ready' ]]
}

SWITCHED=false
DRAINED=false

rollback() {
    local original_status="${1:-1}"
    trap - ERR INT TERM
    set +e

    if [[ "${SWITCHED}" == true ]]; then
        local rollback_healthy=true
        echo "Activation failed; restoring the previous application release without reversing database migrations." >&2
        atomic_link "${OLD_RELEASE}" "${CURRENT_LINK}" || rollback_healthy=false
        cd "${CURRENT_LINK}" || rollback_healthy=false
        if [[ "${rollback_healthy}" == true ]]; then
            run_bounded "${PHP_BINARY}" artisan config:clear --no-interaction || rollback_healthy=false
            run_bounded "${PHP_BINARY}" artisan optimize --no-interaction || rollback_healthy=false
            run_bounded bash "${SCRIPT_DIRECTORY}/reload-process-supervision.sh" "${CURRENT_LINK}" || rollback_healthy=false
            run_bounded "${PHP_BINARY}" artisan queue:restart --no-interaction || rollback_healthy=false
        fi

        if [[ "${rollback_healthy}" == true ]] && curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
            --output /dev/null "${LOCAL_READINESS_URL}?rollback=${BASHPID}"; then
            if [[ "${DRAINED}" == true ]]; then
                run_bounded "${UNDRAIN_HOOK}" "${INSTANCE_ID}" "$(basename -- "${OLD_RELEASE}")"
            fi
            echo "Previous release was restored and returned to service." >&2
        else
            echo "Rollback health verification failed; this node remains drained for operator recovery." >&2
        fi
    elif [[ "${DRAINED}" == true ]]; then
        run_bounded "${UNDRAIN_HOOK}" "${INSTANCE_ID}" "$(basename -- "${OLD_RELEASE}")"
    fi

    exit "${original_status}"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT TERM

echo "[1/7] Verifying the immutable candidate and host runtime"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-node-runtime.sh" "${CANDIDATE_RELEASE}"

echo "[2/7] Revalidating the candidate deployment contract"
cd "${CANDIDATE_RELEASE}"
run_bounded "${PHP_BINARY}" artisan config:clear --no-interaction
run_bounded "${PHP_BINARY}" artisan production:deployment-check --strict --no-interaction
run_bounded "${PHP_BINARY}" artisan production:ddos-check --strict --no-interaction

echo "[3/7] Draining this exact node through the provider adapter"
run_bounded "${DRAIN_HOOK}" "${INSTANCE_ID}" "${EXPECTED_RELEASE}"
DRAINED=true

echo "[4/7] Switching the node atomically to the candidate"
atomic_link "${CANDIDATE_RELEASE}" "${CURRENT_LINK}"
SWITCHED=true

echo "[5/7] Activating and verifying the candidate release"
run_bounded bash "${SCRIPT_DIRECTORY}/activate-release.sh" "${CURRENT_LINK}"
verify_local_release

echo "[6/7] Recording the bounded application rollback pointer"
atomic_link "${OLD_RELEASE}" "${PREVIOUS_LINK}"

echo "[7/7] Returning the healthy node to the managed load balancer"
run_bounded "${UNDRAIN_HOOK}" "${INSTANCE_ID}" "${EXPECTED_RELEASE}"
DRAINED=false
SWITCHED=false

trap - ERR INT TERM
echo "Atomic node rollout completed. Run the fleet-wide production readiness gate only after every node converges."
