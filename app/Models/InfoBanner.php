<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class InfoBanner extends Model
{
    protected $fillable = ['message', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('id');
    }

    public static function normalizeSortOrder(): void
    {
        static::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['id'])
            ->each(function (self $banner, int $index): void {
                $banner->updateQuietly(['sort_order' => $index + 1]);
            });
    }
}
