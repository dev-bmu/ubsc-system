<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GalleryLocation;
use App\Services\Gallery\GalleryAdminQueryService;
use App\Services\Gallery\GalleryAuditService;
use App\Services\Gallery\GalleryCacheService;
use App\Services\Gallery\GalleryPlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class GalleryCsvController extends Controller
{
    private const HEADERS = [
        'uuid', 'lock_version', 'status', 'title_id', 'arena_type_id', 'alt_text_id',
        'caption_id', 'search_aliases', 'title_en', 'arena_type_en', 'alt_text_en',
        'caption_en', 'location_slug', 'sections', 'captured_at', 'credit', 'focal_x',
        'focal_y', 'rights_confirmed',
    ];

    public function export(Request $request, GalleryAdminQueryService $adminQuery): StreamedResponse
    {
        $this->authorize('view-facility-gallery');

        $query = GalleryItem::query()->with(['translations', 'sections', 'location']);
        if ($request->has('uuids')) {
            $data = $request->validate([
                'uuids' => ['required', 'array', 'min:1', 'max:100'],
                'uuids.*' => ['uuid', 'distinct'],
            ]);
            $query->whereIn('uuid', $data['uuids'])->orderByDesc('updated_at');
        } else {
            $adminQuery->apply($query, $request);
        }
        $filename = 'facility-gallery-'.now()->format('Ymd-His').'.csv';

        return response()->streamDownload(function () use ($query) {
            $output = fopen('php://output', 'wb');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, self::HEADERS);

            foreach ($query->lazy(250) as $item) {
                $id = $item->translation('id');
                $en = $item->translations->firstWhere('locale', 'en');
                $row = [
                    $item->uuid,
                    $item->lock_version,
                    $item->status->value,
                    $id?->title,
                    $id?->arena_type,
                    $id?->alt_text,
                    $id?->caption,
                    implode('|', $id?->search_aliases ?? []),
                    $en?->title,
                    $en?->arena_type,
                    $en?->alt_text,
                    $en?->caption,
                    $item->location?->slug,
                    $item->sections->pluck('key')->implode('|'),
                    $item->captured_at?->format('Y-m-d'),
                    $item->credit,
                    $item->focal_x,
                    $item->focal_y,
                    $item->rights_confirmed_at ? '1' : '0',
                ];
                fputcsv($output, array_map($this->escapeSpreadsheetCell(...), $row));
            }

            fclose($output);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function import(
        Request $request,
        GalleryPlacementService $placements,
        GalleryAuditService $audit,
        GalleryCacheService $cache,
    ): JsonResponse {
        $this->authorize('manage-facility-gallery');
        $request->validate([
            'csv' => ['required', 'file', 'mimes:csv,txt', 'max:5120'],
        ]);

        $handle = fopen($request->file('csv')->getRealPath(), 'rb');
        $headers = fgetcsv($handle);

        if (! is_array($headers)) {
            throw ValidationException::withMessages(['csv' => 'CSV tidak memiliki header.']);
        }

        $headers[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $headers[0]);
        $headers = array_map(fn ($header) => trim((string) $header), $headers);
        if (count($headers) !== count(array_unique($headers))) {
            throw ValidationException::withMessages(['csv' => 'CSV memiliki nama kolom duplikat.']);
        }
        $requiredHeaders = ['uuid', 'lock_version', 'title_id', 'arena_type_id', 'alt_text_id', 'location_slug', 'sections'];
        $missing = array_values(array_diff($requiredHeaders, $headers));

        if ($missing !== []) {
            throw ValidationException::withMessages([
                'csv' => 'Header wajib tidak tersedia: '.implode(', ', $missing).'.',
            ]);
        }

        $results = [];
        $line = 1;

        while (($values = fgetcsv($handle)) !== false) {
            $line++;
            if ($line > 1001) {
                $results[] = ['line' => $line, 'ok' => false, 'message' => 'Batas impor adalah 1000 baris.'];
                break;
            }

            if (count(array_filter($values, fn ($value) => trim((string) $value) !== '')) === 0) {
                continue;
            }

            $values = array_pad($values, count($headers), null);
            $row = array_map(
                $this->restoreSpreadsheetCell(...),
                array_combine($headers, array_slice($values, 0, count($headers))),
            );

            try {
                $this->importRow($row, $request, $placements, $audit);
                $results[] = ['line' => $line, 'uuid' => $row['uuid'] ?? null, 'ok' => true];
            } catch (Throwable $exception) {
                $results[] = [
                    'line' => $line,
                    'uuid' => $row['uuid'] ?? null,
                    'ok' => false,
                    'message' => $exception instanceof ValidationException
                        ? collect($exception->errors())->flatten()->first()
                        : $exception->getMessage(),
                ];
            }
        }

        fclose($handle);
        $cache->invalidate();

        return response()->json([
            'succeeded' => collect($results)->where('ok', true)->count(),
            'failed' => collect($results)->where('ok', false)->count(),
            'results' => $results,
        ]);
    }

    /**
     * @param  array<string, string|null>  $row
     */
    private function importRow(
        array $row,
        Request $request,
        GalleryPlacementService $placements,
        GalleryAuditService $audit,
    ): void {
        $data = Validator::make($row, [
            'uuid' => ['required', 'uuid', 'exists:gallery_items,uuid'],
            'lock_version' => ['required', 'integer', 'min:1'],
            'title_id' => ['required', 'string', 'max:255'],
            'arena_type_id' => ['required', 'string', 'max:160'],
            'alt_text_id' => ['required', 'string', 'max:500'],
            'caption_id' => ['nullable', 'string', 'max:5000'],
            'title_en' => ['nullable', 'string', 'max:255'],
            'arena_type_en' => ['nullable', 'string', 'max:160'],
            'alt_text_en' => ['nullable', 'string', 'max:500'],
            'caption_en' => ['nullable', 'string', 'max:5000'],
            'location_slug' => ['required', Rule::exists('gallery_locations', 'slug')->where('is_active', true)],
            'captured_at' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
            'credit' => ['nullable', 'string', 'max:255'],
            'focal_x' => ['nullable', 'numeric', 'between:0,1'],
            'focal_y' => ['nullable', 'numeric', 'between:0,1'],
            'rights_confirmed' => ['nullable', Rule::in(['0', '1'])],
        ])->validate();
        $sections = collect(explode('|', (string) ($row['sections'] ?? '')))
            ->map(fn ($key) => trim($key))
            ->filter()
            ->unique()
            ->values();
        Validator::make(['sections' => $sections->all()], [
            'sections' => ['required', 'array', 'min:1', 'max:3'],
            'sections.*' => ['string', 'distinct', 'exists:gallery_sections,key'],
        ])->validate();
        $aliases = collect(explode('|', (string) ($row['search_aliases'] ?? '')))
            ->map(fn ($alias) => trim($alias))
            ->filter()
            ->unique()
            ->take(20)
            ->values();
        Validator::make(['aliases' => $aliases->all()], [
            'aliases' => ['array', 'max:20'],
            'aliases.*' => ['string', 'max:80'],
        ])->validate();

        DB::transaction(function () use ($data, $sections, $aliases, $request, $placements, $audit) {
            $item = GalleryItem::query()->lockForUpdate()->where('uuid', $data['uuid'])->firstOrFail();

            if ($item->lock_version !== (int) $data['lock_version']) {
                throw ValidationException::withMessages([
                    'lock_version' => "Versi {$data['uuid']} sudah berubah. Ekspor ulang sebelum mengimpor.",
                ]);
            }

            $before = [
                'location_id' => $item->location_id,
                'captured_at' => $item->captured_at?->format('Y-m-d'),
                'credit' => $item->credit,
                'translation_id' => $item->translation('id')?->toArray(),
            ];
            $location = GalleryLocation::query()->where('slug', $data['location_slug'])->firstOrFail();
            $confirmRights = ($data['rights_confirmed'] ?? '0') === '1';

            if ($item->status === \App\Enums\GalleryItemStatus::Published && ! $confirmRights) {
                throw ValidationException::withMessages([
                    'rights_confirmed' => 'Media terbit tidak boleh kehilangan konfirmasi hak publikasi.',
                ]);
            }

            $item->forceFill([
                'location_id' => $location->id,
                'captured_at' => $data['captured_at'] ?? null,
                'credit' => $data['credit'] ?: 'UB Sport Center',
                'focal_x' => $data['focal_x'] ?? $item->focal_x,
                'focal_y' => $data['focal_y'] ?? $item->focal_y,
                'rights_confirmed_at' => $confirmRights ? ($item->rights_confirmed_at ?? now()) : null,
                'rights_confirmed_by' => $confirmRights ? $request->user()->id : null,
                'updated_by' => $request->user()->id,
                'lock_version' => $item->lock_version + 1,
            ])->save();
            $item->translations()->updateOrCreate(['locale' => 'id'], [
                'title' => $data['title_id'],
                'arena_type' => $data['arena_type_id'],
                'alt_text' => $data['alt_text_id'],
                'caption' => $data['caption_id'] ?? null,
                'search_aliases' => $aliases->all(),
            ]);

            $englishValues = collect(['title_en', 'arena_type_en', 'alt_text_en'])
                ->map(fn ($key) => trim((string) ($data[$key] ?? '')));
            if ($englishValues->filter()->isNotEmpty()) {
                if ($englishValues->contains('')) {
                    throw ValidationException::withMessages([
                        'title_en' => 'Judul, jenis arena, dan alt text Inggris harus diisi bersama.',
                    ]);
                }
                $item->translations()->updateOrCreate(['locale' => 'en'], [
                    'title' => $data['title_en'],
                    'arena_type' => $data['arena_type_en'],
                    'alt_text' => $data['alt_text_en'],
                    'caption' => $data['caption_en'] ?? null,
                    'search_aliases' => [],
                ]);
            } else {
                $item->translations()->where('locale', 'en')->delete();
            }

            $item->refresh();
            $placements->sync($item, $sections->all(), $request->user());
            $fresh = $item->fresh(['translations']);
            $audit->record($fresh, 'csv_metadata_imported', $before, [
                'location_id' => $fresh->location_id,
                'captured_at' => $fresh->captured_at?->format('Y-m-d'),
                'credit' => $fresh->credit,
                'translation_id' => $fresh->translation('id')?->toArray(),
            ], $request->user());
        });
    }

    private function escapeSpreadsheetCell(mixed $value): string
    {
        $cell = (string) ($value ?? '');

        return preg_match('/^[=+\-@\t\r]/u', $cell) ? "'{$cell}" : $cell;
    }

    private function restoreSpreadsheetCell(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $cell = (string) $value;

        return preg_match('/^\'[=+\-@\t\r]/u', $cell) ? substr($cell, 1) : $cell;
    }
}
