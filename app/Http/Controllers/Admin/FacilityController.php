<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use App\Models\FacilityCategory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
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
            'facility'   => null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $this->validateFacility($request);

        $facility = Facility::create([
            'facility_category_id' => $data['facility_category_id'],
            'name'                 => $data['name'],
            'slug'                 => $data['slug'],
            'description'          => $data['description'] ?? null,
            'location'             => $data['location'] ?? null,
            'venue_type'           => $data['venue_type'] ?? null,
            'capacity'             => $data['capacity'] ?? 1,
            'active_slots'         => $data['active_slots'] ?? null,
            'class_code'           => $data['class_code'] ?? null,
            'rating'               => $data['rating'] ?? 5.0,
            'display_metadata'     => $this->decodeMetadata($data['display_metadata'] ?? null),
            'is_active'            => $data['is_active'],
            'sort_order'           => $data['sort_order'],
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
            ->route('admin.facilities.index')
            ->with('success', 'Facility created.');
    }

    public function edit(Facility $facility): Response
    {
        $this->authorize('manage-facilities');

        $facility->load(['category', 'media']);

        return Inertia::render('Admin/Facilities/Form', [
            'categories' => FacilityCategory::orderBy('sort_order')->get(['id', 'name']),
            'facility'   => $this->transformFacility($facility),
        ]);
    }

    public function update(Request $request, Facility $facility): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $this->validateFacility($request, $facility->id);

        $facility->update([
            'facility_category_id' => $data['facility_category_id'],
            'name'                 => $data['name'],
            'slug'                 => $data['slug'],
            'description'          => $data['description'] ?? null,
            'location'             => $data['location'] ?? null,
            'venue_type'           => $data['venue_type'] ?? null,
            'capacity'             => $data['capacity'] ?? $facility->capacity,
            'active_slots'         => $data['active_slots'] ?? null,
            'class_code'           => $data['class_code'] ?? null,
            'rating'               => $data['rating'] ?? $facility->rating,
            'display_metadata'     => $this->decodeMetadata($data['display_metadata'] ?? null),
            'is_active'            => $data['is_active'],
            'sort_order'           => $data['sort_order'],
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
            'gallery'   => ['required', 'array'],
            'gallery.*' => ['image', 'max:5120'],
        ]);

        foreach ($request->file('gallery') as $image) {
            $facility->addMedia($image)->toMediaCollection('gallery');
        }

        return back()->with('success', 'Gallery images added.');
    }

    public function destroyGalleryMedia(Media $media): RedirectResponse
    {
        $this->authorize('manage-facilities');

        abort_unless(
            $media->collection_name === 'gallery',
            403,
            'Cannot delete hero image via this endpoint.',
        );

        $media->delete();

        return back()->with('success', 'Image removed.');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function validateFacility(Request $request, ?int $excludeId = null): array
    {
        return $request->validate([
            'facility_category_id' => ['required', 'exists:facility_categories,id'],
            'name'                 => ['required', 'string', 'max:150'],
            'slug'                 => [
                'required',
                'string',
                'max:160',
                'alpha_dash',
                \Illuminate\Validation\Rule::unique('facilities', 'slug')->ignore($excludeId),
            ],
            'description'          => ['nullable', 'string', 'max:2000'],
            'location'             => ['nullable', 'string', 'max:100'],
            'venue_type'           => ['nullable', 'string', 'max:100'],
            'capacity'             => ['nullable', 'integer', 'min:1', 'max:9999'],
            'active_slots'         => ['nullable', 'array'],
            'active_slots.*'       => ['nullable', 'array'],
            'active_slots.*.*'     => ['string', 'date_format:H:i'],
            'class_code'           => ['nullable', 'string', 'max:50'],
            'rating'               => ['nullable', 'numeric', 'min:0', 'max:5'],
            'display_metadata'     => ['nullable', 'string'],
            'is_active'            => ['boolean'],
            'sort_order'           => ['nullable', 'integer', 'min:0'],
            'hero'                 => ['nullable', 'image', 'max:5120'],
            'gallery'              => ['nullable', 'array'],
            'gallery.*'            => ['image', 'max:5120'],
            'remove_hero'          => ['nullable', 'boolean'],
        ]);
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

    private function decodeMetadata(?string $json): ?array
    {
        if (! $json) {
            return null;
        }

        $decoded = json_decode($json, true);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
    }

    private function transformFacility(Facility $facility): array
    {
        return [
            'id'               => $facility->id,
            'name'             => $facility->name,
            'slug'             => $facility->slug,
            'description'      => $facility->description,
            'location'         => $facility->location,
            'venue_type'       => $facility->venue_type,
            'capacity'         => $facility->capacity ?? 1,
            'active_slots'     => $facility->active_slots,
            'class_code'       => $facility->class_code,
            'rating'           => $facility->rating,
            'display_metadata' => $facility->display_metadata,
            'is_active'        => $facility->is_active,
            'sort_order'       => $facility->sort_order,
            'prices_count'     => $facility->prices_count ?? 0,
            'units_count'      => $facility->units_count ?? 0,
            'category'         => $facility->category ? [
                'id'   => $facility->category->id,
                'name' => $facility->category->name,
                'slug' => $facility->category->slug,
            ] : null,
            'hero'             => $facility->getFirstMedia('hero')
                ? [
                    'id'           => $facility->getFirstMedia('hero')->id,
                    'url'          => $facility->getFirstMediaUrl('hero'),
                    'name'         => $facility->getFirstMedia('hero')->name,
                    'order_column' => $facility->getFirstMedia('hero')->order_column,
                ]
                : null,
            'gallery'          => $facility->getMedia('gallery')->map(fn (Media $m) => [
                'id'           => $m->id,
                'url'          => $m->getUrl(),
                'name'         => $m->name,
                'order_column' => $m->order_column,
            ])->values()->all(),
        ];
    }
}
