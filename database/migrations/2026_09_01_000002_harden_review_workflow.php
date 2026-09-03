<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table): void {
            $table->string('status', 16)->default('pending')->after('is_approved');
            $table->unsignedInteger('version')->default(1)->after('status');
            $table->timestamp('submitted_at')->nullable()->after('version');
            $table->timestamp('approved_at')->nullable()->after('submitted_at');
            $table->timestamp('rejected_at')->nullable()->after('approved_at');
            $table->timestamp('moderated_at')->nullable()->after('rejected_at');
            $table->foreignId('moderated_by')
                ->nullable()
                ->after('moderated_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->string('moderation_feedback', 500)->nullable()->after('moderated_by');
            $table->string('eligibility_source', 24)->nullable()->after('moderation_feedback');
            $table->unsignedBigInteger('eligibility_reference_id')->nullable()->after('eligibility_source');
        });

        DB::table('reviews')->where('is_approved', true)->update([
            'status' => 'approved',
            'approved_at' => DB::raw('created_at'),
            'submitted_at' => DB::raw('created_at'),
        ]);
        DB::table('reviews')->where('is_approved', false)->update([
            'status' => 'pending',
            'submitted_at' => DB::raw('created_at'),
        ]);

        $duplicateUserIds = DB::table('reviews')
            ->whereNotNull('user_id')
            ->select('user_id')
            ->groupBy('user_id')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('user_id');

        foreach ($duplicateUserIds as $userId) {
            $reviews = DB::table('reviews')
                ->where('user_id', $userId)
                ->orderByDesc('updated_at')
                ->orderByDesc('id')
                ->get(['id', 'reviewer_name']);
            $fallbackName = DB::table('users')->where('id', $userId)->value('name')
                ?? 'Pengguna lama';

            foreach ($reviews->skip(1) as $duplicate) {
                DB::table('reviews')->where('id', $duplicate->id)->update([
                    'user_id' => null,
                    'reviewer_name' => $duplicate->reviewer_name ?: $fallbackName,
                    'status' => 'rejected',
                    'is_approved' => false,
                    'approved_at' => null,
                    'rejected_at' => now(),
                    'moderation_feedback' => 'Diarsipkan saat normalisasi aturan satu ulasan per akun.',
                ]);
            }
        }

        Schema::table('reviews', function (Blueprint $table): void {
            $table->unique('user_id', 'reviews_user_single_review_unique');
            $table->index(['status', 'approved_at', 'id'], 'reviews_publication_idx');
            $table->index(
                ['eligibility_source', 'eligibility_reference_id'],
                'reviews_eligibility_reference_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::table('reviews', function (Blueprint $table): void {
            $table->dropUnique('reviews_user_single_review_unique');
            $table->dropIndex('reviews_publication_idx');
            $table->dropIndex('reviews_eligibility_reference_idx');
            $table->dropForeign(['moderated_by']);
            $table->dropColumn([
                'status',
                'version',
                'submitted_at',
                'approved_at',
                'rejected_at',
                'moderated_at',
                'moderated_by',
                'moderation_feedback',
                'eligibility_source',
                'eligibility_reference_id',
            ]);
        });
    }
};
