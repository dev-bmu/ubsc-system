<?php

namespace App\Http\Resources\Public;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FacilityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'               => $this->id,
            'name'             => $this->name,
            'slug'             => $this->slug,
            'image'            => $this->getFirstMediaUrl('hero'),
            'category'         => $this->whenLoaded('category', fn () => $this->category->name, ''),
            'location'         => $this->location,
            'venue_type'       => $this->venue_type,
            'class_code'       => $this->class_code,
            'rating'           => $this->rating,
            'display_metadata' => $this->display_metadata,
            'prices'           => FacilityPriceResource::collection($this->whenLoaded('prices'))->resolve(),
            'units'            => $this->whenLoaded('units', fn () => $this->units
                ->where('is_active', true)
                ->sortBy('id')
                ->map(fn ($unit) => [
                    'id' => $unit->id,
                    'name' => $unit->name,
                    'image' => $unit->getFirstMediaUrl('unit_image') ?: $this->getFirstMediaUrl('hero'),
                ])
                ->values()
                ->all()),
            'price_range'      => $this->computePriceRange(),
        ];
    }

    private function computePriceRange(): string
    {
        $prices = $this->whenLoaded('prices');
        if (!$prices || $prices->isEmpty()) {
            return 'Harga belum tersedia';
        }
        $amounts = $prices->pluck('price');
        $min = $amounts->min();
        $max = $amounts->max();
        $fmt = fn ($n) => 'Rp' . number_format($n, 0, ',', '.');
        return $min === $max
            ? $fmt($min) . ' / Jam'
            : $fmt($min) . ' - ' . $fmt($max) . ' / Jam';
    }
}
