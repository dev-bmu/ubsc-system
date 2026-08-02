<?php

namespace App\Services\Payments;

use BackedEnum;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Writes a deliberately small, non-authoritative operational projection of
 * payment activity. The per-event allowlists make it impossible for callers
 * to accidentally pass request payloads, credentials, or customer PII into
 * the payment log channel.
 */
final class PaymentOperationalLogger
{
    /**
     * @var array<string, array{level:string, fields:list<string>}>
     */
    private const EVENTS = [
        'payment_attempt_initialized' => [
            'level' => 'info',
            'fields' => ['attempt_id', 'transaction_id', 'attempt_number', 'status'],
        ],
        'payment_idempotency_reused' => [
            'level' => 'info',
            'fields' => ['attempt_id', 'transaction_id', 'status', 'reuse_scope'],
        ],
        'payment_idempotency_conflict' => [
            'level' => 'warning',
            'fields' => ['attempt_id', 'transaction_id', 'status', 'reason_code'],
        ],
        'payment_status_transitioned' => [
            'level' => 'info',
            'fields' => ['attempt_id', 'transaction_id', 'from_status', 'to_status'],
        ],
        'payment_illegal_transition' => [
            'level' => 'warning',
            'fields' => ['attempt_id', 'transaction_id', 'from_status', 'to_status'],
        ],
        'payment_event_received' => [
            'level' => 'info',
            'fields' => ['attempt_id', 'event_id', 'provider', 'event_type', 'reported_status'],
        ],
        'payment_event_duplicate' => [
            'level' => 'info',
            'fields' => ['attempt_id', 'event_id', 'provider', 'event_type'],
        ],
        'payment_event_processed' => [
            'level' => 'info',
            'fields' => ['attempt_id', 'event_id', 'result', 'message_code', 'reported_status'],
        ],
        'payment_recovery_failed' => [
            'level' => 'error',
            'fields' => ['operation', 'record_id', 'exception', 'error_fingerprint'],
        ],
        'payment_recovery_run_completed' => [
            'level' => 'info',
            'fields' => [
                'booking_orders_recovered',
                'direct_bookings_recovered',
                'memberships_recovered',
                'stale_attempts_reconciling',
                'booking_orders_expired',
                'errors',
            ],
        ],
        'membership_activated' => [
            'level' => 'info',
            'fields' => ['membership_id', 'transaction_id', 'plan_id', 'activation_source'],
        ],
        'reservation_confirmed' => [
            'level' => 'info',
            'fields' => [
                'booking_order_id',
                'booking_id',
                'transaction_id',
                'booking_count',
                'confirmation_source',
            ],
        ],
        'reservation_conflict' => [
            'level' => 'warning',
            'fields' => [
                'facility_id',
                'unit_id',
                'requested_facilities',
                'resolved_facilities',
                'requested_units',
                'resolved_units',
                'requested_pax',
                'occupied_pax',
                'capacity',
                'reason_code',
            ],
        ],
        'payment_log_archive_completed' => [
            'level' => 'info',
            'fields' => [
                'eligible',
                'archived',
                'already_archived',
                'pruned',
                'errors',
                'dry_run',
            ],
        ],
        'payment_log_archive_failed' => [
            'level' => 'error',
            'fields' => ['operation', 'filename', 'exception', 'error_fingerprint'],
        ],
    ];

    /**
     * @param  array<string, mixed>  $context
     */
    public function record(string $event, array $context = []): bool
    {
        $definition = self::EVENTS[$event] ?? null;

        if ($definition === null) {
            return false;
        }

        $safe = [];

        foreach ($definition['fields'] as $field) {
            if (! array_key_exists($field, $context)) {
                continue;
            }

            $value = $this->normalize($context[$field]);

            if ($value !== null || $context[$field] === null) {
                $safe[$field] = $value;
            }
        }

        try {
            Log::channel('payments')->log($definition['level'], $event, $safe);

            return true;
        } catch (Throwable) {
            // Operational telemetry is deliberately best-effort. The payment
            // tables remain the durable audit source and must not be rolled
            // back merely because a log sink is temporarily unavailable.
            return false;
        }
    }

    /**
     * Defer successful state-change telemetry until the outermost database
     * transaction commits. This avoids false audit projections after a
     * rollback and keeps filesystem/network sinks outside critical row locks.
     * If no transaction is active, Laravel executes the callback immediately.
     *
     * @param  array<string, mixed>  $context
     */
    public function recordAfterCommit(string $event, array $context = []): bool
    {
        if (! isset(self::EVENTS[$event])) {
            return false;
        }

        try {
            DB::afterCommit(fn (): bool => $this->record($event, $context));

            return true;
        } catch (Throwable) {
            return $this->record($event, $context);
        }
    }

    private function normalize(mixed $value): string|int|float|bool|null
    {
        if ($value instanceof BackedEnum) {
            $value = $value->value;
        }

        if (is_int($value) || is_float($value) || is_bool($value) || $value === null) {
            return $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $clean = trim((string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $value));

        return $clean === '' ? null : substr($clean, 0, 191);
    }
}
