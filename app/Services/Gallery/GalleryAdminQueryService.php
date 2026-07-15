<?php

namespace App\Services\Gallery;

use App\Models\Gallery\GalleryItemTranslation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class GalleryAdminQueryService
{
    public function apply(Builder $query, Request $request): Builder
    {
        $search = trim((string) $request->query('q', ''));

        if ($search !== '') {
            $needle = $this->likeValue(mb_substr($search, 0, 100));
            $query->where(function (Builder $nested) use ($needle) {
                $nested
                    ->where('uuid', 'like', $needle)
                    ->orWhereHas('translations', function (Builder $translation) use ($needle) {
                        $translation
                            ->where('title', 'like', $needle)
                            ->orWhere('arena_type', 'like', $needle)
                            ->orWhere('alt_text', 'like', $needle)
                            ->orWhere('search_aliases', 'like', $needle);
                    })
                    ->orWhereHas('location', fn (Builder $location) => $location
                        ->where('name', 'like', $needle))
                    ->orWhereHas('creator', fn (Builder $user) => $user
                        ->where('name', 'like', $needle))
                    ->orWhereHas('updater', fn (Builder $user) => $user
                        ->where('name', 'like', $needle))
                    ->orWhereHas('media', fn (Builder $media) => $media
                        ->where('file_name', 'like', $needle));
            });
        }

        $query
            ->when($request->filled('status'), fn (Builder $builder) => $builder
                ->where('status', $request->query('status')))
            ->when($request->filled('media_type'), fn (Builder $builder) => $builder
                ->where('media_type', $request->query('media_type')))
            ->when($request->filled('location'), fn (Builder $builder) => $builder
                ->where('location_id', $request->integer('location')))
            ->when($request->filled('editor'), fn (Builder $builder) => $builder
                ->where(function (Builder $editor) use ($request) {
                    $editor->where('created_by', $request->integer('editor'))
                        ->orWhere('updated_by', $request->integer('editor'));
                }))
            ->when($request->filled('section'), fn (Builder $builder) => $builder
                ->whereHas('sections', fn (Builder $section) => $section
                    ->where('key', $request->query('section'))))
            ->when($request->filled('year'), function (Builder $builder) use ($request) {
                $year = $request->integer('year');
                $builder->where(function (Builder $dateQuery) use ($year) {
                    $dateQuery->whereYear('captured_at', $year)
                        ->orWhere(function (Builder $fallback) use ($year) {
                            $fallback->whereNull('captured_at')->whereYear('published_at', $year);
                        });
                });
            })
            ->when($request->filled('published_from'), fn (Builder $builder) => $builder
                ->whereDate('published_at', '>=', $request->date('published_from')))
            ->when($request->filled('published_to'), fn (Builder $builder) => $builder
                ->whereDate('published_at', '<=', $request->date('published_to')));

        return $this->sort($query, (string) $request->query('sort', 'updated_desc'));
    }

    private function sort(Builder $query, string $sort): Builder
    {
        return match ($sort) {
            'created_desc' => $query->orderByDesc('created_at')->orderByDesc('id'),
            'scheduled_asc' => $query->orderByRaw('publish_at IS NULL, publish_at ASC')->orderByDesc('id'),
            'published_desc' => $query->orderByDesc('published_at')->orderByDesc('id'),
            'title_asc' => $query->orderBy(
                GalleryItemTranslation::query()
                    ->select('title')
                    ->whereColumn('gallery_item_id', 'gallery_items.id')
                    ->where('locale', 'id')
                    ->limit(1),
            )->orderByDesc('id'),
            'section_position' => $query->orderBy(
                fn ($subquery) => $subquery
                    ->selectRaw('MIN(sort_order)')
                    ->from('gallery_item_section')
                    ->whereColumn('gallery_item_id', 'gallery_items.id'),
            )->orderByDesc('updated_at'),
            default => $query->orderByDesc('updated_at')->orderByDesc('id'),
        };
    }

    private function likeValue(string $value): string
    {
        return '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value).'%';
    }
}
