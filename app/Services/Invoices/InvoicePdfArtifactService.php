<?php

namespace App\Services\Invoices;

use App\Exceptions\InvoicePdfGenerationBusy;
use App\Exceptions\InvoicePdfGenerationException;
use App\Models\BookingOrder;
use App\Models\InvoicePdfArtifact;
use App\Models\Membership;
use App\Services\BookingInvoiceService;
use App\Services\MembershipInvoiceService;
use Barryvdh\DomPDF\Facade\Pdf;
use Closure;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use JsonException;
use Throwable;

class InvoicePdfArtifactService
{
    public const KIND_BOOKING = 'booking';

    public const KIND_MEMBERSHIP = 'membership';

    public function __construct(
        private readonly BookingInvoiceService $bookingDocuments,
        private readonly MembershipInvoiceService $membershipDocuments,
        private readonly InvoicePdfTelemetry $telemetry,
    ) {}

    public function existingForBooking(BookingOrder $order): ?InvoicePdfArtifact
    {
        $this->loadBooking($order);

        return $this->existing($this->bookingCacheKey($order));
    }

    public function existingForMembership(Membership $membership): ?InvoicePdfArtifact
    {
        $this->loadMembership($membership);

        return $this->existing($this->membershipCacheKey($membership));
    }

    public function generateForBooking(BookingOrder $order): InvoicePdfArtifact
    {
        $this->loadBooking($order);
        $cacheKey = $this->bookingCacheKey($order);

        return $this->generate(
            kind: self::KIND_BOOKING,
            subjectId: (int) $order->getKey(),
            cacheKey: $cacheKey,
            document: fn (): array => $this->bookingDocuments->document($order),
        );
    }

    public function generateForMembership(Membership $membership): InvoicePdfArtifact
    {
        $this->loadMembership($membership);
        $cacheKey = $this->membershipCacheKey($membership);

        return $this->generate(
            kind: self::KIND_MEMBERSHIP,
            subjectId: (int) $membership->getKey(),
            cacheKey: $cacheKey,
            document: fn (): array => $this->membershipDocuments->document($membership),
        );
    }

    public function bookingCacheKey(BookingOrder $order): string
    {
        $this->assertBookingBounded($order);
        $transaction = $order->transaction;

        return $this->fingerprint([
            'kind' => self::KIND_BOOKING,
            'subject' => [
                'id' => $order->getKey(),
                'updated_at' => $this->timestamp($order),
                'status' => $order->status,
                'customer_name' => $order->customer_name,
                'whatsapp_number' => $order->whatsapp_number,
                'identity_category' => $order->identity_category,
                'identity_number' => $order->identity_number,
                'subtotal_amount' => $order->subtotal_amount,
                'transaction_fee' => $order->transaction_fee,
                'discount_amount' => $order->discount_amount,
                'total_amount' => $order->total_amount,
                'notes' => $order->notes,
                'expires_at' => $order->expires_at?->toISOString(),
            ],
            'transaction' => $this->transactionFingerprint($transaction),
            'items' => $order->bookings
                ->sortBy('id')
                ->map(static fn ($booking): array => [
                    'id' => $booking->getKey(),
                    'updated_at' => $booking->updated_at?->toISOString(),
                    'facility_id' => $booking->facility_id,
                    'facility_unit_id' => $booking->facility_unit_id,
                    'booking_date' => $booking->booking_date?->toDateString(),
                    'start_time' => $booking->start_time,
                    'end_time' => $booking->end_time,
                    'subtotal_price' => $booking->subtotal_price,
                    'status' => $booking->status,
                    'facility' => [
                        'updated_at' => $booking->facility?->updated_at?->toISOString(),
                        'name' => $booking->facility?->name,
                        'location' => $booking->facility?->location,
                        'category_updated_at' => $booking->facility?->category?->updated_at?->toISOString(),
                        'category_name' => $booking->facility?->category?->name,
                    ],
                    'unit' => [
                        'updated_at' => $booking->facilityUnit?->updated_at?->toISOString(),
                        'name' => $booking->facilityUnit?->name,
                    ],
                ])
                ->values()
                ->all(),
        ]);
    }

