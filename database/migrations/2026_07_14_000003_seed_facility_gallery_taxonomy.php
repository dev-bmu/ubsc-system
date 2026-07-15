<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        foreach (config('facility-gallery.sections', []) as $key => $section) {
            DB::table('gallery_sections')->updateOrInsert(
                ['key' => $key],
                [
                    'slug' => $section['slug'],
                    'name' => $section['name'],
                    'quota' => $section['quota'],
                    'layout' => $section['layout'],
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }

        foreach (config('facility-gallery.initial_locations', []) as $location) {
            DB::table('gallery_locations')->updateOrInsert(
                ['slug' => Str::slug($location)],
                [
                    'name' => $location,
                    'is_active' => true,
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }
    }

    public function down(): void
    {
        DB::table('gallery_sections')->whereIn(
            'key',
            array_keys(config('facility-gallery.sections', [])),
        )->delete();

        DB::table('gallery_locations')->whereIn(
            'slug',
            collect(config('facility-gallery.initial_locations', []))
                ->map(fn (string $location) => Str::slug($location))
                ->all(),
        )->delete();
    }
};
