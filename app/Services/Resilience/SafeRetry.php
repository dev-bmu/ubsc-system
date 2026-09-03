<?php

namespace App\Services\Resilience;

use App\Exceptions\SafeRetryExhausted;
use Closure;
use Error;
use Illuminate\Contracts\Config\Repository;
use LogicException;
use Throwable;

/**
 * Bounded retry policy for operations that are explicitly safe to repeat.
 *
 * Never wrap writes in this policy merely to make them "reliable". Domain
 * writes must instead use transactions, locks, and durable idempotency.
 */
final class SafeRetry
{
    /** @var Closure(int): void */
    private readonly Closure $sleeper;

    /** @var Closure(int, int): int */
    private readonly Closure $jitter;

    public function __construct(
        private readonly Repository $config,
        ?Closure $sleeper = null,
        ?Closure $jitter = null,
    ) {
        $this->sleeper = $sleeper ?? static function (int $milliseconds): void {
            if ($milliseconds > 0) {
                usleep($milliseconds * 1_000);
            }
        };
        $this->jitter = $jitter ?? static fn (int $minimum, int $maximum): int => $maximum <= $minimum ? $minimum : random_int($minimum, $maximum);
    }

    /**
     * @template TValue
     *
     * @param  callable(): TValue  $operation
     * @param  (callable(Throwable, int): bool)|null  $shouldRetry
     * @return array{value:TValue,attempts:int}
     *
     * @throws SafeRetryExhausted
     */
    public function repeatable(
        callable $operation,
        ?callable $shouldRetry = null,
        ?int $attemptLimit = null,
    ): array {
        $attemptLimit ??= (int) $this->config->get('resilience.safe_retry.attempts', 2);
        $attemptLimit = min(3, max(1, $attemptLimit));

        for ($attempt = 1; $attempt <= $attemptLimit; $attempt++) {
            try {
                return [
                    'value' => $operation(),
                    'attempts' => $attempt,
                ];
            } catch (Throwable $exception) {
                $retryable = $shouldRetry !== null
                    ? (bool) $shouldRetry($exception, $attempt)
                    : ! ($exception instanceof Error || $exception instanceof LogicException);

                if (! $retryable || $attempt === $attemptLimit) {
                    throw new SafeRetryExhausted($attempt, $exception);
                }

                ($this->sleeper)($this->delayMilliseconds($attempt));
            }
        }

        throw new LogicException('The bounded retry loop ended unexpectedly.');
    }

    private function delayMilliseconds(int $failedAttempt): int
    {
        $base = max(0, (int) $this->config->get(
            'resilience.safe_retry.base_delay_ms',
            25,
        ));
        $maximum = max($base, (int) $this->config->get(
            'resilience.safe_retry.maximum_delay_ms',
            100,
        ));
        $jitterMaximum = max(0, (int) $this->config->get(
            'resilience.safe_retry.jitter_ms',
            15,
        ));
        $exponential = min($maximum, $base * (2 ** max(0, $failedAttempt - 1)));
        $jitter = ($this->jitter)(0, $jitterMaximum);

        return min($maximum + $jitterMaximum, $exponential + $jitter);
    }
}