    public function membershipCacheKey(Membership $membership): string
    {
        $transaction = $membership->transaction;

        return $this->fingerprint([
            'kind' => self::KIND_MEMBERSHIP,
            'subject' => [
                'id' => $membership->getKey(),
                'updated_at' => $this->timestamp($membership),
                'plan_id' => $membership->membership_plan_id,
                'customer_name' => $membership->customer_name,
                'start_date' => $membership->start_date?->toDateString(),
                'end_date' => $membership->end_date?->toDateString(),
                'status' => $membership->status,
                'registration_email' => $membership->registration_email,
                'registration_phone' => $membership->registration_phone,
                'registration_category' => $membership->registration_category,
                'registration_expires_at' => $membership->registration_expires_at?->toISOString(),
            ],
            'transaction' => $this->transactionFingerprint($transaction),
            'plan' => [
                'updated_at' => $membership->plan?->updated_at?->toISOString(),
                'name' => $membership->plan?->name,
                'tier' => $membership->plan?->tier,
                'price' => $membership->plan?->price,
                'compare_at_price' => $membership->plan?->compare_at_price,
                'duration_months' => $membership->plan?->duration_months,
            ],
            'user' => [
                'updated_at' => $membership->user?->updated_at?->toISOString(),
                'email' => $membership->user?->email,
            ],
        ]);
    }

    private function loadBooking(BookingOrder $order): void
    {
        $limit = $this->maxItems() + 1;

        $order->loadMissing([
            'bookings' => static fn ($query) => $query
                ->select([
                    'id', 'booking_order_id', 'facility_id', 'facility_unit_id',
                    'booking_date', 'start_time', 'end_time', 'subtotal_price',
                    'status', 'created_at', 'updated_at',
                ])
                ->orderBy('id')
                ->limit($limit),
            'bookings.facility:id,facility_category_id,name,location,updated_at',
            'bookings.facility.category:id,name,updated_at',
            'bookings.facilityUnit:id,name,updated_at',
            'transaction:id,transactionable_id,transactionable_type,user_id,amount,payment_status,payment_method,xendit_invoice_id,service_snapshot,paid_at,created_at,updated_at',
        ]);

        $this->assertBookingBounded($order);
    }

    private function loadMembership(Membership $membership): void
    {
        $membership->loadMissing([
            'plan:id,name,tier,price,compare_at_price,duration_months,updated_at',
            'transaction:id,transactionable_id,transactionable_type,user_id,amount,payment_status,payment_method,xendit_invoice_id,service_snapshot,paid_at,created_at,updated_at',
            'user:id,email,updated_at',
        ]);
    }

    private function assertBookingBounded(BookingOrder $order): void
    {
        $snapshotItems = data_get($order->transaction?->service_snapshot, 'items', []);
        $snapshotCount = is_array($snapshotItems) ? count($snapshotItems) : 0;

        if ($order->bookings->count() > $this->maxItems()
            || $snapshotCount > $this->maxItems()) {
            throw new InvoicePdfGenerationException(
                'Invoice item count exceeds the renderer safety bound.',
                'item_bound_exceeded',
            );
        }
    }

    private function maxItems(): int
    {
        return max(8, (int) config('invoice_pdf.bounds.max_document_items', 32));
    }

