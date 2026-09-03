<?php

namespace App\Services\Payments;

use Illuminate\Validation\ValidationException;

/**
 * One server-authoritative source for payment-channel availability.
 *
 * A checkout must never reserve scarce inventory unless this registry can
 * return at least one channel that has a callable backend implementation.
 * The local mock is intentionally unavailable outside local/testing; a real
 * provider can later be added here without weakening that fail-closed rule.
 */
final class PaymentChannelRegistry
{
    /**
     * @return list<array{id:string,label:string}>
     */
    public function bookingMethods(): array
    {
        if (! $this->mockEnabled()) {
            return [];
        }

        return [
            ['id' => 'bca_va', 'label' => 'BCA Virtual Account'],
            ['id' => 'qris', 'label' => 'QRIS'],
            ['id' => 'card', 'label' => 'Credit / Debit Card'],
        ];
    }

    /**
     * @return list<string>
     */
    public function bookingMethodIds(): array
    {
        return array_values(array_map(
            static fn (array $method): string => $method['id'],
            $this->bookingMethods(),
        ));
    }

    public function bookingCheckoutAvailable(): bool
    {
        return $this->bookingMethods() !== [];
    }

    public function assertBookingCheckoutAvailable(): void
    {
        if ($this->bookingCheckoutAvailable()) {
            return;
        }

        throw ValidationException::withMessages([
            'checkout' => 'Pembayaran reservasi belum tersedia. Tidak ada jadwal yang ditahan; silakan coba kembali setelah layanan pembayaran aktif.',
        ]);
    }

    public function mockEnabled(): bool
    {
        return (bool) config('services.payment.mock', false)
            && app()->environment(['local', 'testing']);
    }
}
