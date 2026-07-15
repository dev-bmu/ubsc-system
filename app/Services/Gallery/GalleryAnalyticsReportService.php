<?php

namespace App\Services\Gallery;

use App\Enums\GalleryItemStatus;
use App\Models\Gallery\GalleryAnalyticsEvent;
use App\Models\Gallery\GalleryAuditLog;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GallerySection;

class GalleryAnalyticsReportService
{
    /**
     * @return array<string, mixed>
     */
    public function summary(int $days = 30): array
    {
        $since = now()->subDays(max(1, min($days, 90)));
        $topOpened = GalleryAnalyticsEvent::query()
            ->where('event_type', 'gallery_lightbox_open')
            ->where('occurred_at', '>=', $since)
            ->whereNotNull('item_uuid')
            ->selectRaw('item_uuid, COUNT(*) as event_count')
            ->groupBy('item_uuid')
            ->orderByDesc('event_count')
            ->limit(8)
            ->get();
        $titles = GalleryItem::query()
            ->with('translations')
            ->whereIn('uuid', $topOpened->pluck('item_uuid'))
            ->get()
            ->keyBy('uuid');
        $searches = GalleryAnalyticsEvent::query()
            ->where('event_type', 'gallery_search')
            ->where('occurred_at', '>=', $since)
            ->whereNotNull('query_term')
            ->selectRaw('query_term, COUNT(*) as event_count')
            ->groupBy('query_term')
            ->orderByDesc('event_count')
            ->limit(8)
            ->get();
        $zeroResults = GalleryAnalyticsEvent::query()
            ->where('event_type', 'gallery_zero_result')
            ->where('occurred_at', '>=', $since)
            ->whereNotNull('query_term')
            ->selectRaw('query_term, COUNT(*) as event_count')
            ->groupBy('query_term')
            ->orderByDesc('event_count')
            ->limit(8)
            ->get();
        $eventCounts = GalleryAnalyticsEvent::query()
            ->where('occurred_at', '>=', $since)
            ->selectRaw('event_type, COUNT(*) as event_count')
            ->groupBy('event_type')
            ->pluck('event_count', 'event_type');
        $sectionDistribution = GallerySection::query()
            ->withCount(['items as published_count' => fn ($query) => $query
                ->where('status', GalleryItemStatus::Published->value)])
            ->orderBy('id')
            ->get()
            ->map(fn (GallerySection $section) => [
                'key' => $section->key,
                'name' => $section->name,
                'count' => $section->published_count,
            ]);
        $processingCounts = GalleryAuditLog::query()
            ->where('created_at', '>=', $since)
            ->whereIn('action', ['media_processed', 'media_processing_failed'])
            ->selectRaw('action, COUNT(*) as event_count')
            ->groupBy('action')
            ->pluck('event_count', 'action');
        $filterUsage = [];
        foreach (GalleryAnalyticsEvent::query()
            ->where('event_type', 'gallery_filter_change')
            ->where('occurred_at', '>=', $since)
            ->select(['id', 'payload'])
            ->orderBy('id')
            ->cursor() as $event) {
            $label = trim((string) data_get($event->payload, 'filter'));
            $value = trim((string) data_get($event->payload, 'value'));
            $dimension = trim("{$label}: {$value}", ': ');
            if ($dimension !== '') {
                $filterUsage[$dimension] = ($filterUsage[$dimension] ?? 0) + 1;
            }
        }
        arsort($filterUsage);
        $navigationDepth = GalleryAnalyticsEvent::query()
            ->whereIn('event_type', ['gallery_lightbox_next', 'gallery_lightbox_previous'])
            ->where('occurred_at', '>=', $since)
            ->whereNotNull('session_hash')
            ->selectRaw('session_hash, COUNT(*) as depth')
            ->groupBy('session_hash')
            ->get()
            ->avg('depth') ?? 0;

        return [
            'days' => $days,
            'published_count' => GalleryItem::query()
                ->where('status', GalleryItemStatus::Published->value)
                ->count(),
            'media_distribution' => GalleryItem::query()
                ->where('status', GalleryItemStatus::Published->value)
                ->selectRaw('media_type, COUNT(*) as aggregate')
                ->groupBy('media_type')
                ->pluck('aggregate', 'media_type'),
            'section_distribution' => $sectionDistribution,
            'top_opened' => $topOpened->map(fn ($row) => [
                'uuid' => $row->item_uuid,
                'title' => $titles->get($row->item_uuid)?->translation('id')?->title ?? 'Media dihapus',
                'count' => (int) $row->event_count,
            ]),
            'search_terms' => $searches->map(fn ($row) => [
                'term' => $row->query_term,
                'count' => (int) $row->event_count,
            ]),
            'zero_result_terms' => $zeroResults->map(fn ($row) => [
                'term' => $row->query_term,
                'count' => (int) $row->event_count,
            ]),
            'events' => $eventCounts,
            'processing' => [
                'success' => (int) ($processingCounts['media_processed'] ?? 0),
                'failed' => (int) ($processingCounts['media_processing_failed'] ?? 0),
            ],
            'filter_usage' => collect($filterUsage)->take(8)->map(
                fn ($count, $label) => ['label' => $label, 'count' => $count],
            )->values(),
            'average_navigation_depth' => round((float) $navigationDepth, 1),
            'video_completion_rate' => ($eventCounts['gallery_media_play'] ?? 0) > 0
                ? round((($eventCounts['gallery_media_complete'] ?? 0) / $eventCounts['gallery_media_play']) * 100, 1)
                : 0,
        ];
    }
}