    /**
     * @param  Closure(): array<string, mixed>  $document
     */
    private function generate(
        string $kind,
        int $subjectId,
        string $cacheKey,
        Closure $document,
    ): InvoicePdfArtifact {
        $existing = $this->existing($cacheKey);

        if ($existing !== null) {
            return $existing;
        }

        $lockStore = config('invoice_pdf.lock.store');
        $cache = is_string($lockStore) && $lockStore !== ''
            ? Cache::store($lockStore)
            : Cache::store();
        $lock = $cache->lock(
            'invoice-pdf:'.$cacheKey,
            max(30, (int) config('invoice_pdf.lock.seconds', 180)),
        );

        try {
            return $lock->block(
                max(1, (int) config('invoice_pdf.lock.wait_seconds', 20)),
                function () use ($kind, $subjectId, $cacheKey, $document): InvoicePdfArtifact {
                    $existing = $this->existing($cacheKey, verifyChecksum: true);

                    if ($existing !== null) {
                        return $existing;
                    }

                    $this->removeStaleManifest($cacheKey);

                    return $this->renderAndPersist(
                        kind: $kind,
                        subjectId: $subjectId,
                        cacheKey: $cacheKey,
                        document: $document,
                    );
                },
            );
        } catch (LockTimeoutException $exception) {
            throw new InvoicePdfGenerationBusy(
                'Invoice generation is already in progress.',
                previous: $exception,
            );
        } catch (InvoicePdfGenerationException $exception) {
            $this->telemetry->failed($kind, $exception->failureCode);

            throw $exception;
        } catch (Throwable $exception) {
            $this->telemetry->failed($kind, 'unhandled_generation_failure');

            throw new InvoicePdfGenerationException(
                'Invoice PDF could not be generated.',
                'unhandled_generation_failure',
                $exception,
            );
        }
    }

    /**
     * @param  Closure(): array<string, mixed>  $document
     */
    private function renderAndPersist(
        string $kind,
        int $subjectId,
        string $cacheKey,
        Closure $document,
    ): InvoicePdfArtifact {
        $startedAt = hrtime(true);
        $invoice = $document();
        $pdf = Pdf::loadView('public.invoices.booking', ['invoice' => $invoice])
            ->setPaper(
                (string) config('invoice_pdf.render.paper', 'a4'),
                (string) config('invoice_pdf.render.orientation', 'portrait'),
            )
            ->setOptions(
                (array) config('invoice_pdf.render.options', []),
                mergeWithDefaults: true,
            );
        $binary = $pdf->output();
        unset($pdf, $invoice);

        $size = strlen($binary);
        $minimum = max(256, (int) config('invoice_pdf.bounds.min_output_bytes', 1_024));
        $maximum = max(1_048_576, (int) config('invoice_pdf.bounds.max_output_bytes', 8_388_608));

        if ($size < $minimum
            || $size > $maximum
            || ! str_starts_with($binary, '%PDF-')
            || ! str_contains(substr($binary, -1_024), '%%EOF')) {
            unset($binary);

            throw new InvoicePdfGenerationException(
                'Rendered invoice failed its output contract.',
                'invalid_pdf_output',
            );
        }

        $sha256 = hash('sha256', $binary);
        $diskName = $this->hotDisk();
        $disk = Storage::disk($diskName);
        $path = $this->artifactPath($kind, $cacheKey);
        $temporaryPath = $this->temporaryArtifactPath($kind, $cacheKey);
        $stream = tmpfile();

        if (! is_resource($stream)) {
            unset($binary);

            throw new InvoicePdfGenerationException(
                'A temporary invoice stream could not be created.',
                'temporary_stream_failed',
            );
        }

        $finalized = false;

        try {
            $this->writeFully($stream, $binary);

            unset($binary);
            rewind($stream);

            if (! $disk->put($temporaryPath, $stream, ['visibility' => 'private'])) {
                throw new InvoicePdfGenerationException(
                    'The invoice artifact could not be written.',
                    'artifact_write_failed',
                );
            }

            if ($disk->exists($path) && ! $disk->delete($path)) {
                throw new InvoicePdfGenerationException(
                    'A stale invoice artifact could not be replaced.',
                    'artifact_replace_failed',
                );
            }

            if (! $disk->move($temporaryPath, $path)) {
                throw new InvoicePdfGenerationException(
                    'The invoice artifact could not be finalized.',
                    'artifact_finalize_failed',
                );
            }

            $finalized = true;

            if ((int) $disk->size($path) !== $size
                || ! $this->checksumMatchesPath($disk, $path, $sha256)) {
                throw new InvoicePdfGenerationException(
                    'The finalized invoice artifact failed verification.',
                    'artifact_verification_failed',
                );
            }
        } catch (Throwable $exception) {
            if ($finalized) {
                try {
                    $disk->delete($path);
                } catch (Throwable) {
                    // The deterministic object is rejected because no
                    // manifest will reference it. Lifecycle handles debris.
                }
            }

            throw $exception;
        } finally {
            fclose($stream);

            try {
                if ($disk->exists($temporaryPath)) {
                    $disk->delete($temporaryPath);
                }
            } catch (Throwable) {
                // The lifecycle command also removes unreferenced partials.
            }
        }

        $durationMs = max(0, (int) round((hrtime(true) - $startedAt) / 1_000_000));
        $generatedAt = now();
        try {
            $artifact = InvoicePdfArtifact::query()->updateOrCreate(
                ['cache_key' => $cacheKey],
                [
                    'kind' => $kind,
                    'subject_id' => $subjectId,
                    'template_version' => $this->templateVersion(),
                    'storage_tier' => InvoicePdfArtifact::TIER_HOT,
                    'disk' => $diskName,
                    'path' => $path,
                    'content_sha256' => $sha256,
                    'size_bytes' => $size,
                    'render_duration_ms' => $durationMs,
                    'generated_at' => $generatedAt,
                    'last_verified_at' => $generatedAt,
                    'expires_at' => $generatedAt->copy()->addDays(
                        max(1, (int) config('invoice_pdf.lifecycle.hot_retention_days', 90)),
                    ),
                ],
            );
        } catch (Throwable $exception) {
            try {
                $disk->delete($path);
            } catch (Throwable) {
                // An unreferenced deterministic object is safe to overwrite
                // on retry and can also be removed by storage lifecycle.
            }

            throw $exception;
        }

        $this->telemetry->generated(
            kind: $kind,
            durationMs: $durationMs,
            sizeBytes: $size,
            templateVersion: $this->templateVersion(),
        );

        return $artifact;
    }

