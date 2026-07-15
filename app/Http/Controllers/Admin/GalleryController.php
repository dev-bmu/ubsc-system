<?php

namespace App\Http\Controllers\Admin;

use App\Enums\GalleryItemStatus;
use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GalleryLocation;
use App\Models\Gallery\GallerySavedView;
use App\Models\Gallery\GallerySection;
use App\Models\User;
use App\Services\Gallery\GalleryAdminQueryService;
use App\Services\Gallery\GalleryAnalyticsReportService;
use App\Services\Gallery\GalleryCapabilityService;
use App\Services\Gallery\GalleryMediaUrlService;
use App\Services\Gallery\GalleryReadinessService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GalleryController extends Controller
{
    public function index(
        Request $request,
        GalleryMediaUrlService $urls,
        GalleryReadinessService $readiness,
        GalleryCapabilityService $capabilities,
        GalleryAdminQueryService $adminQuery,
        GalleryAnalyticsReportService $analytics,
    ): Response {
        $this->authorize('view-facility-gallery');

        $query = GalleryItem::query()
            ->with([
                'translations', 'sections', 'location', 'creator', 'updater', 'media',
                'auditLogs.user',
            ]);

        $adminQuery->apply($query, $request);

        $items = $query
            ->paginate(24)
            ->withQueryString()
            ->through(fn (GalleryItem $item) => $this->serializeItem($item, $urls, $readiness));

        $statusCounts = GalleryItem::query()
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        return Inertia::render('Admin/Gallery/Index', [
            'items' => $items,
            'status_counts' => collect(GalleryItemStatus::cases())->mapWithKeys(
                fn (GalleryItemStatus $status) => [$status->value => (int) ($statusCounts[$status->value] ?? 0)],
            ),
            'sections' => GallerySection::query()
                ->withCount('items')
                ->orderBy('id')
                ->get()
                ->map(function (GallerySection $section) use ($urls) {
                    $featured = $section->items()
                        ->wherePivotNotNull('featured_position')
                        ->with(['translations', 'media'])
                        ->orderByPivot('featured_position')
                        ->limit($section->quota)
                        ->get()
                        ->map(function (GalleryItem $item) use ($urls) {
                            $derivatives = $item->derivatives ?? [];
                            $image = $urls->image($derivatives['image'] ?? null);
                            $video = $urls->video($derivatives['video'] ?? null);

                            return [
                                'uuid' => $item->uuid,
                                'title' => $item->translation('id')?->title ?? '',
                                'status' => $item->status->value,
                                'position' => $item->pivot->featured_position,
                                'thumbnail' => $image['fallback_url']
                                    ?? $video['poster']['fallback_url']
                                    ?? null,
                            ];
                        })->values();

                    return [
                        'id' => $section->id,
                        'key' => $section->key,
                        'name' => $section->name,
                        'slug' => $section->slug,
                        'quota' => $section->quota,
                        'layout' => $section->layout,
                        'is_active' => $section->is_active,
                        'items_count' => $section->items_count,
                        'featured_items' => $featured,
                    ];
                }),
            'locations' => GalleryLocation::query()->orderBy('name')->get(),
            'saved_views' => GallerySavedView::query()
                ->where('user_id', $request->user()->id)
                ->orderBy('name')
                ->get(),
            'editors' => User::query()
                ->whereIn('id', GalleryItem::query()
                    ->select('updated_by')
                    ->whereNotNull('updated_by'))
                ->orderBy('name')
                ->get(['id', 'name']),
            'filters' => $request->only([
                'q', 'status', 'section', 'location', 'media_type', 'year', 'editor',
                'published_from', 'published_to', 'sort',
            ]),
            'capabilities' => $capabilities->report(),
            'upload_config' => [
                'max_batch_files' => 20,
                'image_max_bytes' => (int) config('facility-gallery.image.max_bytes'),
                'video_max_bytes' => (int) config('facility-gallery.video.max_bytes'),
                'timezone' => config('facility-gallery.timezone'),
            ],
            'permissions' => [
                'manage' => $request->user()->can('manage-facility-gallery'),
                'publish' => $request->user()->can('publish-facility-gallery'),
                'delete' => $request->user()->can('delete-facility-gallery'),
            ],
            'analytics' => $analytics->summary(),
        ]);
    }

    private function serializeItem(
        GalleryItem $item,
        GalleryMediaUrlService $urls,
        GalleryReadinessService $readiness,
    ): array {
        $id = $item->translation('id');
        $en = $item->translation('en');
        $derivatives = $item->derivatives ?? [];

        return [
            'uuid' => $item->uuid,
            'media_type' => $item->media_type->value,
            'status' => $item->status->value,
            'title' => $id?->title ?? '',
            'arena_type' => $id?->arena_type ?? '',
            'alt_text' => $id?->alt_text ?? '',
            'caption' => $id?->caption,
            'search_aliases' => $id?->search_aliases ?? [],
            'translation_en' => $en ? [
                'title' => $en->title,
                'arena_type' => $en->arena_type,
                'alt_text' => $en->alt_text,
                'caption' => $en->caption,
            ] : null,
            'location' => $item->location ? [
                'id' => $item->location->id,
                'name' => $item->location->name,
            ] : null,
            'sections' => $item->sections->map(fn (GallerySection $section) => [
                'key' => $section->key,
                'name' => $section->name,
                'featured_position' => $section->pivot->featured_position,
                'sort_order' => $section->pivot->sort_order,
            ])->values(),
            'captured_at' => $item->captured_at?->format('Y-m-d'),
            'publish_at' => $item->publish_at?->timezone(
                config('facility-gallery.timezone', 'Asia/Jakarta'),
            )->format('Y-m-d\TH:i'),
            'published_at' => $item->published_at?->toIso8601String(),
            'credit' => $item->credit,
            'focal_x' => $item->focal_x,
            'focal_y' => $item->focal_y,
            'poster_second' => $item->poster_second,
            'image' => $urls->image($derivatives['image'] ?? null),
            'video' => $urls->video($derivatives['video'] ?? null),
            'processing_error_code' => $item->processing_error_code,
            'processing_error_detail' => $item->processing_error_detail,
            'source_file_name' => $item->getFirstMedia('source')?->getCustomProperty('original_name')
                ?? $item->getFirstMedia('source')?->file_name,
            'rights_confirmed' => (bool) $item->rights_confirmed_at,
            'lock_version' => $item->lock_version,
            'readiness_errors' => $readiness->errors($item),
            'created_by' => $item->creator?->name,
            'updated_by' => $item->updater?->name,
            'updated_at' => $item->updated_at?->toIso8601String(),
            'audit' => $item->auditLogs->map(fn ($log) => [
                'id' => $log->id,
                'action' => $log->action,
                'user' => $log->user?->name ?? 'Sistem',
                'created_at' => $log->created_at?->toIso8601String(),
            ])->values(),
        ];
    }
}
