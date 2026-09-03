<?php

namespace Tests\Unit;

use App\Logging\SensitiveDataProcessor;
use DateTimeImmutable;
use Monolog\Level;
use Monolog\LogRecord;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class SensitiveDataProcessorTest extends TestCase
{
    public function test_it_redacts_credentials_sessions_and_oauth_values_recursively(): void
    {
        $secret = 'super-secret-value';
        $record = new LogRecord(
            new DateTimeImmutable,
            'security-test',
            Level::Error,
            'Authorization: Bearer bearer-value callback?code=oauth-code&state=oauth-state',
            [
                'password' => $secret,
                'request' => [
                    'session_id' => 'session-value',
                    'safe_id' => 42,
                ],
                'session' => 'generic-session-value',
                'exception' => new RuntimeException(
                    'Failed /reset-password/reset-token?email=user@example.test',
                ),
            ],
        );

        $processed = (new SensitiveDataProcessor)($record);
        $encoded = json_encode([
            $processed->message,
            $processed->context,
        ], JSON_THROW_ON_ERROR);

        foreach ([
            $secret,
            'bearer-value',
            'oauth-code',
            'oauth-state',
            'session-value',
            'generic-session-value',
            'reset-token',
        ] as $sensitiveValue) {
            $this->assertStringNotContainsString($sensitiveValue, $encoded);
        }

        $this->assertSame(42, $processed->context['request']['safe_id']);
        $this->assertStringContainsString('[REDACTED]', $encoded);
    }

    public function test_it_redacts_json_style_secret_assignments_and_jwts(): void
    {
        $jwt = str_repeat('a', 20).'.'.str_repeat('b', 20).'.'.str_repeat('c', 20);
        $record = new LogRecord(
            new DateTimeImmutable,
            'security-test',
            Level::Warning,
            '{"client_secret":"plain-secret","token":"'.$jwt.'"}',
        );

        $message = (new SensitiveDataProcessor)($record)->message;

        $this->assertStringNotContainsString('plain-secret', $message);
        $this->assertStringNotContainsString($jwt, $message);
        $this->assertStringContainsString('[REDACTED]', $message);
    }

    public function test_it_redacts_uri_credentials_and_named_session_cookies(): void
    {
        $record = new LogRecord(
            new DateTimeImmutable,
            'security-test',
            Level::Error,
            'SMTP smtp://mailer:mail-password@mail.example.test failed; '
                .'laravel_session=session-cookie-value; XSRF-TOKEN=csrf-cookie-value',
        );

        $message = (new SensitiveDataProcessor)($record)->message;

        foreach (['mail-password', 'session-cookie-value', 'csrf-cookie-value'] as $secret) {
            $this->assertStringNotContainsString($secret, $message);
        }

        $this->assertStringContainsString('[REDACTED]', $message);
    }
}
