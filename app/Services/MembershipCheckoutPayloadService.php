<?php

namespace App\Services;

use App\Models\Membership;
use App\Models\MembershipPlan;

class MembershipCheckoutPayloadService
{
    /**
     * @return array<int, array{id:string,label:string}>
     */
    public function paymentMethods(): array
    {
        return [
            ['id' => 'bca_va', 'label' => 'BCA Virtual Account'],
            ['id' => 'qris', 'label' => 'QRIS'],
            ['id' => 'card', 'label' => 'Credit / Debit Card'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(
        Membership $membership,
        bool $replayed = false,
    ): array {
        $membership->loadMissing(['plan', 'transaction', 'user']);
        $transaction = $membership->transaction;
        $snapshot = is_array($transaction?->service_snapshot)
            ? $transaction->service_snapshot
            : [];
        $registration = is_array($snapshot['registration'] ?? null)
            ? $snapshot['registration']
            : [];
        $tier = (string) (
            $snapshot['plan_tier']
            ?? $membership->plan?->tier
            ?? MembershipPlan::TIER_HEMAT
        );
        $durationMonths = max(1, (int) (
            $snapshot['duration_months']
            ?? $membership->plan?->duration_months
            ?? 1
        ));
        $amount = (int) ($snapshot['price'] ?? $transaction?->amount ?? 0);
        $compareAtPrice = max(
            $amount,
            (int) (
                $snapshot['compare_at_price']
                ?? $membership->plan?->compare_at_price
                ?? $amount
            ),
        );
        $checkoutUrl = route(
            'checkout.membership.show',
            $membership,
            absolute: false,
        );
        $planIsActive = (bool) $membership->plan?->is_active;
        $isPayable = $membership->status === 'pending_payment'
            && $transaction?->payment_status === 'UNPAID'
            && $planIsActive
            && ($membership->registration_expires_at === null
                || $membership->registration_expires_at->isFuture());
        $mockEnabled = $this->mockPaymentEnabled();

        return [
            'id' => $membership->id,
            'status' => $membership->status,
            'start_date' => $membership->start_date->toDateString(),
            'end_date' => $membership->end_date->toDateString(),
            'registration_expires_at' => $membership
                ->registration_expires_at?->toIso8601String(),
            'replayed' => $replayed,
            'registration' => [
                'full_name' => $membership->customer_name
                    ?: ($registration['full_name'] ?? $membership->user?->name),
                'email' => $membership->registration_email
                    ?: ($registration['email'] ?? $membership->user?->email),
                'whatsapp' => $membership->registration_phone
                    ?: ($registration['whatsapp'] ?? $membership->user?->phone_number),
                'gender' => $membership->registration_gender
                    ?: ($registration['gender'] ?? null),
                'category' => $membership->registration_category
                    ?: ($registration['category'] ?? 'umum'),
            ],
            'plan' => [
                'id' => $membership->membership_plan_id,
                'name' => $snapshot['plan_name']
                    ?? $membership->plan?->name
                    ?? 'Membership Gym',
                'description' => $snapshot['plan_description']
                    ?? $membership->plan?->description,
                'tier' => $tier,
                'tier_label' => MembershipPlan::TIER_LABELS[$tier]
                    ?? ucfirst($tier),
                'price' => $amount,
                'compare_at_price' => $compareAtPrice,
                'discount_amount' => max(0, $compareAtPrice - $amount),
                'duration_months' => $durationMonths,
                'duration_label' => MembershipPlan::durationLabelFor(
                    $durationMonths,
                ),
                'image_url' => $snapshot['plan_image_url']
                    ?? $membership->plan?->cardImageUrl(),
                'is_active' => $planIsActive,
            ],
            'transaction' => $transaction ? [
                'id' => $transaction->id,
                'receipt_number' => $transaction->receipt_number,
                'amount' => (int) $transaction->amount,
                'payment_status' => $transaction->payment_status,
                'payment_method' => $transaction->payment_method,
                // Always generate this route from the owned subject so legacy
                // records can never send a user back to the pricing page.
                'checkout_url' => $checkoutUrl,
                'paid_at' => $transaction->paid_at?->toIso8601String(),
                'invoice_url' => $transaction->payment_status === 'PAID'
                    ? route('checkout.membership.invoice', $membership)
                    : null,
            ] : null,
            'payment' => [
                'payable' => $isPayable,
                'action' => $isPayable && $mockEnabled
                    ? route(
                        'membership.registrations.pay',
                        $membership,
                        absolute: false,
                    )
                    : null,
                'pay_url' => $isPayable && $mockEnabled
                    ? route(
                        'checkout.membership.pay',
                        $membership,
                        absolute: false,
                    )
                    : null,
                'methods' => $this->paymentMethods(),
                'mock_enabled' => $mockEnabled,
                'checkout_url' => $checkoutUrl,
                'poll_url' => route(
                    'membership.registrations.show',
                    $membership,
                    absolute: false,
                ),
                'success_url' => route(
                    'checkout.membership.success',
                    $membership,
                    absolute: false,
                ),
                'unavailable_reason' => $isPayable
                    ? null
                    : $this->unavailableReason(
                        $membership,
                        $transaction?->payment_status,
                        $planIsActive,
                    ),
                'expires_at' => $membership
                    ->registration_expires_at?->toIso8601String(),
                'server_now' => now()->toIso8601String(),
            ],
        ];
    }

    public function mockPaymentEnabled(): bool
    {
        return (bool) config('services.payment.mock', false)
            && app()->environment(['local', 'testing']);
    }

    private function unavailableReason(
        Membership $membership,
        ?string $paymentStatus,
        bool $planIsActive,
    ): ?string {
        if ($membership->status === 'active' && $paymentStatus === 'PAID') {
            return null;
        }

        if (! $planIsActive) {
            return 'Paket membership sudah tidak tersedia. Pilih paket aktif lainnya.';
        }

        if ($membership->registration_expires_at?->isPast()) {
            return 'Waktu pembayaran telah berakhir. Pilih kembali paket membership.';
        }

        return match ($membership->status) {
            'cancelled' => 'Pendaftaran membership telah dibatalkan.',
            'expired' => 'Masa membership telah berakhir.',
            default => $paymentStatus === 'FAILED'
                ? 'Transaksi pembayaran tidak dapat dilanjutkan.'
                : ($paymentStatus === 'EXPIRED'
                    ? 'Waktu pembayaran telah berakhir.'
                    : null),
        };
    }
}
