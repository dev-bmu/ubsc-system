<?php

declare(strict_types=1);

if ($argc !== 6) {
    fwrite(STDERR, "Usage: validate-ddos-provider-evidence.php evidence.json expected-provider expected-challenge expected-origin expected-zone-fingerprint\n");
    exit(64);
}

[$script, $path, $expectedProvider, $expectedChallenge, $expectedOrigin, $expectedZoneFingerprint] = $argv;
$expectedProvider = strtolower(trim($expectedProvider));
if (preg_match('/\A[a-f0-9]{64}\z/', $expectedChallenge) !== 1) {
    fwrite(STDERR, "Provider evidence challenge is invalid.\n");
    exit(64);
}
if (preg_match('/\A[a-f0-9]{64}\z/', $expectedZoneFingerprint) !== 1
    || preg_match('/\A([a-f0-9])\1{63}\z/', $expectedZoneFingerprint) === 1) {
    fwrite(STDERR, "Provider zone fingerprint is invalid.\n");
    exit(64);
}

$canonicalExpectedOrigin = null;
if (filter_var($expectedOrigin, FILTER_VALIDATE_URL) !== false) {
    $parts = parse_url($expectedOrigin);
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
            $canonicalExpectedOrigin = 'https://'.$host.$port;
        }
    }
}
if ($canonicalExpectedOrigin === null || ! hash_equals($canonicalExpectedOrigin, $expectedOrigin)) {
    fwrite(STDERR, "Provider evidence expected origin is invalid.\n");
    exit(64);
}

if (! is_file($path) || is_link($path)) {
    fwrite(STDERR, "Provider evidence must be a regular non-symlink file.\n");
    exit(66);
}

$size = filesize($path);
if (! is_int($size) || $size < 2 || $size > 65_536) {
    fwrite(STDERR, "Provider evidence must be between 2 and 65536 bytes.\n");
    exit(65);
}

$raw = file_get_contents($path);
if (! is_string($raw)) {
    fwrite(STDERR, "Provider evidence cannot be read.\n");
    exit(66);
}

try {
    $payload = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    fwrite(STDERR, "Provider evidence is not valid bounded JSON.\n");
    exit(65);
}

if (! is_array($payload) || array_is_list($payload)) {
    fwrite(STDERR, "Provider evidence must be a JSON object.\n");
    exit(65);
}

$forbidden = '/secret|token|password|credential|private[_-]?key|authorization/i';
$stack = [$payload];
while ($stack !== []) {
    $current = array_pop($stack);
    foreach ($current as $key => $value) {
        if (is_string($key) && preg_match($forbidden, $key) === 1) {
            fwrite(STDERR, "Provider evidence contains a forbidden secret-bearing field.\n");
            exit(65);
        }
        if (is_array($value)) {
            $stack[] = $value;
        }
    }
}

$requiredKeys = [
    'schema', 'evidence_id', 'challenge', 'provider', 'origin', 'zone_id', 'checked_at',
    'managed_dns', 'cdn', 'waf', 'ddos', 'automatic_l3_l4',
    'automatic_l7', 'adaptive_rate_limiting', 'bot_management',
    'origin_restricted', 'security_event_stream', 'attack_alerting',
];
$booleanFields = [
    'managed_dns', 'cdn', 'waf', 'ddos', 'automatic_l3_l4',
    'automatic_l7', 'adaptive_rate_limiting', 'bot_management',
    'origin_restricted', 'security_event_stream', 'attack_alerting',
];
sort($requiredKeys);
$actualKeys = array_keys($payload);
sort($actualKeys);
if ($actualKeys !== $requiredKeys) {
    fwrite(STDERR, "Provider evidence fields do not match the v2 allowlist.\n");
    exit(65);
}

if (($payload['schema'] ?? null) !== 'ubsc.ddos-provider-evidence.v2') {
    fwrite(STDERR, "Provider evidence schema is unsupported.\n");
    exit(65);
}

if (! is_string($payload['evidence_id'])
    || preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i', $payload['evidence_id']) !== 1) {
    fwrite(STDERR, "Provider evidence ID must be UUIDv4.\n");
    exit(65);
}

if (! is_string($payload['challenge'] ?? null)
    || ! hash_equals($expectedChallenge, $payload['challenge'])) {
    fwrite(STDERR, "Provider evidence is not bound to this verification run.\n");
    exit(65);
}

$providerValue = $payload['provider'] ?? null;
if (! is_string($providerValue)) {
    fwrite(STDERR, "Provider evidence identity must be a string.\n");
    exit(65);
}
$provider = strtolower(trim($providerValue));
if ($expectedProvider === '' || ! hash_equals($expectedProvider, $provider)) {
    fwrite(STDERR, "Provider evidence does not identify the configured edge.\n");
    exit(65);
}

$origin = $payload['origin'] ?? null;
if (! is_string($origin) || ! hash_equals($expectedOrigin, $origin)) {
    fwrite(STDERR, "Provider evidence does not identify the configured public origin.\n");
    exit(65);
}

$zone = $payload['zone_id'] ?? null;
if (! is_string($zone)
    || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._:-]{5,127}\z/', $zone) !== 1
    || preg_match('/replace|example|placeholder|unknown/i', $zone) === 1) {
    fwrite(STDERR, "Provider evidence zone identity is invalid.\n");
    exit(65);
}
if (! hash_equals($expectedZoneFingerprint, hash('sha256', $zone))) {
    fwrite(STDERR, "Provider evidence does not identify the configured provider zone.\n");
    exit(65);
}

$checkedAtValue = $payload['checked_at'] ?? null;
if (! is_string($checkedAtValue)) {
    fwrite(STDERR, "Provider evidence timestamp must be a string.\n");
    exit(65);
}
$checkedAt = DateTimeImmutable::createFromFormat(
    '!Y-m-d\TH:i:s\Z',
    $checkedAtValue,
    new DateTimeZone('UTC'),
);
$errors = DateTimeImmutable::getLastErrors();
if ($checkedAt === false || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
    fwrite(STDERR, "Provider evidence timestamp must be canonical UTC seconds.\n");
    exit(65);
}

$age = time() - $checkedAt->getTimestamp();
if ($age < -30 || $age > 120) {
    fwrite(STDERR, "Provider evidence is stale or outside the clock-skew window.\n");
    exit(65);
}

foreach ($booleanFields as $field) {
    if (($payload[$field] ?? null) !== true) {
        fwrite(STDERR, "Provider evidence reports required control [{$field}] as disabled.\n");
        exit(1);
    }
}

fwrite(STDOUT, "Provider evidence passed: live managed edge controls are enabled and fresh.\n");
