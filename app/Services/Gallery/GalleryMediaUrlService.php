<?php

namespace App\Services\Gallery;

use Illuminate\Support\Facades\Storage;

class GalleryMediaUrlService
{
    public function image(?array $image): ?array
    {
        if (! $image || empty($image['fallback'])) {
            return null;
        }

        $formats = [];

        foreach (($image['formats'] ?? []) as $format => $entries) {
            $formats[$format] = collect($entries)
                ->sortBy(fn (array $entry) => $entry['width'])
                ->map(fn (array $entry) => [
                    ...$entry,
                    'url' => $this->url($entry['path']),
                ])
                ->values()
                ->all();
        }

        return [
            'width' => (int) ($image['width'] ?? 0),
            'height' => (int) ($image['height'] ?? 0),
            'fallback_url' => $this->url($image['fallback']),
            'formats' => $formats,
            'srcsets' => collect($formats)->map(
                fn (array $entries) => collect($entries)
                    ->map(fn (array $entry) => "{$entry['url']} {$entry['width']}w")
                    ->implode(', '),
            )->all(),
        ];
    }

    public function video(?array $video): ?array
    {
        if (! $video || empty($video['fallback'])) {
            return null;
        }

        return [
            'width' => (int) ($video['width'] ?? 0),
            'height' => (int) ($video['height'] ?? 0),
            'duration_ms' => (int) ($video['duration_ms'] ?? 0),
            'hls_url' => ! empty($video['hls']) ? $this->url($video['hls']) : null,
            'fallback_url' => $this->url($video['fallback']),
            'renditions' => collect($video['renditions'] ?? [])->map(fn (array $rendition) => [
                ...$rendition,
                'playlist_url' => $this->url($rendition['playlist']),
            ])->all(),
            'poster' => $this->image($video['poster'] ?? null),
        ];
    }

    public function url(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        return Storage::disk(config('facility-gallery.public_disk', 'public'))->url($path);
    }
}
