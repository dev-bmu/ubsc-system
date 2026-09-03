<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class EnforceRequestResourceEnvelope
{
    /** @var list<string> */
    private const ALLOWED_METHODS = [
        'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        if (! (bool) config('ddos_protection.application.resource_envelope.enabled', false)) {
            return $next($request);
        }

        if (! in_array(strtoupper($request->method()), self::ALLOWED_METHODS, true)) {
            return $this->reject($request, 405, 'Request method is not supported.');
        }

        $requestTarget = (string) $request->server('REQUEST_URI', '/');
        if (strlen($requestTarget) > (int) config(
            'ddos_protection.application.resource_envelope.maximum_request_target_bytes',
            4_096,
        )) {
            return $this->reject($request, 414, 'Request target is too large.');
        }

        $query = (string) $request->server('QUERY_STRING', '');
        if (strlen($query) > (int) config(
            'ddos_protection.application.resource_envelope.maximum_query_bytes',
            2_048,
        ) || ! $this->queryShapeIsBounded($request->query->all())) {
            return $this->reject($request, 414, 'Request query is too large.');
        }

        if (! $this->headersAreBounded($request)) {
            return $this->reject($request, 431, 'Request headers are too large.');
        }

        $contentLength = $this->contentLength($request);
        if ($contentLength === false) {
            return $this->reject($request, 400, 'Request framing is invalid.');
        }

        if (is_int($contentLength) && $contentLength > $this->maximumBodyBytes($request)) {
            return $this->reject($request, 413, 'Request body is too large.');
        }

        return $next($request);
    }

    /** @param array<string, mixed> $query */
    private function queryShapeIsBounded(array $query): bool
    {
        $maximumParameters = (int) config(
            'ddos_protection.application.resource_envelope.maximum_query_parameters',
            100,
        );
        $maximumDepth = (int) config(
            'ddos_protection.application.resource_envelope.maximum_query_depth',
            8,
        );
        $count = 0;
        $stack = [[$query, 1]];

        while ($stack !== []) {
            [$values, $depth] = array_pop($stack);

            if ($depth > $maximumDepth) {
                return false;
            }

            foreach ($values as $value) {
                $count++;
                if ($count > $maximumParameters) {
                    return false;
                }

                if (is_array($value)) {
                    $stack[] = [$value, $depth + 1];
                }
            }
        }

        return true;
    }

    private function headersAreBounded(Request $request): bool
    {
        $maximumCount = (int) config(
            'ddos_protection.application.resource_envelope.maximum_header_count',
            96,
        );
        $maximumBytes = (int) config(
            'ddos_protection.application.resource_envelope.maximum_header_bytes',
            32_768,
        );
        $headers = $request->headers->all();

        if (count($headers) > $maximumCount) {
            return false;
        }

        $bytes = 0;
        foreach ($headers as $name => $values) {
            $bytes += strlen((string) $name) + 2;
            foreach ((array) $values as $value) {
                $bytes += strlen((string) $value) + 2;
                if ($bytes > $maximumBytes) {
                    return false;
                }
            }
        }

        return strlen((string) $request->headers->get('Cookie', '')) <= (int) config(
            'ddos_protection.application.resource_envelope.maximum_cookie_bytes',
            8_192,
        );
    }

    private function contentLength(Request $request): int|false|null
    {
        $raw = trim((string) $request->headers->get('Content-Length', ''));
        $transferEncoding = trim((string) $request->headers->get('Transfer-Encoding', ''));

        if ($raw !== '' && $transferEncoding !== '') {
            return false;
        }

        if ($raw === '') {
            return null;
        }

        if (! ctype_digit($raw) || strlen($raw) > 12) {
            return false;
        }

        $length = (int) $raw;

        return $length >= 0 ? $length : false;
    }

    private function maximumBodyBytes(Request $request): int
    {
        $routeName = (string) ($request->route()?->getName() ?? '');
        $definitions = (array) config(
            'ddos_protection.application.resource_envelope.route_body_bytes',
            [],
        );
        $exact = $definitions[$routeName] ?? null;

        if (is_numeric($exact)) {
            return max(1, (int) $exact);
        }

        foreach ($definitions as $pattern => $bytes) {
            if (is_string($pattern)
                && str_contains($pattern, '*')
                && Str::is($pattern, $routeName)
                && is_numeric($bytes)) {
                return max(1, (int) $bytes);
            }
        }

        return max(1, (int) config(
            'ddos_protection.application.resource_envelope.default_body_bytes',
            2_097_152,
        ));
    }

    private function reject(Request $request, int $status, string $message): Response
    {
        $headers = [
            'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
            'X-Content-Type-Options' => 'nosniff',
        ];

        if ($request->expectsJson() || $request->headers->has('X-Inertia')) {
            return response()->json(['message' => $message], $status, $headers);
        }

        return response($message, $status, [
            ...$headers,
            'Content-Type' => 'text/plain; charset=UTF-8',
        ]);
    }
}
