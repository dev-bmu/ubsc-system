<?php

use App\Services\ReferenceData\PublicContentSynchronizer;
use App\Support\ReferenceData\PublicContentDefinition;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (PublicContentDefinition::assetPaths() as $path) {
            if (! is_file(public_path(ltrim($path, '/')))) {
                throw new \RuntimeException(
                    "Public content migration requires tracked asset [{$path}].",
                );
            }
        }

        Schema::table('promo_carousels', function (Blueprint $table): void {
            $table->string('bootstrap_key', 120)->nullable()->unique()->after('id');
            $table->string('fallback_asset_path')->nullable()->after('title');
        });

        Schema::table('sponsor_logos', function (Blueprint $table): void {
            $table->string('bootstrap_key', 120)->nullable()->unique()->after('id');
            $table->string('fallback_asset_path')->nullable()->after('name');
        });

        Schema::table('reels', function (Blueprint $table): void {
            $table->string('bootstrap_key', 120)->nullable()->unique()->after('id');
            $table->string('fallback_thumbnail_path')->nullable()->after('title');
            $table->string('fallback_video_path')->nullable()->after('fallback_thumbnail_path');
        });

        Schema::table('info_banners', function (Blueprint $table): void {
            $table->string('bootstrap_key', 120)->nullable()->unique()->after('id');
        });

        Schema::table('testimonials', function (Blueprint $table): void {
            $table->string('bootstrap_key', 120)->nullable()->unique()->after('id');
            $table->string('fallback_image_path')->nullable()->after('quote');
            $table->string('fallback_logo_path')->nullable()->after('fallback_image_path');
        });

        Schema::table('news', function (Blueprint $table): void {
            $table->unsignedBigInteger('author_id')->nullable()->change();
            $table->string('bootstrap_key', 120)->nullable()->unique()->after('id');
            $table->string('fallback_image_path')->nullable()->after('excerpt');
        });

        if (! app()->runningUnitTests()) {
            app(PublicContentSynchronizer::class)->sync();
        }
    }

    public function down(): void
    {
        Schema::table('news', function (Blueprint $table): void {
            $table->dropUnique(['bootstrap_key']);
            $table->dropColumn(['bootstrap_key', 'fallback_image_path']);
        });

        Schema::table('testimonials', function (Blueprint $table): void {
            $table->dropUnique(['bootstrap_key']);
            $table->dropColumn(['bootstrap_key', 'fallback_image_path', 'fallback_logo_path']);
        });

        Schema::table('info_banners', function (Blueprint $table): void {
            $table->dropUnique(['bootstrap_key']);
            $table->dropColumn('bootstrap_key');
        });

        Schema::table('reels', function (Blueprint $table): void {
            $table->dropUnique(['bootstrap_key']);
            $table->dropColumn(['bootstrap_key', 'fallback_thumbnail_path', 'fallback_video_path']);
        });

        Schema::table('sponsor_logos', function (Blueprint $table): void {
            $table->dropUnique(['bootstrap_key']);
            $table->dropColumn(['bootstrap_key', 'fallback_asset_path']);
        });

        Schema::table('promo_carousels', function (Blueprint $table): void {
            $table->dropUnique(['bootstrap_key']);
            $table->dropColumn(['bootstrap_key', 'fallback_asset_path']);
        });

        // Keep author_id nullable: reverting it could destroy unattributed
        // editorial records created while no administrator account existed.
    }
};
