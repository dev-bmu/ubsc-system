<?php

namespace App\Services\ReferenceData;

use App\Support\ReferenceData\PublicContentDefinition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use JsonException;
use RuntimeException;
use Throwable;

final class PublicContentSynchronizer
{
    /**
     * Restore version-controlled public defaults while preserving administrator edits.
     *
     * @return array<string, bool|int|string>
     *
     * @throws Throwable
     */
    public function sync(bool $dryRun = false, bool $repair = false): array
    {
        $this->assertSchemaIsReady();
        $this->assertTrackedAssetsExist();

        $checksum = PublicContentDefinition::checksum();
        $report = $this->emptyReport($checksum, $dryRun);

        DB::beginTransaction();

        try {
            $now = now();

            DB::table('system_settings')->insertOrIgnore([
                'key' => PublicContentDefinition::SETTING_KEY,
                'value' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $setting = DB::table('system_settings')
                ->where('key', PublicContentDefinition::SETTING_KEY)
                ->lockForUpdate()
                ->first();
            $state = $this->decodeState($setting?->value);
            $sameVersion = ($state['version'] ?? null) === PublicContentDefinition::VERSION;
            $sameChecksum = ($state['checksum'] ?? null) === $checksum;

            if ($sameVersion && ! $sameChecksum) {
                throw new RuntimeException(
                    'The public content definition changed without a version bump. '.
                    'Create a new immutable content version before deployment.',
                );
            }

            if ($sameVersion && $sameChecksum && ! $repair) {
                $report['already_current'] = true;
                $dryRun ? DB::rollBack() : DB::commit();

                return $report;
            }

            $categoryIds = $this->syncNewsCategories($report);
            $this->syncNews($categoryIds, $report);
            $this->syncPromos($report);
            $this->syncSponsors($report);
            $this->syncReels($report);
            $this->syncInfoBanners($report);
            $this->syncTestimonials($report);

            if ($dryRun) {
                DB::rollBack();

                return $report;
            }

            DB::table('system_settings')
                ->where('key', PublicContentDefinition::SETTING_KEY)
                ->update([
                    'value' => json_encode([
                        'version' => PublicContentDefinition::VERSION,
                        'checksum' => $checksum,
                    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ]);

            DB::commit();

            return $report;
        } catch (Throwable $exception) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            throw $exception;
        }
    }

    /** @param array<string, bool|int|string> $report @return array<string, int> */
    private function syncNewsCategories(array &$report): array
    {
        $ids = [];
        $now = now();

        foreach (PublicContentDefinition::newsCategories() as $definition) {
            $existing = DB::table('news_categories')
                ->where('slug', $definition['slug'])
                ->first();

            if ($existing) {
                $ids[$definition['slug']] = (int) $existing->id;
                $report['news_categories_preserved']++;

                continue;
            }

            $ids[$definition['slug']] = (int) DB::table('news_categories')->insertGetId([
                'name' => $definition['name'],
                'slug' => $definition['slug'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $report['news_categories_created']++;
        }

        return $ids;
    }

    /** @param array<string, int> $categoryIds @param array<string, bool|int|string> $report */
    private function syncNews(array $categoryIds, array &$report): void
    {
        $report['news_using_system_byline'] = count(PublicContentDefinition::news());

        foreach (PublicContentDefinition::news() as $definition) {
            $this->syncRecord(
                table: 'news',
                definition: $definition,
                legacyColumn: 'slug',
                legacyValue: $definition['slug'],
                insert: [
                    'news_category_id' => $categoryIds[$definition['category']] ?? null,
                    'author_id' => null,
                    'title' => $definition['title'],
                    'slug' => $definition['slug'],
                    'excerpt' => $definition['excerpt'],
                    'content' => $definition['content'],
                    'status' => $definition['status'],
                    'is_hero_featured' => false,
                    'hero_sort_order' => null,
                    'published_at' => $definition['published_at'],
                    'fallback_image_path' => $definition['fallback_image_path'],
                ],
                fallbackFields: ['fallback_image_path'],
                reportPrefix: 'news',
                report: $report,
            );
        }
    }

    /** @param array<string, bool|int|string> $report */
    private function syncPromos(array &$report): void
    {
        foreach (PublicContentDefinition::promos() as $definition) {
            $this->syncRecord(
                table: 'promo_carousels',
                definition: $definition,
                legacyColumn: 'title',
                legacyValue: $definition['title'],
                insert: [
                    'title' => $definition['title'],
                    'fallback_asset_path' => $definition['fallback_asset_path'],
                    'is_active' => $definition['is_active'],
                    'sort_order' => $definition['sort_order'],
                ],
                fallbackFields: ['fallback_asset_path'],
                reportPrefix: 'promos',
                report: $report,
            );
        }
    }

    /** @param array<string, bool|int|string> $report */
    private function syncSponsors(array &$report): void
    {
        foreach (PublicContentDefinition::sponsors() as $definition) {
            $this->syncRecord(
                table: 'sponsor_logos',
                definition: $definition,
                legacyColumn: 'name',
                legacyValue: $definition['name'],
                insert: [
                    'name' => $definition['name'],
                    'fallback_asset_path' => $definition['fallback_asset_path'],
                    'is_active' => $definition['is_active'],
                    'sort_order' => $definition['sort_order'],
                ],
                fallbackFields: ['fallback_asset_path'],
                reportPrefix: 'sponsors',
                report: $report,
            );
        }
    }

    /** @param array<string, bool|int|string> $report */
    private function syncReels(array &$report): void
    {
        foreach (PublicContentDefinition::reels() as $definition) {
            $legacyId = $this->legacyReelId($definition);
            $this->syncRecord(
                table: 'reels',
                definition: $definition,
                legacyColumn: 'id',
                legacyValue: $legacyId ?? 0,
                insert: [
                    'title' => $definition['title'],
                    'fallback_thumbnail_path' => $definition['fallback_thumbnail_path'],
                    'fallback_video_path' => $definition['fallback_video_path'],
                    'is_active' => $definition['is_active'],
                ],
                fallbackFields: ['fallback_thumbnail_path', 'fallback_video_path'],
                reportPrefix: 'reels',
                report: $report,
            );
        }
    }

    /** @param array<string, bool|int|string> $report */
    private function syncInfoBanners(array &$report): void
    {
        foreach (PublicContentDefinition::infoBanners() as $definition) {
            $this->syncRecord(
                table: 'info_banners',
                definition: $definition,
                legacyColumn: 'message',
                legacyValue: $definition['message'],
                insert: [
                    'message' => $definition['message'],
                    'is_active' => $definition['is_active'],
                    'sort_order' => $definition['sort_order'],
                ],
                fallbackFields: [],
                reportPrefix: 'info_banners',
                report: $report,
            );
        }
    }

    /** @param array<string, bool|int|string> $report */
    private function syncTestimonials(array &$report): void
    {
        foreach (PublicContentDefinition::testimonials() as $definition) {
            $this->syncRecord(
                table: 'testimonials',
                definition: $definition,
                legacyColumn: 'author_name',
                legacyValue: $definition['author_name'],
                insert: [
                    'author_name' => $definition['author_name'],
                    'author_role' => $definition['author_role'],
                    'quote' => $definition['quote'],
                    'fallback_image_path' => $definition['fallback_image_path'],
                    'fallback_logo_path' => $definition['fallback_logo_path'],
                    'is_active' => $definition['is_active'],
                    'sort_order' => $definition['sort_order'],
                ],
                fallbackFields: ['fallback_image_path', 'fallback_logo_path'],
                reportPrefix: 'testimonials',
                report: $report,
            );
        }
    }

    /**
     * @param  array<string, mixed>  $definition
     * @param  array<string, mixed>  $insert
     * @param  array<int, string>  $fallbackFields
     * @param  array<string, bool|int|string>  $report
     */
    private function syncRecord(
        string $table,
        array $definition,
        string $legacyColumn,
        mixed $legacyValue,
        array $insert,
        array $fallbackFields,
        string $reportPrefix,
        array &$report,
    ): void {
        $now = now();
        $existing = DB::table($table)
            ->where('bootstrap_key', $definition['key'])
            ->first();

        if ($existing) {
            $repairs = $this->missingFallbacks($existing, $definition, $fallbackFields);

            if ($repairs !== []) {
                DB::table($table)->where('id', $existing->id)->update([
                    ...$repairs,
                    'updated_at' => $now,
                ]);
                $report["{$reportPrefix}_fallbacks_repaired"]++;
            }

            $report["{$reportPrefix}_preserved"]++;

            return;
        }

        $legacy = $legacyValue
            ? DB::table($table)
                ->whereNull('bootstrap_key')
                ->where($legacyColumn, $legacyValue)
                ->orderBy('id')
                ->first()
            : null;

        if ($legacy) {
            DB::table($table)->where('id', $legacy->id)->update([
                'bootstrap_key' => $definition['key'],
                ...$this->missingFallbacks($legacy, $definition, $fallbackFields),
                'updated_at' => $now,
            ]);
            $report["{$reportPrefix}_adopted"]++;

            return;
        }

        DB::table($table)->insert([
            'bootstrap_key' => $definition['key'],
            ...$insert,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $report["{$reportPrefix}_created"]++;
    }

    /** @param array<string, mixed> $definition */
    private function legacyReelId(array $definition): ?int
    {
        $fileName = basename($definition['fallback_video_path']);
        $mediaModel = 'App\\Models\\Reel';
        $mediaMatch = DB::table('media')
            ->where('model_type', $mediaModel)
            ->where('collection_name', 'video')
            ->where('file_name', $fileName)
            ->orderBy('model_id')
            ->value('model_id');

        if ($mediaMatch && DB::table('reels')->where('id', $mediaMatch)->whereNull('bootstrap_key')->exists()) {
            return (int) $mediaMatch;
        }

        $fallback = DB::table('reels')
            ->whereNull('bootstrap_key')
            ->where('title', $definition['title'])
            ->orderBy('id')
            ->value('id');

        return $fallback ? (int) $fallback : null;
    }

    /**
     * @param  array<string, mixed>  $definition
     * @param  array<int, string>  $fields
     * @return array<string, mixed>
     */
    private function missingFallbacks(object $record, array $definition, array $fields): array
    {
        $repairs = [];

        foreach ($fields as $field) {
            $expected = $definition[$field] ?? null;

            if ($expected === null || (is_string($expected) && trim($expected) === '')) {
                continue;
            }

            $current = $record->{$field} ?? null;
            if ($current === null || (is_string($current) && trim($current) === '')) {
                $repairs[$field] = $expected;
            }
        }

        return $repairs;
    }

    /** @return array<string, mixed> */
    private function decodeState(mixed $value): array
    {
        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        try {
            $decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return [];
        }

        return is_array($decoded) ? $decoded : [];
    }

    private function assertSchemaIsReady(): void
    {
        $requiredColumns = [
            'news_categories' => ['id', 'name', 'slug'],
            'news' => ['id', 'bootstrap_key', 'fallback_image_path', 'slug', 'author_id'],
            'promo_carousels' => ['id', 'bootstrap_key', 'fallback_asset_path'],
            'sponsor_logos' => ['id', 'bootstrap_key', 'fallback_asset_path'],
            'reels' => ['id', 'bootstrap_key', 'fallback_thumbnail_path', 'fallback_video_path'],
            'info_banners' => ['id', 'bootstrap_key'],
            'testimonials' => ['id', 'bootstrap_key', 'fallback_image_path', 'fallback_logo_path'],
            'media' => ['model_type', 'model_id', 'collection_name', 'file_name'],
            'system_settings' => ['key', 'value'],
        ];

        foreach ($requiredColumns as $table => $columns) {
            if (! Schema::hasTable($table)) {
                throw new RuntimeException("Public content cannot be synchronized before table [{$table}] is migrated.");
            }

            foreach ($columns as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    throw new RuntimeException("Public content requires migrated column [{$table}.{$column}].");
                }
            }
        }
    }

    private function assertTrackedAssetsExist(): void
    {
        foreach (PublicContentDefinition::assetPaths() as $path) {
            if (! is_file(public_path(ltrim($path, '/')))) {
                throw new RuntimeException(
                    "Tracked public content asset [{$path}] is missing; deployment was stopped before data changed.",
                );
            }
        }
    }

    /** @return array<string, bool|int|string> */
    private function emptyReport(string $checksum, bool $dryRun): array
    {
        $report = [
            'version' => PublicContentDefinition::VERSION,
            'checksum' => $checksum,
            'dry_run' => $dryRun,
            'already_current' => false,
            'news_categories_created' => 0,
            'news_categories_preserved' => 0,
            'news_using_system_byline' => 0,
        ];

        foreach (['news', 'promos', 'sponsors', 'reels', 'info_banners', 'testimonials'] as $prefix) {
            $report["{$prefix}_created"] = 0;
            $report["{$prefix}_adopted"] = 0;
            $report["{$prefix}_preserved"] = 0;
            $report["{$prefix}_fallbacks_repaired"] = 0;
        }

        return $report;
    }
}
