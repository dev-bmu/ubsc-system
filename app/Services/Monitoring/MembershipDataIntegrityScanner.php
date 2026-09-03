<?php

namespace App\Services\Monitoring;

use App\Models\Membership;
use App\Services\Monitoring\Contracts\DataIntegrityDomainScanner;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class MembershipDataIntegrityScanner extends AbstractDataIntegrityDomainScanner implements DataIntegrityDomainScanner
{
    public function domain(): string
    {
        return 'memberships';
    }

    public function scan(CarbonImmutable $at, int $sampleLimit): array
    {
        $membershipType = (new Membership)->getMorphClass();
        $graceSeconds = max(
            0,
            (int) config('data_integrity.reconciliation_grace_seconds', 300),
        );
        $dueBefore = $at->subSeconds($graceSeconds);

        return [
            $this->result(
                DB::table('memberships')
                    ->selectRaw('id AS subject_id, NULL AS related_id')
                    ->whereColumn('start_date', '>', 'end_date'),
                $sampleLimit,
                'membership.invalid_date_range',
                $this->domain(),
                'critical',
                'Invalid membership date range',
                'A membership ends before it starts.',
                'Suspend entitlement decisions and correct the period through an audited workflow.',
            ),
            $this->result(
                DB::table('memberships as membership')
                    ->leftJoin('transactions as payment_tx', function ($join) use ($membershipType): void {
                        $join
                            ->on('payment_tx.transactionable_id', '=', 'membership.id')
                            ->where('payment_tx.transactionable_type', '=', $membershipType);
                    })
                    ->selectRaw('membership.id AS subject_id, NULL AS related_id')
                    ->whereNull('payment_tx.id'),
                $sampleLimit,
                'membership.without_transaction',
                $this->domain(),
                'critical',
                'Membership has no transaction',
                'A membership is detached from its authoritative financial record.',
                'Restrict entitlement changes and investigate the creation boundary.',
            ),
            $this->result(
                DB::table('memberships as membership')
                    ->leftJoin('transactions as payment_tx', function ($join) use ($membershipType): void {
                        $join
                            ->on('payment_tx.transactionable_id', '=', 'membership.id')
                            ->where('payment_tx.transactionable_type', '=', $membershipType);
                    })
                    ->selectRaw('membership.id AS subject_id, payment_tx.id AS related_id')
                    ->where('membership.status', 'active')
                    ->where(function (Builder $payment): void {
                        $payment
                            ->whereNull('payment_tx.id')
                            ->orWhere('payment_tx.payment_status', '<>', 'PAID');
                    }),
                $sampleLimit,
                'membership.active_without_settlement',
                $this->domain(),
                'critical',
                'Active membership exists without settlement',
                'An active entitlement has no authoritative paid transaction.',
                'Verify the financial ledger before changing payment or entitlement state.',
            ),
            $this->result(
                $this->settledProjectionPending($membershipType),
                $sampleLimit,
                'membership.settled_projection_pending',
                $this->domain(),
                'critical',
                'Settled membership awaits activation',
                'Verified settlement exists while the membership remains pending payment.',
                'Run the existing payment recovery workflow; never request a replacement payment.',
                'safe_candidate',
            ),
            $this->result(
                DB::table('memberships as membership')
                    ->join('transactions as payment_tx', function ($join) use ($membershipType): void {
                        $join
                            ->on('payment_tx.transactionable_id', '=', 'membership.id')
                            ->where('payment_tx.transactionable_type', '=', $membershipType);
                    })
                    ->selectRaw('membership.id AS subject_id, payment_tx.id AS related_id')
                    ->where('membership.status', 'active')
                    ->where('payment_tx.payment_status', 'PAID')
                    ->whereDate('membership.end_date', '<', $dueBefore->toDateString()),
                $sampleLimit,
                'membership.lifecycle_expiry_due',
                $this->domain(),
                'warning',
                'Membership expiry projection is late',
                'A paid active membership ended beyond the scheduler grace period.',
                'Run the existing lifecycle reconciliation and inspect scheduler health if it repeats.',
                'safe_candidate',
                ['grace_seconds' => $graceSeconds],
            ),
            $this->result(
                $this->unpaidRegistrationExpiryDue($membershipType, $dueBefore),
                $sampleLimit,
                'membership.unpaid_registration_expiry_due',
                $this->domain(),
                'warning',
                'Unpaid membership expiry is late',
                'A provider-safe unpaid registration remains pending beyond its payment deadline.',
                'Run the existing payment recovery workflow and inspect scheduler health.',
                'safe_candidate',
                ['grace_seconds' => $graceSeconds],
            ),
            $this->result(
                $this->overlappingActiveMemberships($membershipType),
                $sampleLimit,
                'membership.active_period_overlap',
                $this->domain(),
                'critical',
                'Paid active membership periods overlap',
                'One account has overlapping paid active membership periods.',
                'Review the renewal chain and correct it through a compensating, audited action.',
            ),
            $this->result(
                DB::table('memberships')
                    ->selectRaw('id AS subject_id, renewed_from_membership_id AS related_id')
                    ->whereNotNull('renewed_from_membership_id')
                    ->whereColumn('id', 'renewed_from_membership_id'),
                $sampleLimit,
                'membership.renewal_self_reference',
                $this->domain(),
                'critical',
                'Membership renewal references itself',
                'A renewal edge forms an immediate cycle.',
                'Freeze further renewals for the record and repair the chain manually.',
            ),
            $this->result(
                $this->renewalOwnershipMismatch(),
                $sampleLimit,
                'membership.renewal_ownership_mismatch',
                $this->domain(),
                'critical',
                'Membership renewal ownership mismatch',
                'A renewal child and its predecessor belong to different identities.',
                'Restrict the chain and investigate its provenance before correction.',
            ),
            $this->result(
                DB::table('memberships as child')
                    ->join('memberships as parent', 'parent.id', '=', 'child.renewed_from_membership_id')
                    ->selectRaw('child.id AS subject_id, parent.id AS related_id')
                    ->whereColumn('child.start_date', '<=', 'parent.end_date'),
                $sampleLimit,
                'membership.renewal_period_overlap',
                $this->domain(),
                'critical',
                'Membership renewal period overlaps its predecessor',
                'A renewal begins before the predecessor entitlement has ended.',
                'Review the quoted periods and correct the chain through an audited workflow.',
            ),
            $this->result(
                DB::table('memberships')
                    ->selectRaw('renewed_from_membership_id AS subject_id, NULL AS related_id')
                    ->whereNotNull('renewed_from_membership_id')
                    ->groupBy('renewed_from_membership_id')
                    ->havingRaw('COUNT(*) > 1'),
                $sampleLimit,
                'membership.renewal_chain_branch',
                $this->domain(),
                'critical',
                'Membership renewal chain branches',
                'One membership has more than one direct renewal successor.',
                'Stop additional renewals and determine the authoritative successor manually.',
            ),
            $this->result(
                DB::table('memberships as membership')
                    ->leftJoin('membership_histories as history', 'history.membership_id', '=', 'membership.id')
                    ->selectRaw('membership.id AS subject_id, NULL AS related_id')
                    ->groupBy('membership.id')
                    ->havingRaw('COUNT(history.id) = 0'),
                $sampleLimit,
                'membership.history_missing',
                $this->domain(),
                'warning',
                'Membership audit history is missing',
                'A membership has no lifecycle history entry.',
                'Compare the durable membership and transaction before adding a compensating audit record.',
            ),
        ];
    }

    private function settledProjectionPending(string $membershipType): Builder
    {
        return DB::table('memberships as membership')
            ->join('transactions as payment_tx', function ($join) use ($membershipType): void {
                $join
                    ->on('payment_tx.transactionable_id', '=', 'membership.id')
                    ->where('payment_tx.transactionable_type', '=', $membershipType);
            })
            ->selectRaw('membership.id AS subject_id, payment_tx.id AS related_id')
            ->where('membership.status', 'pending_payment')
            ->where(function (Builder $settled): void {
                $settled
                    ->where('payment_tx.payment_status', 'PAID')
                    ->orWhereExists(function (Builder $attempt): void {
                        $attempt
                            ->selectRaw('1')
                            ->from('payment_attempts')
                            ->whereColumn('payment_attempts.transaction_id', 'payment_tx.id')
                            ->where('payment_attempts.status', 'paid');
                    });
            });
    }

    private function unpaidRegistrationExpiryDue(
        string $membershipType,
        CarbonImmutable $dueBefore,
    ): Builder {
        return DB::table('memberships as membership')
            ->join('transactions as payment_tx', function ($join) use ($membershipType): void {
                $join
                    ->on('payment_tx.transactionable_id', '=', 'membership.id')
                    ->where('payment_tx.transactionable_type', '=', $membershipType);
            })
            ->selectRaw('membership.id AS subject_id, payment_tx.id AS related_id')
            ->where('membership.status', 'pending_payment')
            ->whereNotNull('membership.registration_expires_at')
            ->where('membership.registration_expires_at', '<=', $dueBefore)
            ->where('payment_tx.payment_status', 'UNPAID')
            ->whereNotExists(function (Builder $attempt): void {
                $attempt
                    ->selectRaw('1')
                    ->from('payment_attempts')
                    ->whereColumn('payment_attempts.transaction_id', 'payment_tx.id')
                    ->where('payment_attempts.status', 'paid');
            })
            ->whereNotExists(function (Builder $attempt): void {
                $attempt
                    ->selectRaw('1')
                    ->from('payment_attempts')
                    ->whereColumn('payment_attempts.transaction_id', 'payment_tx.id')
                    ->whereIn('payment_attempts.status', ['creating', 'pending', 'reconciling'])
                    ->where(function (Builder $provider): void {
                        $provider
                            ->whereNotNull('payment_attempts.provider')
                            ->orWhereNotNull('payment_attempts.provider_reference')
                            ->orWhereNotNull('payment_attempts.provider_transaction_id');
                    });
            });
    }

    private function overlappingActiveMemberships(string $membershipType): Builder
    {
        return DB::table('memberships as left_membership')
            ->join('memberships as right_membership', function ($join): void {
                $join
                    ->on('right_membership.user_id', '=', 'left_membership.user_id')
                    ->on('right_membership.id', '>', 'left_membership.id')
                    ->on('right_membership.start_date', '<=', 'left_membership.end_date')
                    ->on('right_membership.end_date', '>=', 'left_membership.start_date');
            })
            ->join('transactions as left_transaction', function ($join) use ($membershipType): void {
                $join
                    ->on('left_transaction.transactionable_id', '=', 'left_membership.id')
                    ->where('left_transaction.transactionable_type', '=', $membershipType);
            })
            ->join('transactions as right_transaction', function ($join) use ($membershipType): void {
                $join
                    ->on('right_transaction.transactionable_id', '=', 'right_membership.id')
                    ->where('right_transaction.transactionable_type', '=', $membershipType);
            })
            ->selectRaw('left_membership.id AS subject_id, right_membership.id AS related_id')
            ->whereNotNull('left_membership.user_id')
            ->where('left_membership.status', 'active')
            ->where('right_membership.status', 'active')
            ->where('left_transaction.payment_status', 'PAID')
            ->where('right_transaction.payment_status', 'PAID');
    }

    private function renewalOwnershipMismatch(): Builder
    {
        return DB::table('memberships as child')
            ->join('memberships as parent', 'parent.id', '=', 'child.renewed_from_membership_id')
            ->selectRaw('child.id AS subject_id, parent.id AS related_id')
            ->where(function (Builder $query): void {
                $query
                    ->whereColumn('child.user_id', '<>', 'parent.user_id')
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNull('child.user_id')
                            ->whereNotNull('parent.user_id');
                    })
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNotNull('child.user_id')
                            ->whereNull('parent.user_id');
                    });
            });
    }
}
