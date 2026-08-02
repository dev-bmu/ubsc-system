<?php

namespace Tests\Feature;

use App\Models\Facility;
use Database\Seeders\FacilityCategorySeeder;
use Database\Seeders\FacilityPricingPresentationSeeder;
use Database\Seeders\FacilitySeeder;
use Database\Seeders\OutdoorFacilitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FacilityPricingPresentationSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_records_the_original_public_pricing_content_for_all_facilities(): void
    {
        $this->seedFacilities();

        $this->assertSame(
            15,
            Facility::query()
                ->where('display_metadata->pricingPresentationSeedVersion', 1)
                ->count(),
        );

        $tennis = Facility::where('name', 'Lapangan Tenis')->firstOrFail();
        $football = Facility::where('name', 'Lapangan Sepak Bola')->firstOrFail();
        $yoga = Facility::where('name', 'Yoga')->firstOrFail();

        $this->assertSame([
            'label' => 'Pagi / 06.00–12.00',
            'wargaPrice' => '95K / Jam',
            'umumPrice' => '105K / Jam',
        ], data_get($tennis->display_metadata, 'pricingPresentation.indoorPeriods.0'));
        $this->assertSame(
            ['key' => 'Sewa Raket', 'value' => '10K / Max. 2 Jam'],
            data_get($tennis->display_metadata, 'additionalDetails.1'),
        );
        $this->assertSame([
            ['label' => 'Harga Sewa', 'value' => '1750K / 2 Jam'],
            ['label' => 'Extension', 'value' => '875K / Jam'],
        ], data_get($football->display_metadata, 'pricingPresentation.outdoorRates'));
        $this->assertSame(
            '/assets/images/fasilitas-sepak-bola-ub-sport-center.avif',
            data_get($football->display_metadata, 'public_image_path'),
        );
        $this->assertSame([
            'level' => 'Beginner',
            'wargaPrice' => '25K',
            'umumPrice' => '23K',
        ], data_get($yoga->display_metadata, 'pricingPresentation.classRates.0'));
    }

    public function test_rerunning_the_bootstrap_does_not_overwrite_admin_edits(): void
    {
        $this->seedFacilities();

        $tennis = Facility::where('name', 'Lapangan Tenis')->firstOrFail();
        $metadata = $tennis->display_metadata;
        $metadata['pricingPresentation']['indoorPeriods'][0]['wargaPrice'] = '99K / Jam';
        $tennis->update(['display_metadata' => $metadata]);

        $this->seed(FacilityPricingPresentationSeeder::class);

        $this->assertSame(
            '99K / Jam',
            data_get($tennis->fresh()->display_metadata, 'pricingPresentation.indoorPeriods.0.wargaPrice'),
        );
    }

    private function seedFacilities(): void
    {
        $this->seed([
            FacilityCategorySeeder::class,
            FacilitySeeder::class,
            OutdoorFacilitySeeder::class,
            FacilityPricingPresentationSeeder::class,
        ]);
    }
}
