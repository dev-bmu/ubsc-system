<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CURRENT_MESSAGE = 'UB Sport Center Buka Setiap Hari: 06.00 - 22.00 WIB';

    private const LEGACY_MESSAGE = 'UB Sport Center Buka Setiap Hari: 06.00 - 21.00 WIB';

    public function up(): void
    {
        if (! Schema::hasTable('info_banners')) {
            return;
        }

        DB::table('info_banners')
            ->where('message', self::LEGACY_MESSAGE)
            ->update(['message' => self::CURRENT_MESSAGE]);
    }

    public function down(): void
    {
        if (! Schema::hasTable('info_banners')) {
            return;
        }

        DB::table('info_banners')
            ->where('message', self::CURRENT_MESSAGE)
            ->update(['message' => self::LEGACY_MESSAGE]);
    }
};
