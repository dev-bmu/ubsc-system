<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Support\FacilityReservationLink;
use App\Support\NewsContentSanitizer;
use App\Support\SafePublicUrl;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class FacilityController extends Controller
{
    public function index(): Response
    {
        $this->authorizeAny(['view-facilities', 'manage-facilities', 'manage-pricing']);

        $facilities = Facility::with(['category', 'media'])
            ->withCount(['prices', 'units'])
            ->orderBy('sort_order')
            ->get()
            ->map(fn (Facility $f) => $this->transformFacility($f));

        $categories = FacilityCategory::orderBy('sort_order')
            ->withCount('facilities')
            ->get(['id', 'name', 'slug', 'description', 'sort_order']);

        return Inertia::render('Admin/Facilities/Index', [
            'facilities' => $facilities,
            'categories' => $categories,
        ]);
    }

    public function create(): Response
    {
        $this->authorize('manage-facilities');

        return Inertia::render('Admin/Facilities/Form', [
            'categories' => FacilityCategory::orderBy('sort_order')->get(['id', 'name']),
            'facility' => null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $this->validateFacility($request);

        $facility = Facility::create([
            'facility_category_id' => $data['facility_category_id'],
            'name' => $data['name'],
            'slug' => $data['slug'],
            'description' => NewsContentSanitizer::clean($data['description'] ?? null),
            'location' => $data['location'] ?? null,
            'venue_type' => $data['venue_type'] ?? null,
            'capacity' => $data['capacity'] ?? 1,
            'active_slots' => $this->normalizeActiveSlots($data['active_slots'] ?? null),
            'class_code' => $data['class_code'] ?? null,
            'rating' => $data['rating'] ?? 5.0,
            'display_metadata' => $this->decodeMetadata($data['display_metadata'] ?? null),
            'reservation_method' => $data['reservation_method'],
            'reservation_url' => $data['reservation_url'] ?? null,
            'reservation_phone' => $this->normalizeReservationPhone(
                $data['reservation_phone'] ?? null,
            ),
            'reservation_message' => $data['reservation_message']
                ?? FacilityReservationLink::DEFAULT_MESSAGE,
            'is_active' => $data['is_active'],
            'sort_order' => $data['sort_order'],
        ]);

        if ($request->hasFile('hero')) {
            $facility->addMediaFromRequest('hero')
                ->toMediaCollection('hero');
        }

        if ($request->hasFile('gallery')) {
            foreach ($request->file('gallery') as $image) {
                $facility->addMedia($image)->toMediaCollection('gallery');
            }
        }

        return redirect()
            ->route('admin.facilities.pricing', $facility)
            ->with('success', 'Fasilitas berhasil dibuat. Lengkapi harga reguler agar seluruh halaman publik langsung menggunakan data yang sama.');
    }

    public function edit(Facility $facility): Response
    {
        $this->authorize('manage-facilities');

        $facility->load(['category', 'media']);

        return Inertia::render('Admin/Facilities/Form', [
            'categories' => FacilityCategory::orderBy('sort_order')->get(['id', 'name']),
            'facility' => $this->transformFacility($facility),
        ]);
    }

    public function update(Request $request, Facility $facility): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $this->validateFacility($request, $facility->id);
        $this->guardGalleryCapacity(
            $facility,
            count($request->file('gallery', [])),
        );

        $facility->update([
            'facility_category_id' => $data['facility_category_id'],
            'name' => $data['name'],
            'slug' => $data['slug'],
            'description' => NewsContentSanitizer::clean($data['description'] ?? null),
            'location' => $data['location'] ?? null,
            'venue_type' => $data['venue_type'] ?? null,
            'capacity' => $data['capacity'] ?? $facility->capacity,
            'active_slots' => $this->normalizeActiveSlots($data['active_slots'] ?? null),
            'class_code' => $data['class_code'] ?? null,
            'rating' => $data['rating'] ?? $facility->rating,
            'display_metadata' => $this->decodeMetadata($data['display_metadata'] ?? null),
            'reservation_method' => $data['reservation_method'],
            'reservation_url' => $data['reservation_url'] ?? null,
            'reservation_phone' => $this->normalizeReservationPhone(
                $data['reservation_phone'] ?? null,
            ),
            'reservation_message' => $data['reservation_message']
                ?? FacilityReservationLink::DEFAULT_MESSAGE,
            'is_active' => $data['is_active'],
            'sort_order' => $data['sort_order'],
        ]);

        if ($request->boolean('remove_hero') && ! $request->hasFile('hero')) {
            $facility->clearMediaCollection('hero');
        }

        if ($request->hasFile('hero')) {
            $facility->addMediaFromRequest('hero')
                ->toMediaCollection('hero');
        }

        if ($request->hasFile('gallery')) {
            foreach ($request->file('gallery') as $image) {
                $facility->addMedia($image)->toMediaCollection('gallery');
            }
        }

        return redirect()
            ->route('admin.facilities.index')
            ->with('success', 'Facility updated.');
    }

    public function destroy(Facility $facility): RedirectResponse
    {
        $this->authorize('manage-facilities');

        if ($facility->bookings()->exists()) {
            return back()->with(
                'error',
                'Fasilitas sudah memiliki riwayat booking. Nonaktifkan fasilitas agar histori reservasi dan pembayaran tetap utuh.',
            );
        }

        $facility->delete();

        return back()->with('success', 'Facility deleted.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $this->authorize('manage-facilities');

        foreach ($request->input('ids', []) as $index => $id) {
            Facility::where('id', $id)->update(['sort_order' => $index + 1]);
        }

        return back();
    }

    public function updateHero(Request $request, Facility $facility): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $request->validate([
            'hero' => ['required', 'image', 'max:5120'],
        ]);

        $facility->addMediaFromRequest('hero')
            ->toMediaCollection('hero');

        return back()->with('success', 'Hero image updated.');
    }

    public function addGallery(Request $request, Facility $facility): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $request->validate([
            'gallery' => ['required', 'array', 'max:24'],
            'gallery.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120', 'dimensions:max_width=8000,max_height=8000'],
        ]);
        $this->guardGalleryCapacity(
            $facility,
            count($request->file('gallery', [])),
        );

        foreach ($request->file('gallery') as $image) {
            $facility->addMedia($image)->toMediaCollection('gallery');
        }

        return back()->with('success', 'Gallery images added.');
    }

    public function destroyGalleryMedia(Media $media): RedirectResponse
    {
        $this->authorize('manage-facilities');

        abort_unless(
            $media->model_type === Facility::class &&
            $media->collection_name === 'gallery',
            403,
            'This media does not belong to a facility gallery.',
        );

        $media->delete();

        return back()->with('success', 'Image removed.');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function validateFacility(Request $request, ?int $excludeId = null): array
    {
        $request->mergeIfMissing([
            'reservation_method' => 'whatsapp',
            'reservation_phone' => preg_replace(
                '/\D+/',
                '',
                (string) config('business.whatsapp.number'),
            ),
            'reservation_message' => FacilityReservationLink::DEFAULT_MESSAGE,
        ]);

        return $request->validate([
            'facility_category_id' => ['required', 'exists:facility_categories,id'],
            'name' => ['required', 'string', 'max:150'],
            'slug' => [
                'required',
                'string',
                'max:160',
                'alpha_dash',
                \Illuminate\Validation\Rule::unique('facilities', 'slug')->ignore($excludeId),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'location' => ['nullable', 'string', 'max:100'],
            'venue_type' => ['nullable', 'string', 'max:100'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:9999'],
            'active_slots' => ['nullable', 'array:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'],
            'active_slots.*' => ['nullable', 'array'],
            'active_slots.*.*' => ['string', 'date_format:H:i'],
            'class_code' => ['nullable', 'string', 'max:50'],
            'rating' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'display_metadata' => ['nullable', 'string', 'json', 'max:50000'],
            'reservation_method' => [
                'required',
                \Illuminate\Validation\Rule::in([
                    'website',
                    'whatsapp',
                    'external',
                ]),
            ],
            'reservation_url' => [
                'nullable',
                'required_if:reservation_method,external',
                'url:http,https',
                'max:2048',
            ],
            'reservation_phone' => [
                'nullable',
                'required_if:reservation_method,whatsapp',
                'string',
                'max:30',
                'regex:/^\+?[0-9\s().-]{9,30}$/',
            ],
            'reservation_message' => [
                'nullable',
                'required_if:reservation_method,whatsapp',
                'string',
                'max:2000',
            ],
            'is_active' => ['boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'hero' => ['nullable', 'image', 'max:5120'],
            'gallery' => ['nullable', 'array', 'max:24'],
            'gallery.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120', 'dimensions:max_width=8000,max_height=8000'],
            'remove_hero' => ['nullable', 'boolean'],
        ]);
    }

    /**
     * @param  array<int, string>  $permissions
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

    private function decodeMetadata(?string $json): ?array
    {
        if (! $json) {
            return null;
        }

        $decoded = json_decode($json, true);

        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded)) {
            throw ValidationException::withMessages([
                'display_metadata' => 'Detail tampilan publik tidak valid.',
            ]);
        }

        $details = $decoded['additionalDetails'] ?? [];
        if (! is_array($details) || count($details) > 40) {
            throw ValidationException::withMessages([
                'display_metadata' => 'Detail tambahan maksimal berisi 40 item.',
            ]);
        }

        $decoded['additionalDetails'] = collect($details)
            ->map(function ($detail): array {
                if (is_string($detail) || is_numeric($detail)) {
                    return [
                        'key' => trim((string) $detail),
                        'value' => '',
                    ];
                }

                if (! is_array($detail)) {
                    throw ValidationException::withMessages([
                        'display_metadata' => 'Setiap detail tambahan harus memiliki nama dan isi.',
                    ]);
                }

                $key = trim((string) ($detail['key'] ?? $detail['label'] ?? ''));
                $value = trim((string) ($detail['value'] ?? $detail['harga'] ?? ''));

                if (mb_strlen($key) > 120 || mb_strlen($value) > 500) {
                    throw ValidationException::withMessages([
                        'display_metadata' => 'Nama detail maksimal 120 karakter dan isinya maksimal 500 karakter.',
                    ]);
                }

                return compact('key', 'value');
            })
            ->filter(fn (array $detail) => $detail['key'] !== '' || $detail['value'] !== '')
            ->values()
            ->all();

        $presentation = $decoded['pricingPresentation'] ?? [];
        if (! is_array($presentation)) {
            throw ValidationException::withMessages([
                'display_metadata' => 'Susunan tampilan harga publik tidak valid.',
            ]);
        }

        $schemas = [
            'indoorPeriods' => ['label', 'wargaPrice', 'umumPrice'],
            'classRates' => ['level', 'wargaPrice', 'umumPrice'],
            'classRentals' => ['label', 'value'],
            'outdoorRates' => ['label', 'value'],
        ];

        $decoded['pricingPresentation'] = collect($schemas)
            ->mapWithKeys(function (array $fields, string $section) use ($presentation): array {
                $items = $presentation[$section] ?? [];
                if (! is_array($items) || count($items) > 20) {
                    throw ValidationException::withMessages([
                        'display_metadata' => 'Setiap bagian tampilan harga maksimal berisi 20 item.',
                    ]);
                }

                $normalized = collect($items)
                    ->map(function ($item) use ($fields): array {
                        if (! is_array($item)) {
                            throw ValidationException::withMessages([
                                'display_metadata' => 'Setiap tarif tampilan harus berupa satu baris data.',
                            ]);
                        }

                        return collect($fields)
                            ->mapWithKeys(function (string $field) use ($item): array {
                                $value = trim((string) ($item[$field] ?? ''));
                                if (mb_strlen($value) > 160) {
                                    throw ValidationException::withMessages([
                                        'display_metadata' => 'Setiap isi tarif tampilan maksimal 160 karakter.',
                                    ]);
                                }

                                return [$field => $value];
                            })
                            ->all();
                    })
                    ->filter(fn (array $item) => collect($item)->contains(fn (string $value) => $value !== ''))
                    ->values()
                    ->all();

                return [$section => $normalized];
            })
            ->all();

        foreach (['map_url', 'mapLink', 'map_embed_url', 'mapEmbedUrl'] as $key) {
            if (! array_key_exists($key, $decoded)) {
                continue;
            }

            $value = trim((string) $decoded[$key]);

            if ($value === '') {
                unset($decoded[$key]);

                continue;
            }

            $safeUrl = SafePublicUrl::googleMaps($value);

            if ($safeUrl === null) {
                throw ValidationException::withMessages([
                    'display_metadata' => 'Tautan peta harus berupa URL HTTPS Google Maps yang valid.',
                ]);
            }

            $decoded[$key] = $safeUrl;
        }

        return $decoded;
    }

    /**
     * Keep the persisted schedule deterministic regardless of the order in
     * which an administrator selected its chips in the visual editor.
     */
    private function normalizeActiveSlots(?array $slots): ?array
    {
        if ($slots === null) {
            return null;
        }

        return collect(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
            ->mapWithKeys(fn (string $day): array => [
                $day => collect($slots[$day] ?? [])
                    ->filter(fn ($time): bool => is_string($time) && preg_match('/^\d{2}:\d{2}$/', $time) === 1)
                    ->unique()
                    ->sort()
                    ->values()
                    ->all(),
            ])
            ->all();
    }

    private function guardGalleryCapacity(
        Facility $facility,
        int $incomingCount,
    ): void {
        if (
            $incomingCount > 0 &&
            $facility->getMedia('gallery')->count() + $incomingCount > 24
        ) {
            throw ValidationException::withMessages([
                'gallery' => 'Galeri reservasi maksimal berisi 24 gambar.',
            ]);
        }
    }

    private function transformFacility(Facility $facility): array
    {
        return [
            'id' => $facility->id,
            'name' => $facility->name,
            'slug' => $facility->slug,
            'description' => $facility->description,
            'location' => $facility->location,
            'venue_type' => $facility->venue_type,
            'capacity' => $facility->capacity ?? 1,
            'active_slots' => $facility->active_slots,
            'class_code' => $facility->class_code,
            'rating' => $facility->rating,
            'display_metadata' => $facility->display_metadata,
            'reservation_method' => $facility->reservation_method ?? 'whatsapp',
            'reservation_url' => $facility->reservation_url,
            'reservation_phone' => $facility->reservation_phone
                ?: (
                    preg_replace(
                        '/\D+/',
                        '',
                        (string) config('business.whatsapp.number'),
                    ) ?: '6285280809080'
                ),
            'reservation_message' => $facility->reservation_message
                ?: FacilityReservationLink::DEFAULT_MESSAGE,
            'is_active' => $facility->is_active,
            'sort_order' => $facility->sort_order,
            'prices_count' => $facility->prices_count ?? 0,
            'units_count' => $facility->units_count ?? 0,
            'category' => $facility->category ? [
                'id' => $facility->category->id,
                'name' => $facility->category->name,
                'slug' => $facility->category->slug,
            ] : null,
            'hero' => $facility->getFirstMedia('hero')
                ? [
                    'id' => $facility->getFirstMedia('hero')->id,
                    'url' => $facility->getFirstMediaUrl('hero'),
                    'name' => $facility->getFirstMedia('hero')->name,
                    'order_column' => $facility->getFirstMedia('hero')->order_column,
                ]
                : null,
            'gallery' => $facility->getMedia('gallery')->map(fn (Media $m) => [
                'id' => $m->id,
                'url' => $m->getUrl(),
                'name' => $m->name,
                'order_column' => $m->order_column,
            ])->values()->all(),
        ];
    }

    private function normalizeReservationPhone(?string $phone): string
    {
        $digits = preg_replace(
            '/\D+/',
            '',
            (string) ($phone ?: config('business.whatsapp.number')),
        ) ?: '6285280809080';

        if (str_starts_with($digits, '0')) {
            return '62'.substr($digits, 1);
        }

        if (str_starts_with($digits, '8')) {
            return '62'.$digits;
        }

        return $digits;
    }
}
