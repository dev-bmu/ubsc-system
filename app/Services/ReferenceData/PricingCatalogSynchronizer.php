<?php

namespace App\Services\ReferenceData;

use App\Support\ReferenceData\PricingCatalogDefinition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use JsonException;
use RuntimeException;
use Throwable;

final class PricingCatalogSynchronizer
{
    /**
     * Synchronize immutable product defaults without replacing administrator data.
     *
     * @return array<string, bool|int|string>
     *
     * @throws Throwable
     */
    public function sync(bool $dryRun = false, bool $repair = false): array
    {
        $this->assertSchemaIsReady();
        $this->assertTrackedAssetsExist();

        $checksum = PricingCatalogDefinition::checksum();
        $report = $this->emptyReport($checksum, $dryRun);

        DB::beginTransaction();

        try {
            $now = now();

            DB::table('system_settings')->insertOrIgnore([
                'key' => PricingCatalogDefinition::SETTING_KEY,
                'value' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $setting = DB::table('system_settings')
                ->where('key', PricingCatalogDefinition::SETTING_KEY)
                ->lockForUpdate()
                ->first();
            $state = $this->decodeState($setting?->value);
            $sameVersion = ($state['version'] ?? null) === PricingCatalogDefinition::VERSION;
            $sameChecksum = ($state['checksum'] ?? null) === $checksum;

            if ($sameVersion && ! $sameChecksum) {
                throw new RuntimeException(
                    'The pricing catalog definition changed without a version bump. '.
                    'Create a new immutable catalog version before deployment.',
                );
            }

            if ($sameVersion && $sameChecksum && ! $repair) {
                $report['already_current'] = true;

                $dryRun ? DB::rollBack() : DB::commit();

                return $report;
            }

            $categoryIds = $this->syncCategories($report);
            $facilityIds = $this->syncFacilities($categoryIds, $checksum, $report);
            $this->syncFacilityPrices($facilityIds, $report);
            $this->syncMembershipPlans($report);

            if ($dryRun) {
                DB::rollBack();

                return $report;
            }

            DB::table('system_settings')
                ->where('key', PricingCatalogDefinition::SETTING_KEY)
                ->update([
                    'value' => json_encode([
                        'version' => PricingCatalogDefinition::VERSION,
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

    /**
     * @param  array<string, bool|int|string>  $report
     * @return array<string, int>
     */
    private function syncCategories(array &$report): array
    {
        $ids = [];
        $now = now();

        foreach (PricingCatalogDefinition::categories() as $category) {
            $existing = DB::table('facility_categories')
                ->where('slug', $category['slug'])
                ->first();

            if ($existing) {
                $ids[$category['slug']] = (int) $existing->id;
                $report['categories_preserved']++;

                continue;
            }

            $ids[$category['slug']] = (int) DB::table('facility_categories')->insertGetId([
                ...$category,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $report['categories_created']++;
        }

        return $ids;
    }

    /**
     * @param  array<string, int>  $categoryIds
     * @param  array<string, bool|int|string>  $report
     * @return array<string, int>
     *
     * @throws JsonException
     */
    private function syncFacilities(array $categoryIds, string $checksum, array &$report): array
    {
        $ids = [];
        $now = now();

        foreach (PricingCatalogDefinition::facilities() as $definition) {
            $existing = DB::table('facilities')
                ->where('slug', $definition['slug'])
                ->first();
            $metadata = $this->mergeMetadata(
                $existing?->display_metadata,
                $definition,
                $checksum,
            );
            $encodedMetadata = json_encode(
                $metadata,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            );

            if ($existing) {
                $ids[$definition['slug']] = (int) $existing->id;

                if ($this->canonicalJson($existing->display_metadata) !== $this->canonicalJson($encodedMetadata)) {
                    DB::table('facilities')
                        ->where('id', $existing->id)
                        ->update([
                            'display_metadata' => $encodedMetadata,
                            'updated_at' => $now,
                        ]);
                    $report['facility_metadata_repaired']++;
                } else {
                    $report['facilities_preserved']++;
                }

                continue;
            }

            $categoryId = $categoryIds[$definition['category']] ?? null;

            if (! $categoryId) {
                throw new RuntimeException(
                    "Pricing catalog category [{$definition['category']}] is unavailable.",
                );
            }

            $ids[$definition['slug']] = (int) DB::table('facilities')->insertGetId([
                'facility_category_id' => $categoryId,
                'name' => $definition['name'],
                'slug' => $definition['slug'],
                'description' => $definition['description'],
                'location' => $definition['location'],
                'venue_type' => $definition['venue_type'],
                'capacity' => 1,
                'active_slots' => null,
                'class_code' => $definition['class_code'],
                'rating' => 5.0,
                'display_metadata' => $encodedMetadata,
                'reservation_method' => $definition['reservation_method'],
                'reservation_url' => null,
                'reservation_phone' => null,
                'reservation_message' => null,
                'is_active' => $definition['is_active'],
                'sort_order' => $definition['sort_order'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $report['facilities_created']++;
        }

        return $ids;
    }

    /**
     * @param  array<string, int>  $facilityIds
     * @param  array<string, bool|int|string>  $report
     */
    private function syncFacilityPrices(array $facilityIds, array &$report): void
    {
        $now = now();

        foreach (PricingCatalogDefinition::facilityPrices() as $slug => $prices) {
            $facilityId = $facilityIds[$slug] ?? null;

            if (! $facilityId) {
                continue;
            }

            foreach ($prices as $userCategory => $price) {
                $hasAdministratorPrice = DB::table('facility_prices')
                    ->where('facility_id', $facilityId)
                    ->where('user_category', $userCategory)
                    ->exists();

                if ($hasAdministratorPrice) {
                    $report['facility_prices_preserved']++;

                    continue;
                }

                DB::table('facility_prices')->insert([
                    'facility_id' => $facilityId,
                    'user_category' => $userCategory,
                    'label' => 'Per Jam',
                    'price' => $price,
                    'duration_minutes' => 60,
                    'schedule_type' => 'regular',
                    'applicable_days' => null,
                    'starts_at' => null,
                    'ends_at' => null,
                    'starts_on' => null,
                    'ends_on' => null,
                    'notes' => $userCategory === 'warga_ub' ? 'Harga khusus warga UB' : null,
                    'sort_order' => $userCategory === 'warga_ub' ? 1 : 2,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $report['facility_prices_created']++;
            }
        }
    }

    /**
     * @param  array<string, bool|int|string>  $report
     *
     * @throws JsonException
     */
    private function syncMembershipPlans(array &$report): void
    {
        $hasPrimary = DB::table('membership_plans')
            ->where('is_active', true)
            ->where('is_primary', true)
            ->exists();
        $now = now();

        foreach (PricingCatalogDefinition::membershipPlans() as $definition) {
            $existing = DB::table('membership_plans')
                ->where('bootstrap_key', $definition['key'])
                ->first();

            if ($existing) {
                if (! is_string($existing->card_image_url)
                    || trim($existing->card_image_url) === '') {
                    DB::table('membership_plans')
                        ->where('id', $existing->id)
                        ->update([
                            'card_image_url' => $definition['card_image_url'],
                            'updated_at' => $now,
                        ]);
                    $report['membership_image_fallbacks_repaired']++;
                }

                $report['membership_plans_preserved']++;

                continue;
            }

            $legacyId = $this->matchingLegacyMembershipPlanId($definition);

            if ($legacyId !== null) {
                $legacyImage = DB::table('membership_plans')
                    ->where('id', $legacyId)
                    ->value('card_image_url');
                $updates = [
                    'bootstrap_key' => $definition['key'],
                    'updated_at' => $now,
                ];

                if (! is_string($legacyImage) || trim($legacyImage) === '') {
                    $updates['card_image_url'] = $definition['card_image_url'];
                    $report['membership_image_fallbacks_repaired']++;
                }

                DB::table('membership_plans')
                    ->where('id', $legacyId)
                    ->update($updates);
                $report['membership_plans_adopted']++;

                continue;
            }

            $isPrimary = ! $hasPrimary && $definition['tier'] === 'favorit';

            DB::table('membership_plans')->insert([
                'name' => $definition['name'],
                'description' => $definition['description'],
                'tier' => $definition['tier'],
                'bootstrap_key' => $definition['key'],
                'public_badge' => $definition['label'],
                'savings_label' => $definition['savings_label'],
                'cta_label' => $definition['cta_label'],
                'card_image_url' => $definition['card_image_url'],
                'price' => $definition['price'],
                'compare_at_price' => $definition['compare_at_price'],
                'duration_months' => $definition['duration_months'],
                'features' => json_encode(
                    $definition['features'],
                    JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
                ),
                'is_active' => $definition['is_active'],
                'is_primary' => $isPrimary,
                'sort_order' => $definition['sort_order'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $hasPrimary = $hasPrimary || $isPrimary;
            $report['membership_plans_created']++;
        }

        if (! $hasPrimary) {
            $promoted = DB::table('membership_plans')
                ->where('bootstrap_key', 'ubsc-membership-favorit-v1')
                ->where('is_active', true)
                ->update([
                    'is_primary' => true,
                    'updated_at' => $now,
                ]);
            $report['membership_primary_repaired'] += $promoted;
        }
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private function matchingLegacyMembershipPlanId(array $definition): ?int
    {
        $candidates = DB::table('membership_plans')
            ->whereNull('bootstrap_key')
            ->where('name', $definition['name'])
            ->where('description', $definition['description'])
            ->where('tier', $definition['tier'])
            ->where('public_badge', $definition['label'])
            ->where('savings_label', $definition['savings_label'])
            ->where('cta_label', $definition['cta_label'])
            ->where('price', $definition['price'])
            ->where('compare_at_price', $definition['compare_at_price'])
            ->where('duration_months', $definition['duration_months'])
            ->where('is_active', $definition['is_active'])
            ->where('sort_order', $definition['sort_order'])
            ->orderBy('id')
            ->get(['id', 'features']);

        foreach ($candidates as $candidate) {
            if ($this->decodeJsonArray($candidate->features) === $definition['features']) {
                return (int) $candidate->id;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return array<string, mixed>
     */
    private function mergeMetadata(mixed $rawMetadata, array $definition, string $checksum): array
    {
        $metadata = $this->decodeJsonObject($rawMetadata);

        if (! is_string($metadata['public_image_path'] ?? null)
            || trim((string) $metadata['public_image_path']) === '') {
            $metadata['public_image_path'] = $definition['image'];
        }

        $presentation = is_array($metadata['pricingPresentation'] ?? null)
            ? $metadata['pricingPresentation']
            : [];

        foreach (PricingCatalogDefinition::presentation($definition['presentation']) as $key => $value) {
            if (! isset($presentation[$key]) || ! is_array($presentation[$key]) || $presentation[$key] === []) {
                $presentation[$key] = $value;
            }
        }

        $metadata['pricingPresentation'] = $presentation;

        if ($definition['presentation'] === 'indoor'
            && (! isset($metadata['additionalDetails'])
                || ! is_array($metadata['additionalDetails'])
                || $metadata['additionalDetails'] === [])) {
            $metadata['additionalDetails'] = PricingCatalogDefinition::indoorAdditionalDetails();
        }

        $metadata['pricingPresentationSeedVersion'] ??= 1;
        $referenceData = is_array($metadata['referenceData'] ?? null)
            ? $metadata['referenceData']
            : [];
        $referenceData['pricingCatalog'] = [
            'version' => PricingCatalogDefinition::VERSION,
            'checksum' => $checksum,
        ];
        $metadata['referenceData'] = $referenceData;

        return $metadata;
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeState(mixed $value): array
    {
        return $this->decodeJsonObject($value);
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJsonObject(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

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

    /**
     * @return array<int, mixed>
     */
    private function decodeJsonArray(mixed $value): array
    {
        return array_values($this->decodeJsonObject($value));
    }

    private function canonicalJson(mixed $value): string
    {
        $decoded = $this->decodeJsonObject($value);

        return json_encode(
            $decoded,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        ) ?: '{}';
    }

    private function assertSchemaIsReady(): void
    {
        $requiredColumns = [
            'facility_categories' => ['id', 'name', 'slug', 'description', 'sort_order'],
            'facilities' => [
                'id', 'facility_category_id', 'name', 'slug', 'description',
                'location', 'venue_type', 'capacity', 'active_slots', 'class_code',
                'rating', 'display_metadata', 'reservation_method', 'reservation_url',
                'reservation_phone', 'reservation_message', 'is_active', 'sort_order',
            ],
            'facility_prices' => [
                'facility_id', 'user_category', 'label', 'price', 'duration_minutes',
                'schedule_type', 'applicable_days', 'starts_at', 'ends_at',
                'starts_on', 'ends_on', 'notes', 'sort_order',
            ],
            'membership_plans' => [
                'name', 'description', 'tier', 'bootstrap_key', 'public_badge',
                'savings_label', 'cta_label', 'card_image_url', 'price',
                'compare_at_price', 'duration_months', 'features', 'is_active',
                'is_primary', 'sort_order',
            ],
            'system_settings' => ['key', 'value'],
        ];

        foreach ($requiredColumns as $table => $columns) {
            if (! Schema::hasTable($table)) {
                throw new RuntimeException(
                    "Reference data cannot be synchronized before table [{$table}] is migrated.",
                );
            }

            foreach ($columns as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    throw new RuntimeException(
                        "Reference data requires migrated column [{$table}.{$column}].",
                    );
                }
            }
        }
    }

    private function assertTrackedAssetsExist(): void
    {
        $paths = collect(PricingCatalogDefinition::facilities())
            ->pluck('image')
            ->merge(
                collect(PricingCatalogDefinition::membershipPlans())
                    ->pluck('card_image_url'),
            )
            ->filter()
            ->unique();

        foreach ($paths as $path) {
            $absolutePath = public_path(ltrim((string) $path, '/'));

            if (! is_file($absolutePath)) {
                throw new RuntimeException(
                    "Tracked pricing asset [{$path}] is missing; deployment was stopped before data changed.",
                );
            }
        }
    }

    /**
     * @return array<string, bool|int|string>
     */
    private function emptyReport(string $checksum, bool $dryRun): array
    {
        return [
            'version' => PricingCatalogDefinition::VERSION,
            'checksum' => $checksum,
            'dry_run' => $dryRun,
            'already_current' => false,
            'categories_created' => 0,
            'categories_preserved' => 0,
            'facilities_created' => 0,
            'facilities_preserved' => 0,
            'facility_metadata_repaired' => 0,
            'facility_prices_created' => 0,
            'facility_prices_preserved' => 0,
            'membership_plans_created' => 0,
            'membership_plans_adopted' => 0,
            'membership_plans_preserved' => 0,
            'membership_image_fallbacks_repaired' => 0,
            'membership_primary_repaired' => 0,
        ];
    }
}
