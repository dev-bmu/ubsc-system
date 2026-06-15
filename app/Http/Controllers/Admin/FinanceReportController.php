<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Membership;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class FinanceReportController extends Controller
{
    private const MONTH_NAMES = [
        1  => 'Januari', 2 => 'Februari', 3 => 'Maret',
        4  => 'April', 5 => 'Mei', 6 => 'Juni',
        7  => 'Juli', 8 => 'Agustus', 9 => 'September',
        10 => 'Oktober', 11 => 'November', 12 => 'Desember',
    ];

    private const BREAKDOWN_COLORS = ['#E35336', '#0EA5E9', '#10B981', '#A855F7', '#F59E0B', '#64748B'];

    public function index(): Response
    {
        $this->authorize('view-reports');

        $month = $this->validMonth((int) request('month', now()->month));
        $year = $this->validYear((int) request('year', now()->year));

        return Inertia::render('Admin/Finance/Index', [
            ...$this->buildStats($month, $year),
            'period' => ['month' => $month, 'year' => $year],
        ]);
    }

    private function buildStats(int $month, int $year): array
    {
        $paidTransactions = $this->transactionsForPeriod($month, $year)
            ->where('payment_status', 'PAID')
            ->get();

        $allPeriodTransactions = $this->transactionsForPeriod($month, $year)
            ->with(['user', 'transactionable'])
            ->orderByRaw("COALESCE(paid_at, created_at) DESC")
            ->get();

        $this->loadTransactionSubjects($allPeriodTransactions);

        $totalRevenue = (int) $paidTransactions->sum('amount');
        $bookingRevenue = (int) $paidTransactions
            ->where('transactionable_type', Booking::class)
            ->sum('amount');
        $membershipRevenue = (int) $paidTransactions
            ->where('transactionable_type', Membership::class)
            ->sum('amount');
        $pendingFailedAmount = (int) $allPeriodTransactions
            ->whereIn('payment_status', ['UNPAID', 'FAILED', 'EXPIRED'])
            ->sum('amount');

        $prevMonth = $month === 1 ? 12 : $month - 1;
        $prevYear = $month === 1 ? $year - 1 : $year;
        $lastMonthRevenue = (int) $this->transactionsForPeriod($prevMonth, $prevYear)
            ->where('payment_status', 'PAID')
            ->sum('amount');

        $revenueTrend = match (true) {
            $lastMonthRevenue > 0 => round((($totalRevenue - $lastMonthRevenue) / $lastMonthRevenue) * 100, 1),
            $totalRevenue > 0 => 100.0,
            default => 0.0,
        };

        return [
            'stats' => [
                'totalRevenue' => $totalRevenue,
                'bookingRevenue' => $bookingRevenue,
                'membershipRevenue' => $membershipRevenue,
                'paidTransactions' => $paidTransactions->count(),
                'pendingFailedAmount' => $pendingFailedAmount,
                'averagePaidTransaction' => $paidTransactions->count() > 0
                    ? (int) round($totalRevenue / $paidTransactions->count())
                    : 0,
                'totalBookings' => Booking::whereMonth('booking_date', $month)
                    ->whereYear('booking_date', $year)
                    ->count(),
                'activeMemberships' => Membership::where('status', 'active')->count(),
            ],
            'revenueTrend' => $revenueTrend,
            'dailyRevenue' => $this->dailyRevenue($month, $year),
            'monthlyRevenue' => $this->monthlyRevenue($year),
            'facilityRevenue' => $this->facilityRevenue($month, $year),
            'membershipPlanRevenue' => $this->membershipPlanRevenue($month, $year),
            'typeBreakdown' => $this->typeBreakdown($bookingRevenue, $membershipRevenue, $totalRevenue),
            'ledger' => $allPeriodTransactions->map(fn (Transaction $transaction) => $this->ledgerRow($transaction))->values()->all(),
            'recentTransactions' => $allPeriodTransactions
                ->where('payment_status', 'PAID')
                ->take(6)
                ->map(fn (Transaction $transaction) => [
                    'id' => $transaction->id,
                    'amount' => $transaction->amount,
                    'user_name' => $this->customerName($transaction),
                    'paid_at' => $transaction->paid_at?->diffForHumans() ?? '-',
                    'type' => class_basename($transaction->transactionable_type ?? ''),
                ])
                ->values()
                ->all(),
        ];
    }

    private function transactionsForPeriod(int $month, int $year): Builder
    {
        return Transaction::query()
            ->where(function (Builder $query) use ($month, $year) {
                $query->where(function (Builder $paidQuery) use ($month, $year) {
                    $paidQuery->whereNotNull('paid_at')
                        ->whereMonth('paid_at', $month)
                        ->whereYear('paid_at', $year);
                })->orWhere(function (Builder $createdQuery) use ($month, $year) {
                    $createdQuery->whereNull('paid_at')
                        ->whereMonth('created_at', $month)
                        ->whereYear('created_at', $year);
                });
            });
    }

    private function loadTransactionSubjects(EloquentCollection $transactions): void
    {
        $transactions->loadMorph('transactionable', [
            Booking::class => ['facility', 'facilityUnit'],
            Membership::class => ['plan'],
        ]);
    }

    private function dailyRevenue(int $month, int $year): array
    {
        $dailyRaw = DB::table('transactions')
            ->where('payment_status', 'PAID')
            ->whereMonth('paid_at', $month)
            ->whereYear('paid_at', $year)
            ->selectRaw('DAY(paid_at) as day, SUM(amount) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $daysInMonth = Carbon::createFromDate($year, $month, 1)->daysInMonth;

        return collect(range(1, $daysInMonth))
            ->map(fn (int $day) => (int) ($dailyRaw->get($day, 0)))
            ->values()
            ->all();
    }

    private function monthlyRevenue(int $year): array
    {
        $monthlyRaw = DB::table('transactions')
            ->where('payment_status', 'PAID')
            ->whereYear('paid_at', $year)
            ->selectRaw('MONTH(paid_at) as month, SUM(amount) as total')
            ->groupBy('month')
            ->pluck('total', 'month');

        return collect(range(1, 12))
            ->map(fn (int $month) => (int) ($monthlyRaw->get($month, 0)))
            ->values()
            ->all();
    }

    private function facilityRevenue(int $month, int $year): array
    {
        $rows = DB::table('transactions')
            ->join('bookings', function ($join) {
                $join->on('transactions.transactionable_id', '=', 'bookings.id')
                    ->where('transactions.transactionable_type', '=', Booking::class);
            })
            ->leftJoin('facilities', 'bookings.facility_id', '=', 'facilities.id')
            ->where('transactions.payment_status', 'PAID')
            ->whereMonth('transactions.paid_at', $month)
            ->whereYear('transactions.paid_at', $year)
            ->selectRaw("COALESCE(facilities.name, 'Tanpa fasilitas') as name, SUM(transactions.amount) as revenue, COUNT(transactions.id) as count")
            ->groupBy('facilities.name')
            ->orderByDesc('revenue')
            ->get();

        return $this->mapBreakdownRows($rows);
    }

    private function membershipPlanRevenue(int $month, int $year): array
    {
        $rows = DB::table('transactions')
            ->join('memberships', function ($join) {
                $join->on('transactions.transactionable_id', '=', 'memberships.id')
                    ->where('transactions.transactionable_type', '=', Membership::class);
            })
            ->leftJoin('membership_plans', 'memberships.membership_plan_id', '=', 'membership_plans.id')
            ->where('transactions.payment_status', 'PAID')
            ->whereMonth('transactions.paid_at', $month)
            ->whereYear('transactions.paid_at', $year)
            ->selectRaw("COALESCE(membership_plans.name, 'Manual') as name, SUM(transactions.amount) as revenue, COUNT(transactions.id) as count")
            ->groupBy('membership_plans.name')
            ->orderByDesc('revenue')
            ->get();

        return $this->mapBreakdownRows($rows);
    }

    private function mapBreakdownRows($rows): array
    {
        $total = max((int) $rows->sum('revenue'), 1);

        return $rows->values()->map(fn ($row, int $index) => [
            'name' => $row->name,
            'revenue' => (int) $row->revenue,
            'count' => (int) $row->count,
            'share' => (int) round(((int) $row->revenue / $total) * 100),
            'color' => self::BREAKDOWN_COLORS[$index % count(self::BREAKDOWN_COLORS)],
        ])->all();
    }

    private function typeBreakdown(int $bookingRevenue, int $membershipRevenue, int $totalRevenue): array
    {
        $safeTotal = max($totalRevenue, 1);

        return [
            [
                'name' => 'Reservasi',
                'type' => 'booking',
                'revenue' => $bookingRevenue,
                'share' => (int) round($bookingRevenue / $safeTotal * 100),
                'color' => '#E35336',
            ],
            [
                'name' => 'Membership',
                'type' => 'membership',
                'revenue' => $membershipRevenue,
                'share' => (int) round($membershipRevenue / $safeTotal * 100),
                'color' => '#10B981',
            ],
        ];
    }

    private function ledgerRow(Transaction $transaction): array
    {
        return [
            'id' => $transaction->id,
            'receipt_number' => $transaction->receipt_number,
            'invoice_id' => $transaction->xendit_invoice_id,
            'checkout_url' => $transaction->checkout_url,
            'customer_name' => $this->customerName($transaction),
            'type' => $this->transactionType($transaction),
            'subject' => $this->transactionSubject($transaction),
            'amount' => $transaction->amount,
            'payment_status' => $transaction->payment_status,
            'paid_at' => $transaction->paid_at?->format('Y-m-d H:i'),
            'created_at' => $transaction->created_at?->format('Y-m-d H:i'),
        ];
    }

    private function customerName(Transaction $transaction): string
    {
        return $transaction->user?->name
            ?? $transaction->transactionable?->customer_name
            ?? 'Guest';
    }

    private function transactionType(Transaction $transaction): string
    {
        return match ($transaction->transactionable_type) {
            Booking::class => 'booking',
            Membership::class => 'membership',
            default => 'other',
        };
    }

    private function transactionSubject(Transaction $transaction): string
    {
        $subject = $transaction->transactionable;

        if ($subject instanceof Booking) {
            $facility = $subject->facility?->name ?? 'Booking fasilitas';
            $unit = $subject->facilityUnit?->name;

            return $unit ? "{$facility} - {$unit}" : $facility;
        }

        if ($subject instanceof Membership) {
            return $subject->plan?->name ?? 'Membership manual';
        }

        return 'Transaksi';
    }

    private function validMonth(int $month): int
    {
        return min(max($month, 1), 12);
    }

    private function validYear(int $year): int
    {
        return min(max($year, 2020), 2100);
    }
}