    private function existing(
        string $cacheKey,
        bool $verifyChecksum = false,
    ): ?InvoicePdfArtifact {
        $artifact = InvoicePdfArtifact::query()
            ->where('cache_key', $cacheKey)
            ->first();

        if ($artifact === null) {
            return null;
        }

        try {
            $disk = Storage::disk($artifact->disk);

            if (! $disk->exists($artifact->path)
                || (int) $disk->size($artifact->path) !== $artifact->size_bytes) {
                return null;
            }

            $verificationCutoff = now()->subHours(
                max(1, (int) config('invoice_pdf.lifecycle.verification_hours', 168)),
            );
            $verificationDue = $artifact->last_verified_at === null
                || $artifact->last_verified_at->lte($verificationCutoff);

            if (($verifyChecksum || $verificationDue)
                && ! $this->checksumMatches($disk, $artifact)) {
                return null;
            }

            if ($verifyChecksum || $verificationDue) {
                $artifact->forceFill(['last_verified_at' => now()])->save();
            }

            return $artifact;
        } catch (Throwable) {
            return null;
        }
    }

    private function checksumMatches(
        FilesystemAdapter $disk,
        InvoicePdfArtifact $artifact,
    ): bool {
        return $this->checksumMatchesPath(
            $disk,
            $artifact->path,
            $artifact->content_sha256,
        );
    }

    private function checksumMatchesPath(
        FilesystemAdapter $disk,
        string $path,
        string $expected,
    ): bool {
        $stream = $disk->readStream($path);

        if (! is_resource($stream)) {
            return false;
        }

        try {
            $hash = hash_init('sha256');
            hash_update_stream($hash, $stream);

            return hash_equals($expected, hash_final($hash));
        } finally {
            fclose($stream);
        }
    }

