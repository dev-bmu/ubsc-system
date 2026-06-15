<?php

use App\Models\Membership;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('transactions')
            ->where('transactionable_type', Membership::class)
            ->where('payment_status', 'UNPAID')
            ->update([
                'payment_status' => 'PAID',
                'paid_at' => now(),
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Intentionally not reverting payment state. Once a membership exists,
        // the business rule is that it represents a confirmed/paid membership.
    }
};
