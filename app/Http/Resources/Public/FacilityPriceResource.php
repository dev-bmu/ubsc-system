<?php

namespace App\Http\Resources\Public;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FacilityPriceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'user_category' => $this->user_category,
            'label'         => $this->label,
            'price'         => $this->price,
            'duration_minutes' => $this->duration_minutes,
            'schedule_type' => $this->schedule_type,
            'applicable_days' => $this->applicable_days,
            'starts_at'     => $this->starts_at ? substr($this->starts_at, 0, 5) : null,
            'ends_at'       => $this->ends_at ? substr($this->ends_at, 0, 5) : null,
            'starts_on'     => $this->starts_on?->format('Y-m-d'),
            'ends_on'       => $this->ends_on?->format('Y-m-d'),
            'notes'         => $this->notes,
        ];
    }
}
