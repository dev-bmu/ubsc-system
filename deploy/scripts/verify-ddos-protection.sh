#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIRECTORY="${1:-}"
PUBLIC_ORIGIN="${2:-}"
PHP_BINARY="${PHP_BINARY:-php}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"
BOOTSTRAP_TIMEOUT_SECONDS="${DDOS_PROVIDER_VERIFY_TIMEOUT_SECONDS:-30}"
SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

if [[ -z "${APP_DIRECTORY}" || -z "${PUBLIC_ORIGIN}" ]]; then
    echo "Usage: verify-ddos-protection.sh APP_DIRECTORY https://production-origin" >&2
    exit 64
fi

if [[ ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "The application directory is not a Laravel release." >&2
    exit 64
fi

if ! APP_DIRECTORY="$(cd -- "${APP_DIRECTORY}" && pwd -P)"; then
    echo "The application directory cannot be resolved." >&2
    exit 64
fi

if [[ ! "${PUBLIC_ORIGIN}" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$ ]]; then
    echo "The public origin must be one canonical HTTPS authority." >&2
    exit 64
fi
PUBLIC_ORIGIN="${PUBLIC_ORIGIN%/}"

if ! [[ "${BOOTSTRAP_TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( BOOTSTRAP_TIMEOUT_SECONDS < 5 || BOOTSTRAP_TIMEOUT_SECONDS > 120 )); then
    echo "DDOS_PROVIDER_VERIFY_TIMEOUT_SECONDS must be between 5 and 120." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" "${TIMEOUT_BINARY}" curl awk stat mktemp rm head; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required DDoS verifier binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

EVIDENCE_FILE="$(mktemp)"
HEADER_FILE="$(mktemp)"
CONFIG_FILE="$(mktemp)"
CONFIG_VALUES_FILE="$(mktemp)"
cleanup() {
    rm -f -- "${EVIDENCE_FILE}" "${HEADER_FILE}" "${CONFIG_FILE}" "${CONFIG_VALUES_FILE}"
}
trap cleanup EXIT INT TERM

cd "${APP_DIRECTORY}"
"${TIMEOUT_BINARY}" --signal=TERM --kill-after=5s "${BOOTSTRAP_TIMEOUT_SECONDS}s" \
    "${PHP_BINARY}" artisan production:ddos-check \
        --strict --verification-config --no-interaction \
    | head -c 4097 >"${CONFIG_FILE}"

"${PHP_BINARY}" "${SCRIPT_DIRECTORY}/read-ddos-verification-config.php" \
    "${CONFIG_FILE}" >"${CONFIG_VALUES_FILE}"
mapfile -t CONFIG_VALUES <"${CONFIG_VALUES_FILE}"
if (( ${#CONFIG_VALUES[@]} != 6 )); then
    echo "The application emitted an incomplete DDoS verifier configuration." >&2
    exit 78
fi
EDGE_PROVIDER="${CONFIG_VALUES[0]}"
PROVIDER_HOOK="${CONFIG_VALUES[1]}"
CONFIGURED_PUBLIC_ORIGIN="${CONFIG_VALUES[2]}"
PROVIDER_ZONE_FINGERPRINT="${CONFIG_VALUES[3]}"
EDGE_RESPONSE_HEADER="${CONFIG_VALUES[4]}"
VERIFY_TIMEOUT_SECONDS="${CONFIG_VALUES[5]}"
if [[ "${PUBLIC_ORIGIN}" != "${CONFIGURED_PUBLIC_ORIGIN}" ]]; then
    echo "The requested public origin does not match the application's canonical production origin." >&2
    exit 78
fi
CHALLENGE="$("${PHP_BINARY}" -r 'echo bin2hex(random_bytes(32));')"
if [[ ! "${CHALLENGE}" =~ ^[a-f0-9]{64}$ ]]; then
    echo "A fresh provider verification challenge could not be generated." >&2
    exit 70
fi

if [[ ! -f "${PROVIDER_HOOK}" || ! -x "${PROVIDER_HOOK}" || -L "${PROVIDER_HOOK}" ]]; then
    echo "The DDoS provider verifier must be an executable regular non-symlink adapter." >&2
    exit 78
fi

HOOK_OWNER="$(stat -c '%u' -- "${PROVIDER_HOOK}")"
HOOK_MODE="$(stat -c '%a' -- "${PROVIDER_HOOK}")"
HOOK_DIRECTORY='/usr/local/libexec'
if [[ ! -d "${HOOK_DIRECTORY}" || -L "${HOOK_DIRECTORY}" ]]; then
    echo "The provider adapter directory must be a real local directory." >&2
    exit 78
fi
HOOK_DIRECTORY_OWNER="$(stat -c '%u' -- "${HOOK_DIRECTORY}")"
HOOK_DIRECTORY_MODE="$(stat -c '%a' -- "${HOOK_DIRECTORY}")"
if ! [[ "${HOOK_MODE}" =~ ^[0-7]{3,4}$ ]]; then
    echo "The provider adapter has an unreadable permission mode." >&2
    exit 78
fi
if ! [[ "${HOOK_DIRECTORY_MODE}" =~ ^[0-7]{3,4}$ ]]; then
    echo "The provider adapter directory has an unreadable permission mode." >&2
    exit 78
fi
HOOK_MODE_DECIMAL=$((8#${HOOK_MODE}))
HOOK_DIRECTORY_MODE_DECIMAL=$((8#${HOOK_DIRECTORY_MODE}))
if [[ "${HOOK_OWNER}" != '0' ]] \
    || (( (HOOK_MODE_DECIMAL & 8#7027) != 0 )); then
    echo "The provider adapter must be root-owned without special, group-write, or any other-user bits." >&2
    exit 78
fi
if [[ "${HOOK_DIRECTORY_OWNER}" != '0' ]] \
    || (( (HOOK_DIRECTORY_MODE_DECIMAL & 8#7022) != 0 )); then
    echo "The provider adapter directory must be root-owned and not writable by group or other users." >&2
    exit 78
fi

if ! "${TIMEOUT_BINARY}" --signal=TERM --kill-after=5s "${VERIFY_TIMEOUT_SECONDS}s" \
    "${PROVIDER_HOOK}" \
        --origin "${PUBLIC_ORIGIN}" \
        --provider "${EDGE_PROVIDER}" \
        --challenge "${CHALLENGE}" 2>/dev/null \
    | head -c 65537 >"${EVIDENCE_FILE}"; then
    # Provider adapters must never leak request URLs, account identifiers, or
    # credentials into release logs. Their detailed diagnostics belong in the
    # provider's protected audit sink, not stdout/stderr here.
    echo "The managed-edge provider verification failed." >&2
    exit 1
fi

"${PHP_BINARY}" "${SCRIPT_DIRECTORY}/validate-ddos-provider-evidence.php" \
    "${EVIDENCE_FILE}" "${EDGE_PROVIDER}" "${CHALLENGE}" \
    "${PUBLIC_ORIGIN}" "${PROVIDER_ZONE_FINGERPRINT}"

curl --fail --silent --show-error \
    --proto '=https' \
    --tlsv1.2 \
    --connect-timeout 5 \
    --max-time 15 \
    --header 'Cache-Control: no-cache' \
    --dump-header "${HEADER_FILE}" \
    --output /dev/null \
    "${PUBLIC_ORIGIN}/"

EDGE_MARKER="$(awk -v target="${EDGE_RESPONSE_HEADER}" '
    tolower($1) == target ":" {
        sub(/^[^:]+:[[:space:]]*/, "");
        gsub("\r", "");
        print;
        exit;
    }
' "${HEADER_FILE}")"
if [[ ! "${EDGE_MARKER}" =~ ^[A-Za-z0-9._:-]{6,512}$ ]]; then
    echo "The public response does not contain the configured managed-edge marker." >&2
    exit 1
fi

echo "DDoS readiness passed: declarations, fresh provider API evidence, and the public edge marker agree."
