<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InfoBanner;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InfoBannerController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'message'    => ['required', 'string', 'max:255'],
            'is_active'  => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
        ]);

        DB::transaction(function () use ($data, $request) {
            InfoBanner::create([
                'message'    => $data['message'],
                'is_active'  => $data['is_active'] ?? true,
                'sort_order' => $request->integer('sort_order') > 0
                    ? $request->integer('sort_order')
                    : InfoBanner::max('sort_order') + 1,
            ]);

            InfoBanner::normalizeSortOrder();
        });

        return redirect()->route('admin.news.index')->with('success', 'Banner created.');
    }

    public function update(Request $request, InfoBanner $infoBanner): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'message'    => ['required', 'string', 'max:255'],
            'is_active'  => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
        ]);

        DB::transaction(function () use ($data, $infoBanner) {
            $infoBanner->update([
                'message'    => $data['message'],
                'is_active'  => $data['is_active'] ?? $infoBanner->is_active,
                'sort_order' => $data['sort_order'] ?? $infoBanner->sort_order,
            ]);

            InfoBanner::normalizeSortOrder();
        });

        return redirect()->route('admin.news.index')->with('success', 'Banner updated.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        DB::transaction(function () use ($request) {
            $ids = $request->input('ids', []);
            foreach ($ids as $index => $id) {
                InfoBanner::where('id', $id)->update(['sort_order' => $index + 1]);
            }

            InfoBanner::normalizeSortOrder();
        });

        return back();
    }

    public function destroy(InfoBanner $infoBanner): RedirectResponse
    {
        $this->authorize('manage-cms');

        DB::transaction(function () use ($infoBanner) {
            $infoBanner->delete();

            InfoBanner::normalizeSortOrder();
        });

        return redirect()->route('admin.news.index')->with('success', 'Banner deleted.');
    }
}
