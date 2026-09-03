<?php

namespace App\Http\Controllers\Public;

use App\Exceptions\InvoicePdfGenerationBusy;
use App\Exceptions\InvoicePdfGenerationException;
use App\Http\Controllers\Controller;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Services\BookingInvoiceService;
use App\Services\Invoices\InvoicePdfArtifactService;
use App\Services\Invoices\InvoicePdfPrewarmer;
use App\Services\Invoices\InvoicePdfResponseFactory;
use App\Services\MembershipInvoiceService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InvoiceController extends Controller
{
    public function __construct(
        private readonly BookingInvoiceService $invoiceService,
        private readonly MembershipInvoiceService $membershipInvoiceService,
        private readonly InvoicePdfArtifactService $artifacts,
        private readonly InvoicePdfResponseFactory $responses,
        private readonly InvoicePdfPrewarmer $prewarmer,
    ) {}

    public function booking(
        Request $request,
        BookingOrder $bookingOrder,
    ): Response {
        abort_unless(
            $request->user() && $bookingOrder->user_id === $request->user()->id,
            404,
        );

        $bookingOrder->load('transaction');

        abort_unless(
            $bookingOrder->status === 'paid'
                && $bookingOrder->transaction?->payment_status === 'PAID',
            409,
            'Invoice hanya tersedia setelah pembayaran selesai.',
        );

        $artifact = $this->artifacts->existingForBooking($bookingOrder);

        if ($artifact === null) {
            $artifact = $this->synchronousBookingFallback($bookingOrder);

            if ($artifact === null) {
                $this->prewarmer->dispatch(
                    InvoicePdfArtifactService::KIND_BOOKING,
                    (int) $bookingOrder->getKey(),
                );
            }
        }

        if ($artifact === null) {
            return $this->pending(
                request: $request,
                routeName: 'checkout.booking.invoice',
                routeParameter: ['bookingOrder' => $bookingOrder->getRouteKey()],
                subject: 'invoice reservasi',
            );
        }

        try {
            return $this->responses->make(
                artifact: $artifact,
                filename: 'Invoice-'.$bookingOrder->transaction->receipt_number.'-UB-Sport-Center.pdf',
                download: $request->boolean('download'),
            );
        } catch (InvoicePdfGenerationException $exception) {
            report($exception);
            $this->prewarmer->dispatch(
                InvoicePdfArtifactService::KIND_BOOKING,
                (int) $bookingOrder->getKey(),
            );

            return $this->pending(
                request: $request,
                routeName: 'checkout.booking.invoice',
                routeParameter: ['bookingOrder' => $bookingOrder->getRouteKey()],
                subject: 'invoice reservasi',
            );
        }
    }

    public function verify(
        Request $request,
        BookingOrder $bookingOrder,
    ): Response {
        $bookingOrder->load(['transaction']);

        abort_unless(
            $bookingOrder->status === 'paid'
                && $bookingOrder->transaction?->payment_status === 'PAID',
            404,
        );

        try {
            $document = $this->invoiceService->document(
                $bookingOrder,
                includeRenderAssets: false,
            );
        } catch (InvoicePdfGenerationException $exception) {
            report($exception);
            abort(404);
        }

        abort_unless(
            hash_equals(
                $document['document_code'],
                (string) $request->query('code'),
            ),
            404,
        );

        return response()
            ->view('public.invoices.verify', [
                'invoice' => $document,
            ])
            ->header(
                'Cache-Control',
                'private, no-store, max-age=0, must-revalidate',
            )
            ->header('X-Content-Type-Options', 'nosniff')
            ->header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    public function membership(
        Request $request,
        Membership $membership,
    ): Response {
        abort_unless(
            $request->user() && $membership->user_id === $request->user()->id,
            403,
        );

        $membership->load('transaction');

        abort_unless(
            $membership->transaction?->payment_status === 'PAID',
            409,
            'Invoice hanya tersedia setelah pembayaran selesai.',
        );

        $artifact = $this->artifacts->existingForMembership($membership);

        if ($artifact === null) {
            $artifact = $this->synchronousMembershipFallback($membership);

            if ($artifact === null) {
                $this->prewarmer->dispatch(
                    InvoicePdfArtifactService::KIND_MEMBERSHIP,
                    (int) $membership->getKey(),
                );
            }
        }

        if ($artifact === null) {
            return $this->pending(
                request: $request,
                routeName: 'checkout.membership.invoice',
                routeParameter: ['membership' => $membership->getRouteKey()],
                subject: 'invoice membership',
            );
        }

        try {
            return $this->responses->make(
                artifact: $artifact,
                filename: 'Invoice-'.$membership->transaction->receipt_number.'-Membership-UB-Sport-Center.pdf',
                download: $request->boolean('download'),
            );
        } catch (InvoicePdfGenerationException $exception) {
            report($exception);
            $this->prewarmer->dispatch(
                InvoicePdfArtifactService::KIND_MEMBERSHIP,
                (int) $membership->getKey(),
            );

            return $this->pending(
                request: $request,
                routeName: 'checkout.membership.invoice',
                routeParameter: ['membership' => $membership->getRouteKey()],
                subject: 'invoice membership',
            );
        }
    }

    public function verifyMembership(
        Request $request,
        Membership $membership,
    ): Response {
        $membership->load(['plan', 'transaction', 'user']);

        abort_unless(
            $membership->transaction?->payment_status === 'PAID',
            404,
        );

        try {
            $document = $this->membershipInvoiceService->document(
                $membership,
                includeRenderAssets: false,
            );
        } catch (InvoicePdfGenerationException $exception) {
            report($exception);
            abort(404);
        }

        abort_unless(
            hash_equals(
                $document['document_code'],
                (string) $request->query('code'),
            ),
            404,
        );

        return response()
            ->view('public.invoices.verify', [
                'invoice' => $document,
            ])
            ->header(
                'Cache-Control',
                'private, no-store, max-age=0, must-revalidate',
            )
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0')
            ->header('X-Content-Type-Options', 'nosniff')
            ->header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    private function synchronousBookingFallback(
        BookingOrder $order,
    ): ?\App\Models\InvoicePdfArtifact {
        if (! (bool) config('invoice_pdf.allow_synchronous_fallback')) {
            return null;
        }

        try {
            return $this->artifacts->generateForBooking($order);
        } catch (InvoicePdfGenerationBusy) {
            return null;
        } catch (InvoicePdfGenerationException $exception) {
            report($exception);

            return null;
        }
    }

    private function synchronousMembershipFallback(
        Membership $membership,
    ): ?\App\Models\InvoicePdfArtifact {
        if (! (bool) config('invoice_pdf.allow_synchronous_fallback')) {
            return null;
        }

        try {
            return $this->artifacts->generateForMembership($membership);
        } catch (InvoicePdfGenerationBusy) {
            return null;
        } catch (InvoicePdfGenerationException $exception) {
            report($exception);

            return null;
        }
    }

    /** @param array<string, int|string> $routeParameter */
    private function pending(
        Request $request,
        string $routeName,
        array $routeParameter,
        string $subject,
    ): Response {
        $attempt = min(
            max(0, $request->integer('wait_attempt')),
            (int) config('invoice_pdf.pending.max_automatic_attempts', 10),
        );
        $maximum = (int) config('invoice_pdf.pending.max_automatic_attempts', 10);
        $retryAfter = (int) config('invoice_pdf.pending.retry_after_seconds', 2);
        $automatic = $attempt < $maximum;
        $query = [
            ...$routeParameter,
            'wait_attempt' => $attempt + 1,
        ];

        if ($request->boolean('download')) {
            $query['download'] = 1;
        }

        $retryUrl = route($routeName, $query);

        if ($request->expectsJson()) {
            return response()->json([
                'status' => 'preparing',
                'retry_after_seconds' => $retryAfter,
                'retry_url' => $retryUrl,
            ], 202, [
                'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                'Retry-After' => (string) $retryAfter,
            ]);
        }

        return response()
            ->view('public.invoices.pending', [
                'subject' => $subject,
                'retryUrl' => $retryUrl,
                'retryAfter' => $retryAfter,
                'automatic' => $automatic,
            ], 202)
            ->header('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0')
            ->header('Retry-After', (string) $retryAfter)
            ->header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
}
