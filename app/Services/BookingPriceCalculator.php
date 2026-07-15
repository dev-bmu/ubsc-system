<?php

namespace App\Services;

use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Support\FacilityPriceResolver;

class BookingPriceCalculator
{
    public function __construct(private readonly FacilityPriceResolver $priceResolver)
    {
    }

    /**
     * @param array<int, array<string, mixed>> $mergedSlots
     * @return array{
     *     slots: array<int, array<string, mixed>>,
     *     subtotal_amount: int,
     *     discount_amount: int,
     *     transaction_fee: int,
     *     total_amount: int,
     *     price_category: string
     * }
     */
    public function calculate(array $mergedSlots, string $identityCategory, ?string $identityNumber): array
    {
        $priceCategory = $this->priceCategory($identityCategory, $identityNumber);
        $fallbackCategory = 'umum';
        $slots = [];
        $subtotal = 0;
        $standardSubtotal = 0;

        foreach ($mergedSlots as $slot) {
            $facility = Facility::with('prices')->findOrFail((int) $slot['facility_id']);
            $unit = ! empty($slot['facility_unit_id'])
                ? FacilityUnit::with('prices')->findOrFail((int) $slot['facility_unit_id'])
                : null;

            $amount = $this->calculateSlotAmount($facility, $unit, $priceCategory, $slot);
            $standardAmount = $priceCategory === $fallbackCategory
                ? $amount
                : $this->calculateSlotAmount($facility, $unit, $fallbackCategory, $slot);

            $subtotal += $amount;
            $standardSubtotal += $standardAmount;

            $slots[] = [
                ...$slot,
                'subtotal_price' => $amount,
                'standard_price' => $standardAmount,
            ];
        }

        $discount = max(0, $standardSubtotal - $subtotal);
        $transactionFee = (int) config('services.payment.transaction_fee', 6000);

        return [
            'slots' => $slots,
            'subtotal_amount' => $subtotal,
            'discount_amount' => $discount,
            'transaction_fee' => $transactionFee,
            'total_amount' => $subtotal + $transactionFee,
            'price_category' => $priceCategory,
        ];
    }

    private function priceCategory(string $identityCategory, ?string $identityNumber): string
    {
        return $identityCategory === 'warga_ub' && $identityNumber && preg_match('/^[0-9]{6,30}$/', $identityNumber)
            ? 'warga_ub'
            : 'umum';
    }

    /**
     * @param array<string, mixed> $slot
     */
    private function calculateSlotAmount(Facility $facility, ?FacilityUnit $unit, string $priceCategory, array $slot): int
    {
        $price = $this->priceResolver->resolveForUnit(
            $facility,
            $unit,
            $priceCategory,
            (string) $slot['booking_date'],
            (string) $slot['start_time'],
            (string) $slot['end_time'],
        );

        if (! $price) {
            return 0;
        }

        $durationMinutes = $this->minutes((string) $slot['end_time']) - $this->minutes((string) $slot['start_time']);
        $baseDuration = (int) ($price->duration_minutes ?: 60);

        return (int) round(($durationMinutes / $baseDuration) * (int) $price->price);
    }

    private function minutes(string $time): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', substr($time, 0, 5)));

        return ($hours * 60) + $minutes;
    }
}
