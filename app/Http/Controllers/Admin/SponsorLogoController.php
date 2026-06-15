<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SponsorLogo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SponsorLogoController extends Controller
{
    public function index(): Response
    {
        $this->authorize('manage-cms');

        $items = SponsorLogo::with('media')
            ->orderBy('sort_order')
            ->get()
            ->map(fn (SponsorLogo $s) => [
                'id'         => $s->id,
                'name'       => $s->name,
                'is_active'  => $s->is_active,
                'sort_order' => $s->sort_order,
                'logo_url'   => $s->getFirstMediaUrl('logo') ?: null,
            ]);

        return Inertia::render('Admin/Sponsors/Index', ['items' => $items]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'name'       => ['required', 'string', 'max:255'],
            'is_active'  => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
            'logo'       => ['nullable', 'image', 'max:5120'],
        ]);

        $item = SponsorLogo::create([
            'name'       => $data['name'],
            'is_active'  => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        if ($request->hasFile('logo')) {
            $item->addMediaFromRequest('logo')->toMediaCollection('logo');
        }

        return back()->with('success', 'Sponsor added.');
    }

    public function update(Request $request, SponsorLogo $sponsorLogo): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'name'       => ['required', 'string', 'max:255'],
            'is_active'  => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
            'logo'       => ['nullable', 'image', 'max:5120'],
        ]);

        $sponsorLogo->update([
            'name'       => $data['name'],
            'is_active'  => $data['is_active'] ?? $sponsorLogo->is_active,
            'sort_order' => $data['sort_order'] ?? $sponsorLogo->sort_order,
        ]);

        if ($request->hasFile('logo')) {
            $sponsorLogo->addMediaFromRequest('logo')->toMediaCollection('logo');
        }

        return back()->with('success', 'Sponsor updated.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $ids = $request->input('ids', []);
        foreach ($ids as $index => $id) {
            SponsorLogo::where('id', $id)->update(['sort_order' => $index + 1]);
        }

        return back();
    }

    public function destroy(SponsorLogo $sponsorLogo): RedirectResponse
    {
        $this->authorize('manage-cms');

        $sponsorLogo->delete();

        return back()->with('success', 'Sponsor deleted.');
    }
}
