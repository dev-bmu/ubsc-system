<?php

namespace App\Services\Monitoring;

use App\Models\MonitoringAlertDelivery;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class MonitoringAlertDispatcher
{
    public function __construct(private readonly MonitoringAlertTransport $transport) {}

    /** @return array{claimed:int,delivered:int,retried:int,dead:int,lease_lost:int} */
    public function dispatch(int $limit): array
    {
        $limit = min(500, max(1, $limit));
        $result = [
            'claimed' => 0,
            'delivered' => 0,
            'retried' => 0,
            'dead' => 0,
            'lease_lost' => 0,
        ];
        $result['dead'] += $this->recoverExhaustedClaims();

        while ($result['claimed'] < $limit) {
            $delivery = $this->claim();

            if ($delivery === null) {
                break;
            }

            $result['claimed']++;

            try {
                $this->transport->deliver($delivery);
                if ($this->markDelivered($delivery)) {
                    $result['delivered']++;
                } else {
                    $result['lease_lost']++;
                }
            } catch (Throwable $exception) {
                $outcome = $this->markFailed($delivery, $exception);
                $result[$outcome]++;
            }
        }

        return $result;
    }

    private function recoverExhaustedClaims(): int
    {
        $maxAttempts = max(1, (int) config('monitoring.alerting.max_attempts', 8));
        $staleBefore = now()->subSeconds(
            max(30, (int) config('monitoring.alerting.processing_stale_seconds', 180)),
        );

        $pending = MonitoringAlertDelivery::query()
            ->where('attempts', '>=', $maxAttempts)
            ->where('status', 'pending')
            ->update([
                'status' => 'dead',
                'claimed_at' => null,
                'claim_token' => null,
                'last_error_code' => 'delivery_lease_exhausted',
                'updated_at' => now(),
            ]);
        $processing = MonitoringAlertDelivery::query()
            ->where('attempts', '>=', $maxAttempts)
            ->where('status', 'processing')
            ->where('claimed_at', '<=', $staleBefore)
            ->update([
                'status' => 'dead',
                'claimed_at' => null,
                'claim_token' => null,
                'last_error_code' => 'delivery_lease_exhausted',
                'updated_at' => now(),
            ]);

        return $pending + $processing;
    }

    private function claim(): ?MonitoringAlertDelivery
    {
        $maxAttempts = max(1, (int) config('monitoring.alerting.max_attempts', 8));
        $staleBefore = now()->subSeconds(
            max(30, (int) config('monitoring.alerting.processing_stale_seconds', 180)),
        );

        return DB::transaction(function () use ($maxAttempts, $staleBefore): ?MonitoringAlertDelivery {
            $delivery = MonitoringAlertDelivery::query()
                ->where('attempts', '<', $maxAttempts)
                ->where('status', 'pending')
                ->where('available_at', '<=', now())
                ->orderBy('available_at')
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            if ($delivery === null) {
                $delivery = MonitoringAlertDelivery::query()
                    ->where('attempts', '<', $maxAttempts)
                    ->where('status', 'processing')
                    ->where('claimed_at', '<=', $staleBefore)
                    ->orderBy('claimed_at')
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->first();
            }

            if ($delivery === null) {
                return null;
            }

            $delivery->forceFill([
                'status' => 'processing',
                'attempts' => (int) $delivery->attempts + 1,
                'claimed_at' => now(),
                'claim_token' => (string) Str::uuid(),
                'last_attempt_at' => now(),
                'last_error_code' => null,
            ])->save();

            return $delivery->fresh();
        }, 3);
    }

    private function markDelivered(MonitoringAlertDelivery $delivery): bool
    {
        $updated = MonitoringAlertDelivery::query()
            ->whereKey($delivery->getKey())
            ->where('status', 'processing')
            ->where('claim_token', (string) $delivery->claim_token)
            ->update([
                'status' => 'delivered',
                'delivered_at' => now(),
                'claimed_at' => null,
                'claim_token' => null,
                'last_error_code' => null,
                'updated_at' => now(),
            ]);

        return $updated === 1;
    }

    /** @return 'dead'|'retried'|'lease_lost' */
    private function markFailed(MonitoringAlertDelivery $delivery, Throwable $exception): string
    {
        $maxAttempts = max(1, (int) config('monitoring.alerting.max_attempts', 8));
        $terminal = (int) $delivery->attempts >= $maxAttempts;
        $baseDelay = max(5, (int) config('monitoring.alerting.retry_base_seconds', 30));
        $delay = min(3_600, $baseDelay * (2 ** max(0, (int) $delivery->attempts - 1)));
        $safeMessage = preg_match(
            '/^(?:unsupported_channel|webhook_not_configured|webhook_http_[0-9]{3})$/',
            (string) $exception->getMessage(),
        ) === 1 ? (string) $exception->getMessage() : null;
        $errorCode = Str::limit(
            class_basename($exception).($safeMessage === null ? '' : ':'.$safeMessage),
            160,
            '',
        );

        $updated = MonitoringAlertDelivery::query()
            ->whereKey($delivery->getKey())
            ->where('status', 'processing')
            ->where('claim_token', (string) $delivery->claim_token)
            ->update([
                'status' => $terminal ? 'dead' : 'pending',
                'available_at' => $terminal ? $delivery->available_at : now()->addSeconds($delay),
                'claimed_at' => null,
                'claim_token' => null,
                'last_error_code' => $errorCode,
                'updated_at' => now(),
            ]);

        if ($updated !== 1) {
            return 'lease_lost';
        }

        return $terminal ? 'dead' : 'retried';
    }
}
