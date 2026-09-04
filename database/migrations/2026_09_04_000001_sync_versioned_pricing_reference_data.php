<?php

use App\Services\ReferenceData\PricingCatalogSynchronizer;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Feature tests intentionally begin with an empty business database.
        // The synchronizer has dedicated integration tests below that exercise
        // the exact production path without polluting unrelated test fixtures.
        if (app()->runningUnitTests()) {
            return;
        }

        app(PricingCatalogSynchronizer::class)->sync();
    }

    public function down(): void
    {
        // Product and administrator data may already reference these records.
        // A code rollback must never delete or revert durable business data.
    }
};
