#!/usr/bin/env bash
set -Eeuo pipefail

PUBLIC_ORIGIN="${1:-}"
CERTIFICATE_MIN_VALIDITY_SECONDS="${EDGE_CERTIFICATE_MIN_VALIDITY_SECONDS:-1209600}"
TIMEOUT_BINARY="${TIMEOUT_BINARY:-timeout}"

if [[ ! "${PUBLIC_ORIGIN}" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$ ]]; then
    echo "Usage: verify-edge-security.sh https://production-origin" >&2
    exit 64
fi

if ! [[ "${CERTIFICATE_MIN_VALIDITY_SECONDS}" =~ ^[0-9]+$ ]] \
    || (( CERTIFICATE_MIN_VALIDITY_SECONDS < 86400 || CERTIFICATE_MIN_VALIDITY_SECONDS > 7776000 )); then
    echo "EDGE_CERTIFICATE_MIN_VALIDITY_SECONDS must be between one and ninety days." >&2
    exit 64
fi

for binary in curl openssl awk grep mktemp rm "${TIMEOUT_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required edge-verification binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

PUBLIC_ORIGIN="${PUBLIC_ORIGIN%/}"
AUTHORITY="${PUBLIC_ORIGIN#https://}"
HOST="${AUTHORITY%%:*}"
PORT="443"
if [[ "${AUTHORITY}" == *:* ]]; then
    PORT="${AUTHORITY##*:}"
fi

HEADER_FILE="$(mktemp)"
HEALTH_HEADER_FILE="$(mktemp)"
HTTP_HEADER_FILE="$(mktemp)"
CERTIFICATE_FILE="$(mktemp)"
trap 'rm -f -- "${HEADER_FILE}" "${HEALTH_HEADER_FILE}" "${HTTP_HEADER_FILE}" "${CERTIFICATE_FILE}"' EXIT

header_value() {
    local file="$1"
    local name="$2"
    awk -v wanted="${name}" '
        {
            separator = index($0, ":")
            if (separator > 0 && tolower(substr($0, 1, separator - 1)) == tolower(wanted)) {
                value = substr($0, separator + 1)
                sub("^[[:space:]]*", "", value)
                sub("\\r$", "", value)
            }
        }
        END { print value }
    ' "${file}"
}

curl --fail --silent --show-error \
    --proto '=https' \
    --tlsv1.2 \
    --connect-timeout 4 \
    --max-time 12 \
    --dump-header "${HEADER_FILE}" \
    --output /dev/null \
    "${PUBLIC_ORIGIN}/"

HSTS="$(header_value "${HEADER_FILE}" 'strict-transport-security')"
CSP="$(header_value "${HEADER_FILE}" 'content-security-policy')"
CONTENT_TYPE_OPTIONS="$(header_value "${HEADER_FILE}" 'x-content-type-options')"
FRAME_OPTIONS="$(header_value "${HEADER_FILE}" 'x-frame-options')"
REFERRER_POLICY="$(header_value "${HEADER_FILE}" 'referrer-policy')"
PERMISSIONS_POLICY="$(header_value "${HEADER_FILE}" 'permissions-policy')"
ROOT_CACHE="$(header_value "${HEADER_FILE}" 'cache-control')"

if [[ ! "${HSTS}" =~ [Mm][Aa][Xx]-[Aa][Gg][Ee]=([0-9]+) ]] \
    || (( BASH_REMATCH[1] < 31536000 )); then
    echo "Edge verification failed: HSTS must retain HTTPS for at least one year." >&2
    exit 1
fi

if [[ "${CSP}" != *"default-src 'self'"* || "${CSP}" != *"object-src 'none'"* ]]; then
    echo "Edge verification failed: the application Content-Security-Policy is missing or weakened." >&2
    exit 1
fi

if [[ "${CONTENT_TYPE_OPTIONS,,}" != 'nosniff' \
    || "${FRAME_OPTIONS^^}" != 'DENY' \
    || "${REFERRER_POLICY,,}" != 'strict-origin-when-cross-origin' \
    || -z "${PERMISSIONS_POLICY}" ]]; then
    echo "Edge verification failed: one or more browser security headers are missing." >&2
    exit 1
fi

if [[ "${ROOT_CACHE,,}" != *'no-store'* || "${ROOT_CACHE,,}" == *'public'* ]]; then
    echo "Edge verification failed: personalized HTML or its CSP nonce may be shared by the CDN cache." >&2
    exit 1
fi

curl --fail --silent --show-error \
    --proto '=https' \
    --tlsv1.2 \
    --connect-timeout 4 \
    --max-time 12 \
    --header 'Cache-Control: no-cache' \
    --dump-header "${HEALTH_HEADER_FILE}" \
    --output /dev/null \
    "${PUBLIC_ORIGIN}/health/ready?edge-acceptance=1"

HEALTH_KIND="$(header_value "${HEALTH_HEADER_FILE}" 'x-ubsc-health')"
HEALTH_STATE="$(header_value "${HEALTH_HEADER_FILE}" 'x-ubsc-health-state')"
HEALTH_CACHE="$(header_value "${HEALTH_HEADER_FILE}" 'cache-control')"
if [[ "${HEALTH_KIND,,}" != 'readiness' \
    || "${HEALTH_STATE,,}" != 'ready' \
    || "${HEALTH_CACHE,,}" != *'no-store'* ]]; then
    echo "Edge verification failed: readiness is cached, degraded, or not routed to the application." >&2
    exit 1
fi

HTTP_STATUS="$(curl --silent --show-error \
    --proto '=http' \
    --connect-timeout 4 \
    --max-time 12 \
    --max-redirs 0 \
    --dump-header "${HTTP_HEADER_FILE}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "http://${AUTHORITY}/")"
HTTP_LOCATION="$(header_value "${HTTP_HEADER_FILE}" 'location')"
if [[ ! "${HTTP_STATUS}" =~ ^(301|308)$ \
    || ( "${HTTP_LOCATION}" != "${PUBLIC_ORIGIN}" && "${HTTP_LOCATION}" != "${PUBLIC_ORIGIN}/" ) ]]; then
    echo "Edge verification failed: plaintext HTTP does not redirect directly to the canonical HTTPS origin." >&2
    exit 1
fi

"${TIMEOUT_BINARY}" --signal=TERM --kill-after=2s 12s \
    openssl s_client -connect "${HOST}:${PORT}" -servername "${HOST}" </dev/null 2>/dev/null \
    | openssl x509 -outform PEM > "${CERTIFICATE_FILE}"

if [[ ! -s "${CERTIFICATE_FILE}" ]] \
    || ! openssl x509 -in "${CERTIFICATE_FILE}" -checkend "${CERTIFICATE_MIN_VALIDITY_SECONDS}" -noout >/dev/null; then
    echo "Edge verification failed: the public certificate is invalid or too close to expiry." >&2
    exit 1
fi

echo "Edge verification passed: canonical HTTPS, certificate lifetime, readiness routing, cache policy, and browser security headers are healthy."
