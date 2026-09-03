#!/usr/bin/env bash
set -Eeuo pipefail

PUBLIC_ORIGIN="${1:-}"
EXPECTED_NODES="${2:-2}"
EXPECTED_RELEASE="${3:-}"
SAMPLES="${4:-}"

if [[ ! "${PUBLIC_ORIGIN}" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$ ]]; then
    echo "Usage: verify-load-balancer.sh https://production-origin expected-nodes expected-release [samples]" >&2
    exit 64
fi

if ! [[ "${EXPECTED_NODES}" =~ ^[0-9]+$ ]] \
    || (( EXPECTED_NODES < 2 || EXPECTED_NODES > 1000 )); then
    echo "expected-nodes must be an integer between 2 and 1000." >&2
    exit 64
fi

if (( EXPECTED_NODES <= 12 )); then
    REQUIRED_DISTINCT="${EXPECTED_NODES}"
else
    REQUIRED_DISTINCT=2
    while (( REQUIRED_DISTINCT * REQUIRED_DISTINCT < EXPECTED_NODES )); do
        ((REQUIRED_DISTINCT += 1))
    done
fi

MINIMUM_SAMPLES=$((REQUIRED_DISTINCT * 3))
if [[ -z "${SAMPLES}" ]]; then
    SAMPLES=$((REQUIRED_DISTINCT * 6))
    (( SAMPLES < 24 )) && SAMPLES=24
    (( SAMPLES > 600 )) && SAMPLES=600
fi

if ! [[ "${SAMPLES}" =~ ^[0-9]+$ ]] \
    || (( SAMPLES < MINIMUM_SAMPLES || SAMPLES > 600 )); then
    echo "samples must be between ${MINIMUM_SAMPLES} and 600 for this inventory size." >&2
    exit 64
fi

if ! [[ "${EXPECTED_RELEASE}" =~ ^[a-zA-Z0-9][a-zA-Z0-9._:-]{6,127}$ ]] \
    || [[ "${EXPECTED_RELEASE}" =~ [Rr][Ee][Pp][Ll][Aa][Cc][Ee]|[Ee][Xx][Aa][Mm][Pp][Ll][Ee]|[Uu][Nn][Kk][Nn][Oo][Ww][Nn]|[Ll][Aa][Tt][Ee][Ss][Tt]|[Pp][Ll][Aa][Cc][Ee][Hh][Oo][Ll][Dd][Ee][Rr] ]]; then
    echo "expected-release must be the exact non-placeholder immutable APP_RELEASE value." >&2
    exit 64
fi

for binary in curl awk sha256sum mktemp rm; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required load-balancer verification binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

EXPECTED_RELEASE_DIGEST="$(printf '%s' "${EXPECTED_RELEASE}" | sha256sum | awk '{print substr($1, 1, 16)}')"
if ! [[ "${EXPECTED_RELEASE_DIGEST}" =~ ^[a-f0-9]{16}$ ]]; then
    echo "The expected release identity could not be derived safely." >&2
    exit 70
fi

HEADER_FILE="$(mktemp)"
trap 'rm -f -- "${HEADER_FILE}"' EXIT
declare -A SEEN_INSTANCES=()
declare -A SEEN_RELEASES=()

for ((sample = 1; sample <= SAMPLES; sample++)); do
    : > "${HEADER_FILE}"
    curl --fail --silent --show-error \
        --connect-timeout 3 \
        --max-time 8 \
        --header 'Cache-Control: no-cache' \
        --header 'Pragma: no-cache' \
        --dump-header "${HEADER_FILE}" \
        --output /dev/null \
        "${PUBLIC_ORIGIN%/}/health/ready?lb-acceptance=${sample}"

    INSTANCE="$(awk 'tolower($1) == "x-ubsc-instance:" {gsub("\\r", "", $2); print $2; exit}' "${HEADER_FILE}")"
    if ! [[ "${INSTANCE}" =~ ^[a-f0-9]{16}$ ]]; then
        echo "Readiness did not return a valid opaque node identity." >&2
        exit 1
    fi

    SEEN_INSTANCES["${INSTANCE}"]=1

    RELEASE="$(awk 'tolower($1) == "x-ubsc-release:" {gsub("\\r", "", $2); print $2; exit}' "${HEADER_FILE}")"
    if ! [[ "${RELEASE}" =~ ^[a-f0-9]{16}$ ]]; then
        echo "Readiness did not return a valid opaque release identity." >&2
        exit 1
    fi

    if [[ "${RELEASE}" != "${EXPECTED_RELEASE_DIGEST}" ]]; then
        echo "Load-balancer acceptance failed: a healthy node is not serving the expected release." >&2
        exit 1
    fi

    SEEN_RELEASES["${RELEASE}"]=1
done

if (( ${#SEEN_INSTANCES[@]} < REQUIRED_DISTINCT )); then
    echo "Load-balancer acceptance failed: public traffic reached only ${#SEEN_INSTANCES[@]} distinct nodes; at least ${REQUIRED_DISTINCT} are required by this sample." >&2
    exit 1
fi

if (( ${#SEEN_INSTANCES[@]} > EXPECTED_NODES )); then
    echo "Load-balancer acceptance failed: public traffic exposed more nodes than the signed provider inventory." >&2
    exit 1
fi

if (( ${#SEEN_RELEASES[@]} != 1 )); then
    echo "Load-balancer acceptance failed: healthy nodes are serving different releases." >&2
    exit 1
fi

echo "Load-balancer acceptance passed: signed inventory confirms ${EXPECTED_NODES} ready nodes and public traffic independently reached ${#SEEN_INSTANCES[@]} distinct nodes on the expected release."
