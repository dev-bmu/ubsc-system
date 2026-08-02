<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Services\Payments\PaymentRecoveryService;
use App\Services\UserPurchaseHistoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserMembershipController extends Controller
{
    public function __construct(
        private readonly PaymentRecoveryService $paymentRecovery,
        private readonly UserPurchaseHistoryService $history,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $userId = (int) $request->user()->id;
        $today = now()->toDateString();

        $this->paymentRecovery->recoverForUser($userId);

        $baseQuery = fn () => Membership::query()
            ->with(['plan.media', 'transaction'])
            ->where('user_id', $userId)
            ->whereHas(
                'transaction',
                fn ($query) => $query->where('payment_status', 'PAID'),
            );

        $current = $baseQuery()
            ->where('status', 'active')
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->orderByDesc('end_date')
            ->orderByDesc('id')
            ->first();

        $scheduled = $baseQuery()
            ->where('status', 'active')
            ->whereDate('start_date', '>', $today)
            ->orderBy('start_date')
            ->orderBy('id')
            ->first();

        $latest = $baseQuery()
            ->orderByDesc('end_date')
            ->orderByDesc('id')
            ->first();

        $currentPayload = $current
            ? $this->history->membership($current)
            : null;
        $scheduledPayload = $scheduled
            ? $this->history->membership($scheduled)
            : null;
        $latestPayload = $latest
            ? $this->history->membership($latest)
            : null;

        $nextTransition = collect([
            $currentPayload['next_transition_at'] ?? null,
            $scheduledPayload['next_transition_at'] ?? null,
        ])->filter()->sort()->first();

        return $this->noStore(response()->json([
            'current' => $currentPayload,
            'scheduled' => $scheduledPayload,
            'latest' => $latestPayload,
            'meta' => [
                'server_now' => now()->toIso8601String(),
                'next_transition_at' => $nextTransition,
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
