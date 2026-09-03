<?php

namespace Tests\Unit;

use App\Exceptions\SafeRetryExhausted;
use App\Services\Resilience\SafeRetry;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class SafeRetryTest extends TestCase
{
    public function test_repeatable_operation_uses_bounded_exponential_backoff(): void
    {
        $sleeps = [];
        $calls = 0;
        $retry = new SafeRetry(
            new Repository([
                'resilience' => [
                    'safe_retry' => [
                        'attempts' => 3,
                        'base_delay_ms' => 10,
                        'maximum_delay_ms' => 100,
                        'jitter_ms' => 0,
                    ],
                ],
            ]),
            static function (int $milliseconds) use (&$sleeps): void {
                $sleeps[] = $milliseconds;
            },
        );

        $result = $retry->repeatable(function () use (&$calls): string {
            $calls++;

            if ($calls < 3) {
                throw new RuntimeException('temporary');
            }

            return 'ok';
        });

        self::assertSame('ok', $result['value']);
        self::assertSame(3, $result['attempts']);
        self::assertSame([10, 20], $sleeps);
    }

    public function test_non_retryable_failure_stops_immediately_and_preserves_cause(): void
    {
        $calls = 0;
        $retry = new SafeRetry(new Repository([
            'resilience' => ['safe_retry' => ['attempts' => 3]],
        ]));

        try {
            $retry->repeatable(
                function () use (&$calls): never {
                    $calls++;

                    throw new RuntimeException('permanent');
                },
                static fn (): bool => false,
            );

            self::fail('The exhausted retry exception was not thrown.');
        } catch (SafeRetryExhausted $exception) {
            self::assertSame(1, $exception->attempts);
            self::assertSame(1, $calls);
            self::assertInstanceOf(RuntimeException::class, $exception->getPrevious());
            self::assertSame('permanent', $exception->getPrevious()?->getMessage());
        }
    }

    public function test_caller_can_reduce_attempts_for_latency_sensitive_probes(): void
    {
        $calls = 0;
        $retry = new SafeRetry(new Repository([
            'resilience' => ['safe_retry' => ['attempts' => 3]],
        ]));

        try {
            $retry->repeatable(
                function () use (&$calls): never {
                    $calls++;

                    throw new RuntimeException('temporary');
                },
                attemptLimit: 1,
            );

            self::fail('The bounded retry exception was not thrown.');
        } catch (SafeRetryExhausted $exception) {
            self::assertSame(1, $exception->attempts);
            self::assertSame(1, $calls);
        }
    }
}
