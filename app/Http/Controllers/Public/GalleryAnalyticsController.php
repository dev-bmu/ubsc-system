<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryAnalyticsEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class GalleryAnalyticsController extends Controller
{
    public function store(Request $request): Response
    {
        if ($request->header('DNT') === '1' || $this->isAutomated($request)) {
            return response()->noContent();
        }

        $data = $request->validate([
            'event_type' => ['required', 'in:gallery_card_impression,gallery_lightbox_open,gallery_lightbox_next,gallery_lightbox_previous,gallery_media_play,gallery_media_complete,gallery_share,gallery_search,gallery_zero_result,gallery_filter_change,gallery_load_more'],
            'item_uuid' => ['nullable', 'uuid', 'exists:gallery_items,uuid'],
            'section_key' => ['nullable', 'string', 'max:24', 'exists:gallery_sections,key'],
            'query' => ['nullable', 'string', 'max:100'],
            'payload' => ['nullable', 'array'],
        ]);
        $sessionSeed = $request->session()->getId().'|'.$request->userAgent();
        $query = isset($data['query'])
            ? Str::of($data['query'])->replaceMatches('/[\p{C}]+/u', ' ')->squish()->lower()->limit(100, '')->value()
            : null;

        GalleryAnalyticsEvent::create([
            'event_type' => $data['event_type'],
            'item_uuid' => $data['item_uuid'] ?? null,
            'section_key' => $data['section_key'] ?? null,
            'session_hash' => hash_hmac('sha256', $sessionSeed, (string) config('app.key')),
            'query_hash' => $query
                ? hash_hmac('sha256', $query, (string) config('app.key'))
                : null,
            'query_term' => $query ?: null,
            'payload' => Arr::only($data['payload'] ?? [], [
                'position', 'source', 'result_count', 'filter', 'value',
                'navigation_depth', 'seconds',
            ]),
            'occurred_at' => now(),
        ]);

        return response()->noContent();
    }

    private function isAutomated(Request $request): bool
    {
        $userAgent = Str::lower((string) $request->userAgent());

        return $userAgent === '' || preg_match(
            '/bot|crawler|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp/i',
            $userAgent,
        ) === 1;
    }
}
