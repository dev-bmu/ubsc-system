<?php

use Monolog\Formatter\JsonFormatter;
use Monolog\Handler\NullHandler;
use Monolog\Handler\StreamHandler;
use Monolog\Handler\SyslogUdpHandler;
use Monolog\Processor\PsrLogMessageProcessor;

return [

    /*
    |--------------------------------------------------------------------------
    | Default Log Channel
    |--------------------------------------------------------------------------
    |
    | This option defines the default log channel that is utilized to write
    | messages to your logs. The value provided here should match one of
    | the channels present in the list of "channels" configured below.
    |
    */

    'default' => env('LOG_CHANNEL', 'stack'),

    /*
    |--------------------------------------------------------------------------
    | Deprecations Log Channel
    |--------------------------------------------------------------------------
    |
    | This option controls the log channel that should be used to log warnings
    | regarding deprecated PHP and library features. This allows you to get
    | your application ready for upcoming major versions of dependencies.
    |
    */

    'deprecations' => [
        'channel' => env('LOG_DEPRECATIONS_CHANNEL', 'null'),
        'trace' => env('LOG_DEPRECATIONS_TRACE', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Log Channels
    |--------------------------------------------------------------------------
    |
    | Here you may configure the log channels for your application. Laravel
    | utilizes the Monolog PHP logging library, which includes a variety
    | of powerful log handlers and formatters that you're free to use.
    |
    | Available drivers: "single", "daily", "slack", "syslog",
    |                    "errorlog", "monolog", "custom", "stack"
    |
    */

    'channels' => [

        'stack' => [
            'driver' => 'stack',
            'channels' => explode(',', (string) env('LOG_STACK', 'single')),
            'ignore_exceptions' => false,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'single' => [
            'driver' => 'single',
            'path' => storage_path('logs/laravel.log'),
            'level' => env('LOG_LEVEL', 'debug'),
            'replace_placeholders' => true,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'daily' => [
            'driver' => 'daily',
            'path' => storage_path('logs/laravel.log'),
            'level' => env('LOG_LEVEL', 'debug'),
            'days' => env('LOG_DAILY_DAYS', 14),
            'replace_placeholders' => true,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        /*
        | Payment operations are intentionally isolated from the general
        | application log. Context written to this stack must contain opaque
        | record identifiers and aggregate counters only; credentials,
        | payment instruments, request payloads, and personal data are never
        | valid payment-log context.
        */
        'payments' => [
            'driver' => 'stack',
            'channels' => array_values(array_filter(array_map(
                'trim',
                explode(',', (string) env('PAYMENT_LOG_STACK', 'payment_daily')),
            ))),
            // The relational audit trail remains authoritative. A temporary
            // logging sink outage must never fail or duplicate a payment.
            'ignore_exceptions' => true,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'payment_daily' => [
            'driver' => 'daily',
            'path' => storage_path('logs/payments/payment.log'),
            'level' => env('PAYMENT_LOG_LEVEL', 'info'),
            // This local window is deliberately longer than the default
            // archive threshold so a temporarily failed archive job cannot
            // cause RotatingFileHandler to remove the only copy.
            'days' => (int) env('PAYMENT_LOG_DAILY_DAYS', 45),
            'replace_placeholders' => true,
            'formatter' => JsonFormatter::class,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'slack' => [
            'driver' => 'slack',
            'url' => env('LOG_SLACK_WEBHOOK_URL'),
            'username' => env('LOG_SLACK_USERNAME', 'Laravel Log'),
            'emoji' => env('LOG_SLACK_EMOJI', ':boom:'),
            'level' => env('LOG_LEVEL', 'critical'),
            'replace_placeholders' => true,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'papertrail' => [
            'driver' => 'monolog',
            'level' => env('LOG_LEVEL', 'debug'),
            'handler' => env('LOG_PAPERTRAIL_HANDLER', SyslogUdpHandler::class),
            'handler_with' => [
                'host' => env('PAPERTRAIL_URL'),
                'port' => env('PAPERTRAIL_PORT'),
                'connectionString' => 'tls://'.env('PAPERTRAIL_URL').':'.env('PAPERTRAIL_PORT'),
            ],
            'processors' => [PsrLogMessageProcessor::class],
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'stderr' => [
            'driver' => 'monolog',
            'level' => env('LOG_LEVEL', 'debug'),
            'handler' => StreamHandler::class,
            'handler_with' => [
                'stream' => 'php://stderr',
            ],
            'formatter' => env('LOG_STDERR_FORMATTER'),
            'processors' => [PsrLogMessageProcessor::class],
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'json_stderr' => [
            'driver' => 'monolog',
            'level' => env('LOG_LEVEL', 'info'),
            'handler' => StreamHandler::class,
            'handler_with' => [
                'stream' => 'php://stderr',
            ],
            'formatter' => JsonFormatter::class,
            'formatter_with' => [
                'batchMode' => JsonFormatter::BATCH_MODE_JSON,
                'appendNewline' => true,
                'ignoreEmptyContextAndExtra' => false,
                'includeStacktraces' => false,
            ],
            'processors' => [PsrLogMessageProcessor::class],
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'syslog' => [
            'driver' => 'syslog',
            'level' => env('LOG_LEVEL', 'debug'),
            'facility' => env('LOG_SYSLOG_FACILITY', LOG_USER),
            'replace_placeholders' => true,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'errorlog' => [
            'driver' => 'errorlog',
            'level' => env('LOG_LEVEL', 'debug'),
            'replace_placeholders' => true,
            'tap' => [\App\Logging\RedactSensitiveLogContext::class],
        ],

        'null' => [
            'driver' => 'monolog',
            'handler' => NullHandler::class,
        ],

        'emergency' => [
            'path' => storage_path('logs/laravel.log'),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Payment Log Archive
    |--------------------------------------------------------------------------
    |
    | Old payment operation logs are compressed into private storage and
    | accompanied by a SHA-256 checksum of their original contents. The
    | archive command rejects unsafe retention relationships rather than
    | silently deleting the only recoverable copy.
    |
    */
    'payment_archive' => [
        'source_path' => storage_path('logs/payments'),
        'archive_path' => env('PAYMENT_LOG_ARCHIVE_PATH')
            ?: storage_path('app/private/payment-log-archive'),
        'archive_after_days' => (int) env('PAYMENT_LOG_ARCHIVE_AFTER_DAYS', 30),
        'retention_days' => (int) env('PAYMENT_LOG_RETENTION_DAYS', 365),
    ],

];
