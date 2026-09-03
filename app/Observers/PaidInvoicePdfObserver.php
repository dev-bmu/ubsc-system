<?php

namespace App\Observers;

use App\Models\Transaction;
use App\Services\Invoices\InvoicePdfPrewarmer;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

class PaidInvoicePdfObserver implements ShouldHandleEventsAfterCommit
{
    public function __construct(
        private readonly InvoicePdfPrewarmer $prewarmer,
    ) {}

    public function saved(Transaction $transaction): void
    {
        if ($transaction->payment_status !== 'PAID'
            || (! $transaction->wasRecentlyCreated
                && ! $transaction->wasChanged('payment_status'))) {
            return;
        }

        $this->prewarmer->dispatchTransaction($transaction);
    }
}
