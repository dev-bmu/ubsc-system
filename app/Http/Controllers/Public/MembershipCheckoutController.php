<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\MembershipCheckoutPaymentRequest;
use App\Models\Membership;
use App\Services\MembershipCheckoutPayloadService;
use App\Services\MembershipRegistrationService;
use App\Services\Payments\PaymentRecoveryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

class MembershipCheckoutController extends Controller
{
    public function __construct(
        private readonly MembershipRegistrationService $registrations,
        private readonly MembershipCheckoutPayloadService $payloads,
        private readonly PaymentRecoveryService $paymentRecovery,
    ) {}

    public function show(
        Request $request,
        Membership $membership,
    ): Response {
        $this->authorizeOwner($request, $membership);
        $this->paymentRecovery->recoverForUser((int) $request->user()->id);
        $membership->refresh();

        return $this->checkoutResponse($request, $membership);
    }

    public function pay(
        MembershipCheckoutPaymentRequest $request,
        Membership $membership,
    ): RedirectResponse {
        abort_unless($this->payloads->mockPaymentEnabled(), 404);
        $this->authorizeOwner($request, $membership);
        $this->paymentRecovery->recoverForUser((int) $request->user()->id);
        $membership->refresh();

        $validated = $request->validated();
        $result = $this->registrations->pay(
            $membership,
            $request->user(),
            (string) $validated['payment_method'],
            (string) $validated['idempotency_key'],
            [
                'customer_name' => $validated['customer_name'],
                'whatsapp_number' => $validated['whatsapp_number'],
            ],
        );

        if ($result['expired']) {
            return $this->noStore(redirect()
                ->route('checkout.membership.show', $membership)
                ->withErrors([
                    'payment_method' => 'Waktu pembayaran berakhir atau paket sudah tidak aktif. Pilih kembali paket membership.',
                ]));
        }

        return $this->noStore(redirect()
            ->route('checkout.membership.success', $membership)
            ->with('success', 'Pembayaran berhasil dan membership telah diaktifkan.'));
    }

    public function success(
        Request $request,
        Membership $membership,
    ): Response|RedirectResponse {
        $this->authorizeOwner($request, $membership);
        $this->paymentRecovery->recoverForUser((int) $request->user()->id);
        $membership->refresh()->load('transaction');

        if ($membership->status !== 'active'
            || $membership->transaction?->payment_status !== 'PAID') {
            return $this->noStore(redirect()
                ->route('checkout.membership.show', $membership)
                ->with('error', 'Pembayaran membership belum selesai.'));
        }

        $payload = $this->payloads->payload($membership);
        $response = Inertia::render('Checkout/MembershipSuccessPage', [
            'membership' => $payload,
            'invoiceUrl' => route(
                'checkout.membership.invoice',
                $membership,
                absolute: false,
            ),
        ])->toResponse($request);

        return $this->noStore($response);
    }

    private function checkoutResponse(
        Request $request,
        Membership $membership,
    ): Response {
        $payload = $this->payloads->payload($membership);
        $response = Inertia::render('Checkout/MembershipCheckoutPage', [
            'membership' => $payload,
            'paymentMethods' => $this->payloads->paymentMethods(),
            'mockPayment' => $this->payloads->mockPaymentEnabled(),
            'serverNow' => now()->toIso8601String(),
            'paymentAction' => $payload['payment']['pay_url'],
            'pollUrl' => $payload['payment']['poll_url'],
            'successUrl' => $payload['payment']['success_url'],
            'invoiceUrl' => $payload['transaction']['invoice_url'] ?? null,
            'completed' => false,
        ])->toResponse($request);

        return $this->noStore($response);
    }

    private function authorizeOwner(
        Request $request,
        Membership $membership,
    ): void {
        abort_unless(
            $request->user()
                && $membership->user_id === $request->user()->id,
            403,
        );
    }

    /**
     * @template TResponse of Response
     *
     * @param  TResponse  $response
     * @return TResponse
     */
    private function noStore(Response $response): Response
    {
        $response->headers->set(
            'Cache-Control',
            'private, no-store, max-age=0, must-revalidate',
        );
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
    }
}
