<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\FacilityCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class FacilityCategoryController extends Controller
{
    public function index(): JsonResponse
    {
        $this->authorize('manage-facilities');

        return response()->json(
            FacilityCategory::withCount('facilities')
                ->orderBy('sort_order')
                ->get(['id', 'name', 'slug', 'description', 'sort_order']),
        );
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $request->validate([
            'name'        => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:500'],
            'sort_order'  => ['nullable', 'integer', 'min:0'],
        ]);

        FacilityCategory::create([
            'name'        => $data['name'],
            'slug'        => Str::slug($data['name']),
            'description' => $data['description'] ?? null,
            'sort_order'  => $data['sort_order'] ?? 0,
        ]);

        return back()->with('success', 'Category created.');
    }

    public function update(Request $request, FacilityCategory $facilityCategory): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $data = $request->validate([
            'name'        => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:500'],
            'sort_order'  => ['nullable', 'integer', 'min:0'],
        ]);

        $facilityCategory->update([
            'name'        => $data['name'],
            'slug'        => Str::slug($data['name']),
            'description' => $data['description'] ?? null,
            'sort_order'  => $data['sort_order'] ?? 0,
        ]);

        return back()->with('success', 'Category updated.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $this->authorize('manage-facilities');

        $ids = $request->input('ids', []);
        foreach ($ids as $index => $id) {
            FacilityCategory::where('id', $id)->update(['sort_order' => $index + 1]);
        }

        return back();
    }

    public function destroy(FacilityCategory $facilityCategory): RedirectResponse
    {
        $this->authorize('manage-facilities');

        abort_if(
            $facilityCategory->facilities()->exists(),
            422,
            'Cannot delete a category that still has facilities.',
        );

        $facilityCategory->delete();

        return back()->with('success', 'Category deleted.');
    }
}
