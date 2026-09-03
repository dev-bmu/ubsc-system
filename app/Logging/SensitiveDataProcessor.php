<?php

namespace App\Logging;

use DateTimeInterface;
use Monolog\LogRecord;
use Stringable;
use Throwable;

class SensitiveDataProcessor
{
    private const REDACTED = '[REDACTED]';

    /** @var array<int, string> */
    private const SENSITIVE_KEY_FRAGMENTS = [
        'accesstoken',
        'apikey',
        'authorization',
        'clientsecret',
        'cookie',
        'credential',
        'csrf',
        'currentpassword',
        'cvv',
        'cvc',
        'idtoken',
        'password',
        'passwd',
        'pin',
        'privatekey',
        'refreshtoken',
        'remembertoken',
        'secret',
        'session',
        'signature',
        'token',
        'xsrf',
    ];

    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(
            message: $this->sanitizeString($record->message),
            context: $this->sanitizeArray($record->context),
            extra: $this->sanitizeArray($record->extra),
        );
    }

    /** @param array<mixed> $values */
    private function sanitizeArray(array $values, int $depth = 0): array
    {
        if ($depth >= 8) {
            return ['truncated' => '[MAX_DEPTH]'];
        }

        $sanitized = [];

        foreach ($values as $key => $value) {
            $sanitized[$key] = $this->isSensitiveKey((string) $key)
                ? self::REDACTED
                : $this->sanitizeValue($value, $depth + 1);
        }

        return $sanitized;
    }

    private function sanitizeValue(mixed $value, int $depth): mixed
    {
        return match (true) {
            is_array($value) => $this->sanitizeArray($value, $depth),
            is_string($value) => $this->sanitizeString($value),
            $value instanceof Throwable => $this->sanitizeThrowable($value),
            $value instanceof DateTimeInterface => $value->format(DATE_ATOM),
            $value instanceof Stringable => $this->sanitizeString((string) $value),
            is_object($value) => ['type' => $value::class],
            is_resource($value) => '[RESOURCE]',
            default => $value,
        };
    }

    /** @return array<string, mixed> */
    private function sanitizeThrowable(Throwable $exception): array
    {
        return [
            'type' => $exception::class,
            'message' => $this->sanitizeString($exception->getMessage()),
            'code' => is_int($exception->getCode())
                ? $exception->getCode()
                : 0,
            'file' => $exception->getFile(),
            'line' => $exception->getLine(),
            'trace' => array_map(
                static fn (array $frame): array => array_filter([
                    'file' => $frame['file'] ?? null,
                    'line' => $frame['line'] ?? null,
                    'class' => $frame['class'] ?? null,
                    'type' => $frame['type'] ?? null,
                    'function' => $frame['function'] ?? null,
                ], static fn (mixed $item): bool => $item !== null),
                array_slice($exception->getTrace(), 0, 20),
            ),
        ];
    }

    private function isSensitiveKey(string $key): bool
    {
        $normalized = strtolower((string) preg_replace('/[^a-z0-9]+/i', '', $key));

        foreach (self::SENSITIVE_KEY_FRAGMENTS as $fragment) {
            if (str_contains($normalized, $fragment)) {
                return true;
            }
        }

        return in_array($normalized, ['pwd', 'pass', 'code', 'state'], true);
    }

    private function sanitizeString(string $value): string
    {
        $patterns = [
            '~\b(Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]+~i' => '$1: '.self::REDACTED,
            '~\b(Bearer|Basic)\s+[A-Za-z0-9._\\~+/=-]+~i' => '$1 '.self::REDACTED,
            '~\b(https?|smtp|smtps|redis|rediss|mysql|pgsql|postgres(?:ql)?):\/\/[^\s\/:@]+:[^\s@\/]+@~i' => '$1://'.self::REDACTED.'@',
            '~\b(?:laravel_session|PHPSESSID|XSRF-TOKEN)\s*=\s*[^;\s,]+~i' => self::REDACTED,
            '~([?&](?:code|state|token|access_token|refresh_token|id_token|signature|session(?:_id)?)=)[^&\s"\'<>]+~i' => '$1'.self::REDACTED,
            '~(/reset-password/)[^/?\s"\'<>]+~i' => '$1'.self::REDACTED,
            '~\b([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{16,})\b~' => self::REDACTED,
        ];

        $sanitized = preg_replace(
            array_keys($patterns),
            array_values($patterns),
            $value,
        ) ?? self::REDACTED;

        return preg_replace_callback(
            '~(["\']?(?:password|passwd|pwd|secret|client_secret|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|csrf[_-]?token|xsrf[_-]?token|session[_-]?id|remember[_-]?token|authorization|cookie|signature)["\']?\s*[:=]\s*)(["\']?)([^"\'\s,;&}\]]+)(["\']?)~i',
            static fn (array $match): string => $match[1].$match[2].self::REDACTED.$match[4],
            $sanitized,
        ) ?? self::REDACTED;
    }
}
