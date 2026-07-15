<?php

namespace Tests\Unit;

use App\Services\BookingSlotMerger;
use PHPUnit\Framework\TestCase;

class BookingSlotMergerTest extends TestCase
{
    public function test_it_merges_contiguous_slots_and_keeps_non_contiguous_slots_separate(): void
    {
        $slots = [
            [
                'facility_id' => 1,
                'facility_unit_id' => 10,
                'booking_date' => '2026-06-20',
                'start_time' => '09:00',
                'end_time' => '10:00',
                'subtotal_price' => 100000,
            ],
            [
                'facility_id' => 1,
                'facility_unit_id' => 10,
                'booking_date' => '2026-06-20',
                'start_time' => '08:00',
                'end_time' => '09:00',
                'subtotal_price' => 100000,
            ],
            [
                'facility_id' => 1,
                'facility_unit_id' => 10,
                'booking_date' => '2026-06-20',
                'start_time' => '11:00',
                'end_time' => '12:00',
                'subtotal_price' => 100000,
            ],
        ];

        $merged = (new BookingSlotMerger())->merge($slots);

        $this->assertCount(2, $merged);
        $this->assertSame('08:00', $merged[0]['start_time']);
        $this->assertSame('10:00', $merged[0]['end_time']);
        $this->assertSame(200000, $merged[0]['subtotal_price']);
        $this->assertCount(2, $merged[0]['source_slots']);
        $this->assertSame('11:00', $merged[1]['start_time']);
        $this->assertSame('12:00', $merged[1]['end_time']);
    }

    public function test_it_never_merges_slots_across_facilities_units_or_dates(): void
    {
        $slots = [
            [
                'facility_id' => 1,
                'facility_unit_id' => null,
                'booking_date' => '2026-06-20',
                'start_time' => '08:00',
                'end_time' => '09:00',
            ],
            [
                'facility_id' => 2,
                'facility_unit_id' => null,
                'booking_date' => '2026-06-20',
                'start_time' => '09:00',
                'end_time' => '10:00',
            ],
            [
                'facility_id' => 1,
                'facility_unit_id' => 99,
                'booking_date' => '2026-06-20',
                'start_time' => '09:00',
                'end_time' => '10:00',
            ],
            [
                'facility_id' => 1,
                'facility_unit_id' => null,
                'booking_date' => '2026-06-21',
                'start_time' => '09:00',
                'end_time' => '10:00',
            ],
        ];

        $merged = (new BookingSlotMerger())->merge($slots);

        $this->assertCount(4, $merged);
    }
}
