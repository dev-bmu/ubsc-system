<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\PublicMembershipPaymentRequest;
use App\Http\Requests\PublicMembershipRegistrationRequest;
use App\Models\Membership;
use App\Services\MembershipCheckoutPayloadService;
use App\Services\MembershipRegistrationService;
use App\Services\Payments\PaymentRecoveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicMembershipController extends Controller
{
    public function __construct(
        private readonly MembershipRegistrationService $registrations,
        private readonly PaymentRecoveryService $paymentRecovery,
        private readonly MembershipCheckoutPayloadService $payloads,
    ) {}

    public function store(
        PublicMembershipRegistrationRequest $request,
    ): JsonResponse {
        $result = $this->registrations->register(
            $request->user(),
            $request->validated(),
        );

        return $this->noStore(response()->json([
            'message' => $result['replayed']
                ? 'Pendaftaran yang sama telah diproses sebelumnya.'
                : 'Pendaftaran membership berhasil dibuat.',
            'data' => $this->payloads->payload(
                $result['membership'],
                $result['replayed'],
            ),
        ], $result['replayed'] ? 200 : 201));
    }

    public function show(Request $request, Membership $membership): JsonResponse
    {
        $this->authorizeOwner($request, $membership);
        $this->paymentRecovery->recoverForUser((int) $request->user()->id);
        $membership->refresh();

        return $this->noStore(response()->json([
            'data' => $this->payloads->payload($membership),
        ]));
    }

    public function pay(
        PublicMembershipPaymentRequest $request,
        Membership $membership,
    ): JsonResponse {
        abort_unless($this->payloads->mockPaymentEnabled(), 404);
        $this->authorizeOwner($request, $membership);
        $this->paymentRecovery->recoverForUser((int) $request->user()->id);
        $membership->refresh();

        $result = $this->registrations->pay(
            $membership,
            $request->user(),
            $request->validated('payment_method'),
            $request->validated('idempotency_key'),
        );

        if ($result['expired']) {
            return $this->noStore(response()->json([
                'message' => 'Waktu pembayaran berakhir atau paket sudah tidak aktif. Pilih kembali paket membership.',
                'errors' => [
                    'payment_method' => [
                        'Waktu pembayaran berakhir atau paket sudah tidak aktif. Pilih kembali paket membership.',
                    ],
                ],
                'data' => $this->payloads->payload($result['membership']),
            ], 422));
        }

        return $this->noStore(response()->json([
            'message' => 'Pembayaran berhasil dan membership telah diaktifkan.',
            'data' => $this->payloads->payload($result['membership']),
        ]));
    }

    private function authorizeOwner(Request $request, Membership $membership): void
    {
        abort_unless(
            $request->user() && $membership->user_id === $request->user()->id,
            403,
        );
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        $response->headers->set(
            'Cache-Control',
            'private, no-store, max-age=0, must-revalidate',
        );
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');

        return $response;
    }
}
