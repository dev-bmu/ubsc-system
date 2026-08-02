<?php

namespace App\Services\Payments;

final class PaymentMetadataSanitizer
{
    private const MAX_DEPTH = 5;

    private const MAX_ITEMS = 64;

    private const MAX_STRING_LENGTH = 1000;

    /**
     * @var array<int, string>
     */
    private const SENSITIVE_KEY_FRAGMENTS = [
        'authorization',
        'apikey',
        'accountnumber',
        'cardnumber',
        'cookie',
        'credential',
        'csrf',
        'cvc',
        'cvv',
        'password',
        'pin',
        'privatekey',
        'secret',
        'sessionid',
        'signature',
        'token',
    ];

    /**
     * @param  array<array-key, mixed>  $metadata
     * @return array<array-key, mixed>
     */
    public function sanitize(array $metadata): array
    {
        return $this->sanitizeArray($metadata, 0);
    }

    /**
     * @param  array<array-key, mixed>  $values
     * @return array<array-key, mixed>
     */
    private function sanitizeArray(array $values, int $depth): array
    {
        if ($depth >= self::MAX_DEPTH) {
            return [];
        }

        $isList = array_is_list($values);
        $sanitized = [];

        foreach (array_slice($values, 0, self::MAX_ITEMS, true) as $key => $value) {
            if (! is_int($key) && $this->isSensitiveKey($key)) {
                continue;
            }

            $cleanValue = $this->sanitizeValue($value, $depth + 1);

            if ($cleanValue === null && $value !== null) {
                continue;
            }

            if ($isList) {
                $sanitized[] = $cleanValue;
            } else {
                $sanitized[is_int($key) ? $key : substr($key, 0, 100)] = $cleanValue;
            }
        }

        return $sanitized;
    }

    private function sanitizeValue(mixed $value, int $depth): mixed
    {
        if (is_array($value)) {
            return $this->sanitizeArray($value, $depth);
        }

        if (is_string($value)) {
            return substr($value, 0, self::MAX_STRING_LENGTH);
        }

        if (is_int($value) || is_float($value) || is_bool($value) || $value === null) {
            return $value;
        }

        return null;
    }

    private function isSensitiveKey(string $key): bool
    {
        $normalized = strtolower((string) preg_replace('/[^a-z0-9]/i', '', $key));

        foreach (self::SENSITIVE_KEY_FRAGMENTS as $fragment) {
            if (str_contains($normalized, $fragment)) {
                return true;
            }
        }

        return false;
    }
}
