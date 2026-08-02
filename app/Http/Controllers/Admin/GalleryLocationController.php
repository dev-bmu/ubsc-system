<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryLocation;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class GalleryLocationController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-facility-gallery');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:gallery_locations,name'],
        ]);
        $slug = Str::slug($data['name']);

        if ($slug === '') {
            throw ValidationException::withMessages(['name' => 'Nama lokasi tidak valid.']);
        }

        GalleryLocation::create([
            'name' => trim($data['name']),
            'slug' => $this->uniqueSlug($slug),
            'is_active' => true,
        ]);

        return back()->with('success', 'Lokasi Gallery ditambahkan.');
    }

    public function update(Request $request, GalleryLocation $galleryLocation): RedirectResponse
    {
        $this->authorize('manage-facility-gallery');
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:120',
                Rule::unique('gallery_locations', 'name')->ignore($galleryLocation->id),
            ],
            'is_active' => ['required', 'boolean'],
        ]);
        $galleryLocation->update([
            'name' => trim($data['name']),
            'slug' => $this->uniqueSlug(Str::slug($data['name']), $galleryLocation->id),
            'is_active' => $data['is_active'],
        ]);

        return back()->with('success', 'Lokasi Gallery diperbarui.');
    }

    private function uniqueSlug(string $base, ?int $ignoreId = null): string
    {
        $slug = $base;
        $suffix = 2;

        while (GalleryLocation::query()
            ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
            ->where('slug', $slug)
            ->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
