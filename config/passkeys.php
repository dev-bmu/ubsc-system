<?php

$configuredOrigins = array_values(array_filter(array_map(
    static fn (string $origin): string => rtrim(trim($origin), '/'),
    explode(',', (string) env('PASSKEYS_ALLOWED_ORIGINS', config('app.url'))),
)));
$configuredUserHandleSecret = trim((string) env('PASSKEYS_USER_HANDLE_SECRET', ''));

return [
    'relying_party_id' => env(
        'PASSKEYS_RELYING_PARTY_ID',
        parse_url((string) config('app.url'), PHP_URL_HOST),
    ),
    'allowed_origins' => $configuredOrigins,
    'user_handle_secret' => $configuredUserHandleSecret !== ''
        ? $configuredUserHandleSecret
        : config('app.key'),
    'user_handle_secret_is_dedicated' => $configuredUserHandleSecret !== '',
    'timeout' => (int) env('PASSKEYS_TIMEOUT_MS', 60_000),
    'guard' => 'web',
    'middleware' => ['web'],
    'management_middleware' => [],
    'throttle' => null,
    'redirect' => '/ubsc-staff',
];
