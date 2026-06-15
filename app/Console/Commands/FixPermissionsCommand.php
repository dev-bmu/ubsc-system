<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Spatie\Permission\PermissionRegistrar;

class FixPermissionsCommand extends Command
{
    protected $signature   = 'ubsc:fix-permissions {--fresh : Also run migrate:fresh before seeding}';
    protected $description = 'Clear all caches and re-seed roles & permissions. Run this on any machine after pulling changes.';

    public function handle(): int
    {
        $this->info('── UBSC Permission Fix ─────────────────────────────────');

        // 1. Clear all Laravel caches (config, route, view, event)
        $this->call('optimize:clear');

        // 2. Clear Spatie's internal permission cache
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->info('✓ Permission cache cleared');

        // 3. Optionally wipe and re-migrate (use --fresh for a clean slate)
        if ($this->option('fresh')) {
            if (!$this->confirm('This will DROP all tables and re-run all migrations. Continue?', false)) {
                $this->warn('Aborted — no changes made to the database.');
                return self::FAILURE;
            }
            $this->call('migrate:fresh', ['--seed' => true]);
        } else {
            // 4. Re-seed only roles & permissions (safe on existing data)
            $this->call('db:seed', ['--class' => 'RoleAndPermissionSeeder', '--force' => true]);
        }

        $this->info('');
        $this->info('✓ Done. All roles and permissions are now in sync.');
        $this->info('  Have teammates log out and log back in to get fresh permission tokens.');

        return self::SUCCESS;
    }
}
