<?php

namespace App\Services\Payments;

use InvalidArgumentException;

final class PaymentPayloadHasher
{
    /**
     * @param  array<array-key, mixed>  $payload
     */
    public function hash(array $payload): string
    {
        $json = json_encode(
            $this->canonicalize($payload),
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );

        return hash('sha256', $json);
    }

    private function canonicalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            if (is_scalar($value) || $value === null) {
                return $value;
            }

            throw new InvalidArgumentException('Payment payload contains an unsupported value.');
        }

        if (array_is_list($value)) {
            return array_map(fn (mixed $item) => $this->canonicalize($item), $value);
        }

        ksort($value, SORT_STRING);

        foreach ($value as $key => $item) {
            $value[$key] = $this->canonicalize($item);
        }

        return $value;
    }
}
