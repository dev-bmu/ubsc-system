<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Services\BookingInvoiceService;
use App\Services\MembershipInvoiceService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InvoiceController extends Controller
{
    public function __construct(
        private readonly BookingInvoiceService $invoiceService,
        private readonly MembershipInvoiceService $membershipInvoiceService,
    ) {}

    public function booking(
        Request $request,
        BookingOrder $bookingOrder,
    ): Response {
        abort_unless(
            $request->user() && $bookingOrder->user_id === $request->user()->id,
            403,
        );

        $bookingOrder->load([
            'bookings.facility.category',
            'bookings.facilityUnit',
            'transaction',
            'user',
        ]);

        abort_unless(
            $bookingOrder->status === 'paid'
                && $bookingOrder->transaction?->payment_status === 'PAID',
            409,
            'Invoice hanya tersedia setelah pembayaran selesai.',
        );

        $document = $this->invoiceService->document($bookingOrder);
        $filename = 'Invoice-'.$document['receipt'].'-UB-Sport-Center.pdf';
        $pdf = Pdf::loadView('public.invoices.booking', [
            'invoice' => $document,
        ])
            ->setPaper('a4', 'portrait')
            ->setOptions([
                'defaultFont' => 'DejaVu Sans',
                'dpi' => 144,
                'isHtml5ParserEnabled' => true,
                'isPhpEnabled' => false,
                'isRemoteEnabled' => false,
            ]);

        $response = $request->boolean('download')
            ? $pdf->download($filename)
            : $pdf->stream($filename);

        $response->headers->set(
            'Cache-Control',
            'private, no-store, max-age=0, must-revalidate',
        );
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
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

        $document = $this->invoiceService->document($bookingOrder);

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

        $membership->load(['plan', 'transaction', 'user']);

        abort_unless(
            $membership->transaction?->payment_status === 'PAID',
            409,
            'Invoice hanya tersedia setelah pembayaran selesai.',
        );

        $document = $this->membershipInvoiceService->document($membership);
        $filename = 'Invoice-'.$document['receipt'].'-Membership-UB-Sport-Center.pdf';
        $pdf = Pdf::loadView('public.invoices.booking', [
            'invoice' => $document,
        ])
            ->setPaper('a4', 'portrait')
            ->setOptions([
                'defaultFont' => 'DejaVu Sans',
                'dpi' => 144,
                'isHtml5ParserEnabled' => true,
                'isPhpEnabled' => false,
                'isRemoteEnabled' => false,
            ]);

        $response = $request->boolean('download')
            ? $pdf->download($filename)
            : $pdf->stream($filename);

        $response->headers->set(
            'Cache-Control',
            'private, no-store, max-age=0, must-revalidate',
        );
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
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

        $document = $this->membershipInvoiceService->document($membership);

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
}
