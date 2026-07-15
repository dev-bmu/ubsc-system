<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityUnit;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class BookingCartValidator
{
    /**
     * @param array<int, array<string, mixed>> $items
     * @return array<int, array<string, mixed>>
     */
    public function validate(array $items): array
    {
        if ($items === []) {
            throw ValidationException::withMessages([
                'items' => 'Pilih minimal satu jadwal reservasi.',
            ]);
        }

        $normalized = [];

        foreach ($items as $index => $item) {
            $normalized[] = $this->validateItem($item, $index);
        }

        $this->ensureNoDuplicateOrOverlappingCartSlots($normalized);

        return $normalized;
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function validateItem(array $item, int $index): array
    {
        foreach (['facility_id', 'booking_date', 'start_time', 'end_time'] as $field) {
            if (! array_key_exists($field, $item) || $item[$field] === null || $item[$field] === '') {
                throw ValidationException::withMessages([
                    "items.{$index}.{$field}" => 'Data slot reservasi tidak lengkap.',
                ]);
            }
        }

        $date = Carbon::createFromFormat('Y-m-d', (string) $item['booking_date'])->startOfDay();
        $today = now()->startOfDay();

        if ($date->lt($today)) {
            throw ValidationException::withMessages([
                "items.{$index}.booking_date" => 'Tanggal reservasi tidak boleh sebelum hari ini.',
            ]);
        }

        $startTime = substr((string) $item['start_time'], 0, 5);
        $endTime = substr((string) $item['end_time'], 0, 5);

        if (! preg_match('/^\d{2}:\d{2}$/', $startTime) || ! preg_match('/^\d{2}:\d{2}$/', $endTime) || $endTime <= $startTime) {
            throw ValidationException::withMessages([
                "items.{$index}.start_time" => 'Rentang waktu reservasi tidak valid.',
            ]);
        }

        $facility = Facility::with(['units' => fn ($query) => $query->where('is_active', true)])
            ->where('is_active', true)
            ->findOrFail((int) $item['facility_id']);

        $unitId = $item['facility_unit_id'] ?? null;
        $unit = null;

        if ($facility->units->isNotEmpty()) {
            if (! $unitId) {
                throw ValidationException::withMessages([
                    "items.{$index}.facility_unit_id" => 'Pilih unit fasilitas terlebih dahulu.',
                ]);
            }

            $unit = $facility->units->firstWhere('id', (int) $unitId);
            if (! $unit) {
                throw ValidationException::withMessages([
                    "items.{$index}.facility_unit_id" => 'Unit fasilitas tidak valid.',
                ]);
            }
        } elseif ($unitId) {
            $unit = FacilityUnit::where('facility_id', $facility->id)
                ->where('is_active', true)
                ->findOrFail((int) $unitId);
        }

        $this->ensureDateIsOpen($date, $index);
        $this->ensureNoCollision($facility, $unit, $date->toDateString(), $startTime, $endTime, $index);

        return [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unit?->id,
            'booking_date' => $date->toDateString(),
            'start_time' => $startTime,
            'end_time' => $endTime,
            'facility_name' => $facility->name,
            'facility_unit_name' => $unit?->name,
        ];
    }

    private function ensureDateIsOpen(Carbon $date, int $index): void
    {
        $schedule = BookingSchedule::where('month', $date->month)
            ->where('year', $date->year)
            ->first();

        if (! ($schedule?->is_open ?? false)) {
            throw ValidationException::withMessages([
                "items.{$index}.booking_date" => 'Jadwal untuk bulan ini belum dibuka.',
            ]);
        }

        $closedDates = BookingSchedule::cleanClosedDatesForMonth($schedule?->closed_dates, $date->month, $date->year);

        if (in_array($date->toDateString(), $closedDates, true)) {
            throw ValidationException::withMessages([
                "items.{$index}.booking_date" => 'Fasilitas tutup pada tanggal ini.',
            ]);
        }
    }

    private function ensureNoCollision(Facility $facility, ?FacilityUnit $unit, string $date, string $startTime, string $endTime, int $index): void
    {
        $capacity = $unit ? 1 : ($facility->capacity ?? 1);

        $query = Booking::where('facility_id', $facility->id)
            ->whereDate('booking_date', $date)
            ->whereIn('status', ['pending', 'confirmed'])
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime);

        if ($unit) {
            $query->where(function ($inner) use ($unit) {
                $inner->where('facility_unit_id', $unit->id)
                    ->orWhereNull('facility_unit_id');
            });
        }

        if ((int) $query->sum('pax') >= $capacity) {
            throw ValidationException::withMessages([
                "items.{$index}.start_time" => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);
        }
    }

    /**
     * @param array<int, array<string, mixed>> $items
     */
    private function ensureNoDuplicateOrOverlappingCartSlots(array $items): void
    {
        $groups = [];

        foreach ($items as $index => $item) {
            $key = implode('|', [
                $item['facility_id'],
                $item['facility_unit_id'] ?? 'parent',
                $item['booking_date'],
            ]);

            $groups[$key][] = [
                ...$item,
                'index' => $index,
            ];
        }

        foreach ($groups as $group) {
            usort($group, fn (array $a, array $b): int => strcmp($a['start_time'], $b['start_time']));

            $previous = null;
            foreach ($group as $item) {
                if ($previous !== null && $item['start_time'] < $previous['end_time']) {
                    throw ValidationException::withMessages([
                        "items.{$item['index']}.start_time" => 'Keranjang memiliki jadwal yang duplikat atau bertabrakan.',
                    ]);
                }

                $previous = $item;
            }
        }
    }
}
