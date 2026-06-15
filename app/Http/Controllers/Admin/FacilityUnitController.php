<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use App\Models\FacilityUnit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Inertia\Inertia;
use Inertia\Response;

class FacilityUnitController extends Controller
{
    public function index(Facility $facility): Response
    {
        $this->authorize('manage-facilities');

        $facility->load(['category', 'units.media', 'units.prices']);

        return Inertia::render('Admin/Facilities/Units', [
            'facility' => [
                'id' => $facility->id,
                'name' => $facility->name,
                'slug' => $facility->slug,
                'category' => $facility->category?->name,
                'image' => $facility->getFirstMediaUrl('hero'),
            ],
            'units' => $facility->units
                ->sortBy('id')
                ->map(fn (FacilityUnit $unit) => $this->transformUnit($unit))
                ->values()
                ->all(),
        ]);
    }

    public function store(Request $request, Facility $facility): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $this->validateUnit($request);

        $unit = $facility->units()->create([
            'name' => $data['name'],
            'is_active' => $request->boolean('is_active', true),
            'use_custom_schedule' => $request->boolean('use_custom_schedule'),
            'active_slots' => $request->boolean('use_custom_schedule')
                ? $this->normalizeActiveSlots($data['active_slots'] ?? [])
                : null,
            'use_custom_pricing' => $request->boolean('use_custom_pricing'),
        ]);

        if ($unit->use_custom_pricing) {
            $this->syncPrices($unit, $data['prices'] ?? []);
        }

        if ($request->hasFile('unit_image')) {
            $unit->addMediaFromRequest('unit_image')->toMediaCollection('unit_image');
        }

