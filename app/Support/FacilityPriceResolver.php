<?php

namespace App\Support;

use App\Models\Facility;
use App\Models\FacilityPrice;
use App\Models\FacilityUnit;
use App\Models\FacilityUnitPrice;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class FacilityPriceResolver
{
    public function resolve(Facility $facility, string $userCategory, Carbon|string $date, string $startTime, string $endTime): ?FacilityPrice
    {
        $bookingDate = $date instanceof Carbon ? $date->copy() : Carbon::parse($date);
        $prices = $facility->relationLoaded('prices')
            ? $facility->prices
            : $facility->prices()->get();

        $categoryPrices = $prices
            ->where('user_category', $userCategory)
            ->sortBy(fn (FacilityPrice $price) => $price->sort_order ?? 0)
            ->values();

        $special = $categoryPrices
            ->filter(fn (FacilityPrice $price) => $price->label !== 'Reguler')
            ->first(fn (FacilityPrice $price) => $this->matches($price, $bookingDate, $startTime, $endTime));

        if ($special) {
            return $special;
        }

        return $categoryPrices->firstWhere('label', 'Reguler')
            ?? $categoryPrices->first();
    }

    public function priceForSlot(Facility $facility, string $userCategory, Carbon|string $date, string $startTime, string $endTime): int
    {
        $price = $this->resolve($facility, $userCategory, $date, $startTime, $endTime);

        return $price ? (int) $price->price : 0;
    }

    public function resolveForUnit(Facility $facility, ?FacilityUnit $unit, string $userCategory, Carbon|string $date, string $startTime, string $endTime): FacilityPrice|FacilityUnitPrice|null
    {
        if (! $unit || ! $this->unitHasUsableCustomPrices($unit)) {
            return $this->resolve($facility, $userCategory, $date, $startTime, $endTime);
        }

        $bookingDate = $date instanceof Carbon ? $date->copy() : Carbon::parse($date);
        $categoryPrices = $this->unitPrices($unit)
            ->where('user_category', $userCategory)
            ->sortBy(fn (FacilityUnitPrice $price) => $price->sort_order ?? 0)
            ->values();

        $special = $categoryPrices
            ->filter(fn (FacilityUnitPrice $price) => $price->label !== 'Reguler')
            ->first(fn (FacilityUnitPrice $price) => $this->matches($price, $bookingDate, $startTime, $endTime));

        if ($special) {
            return $special;
        }

        return $categoryPrices->firstWhere('label', 'Reguler')
            ?? $categoryPrices->first()
            ?? $this->resolve($facility, $userCategory, $date, $startTime, $endTime);
    }

    public function priceForSlotForUnit(Facility $facility, ?FacilityUnit $unit, string $userCategory, Carbon|string $date, string $startTime, string $endTime): int
    {
        $price = $this->resolveForUnit($facility, $unit, $userCategory, $date, $startTime, $endTime);

        return $price ? (int) $price->price : 0;
    }

    public function durationForCategory(Facility $facility, string $userCategory): int
    {
        $prices = $facility->relationLoaded('prices')
            ? $facility->prices
            : $facility->prices()->get();

        $price = $prices
            ->where('user_category', $userCategory)
            ->sortBy(fn (FacilityPrice $item) => $item->sort_order ?? 0)
            ->firstWhere('label', 'Reguler')
            ?? $prices->where('user_category', $userCategory)->first()
            ?? $prices->sortBy(fn (FacilityPrice $item) => $item->sort_order ?? 0)->first();

        return (int) ($price?->duration_minutes ?: 60);
    }

    public function durationForCategoryForUnit(Facility $facility, ?FacilityUnit $unit, string $userCategory): int
    {
        if (! $unit || ! $this->unitHasUsableCustomPrices($unit)) {
            return $this->durationForCategory($facility, $userCategory);
        }

        $prices = $this->unitPrices($unit);

        $price = $prices
            ->where('user_category', $userCategory)
            ->sortBy(fn (FacilityUnitPrice $item) => $item->sort_order ?? 0)
            ->firstWhere('label', 'Reguler')
            ?? $prices->where('user_category', $userCategory)->first()
            ?? $prices->sortBy(fn (FacilityUnitPrice $item) => $item->sort_order ?? 0)->first();

        return (int) ($price?->duration_minutes ?: $this->durationForCategory($facility, $userCategory));
    }

    private function matches(FacilityPrice|FacilityUnitPrice $price, Carbon $date, string $startTime, string $endTime): bool
    {
        $scheduleType = $price->schedule_type ?: 'always';

        if ($scheduleType === 'regular') {
            return false;
        }

        if ($scheduleType === 'weekly') {
            $days = $price->applicable_days ?? [];
            if ($days !== [] && ! in_array($date->format('l'), $days, true)) {
                return false;
            }
        }

        if ($scheduleType === 'date_range') {
            if ($price->starts_on && $date->lt($price->starts_on->copy()->startOfDay())) {
                return false;
            }

            if ($price->ends_on && $date->gt($price->ends_on->copy()->endOfDay())) {
                return false;
            }
        }

        return $this->matchesTimeRange($price, $startTime, $endTime);
    }

    private function matchesTimeRange(FacilityPrice|FacilityUnitPrice $price, string $startTime, string $endTime): bool
    {
        if (! $price->starts_at && ! $price->ends_at) {
            return true;
        }

        $slotStart = $this->minutes($startTime);
        $slotEnd = $this->minutes($endTime);
        $rangeStart = $this->minutes((string) ($price->starts_at ?? '00:00'));
        $rangeEnd = $this->minutes((string) ($price->ends_at ?? '23:59'));

        if ($rangeEnd <= $rangeStart) {
            return $slotStart >= $rangeStart || $slotEnd <= $rangeEnd;
        }

        return $slotStart >= $rangeStart && $slotEnd <= $rangeEnd;
    }

    private function minutes(string $time): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', substr($time, 0, 5)));

        return ($hours * 60) + $minutes;
    }

    private function unitHasUsableCustomPrices(FacilityUnit $unit): bool
    {
        if (! $unit->use_custom_pricing) {
            return false;
        }

        return $this->unitPrices($unit)->isNotEmpty();
    }

    /**
     * @return Collection<int, FacilityUnitPrice>
     */
    private function unitPrices(FacilityUnit $unit): Collection
    {
        return $unit->relationLoaded('prices')
            ? $unit->prices
            : $unit->prices()->get();
    }
}
