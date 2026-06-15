<?php

namespace App\Http\Resources\Public;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NewsResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'title'       => $this->title,
            'slug'        => $this->slug,
            'date'        => $this->published_at?->format('d.m.Y') ?? '',
            'category'    => $this->whenLoaded('category', fn () => $this->category->name, ''),
            'image'       => $this->getFirstMediaUrl('thumbnail'),
            'description' => $this->excerpt,
        ];
    }
}
