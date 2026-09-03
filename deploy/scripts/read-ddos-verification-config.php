<?php

declare(strict_types=1);

if ($argc !== 2) {
    fwrite(STDERR, "Usage: read-ddos-verification-config.php config.json\n");
    exit(64);
}

$path = $argv[1];
if (! is_file($path) || is_link($path)) {
    fwrite(STDERR, "DDoS verifier configuration must be a regular non-symlink file.\n");
    exit(66);
}

$size = filesize($path);
if (! is_int($size) || $size < 2 || $size > 4_096) {
    fwrite(STDERR, "DDoS verifier configuration has an invalid size.\n");
    exit(65);
}

$raw = file_get_contents($path);
if (! is_string($raw)) {
    fwrite(STDERR, "DDoS verifier configuration cannot be read.\n");
    exit(66);
}

try {
    $payload = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    fwrite(STDERR, "DDoS verifier configuration is not valid bounded JSON.\n");
    exit(65);
}

if (! is_array($payload) || array_is_list($payload)) {
    fwrite(STDERR, "DDoS verifier configuration must be a JSON object.\n");
    exit(65);
}

$expectedKeys = [
    'schema', 'provider', 'provider_hook', 'provider_zone_fingerprint',
    'public_origin', 'edge_response_header', 'timeout_seconds',
];
$actualKeys = array_keys($payload);
sort($expectedKeys);
sort($actualKeys);
if ($actualKeys !== $expectedKeys
    || ($payload['schema'] ?? null) !== 'ubsc.ddos-verification-config.v2') {
    fwrite(STDERR, "DDoS verifier configuration does not match the v2 allowlist.\n");
    exit(65);
}

$provider = $payload['provider'] ?? null;
$hook = $payload['provider_hook'] ?? null;
$zoneFingerprint = $payload['provider_zone_fingerprint'] ?? null;
$publicOrigin = $payload['public_origin'] ?? null;
$header = $payload['edge_response_header'] ?? null;
$timeout = $payload['timeout_seconds'] ?? null;

$canonicalOrigin = null;
if (is_string($publicOrigin) && filter_var($publicOrigin, FILTER_VALIDATE_URL) !== false) {
    $parts = parse_url($publicOrigin);
    if (is_array($parts)
        && strtolower((string) ($parts['scheme'] ?? '')) === 'https'
        && trim((string) ($parts['host'] ?? '')) !== ''
        && ! isset($parts['user'])
        && ! isset($parts['pass'])
        && ! isset($parts['query'])
        && ! isset($parts['fragment'])
        && (! isset($parts['port']) || ((int) $parts['port'] >= 1 && (int) $parts['port'] <= 65_535))
        && in_array((string) ($parts['path'] ?? ''), ['', '/'], true)) {
        $host = strtolower(rtrim((string) $parts['host'], '.'));
        if (preg_match('/\A[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\z/', $host) === 1
            && ! str_contains($host, '..')) {
            $port = isset($parts['port']) && (int) $parts['port'] !== 443
                ? ':'.(int) $parts['port']
                : '';
            $canonicalOrigin = 'https://'.$host.$port;
        }
    }
}

if (! is_string($provider)
    || preg_match('/\A[a-z0-9][a-z0-9._:-]{2,95}\z/', $provider) !== 1
    || preg_match('/replace|example|placeholder|unknown/i', $provider) === 1
    || ! is_string($hook)
    || preg_match('#\A/usr/local/libexec/[A-Za-z0-9._-]+\z#', $hook) !== 1
    || ! is_string($zoneFingerprint)
    || preg_match('/\A[a-f0-9]{64}\z/', $zoneFingerprint) !== 1
    || preg_match('/\A([a-f0-9])\1{63}\z/', $zoneFingerprint) === 1
    || ! is_string($publicOrigin)
    || $canonicalOrigin === null
    || ! hash_equals($canonicalOrigin, $publicOrigin)
    || ! is_string($header)
    || preg_match('/\A[a-z0-9][a-z0-9-]{2,63}\z/', $header) !== 1
    || ! is_int($timeout)
    || $timeout < 5
    || $timeout > 120) {
    fwrite(STDERR, "DDoS verifier configuration contains an unsafe value.\n");
    exit(65);
}

fwrite(
    STDOUT,
    $provider."\n".$hook."\n".$publicOrigin."\n".$zoneFingerprint."\n".$header."\n".$timeout."\n",
);
