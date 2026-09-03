<?php

namespace App\Services\Monitoring;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class RequestPerformanceRecorder
{
    public function __construct(
        private readonly PerformanceMetricRepository $metrics,
    ) {}

    public function record(
        Request $request,
        Response $response,
        int $durationMs,
    ): void {
        if (! (bool) config('performance.enabled', false)) {
            return;
        }

        $routeName = $request->route()?->getName();

        if (is_string($routeName)
            && in_array($routeName, (array) config('performance.excluded_routes', []), true)) {
            return;
        }

        try {
            $this->metrics->recordRequest(
                scope: $this->scope($request, $routeName),
                durationMs: $durationMs,
                failed: $response->getStatusCode() >= 500,
            );
        } catch (Throwable) {
            // Telemetry is deliberately fail-open. A metrics dependency must
            // never change or delay the response already sent to the user.
        }
    }

    private function scope(Request $request, ?string $routeName): string
    {
        $name = strtolower($routeName ?? '');
        $path = strtolower(trim($request->path(), '/'));

        if ($this->containsAny($name, [
            'login', 'logout', 'register', 'password', 'verification',
            'verify', 'mfa', 'passkey', 'google',
        ]) || $this->containsAny($path, [
            'login', 'register', 'forgot-password', 'reset-password',
            'verify-email', '/mfa', '/passkey', '/auth/google',
        ])) {
            return 'authentication';
        }

        if (str_starts_with($name, 'admin.')
            || str_starts_with($name, 'ubsc-staff.')
            || str_starts_with($path, 'ubsc-staff')) {
            return 'admin';
        }

        if ($this->containsAny($name, [
            'booking', 'checkout', 'membership', 'payment', 'availability',
        ]) || $this->containsAny($path, [
            'booking', 'checkout', 'membership', 'payment', 'availability',
        ])) {
            return 'booking_checkout';
        }

        return in_array(strtoupper($request->method()), ['GET', 'HEAD', 'OPTIONS'], true)
            ? 'public_read'
            : 'write';
    }

    /** @param list<string> $needles */
    private function containsAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) {
            if ($needle !== '' && str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }
}
