<?php

namespace Tests\Feature;

use App\Http\Resources\Public\FacilityResource;
use App\Models\Facility;
use App\Models\FacilityCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BookingFacilityGalleryTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_gallery_combines_facility_and_active_unit_media_once_in_a_stable_order(): void
    {
        Storage::fake('public');

        $category = FacilityCategory::create([
            'name' => 'Lapangan',
            'slug' => 'lapangan-gallery-test',
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Tenis',
            'slug' => 'lapangan-tenis-gallery-test',
            'capacity' => 4,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $facility->addMedia(UploadedFile::fake()->image('hero.jpg', 1600, 1200))
            ->toMediaCollection('hero');
        $facility->addMedia(UploadedFile::fake()->image('gallery-a.jpg', 1600, 1200))
            ->toMediaCollection('gallery');
        $facility->addMedia(UploadedFile::fake()->image('gallery-b.jpg', 1600, 1200))
            ->toMediaCollection('gallery');

        $activeUnit = $facility->units()->create([
            'name' => 'Lapangan Tenis 1',
            'is_active' => true,
        ]);
        $activeUnit->addMedia(UploadedFile::fake()->image('unit-active.jpg', 1200, 1200))
            ->toMediaCollection('unit_image');
        $facility->units()->create([
            'name' => 'Lapangan Tenis Tanpa Foto',
            'is_active' => true,
        ]);

        $inactiveUnit = $facility->units()->create([
            'name' => 'Lapangan Tenis Lama',
            'is_active' => false,
        ]);
        $inactiveUnit->addMedia(UploadedFile::fake()->image('unit-inactive.jpg', 1200, 1200))
            ->toMediaCollection('unit_image');

        $payload = (new FacilityResource(
            $facility->fresh()->load([
                'category',
                'prices',
                'media',
                'units.media',
            ]),
        ))->resolve(Request::create('/booking'));
        $gallery = $payload['booking_gallery'];

        $this->assertCount(4, $gallery);
        $this->assertSame(
            ['hero', 'facility-gallery', 'facility-gallery', 'unit'],
            array_column($gallery, 'source'),
        );
        $this->assertSame(
            ['hero', 'gallery-a', 'gallery-b', 'unit-active'],
            array_map(
                fn (array $item) => pathinfo(parse_url($item['src'], PHP_URL_PATH), PATHINFO_FILENAME),
                $gallery,
            ),
        );
        $this->assertSame($activeUnit->id, $gallery[3]['unit_id']);
        $this->assertSame($activeUnit->name, $gallery[3]['unit_name']);
        $this->assertCount(
            count($gallery),
            array_unique(array_column($gallery, 'id')),
        );
        $this->assertStringNotContainsString(
            'unit-inactive',
            implode('|', array_column($gallery, 'src')),
        );
    }

    public function test_booking_gallery_is_omitted_when_parent_media_was_not_eager_loaded(): void
    {
        $category = FacilityCategory::create([
            'name' => 'Kelas',
            'slug' => 'kelas-gallery-test',
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Yoga',
            'slug' => 'yoga-gallery-test',
            'capacity' => 10,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $payload = (new FacilityResource(
            $facility->fresh()->load(['category', 'prices', 'units']),
        ))->resolve(Request::create('/pricing'));

        $this->assertArrayNotHasKey('booking_gallery', $payload);
    }
}
