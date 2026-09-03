<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\ServiceAuditEvent;
use App\Models\User;
use App\Services\DataGovernance\ServiceAuditLogger;
use App\Services\DataGovernance\ServiceAuditVerifier;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ServiceAuditLedgerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('data_audit.current_key_version', 1);
        config()->set('data_audit.integrity_keys.1', 'test-only-audit-integrity-key');
    }

    public function test_service_records_are_audited_without_storing_customer_pii(): void
    {
        $user = User::factory()->create();
        $facility = $this->facility();
        $booking = Booking::query()->create([
            'user_id' => $user->id,
            'customer_name' => 'Sensitive Customer Name',
            'facility_id' => $facility->id,
            'booking_date' => '2026-08-20',
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
            'notes' => 'Sensitive private note',
        ]);

        $created = ServiceAuditEvent::query()
            ->where('subject_type', 'booking')
            ->where('subject_id', $booking->id)
            ->where('action', 'created')
            ->sole();

        $this->assertTrue(app(ServiceAuditLogger::class)->verify($created));
        $this->assertSame('pending', $created->to_state);
        $this->assertSame($user->id, $created->metadata['snapshot']['user_id']);

        $serialized = json_encode($created->metadata, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('Sensitive Customer Name', $serialized);
        $this->assertStringNotContainsString('Sensitive private note', $serialized);

        $booking->update(['status' => 'cancelled']);

        $transition = ServiceAuditEvent::query()
            ->where('subject_type', 'booking')
            ->where('subject_id', $booking->id)
            ->where('action', 'state_changed')
            ->sole();

        $this->assertSame('pending', $transition->from_state);
        $this->assertSame('cancelled', $transition->to_state);
        $this->assertTrue(app(ServiceAuditLogger::class)->verify($transition));
    }

    public function test_database_guards_reject_raw_audit_updates(): void
    {
        $event = app(ServiceAuditLogger::class)->record(
            'booking',
            999,
            'baseline_captured',
            toState: 'pending',
            actorType: 'system',
            source: 'test',
        );

        $this->expectException(QueryException::class);

        DB::table('service_audit_events')
            ->where('id', $event->id)
            ->update(['action' => 'tampered']);
    }

    public function test_database_guards_reject_raw_audit_deletes(): void
    {
        $event = app(ServiceAuditLogger::class)->record(
            'membership',
            999,
            'baseline_captured',
            toState: 'active',
            actorType: 'system',
            source: 'test',
        );

        $this->expectException(QueryException::class);

        DB::table('service_audit_events')
            ->where('id', $event->id)
            ->delete();
    }

    public function test_baseline_command_is_idempotent_for_legacy_rows(): void
    {
        $membershipId = DB::table('memberships')->insertGetId([
            'customer_name' => 'Legacy Member',
            'start_date' => '2026-08-01',
            'end_date' => '2026-09-01',
            'status' => 'active',
            'created_via' => 'legacy',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertDatabaseMissing('service_audit_events', [
            'subject_type' => 'membership',
            'subject_id' => $membershipId,
        ]);

        $this->assertSame(0, Artisan::call('services:audit-baseline', ['--chunk' => 50]));
        $this->assertDatabaseHas('service_audit_events', [
            'subject_type' => 'membership',
            'subject_id' => $membershipId,
            'action' => 'baseline_captured',
        ]);
        $count = ServiceAuditEvent::query()->count();

        $this->assertSame(0, Artisan::call('services:audit-baseline', ['--chunk' => 50]));
        $this->assertSame($count, ServiceAuditEvent::query()->count());
    }

    public function test_model_guard_rejects_reopening_a_terminal_booking(): void
    {
        $booking = Booking::query()->create([
            'customer_name' => 'Terminal State Test',
            'facility_id' => $this->facility()->id,
            'booking_date' => '2026-08-20',
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);
        $booking->update(['status' => 'cancelled']);

        try {
            $booking->update(['status' => 'confirmed']);
            $this->fail('A terminal booking was reopened.');
        } catch (ValidationException) {
            $this->assertSame('cancelled', $booking->fresh()->status);
        }

        $this->assertSame(2, ServiceAuditEvent::query()
            ->where('subject_type', 'booking')
            ->where('subject_id', $booking->id)
            ->count());
    }

    public function test_facility_with_booking_history_cannot_be_deleted_at_database_level(): void
    {
        $facility = $this->facility();
        $booking = Booking::query()->create([
            'customer_name' => 'Historical Booking',
            'facility_id' => $facility->id,
            'booking_date' => '2026-08-20',
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);

        try {
            $facility->delete();
            $this->fail('A facility with booking history was deleted.');
        } catch (QueryException) {
            $this->assertDatabaseHas('facilities', ['id' => $facility->id]);
            $this->assertDatabaseHas('bookings', ['id' => $booking->id]);
        }
    }

    public function test_rolling_verifier_only_becomes_operational_after_a_complete_cycle(): void
    {
        $audit = app(ServiceAuditLogger::class);
        $audit->record('booking', 1001, 'baseline_captured', toState: 'pending');
        $audit->record('membership', 1002, 'baseline_captured', toState: 'active');
        $verifier = app(ServiceAuditVerifier::class);

        $first = $verifier->verify(1);
        $this->assertSame('degraded', $first['status']);
        $this->assertFalse($first['context']['full_cycle_completed']);
        $this->assertFalse($first['context']['has_completed_cycle']);

        $second = $verifier->verify(1);
        $this->assertSame('operational', $second['status']);
        $this->assertTrue($second['context']['full_cycle_completed']);
        $this->assertTrue($second['context']['has_completed_cycle']);
        $this->assertSame(0, $second['context']['last_cycle_mismatches']);
    }

    public function test_verifier_reports_a_cryptographically_invalid_insert_as_outage(): void
    {
        $publicId = '0198a000-0000-7000-8000-000000000001';
        $timestamp = now()->startOfSecond()->format('Y-m-d H:i:s');
        DB::table('service_audit_events')->insert([
            'public_id' => $publicId,
            'subject_type' => 'booking',
            'subject_id' => 777,
            'action' => 'tampered_insert',
            'actor_type' => 'system',
            'source' => 'test',
            'integrity_key_version' => 1,
            'payload_hash' => str_repeat('0', 64),
            'metadata' => '[]',
            'occurred_at' => $timestamp,
            'created_at' => $timestamp,
        ]);

        $result = app(ServiceAuditVerifier::class)->verify(100);

        $this->assertSame('outage', $result['status']);
        $this->assertSame(1, $result['context']['last_cycle_mismatches']);
        $this->assertSame($publicId, $result['context']['mismatch_public_id']);
    }

    private function facility(): Facility
    {
        $category = FacilityCategory::query()->create([
            'name' => 'Arena',
            'slug' => 'arena-audit-test',
        ]);

        return Facility::query()->create([
            'facility_category_id' => $category->id,
            'name' => 'Arena Audit',
            'slug' => 'arena-audit',
            'capacity' => 1,
            'is_active' => true,
        ]);
    }
}
