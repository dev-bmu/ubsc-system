<?php

namespace Tests\Feature;

use App\Models\BookingSchedule;
use App\Models\User;
use App\Services\BookingCalendarService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class BookingCalendarMetadataTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_availability_exposes_admin_schedule_window_without_changing_existing_contract(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-25 08:00:00', 'Asia/Jakarta'));

        BookingSchedule::create([
            'month' => 7,
            'year' => 2026,
            'is_open' => true,
            'closed_dates' => ['2026-07-27'],
        ]);

        $this->getJson(route('booking.availability', [
            'from' => '2026-07-25',
            'days' => 9,
        ]))
            ->assertOk()
            ->assertJsonPath('today', '2026-07-25')
            ->assertJsonPath('from', '2026-07-25')
            ->assertJsonPath('days', 9)
            ->assertJsonStructure([
                'dates' => [
                    '2026-07-25' => [
                        'date',
                        'closed',
                        'reason',
                        'summary',
                        'facilities',
                    ],
                ],
                'calendar' => [
                    'locale',
                    'timezone',
                    'week_starts_on',
                    'weekend_days',
                    'schedule_revision',
                    'window',
                    'open_months',
                    'months',
                    'holidays',
                    'holiday_sources',
                ],
            ])
            ->assertJsonPath('calendar.locale', 'id-ID')
            ->assertJsonPath('calendar.timezone', 'Asia/Jakarta')
            ->assertJsonPath('calendar.week_starts_on', 1)
            ->assertJsonPath('calendar.weekend_days', [0])
            ->assertJsonPath('calendar.open_months', ['2026-07'])
            ->assertJsonPath('calendar.window.min_date', '2026-07-25')
            ->assertJsonPath('calendar.window.max_date', '2026-07-31')
            ->assertJsonPath('calendar.window.default_date', '2026-07-25')
            ->assertJsonPath('calendar.window.first_open_month', '2026-07')
            ->assertJsonPath('calendar.window.last_open_month', '2026-07')
            ->assertJsonPath('calendar.months.2026-07.is_open', true)
            ->assertJsonPath('calendar.months.2026-07.closed_dates', ['2026-07-27'])
            ->assertJsonPath('calendar.months.2026-08.is_open', false)
            ->assertJsonPath('calendar.holidays.2026-08-17.name', 'Proklamasi Kemerdekaan')
            ->assertJsonPath('calendar.holidays.2026-08-17.type', 'national_holiday')
            ->assertJsonPath('calendar.holidays.2026-08-17.is_red_date', true)
            ->assertJsonPath('calendar.holiday_coverage.0.year', 2026)
            ->assertJsonPath('calendar.holiday_coverage.0.status', 'official')
            ->assertJsonPath('calendar.holiday_coverage.1.year', 2027)
            ->assertJsonPath('calendar.holiday_coverage.1.status', 'unavailable');
    }

    public function test_default_date_skips_closed_days_and_absent_open_month_returns_null_window(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-25 08:00:00', 'Asia/Jakarta'));

        BookingSchedule::create([
            'month' => 7,
            'year' => 2026,
            'is_open' => true,
            'closed_dates' => ['2026-07-25', '2026-07-26'],
        ]);

        $calendar = app(BookingCalendarService::class)->metadata();

        $this->assertSame('2026-07-27', $calendar['window']['default_date']);
        $this->assertSame('2026-07-27', $calendar['window']['first_bookable_date']);
        $this->assertSame('2026-07-31', $calendar['window']['last_bookable_date']);

        BookingSchedule::query()->update(['is_open' => false]);
        $calendar = app(BookingCalendarService::class)->metadata();

        $this->assertNull($calendar['window']['max_date']);
        $this->assertNull($calendar['window']['default_date']);
        $this->assertNull($calendar['window']['first_open_month']);
        $this->assertNull($calendar['window']['last_open_month']);
        $this->assertSame([], $calendar['open_months']);
    }

    public function test_holiday_metadata_does_not_close_an_admin_open_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-25 08:00:00', 'Asia/Jakarta'));

        BookingSchedule::create([
            'month' => 8,
            'year' => 2026,
            'is_open' => true,
            'closed_dates' => [],
        ]);

        $this->getJson(route('booking.availability', [
            'date' => '2026-08-17',
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-08-17.closed', false)
            ->assertJsonPath('dates.2026-08-17.reason', null)
            ->assertJsonPath('calendar.holidays.2026-08-17.type', 'national_holiday');
    }

    public function test_official_2026_dataset_contains_seventeen_red_dates_and_eight_collective_leave_days(): void
    {
        $days = config('indonesia_holidays.2026.days');

        $this->assertIsArray($days);
        $this->assertCount(
            17,
            collect($days)->where('type', 'national_holiday'),
        );
        $this->assertCount(
            8,
            collect($days)->where('type', 'collective_leave'),
        );
    }

    public function test_an_entirely_closed_range_does_not_query_booking_inventory(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-25 08:00:00', 'Asia/Jakarta'));
        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = strtolower($query->sql);
        });

        $this->getJson(route('booking.availability', [
            'from' => '2026-08-01',
            'days' => 9,
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-08-01.reason', 'month_closed');

        $bookingQueries = collect($queries)->filter(
            fn (string $query): bool => str_contains($query, 'from "bookings"')
                || str_contains($query, 'from `bookings`'),
        );

        $this->assertCount(0, $bookingQueries);
    }

    public function test_initial_booking_page_receives_the_same_calendar_policy(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-25 08:00:00', 'Asia/Jakarta'));

        BookingSchedule::create([
            'month' => 7,
            'year' => 2026,
            'is_open' => true,
            'closed_dates' => [],
        ]);

        $this->get(route('booking'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('BookingPage')
                ->where('booking_today', '2026-07-25')
                ->where('booking_calendar.locale', 'id-ID')
                ->where('booking_calendar.window.max_date', '2026-07-31')
                ->where('booking_calendar.open_months', ['2026-07'])
                ->where('booking_calendar.months.2026-08.is_open', false));
    }

    public function test_schedule_mutations_rotate_the_public_calendar_revision(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-25 08:00:00', 'Asia/Jakarta'));

        $calendar = app(BookingCalendarService::class);
        $before = $calendar->revision();
        $admin = $this->scheduleAdmin();

        $this->actingAs($admin)
            ->post(route('admin.settings.schedules.toggle'), [
                'month' => 7,
                'year' => 2026,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $after = $calendar->revision();

        $this->assertNotSame($before, $after);
        $this->assertTrue(BookingSchedule::isOpen(7, 2026));

        $this->getJson(route('booking.availability', [
            'date' => '2026-07-25',
        ]))
            ->assertOk()
            ->assertJsonPath('calendar.schedule_revision', $after)
            ->assertJsonPath('calendar.months.2026-07.is_open', true);
    }

    private function scheduleAdmin(): User
    {
        $permission = Permission::firstOrCreate([
            'name' => 'manage-booking-limits',
            'guard_name' => 'web',
        ]);
        $role = Role::firstOrCreate([
            'name' => 'Administrator',
            'guard_name' => 'web',
        ]);
        $role->syncPermissions([$permission]);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }
}
