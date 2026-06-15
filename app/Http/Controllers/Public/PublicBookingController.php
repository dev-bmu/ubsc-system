<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Support\FacilityPriceResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class PublicBookingController extends Controller
{
    public function __construct(private readonly FacilityPriceResolver $priceResolver)
    {
    }

    public function slots(Request $request): JsonResponse
    {
        $data = $request->validate([
            'facility_id'      => ['required', 'exists:facilities,id'],
            'facility_unit_id' => ['nullable', 'exists:facility_units,id'],
            'date'             => ['required', 'date_format:Y-m-d'],
        ]);

        $date    = Carbon::parse($data['date']);
        $month   = $date->month;
        $year    = (int) substr($data['date'], 0, 4);
        $dateStr = $date->format('Y-m-d');

        $schedule    = BookingSchedule::where('month', $month)->where('year', $year)->first();
        $isMonthOpen = $schedule?->is_open ?? false;
        $closedDates = BookingSchedule::cleanClosedDatesForMonth($schedule?->closed_dates, $month, $year);

        if (! $isMonthOpen) {
            return response()->json([
                'closed'       => true,
                'reason'       => 'month_closed',
                'slots'        => [],
                'closed_dates' => $closedDates,
            ]);
        }

        if (in_array($dateStr, $closedDates, true)) {
            return response()->json([
                'closed'       => true,
                'reason'       => 'date_closed',
                'slots'        => [],
                'closed_dates' => $closedDates,
            ]);
        }

        $facility = Facility::with(['prices', 'units.prices'])->findOrFail($data['facility_id']);
        $unit = null;
        $activeUnits = $facility->units->where('is_active', true)->values();

        if (! empty($data['facility_unit_id'])) {
            $unit = $activeUnits->firstWhere('id', (int) $data['facility_unit_id']);

            if (! $unit) {
                abort(404);
            }
        }

        if ($activeUnits->isNotEmpty() && ! $unit) {
            return response()->json([
                'closed'       => false,
                'requires_unit' => true,
                'slots'        => [],
                'closed_dates' => $closedDates,
            ]);
        }

        $capacity = $unit ? 1 : ($facility->capacity ?? 1);
        $durationMinutes = $this->priceResolver->durationForCategoryForUnit($facility, $unit, 'umum');

        $slots       = [];
        $activeSlots = $unit?->use_custom_schedule
            ? ($unit->active_slots ?? [])
            : $facility->active_slots;
        $dayName     = $date->format('l');
        $fmt         = fn (int $m): string => sprintf('%02d:%02d', intdiv($m, 60), $m % 60);

        $buildSlot = function (string $startTime, string $endTime) use ($facility, $unit, $date, $dateStr, $capacity): array {
            $price = $this->priceResolver->priceForSlotForUnit($facility, $unit, 'umum', $date, $startTime, $endTime);

            $bookingQuery = Booking::where('facility_id', $facility->id)
                ->whereDate('booking_date', $dateStr)
                ->whereIn('status', ['pending', 'confirmed'])
                ->where('start_time', '<', $endTime)
                ->where('end_time', '>', $startTime);

            if ($unit) {
                $bookingQuery->where(function ($query) use ($unit) {
                    $query->where('facility_unit_id', $unit->id)
                        ->orWhereNull('facility_unit_id');
                });
            }

            $occupiedPax = $bookingQuery->sum('pax');

            return [
                'start_time'       => $startTime,
                'end_time'         => $endTime,
                'label'            => $startTime . ' - ' . $endTime,
                'price'            => $price > 0 ? 'Rp ' . number_format($price, 0, ',', '.') : 'Hubungi Kami',
                'status'           => ($occupiedPax >= $capacity) ? 'booked' : 'available',
                'remaining'        => max(0, $capacity - $occupiedPax),
                'facility_unit_id' => $unit?->id,
            ];
        };

        if ($activeSlots !== null) {
            $daySlots = $activeSlots[$dayName] ?? [];
            foreach ($daySlots as $startTimeStr) {
                [$h, $m] = array_map('intval', explode(':', $startTimeStr));
                $slots[] = $buildSlot($startTimeStr, $fmt($h * 60 + $m + $durationMinutes));
            }
        } else {
            $current = 6 * 60;
            $end = 22 * 60;

            while ($current + $durationMinutes <= $end) {
                $startTime = $fmt($current);
                $endTime = $fmt($current + $durationMinutes);
                $slots[] = $buildSlot($startTime, $endTime);
                $current += $durationMinutes;
            }
        }

        return response()->json([
            'closed'       => false,
            'requires_unit' => false,
            'slots'        => $slots,
            'closed_dates' => $closedDates,
        ]);
    }
}
