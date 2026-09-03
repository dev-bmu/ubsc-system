<?php

use App\Support\AuthenticationIdentity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $users = DB::table('users')
            ->select(['id', 'email'])
            ->orderBy('id')
            ->get();
        $owners = [];

        foreach ($users as $user) {
            $canonical = AuthenticationIdentity::normalizeEmail($user->email);

            if (isset($owners[$canonical]) && $owners[$canonical] !== $user->id) {
                throw new RuntimeException(
                    'Cannot normalize user emails: duplicate canonical identity detected.',
                );
            }

            $owners[$canonical] = $user->id;
        }

        DB::transaction(function () use ($users): void {
            foreach ($users as $user) {
                $canonical = AuthenticationIdentity::normalizeEmail($user->email);

                if (! hash_equals((string) $user->email, $canonical)) {
                    DB::table('users')
                        ->where('id', $user->id)
                        ->update(['email' => $canonical]);
                }
            }
        });
    }

    public function down(): void
    {
        // Canonical lowercase identities are intentionally irreversible.
    }
};
