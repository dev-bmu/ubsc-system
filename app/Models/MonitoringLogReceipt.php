<?php

namespace App\Models;

use App\Casts\UtcImmutableDateTime;
use Illuminate\Database\Eloquent\Model;
use LogicException;

final class MonitoringLogReceipt extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = [
        'payload_hash',
        'source_signature',
    ];

    protected static function booted(): void
    {
        self::updating(static function (): never {
            throw new LogicException('Log-ingestion receipts are append-only.');
        });
        self::deleting(static function (): never {
            throw new LogicException('Log-ingestion receipts cannot be deleted through Eloquent.');
        });
    }

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'ingested_at' => UtcImmutableDateTime::class,
            'retention_until' => UtcImmutableDateTime::class,
            'recorded_at' => UtcImmutableDateTime::class,
        ];
    }
}
