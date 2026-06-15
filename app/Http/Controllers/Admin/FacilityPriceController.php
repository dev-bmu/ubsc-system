<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class FacilityPriceController extends Controller
{
    public function sync(Request $request, Facility $facility): RedirectResponse
    {
        $this->authorizeAny(['manage-pricing', 'manage-facilities']);

        $validator = Validator::make($request->all(), [
            'prices'                     => ['required', 'array'],
            'prices.*.user_category'     => ['required', 'string', 'max:50'],
            'prices.*.label'             => ['required', 'string', 'max:100'],
            'prices.*.price'             => ['required', 'numeric', 'min:0'],
            'prices.*.duration_minutes'  => ['nullable', 'integer', 'min:1'],
            'prices.*.schedule_type'     => ['nullable', 'in:regular,always,weekly,date_range'],
            'prices.*.applicable_days'   => ['nullable', 'array'],
            'prices.*.applicable_days.*' => ['string', 'in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'],
            'prices.*.starts_at'         => ['nullable', 'date_format:H:i'],
            'prices.*.ends_at'           => ['nullable', 'date_format:H:i'],
            'prices.*.starts_on'         => ['nullable', 'date_format:Y-m-d'],
            'prices.*.ends_on'           => ['nullable', 'date_format:Y-m-d'],
            'prices.*.notes'             => ['nullable', 'string', 'max:500'],
            'prices.*.sort_order'        => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request): void {
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

        $validated = $validator->validate();

        $facility->prices()->delete();

        foreach ($validated['prices'] as $i => $p) {
            $facility->prices()->create([
                'user_category'   => $p['user_category'],
                'label'           => $p['label'],
                'price'           => $p['price'],
                'duration_minutes'=> $p['duration_minutes'] ?? 60,
                'schedule_type'   => $p['schedule_type'] ?? 'regular',
                'applicable_days' => $p['applicable_days'] ?? null,
                'starts_at'       => $p['starts_at'] ?? null,
                'ends_at'         => $p['ends_at'] ?? null,
                'starts_on'       => $p['starts_on'] ?? null,
                'ends_on'         => $p['ends_on'] ?? null,
                'notes'           => $p['notes'] ?? null,
                'sort_order'      => $p['sort_order'] ?? $i,
            ]);
        }

        return back()->with('success', 'Harga berhasil disimpan.');
    }

    /**
     * @param array<int, string> $permissions
     */
    private function authorizeAny(array $permissions): void
    {
        foreach ($permissions as $permission) {
            if (auth()->user()?->can($permission)) {
                return;
            }
        }

        abort(403);
    }
}
