<?php

namespace App\Services;

use App\Models\BookingOrder;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class BookingCheckoutIntentService
{
    /**
     * Build a server-authoritative fingerprint for one logical cart. Display
     * labels, client prices, and contact data are intentionally excluded.
     *
     * @param  array<int, array<string, mixed>>  $items
     */
    public function fingerprint(int $userId, array $items): string
    {
        $canonical = collect($items)
            ->map(fn (array $item): array => [
                'facility_id' => (int) $item['facility_id'],
                'facility_unit_id' => isset($item['facility_unit_id'])
                    ? (int) $item['facility_unit_id']
                    : null,
                'booking_date' => trim((string) $item['booking_date']),
                'start_time' => substr(trim((string) $item['start_time']), 0, 5),
                'end_time' => substr(trim((string) $item['end_time']), 0, 5),
            ])
            ->sortBy(fn (array $item): string => implode('|', [
                str_pad((string) $item['facility_id'], 20, '0', STR_PAD_LEFT),
                $item['facility_unit_id'] === null
                    ? 'parent'
                    : str_pad((string) $item['facility_unit_id'], 20, '0', STR_PAD_LEFT),
                $item['booking_date'],
                $item['start_time'],
                $item['end_time'],
            ]))
            ->values()
            ->all();

        return hash('sha256', json_encode([
            'version' => 1,
            'user_id' => $userId,
            'items' => $canonical,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
    }

    /**
     * Resolve an idempotent retry. The caller must already hold a row lock on
     * the authenticated user, which serializes same-user multi-tab requests.
     */
    public function resolveExisting(
        int $userId,
        string $idempotencyKey,
        string $fingerprint,
        ?Carbon $at = null,
    ): ?BookingOrder {
        $at ??= now();

        $sameKey = BookingOrder::query()
            ->where('idempotency_key', $idempotencyKey)
            ->lockForUpdate()
            ->first();

        if ($sameKey) {
            $this->assertReplayMatches($sameKey, $userId, $fingerprint);

            return $sameKey;
        }

        // A storage-restricted browser can very rarely create different keys
        // in two tabs. The server still deduplicates the same live intent.
        return BookingOrder::query()
            ->where('user_id', $userId)
            ->where('request_fingerprint', $fingerprint)
            ->whereIn('status', ['draft', 'pending_payment'])
            ->where(function ($query) use ($at): void {
                $query
                    ->whereNull('expires_at')
                    ->orWhere('expires_at', '>', $at);
            })
            ->latest('id')
            ->lockForUpdate()
            ->first();
    }

    public function recoverUniqueKeyWinner(
        int $userId,
        string $idempotencyKey,
        string $fingerprint,
    ): ?BookingOrder {
        $winner = BookingOrder::query()
            ->where('idempotency_key', $idempotencyKey)
            ->first();

        if (! $winner) {
            return null;
        }

        $this->assertReplayMatches($winner, $userId, $fingerprint);

        return $winner;
    }

    public function assertOpenHoldLimit(int $userId, ?Carbon $at = null): void
    {
        $at ??= now();
        $maximum = max(1, (int) config('services.payment.booking_max_open_holds', 2));

        $openHolds = BookingOrder::query()
            ->where('user_id', $userId)
            ->whereIn('status', ['draft', 'pending_payment'])
            ->where(function ($query) use ($at): void {
                $query
                    ->whereNull('expires_at')
                    ->orWhere('expires_at', '>', $at);
            })
            ->count();

        if ($openHolds >= $maximum) {
            throw ValidationException::withMessages([
                'items' => "Selesaikan atau tunggu {$maximum} reservasi aktif berakhir sebelum membuat reservasi baru.",
            ]);
        }
    }

    private function assertReplayMatches(
        BookingOrder $order,
        int $userId,
        string $fingerprint,
    ): void {
        if ((int) $order->user_id !== $userId
            || ! is_string($order->request_fingerprint)
            || ! hash_equals($order->request_fingerprint, $fingerprint)) {
            throw ValidationException::withMessages([
                'idempotency_key' => 'Kunci checkout sudah digunakan untuk permintaan lain. Muat ulang halaman dan coba kembali.',
            ]);
        }
    }
}
