#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

APPLICATION_ROOT="${1:-}"
CANDIDATE_RELEASE="${2:-}"
EXPECTED_RELEASE="${3:-}"
SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PHP_BINARY="${PHP_BINARY:-php}"

if [[ -z "${APPLICATION_ROOT}" || -z "${CANDIDATE_RELEASE}" || -z "${EXPECTED_RELEASE}" \
    || ! -f "${CANDIDATE_RELEASE}/artisan" ]]; then
    echo "Usage: activate-production-topology.sh /srv/ubsc /srv/ubsc/releases/release-id immutable-release-id" >&2
    exit 64
fi

TOPOLOGY="$(cd -- "${CANDIDATE_RELEASE}" && "${PHP_BINARY}" artisan production:topology --no-interaction)"
case "${TOPOLOGY}" in
    single_node)
        exec bash "${SCRIPT_DIRECTORY}/atomic-single-node-rollout.sh" \
            "${APPLICATION_ROOT}" "${CANDIDATE_RELEASE}" "${EXPECTED_RELEASE}"
        ;;
    multi_node)
        exec bash "${SCRIPT_DIRECTORY}/atomic-node-rollout.sh" \
            "${APPLICATION_ROOT}" "${CANDIDATE_RELEASE}" "${EXPECTED_RELEASE}"
        ;;
    *)
        echo "Unsupported production topology: ${TOPOLOGY:-unresolved}" >&2
        exit 78
        ;;
esac
