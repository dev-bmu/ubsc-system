<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Reel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ReelController extends Controller
{
    public function index(): Response
    {
        $this->authorize('manage-cms');

        $items = Reel::with('media')
            ->latest()
            ->get()
            ->map(fn (Reel $r) => [
                'id'            => $r->id,
                'title'         => $r->title,
                'is_active'     => $r->is_active,
                'thumbnail_url' => $r->getFirstMediaUrl('thumbnail') ?: null,
                'video_url'     => $r->getFirstMediaUrl('video') ?: null,
            ]);

        return Inertia::render('Admin/Reels/Index', ['items' => $items]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'title'     => ['required', 'string', 'max:255'],
            'is_active' => ['boolean'],
            'thumbnail' => ['nullable', 'image', 'max:5120'],
            'video'     => ['nullable', 'mimes:mp4,webm', 'max:51200'],
        ]);

        $item = Reel::create([
            'title'     => $data['title'],
            'is_active' => $data['is_active'] ?? true,
        ]);

        if ($request->hasFile('thumbnail')) {
            $item->addMediaFromRequest('thumbnail')->toMediaCollection('thumbnail');
        }

        if ($request->hasFile('video')) {
            $item->addMediaFromRequest('video')->toMediaCollection('video');
        }

        return back()->with('success', 'Reel created.');
    }

    public function update(Request $request, Reel $reel): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'title'     => ['required', 'string', 'max:255'],
            'is_active' => ['boolean'],
            'thumbnail' => ['nullable', 'image', 'max:5120'],
            'video'     => ['nullable', 'mimes:mp4,webm', 'max:51200'],
        ]);

        $reel->update([
            'title'     => $data['title'],
            'is_active' => $data['is_active'] ?? $reel->is_active,
        ]);

        if ($request->hasFile('thumbnail')) {
            $reel->addMediaFromRequest('thumbnail')->toMediaCollection('thumbnail');
        }

        if ($request->hasFile('video')) {
            $reel->addMediaFromRequest('video')->toMediaCollection('video');
        }

        return back()->with('success', 'Reel updated.');
    }

    public function destroy(Reel $reel): RedirectResponse
    {
        $this->authorize('manage-cms');

        $reel->delete();

        return back()->with('success', 'Reel deleted.');
    }
}
