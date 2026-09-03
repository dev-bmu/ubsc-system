<?php

namespace App\Services;

use App\Models\Facility;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BookingCartValidator
{
    public function __construct(
        private readonly BookingAvailabilityService $availabilityService,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    public function validate(array $items): array
    {
        if ($items === []) {
            throw ValidationException::withMessages([
                'items' => 'Pilih minimal satu jadwal reservasi.',
            ]);
        }

        $facilityIds = collect($items)
            ->pluck('facility_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values();
        $facilities = Facility::query()
            ->with([
                'category',
                'media',
                'prices',
                'units' => fn ($query) => $query->where('is_active', true),
                'units.media',
                'units.prices',
            ])
            ->visibleInBookingDirectory()
            ->whereKey($facilityIds)
            ->get()
            ->keyBy('id');

        $normalized = [];

        foreach ($items as $index => $item) {
            $normalized[] = $this->validateItem(
                $item,
                $index,
                $facilities,
            );
        }

        $this->ensureNoDuplicateOrOverlappingCartSlots($normalized);

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private function validateItem(
        array $item,
        int $index,
        Collection $facilities,
    ): array {
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

        /** @var Facility|null $facility */
        $facility = $facilities->get((int) $item['facility_id']);
        if (! $facility) {
            throw ValidationException::withMessages([
                "items.{$index}.facility_id" => 'Fasilitas tidak lagi tersedia untuk reservasi website.',
            ]);
        }

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
            throw ValidationException::withMessages([
                "items.{$index}.facility_unit_id" => 'Unit fasilitas tidak valid.',
            ]);
        }

        $inspection = $this->availabilityService->inspectSlot(
            $facility,
            $unit,
            $date,
            $startTime,
            $endTime,
        );

        if (! $inspection['bookable']) {
            $this->throwSlotValidationError(
                (string) $inspection['reason'],
                $index,
            );
        }

        return [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unit?->id,
            'booking_date' => $date->toDateString(),
            'start_time' => $startTime,
            'end_time' => $endTime,
            'facility_name' => $facility->name,
            'image_url' => $unit?->getFirstMediaUrl('unit_image')
                ?: $facility->getFirstMediaUrl('hero')
                ?: $facility->getFirstMediaUrl('gallery')
                ?: null,
            'facility_unit_name' => $unit?->name,
            'category_name' => $facility->category?->name,
            'category_slug' => $facility->category?->slug,
            'location' => $facility->location,
            'kind' => Str::contains(
                Str::lower(implode(' ', array_filter([
                    $facility->category?->slug,
                    $facility->category?->name,
                    $facility->class_code,
                ]))),
                ['kelas', 'class'],
            ) ? 'class' : 'facility',
        ];
    }

    private function throwSlotValidationError(string $reason, int $index): never
    {
        throw match ($reason) {
            'month_closed' => ValidationException::withMessages([
                "items.{$index}.booking_date" => 'Jadwal untuk bulan ini belum dibuka.',
            ]),
            'date_closed' => ValidationException::withMessages([
                "items.{$index}.booking_date" => 'Fasilitas tutup pada tanggal ini.',
            ]),
            'elapsed' => ValidationException::withMessages([
                "items.{$index}.start_time" => 'Jadwal ini sudah berlalu. Pilih waktu lain.',
            ]),
            'full' => ValidationException::withMessages([
                "items.{$index}.start_time" => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]),
            default => ValidationException::withMessages([
                "items.{$index}.start_time" => 'Jadwal tidak tersedia atau berada di luar jam operasional.',
            ]),
        };
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
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
