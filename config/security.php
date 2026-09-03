<?php

return [
    // Comma-separated CIDRs or proxy IPs. Keep empty unless requests really
    // pass through those controlled reverse proxies.
    'trusted_proxies' => env('TRUSTED_PROXIES', ''),

    'admin_session' => [
        // Independent of Laravel's generic session lifetime so harmless
        // background polling cannot keep a staff session alive forever.
        'idle_minutes' => (int) env('ADMIN_SESSION_IDLE_MINUTES', 30),
        'absolute_minutes' => (int) env('ADMIN_SESSION_ABSOLUTE_MINUTES', 480),
        'rotate_minutes' => (int) env('ADMIN_SESSION_ROTATE_MINUTES', 15),
        'bind_user_agent' => env('ADMIN_SESSION_BIND_USER_AGENT', true),
        'lock_seconds' => (int) env('ADMIN_SESSION_LOCK_SECONDS', 60),
        'lock_wait_seconds' => (int) env('ADMIN_SESSION_LOCK_WAIT_SECONDS', 15),
    ],

    'admin_presence' => [
        // Heartbeats are intentionally short-lived and never extend the
        // independent admin idle timeout.
        'online_ttl_seconds' => (int) env('ADMIN_PRESENCE_ONLINE_TTL_SECONDS', 90),
        'last_seen_write_seconds' => (int) env('ADMIN_PRESENCE_LAST_SEEN_WRITE_SECONDS', 60),
    ],

    'admin_mfa' => [
        'preauth_minutes' => (int) env('ADMIN_MFA_PREAUTH_MINUTES', 5),
        'management_step_up_minutes' => (int) env('ADMIN_MFA_MANAGEMENT_STEP_UP_MINUTES', 5),
        'management_ceremony_minutes' => (int) env('ADMIN_MFA_MANAGEMENT_CEREMONY_MINUTES', 10),
        'challenge_seconds' => (int) env('ADMIN_MFA_CHALLENGE_SECONDS', 90),
        'totp_issuer' => env('ADMIN_MFA_TOTP_ISSUER', 'UB Sport Center'),
        'recovery_code_count' => (int) env('ADMIN_MFA_RECOVERY_CODE_COUNT', 10),
        'recovery_code_bytes' => (int) env('ADMIN_MFA_RECOVERY_CODE_BYTES', 16),
        'recovery_pepper' => trim((string) env('ADMIN_MFA_RECOVERY_PEPPER', ''))
            ?: config('app.key'),
        'recovery_pepper_is_dedicated' => trim((string) env('ADMIN_MFA_RECOVERY_PEPPER', '')) !== '',
        'login' => [
            // Keep the known-account password hash path and the unknown-account
            // path inside the same conservative latency envelope. This must be
            // comfortably above the p95 password-hash time on production hosts.
            'timebox_ms' => (int) env('AUTH_LOGIN_TIMEBOX_MS', 1000),
            'account_burst_attempts' => (int) env('AUTH_ACCOUNT_BURST_ATTEMPTS', 5),
            'account_burst_seconds' => (int) env('AUTH_ACCOUNT_BURST_SECONDS', 600),
            'account_hour_attempts' => (int) env('AUTH_ACCOUNT_HOUR_ATTEMPTS', 15),
            'ip_minute_attempts' => (int) env('AUTH_IP_MINUTE_ATTEMPTS', 15),
            'ip_hour_attempts' => (int) env('AUTH_IP_HOUR_ATTEMPTS', 100),
            'global_minute_attempts' => (int) env('AUTH_GLOBAL_MINUTE_ATTEMPTS', 120),
        ],
        'verification' => [
            'account_attempts' => (int) env('ADMIN_MFA_VERIFY_ATTEMPTS', 5),
            'account_seconds' => (int) env('ADMIN_MFA_VERIFY_SECONDS', 600),
            'ip_attempts' => (int) env('ADMIN_MFA_VERIFY_IP_ATTEMPTS', 20),
            'global_attempts' => (int) env('ADMIN_MFA_VERIFY_GLOBAL_ATTEMPTS', 300),
        ],
    ],

    'password_recovery' => [
        // A deliberately conservative floor masks the user lookup, reset-token
        // hash, queue and database timing differences that would otherwise
        // reveal whether an email address is registered.
        'timebox_ms' => (int) env('PASSWORD_RECOVERY_TIMEBOX_MS', 1000),
    ],
];
