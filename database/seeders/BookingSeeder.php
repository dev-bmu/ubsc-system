<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\Facility;
use App\Models\Transaction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class BookingSeeder extends Seeder
{
    public function run(): void
    {
        // Use verified users or the first 2 users available
        $users = User::where('identity_status', 'verified')->take(2)->get();
        if ($users->count() < 2) {
            $users = User::take(2)->get();
        }
        if ($users->isEmpty()) {
            $this->command->warn('No users found. Skipping BookingSeeder.');
            return;
        }

        $facilities = Facility::where('is_active', true)->take(4)->get();
        if ($facilities->isEmpty()) {
            $this->command->warn('No active facilities found. Skipping BookingSeeder.');
            return;
        }

        $now   = Carbon::now();
        $month = $now->month;
        $year  = $now->year;

        // Define 20 bookings spread across the month
        $slots = [
            // [day, start, end, facilityIndex, userIndex]
            [1,  '08:00', '10:00', 0, 0],
            [2,  '09:00', '11:00', 1, 1],
            [3,  '13:00', '15:00', 0, 0],
            [5,  '07:00', '09:00', 2, 1],
            [6,  '10:00', '12:00', 0, 0],
            [7,  '14:00', '16:00', 1, 1],
            [8,  '08:00', '10:00', 3, 0],
            [10, '09:00', '11:00', 0, 1],
            [12, '13:00', '15:00', 2, 0],
            [13, '10:00', '12:00', 1, 1],
            [14, '08:00', '09:00', 0, 0],
            [15, '15:00', '17:00', 3, 1],
            [16, '09:00', '11:00', 0, 0],
            [17, '07:00', '09:00', 1, 1],
            [18, '13:00', '14:00', 2, 0],
            [20, '10:00', '12:00', 0, 1],
            [21, '14:00', '16:00', 3, 0],
            [22, '08:00', '10:00', 1, 1],
            [24, '09:00', '11:00', 0, 0],
            [25, '13:00', '15:00', 2, 1],
        ];

        // Payment statuses: 12 PAID, 5 UNPAID, 3 FAILED/EXPIRED
        $paymentStatuses = [
            'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID',
            'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID',
            'UNPAID', 'UNPAID', 'UNPAID', 'UNPAID', 'UNPAID',
            'EXPIRED', 'FAILED', 'FAILED',
        ];

        $bookingStatuses = [
            'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed',
            'completed', 'completed', 'completed', 'completed', 'completed', 'completed',
            'pending', 'pending', 'pending', 'pending', 'pending',
            'cancelled', 'cancelled', 'cancelled',
        ];

        foreach ($slots as $i => [$day, $start, $end, $facIdx, $userIdx]) {
            $facility = $facilities[$facIdx] ?? $facilities->first();
            $user     = $users[$userIdx] ?? $users->first();

            $date  = Carbon::create($year, $month, $day);
            $price = $facility->prices()->first();
            $subtotal = $price ? $price->price : 50_000;

            $paymentStatus = $paymentStatuses[$i];
            $bookingStatus = $bookingStatuses[$i];

            $booking = Booking::create([
                'user_id'        => $user->id,
                'facility_id'    => $facility->id,
                'booking_date'   => $date->toDateString(),
                'start_time'     => $start,
                'end_time'       => $end,
                'subtotal_price' => $subtotal,
                'status'         => $bookingStatus,
                'notes'          => null,
            ]);

            $paidAt = $paymentStatus === 'PAID'
                ? $date->copy()->setTime(12, 0)
                : null;

            Transaction::create([
                'user_id'              => $user->id,
                'transactionable_id'   => $booking->id,
                'transactionable_type' => Booking::class,
                'amount'               => $subtotal,
                'payment_status'       => $paymentStatus,
                'xendit_invoice_id'    => null,
                'checkout_url'         => url("/admin/bookings/{$booking->id}"),
                'paid_at'              => $paidAt,
            ]);
        }

        $this->command->info('BookingSeeder: 20 bookings + transactions created.');
    }
}
