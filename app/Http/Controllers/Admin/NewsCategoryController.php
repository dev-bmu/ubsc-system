<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\NewsCategory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class NewsCategoryController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $this->validateCategory($request);
        $slug = Str::slug($data['name']);

        NewsCategory::create([
            'name' => $data['name'],
            'slug' => $slug,
        ]);

        return back()->with('success', 'Category created.');
    }

    public function update(Request $request, NewsCategory $newsCategory): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $this->validateCategory($request, $newsCategory);
        $slug = Str::slug($data['name']);

        $newsCategory->update([
            'name' => $data['name'],
            'slug' => $slug,
        ]);

        return back()->with('success', 'Category updated.');
    }

    public function destroy(NewsCategory $newsCategory): RedirectResponse
    {
        $this->authorize('manage-cms');

        $newsCategory->news()->update(['news_category_id' => null]);
        $newsCategory->delete();

        return back()->with('success', 'Category deleted.');
    }

    private function validateCategory(
        Request $request,
        ?NewsCategory $newsCategory = null,
    ): array {
        $validator = validator($request->all(), [
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('news_categories', 'name')->ignore($newsCategory?->id),
            ],
        ]);

        $validator->after(function ($validator) use ($request, $newsCategory): void {
            $slug = Str::slug((string) $request->input('name'));

            if ($slug === '') {
                return;
            }

            $slugExists = NewsCategory::query()
                ->where('slug', $slug)
                ->when($newsCategory, fn ($query) => $query->whereKeyNot($newsCategory->id))
                ->exists();

            if ($slugExists) {
                $validator->errors()->add('name', 'Kategori dengan nama tersebut sudah ada.');
            }
        });

        return $validator->validate();
    }
}
