<?php

namespace Tests\Feature;

use App\Services\ReferenceData\PricingCatalogSynchronizer;
use App\Support\ReferenceData\PricingCatalogDefinition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PricingReferenceDataSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_provisions_the_complete_pricing_catalog_without_database_seeders(): void
    {
        $report = app(PricingCatalogSynchronizer::class)->sync();

        $this->assertFalse($report['already_current']);
        $this->assertSame(2, $report['categories_created']);
        $this->assertSame(15, $report['facilities_created']);
        $this->assertSame(18, $report['facility_prices_created']);
        $this->assertSame(4, $report['membership_plans_created']);
        $this->assertDatabaseCount('facility_categories', 2);
        $this->assertDatabaseCount('facilities', 15);
        $this->assertDatabaseCount('facility_prices', 18);
        $this->assertDatabaseCount('membership_plans', 4);

        $tennis = DB::table('facilities')->where('slug', 'lapangan-tenis')->first();
        $football = DB::table('facilities')->where('slug', 'lapangan-sepak-bola')->first();

        $this->assertNotNull($tennis);
        $this->assertNotNull($football);
        $this->assertSame(
            '/assets/images/fasilitas-tenis-ub-sport-center.avif',
            data_get(json_decode($tennis->display_metadata, true), 'public_image_path'),
        );
        $this->assertSame(
            '95K / Jam',
            data_get(
                json_decode($tennis->display_metadata, true),
                'pricingPresentation.indoorPeriods.0.wargaPrice',
            ),
        );
        $this->assertSame(
            '1750K / 2 Jam',
            data_get(
                json_decode($football->display_metadata, true),
                'pricingPresentation.outdoorRates.0.value',
            ),
        );
        $this->assertDatabaseHas('membership_plans', [
            'bootstrap_key' => 'ubsc-membership-favorit-v1',
            'card_image_url' => '/assets/images/poster-gym-konten-program-ub-sport-center.avif',
            'is_primary' => true,
        ]);
    }

    public function test_it_is_idempotent_and_preserves_administrator_pricing_and_content(): void
    {
        $synchronizer = app(PricingCatalogSynchronizer::class);
        $synchronizer->sync();

        $tennis = DB::table('facilities')->where('slug', 'lapangan-tenis')->firstOrFail();
        $metadata = json_decode($tennis->display_metadata, true);
        $metadata['pricingPresentation']['indoorPeriods'][0]['wargaPrice'] = 'Admin 99K / Jam';

        DB::table('facilities')->where('id', $tennis->id)->update([
            'name' => 'Lapangan Tenis Pilihan Admin',
            'display_metadata' => json_encode($metadata),
        ]);
        DB::table('facility_prices')
            ->where('facility_id', $tennis->id)
            ->where('user_category', 'warga_ub')
            ->update(['price' => 99000]);
        DB::table('membership_plans')
            ->where('bootstrap_key', 'ubsc-membership-favorit-v1')
            ->update([
                'name' => 'Paket Pilihan Admin',
                'card_image_url' => 'https://cdn.example.test/admin-membership.webp',
            ]);

        $second = $synchronizer->sync();
        $repair = $synchronizer->sync(repair: true);

        $this->assertTrue($second['already_current']);
        $this->assertFalse($repair['already_current']);
        $this->assertDatabaseCount('facility_categories', 2);
        $this->assertDatabaseCount('facilities', 15);
        $this->assertDatabaseCount('facility_prices', 18);
        $this->assertDatabaseCount('membership_plans', 4);
        $this->assertDatabaseHas('facilities', [
            'id' => $tennis->id,
            'name' => 'Lapangan Tenis Pilihan Admin',
        ]);
        $this->assertDatabaseHas('facility_prices', [
            'facility_id' => $tennis->id,
            'user_category' => 'warga_ub',
            'price' => 99000,
        ]);
        $this->assertDatabaseHas('membership_plans', [
            'bootstrap_key' => 'ubsc-membership-favorit-v1',
            'name' => 'Paket Pilihan Admin',
            'card_image_url' => 'https://cdn.example.test/admin-membership.webp',
        ]);

        $refreshedMetadata = json_decode(
            DB::table('facilities')->where('id', $tennis->id)->value('display_metadata'),
            true,
        );
        $this->assertSame(
            'Admin 99K / Jam',
            data_get($refreshedMetadata, 'pricingPresentation.indoorPeriods.0.wargaPrice'),
        );
    }

    public function test_dry_run_validates_the_catalog_and_rolls_every_change_back(): void
    {
        $exitCode = Artisan::call('reference-data:sync', [
            '--dry-run' => true,
            '--json' => true,
        ]);

        $this->assertSame(0, $exitCode, Artisan::output());
        $this->assertDatabaseCount('facility_categories', 0);
        $this->assertDatabaseCount('facilities', 0);
        $this->assertDatabaseCount('facility_prices', 0);
        $this->assertDatabaseCount('membership_plans', 0);
        $this->assertDatabaseMissing('system_settings', [
            'key' => PricingCatalogDefinition::SETTING_KEY,
        ]);
    }

    public function test_repair_mode_recovers_missing_baseline_rows_after_the_version_is_current(): void
    {
        $synchronizer = app(PricingCatalogSynchronizer::class);
        $synchronizer->sync();

        $facility = DB::table('facilities')
            ->where('slug', 'lapangan-sepak-bola')
            ->firstOrFail();

        DB::table('facilities')->where('id', $facility->id)->delete();
        DB::table('membership_plans')
            ->where('bootstrap_key', 'ubsc-membership-eksklusif-v1')
            ->delete();

        $withoutRepair = $synchronizer->sync();

        $this->assertTrue($withoutRepair['already_current']);
        $this->assertDatabaseMissing('facilities', ['slug' => 'lapangan-sepak-bola']);
        $this->assertDatabaseMissing('membership_plans', [
            'bootstrap_key' => 'ubsc-membership-eksklusif-v1',
        ]);

        $repair = $synchronizer->sync(repair: true);

        $this->assertSame(1, $repair['facilities_created']);
        $this->assertSame(1, $repair['membership_plans_created']);
        $this->assertDatabaseCount('facilities', 15);
        $this->assertDatabaseCount('membership_plans', 4);
        $this->assertDatabaseHas('facilities', ['slug' => 'lapangan-sepak-bola']);
        $this->assertDatabaseHas('membership_plans', [
            'bootstrap_key' => 'ubsc-membership-eksklusif-v1',
        ]);
    }

    public function test_every_catalog_image_is_a_version_controlled_public_asset(): void
    {
        $paths = collect(PricingCatalogDefinition::facilities())
            ->pluck('image')
            ->merge(
                collect(PricingCatalogDefinition::membershipPlans())
                    ->pluck('card_image_url'),
            )
            ->unique();

        foreach ($paths as $path) {
            $absolutePath = public_path(ltrim((string) $path, '/'));

            $this->assertFileExists($absolutePath);
            $this->assertNotSame('', trim((string) shell_exec(
                'git ls-files --error-unmatch '.escapeshellarg(
                    str_replace('\\', '/', str($absolutePath)->after(base_path().DIRECTORY_SEPARATOR)->toString()),
                ).' 2>'.(PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null'),
            )), "Catalog asset is not tracked by Git: {$path}");
        }
    }
}
