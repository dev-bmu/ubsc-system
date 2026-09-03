<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

final class RequireIdempotencyKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $headerName = (string) config(
            'resilience.idempotency.header',
            'Idempotency-Key',
        );
        $responseHeader = (string) config(
            'resilience.idempotency.response_header',
            'Idempotency-Key',
        );
        $headerKey = $this->normalize($request->headers->get($headerName));
        $bodyKey = $this->normalize($request->input('idempotency_key'));

        if ($headerKey !== null && $bodyKey !== null && $headerKey !== $bodyKey) {
            throw ValidationException::withMessages([
                'idempotency_key' => 'Identitas permintaan pada header dan formulir tidak cocok.',
            ]);
        }

        $key = $headerKey ?? $bodyKey;

        if ($key === null || ! Str::isUuid($key)) {
            throw ValidationException::withMessages([
                'idempotency_key' => 'Identitas permintaan yang valid wajib disertakan.',
            ]);
        }

        $request->merge(['idempotency_key' => $key]);
        $request->attributes->set('idempotency_key', $key);

        $response = $next($request);
        $response->headers->set($responseHeader, $key);

        return $response;
    }

    private function normalize(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $normalized = strtolower(trim($value));

        return $normalized !== '' ? $normalized : null;
    }
}
