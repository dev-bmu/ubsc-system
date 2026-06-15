<?php

namespace Tests\Unit;

use App\Models\Facility;
use App\Models\FacilityPrice;
use App\Support\FacilityPriceResolver;
use Tests\TestCase;

class FacilityPriceResolverTest extends TestCase
{
    public function test_weekly_special_price_overrides_regular_inside_day_and_time(): void
    {
        $facility = $this->facilityWithPrices([
            $this->price('warga_ub', 'Reguler', 100000, 60, 'regular', [], null, null, null, null, 0),
            $this->price('warga_ub', 'Tarif Jumat Pagi', 75000, 60, 'weekly', ['Friday'], '08:00', '12:00', null, null, 1),
        ]);

        $resolver = new FacilityPriceResolver();

        $this->assertSame(75000, $resolver->priceForSlot($facility, 'warga_ub', '2026-05-22', '09:00', '10:00'));
        $this->assertSame(100000, $resolver->priceForSlot($facility, 'warga_ub', '2026-05-21', '09:00', '10:00'));
        $this->assertSame(100000, $resolver->priceForSlot($facility, 'warga_ub', '2026-05-22', '13:00', '14:00'));
    }

    public function test_date_range_special_price_respects_boundaries(): void
    {
        $facility = $this->facilityWithPrices([
            $this->price('umum', 'Reguler', 120000, 60, 'regular', [], null, null, null, null, 0),
            $this->price('umum', 'Event Kampus', 85000, 60, 'date_range', [], null, null, '2026-05-20', '2026-05-23', 1),
        ]);

        $resolver = new FacilityPriceResolver();

        $this->assertSame(85000, $resolver->priceForSlot($facility, 'umum', '2026-05-20', '10:00', '11:00'));
        $this->assertSame(85000, $resolver->priceForSlot($facility, 'umum', '2026-05-23', '10:00', '11:00'));
        $this->assertSame(120000, $resolver->priceForSlot($facility, 'umum', '2026-05-24', '10:00', '11:00'));
    }

    public function test_legacy_regular_price_without_reguler_label_still_works(): void
    {
        $facility = $this->facilityWithPrices([
            $this->price('umum', 'Per Jam', 105000, 60, 'regular', [], null, null, null, null, 0),
        ]);

        $resolver = new FacilityPriceResolver();

        $this->assertSame(105000, $resolver->priceForSlot($facility, 'umum', '2026-05-22', '09:00', '10:00'));
    }

    public function test_duration_uses_regular_price_before_special_prices(): void
    {
        $facility = $this->facilityWithPrices([
            $this->price('warga_ub', 'Tarif Sore', 80000, 60, 'weekly', ['Friday'], '16:00', '18:00', null, null, 1),
            $this->price('warga_ub', 'Reguler', 150000, 90, 'regular', [], null, null, null, null, 0),
        ]);

        $resolver = new FacilityPriceResolver();

        $this->assertSame(90, $resolver->durationForCategory($facility, 'warga_ub'));
    }

    /**
     * @param array<int, FacilityPrice> $prices
     */
    private function facilityWithPrices(array $prices): Facility
    {
        $facility = new Facility();
        $facility->setRelation('prices', collect($prices));

        return $facility;
    }

    /**
     * @param array<int, string> $days
     */
    private function price(
        string $category,
        string $label,
        int $price,
        int $duration,
        string $scheduleType,
        array $days,
        ?string $startsAt,
        ?string $endsAt,
        ?string $startsOn,
        ?string $endsOn,
        int $sortOrder,
    ): FacilityPrice {
        return new FacilityPrice([
            'user_category' => $category,
            'label' => $label,
            'price' => $price,
            'duration_minutes' => $duration,
            'schedule_type' => $scheduleType,
            'applicable_days' => $days,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'starts_on' => $startsOn,
            'ends_on' => $endsOn,
            'sort_order' => $sortOrder,
        ]);
    }
}
