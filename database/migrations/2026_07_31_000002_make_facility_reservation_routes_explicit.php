<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Convert the former ambiguous "auto" state into explicit destinations.
     *
     * Existing facilities with booking history stay on the website. The four
     * original booking-directory facilities are preserved even when their
     * history has not been seeded yet. Every other facility becomes WhatsApp.
     */
    public function up(): void
    {
        $originalWebsiteSlugs = [
            'lapangan-tenis',
            'lapangan-badminton',
            'lapangan-tenis-meja',
            'lapangan-futsal-veteran',
        ];

        DB::table('facilities')
            ->where('reservation_method', 'auto')
            ->where(function ($query) use ($originalWebsiteSlugs): void {
                $query
                    ->whereIn('slug', $originalWebsiteSlugs)
                    ->orWhereExists(function ($bookings): void {
                        $bookings
                            ->selectRaw('1')
                            ->from('bookings')
                            ->whereColumn(
                                'bookings.facility_id',
                                'facilities.id',
                            );
                    });
            })
            ->update(['reservation_method' => 'website']);

        DB::table('facilities')
            ->where('reservation_method', 'auto')
            ->update(['reservation_method' => 'whatsapp']);
    }

    public function down(): void
    {
        // Explicit admin choices are intentionally not made ambiguous again.
    }
};
