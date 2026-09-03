<?php

namespace Tests\Feature;

use App\Exceptions\InvoicePdfGenerationException;
use App\Jobs\GenerateInvoicePdf;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\InvoicePdfArtifact;
use App\Models\User;
use App\Services\BookingInvoiceService;
use App\Services\Invoices\InvoicePdfArtifactService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BookingInvoiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('invoice-pdf');
    }

    public function test_paid_owner_receives_a_real_private_pdf(): void
    {
        [$user, $order] = $this->paidOrder();

        $response = $this->actingAs($user)
            ->get(route('checkout.booking.invoice', $order));

        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        $this->assertStringContainsString(
            'inline',
            (string) $response->headers->get('Content-Disposition'),
        );
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
        $inlinePdf = $response->streamedContent();
        $this->assertStringStartsWith('%PDF-', $inlinePdf);
        $this->assertStringContainsString('BDOGrotesk', $inlinePdf);
        $this->assertGreaterThanOrEqual(4, substr_count($inlinePdf, '/FontFile2'));
        $this->assertGreaterThanOrEqual(4, substr_count($inlinePdf, '/Subtype /Image'));

        $download = $this->actingAs($user)
            ->get(route('checkout.booking.invoice', [
                'bookingOrder' => $order,
                'download' => 1,
            ]));

        $download->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringContainsString(
            'attachment',
            (string) $download->headers->get('Content-Disposition'),
        );
        $this->assertSame($inlinePdf, $download->streamedContent());
        $this->assertDatabaseCount('invoice_pdf_artifacts', 1);
    }

    public function test_invoice_rejects_non_owner_and_unpaid_orders(): void
    {
        [$owner, $paidOrder] = $this->paidOrder();
        $otherUser = User::factory()->create();

        $this->actingAs($otherUser)
            ->get(route('checkout.booking.invoice', $paidOrder))
            ->assertNotFound();

        [$unpaidOwner, $unpaidOrder] = $this->paidOrder(false);

        $this->actingAs($unpaidOwner)
            ->get(route('checkout.booking.invoice', $unpaidOrder))
            ->assertStatus(409);
    }

    public function test_invoice_document_prefers_snapshot_and_balances_discount(): void
    {
        [$user, $order] = $this->paidOrder(
            paid: true,
            subtotal: 80000,
            discount: 20000,
            fee: 6000,
        );

        $order->transaction->update([
            'payment_method' => 'qris',
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
                'items' => [[
                    'booking_id' => $order->bookings->first()->id,
                    'facility_id' => $order->bookings->first()->facility_id,
                    'facility_name' => 'Nama Saat Transaksi',
                    'facility_unit_name' => 'Unit Historis',
                    'category_name' => 'Arena',
                    'location' => 'Gedung Utama',
                    'booking_date' => '2026-08-01',
                    'start_time' => '10:00',
                    'end_time' => '12:00',
                    'starts_at' => '2026-08-01T10:00:00+07:00',
                    'ends_at' => '2026-08-01T12:00:00+07:00',
                    'duration_minutes' => 120,
                    'subtotal' => 80000,
                ]],
            ],
        ]);
        $order->bookings->first()->facility->update([
            'name' => 'Nama Baru Yang Tidak Boleh Mengubah Invoice',
        ]);

        $order->refresh()->load([
            'bookings.facility.category',
            'bookings.facilityUnit',
            'transaction',
        ]);

        $document = app(BookingInvoiceService::class)->document($order);

        $this->assertSame('Nama Saat Transaksi', $document['items'][0]['facility_name']);
        $this->assertSame('Unit Historis', $document['items'][0]['unit_name']);
        $this->assertSame('2026-08-01', $document['items'][0]['booking_date']);
        $this->assertSame(120, $document['items'][0]['duration_minutes']);
        $this->assertSame(100000, $document['pricing']['regular_subtotal']);
        $this->assertSame(20000, $document['pricing']['discount']);
        $this->assertSame(80000, $document['pricing']['subtotal']);
        $this->assertSame(86000, $document['pricing']['total']);
        $this->assertSame(0, $document['pricing']['balance_due']);
        $this->assertTrue($document['pricing']['matches']);
        $this->assertSame('QRIS', $document['payment_method']);
        $this->assertSame('***********1001', $document['customer']['identity']);
        $this->assertStringStartsWith(
            'data:image/png;base64,',
            $document['qr_data_uri'],
        );
        $this->assertNotEmpty($document['fonts']['regular']);
        $this->assertNotEmpty($document['fonts']['bold']);
        $this->assertSame($user->id, $order->user_id);
    }

    public function test_signed_verification_is_public_but_never_exposes_customer_data(): void
    {
        [, $order] = $this->paidOrder();
        $document = app(BookingInvoiceService::class)->document($order);

        $response = $this->get($document['verification_url']);

        $response
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
            ->assertSee($document['receipt'])
            ->assertSee('Invoice terverifikasi')
            ->assertDontSee($document['customer']['name'])
            ->assertDontSee($order->whatsapp_number);

        $tamperedUrl = preg_replace(
            '/code=[^&]+/',
            'code=TAMPERED',
            $document['verification_url'],
        );

        $this->get($tamperedUrl)->assertForbidden();
    }

    public function test_private_artifact_is_content_addressed_verified_and_rendered_only_once(): void
    {
        [, $order] = $this->paidOrder();
        $service = app(InvoicePdfArtifactService::class);
        $first = $service->generateForBooking($order);
        $binary = Storage::disk('invoice-pdf')->get($first->path);

        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $first->cache_key);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $first->content_sha256);
        $this->assertSame($first->cache_key.'.pdf', basename($first->path));
        $this->assertStringNotContainsString($order->customer_name, $first->path);
        $this->assertStringStartsWith('%PDF-', $binary);
        $this->assertStringContainsString('%%EOF', substr($binary, -1_024));
        $this->assertSame(strlen($binary), $first->size_bytes);
        $this->assertSame(hash('sha256', $binary), $first->content_sha256);

        $second = $service->generateForBooking($order);

        $this->assertSame($first->id, $second->id);
        $this->assertDatabaseCount('invoice_pdf_artifacts', 1);
    }

    public function test_corrupt_artifact_is_rejected_and_regenerated_under_the_lock(): void
    {
        [, $order] = $this->paidOrder();
        $service = app(InvoicePdfArtifactService::class);
        $first = $service->generateForBooking($order);
        Storage::disk('invoice-pdf')->put($first->path, '%PDF-corrupt');

        $recovered = $service->generateForBooking($order);
        $binary = Storage::disk('invoice-pdf')->get($recovered->path);

        $this->assertSame($first->cache_key, $recovered->cache_key);
        $this->assertNotSame($first->id, $recovered->id);
        $this->assertStringStartsWith('%PDF-', $binary);
        $this->assertStringContainsString('%%EOF', substr($binary, -1_024));
        $this->assertSame(hash('sha256', $binary), $recovered->content_sha256);
        $this->assertDatabaseCount('invoice_pdf_artifacts', 1);
    }

    public function test_source_change_creates_a_new_immutable_artifact_version(): void
    {
        [, $order] = $this->paidOrder();
        $service = app(InvoicePdfArtifactService::class);
        $first = $service->generateForBooking($order);
        $order->update(['notes' => 'Catatan transaksi yang diperbarui.']);
        $second = $service->generateForBooking($order->fresh());

        $this->assertNotSame($first->cache_key, $second->cache_key);
        $this->assertNotSame($first->path, $second->path);
        Storage::disk('invoice-pdf')->assertExists($first->path);
        Storage::disk('invoice-pdf')->assertExists($second->path);
        $this->assertDatabaseCount('invoice_pdf_artifacts', 2);
    }

    public function test_production_style_cache_miss_returns_bounded_pending_response(): void
    {
        [$user, $order] = $this->paidOrder();
        config()->set('invoice_pdf.allow_synchronous_fallback', false);
        Queue::fake();

        $response = $this->actingAs($user)
            ->getJson(route('checkout.booking.invoice', $order));

        $response
            ->assertStatus(202)
            ->assertHeader('Retry-After')
            ->assertJsonPath('status', 'preparing');
        Queue::assertPushed(
            GenerateInvoicePdf::class,
            fn (GenerateInvoicePdf $job): bool => $job->kind === InvoicePdfArtifactService::KIND_BOOKING
                && $job->subjectId === $order->id,
        );
        $this->assertDatabaseCount('invoice_pdf_artifacts', 0);
    }

    public function test_successful_synchronous_fallback_does_not_enqueue_duplicate_work(): void
    {
        [$user, $order] = $this->paidOrder();
        config()->set('invoice_pdf.allow_synchronous_fallback', true);
        Queue::fake();

        $this->actingAs($user)
            ->get(route('checkout.booking.invoice', $order))
            ->assertOk();

        Queue::assertNothingPushed();
        $this->assertDatabaseCount('invoice_pdf_artifacts', 1);
    }

    public function test_deployment_doctor_accepts_the_safe_default_queue_timing(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('invoice_pdf.prewarm.connection', 'database');
        config()->set('invoice_pdf.prewarm.enabled', true);
        config()->set('invoice_pdf.allow_synchronous_fallback', false);
        config()->set('invoice_pdf.lock.store', 'database');
        config()->set('queue.connections.database.retry_after', 90);
        config()->set('invoice_pdf.prewarm.timeout_seconds', 60);
        config()->set('invoice_pdf.prewarm.visibility_timeout_seconds', 90);
        config()->set('invoice_pdf.lock.seconds', 75);

        $status = Artisan::call('invoices:pdf:doctor', ['--probe-storage' => true]);

        $this->assertSame(0, $status, Artisan::output());
    }

    public function test_deployment_doctor_rejects_a_queue_lease_shorter_than_the_lock(): void
    {
        config()->set('invoice_pdf.prewarm.connection', 'database');
        config()->set('queue.connections.database.retry_after', 70);
        config()->set('invoice_pdf.prewarm.timeout_seconds', 60);
        config()->set('invoice_pdf.prewarm.visibility_timeout_seconds', 70);
        config()->set('invoice_pdf.lock.seconds', 75);

        $this->artisan('invoices:pdf:doctor')
            ->assertFailed();
    }

    public function test_lifecycle_prunes_only_regenerable_artifact_and_preserves_source_data(): void
    {
        [, $order] = $this->paidOrder();
        $artifact = app(InvoicePdfArtifactService::class)->generateForBooking($order);
        $artifact->forceFill(['expires_at' => now()->subSecond()])->save();

        $this->assertSame(0, Artisan::call('invoices:pdf:lifecycle', ['--quiet' => true]));

        Storage::disk('invoice-pdf')->assertMissing($artifact->path);
        $this->assertDatabaseMissing('invoice_pdf_artifacts', ['id' => $artifact->id]);
        $this->assertDatabaseHas('booking_orders', ['id' => $order->id, 'status' => 'paid']);
        $this->assertDatabaseHas('transactions', [
            'transactionable_id' => $order->id,
            'payment_status' => 'PAID',
        ]);
    }

    public function test_lifecycle_archives_with_size_and_checksum_verification(): void
    {
        Storage::fake('invoice-pdf-archive');
        config()->set('invoice_pdf.archive_disk', 'invoice-pdf-archive');
        [, $order] = $this->paidOrder();
        $artifact = app(InvoicePdfArtifactService::class)->generateForBooking($order);
        $artifact->forceFill(['expires_at' => now()->subSecond()])->save();

        $this->assertSame(0, Artisan::call('invoices:pdf:lifecycle', ['--quiet' => true]));

        $artifact->refresh();
        $binary = Storage::disk('invoice-pdf-archive')->get($artifact->path);
        $this->assertSame(InvoicePdfArtifact::TIER_ARCHIVE, $artifact->storage_tier);
        $this->assertSame('invoice-pdf-archive', $artifact->disk);
        $this->assertNull($artifact->expires_at);
        $this->assertSame($artifact->size_bytes, strlen($binary));
        $this->assertSame($artifact->content_sha256, hash('sha256', $binary));
        Storage::disk('invoice-pdf')->assertMissing(str_replace('archive/', '', $artifact->path));
    }

    public function test_renderer_fails_closed_when_corrupt_source_exceeds_the_item_bound(): void
    {
        [, $order] = $this->paidOrder();
        $snapshot = $order->transaction->service_snapshot;
        $snapshot['items'] = array_fill(0, 33, ['facility_name' => 'bounded']);
        $order->transaction->update(['service_snapshot' => $snapshot]);
        $order->refresh()->load('transaction');

        try {
            app(InvoicePdfArtifactService::class)->generateForBooking($order);
            $this->fail('The renderer accepted an unbounded source payload.');
        } catch (InvoicePdfGenerationException $exception) {
            $this->assertSame('item_bound_exceeded', $exception->failureCode);
        }

        $this->assertDatabaseCount('invoice_pdf_artifacts', 0);
    }

    public function test_lifecycle_removes_only_stale_temporary_partitions(): void
    {
        config()->set('invoice_pdf.lifecycle.partial_retention_days', 2);
        $old = 'invoice-pdf/_tmp/'.now('UTC')->subDays(3)->format('Y-m-d').'/booking/old.part';
        $current = 'invoice-pdf/_tmp/'.now('UTC')->format('Y-m-d').'/booking/current.part';
        Storage::disk('invoice-pdf')->put($old, 'partial');
        Storage::disk('invoice-pdf')->put($current, 'active');

        $this->assertSame(0, Artisan::call('invoices:pdf:lifecycle', ['--quiet' => true]));

        Storage::disk('invoice-pdf')->assertMissing($old);
        Storage::disk('invoice-pdf')->assertExists($current);
    }

    /**
     * @return array{0: User, 1: BookingOrder}
     */
    private function paidOrder(
        bool $paid = true,
        int $subtotal = 100000,
        int $discount = 0,
        int $fee = 6000,
    ): array {
        $user = User::factory()->create();
        $category = FacilityCategory::create([
            'name' => 'Arena',
            'slug' => 'arena-'.uniqid(),
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Badminton',
            'slug' => 'badminton-'.uniqid(),
            'capacity' => 1,
            'location' => 'Veteran',
            'is_active' => true,
        ]);
        $total = $subtotal + $fee;
        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => 'Ilham Romadhon',
            'whatsapp_number' => '+628123456789',
            'identity_category' => 'warga_ub',
            'identity_number' => '225150700111001',
            'subtotal_amount' => $subtotal,
            'transaction_fee' => $fee,
            'discount_amount' => $discount,
            'total_amount' => $total,
            'status' => $paid ? 'paid' : 'pending_payment',
            'expires_at' => now()->addMinutes(30),
        ]);
        $booking = $order->bookings()->create([
            'user_id' => $user->id,
            'customer_name' => $order->customer_name,
            'facility_id' => $facility->id,
            'booking_date' => '2026-08-01',
            'start_time' => '19:00',
            'end_time' => '20:00',
            'pax' => 1,
            'subtotal_price' => $subtotal,
            'status' => $paid ? 'confirmed' : 'pending',
        ]);
        $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => $total,
            'payment_status' => $paid ? 'PAID' : 'UNPAID',
            'payment_method' => $paid ? 'qris' : null,
            'paid_at' => $paid ? now() : null,
            'checkout_url' => route('checkout.booking.show', $order),
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
                'items' => [[
                    'booking_id' => $booking->id,
                    'facility_id' => $facility->id,
                    'facility_name' => $facility->name,
                    'facility_unit_name' => null,
                    'category_name' => $category->name,
                    'location' => $facility->location,
                    'booking_date' => '2026-08-01',
                    'start_time' => '19:00',
                    'end_time' => '20:00',
                    'starts_at' => '2026-08-01T19:00:00+07:00',
                    'ends_at' => '2026-08-01T20:00:00+07:00',
                    'duration_minutes' => 60,
                    'subtotal' => $subtotal,
                ]],
            ],
        ]);

        return [$user, $order->load([
            'bookings.facility.category',
            'bookings.facilityUnit',
            'transaction',
        ])];
    }
}
