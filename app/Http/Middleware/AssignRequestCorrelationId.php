<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class AssignRequestCorrelationId
{
    /** @var list<string> */
    private array $contextKeys = ['request_id', 'release_id', 'instance_id'];

    public function handle(Request $request, Closure $next): Response
    {
        if (! (bool) config('observability.request_correlation.enabled', true)) {
            return $next($request);
        }

        $requestId = (string) Str::uuid();
        $attribute = (string) config(
            'observability.request_correlation.attribute',
            'ubsc.observability.request_id',
        );
        $request->attributes->set($attribute, $requestId);

        $context = ['request_id' => $requestId];
        $release = trim((string) config('monitoring.release'));
        $instance = trim((string) config('high_availability.load_balancer.instance_id'));
        if ($release !== '') {
            $context['release_id'] = substr(hash('sha256', $release), 0, 16);
        }
        if ($instance !== '') {
            $context['instance_id'] = substr(hash('sha256', $instance), 0, 16);
        }
        Log::shareContext($context);

        $response = $next($request);
        $response->headers->set(
            (string) config('observability.request_correlation.header', 'X-Request-ID'),
            $requestId,
        );

        return $response;
    }

    public function terminate(Request $request, Response $response): void
    {
        // Required for Octane and any other long-lived HTTP worker so one
        // request identity can never leak into the next request's logs.
        Log::withoutContext($this->contextKeys);
    }
}
