<?php

namespace App\Jobs;

use App\Models\BookingOrder;
use App\Models\Membership;
use App\Services\Invoices\InvoicePdfArtifactService;
use App\Services\Invoices\InvoicePdfTelemetry;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class GenerateInvoicePdf implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    public bool $failOnTimeout = true;

    public int $uniqueFor = 600;

    public function __construct(
        public readonly string $kind,
        public readonly int $subjectId,
    ) {
        $this->timeout = min(300, max(
            15,
            (int) config('invoice_pdf.prewarm.timeout_seconds', 60),
        ));
        $this->onQueue((string) config(
            'invoice_pdf.prewarm.queue',
            config('background_jobs.queues.documents', 'documents'),
        ));

        $connection = config('invoice_pdf.prewarm.connection');

        $this->onConnection(is_string($connection) && $connection !== ''
            ? $connection
            : (string) config('background_jobs.connection', 'database'));
        $this->afterCommit();
    }

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [5, 30, 120];
    }

    public function uniqueId(): string
    {
        return implode(':', [
            $this->kind,
            $this->subjectId,
            (string) config('invoice_pdf.template_version'),
        ]);
    }

    public function handle(InvoicePdfArtifactService $artifacts): void
    {
        if ($this->kind === InvoicePdfArtifactService::KIND_BOOKING) {
            $order = BookingOrder::query()->find($this->subjectId);

            if ($order === null) {
                return;
            }

            $order->loadMissing('transaction');

            if ($order->status !== 'paid'
                || $order->transaction?->payment_status !== 'PAID') {
                return;
            }

            $artifacts->generateForBooking($order);

            return;
        }

        if ($this->kind === InvoicePdfArtifactService::KIND_MEMBERSHIP) {
            $membership = Membership::query()->find($this->subjectId);

            if ($membership === null) {
                return;
            }

            $membership->loadMissing('transaction');

            if ($membership->transaction?->payment_status !== 'PAID') {
                return;
            }

            $artifacts->generateForMembership($membership);
        }
    }

    public function failed(?Throwable $exception): void
    {
        app(InvoicePdfTelemetry::class)->failed($this->kind, 'job_exhausted');
    }
}
