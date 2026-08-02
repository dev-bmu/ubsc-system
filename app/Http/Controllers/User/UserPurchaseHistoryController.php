<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Models\Transaction;
use App\Services\Payments\PaymentRecoveryService;
use App\Services\UserPurchaseHistoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserPurchaseHistoryController extends Controller
{
    public function __construct(
        private readonly PaymentRecoveryService $paymentRecovery,
        private readonly UserPurchaseHistoryService $history,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $userId = (int) $request->user()->id;
        $perPage = max(5, min(30, $request->integer('per_page', 12)));

        $this->paymentRecovery->recoverForUser($userId);

        $summaryQuery = Transaction::query()->where('user_id', $userId);
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'paid_count' => (clone $summaryQuery)
                ->where('payment_status', 'PAID')
                ->count(),
            'paid_total' => (int) (clone $summaryQuery)
                ->where('payment_status', 'PAID')
                ->sum('amount'),
            'awaiting_payment' => (clone $summaryQuery)
                ->where('payment_status', 'UNPAID')
                ->count(),
        ];

        $transactions = Transaction::query()
            ->where('user_id', $userId)
            ->orderByDesc('id')
            ->cursorPaginate($perPage);

        $transactions->getCollection()->loadMorph('transactionable', [
            BookingOrder::class => [
                'bookings.facility.category',
                'bookings.facility.media',
                'bookings.facilityUnit',
                'bookings.facilityUnit.media',
            ],
            Booking::class => [
                'facility.category',
                'facility.media',
                'facilityUnit',
                'facilityUnit.media',
                'bookingOrder',
            ],
            Membership::class => [
                'plan',
                'plan.media',
                'transaction',
            ],
        ]);

        $transactions->setCollection(
            $transactions->getCollection()
                ->map(fn (Transaction $transaction) => $this->history
                    ->transaction($transaction)),
        );

        return $this->noStore(response()->json([
            'data' => $transactions->items(),
            'meta' => [
                ...$summary,
                'per_page' => $perPage,
                'has_more' => $transactions->hasMorePages(),
                'next_cursor' => $transactions->nextCursor()?->encode(),
                'server_now' => now()->toIso8601String(),
            ],
        ]));
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
