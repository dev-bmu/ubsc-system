<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Review;
use App\Models\Testimonial;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TestimonialController extends Controller
{
    public function index(): Response
    {
        $this->authorize('manage-cms');

        $testimonials = Testimonial::with('media')
            ->orderBy('sort_order')
            ->get()
            ->map(fn (Testimonial $t) => [
                'id'          => $t->id,
                'author_name' => $t->author_name,
                'author_role' => $t->author_role,
                'quote'       => $t->quote,
                'is_active'   => $t->is_active,
                'sort_order'  => $t->sort_order,
                'image_url'   => $t->imageUrl(),
                'logo_url'    => $t->logoUrl(),
            ]);

        $reviews = Review::with('user')
            ->latest()
            ->get()
            ->map(fn (Review $r) => [
                'id'            => $r->id,
                'reviewer_name' => $r->reviewer_name ?? $r->user?->name ?? 'Guest',
                'rating'        => $r->rating,
                'text'          => $r->text,
                'is_approved'   => $r->is_approved,
                'created_at'    => $r->created_at->diffForHumans(),
            ]);

        return Inertia::render('Admin/Testimonials/Index', [
            'testimonials' => $testimonials,
            'reviews'      => $reviews,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'author_name' => ['required', 'string', 'max:255'],
            'author_role' => ['required', 'string', 'max:255'],
            'quote'       => ['required', 'string'],
            'is_active'   => ['boolean'],
            'sort_order'  => ['integer', 'min:0'],
            'image'       => ['nullable', 'image', 'max:5120'],
            'logo'        => ['nullable', 'image', 'max:5120'],
        ]);

        $item = Testimonial::create([
            'author_name' => $data['author_name'],
            'author_role' => $data['author_role'],
            'quote'       => $data['quote'],
            'is_active'   => $data['is_active'] ?? true,
            'sort_order'  => $data['sort_order'] ?? 0,
        ]);

        if ($request->hasFile('image')) {
            $item->addMediaFromRequest('image')->toMediaCollection('image');
        }

        if ($request->hasFile('logo')) {
            $item->addMediaFromRequest('logo')->toMediaCollection('logo');
        }

        return back()->with('success', 'Testimonial created.');
    }

    public function update(Request $request, Testimonial $testimonial): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'author_name' => ['required', 'string', 'max:255'],
            'author_role' => ['required', 'string', 'max:255'],
            'quote'       => ['required', 'string'],
            'is_active'   => ['boolean'],
            'sort_order'  => ['integer', 'min:0'],
            'image'       => ['nullable', 'image', 'max:5120'],
            'logo'        => ['nullable', 'image', 'max:5120'],
        ]);

        $testimonial->update([
            'author_name' => $data['author_name'],
            'author_role' => $data['author_role'],
            'quote'       => $data['quote'],
            'is_active'   => $data['is_active'] ?? $testimonial->is_active,
            'sort_order'  => $data['sort_order'] ?? $testimonial->sort_order,
        ]);

        if ($request->hasFile('image')) {
            $testimonial->addMediaFromRequest('image')->toMediaCollection('image');
        }

        if ($request->hasFile('logo')) {
            $testimonial->addMediaFromRequest('logo')->toMediaCollection('logo');
        }

        return back()->with('success', 'Testimonial updated.');
    }

    public function destroy(Testimonial $testimonial): RedirectResponse
    {
        $this->authorize('manage-cms');

        $testimonial->delete();

        return back()->with('success', 'Testimonial deleted.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        foreach ($request->input('ids', []) as $index => $id) {
            Testimonial::where('id', $id)->update(['sort_order' => $index + 1]);
        }

        return back();
    }

    public function toggleApprove(Review $review): RedirectResponse
    {
        $this->authorize('manage-cms');

        $review->update(['is_approved' => ! $review->is_approved]);

        return back()->with(
            'success',
            $review->is_approved ? 'Review disetujui.' : 'Review ditolak.',
        );
    }

    public function destroyReview(Review $review): RedirectResponse
    {
        $this->authorize('manage-cms');

        $review->delete();

        return back()->with('success', 'Review deleted.');
    }
}
