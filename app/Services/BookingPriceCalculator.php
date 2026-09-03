<?php

namespace App\Services;

use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Support\FacilityPriceResolver;
use Illuminate\Validation\ValidationException;

class BookingPriceCalculator
{
    public function __construct(private readonly FacilityPriceResolver $priceResolver) {}

    /**
     * @param  array<int, array<string, mixed>>  $mergedSlots
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
        $facilityIds = collect($mergedSlots)
            ->pluck('facility_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->unique()
            ->values();
        $unitIds = collect($mergedSlots)
            ->pluck('facility_unit_id')
            ->filter(static fn (mixed $id): bool => $id !== null)
            ->map(static fn (mixed $id): int => (int) $id)
            ->unique()
            ->values();
        $facilities = Facility::query()
            ->with('prices')
            ->whereKey($facilityIds)
            ->get()
            ->keyBy('id');
        $units = FacilityUnit::query()
            ->with('prices')
            ->whereKey($unitIds)
            ->get()
            ->keyBy('id');

        foreach ($mergedSlots as $slot) {
            /** @var Facility|null $facility */
            $facility = $facilities->get((int) $slot['facility_id']);
            $unit = ! empty($slot['facility_unit_id'])
                ? $units->get((int) $slot['facility_unit_id'])
                : null;

            if (! $facility
                || ($unit && (int) $unit->facility_id !== (int) $facility->id)
                || (! empty($slot['facility_unit_id']) && ! $unit)) {
                throw ValidationException::withMessages([
                    'items' => 'Fasilitas atau unit harga tidak lagi tersedia. Reservasi tidak dibuat.',
                ]);
            }

            $sourceSlots = isset($slot['source_slots']) && is_array($slot['source_slots'])
                ? array_values($slot['source_slots'])
                : [$slot];
            $amount = 0;
            $standardAmount = 0;
            $sourcePricing = [];

            foreach ($sourceSlots as $sourceSlot) {
                $sourceAmount = $this->calculateSlotAmount(
                    $facility,
                    $unit,
                    $priceCategory,
                    $sourceSlot,
                );
                $sourceStandardAmount = $priceCategory === $fallbackCategory
                    ? $sourceAmount
                    : $this->calculateSlotAmount(
                        $facility,
                        $unit,
                        $fallbackCategory,
                        $sourceSlot,
                    );

                $amount += $sourceAmount['amount'];
                $standardAmount += $sourceStandardAmount['amount'];
                $sourcePricing[] = [
                    'start_time' => substr((string) $sourceSlot['start_time'], 0, 5),
                    'end_time' => substr((string) $sourceSlot['end_time'], 0, 5),
                    'price_rule_id' => $sourceAmount['price_rule_id'],
                    'price_rule_type' => $sourceAmount['price_rule_type'],
                    'amount' => $sourceAmount['amount'],
                    'standard_amount' => $sourceStandardAmount['amount'],
                    'components' => $sourceAmount['components'],
                ];
            }

            $subtotal += $amount;
            $standardSubtotal += $standardAmount;

            $slots[] = [
                ...$slot,
                'subtotal_price' => $amount,
                'standard_price' => $standardAmount,
                'source_pricing' => $sourcePricing,
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
     * @param  array<string, mixed>  $slot
     */
    private function calculateSlotAmount(Facility $facility, ?FacilityUnit $unit, string $priceCategory, array $slot): array
    {
        $startMinutes = $this->minutes((string) $slot['start_time']);
        $endMinutes = $this->minutes((string) $slot['end_time']);
        $durationMinutes = $endMinutes - $startMinutes;
        if ($durationMinutes <= 0) {
            throw ValidationException::withMessages([
                'items' => 'Rentang waktu reservasi tidak valid.',
            ]);
        }

        $boundaries = $this->pricingBoundaries($facility, $unit, $startMinutes, $endMinutes);
        $amount = 0;
        $components = [];

        for ($index = 0; $index < count($boundaries) - 1; $index++) {
            $componentStart = $boundaries[$index];
            $componentEnd = $boundaries[$index + 1];
            $componentStartTime = $this->formatMinutes($componentStart);
            $componentEndTime = $this->formatMinutes($componentEnd);
            $price = $this->priceResolver->resolveForUnit(
                $facility,
                $unit,
                $priceCategory,
                (string) $slot['booking_date'],
                $componentStartTime,
                $componentEndTime,
            );

            if (! $price) {
                throw ValidationException::withMessages([
                    'items' => "Harga {$priceCategory} untuk {$facility->name} belum dikonfigurasi. Reservasi tidak dibuat.",
                ]);
            }

            $baseDuration = max(1, (int) ($price->duration_minutes ?: 60));
            $componentAmount = (int) round(
                (($componentEnd - $componentStart) / $baseDuration) * (int) $price->price,
            );
            $amount += $componentAmount;
            $components[] = [
                'start_time' => $componentStartTime,
                'end_time' => $componentEndTime,
                'price_rule_id' => (int) $price->id,
                'price_rule_type' => $price instanceof \App\Models\FacilityUnitPrice
                    ? 'facility_unit_price'
                    : 'facility_price',
                'amount' => $componentAmount,
            ];
        }

        $firstComponent = $components[0];

        return [
            'amount' => $amount,
            'price_rule_id' => count($components) === 1 ? $firstComponent['price_rule_id'] : null,
            'price_rule_type' => count($components) === 1 ? $firstComponent['price_rule_type'] : 'composite',
            'components' => $components,
        ];
    }

    public function calculateResourceAmount(
        Facility $facility,
        ?FacilityUnit $unit,
        string $priceCategory,
        string $bookingDate,
        string $startTime,
        string $endTime,
    ): int {
        return $this->calculateSlotAmount($facility, $unit, $priceCategory, [
            'booking_date' => $bookingDate,
            'start_time' => $startTime,
            'end_time' => $endTime,
        ])['amount'];
    }

    /**
     * Pricing rules may begin or end inside one configured source slot. Split
     * at those edges before resolving so a long slot cannot silently inherit
     * the first or regular tariff for its full duration.
     *
     * @return array<int, int>
     */
    private function pricingBoundaries(
        Facility $facility,
        ?FacilityUnit $unit,
        int $startMinutes,
        int $endMinutes,
    ): array {
        $prices = collect($facility->relationLoaded('prices')
            ? $facility->prices
            : $facility->prices()->get());

        if ($unit) {
            $prices = $prices->concat(
                $unit->relationLoaded('prices')
                    ? $unit->prices
                    : $unit->prices()->get(),
            );
        }

        return $prices
            ->flatMap(fn ($price): array => [$price->starts_at, $price->ends_at])
            ->filter()
            ->map(fn ($time): int => $this->minutes((string) $time))
            ->filter(fn (int $minute): bool => $minute > $startMinutes && $minute < $endMinutes)
            ->push($startMinutes, $endMinutes)
            ->unique()
            ->sort()
            ->values()
            ->all();
    }

    private function minutes(string $time): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', substr($time, 0, 5)));

        return ($hours * 60) + $minutes;
    }

    private function formatMinutes(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }
}
