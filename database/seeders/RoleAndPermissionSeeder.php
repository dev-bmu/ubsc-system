<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // Rename legacy role name if it exists
        Role::where('name', 'Staff Front Officer')->update(['name' => 'Staff Front Office']);

        // ── Define all permissions ────────────────────────────────────────────
        //
        // IMPORTANT: These names MUST match exactly what controllers call in
        // $this->authorize('...') and what the Roles.tsx UI renders as keys.
        // Do not rename here without updating controllers and Roles.tsx simultaneously.
        //
        $allPermissions = [
            // Beranda & Dasbor
            'view-stats',           // dashboard stat visibility (no controller gate yet)
            'view-reports',         // FinanceReportController — was: view-finance-reports

            // Reservasi & Jadwal
            'view-bookings',        // read-only booking list (no controller gate yet)
            'manage-bookings',      // BookingController, MembershipController, TransactionController
            'manage-booking-limits', // future: schedule/capacity limits

            // Fasilitas & Lapangan
            'view-facilities',      // read-only facility list (no controller gate yet)
            'manage-facilities',    // FacilityController, FacilityCategoryController
            'manage-pricing',       // future: FacilityPricing controller

            // CMS — News, Promo, Reels, Sponsors, Testimonials
            'manage-cms',           // NewsController, PromoCarouselController, ReelController,
                                    // SponsorLogoController, TestimonialController
            'publish-news',         // NewsController — sub-permission for is_published flag

            // Member & Pelanggan
            'view-members',         // read-only member list (no controller gate yet)
            'manage-members',       // future: member CRUD
            'manage-payment-links', // future: payment link management

            // Verifikasi UBSC
            'verify-identity',      // IdentityQueueController — was: verify-identity-queue
        ];

        // Remove permissions that no longer exist in this list
        Permission::whereNotIn('name', $allPermissions)->delete();

        foreach ($allPermissions as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'web']);
        }

        // ── Role → Permission matrix ──────────────────────────────────────────
        $matrix = [
            'Administrator'      => $allPermissions,

            'Manager'            => $allPermissions,

            'Finance'            => [
                'view-stats',
                'view-reports',
                'view-bookings',
                'view-members',
                'manage-payment-links',
            ],

            'Staff Central'      => [
                'view-bookings',
                'manage-bookings',
                'view-facilities',
                'manage-cms',
                'view-members',
            ],

            'Staff Front Office' => [
                'view-bookings',
                'verify-identity',
            ],
        ];

        foreach ($matrix as $roleName => $rolePermissions) {
            $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            $role->syncPermissions($rolePermissions);
        }
    }
}
