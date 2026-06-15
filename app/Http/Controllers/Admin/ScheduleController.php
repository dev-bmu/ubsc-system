<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookingSchedule;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ScheduleController extends Controller
{
    private const MONTH_NAMES = [
        1  => 'Januari',  2  => 'Februari', 3  => 'Maret',
        4  => 'April',    5  => 'Mei',       6  => 'Juni',
        7  => 'Juli',     8  => 'Agustus',   9  => 'September',
        10 => 'Oktober',  11 => 'November',  12 => 'Desember',
    ];

    public function index(): Response
    {
        $this->authorizeScheduleAccess();

        $rows = collect(range(0, 6))->map(function (int $offset) {
            $date  = Carbon::now()->startOfMonth()->addMonths($offset);
            $month = $date->month;
            $year  = $date->year;

            $schedule = BookingSchedule::where('month', $month)
                ->where('year', $year)
                ->first();

            return [
                'month'        => $month,
                'year'         => $year,
                'label'        => self::MONTH_NAMES[$month] . ' ' . $year,
                'is_open'      => (bool) ($schedule?->is_open ?? false),
                'closed_dates' => BookingSchedule::cleanClosedDatesForMonth($schedule?->closed_dates, $month, $year),
            ];
        });

        return Inertia::render('Admin/Settings/Schedules/Index', [
            'schedules' => $rows,
        ]);
    }

    public function toggle(Request $request): RedirectResponse
    {
        $this->authorizeScheduleAccess();

        $data = $request->validate([
            'month' => ['required', 'integer', 'between:1,12'],
            'year'  => ['required', 'integer', 'min:2020', 'max:2099'],
        ]);

        $schedule = BookingSchedule::firstOrNew([
            'month' => $data['month'],
            'year'  => $data['year'],
        ]);

        $schedule->is_open = !$schedule->is_open;
        $schedule->save();

        $label  = self::MONTH_NAMES[$data['month']] . ' ' . $data['year'];
        $status = $schedule->is_open ? 'dibuka' : 'ditutup';

        return back()->with('success', "Jadwal {$label} berhasil {$status}.");
    }

    public function updateClosedDates(Request $request): RedirectResponse
    {
        $this->authorizeScheduleAccess();

        $data = $request->validate([
            'month'        => ['required', 'integer', 'between:1,12'],
            'year'         => ['required', 'integer', 'min:2020', 'max:2099'],
            'closed_dates' => ['present', 'array'],
            'closed_dates.*' => ['date_format:Y-m-d'],
        ]);

        $closedDates = collect($data['closed_dates'])
            ->map(function (string $date): string {
                $parsed = Carbon::createFromFormat('Y-m-d', $date);

                if ($parsed->format('Y-m-d') !== $date) {
                    throw ValidationException::withMessages([
                        'closed_dates' => 'Format tanggal tutup tidak valid.',
                    ]);
                }

                return $date;
            })
            ->unique()
            ->sort()
            ->values()
            ->all();

        $invalidDate = collect($closedDates)->first(function (string $date) use ($data): bool {
            $parsed = Carbon::createFromFormat('Y-m-d', $date);

            return $parsed->month !== (int) $data['month'] || $parsed->year !== (int) $data['year'];
        });

        if ($invalidDate !== null) {
            throw ValidationException::withMessages([
                'closed_dates' => 'Tanggal tutup harus berada pada bulan yang sedang diedit.',
            ]);
        }

        BookingSchedule::updateOrCreate(
            ['month' => $data['month'], 'year' => $data['year']],
            ['closed_dates' => $closedDates],
        );

        return back()->with('success', 'Tanggal tutup berhasil disimpan.');
    }

    public function quickOpenNext(): RedirectResponse
    {
        $this->authorizeScheduleAccess();

        $next = Carbon::now()->addMonth()->startOfMonth();

        BookingSchedule::updateOrCreate(
            ['month' => $next->month, 'year' => $next->year],
            ['is_open' => true],
        );

        $label = self::MONTH_NAMES[$next->month] . ' ' . $next->year;

        return back()->with('success', "Jadwal {$label} berhasil dibuka.");
    }

    private function authorizeScheduleAccess(): void
    {
        abort_unless(auth()->user()?->can('manage-booking-limits'), 403);
    }

}
