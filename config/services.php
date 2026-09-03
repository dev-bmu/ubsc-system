<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', '/auth/google/callback'),
        'http_verify' => env('GOOGLE_HTTP_VERIFY', true),
    ],

    'payment' => [
        // Fail closed outside explicitly configured local/test environments.
        'mock' => env('PAYMENT_GATEWAY_MOCK', false),
        'transaction_fee' => (int) env('BOOKING_TRANSACTION_FEE', 6000),
        'hold_minutes' => (int) env('BOOKING_PAYMENT_WINDOW_MINUTES', 15),
        'submission_safety_seconds' => (int) env('BOOKING_PAYMENT_SAFETY_SECONDS', 3),
        'booking_max_items' => (int) env('BOOKING_CHECKOUT_MAX_ITEMS', 8),
        'booking_max_open_holds' => (int) env('BOOKING_MAX_OPEN_HOLDS', 2),
        'currency' => env('PAYMENT_CURRENCY', 'IDR'),
        'terms_version' => env('PAYMENT_TERMS_VERSION', 'booking-terms-2026-08'),
        'membership_window_hours' => (int) env('MEMBERSHIP_PAYMENT_WINDOW_HOURS', 24),
        // Creating attempts older than this are treated as interrupted work
        // and moved to provider reconciliation; no new charge is created.
        'recovery_stale_seconds' => (int) env('PAYMENT_RECOVERY_STALE_SECONDS', 120),
    ],

];
