<?php

namespace App\Models\Gallery;

use App\Enums\GalleryItemStatus;
use App\Enums\GalleryMediaType;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Laravel\Scout\Searchable;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class GalleryItem extends Model implements HasMedia
{
    use InteractsWithMedia, Searchable;

    protected $fillable = [
        'uuid',
        'upload_batch_id',
        'media_type',
        'status',
        'location_id',
        'captured_at',
        'publish_at',
        'published_at',
        'credit',
        'source_sha256',
        'source_mime',
        'source_bytes',
        'source_width',
        'source_height',
        'duration_ms',
        'focal_x',
        'focal_y',
        'poster_second',
        'derivatives',
        'processing_error_code',
        'processing_error_detail',
        'rights_confirmed_at',
        'rights_confirmed_by',
        'created_by',
        'updated_by',
        'lock_version',
    ];

    protected function casts(): array
    {
        return [
            'media_type' => GalleryMediaType::class,
            'status' => GalleryItemStatus::class,
            'captured_at' => 'date',
            'publish_at' => 'datetime',
            'published_at' => 'datetime',
            'source_bytes' => 'integer',
            'source_width' => 'integer',
            'source_height' => 'integer',
            'duration_ms' => 'integer',
            'focal_x' => 'float',
            'focal_y' => 'float',
            'poster_second' => 'float',
            'derivatives' => 'array',
            'rights_confirmed_at' => 'datetime',
            'lock_version' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $item): void {
            $item->uuid ??= (string) Str::uuid();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    public function searchableAs(): string
    {
        return 'facility_gallery';
    }

    /**
     * @return array<string, mixed>
     */
    public function toSearchableArray(): array
    {
        $this->loadMissing(['translations', 'location', 'sections']);
        $translation = $this->translation('id');
        $activeSections = $this->sections->where('is_active', true);

        return [
            'uuid' => $this->uuid,
            'title' => $translation?->title ?? '',
            'arena_type' => $translation?->arena_type ?? '',
            'alt_text' => $translation?->alt_text ?? '',
            'caption' => $translation?->caption ?? '',
            'search_aliases' => $translation?->search_aliases ?? [],
            'location_name' => $this->location?->name ?? '',
            'location_slug' => $this->location?->slug ?? '',
            'section_keys' => $activeSections->pluck('key')->values()->all(),
            'media_type' => $this->media_type->value,
            'captured_year' => (int) ($this->captured_at?->year ?? $this->published_at?->year ?? 0),
            'captured_at' => $this->captured_at?->timestamp ?? 0,
            'published_at' => $this->published_at?->timestamp ?? 0,
            'is_public' => 1,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        if ($this->status !== GalleryItemStatus::Published
            || ! $this->published_at
            || $this->published_at->isFuture()
            || ! $this->isProcessed()) {
            return false;
        }

        return $this->sections()->where('is_active', true)->exists();
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('source')
            ->singleFile()
            ->useDisk(config('facility-gallery.originals_disk', 'local'));

        $this->addMediaCollection('poster-source')
            ->singleFile()
            ->useDisk(config('facility-gallery.originals_disk', 'local'));

        $this->addMediaCollection('subtitles')
            ->singleFile()
            ->useDisk(config('facility-gallery.public_disk', 'public'));
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(GalleryUploadBatch::class, 'upload_batch_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(GalleryLocation::class, 'location_id');
    }

    public function translations(): HasMany
    {
        return $this->hasMany(GalleryItemTranslation::class, 'gallery_item_id');
    }

    public function sections(): BelongsToMany
    {
        return $this->belongsToMany(GallerySection::class, 'gallery_item_section')
            ->using(GalleryItemSection::class)
            ->withPivot(['id', 'featured_position', 'sort_order', 'assigned_by'])
            ->withTimestamps();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(GalleryAuditLog::class, 'gallery_item_id')
            ->latest('created_at')
            ->limit(12);
    }

    public function translation(string $locale = 'id'): ?GalleryItemTranslation
    {
        if ($this->relationLoaded('translations')) {
            return $this->translations->firstWhere('locale', $locale)
                ?? $this->translations->firstWhere('locale', 'id');
        }

        return $this->translations()
            ->whereIn('locale', [$locale, 'id'])
            ->orderByRaw('CASE WHEN locale = ? THEN 0 ELSE 1 END', [$locale])
            ->first();
    }

    public function scopePubliclyVisible(Builder $query): Builder
    {
        return $query
            ->where('status', GalleryItemStatus::Published->value)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->whereNotNull('derivatives')
            ->whereHas('sections', fn (Builder $sectionQuery) => $sectionQuery->where('is_active', true));
    }

    public function scopeForSection(Builder $query, string $sectionKey): Builder
    {
        return $query->whereHas(
            'sections',
            fn (Builder $sectionQuery) => $sectionQuery->where('key', $sectionKey),
        );
    }

    public function isProcessed(): bool
    {
        $derivatives = $this->derivatives ?? [];

        if ($this->media_type === GalleryMediaType::Image) {
            return ! empty($derivatives['image']['fallback']);
        }

        return ! empty($derivatives['video']['fallback'])
            && ! empty($derivatives['video']['hls']);
    }
}
