<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PromoCarousel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PromoCarouselController extends Controller
{
    public function index(): Response
    {
        $this->authorize('manage-cms');

        $items = PromoCarousel::with('media')
            ->orderBy('sort_order')
            ->get()
            ->map(fn (PromoCarousel $p) => [
                'id'         => $p->id,
                'title'      => $p->title,
                'is_active'  => $p->is_active,
                'sort_order' => $p->sort_order,
                'slide_url'  => $p->getFirstMediaUrl('slide') ?: null,
            ]);

        return Inertia::render('Admin/Promo/Index', ['items' => $items]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'title'      => ['nullable', 'string', 'max:255'],
            'is_active'  => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
            'slide'      => ['nullable', 'image', 'max:5120'],
        ]);

        $item = PromoCarousel::create([
            'title'      => $data['title'] ?? null,
            'is_active'  => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        if ($request->hasFile('slide')) {
            $item->addMediaFromRequest('slide')->toMediaCollection('slide');
        }

        return back()->with('success', 'Slide created.');
    }

    public function update(Request $request, PromoCarousel $promoCarousel): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'title'      => ['nullable', 'string', 'max:255'],
            'is_active'  => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
            'slide'      => ['nullable', 'image', 'max:5120'],
        ]);

        $promoCarousel->update([
            'title'      => $data['title'] ?? null,
            'is_active'  => $data['is_active'] ?? $promoCarousel->is_active,
            'sort_order' => $data['sort_order'] ?? $promoCarousel->sort_order,
        ]);

        if ($request->hasFile('slide')) {
            $promoCarousel->addMediaFromRequest('slide')->toMediaCollection('slide');
        }

        return back()->with('success', 'Slide updated.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $ids = $request->input('ids', []);
        foreach ($ids as $index => $id) {
            PromoCarousel::where('id', $id)->update(['sort_order' => $index + 1]);
        }

        return back();
    }

    public function destroy(PromoCarousel $promoCarousel): RedirectResponse
    {
        $this->authorize('manage-cms');

        $promoCarousel->delete();

        return back()->with('success', 'Slide deleted.');
    }
}
