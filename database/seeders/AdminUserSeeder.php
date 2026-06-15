<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            [
                'name'     => 'Admin UBSC',
                'email'    => 'admin@ubsc.id',
                'password' => Hash::make('password'),
                'role'     => 'Administrator',
            ],
            [
                'name'     => 'Manager UBSC',
                'email'    => 'manager@ubsc.id',
                'password' => Hash::make('password'),
                'role'     => 'Manager',
            ],
            [
                'name'     => 'Finance UBSC',
                'email'    => 'finance@ubsc.id',
                'password' => Hash::make('password'),
                'role'     => 'Finance',
            ],
            [
                'name'     => 'Staff Front Office',
                'email'    => 'stafffo@ubsc.id',
                'password' => Hash::make('password'),
                'role'     => 'Staff Front Office',
            ],
            [
                'name'     => 'Staff Central',
                'email'    => 'staffcentral@ubsc.id',
                'password' => Hash::make('password'),
                'role'     => 'Staff Central',
            ],
        ];

        foreach ($users as $data) {
            $user = User::firstOrCreate(
                ['email' => $data['email']],
                [
                    'name'              => $data['name'],
                    'password'          => $data['password'],
                    'email_verified_at' => now(),
                ],
            );

            // Sync role (idempotent — safe to re-run)
            $user->syncRoles([$data['role']]);
        }
    }
}
