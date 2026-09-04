<?php

namespace Database\Seeders;

use App\Models\Facility;
use App\Support\ReferenceData\PricingCatalogDefinition;
use Illuminate\Database\Seeder;

class FacilityPricingPresentationSeeder extends Seeder
{
    public function run(): void
    {
        $checksum = PricingCatalogDefinition::checksum();

        foreach (PricingCatalogDefinition::facilities() as $definition) {
            $facility = Facility::query()
                ->where('slug', $definition['slug'])
                ->first();

            if (! $facility) {
                continue;
            }

            $metadata = is_array($facility->display_metadata)
                ? $facility->display_metadata
                : [];

            if (($metadata['pricingPresentationSeedVersion'] ?? null) === 1) {
                continue;
            }

            if (! is_string($metadata['public_image_path'] ?? null)
                || trim((string) $metadata['public_image_path']) === '') {
                $metadata['public_image_path'] = $definition['image'];
            }

            $presentation = is_array($metadata['pricingPresentation'] ?? null)
                ? $metadata['pricingPresentation']
                : [];

            foreach (PricingCatalogDefinition::presentation($definition['presentation']) as $key => $value) {
                if (! isset($presentation[$key])
                    || ! is_array($presentation[$key])
                    || $presentation[$key] === []) {
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

            $metadata['pricingPresentationSeedVersion'] = 1;
            $referenceData = is_array($metadata['referenceData'] ?? null)
                ? $metadata['referenceData']
                : [];
            $referenceData['pricingCatalog'] = [
                'version' => PricingCatalogDefinition::VERSION,
                'checksum' => $checksum,
            ];
            $metadata['referenceData'] = $referenceData;

            $facility->update(['display_metadata' => $metadata]);
        }
    }
}
