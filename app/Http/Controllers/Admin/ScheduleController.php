<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookingSchedule;
use App\Services\BookingCalendarService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ScheduleController extends Controller
{
    public function __construct(
        private readonly BookingCalendarService $calendarService,
    ) {}

    public function index(): Response
    {
        $this->authorizeScheduleAccess();

        return Inertia::render('Admin/Settings/Schedules/Index', [
            'schedules' => $this->calendarService->adminScheduleRows(),
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
        $this->calendarService->bumpRevision();

        $label = $this->calendarService->monthLabel($data['month'], $data['year']);
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
        $this->calendarService->bumpRevision();

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
        $this->calendarService->bumpRevision();

        $label = $this->calendarService->monthLabel($next->month, $next->year);

        return back()->with('success', "Jadwal {$label} berhasil dibuka.");
    }

    private function authorizeScheduleAccess(): void
    {
        abort_unless(auth()->user()?->can('manage-booking-limits'), 403);
    }

}
