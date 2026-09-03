<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class BookingAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_booking_page_is_not_guarded_by_a_shared_public_rate_limiter(): void
    {
        $route = Route::getRoutes()->getByName('booking');

        $this->assertNotNull($route);
        $this->assertFalse(
            collect($route->gatherMiddleware())->contains(
                fn (string $middleware): bool => str_starts_with($middleware, 'throttle:')
                    || str_contains($middleware, 'ThrottleRequests'),
            ),
        );
    }

    public function test_range_availability_changes_counts_and_start_times_per_date(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $firstDate = Carbon::parse('2026-07-21');
        $secondDate = Carbon::parse('2026-07-22');
        $facility = $this->facility('Lapangan Tenis', 'lapangan-tenis', 1, [
            $firstDate->format('l') => ['08:00', '09:00'],
            $secondDate->format('l') => ['10:00'],
        ]);
        $this->openMonth($firstDate);
        $this->booking($facility, $firstDate, '08:00', '09:00');

        $response = $this->getJson(route('booking.availability', [
            'from' => $firstDate->toDateString(),
            'days' => 2,
        ]))
            ->assertOk()
            ->assertJsonPath('today', '2026-07-20')
            ->assertJsonPath('from', '2026-07-21')
            ->assertJsonPath('days', 2)
            ->assertJsonPath('dates.2026-07-21.summary.available_facility_count', 1)
            ->assertJsonPath('dates.2026-07-21.summary.available_slot_count', 1)
            ->assertJsonPath('dates.2026-07-21.facilities.0.status', 'limited')
            ->assertJsonPath('dates.2026-07-21.facilities.0.available_start_times', ['09:00'])
            ->assertJsonPath('dates.2026-07-21.facilities.0.next_available_at', '09:00')
            ->assertJsonPath('dates.2026-07-22.summary.available_slot_count', 1)
            ->assertJsonPath('dates.2026-07-22.facilities.0.status', 'available')
            ->assertJsonPath('dates.2026-07-22.facilities.0.available_start_times', ['10:00']);

        $response->assertJsonStructure([
            'timezone',
            'generated_at',
            'dates' => [
                '2026-07-21' => [
                    'date',
                    'closed',
                    'reason',
                    'summary',
                    'facilities',
                ],
                '2026-07-22',
            ],
        ]);
    }

    public function test_closed_date_and_closed_month_return_compact_closed_summaries(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $closedDate = Carbon::parse('2026-07-25');
        $closedMonthDate = Carbon::parse('2026-08-02');
        $facility = $this->facility('Lapangan Badminton', 'lapangan-badminton');
        $this->openMonth($closedDate, [$closedDate->toDateString()]);

        $this->getJson(route('booking.availability', [
            'date' => $closedDate->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-07-25.closed', true)
            ->assertJsonPath('dates.2026-07-25.reason', 'date_closed')
            ->assertJsonPath('dates.2026-07-25.summary.available_facility_count', 0)
            ->assertJsonPath('dates.2026-07-25.facilities.0.facility_id', $facility->id)
            ->assertJsonPath('dates.2026-07-25.facilities.0.status', 'closed')
            ->assertJsonPath('dates.2026-07-25.facilities.0.reason', 'date_closed')
            ->assertJsonPath('dates.2026-07-25.facilities.0.available_start_times', []);

        $this->getJson(route('booking.availability', [
            'date' => $closedMonthDate->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-08-02.closed', true)
            ->assertJsonPath('dates.2026-08-02.reason', 'month_closed')
            ->assertJsonPath('dates.2026-08-02.facilities.0.status', 'closed')
            ->assertJsonPath('dates.2026-08-02.facilities.0.reason', 'month_closed');
    }

    public function test_legacy_parent_booking_blocks_every_active_unit(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility('Lapangan Tenis', 'lapangan-tenis', 1, [
            $date->format('l') => ['08:00'],
        ]);
        $firstUnit = $facility->units()->create([
            'name' => 'Lapangan 1',
            'is_active' => true,
        ]);
        $secondUnit = $facility->units()->create([
            'name' => 'Lapangan 2',
            'is_active' => true,
        ]);
        $this->openMonth($date);
        $this->booking($facility, $date, '08:00', '09:00', 1, null);

        $this->getJson(route('booking.availability', [
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-07-21.summary.available_facility_count', 0)
            ->assertJsonPath('dates.2026-07-21.facilities.0.status', 'full')
            ->assertJsonPath('dates.2026-07-21.facilities.0.available_slot_count', 0)
            ->assertJsonPath('dates.2026-07-21.facilities.0.units.0.facility_unit_id', $firstUnit->id)
            ->assertJsonPath('dates.2026-07-21.facilities.0.units.0.status', 'full')
            ->assertJsonPath('dates.2026-07-21.facilities.0.units.1.facility_unit_id', $secondUnit->id)
            ->assertJsonPath('dates.2026-07-21.facilities.0.units.1.status', 'full');
    }

    public function test_partial_capacity_keeps_remaining_slot_available_and_marks_summary_limited(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility('Kelas Serbaguna', 'kelas-serbaguna', 3, [
            $date->format('l') => ['08:00', '09:00'],
        ]);
        $facility->category()->update(['name' => 'Kelas', 'slug' => 'kelas']);
        $this->openMonth($date);
        $this->booking($facility, $date, '08:00', '09:00', 3);
        $this->booking($facility, $date, '09:00', '10:00', 2);

        $this->getJson(route('booking.availability', [
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-07-21.facilities.0.status', 'limited')
            ->assertJsonPath('dates.2026-07-21.facilities.0.capacity', 3)
            ->assertJsonPath('dates.2026-07-21.facilities.0.shared_capacity', true)
            ->assertJsonPath('dates.2026-07-21.facilities.0.available_slot_count', 1)
            ->assertJsonPath('dates.2026-07-21.facilities.0.total_slot_count', 2)
            ->assertJsonPath('dates.2026-07-21.facilities.0.available_start_times', ['09:00']);

        $slots = $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('closed', false)
            ->assertJsonPath('requires_unit', false)
            ->json('slots');

        $this->assertSame('booked', $this->slot($slots, '08:00')['status']);
        $this->assertSame('fully_booked', $this->slot($slots, '08:00')['reason']);
        $this->assertSame(3, $this->slot($slots, '08:00')['capacity']);
        $this->assertTrue($this->slot($slots, '08:00')['shared_capacity']);
        $this->assertSame(3, $this->slot($slots, '08:00')['occupied']);
        $this->assertSame(0, $this->slot($slots, '08:00')['remaining']);
        $this->assertSame('available', $this->slot($slots, '09:00')['status']);
        $this->assertSame(2, $this->slot($slots, '09:00')['occupied']);
        $this->assertSame(1, $this->slot($slots, '09:00')['remaining']);
    }

    public function test_elapsed_slots_today_are_not_reported_as_available(): void
    {
        Carbon::setTestNow('2026-07-20 08:30:00');

        $date = Carbon::parse('2026-07-20');
        $facility = $this->facility('Lapangan Basket', 'lapangan-basket', 1, [
            $date->format('l') => ['08:00', '09:00'],
        ]);
        $this->openMonth($date);

        $this->getJson(route('booking.availability', [
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-07-20.facilities.0.status', 'limited')
            ->assertJsonPath('dates.2026-07-20.facilities.0.available_slot_count', 1)
            ->assertJsonPath('dates.2026-07-20.facilities.0.available_start_times', ['09:00'])
            ->assertJsonPath('dates.2026-07-20.facilities.0.next_available_at', '09:00');

        $slots = $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->json('slots');

        $this->assertSame('booked', $this->slot($slots, '08:00')['status']);
        $this->assertSame('elapsed', $this->slot($slots, '08:00')['reason']);
        $this->assertSame(0, $this->slot($slots, '08:00')['remaining']);
        $this->assertSame('available', $this->slot($slots, '09:00')['status']);
    }

    public function test_booking_day_boundary_uses_venue_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-24 23:30:00', 'UTC'));

        $venueDate = Carbon::parse('2026-07-25', 'Asia/Jakarta');
        $this->facility('Lapangan Padel', 'lapangan-padel', 1, [
            $venueDate->format('l') => ['08:00'],
        ]);
        $this->openMonth($venueDate);

        $this->getJson(route('booking.availability', [
            'date' => $venueDate->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('today', '2026-07-25')
            ->assertJsonPath('timezone', 'Asia/Jakarta')
            ->assertJsonPath(
                'dates.2026-07-25.facilities.0.available_start_times',
                ['08:00'],
            );
    }

    /**
     * @param  array<string, array<int, string>>|null  $activeSlots
     */
    private function facility(
        string $name,
        string $slug,
        int $capacity = 1,
        ?array $activeSlots = null,
    ): Facility {
        $category = FacilityCategory::firstOrCreate(
            ['slug' => 'arena'],
            ['name' => 'Arena'],
        );
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => $name,
            'slug' => $slug,
            'capacity' => $capacity,
            'active_slots' => $activeSlots,
            'is_active' => true,
        ]);

        $facility->prices()->create([
            'user_category' => 'umum',
            'label' => 'Reguler',
            'price' => 100000,
            'duration_minutes' => 60,
            'schedule_type' => 'regular',
            'sort_order' => 0,
        ]);

        return $facility;
    }

    /**
     * @param  array<int, string>  $closedDates
     */
    private function openMonth(Carbon $date, array $closedDates = []): void
    {
        BookingSchedule::updateOrCreate(
            ['month' => $date->month, 'year' => $date->year],
            ['is_open' => true, 'closed_dates' => $closedDates],
        );
    }

    private function booking(
        Facility $facility,
        Carbon $date,
        string $start,
        string $end,
        int $pax = 1,
        ?int $unitId = null,
    ): Booking {
        return Booking::create([
            'user_id' => null,
            'customer_name' => 'Pengguna',
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitId,
            'booking_date' => $date->toDateString(),
            'start_time' => $start,
            'end_time' => $end,
            'pax' => $pax,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $slots
     * @return array<string, mixed>
     */
    private function slot(array $slots, string $startTime): array
    {
        $slot = collect($slots)->firstWhere('start_time', $startTime);

        $this->assertIsArray($slot);

        return $slot;
    }
}
