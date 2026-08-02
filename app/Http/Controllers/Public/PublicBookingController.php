<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use App\Services\BookingAvailabilityService;
use App\Services\BookingCalendarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

class PublicBookingController extends Controller
{
    public function __construct(
        private readonly BookingAvailabilityService $availabilityService,
        private readonly BookingCalendarService $calendarService,
    ) {}

    public function availability(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => [
                'nullable',
                'required_without:from',
                'date_format:Y-m-d',
                'after_or_equal:today',
            ],
            'from' => [
                'nullable',
                'required_without:date',
                'date_format:Y-m-d',
                'after_or_equal:today',
            ],
            'days' => ['nullable', 'integer', 'between:1,14'],
        ]);

        $from = (string) ($data['date'] ?? $data['from']);
        $days = isset($data['date']) ? 1 : (int) ($data['days'] ?? 1);

        $loadAvailability = fn (): array =>
            $this->availabilityService->availability($from, $days);
        $availability = app()->environment('testing')
            ? $loadAvailability()
            : Cache::remember(
                "booking-availability:v3:{$this->calendarService->revision()}:{$from}:{$days}",
                now()->addSeconds(3),
                $loadAvailability,
            );

        return response()
            ->json($availability)
            ->header('Cache-Control', 'private, no-store');
    }

    public function slots(Request $request): JsonResponse
    {
        $data = $request->validate([
            'facility_id' => [
                'required',
                'integer',
                Rule::exists('facilities', 'id')
                    ->where(fn ($query) => $query
                        ->where('is_active', true)
                        ->whereIn(
                            'reservation_method',
                            ['website', 'auto'],
                        )),
            ],
            'facility_unit_id' => [
                'nullable',
                'integer',
                Rule::exists('facility_units', 'id')
                    ->where(fn ($query) => $query
                        ->where('facility_id', $request->integer('facility_id'))
                        ->where('is_active', true)),
            ],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
        ]);

        $facility = Facility::visibleInBookingDirectory()
            ->with(['prices', 'units.prices'])
            ->findOrFail($data['facility_id']);
        $unit = null;
        $activeUnits = $facility->units->where('is_active', true)->values();

        if (! empty($data['facility_unit_id'])) {
            $unit = $activeUnits->firstWhere('id', (int) $data['facility_unit_id']);

            if (! $unit) {
                abort(404);
            }
        }

        if ($activeUnits->isNotEmpty() && ! $unit) {
            $dateAvailability = $this->availabilityService->slots(
                $facility,
                null,
                $data['date'],
            );

            if ($dateAvailability['closed']) {
                return response()->json($dateAvailability);
            }

            return response()->json([
                'closed' => false,
                'requires_unit' => true,
                'slots' => [],
                'closed_dates' => $dateAvailability['closed_dates'],
            ]);
        }

        return response()->json(
            $this->availabilityService->slots(
                $facility,
                $unit,
                $data['date'],
            ),
        );
    }
}
