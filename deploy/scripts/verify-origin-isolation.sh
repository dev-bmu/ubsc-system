#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PUBLIC_ORIGIN="${1:-}"
ORIGIN_IP_FILE="${2:-}"
ORIGIN_PORTS="${3:-80,443,8443}"
PHP_BINARY="${PHP_BINARY:-php}"

if [[ ! "${PUBLIC_ORIGIN}" =~ ^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?/?$ ]] \
    || [[ ! -f "${ORIGIN_IP_FILE}" || -L "${ORIGIN_IP_FILE}" ]]; then
    echo "Usage: verify-origin-isolation.sh https://production-origin protected-origin-ips.txt [80,443,8443]" >&2
    exit 64
fi

for binary in curl awk stat "${PHP_BINARY}"; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required origin-isolation binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

ORIGIN_FILE_SIZE="$(stat -c '%s' -- "${ORIGIN_IP_FILE}")"
if ! [[ "${ORIGIN_FILE_SIZE}" =~ ^[0-9]+$ ]] \
    || (( ORIGIN_FILE_SIZE < 2 || ORIGIN_FILE_SIZE > 4096 )); then
    echo "Origin isolation input must be between 2 and 4096 bytes." >&2
    exit 65
fi

HOST="${PUBLIC_ORIGIN#https://}"
HOST="${HOST%/}"
count=0
IFS=',' read -r -a requested_ports <<<"${ORIGIN_PORTS}"
ports=()

if (( ${#requested_ports[@]} == 0 || ${#requested_ports[@]} > 3 )); then
    echo "Origin isolation requires one to three bounded ingress ports." >&2
    exit 65
fi

for requested_port in "${requested_ports[@]}"; do
    requested_port="$(printf '%s' "${requested_port}" | awk '{$1=$1};1')"
    if [[ ! "${requested_port}" =~ ^[0-9]+$ ]] \
        || (( requested_port < 1 || requested_port > 65535 )); then
        echo "Origin isolation contains an invalid port." >&2
        exit 65
    fi

    for existing_port in "${ports[@]}"; do
        if [[ "${existing_port}" == "${requested_port}" ]]; then
            echo "Origin isolation ports must be unique." >&2
            exit 65
        fi
    done
    ports+=("${requested_port}")
done

while IFS= read -r candidate || [[ -n "${candidate}" ]]; do
    candidate="${candidate%%#*}"
    candidate="$(printf '%s' "${candidate}" | awk '{$1=$1};1')"
    [[ -z "${candidate}" ]] && continue

    if ! "${PHP_BINARY}" -r \
        'exit(filter_var($argv[1], FILTER_VALIDATE_IP) === false ? 1 : 0);' \
        "${candidate}"; then
        echo "Origin isolation input contains a non-IP value." >&2
        exit 65
    fi

    count=$((count + 1))
    if (( count > 16 )); then
        echo "Origin isolation refuses more than sixteen bounded targets." >&2
        exit 65
    fi

    resolve_address="${candidate}"
    if [[ "${candidate}" == *:* ]]; then
        resolve_address="[${candidate}]"
    fi

    for port in "${ports[@]}"; do
        # Certificate validation is intentionally disabled for this negative
        # bypass probe. A reachable origin with a mismatched/self-signed
        # certificate is still publicly reachable and must fail isolation.
        result="$(curl --silent --insecure \
            --proto '=https' \
            --tlsv1.2 \
            --connect-timeout 2 \
            --max-time 5 \
            --output /dev/null \
            --write-out '%{http_code}|%{remote_ip}' \
            --resolve "${HOST}:${port}:${resolve_address}" \
            "https://${HOST}:${port}/" 2>/dev/null || true)"
        status="${result%%|*}"
        remote_ip="${result#*|}"

        # A 403/421 still proves that public traffic reached origin resources.
        # Strict DDoS isolation requires the external TCP/TLS path itself to
        # be unreachable, not merely rejected by Laravel or Nginx.
        if [[ "${status}" != '000' || -n "${remote_ip}" ]]; then
            echo "Origin isolation failed: a protected origin port is publicly reachable." >&2
            exit 1
        fi
    done
done <"${ORIGIN_IP_FILE}"

if (( count == 0 )); then
    echo "Origin isolation requires at least one protected origin address." >&2
    exit 65
fi

echo "Origin isolation passed for ${count} protected target(s) across ${#ports[@]} port(s); no public origin connection was established."