    /** @param resource $stream */
    private function writeFully($stream, string $binary): void
    {
        $size = strlen($binary);
        $offset = 0;

        while ($offset < $size) {
            $written = fwrite($stream, substr($binary, $offset, 65_536));

            if ($written === false || $written === 0) {
                throw new InvoicePdfGenerationException(
                    'The invoice could not be copied into its storage stream.',
                    'temporary_stream_write_failed',
                );
            }

            $offset += $written;
        }
    }

    private function removeStaleManifest(string $cacheKey): void
    {
        $artifact = InvoicePdfArtifact::query()
            ->where('cache_key', $cacheKey)
            ->first();

        if ($artifact === null) {
            return;
        }

        try {
            Storage::disk($artifact->disk)->delete($artifact->path);
        } catch (Throwable) {
            // The deterministic final path will be replaced under the lock.
        }

        $artifact->delete();
    }

    /** @param array<string, mixed> $source */
    private function fingerprint(array $source): string
    {
        try {
            $encoded = json_encode([
                'template_version' => $this->templateVersion(),
                'application_origin' => rtrim((string) config('app.url'), '/'),
                'source' => $source,
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (JsonException $exception) {
            throw new InvoicePdfGenerationException(
                'Invoice source data could not be fingerprinted.',
                'source_fingerprint_failed',
                $exception,
            );
        }

        return hash('sha256', $encoded);
    }

    /** @return array<string, mixed>|null */
    private function transactionFingerprint(?Model $transaction): ?array
    {
        if ($transaction === null) {
            return null;
        }

        return [
            'id' => $transaction->getKey(),
            'updated_at' => $this->timestamp($transaction),
            'amount' => $transaction->getAttribute('amount'),
            'payment_status' => $transaction->getAttribute('payment_status'),
            'payment_method' => $transaction->getAttribute('payment_method'),
            'gateway_reference' => $transaction->getAttribute('xendit_invoice_id'),
            'paid_at' => $transaction->getAttribute('paid_at')?->toISOString(),
            'service_snapshot_hash' => hash('sha256', json_encode(
                $transaction->getAttribute('service_snapshot'),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            ) ?: 'null'),
        ];
    }

    private function timestamp(Model $model): ?string
    {
        return $model->getAttribute('updated_at')?->toISOString();
    }

    private function hotDisk(): string
    {
        $disk = trim((string) config('invoice_pdf.disk', 'local'));

        if ($disk === '' || config('filesystems.disks.'.$disk) === null) {
            throw new InvoicePdfGenerationException(
                'Invoice PDF storage disk is not configured.',
                'storage_disk_unconfigured',
            );
        }

        return $disk;
    }

    private function templateVersion(): string
    {
        $version = trim((string) config('invoice_pdf.template_version'));

        if (preg_match('/^[a-zA-Z0-9._-]{1,64}$/', $version) !== 1) {
            throw new InvoicePdfGenerationException(
                'Invoice PDF template version is invalid.',
                'template_version_invalid',
            );
        }

        return $version;
    }

    private function artifactPath(string $kind, string $cacheKey): string
    {
        $prefix = trim((string) config('invoice_pdf.prefix', 'invoice-pdf'), '/');
        $prefix = preg_replace('/[^a-zA-Z0-9._\/-]/', '-', $prefix) ?: 'invoice-pdf';

        return implode('/', [
            $prefix,
            $this->templateVersion(),
            $kind,
            substr($cacheKey, 0, 2),
            substr($cacheKey, 2, 2),
            $cacheKey.'.pdf',
        ]);
    }

    private function temporaryArtifactPath(string $kind, string $cacheKey): string
    {
        $prefix = trim((string) config('invoice_pdf.prefix', 'invoice-pdf'), '/');
        $prefix = preg_replace('/[^a-zA-Z0-9._\/-]/', '-', $prefix) ?: 'invoice-pdf';

        return implode('/', [
            $prefix,
            '_tmp',
            now('UTC')->format('Y-m-d'),
            $kind,
            $cacheKey.'-'.Str::lower((string) Str::ulid()).'.part',
        ]);
    }
}
