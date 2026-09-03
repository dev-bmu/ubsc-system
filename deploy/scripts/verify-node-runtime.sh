#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIRECTORY="${1:-}"
PHP_BINARY="${PHP_BINARY:-php}"
MINIMUM_DISK_FREE_PERCENT="${DEPLOYMENT_MINIMUM_DISK_FREE_PERCENT:-15}"

if [[ -z "${APP_DIRECTORY}" || ! -f "${APP_DIRECTORY}/artisan" || ! -f "${APP_DIRECTORY}/composer.json" ]]; then
    echo "Usage: verify-node-runtime.sh /absolute/release/path" >&2
    exit 64
fi

if ! APP_DIRECTORY="$(cd -- "${APP_DIRECTORY}" && pwd -P)"; then
    echo "The candidate release directory cannot be resolved." >&2
    exit 64
fi

if [[ "$(id -u)" == '0' ]]; then
    echo "Refusing node verification as root; deploy through the dedicated unprivileged release account." >&2
    exit 77
fi

if ! [[ "${MINIMUM_DISK_FREE_PERCENT}" =~ ^[0-9]+$ ]] \
    || (( MINIMUM_DISK_FREE_PERCENT < 5 || MINIMUM_DISK_FREE_PERCENT > 50 )); then
    echo "DEPLOYMENT_MINIMUM_DISK_FREE_PERCENT must be between 5 and 50." >&2
    exit 64
fi

for binary in "${PHP_BINARY}" curl flock realpath stat df awk grep; do
    if ! command -v "${binary}" >/dev/null 2>&1; then
        echo "Required node-runtime binary is unavailable: ${binary}" >&2
        exit 69
    fi
done

if ! "${PHP_BINARY}" -r 'exit(PHP_VERSION_ID >= 80200 ? 0 : 1);'; then
    echo "PHP 8.2 or newer is required." >&2
    exit 1
fi

for extension in ctype curl dom fileinfo gd intl mbstring openssl pdo_mysql redis sodium tokenizer; do
    if ! "${PHP_BINARY}" -m | grep -Fxiq "${extension}"; then
        echo "Required PHP extension is unavailable: ${extension}" >&2
        exit 1
    fi
done

for artifact in vendor/autoload.php public/build/manifest.json; do
    if [[ ! -f "${APP_DIRECTORY}/${artifact}" ]]; then
        echo "Immutable release artifact is incomplete: ${artifact}" >&2
        exit 1
    fi
done

if [[ -e "${APP_DIRECTORY}/public/hot" ]]; then
    echo "Refusing production release: public/hot would route assets to a development server." >&2
    exit 1
fi

if [[ ! -f "${APP_DIRECTORY}/.env" ]]; then
    echo "The release has no environment file or protected environment symlink." >&2
    exit 1
fi

ENV_MODE="$(stat -Lc '%a' "${APP_DIRECTORY}/.env")"
if ! [[ "${ENV_MODE}" =~ ^[0-7]{3,4}$ ]]; then
    echo "The environment file permissions cannot be verified." >&2
    exit 1
fi
ENV_PERMISSIONS=$((8#${ENV_MODE}))
if (( (ENV_PERMISSIONS & 0027) != 0 )); then
    echo "The production environment file must not be writable by its group or accessible by other users." >&2
    exit 1
fi

for writable in storage bootstrap/cache; do
    if [[ ! -d "${APP_DIRECTORY}/${writable}" || ! -w "${APP_DIRECTORY}/${writable}" ]]; then
        echo "Required runtime directory is not writable: ${writable}" >&2
        exit 1
    fi
done

DISK_AVAILABLE="$(df -P "${APP_DIRECTORY}" | awk 'NR == 2 {gsub("%", "", $5); print 100 - $5}')"
if ! [[ "${DISK_AVAILABLE}" =~ ^[0-9]+$ ]] || (( DISK_AVAILABLE < MINIMUM_DISK_FREE_PERCENT )); then
    echo "Node disk headroom is below the required ${MINIMUM_DISK_FREE_PERCENT} percent." >&2
    exit 1
fi

if command -v timedatectl >/dev/null 2>&1; then
    NTP_STATE="$(timedatectl show --property=NTPSynchronized --value 2>/dev/null || true)"
    if [[ "${NTP_STATE,,}" != 'yes' ]]; then
        echo "Node clock synchronization is not healthy." >&2
        exit 1
    fi
fi

cd "${APP_DIRECTORY}"
TOPOLOGY="$("${PHP_BINARY}" artisan production:topology --no-interaction)"
case "${TOPOLOGY}" in
    single_node)
        "${PHP_BINARY}" artisan production:check --strict --no-interaction
        ;;
    multi_node)
        "${PHP_BINARY}" artisan production:deployment-check --strict --no-interaction
        ;;
    *)
        echo "Unsupported production topology: ${TOPOLOGY:-unresolved}" >&2
        exit 78
        ;;
esac

echo "Node runtime passed: unprivileged execution, PHP extensions, immutable assets, secret permissions, writable runtime paths, disk headroom, clock, and deployment contract are healthy."