        return back()->with('success', 'Unit fasilitas berhasil ditambahkan.');
    }

    public function update(Request $request, FacilityUnit $facilityUnit): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $this->validateUnit($request);

        $facilityUnit->update([
            'name' => $data['name'],
            'is_active' => $request->boolean('is_active'),
            'use_custom_schedule' => $request->boolean('use_custom_schedule'),
            'active_slots' => $request->boolean('use_custom_schedule')
                ? $this->normalizeActiveSlots($data['active_slots'] ?? [])
                : null,
            'use_custom_pricing' => $request->boolean('use_custom_pricing'),
        ]);

        if ($facilityUnit->use_custom_pricing) {
            $this->syncPrices($facilityUnit, $data['prices'] ?? []);
        }

        if ($request->boolean('remove_unit_image') && ! $request->hasFile('unit_image')) {
            $facilityUnit->clearMediaCollection('unit_image');
        }

        if ($request->hasFile('unit_image')) {
            $facilityUnit->addMediaFromRequest('unit_image')->toMediaCollection('unit_image');
        }

        return back()->with('success', 'Unit fasilitas berhasil diperbarui.');
    }

    public function destroy(FacilityUnit $facilityUnit): RedirectResponse
    {
        $this->authorize('manage-facilities');

        if ($facilityUnit->bookings()->exists()) {
            return back()->with('error', 'Unit sudah memiliki riwayat booking. Nonaktifkan unit jika tidak ingin dipakai lagi.');
        }

        $facilityUnit->delete();

        return back()->with('success', 'Unit fasilitas berhasil dihapus.');
    }

    private function transformUnit(FacilityUnit $unit): array
    {
        return [
            'id' => $unit->id,
            'facility_id' => $unit->facility_id,
            'name' => $unit->name,
            'is_active' => $unit->is_active,
            'use_custom_schedule' => $unit->use_custom_schedule,
            'active_slots' => $unit->active_slots,
            'use_custom_pricing' => $unit->use_custom_pricing,
            'image_url' => $unit->getFirstMediaUrl('unit_image') ?: null,
            'prices' => $unit->prices
                ->sortBy('sort_order')
                ->map(fn ($price) => [
                    'id' => $price->id,
                    'user_category' => $price->user_category,
                    'label' => $price->label,
                    'price' => $price->price,
                    'duration_minutes' => $price->duration_minutes ?? 60,
                    'schedule_type' => $price->schedule_type,
                    'applicable_days' => $price->applicable_days,
                    'starts_at' => $price->starts_at ? substr((string) $price->starts_at, 0, 5) : null,
                    'ends_at' => $price->ends_at ? substr((string) $price->ends_at, 0, 5) : null,
                    'starts_on' => $price->starts_on?->format('Y-m-d'),
                    'ends_on' => $price->ends_on?->format('Y-m-d'),
                    'notes' => $price->notes,
                    'sort_order' => $price->sort_order,
                ])
                ->values()
                ->all(),
            'created_at' => $unit->created_at?->toDateTimeString(),
        ];
    }

    private function validateUnit(Request $request): array
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:150'],
            'is_active' => ['nullable'],
            'use_custom_schedule' => ['nullable'],
            'active_slots' => ['nullable', 'array'],
            'active_slots.*' => ['nullable', 'array'],
            'active_slots.*.*' => ['string', 'date_format:H:i'],
            'use_custom_pricing' => ['nullable'],
            'prices' => ['nullable', 'array'],
            'prices.*.user_category' => ['required_with:prices', 'string', 'in:warga_ub,umum'],
            'prices.*.label' => ['required_with:prices', 'string', 'max:100'],
            'prices.*.price' => ['required_with:prices', 'numeric', 'min:0'],
            'prices.*.duration_minutes' => ['nullable', 'integer', 'min:1'],
            'prices.*.schedule_type' => ['nullable', 'in:regular,always,weekly,date_range'],
            'prices.*.applicable_days' => ['nullable', 'array'],
            'prices.*.applicable_days.*' => ['string', 'in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'],
            'prices.*.starts_at' => ['nullable', 'date_format:H:i'],
            'prices.*.ends_at' => ['nullable', 'date_format:H:i'],
            'prices.*.starts_on' => ['nullable', 'date_format:Y-m-d'],
            'prices.*.ends_on' => ['nullable', 'date_format:Y-m-d'],
            'prices.*.notes' => ['nullable', 'string', 'max:500'],
            'prices.*.sort_order' => ['nullable', 'integer', 'min:0'],
            'unit_image' => ['nullable', 'image', 'max:5120'],
            'remove_unit_image' => ['nullable'],
        ]);

        $validator->after(function ($validator) use ($request): void {
            if ($request->boolean('use_custom_pricing') && count($request->input('prices', [])) === 0) {
                $validator->errors()->add('prices', 'Isi minimal satu harga jika harga custom diaktifkan.');
            }

            foreach ($request->input('prices', []) as $index => $price) {
                $scheduleType = $price['schedule_type'] ?? 'regular';
                $startsAt = $price['starts_at'] ?? null;
                $endsAt = $price['ends_at'] ?? null;
                $startsOn = $price['starts_on'] ?? null;
                $endsOn = $price['ends_on'] ?? null;

                if ($scheduleType === 'weekly' && empty($price['applicable_days'])) {
                    $validator->errors()->add("prices.$index.applicable_days", 'Pilih minimal satu hari untuk harga khusus.');
                }

                if ($scheduleType === 'date_range') {
                    if (! $startsOn || ! $endsOn) {
                        $validator->errors()->add("prices.$index.starts_on", 'Tanggal mulai dan tanggal selesai wajib diisi.');
                    } elseif ($endsOn < $startsOn) {
                        $validator->errors()->add("prices.$index.ends_on", 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
                    }
                }

                if (($startsAt && ! $endsAt) || (! $startsAt && $endsAt)) {
                    $validator->errors()->add("prices.$index.starts_at", 'Jam mulai dan jam selesai harus diisi lengkap.');
                }

                if ($startsAt && $endsAt && $startsAt === $endsAt) {
                    $validator->errors()->add("prices.$index.ends_at", 'Jam selesai harus berbeda dari jam mulai.');
                }
            }
        });

        return $validator->validate();
    }

    private function normalizeActiveSlots(array $slots): array
    {
        $normalized = [];

        foreach ($slots as $day => $times) {
            $normalized[$day] = collect($times)
                ->filter(fn ($time) => is_string($time) && preg_match('/^\d{2}:\d{2}$/', $time))
                ->values()
                ->all();
        }

        return $normalized;
    }

    private function syncPrices(FacilityUnit $unit, array $prices): void
    {
        $unit->prices()->delete();

        foreach ($prices as $index => $price) {
            $unit->prices()->create([
                'user_category' => $price['user_category'],
                'label' => $price['label'],
                'price' => $price['price'],
                'duration_minutes' => $price['duration_minutes'] ?? 60,
                'schedule_type' => $price['schedule_type'] ?? 'regular',
                'applicable_days' => $price['applicable_days'] ?? null,
                'starts_at' => $price['starts_at'] ?? null,
                'ends_at' => $price['ends_at'] ?? null,
                'starts_on' => $price['starts_on'] ?? null,
                'ends_on' => $price['ends_on'] ?? null,
                'notes' => $price['notes'] ?? null,
                'sort_order' => $price['sort_order'] ?? $index,
            ]);
        }
    }
}
