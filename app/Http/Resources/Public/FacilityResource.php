<?php

namespace App\Http\Resources\Public;

use App\Support\FacilityReservationLink;
use App\Support\NewsContentSanitizer;
use App\Support\SafePublicUrl;
use App\Services\BookingInventoryService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class FacilityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $includesBookingGallery = $this->relationLoaded('media');
        $inventoryService = app(BookingInventoryService::class);
        $bookingCapacity = $inventoryService
            ->capacityFor($this->resource, null);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => NewsContentSanitizer::clean($this->description),
            'slug' => $this->slug,
            'image' => $this->publicImagePath() ?: $this->getFirstMediaUrl('hero'),
            'booking_gallery' => $this->when(
                $includesBookingGallery,
                fn () => $this->bookingGallery(),
            ),
            'category' => $this->whenLoaded('category', fn () => $this->category->name, ''),
            'location' => $this->location,
            'venue_type' => $this->venue_type,
            'booking_capacity' => $bookingCapacity,
            'has_shared_booking_capacity' => $bookingCapacity > 1,
            'active_slots' => $this->active_slots,
            'class_code' => $this->class_code,
            'rating' => $this->rating,
            'display_metadata' => $this->publicDisplayMetadata(),
            'reservation' => FacilityReservationLink::resolve($this->resource),
            'prices' => FacilityPriceResource::collection($this->whenLoaded('prices'))->resolve(),
            'units' => $this->whenLoaded('units', fn () => $this->units
                ->where('is_active', true)
                ->sortBy('id')
                ->map(function ($unit) use ($inventoryService): array {
                    $unitCapacity = $inventoryService->capacityFor($this->resource, $unit);

                    return [
                        'id' => $unit->id,
                        'name' => $unit->name,
                        'image' => $unit->getFirstMediaUrl('unit_image') ?: $this->getFirstMediaUrl('hero'),
                        'capacity_override' => $unit->capacity,
                        'booking_capacity' => $unitCapacity,
                        'has_shared_booking_capacity' => $unitCapacity > 1,
                        'use_custom_schedule' => $unit->use_custom_schedule,
                        'active_slots' => $unit->active_slots,
                        'use_custom_pricing' => $unit->use_custom_pricing,
                        'prices' => $unit->relationLoaded('prices')
                            ? FacilityPriceResource::collection(
                                $unit->prices->sortBy('sort_order')->values()
                            )->resolve()
                            : [],
                    ];
                })
                ->values()
                ->all()),
            'price_range' => $this->computePriceRange(),
        ];
    }

    /**
     * Build the single public gallery used by the booking experience.
     *
     * The facility hero leads, followed by the ordered facility gallery and
     * then each real image owned by an active unit. Unit fallbacks are
     * intentionally excluded so the facility hero is never duplicated.
     *
     * @return array<int, array{
     *     id: string,
     *     src: string,
     *     alt: string,
     *     source: string,
     *     unit_id: int|null,
     *     unit_name: string|null
     * }>
     */
    private function bookingGallery(): array
    {
        $gallery = collect();
        $hero = $this->getFirstMedia('hero');

        if ($hero) {
            $gallery->push($this->bookingGalleryItem(
                $hero,
                'hero',
                "{$this->name} - gambar utama",
            ));
        }

        $this->getMedia('gallery')
            ->sortBy([
                ['order_column', 'asc'],
                ['id', 'asc'],
            ])
            ->each(fn (Media $media) => $gallery->push(
                $this->bookingGalleryItem(
                    $media,
                    'facility-gallery',
                    "{$this->name} - galeri fasilitas",
                ),
            ));

        if ($this->relationLoaded('units')) {
            $this->units
                ->where('is_active', true)
                ->sortBy('id')
                ->each(function ($unit) use ($gallery): void {
                    if (! $unit->relationLoaded('media')) {
                        return;
                    }

                    $media = $unit->getFirstMedia('unit_image');

                    if (! $media) {
                        return;
                    }

                    $gallery->push($this->bookingGalleryItem(
                        $media,
                        'unit',
                        "{$this->name} - {$unit->name}",
                        $unit->id,
                        $unit->name,
                    ));
                });
        }

        return $gallery
            ->filter(fn (array $item) => filled($item['src']))
            ->unique('id')
            ->values()
            ->all();
    }

    /**
     * @return array{
     *     id: string,
     *     src: string,
     *     alt: string,
     *     source: string,
     *     unit_id: int|null,
     *     unit_name: string|null
     * }
     */
    private function bookingGalleryItem(
        Media $media,
        string $source,
        string $alt,
        ?int $unitId = null,
        ?string $unitName = null,
    ): array {
        return [
            'id' => 'media:'.($media->uuid ?: $media->id),
            'src' => $media->getUrl(),
            'alt' => $alt,
            'source' => $source,
            'unit_id' => $unitId,
            'unit_name' => $unitName,
        ];
    }

    private function computePriceRange(): string
    {
        $prices = $this->whenLoaded('prices');
        if (! $prices || $prices->isEmpty()) {
            return 'Harga belum tersedia';
        }
        $amounts = $prices->pluck('price');
        $min = $amounts->min();
        $max = $amounts->max();
        $fmt = fn ($n) => 'Rp'.number_format($n, 0, ',', '.');

        return $min === $max
            ? $fmt($min).' / Jam'
            : $fmt($min).' - '.$fmt($max).' / Jam';
    }

    private function publicImagePath(): ?string
    {
        $source = data_get($this->display_metadata, 'public_image_path');

        if (! is_string($source) || ! str_starts_with($source, '/')) {
            return null;
        }

        $path = public_path(ltrim($source, '/'));

        if (! is_file($path)) {
            return null;
        }

        $fingerprint = sha1_file($path) ?: (string) filemtime($path);

        return $source.'?v='.rawurlencode($fingerprint);
    }

    private function publicDisplayMetadata(): ?array
    {
        if (! is_array($this->display_metadata)) {
            return null;
        }

        $metadata = $this->display_metadata;

        foreach (['map_url', 'mapLink', 'map_embed_url', 'mapEmbedUrl'] as $key) {
            if (! array_key_exists($key, $metadata)) {
                continue;
            }

            $safeUrl = SafePublicUrl::googleMaps($metadata[$key]);

            if ($safeUrl === null) {
                unset($metadata[$key]);
            } else {
                $metadata[$key] = $safeUrl;
            }
        }

        return $metadata;
    }
}
