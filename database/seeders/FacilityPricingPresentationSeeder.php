<?php

namespace Database\Seeders;

use App\Models\Facility;
use Illuminate\Database\Seeder;

class FacilityPricingPresentationSeeder extends Seeder
{
    private const VERSION = 1;

    public function run(): void
    {
        Facility::query()
            ->with('category:id,name,slug')
            ->orderBy('id')
            ->each(function (Facility $facility): void {
                $metadata = is_array($facility->display_metadata)
                    ? $facility->display_metadata
                    : [];

                if (($metadata['pricingPresentationSeedVersion'] ?? null) === self::VERSION) {
                    return;
                }

                $category = mb_strtolower((string) $facility->category?->name);
                $venueType = mb_strtolower((string) $facility->venue_type);
                $classCode = mb_strtolower((string) $facility->class_code);
                $isClass = str_contains($category, 'kelas')
                    || str_contains($category, 'kebugaran')
                    || str_contains($category, 'fitness');
                $isOutdoor = str_contains($venueType, 'luar')
                    || str_contains($venueType, 'outdoor')
                    || str_contains($classCode, 'terbuka');

                if ($isClass) {
                    $metadata['pricingPresentation'] = array_replace(
                        $this->emptyPresentation(),
                        is_array($metadata['pricingPresentation'] ?? null)
                            ? $metadata['pricingPresentation']
                            : [],
                        [
                            'classRates' => [
                                [
                                    'level' => 'Beginner',
                                    'wargaPrice' => '25K',
                                    'umumPrice' => '23K',
                                ],
                                [
                                    'level' => 'Intermediate',
                                    'wargaPrice' => '',
                                    'umumPrice' => '35K',
                                ],
                            ],
                            'classRentals' => [
                                [
                                    'label' => 'Sewa Ruang Yoga',
                                    'value' => 'Warga UB 100K · Umum 150K',
                                ],
                                [
                                    'label' => 'Sewa Event Ruang',
                                    'value' => '1650K / Hari · Matras Kami Fasilitasi',
                                ],
                            ],
                        ],
                    );
                } elseif ($isOutdoor) {
                    $rates = $this->outdoorRates($facility->name);
                    if ($rates === []) {
                        return;
                    }

                    $metadata['pricingPresentation'] = array_replace(
                        $this->emptyPresentation(),
                        is_array($metadata['pricingPresentation'] ?? null)
                            ? $metadata['pricingPresentation']
                            : [],
                        ['outdoorRates' => $rates],
                    );
                } elseif ($facility->category?->slug === 'lapangan-arena') {
                    $metadata['pricingPresentation'] = array_replace(
                        $this->emptyPresentation(),
                        is_array($metadata['pricingPresentation'] ?? null)
                            ? $metadata['pricingPresentation']
                            : [],
                        [
                            'indoorPeriods' => [
                                [
                                    'label' => 'Pagi / 06.00–12.00',
                                    'wargaPrice' => '95K / Jam',
                                    'umumPrice' => '105K / Jam',
                                ],
                                [
                                    'label' => 'Malam / 16.00–22.00',
                                    'wargaPrice' => '105K / Jam',
                                    'umumPrice' => '115K / Jam',
                                ],
                                [
                                    'label' => 'Sabtu–Minggu Malam / 18.00–22.00',
                                    'wargaPrice' => '50K / Jam',
                                    'umumPrice' => '65K / Jam',
                                ],
                            ],
                        ],
                    );

                    if (empty($metadata['additionalDetails'])) {
                        $metadata['additionalDetails'] = [
                            ['key' => 'Sewa Event', 'value' => '8500K / Hari'],
                            ['key' => 'Sewa Raket', 'value' => '10K / Max. 2 Jam'],
                            ['key' => 'Sewa Event Non Sport', 'value' => '25000K / Hari'],
                        ];
                    }
                } else {
                    return;
                }

                $metadata['pricingPresentationSeedVersion'] = self::VERSION;
                $facility->update(['display_metadata' => $metadata]);
            });
    }

    /**
     * @return array{
     *     indoorPeriods: array<int, mixed>,
     *     classRates: array<int, mixed>,
     *     classRentals: array<int, mixed>,
     *     outdoorRates: array<int, mixed>
     * }
     */
    private function emptyPresentation(): array
    {
        return [
            'indoorPeriods' => [],
            'classRates' => [],
            'classRentals' => [],
            'outdoorRates' => [],
        ];
    }

    /**
     * @return array<int, array{label: string, value: string}>
     */
    private function outdoorRates(string $facilityName): array
    {
        return match ($facilityName) {
            'Lapangan Sepak Bola' => [
                ['label' => 'Harga Sewa', 'value' => '1750K / 2 Jam'],
                ['label' => 'Extension', 'value' => '875K / Jam'],
            ],
            'Lapangan Basket' => [
                ['label' => 'Harga Sewa', 'value' => '1200K / 2 Jam'],
                ['label' => 'Extension', 'value' => '600K / Jam'],
            ],
            'Lapangan Volly' => [
                ['label' => 'Harga Sewa', 'value' => '1000K / 2 Jam'],
                ['label' => 'Extension', 'value' => '500K / Jam'],
            ],
            'Lapangan Futsal Dieng' => [
                ['label' => 'Harga Sewa', 'value' => '1500K / 2 Jam'],
                ['label' => 'Extension', 'value' => '750K / Jam'],
            ],
            default => [],
        };
    }
}
