<?php

namespace App\Services\Gallery;

use App\Models\Gallery\GalleryAnalyticsDaily;
use App\Models\Gallery\GalleryAnalyticsEvent;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class GalleryAnalyticsAggregationService
{
    public function aggregateDate(CarbonImmutable $date): int
    {
        $timezone = config('facility-gallery.timezone', 'Asia/Jakarta');
        $start = $date->setTimezone($timezone)->startOfDay()->utc();
        $end = $start->addDay();
        $events = GalleryAnalyticsEvent::query()
            ->where('occurred_at', '>=', $start)
            ->where('occurred_at', '<', $end)
            ->get([
                'event_type', 'item_uuid', 'section_key', 'session_hash',
                'query_term', 'payload',
            ]);
        $groups = $events->groupBy(function (GalleryAnalyticsEvent $event) {
            $dimension = $this->dimension($event);

            return implode('|', [
                $event->event_type,
                $event->section_key ?? '',
                $event->item_uuid ?? '',
                hash('sha256', $dimension ?? ''),
            ]);
        });

        DB::transaction(function () use ($date, $groups, $timezone) {
            $eventDate = $date->setTimezone($timezone)->toDateString();
            GalleryAnalyticsDaily::query()->where('event_date', $eventDate)->delete();

            foreach ($groups as $events) {
                /** @var GalleryAnalyticsEvent $first */
                $first = $events->first();
                $dimension = $this->dimension($first);

                GalleryAnalyticsDaily::create([
                    'event_date' => $eventDate,
                    'event_type' => $first->event_type,
                    'section_key' => $first->section_key ?? '',
                    'item_uuid' => $first->item_uuid,
                    'dimension_hash' => hash('sha256', $dimension ?? ''),
                    'dimension_label' => $dimension,
                    'event_count' => $events->count(),
                    'unique_sessions' => $events->pluck('session_hash')->filter()->unique()->count(),
                ]);
            }
        });

        return $events->count();
    }

    private function dimension(GalleryAnalyticsEvent $event): ?string
    {
        if (in_array($event->event_type, ['gallery_search', 'gallery_zero_result'], true)) {
            return $event->query_term;
        }

        if ($event->event_type === 'gallery_filter_change') {
            $filter = trim((string) data_get($event->payload, 'filter'));
            $value = trim((string) data_get($event->payload, 'value'));

            return trim("{$filter}:{$value}", ':') ?: null;
        }

        return null;
    }
}
