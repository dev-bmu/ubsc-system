<?php

namespace App\Http\Controllers\Admin;

use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ModerateReviewRequest;
use App\Models\Review;
use App\Models\Testimonial;
use App\Services\ReviewWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TestimonialController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorize('manage-cms');

        $filters = $request->validate([
            'review_search' => ['nullable', 'string', 'max:100'],
            'review_status' => ['nullable', 'in:all,pending,approved,rejected'],
            'review_page' => ['nullable', 'integer', 'min:1'],
        ]);
        $reviewSearch = trim((string) ($filters['review_search'] ?? ''));
        $reviewStatus = (string) ($filters['review_status'] ?? 'all');

        $testimonials = fn () => Testimonial::with('media')
            ->orderBy('sort_order')
            ->get()
            ->map(fn (Testimonial $testimonial) => [
                'id' => $testimonial->id,
                'author_name' => $testimonial->author_name,
                'author_role' => $testimonial->author_role,
                'quote' => $testimonial->quote,
                'is_active' => $testimonial->is_active,
                'sort_order' => $testimonial->sort_order,
                'image_url' => $testimonial->imageUrl(),
                'logo_url' => $testimonial->logoUrl(),
            ]);

        $reviews = Review::query()
            ->with(['user:id,name,email,avatar', 'moderator:id,name'])
            ->when($reviewStatus !== 'all', fn ($query) => $query->where('status', $reviewStatus))
            ->when($reviewSearch !== '', function ($query) use ($reviewSearch): void {
                $query->where(function ($searchQuery) use ($reviewSearch): void {
                    $searchQuery
                        ->where('reviewer_name', 'like', "%{$reviewSearch}%")
                        ->orWhere('text', 'like', "%{$reviewSearch}%")
                        ->orWhereHas('user', function ($userQuery) use ($reviewSearch): void {
                            $userQuery
                                ->where('name', 'like', "%{$reviewSearch}%")
                                ->orWhere('email', 'like', "%{$reviewSearch}%");
                        });
                });
            })
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END")
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->paginate(8, ['*'], 'review_page')
            ->withQueryString()
            ->through(fn (Review $review): array => $this->reviewPayload($review));

        $reviewStats = Review::query()
            ->selectRaw(
                'COUNT(*) AS total,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS rejected',
                [
                    ReviewStatus::Pending->value,
                    ReviewStatus::Approved->value,
                    ReviewStatus::Rejected->value,
                ],
            )
            ->first();

        return Inertia::render('Admin/Testimonials/Index', [
            'testimonials' => $testimonials,
            'reviews' => $reviews,
            'review_stats' => [
                'total' => (int) ($reviewStats?->total ?? 0),
                'pending' => (int) ($reviewStats?->pending ?? 0),
                'approved' => (int) ($reviewStats?->approved ?? 0),
                'rejected' => (int) ($reviewStats?->rejected ?? 0),
            ],
            'review_filters' => [
                'search' => $reviewSearch,
                'status' => $reviewStatus,
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private function reviewPayload(Review $review): array
    {
        $status = $review->status instanceof ReviewStatus
            ? $review->status
            : ReviewStatus::from((string) $review->status);

        return [
            'id' => $review->id,
            'reviewer_name' => $review->reviewer_name ?? $review->user?->name ?? 'Guest',
            'reviewer_email' => $review->user?->email,
            'reviewer_avatar' => $review->user?->avatar_url,
            'rating' => (float) $review->rating,
            'text' => $review->text,
            'status' => $status->value,
            'status_label' => $status->label(),
            'is_approved' => $review->is_approved,
            'version' => (int) $review->version,
            'eligibility_source' => $review->eligibility_source,
            'eligibility_label' => match ($review->eligibility_source) {
                'booking' => 'Reservasi selesai',
                'membership' => 'Membership berbayar',
                default => 'Data lama',
            },
            'eligibility_reference_id' => $review->eligibility_reference_id,
            'moderation_feedback' => $review->moderation_feedback,
            'moderator_name' => $review->moderator?->name,
            'submitted_at' => $review->submitted_at?->translatedFormat('d M Y, H:i')
                ?? $review->created_at->translatedFormat('d M Y, H:i'),
            'moderated_at' => $review->moderated_at?->translatedFormat('d M Y, H:i'),
            'created_at' => $review->created_at->diffForHumans(),
        ];
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $request->validate([
            'author_name' => ['required', 'string', 'max:255'],
            'author_role' => ['required', 'string', 'max:255'],
            'quote' => ['required', 'string'],
            'is_active' => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
            'image' => ['nullable', 'image', 'max:5120'],
            'logo' => ['nullable', 'image', 'max:5120'],
        ]);

        $item = Testimonial::create([
            'author_name' => $data['author_name'],
            'author_role' => $data['author_role'],
            'quote' => $data['quote'],
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
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
            'quote' => ['required', 'string'],
            'is_active' => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
            'image' => ['nullable', 'image', 'max:5120'],
            'logo' => ['nullable', 'image', 'max:5120'],
        ]);

        $testimonial->update([
            'author_name' => $data['author_name'],
            'author_role' => $data['author_role'],
            'quote' => $data['quote'],
            'is_active' => $data['is_active'] ?? $testimonial->is_active,
            'sort_order' => $data['sort_order'] ?? $testimonial->sort_order,
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

    public function moderate(
        ModerateReviewRequest $request,
        Review $review,
        ReviewWorkflowService $workflow,
    ): RedirectResponse {
        $this->authorize('manage-cms');

        $data = $request->validated();
        $result = $workflow->moderate(
            $review,
            $request->user(),
            $data['action'],
            (int) $data['expected_version'],
            $data['feedback'] ?? null,
        );

        return back()->with(
            'success',
            $result->status === ReviewStatus::Approved
                ? 'Review disetujui dan langsung ditayangkan.'
                : 'Review dikembalikan kepada pengguna beserta catatan perbaikan.',
        );
    }
}
