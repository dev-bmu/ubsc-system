<?php

namespace App\Services\Invoices;

use App\Jobs\GenerateInvoicePdf;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Relations\Relation;

class InvoicePdfPrewarmer
{
    public function dispatchTransaction(Transaction $transaction): void
    {
        if (! (bool) config('invoice_pdf.prewarm.enabled')) {
            return;
        }

        $type = Relation::getMorphedModel((string) $transaction->transactionable_type)
            ?? $transaction->transactionable_type;
        $kind = match ($type) {
            BookingOrder::class => InvoicePdfArtifactService::KIND_BOOKING,
            Membership::class => InvoicePdfArtifactService::KIND_MEMBERSHIP,
            default => null,
        };

        if ($kind === null || ! $transaction->transactionable_id) {
            return;
        }

        $this->dispatch($kind, (int) $transaction->transactionable_id);
    }

    public function dispatch(string $kind, int $subjectId): void
    {
        if (! in_array($kind, [
            InvoicePdfArtifactService::KIND_BOOKING,
            InvoicePdfArtifactService::KIND_MEMBERSHIP,
        ], true) || $subjectId < 1) {
            return;
        }

        GenerateInvoicePdf::dispatch($kind, $subjectId);
    }
}
