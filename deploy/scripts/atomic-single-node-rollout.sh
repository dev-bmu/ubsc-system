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
RUNTIME_RELOAD_HOOK="${SINGLE_NODE_RUNTIME_RELOAD_HOOK:-}"

usage() {
    echo "Usage: atomic-single-node-rollout.sh /srv/ubsc /srv/ubsc/releases/release-id immutable-release-id" >&2
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
    [[ "${value}" =~ ^[0-9]+$ ]] || { echo "Deployment timeouts must be integer seconds." >&2; exit 64; }
done
if (( LOCK_TIMEOUT_SECONDS < 300 || LOCK_TIMEOUT_SECONDS > 7200 \
    || COMMAND_TIMEOUT_SECONDS < 300 || COMMAND_TIMEOUT_SECONDS > LOCK_TIMEOUT_SECONDS )); then
    echo "Deployment lock/command timeout contract is invalid." >&2
    exit 64
fi
for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}" bash curl flock realpath ln mv awk sha256sum mktemp rm; do
    command -v "${binary}" >/dev/null 2>&1 || { echo "Required rollout binary is unavailable: ${binary}" >&2; exit 69; }
done
if [[ -z "${RUNTIME_RELOAD_HOOK}" || "${RUNTIME_RELOAD_HOOK}" != /* \
    || ! -f "${RUNTIME_RELOAD_HOOK}" || ! -x "${RUNTIME_RELOAD_HOOK}" \
    || -L "${RUNTIME_RELOAD_HOOK}" ]]; then
    echo "SINGLE_NODE_RUNTIME_RELOAD_HOOK must be an absolute executable non-symlink adapter." >&2
    exit 78
fi

APPLICATION_ROOT="$(realpath -e -- "${APPLICATION_ROOT}")"
CANDIDATE_RELEASE="$(realpath -e -- "${CANDIDATE_RELEASE}")"
RELEASES_ROOT="$(realpath -e -- "${APPLICATION_ROOT}/releases")"
CURRENT_LINK="${APPLICATION_ROOT}/current"
PREVIOUS_LINK="${APPLICATION_ROOT}/previous"
SHARED_ENV="$(realpath -e -- "${APPLICATION_ROOT}/shared/.env")"
SHARED_STORAGE="$(realpath -e -- "${APPLICATION_ROOT}/shared/storage")"

if [[ "$(dirname -- "${CANDIDATE_RELEASE}")" != "${RELEASES_ROOT}" \
    || "$(basename -- "${CANDIDATE_RELEASE}")" != "${EXPECTED_RELEASE}" \
    || ! -f "${CANDIDATE_RELEASE}/artisan" \
    || ! -f "${CANDIDATE_RELEASE}/composer.json" ]]; then
    echo "The candidate must be the exact named direct child of the bounded releases directory." >&2
    exit 64
fi
if [[ ! -L "${CANDIDATE_RELEASE}/.env" \
    || "$(realpath -e -- "${CANDIDATE_RELEASE}/.env")" != "${SHARED_ENV}" \
    || ! -L "${CANDIDATE_RELEASE}/storage" \
    || "$(realpath -e -- "${CANDIDATE_RELEASE}/storage")" != "${SHARED_STORAGE}" ]]; then
    echo "Candidate .env and storage must be symlinks to the exact shared resources." >&2
    exit 78
fi
if [[ ! -L "${CURRENT_LINK}" ]]; then
    echo "The current pointer must exist; bootstrap the first release through the documented first-install procedure." >&2
    exit 64
fi
OLD_RELEASE="$(realpath -e -- "${CURRENT_LINK}")"
if [[ "$(dirname -- "${OLD_RELEASE}")" != "${RELEASES_ROOT}" || "${OLD_RELEASE}" == "${CANDIDATE_RELEASE}" ]]; then
    echo "The current release pointer is unsafe or already targets the candidate." >&2
    exit 65
fi

exec 9>"${APPLICATION_ROOT}/.deployment.lock"
flock --exclusive --timeout "${LOCK_TIMEOUT_SECONDS}" 9 || { echo "Another deployment owns the rollout lease." >&2; exit 75; }

run_bounded() {
    "${TIMEOUT_BINARY}" --signal=TERM --kill-after=10s "${COMMAND_TIMEOUT_SECONDS}s" "$@"
}
atomic_link() {
    local target="$1" link="$2" temporary="${2}.next.${BASHPID}"
    [[ "$(dirname -- "${link}")" == "${APPLICATION_ROOT}" ]] || return 1
    ln -s -- "${target}" "${temporary}"
    mv -Tf -- "${temporary}" "${link}"
}
verify_local_release() {
    local expected_release="${1}" headers expected_digest observed_release health_state
    headers="$(mktemp)"
    expected_digest="$(printf '%s' "${expected_release}" | sha256sum | awk '{print substr($1,1,16)}')"
    if ! curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
        --header 'Cache-Control: no-cache' --dump-header "${headers}" --output /dev/null \
        "${LOCAL_READINESS_URL}?single-rollout=${BASHPID}"; then
        rm -f -- "${headers}"
        return 1
    fi
    observed_release="$(awk 'tolower($1)=="x-ubsc-release:" {gsub("\\r","",$2); print $2; exit}' "${headers}")"
    health_state="$(awk 'tolower($1)=="x-ubsc-health-state:" {gsub("\\r","",$2); print tolower($2); exit}' "${headers}")"
    rm -f -- "${headers}"
    [[ "${observed_release}" == "${expected_digest}" \
        && "${health_state}" == 'ready' ]]
}

SWITCHED=false
rollback() {
    local status="${1:-1}" rollback_ok=true
    trap - ERR INT TERM
    set +e
    if [[ "${SWITCHED}" == true ]]; then
        echo "Activation failed; restoring the previous application release without reversing database migrations." >&2
        atomic_link "${OLD_RELEASE}" "${CURRENT_LINK}" || rollback_ok=false
        run_bounded "${RUNTIME_RELOAD_HOOK}" "${OLD_RELEASE}" || rollback_ok=false
        cd "${CURRENT_LINK}" || rollback_ok=false
        run_bounded "${PHP_BINARY}" artisan optimize --no-interaction || rollback_ok=false
        run_bounded bash "${SCRIPT_DIRECTORY}/reload-process-supervision.sh" "${CURRENT_LINK}" || rollback_ok=false
        run_bounded "${PHP_BINARY}" artisan queue:restart --no-interaction || rollback_ok=false
        verify_local_release "$(basename -- "${OLD_RELEASE}")" >/dev/null 2>&1 || rollback_ok=false
        [[ "${rollback_ok}" == true ]] \
            && echo "Previous release was restored." >&2 \
            || echo "Rollback health verification failed; keep the origin isolated and follow the incident runbook." >&2
    fi
    exit "${status}"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT TERM

echo "[1/7] Verifying candidate runtime, topology, and immutable artifacts"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-node-runtime.sh" "${CANDIDATE_RELEASE}"

echo "[2/7] Preparing schema, dependencies, storage, and recovery before traffic switch"
run_bounded bash "${SCRIPT_DIRECTORY}/prepare-single-node-release.sh" "${CANDIDATE_RELEASE}"

echo "[3/7] Switching current atomically to the prepared candidate"
atomic_link "${CANDIDATE_RELEASE}" "${CURRENT_LINK}"
SWITCHED=true

echo "[4/7] Reloading PHP runtime through the least-privilege adapter"
run_bounded "${RUNTIME_RELOAD_HOOK}" "${CANDIDATE_RELEASE}"

echo "[5/7] Activating and proving the switched candidate"
run_bounded bash "${SCRIPT_DIRECTORY}/activate-single-node-release.sh" "${CURRENT_LINK}"
verify_local_release "${EXPECTED_RELEASE}"

echo "[6/7] Recording the bounded application rollback pointer"
atomic_link "${OLD_RELEASE}" "${PREVIOUS_LINK}"

echo "[7/7] Running final single-node readiness verification"
run_bounded bash "${SCRIPT_DIRECTORY}/verify-single-node-readiness.sh" "${CURRENT_LINK}"

SWITCHED=false
trap - ERR INT TERM
echo "Atomic single-node rollout completed with a healthy release and an intact rollback pointer."
