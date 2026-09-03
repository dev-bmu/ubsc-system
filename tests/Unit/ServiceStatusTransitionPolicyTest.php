<?php

namespace Tests\Unit;

use App\Services\DataGovernance\BookingOrderStatusTransitionPolicy;
use App\Services\DataGovernance\BookingStatusTransitionPolicy;
use App\Services\DataGovernance\MembershipStatusTransitionPolicy;
use App\Services\DataGovernance\TransactionStatusTransitionPolicy;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ServiceStatusTransitionPolicyTest extends TestCase
{
    #[DataProvider('validTransitions')]
    public function test_valid_service_transitions_are_accepted(
        string $policy,
        string $from,
        string $to,
        bool $allowPaymentActivation = false,
    ): void {
        $instance = app($policy);

        if ($instance instanceof MembershipStatusTransitionPolicy) {
            $instance->assertAllowed($from, $to, $allowPaymentActivation);
        } else {
            $instance->assertAllowed($from, $to);
        }

        $this->addToAssertionCount(1);
    }

    #[DataProvider('invalidTransitions')]
    public function test_invalid_or_reopened_terminal_transitions_are_rejected(
        string $policy,
        string $from,
        string $to,
        bool $allowPaymentActivation = false,
    ): void {
        $instance = app($policy);
        $this->expectException(ValidationException::class);

        if ($instance instanceof MembershipStatusTransitionPolicy) {
            $instance->assertAllowed($from, $to, $allowPaymentActivation);
        } else {
            $instance->assertAllowed($from, $to);
        }
    }

    public static function validTransitions(): array
    {
        return [
            'booking settlement' => [BookingStatusTransitionPolicy::class, 'pending', 'confirmed'],
            'booking completion' => [BookingStatusTransitionPolicy::class, 'confirmed', 'completed'],
            'order settlement' => [BookingOrderStatusTransitionPolicy::class, 'pending_payment', 'paid'],
            'membership payment activation' => [MembershipStatusTransitionPolicy::class, 'pending_payment', 'active', true],
            'membership expiry' => [MembershipStatusTransitionPolicy::class, 'active', 'expired'],
            'payment settlement' => [TransactionStatusTransitionPolicy::class, 'UNPAID', 'PAID'],
            'late settlement recovery' => [TransactionStatusTransitionPolicy::class, 'EXPIRED', 'PAID'],
        ];
    }

    public static function invalidTransitions(): array
    {
        return [
            'booking terminal reopening' => [BookingStatusTransitionPolicy::class, 'completed', 'confirmed'],
            'cancelled booking reopening' => [BookingStatusTransitionPolicy::class, 'cancelled', 'pending'],
            'paid order reopening' => [BookingOrderStatusTransitionPolicy::class, 'paid', 'pending_payment'],
            'admin membership activation' => [MembershipStatusTransitionPolicy::class, 'pending_payment', 'active'],
            'expired membership reopening' => [MembershipStatusTransitionPolicy::class, 'expired', 'active', true],
            'paid transaction downgrade' => [TransactionStatusTransitionPolicy::class, 'PAID', 'FAILED'],
        ];
    }
}
