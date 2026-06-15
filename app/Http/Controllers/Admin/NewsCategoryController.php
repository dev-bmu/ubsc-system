<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\NewsCategory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class NewsCategoryController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
        ]);

        NewsCategory::create([
            'name' => $data['name'],
            'slug' => Str::slug($data['name']),
        ]);

        return back()->with('success', 'Category created.');
    }

    public function update(Request $request, NewsCategory $newsCategory): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
        ]);

        $newsCategory->update([
            'name' => $data['name'],
            'slug' => Str::slug($data['name']),
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
}
