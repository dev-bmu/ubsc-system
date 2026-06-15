<?php

namespace App\Http\Resources\Public;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReelResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'        => $this->id,
            'title'     => $this->title,
            'date'      => $this->created_at->format('d/m Y'),
            'thumbnail' => $this->getFirstMediaUrl('thumbnail'),
            'videoUrl'  => $this->getFirstMediaUrl('video'),
            'isActive'  => $this->is_active,
        ];
    }
}
