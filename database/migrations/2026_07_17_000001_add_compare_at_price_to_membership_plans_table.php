<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->unsignedBigInteger('compare_at_price')->nullable()->after('price');
        });

        DB::table('membership_plans')
            ->select(['id', 'price', 'savings_label'])
            ->whereNotNull('savings_label')
            ->orderBy('id')
            ->each(function (object $plan): void {
                if (! preg_match('/hemat\s+(\d{1,2})\s*%/i', (string) $plan->savings_label, $matches)) {
                    return;
                }

                $discount = (int) $matches[1];
                $price = (int) $plan->price;

                if ($discount <= 0 || $discount >= 100 || $price <= 0) {
                    return;
                }

                $compareAtPrice = (int) round($price / (1 - ($discount / 100)));

                if ($compareAtPrice > $price) {
                    DB::table('membership_plans')
                        ->where('id', $plan->id)
                        ->update(['compare_at_price' => $compareAtPrice]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropColumn('compare_at_price');
        });
    }
};
