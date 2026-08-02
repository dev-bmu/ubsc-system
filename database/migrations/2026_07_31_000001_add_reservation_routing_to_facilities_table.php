<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const DEFAULT_PHONE = '6285280809080';

    private const DEFAULT_MESSAGE = "Halo UB Sport Center 👋\n\nSaya ingin melakukan reservasi *{facility_name}* di lokasi *{location}*.\n\nMohon bantuannya untuk informasi jadwal yang tersedia, harga, dan langkah reservasi selanjutnya.\n\nTerima kasih.";

    public function up(): void
    {
        Schema::table('facilities', function (Blueprint $table): void {
            $table->string('reservation_method', 20)
                ->default('auto')
                ->after('display_metadata');
            $table->text('reservation_url')
                ->nullable()
                ->after('reservation_method');
            $table->string('reservation_phone', 30)
                ->nullable()
                ->after('reservation_url');
            $table->text('reservation_message')
                ->nullable()
                ->after('reservation_phone');
        });

        DB::table('facilities')->update([
            'reservation_phone' => self::DEFAULT_PHONE,
            'reservation_message' => self::DEFAULT_MESSAGE,
        ]);
    }

    public function down(): void
    {
        Schema::table('facilities', function (Blueprint $table): void {
            $table->dropColumn([
                'reservation_method',
                'reservation_url',
                'reservation_phone',
                'reservation_message',
            ]);
        });
    }
};
