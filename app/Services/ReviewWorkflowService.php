<?php

namespace App\Services;

use App\Enums\ReviewStatus;
use App\Models\Booking;
use App\Models\Membership;
use App\Models\Review;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ReviewWorkflowService
{
    /**
     * @return array{eligible: bool, reason: string, source: ?string, reference_id: ?int, label: string, message: string}
     */
    public function eligibility(User $user, bool $lockEvidence = false): array
    {
        if (! $user->hasVerifiedEmail()) {
            return [
                'eligible' => false,
                'reason' => 'email_unverified',
                'source' => null,
                'reference_id' => null,
                'label' => 'Verifikasi akun diperlukan',
                'message' => 'Verifikasi alamat email Anda sebelum menulis atau memperbarui ulasan.',
            ];
        }

        $localNow = now()->setTimezone((string) config('app.timezone', 'Asia/Jakarta'));
        $localDate = $localNow->toDateString();
        $localTime = $localNow->format('H:i:s');
        $bookingQuery = Booking::query()
            ->where('user_id', $user->getKey())
            ->where(function ($statusQuery) use ($localDate, $localTime): void {
                $statusQuery
                    ->where('status', 'completed')
                    ->orWhere(function ($finishedConfirmedQuery) use ($localDate, $localTime): void {
                        $finishedConfirmedQuery
                            ->where('status', 'confirmed')
                            ->where(function ($timeQuery) use ($localDate, $localTime): void {
                                $timeQuery
                                    ->whereDate('booking_date', '<', $localDate)
                                    ->orWhere(function ($sameDayQuery) use ($localDate, $localTime): void {
                                        $sameDayQuery
                                            ->whereDate('booking_date', $localDate)
                                            ->whereTime('end_time', '<=', $localTime);
                                    });
                            });
                    });
            })
            ->orderByDesc('booking_date')
            ->orderByDesc('id');

        if ($lockEvidence) {
            $bookingQuery->lockForUpdate();
        }

        $bookingId = $bookingQuery->value('id');

        if ($bookingId !== null) {
            return [
                'eligible' => true,
                'reason' => 'completed_booking',
                'source' => 'booking',
                'reference_id' => (int) $bookingId,
                'label' => 'Reservasi terverifikasi',
                'message' => 'Anda dapat menulis satu ulasan berdasarkan reservasi yang telah selesai.',
            ];
        }

        $membershipQuery = Membership::query()
            ->where('user_id', $user->getKey())
            ->whereIn('status', ['active', 'expired'])
            ->whereHas(
                'transaction',
                fn ($transaction) => $transaction->where('payment_status', 'PAID'),
            )
            ->orderByDesc('end_date')
            ->orderByDesc('id');

        if ($lockEvidence) {
            $membershipQuery->lockForUpdate();
        }

        $membership = $membershipQuery->first(['id']);
        $membershipId = $membership?->getKey();

        if ($membership !== null && $lockEvidence) {
            $paymentStillValid = $membership->transaction()
                ->where('payment_status', 'PAID')
                ->lockForUpdate()
                ->exists();

            if (! $paymentStillValid) {
                $membershipId = null;
            }
        }

        if ($membershipId !== null) {
            return [
                'eligible' => true,
                'reason' => 'paid_membership',
                'source' => 'membership',
                'reference_id' => (int) $membershipId,
                'label' => 'Membership terverifikasi',
                'message' => 'Anda dapat menulis satu ulasan berdasarkan membership yang telah dibayar.',
            ];
        }

        return [
            'eligible' => false,
            'reason' => 'no_qualifying_activity',
            'source' => null,
            'reference_id' => null,
            'label' => 'Belum memenuhi syarat',
            'message' => 'Selesaikan satu reservasi atau miliki membership berbayar untuk menulis ulasan.',
        ];
    }

    /**
     * @return array{can_review: bool, review_eligibility: array<string, mixed>, existing_review: ?array<string, mixed>}
     */
    public function pageContext(?User $user): array
    {
        if ($user === null) {
            return [
                'can_review' => false,
                'review_eligibility' => null,
                'existing_review' => null,
            ];
        }

        $eligibility = $this->eligibility($user);
        $review = Review::query()
            ->where('user_id', $user->getKey())
            ->first();

        return [
            'can_review' => $eligibility['eligible'],
            'review_eligibility' => $eligibility,
            'existing_review' => $review ? $this->userPayload($review) : null,
        ];
    }

    /** @param array{rating: mixed, text: string} $payload */
    public function submit(User $user, array $payload): Review
    {
        return DB::transaction(function () use ($user, $payload): Review {
            DB::table('users')
                ->where('id', $user->getKey())
                ->lockForUpdate()
                ->first();

            $eligibility = $this->eligibility($user, lockEvidence: true);

            if (! $eligibility['eligible']) {
                throw ValidationException::withMessages([
                    'review' => $eligibility['message'],
                ]);
            }

            $review = Review::query()
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->first();

            $normalizedRating = (float) $payload['rating'];
            $normalizedText = trim($payload['text']);

            if ($review !== null
                && abs(((float) $review->rating) - $normalizedRating) < 0.001
                && trim((string) $review->text) === $normalizedText) {
                return $review;
            }

            $attributes = [
                'reviewer_name' => null,
                'rating' => $normalizedRating,
                'text' => $normalizedText,
                'status' => ReviewStatus::Pending,
                'is_approved' => false,
                'version' => $review ? ((int) $review->version + 1) : 1,
                'submitted_at' => now(),
                'approved_at' => null,
                'rejected_at' => null,
                'moderated_at' => null,
                'moderated_by' => null,
                'moderation_feedback' => null,
                'eligibility_source' => $eligibility['source'],
                'eligibility_reference_id' => $eligibility['reference_id'],
            ];

            if ($review === null) {
                $review = new Review(['user_id' => $user->getKey()]);
            }

            $review->fill($attributes);
            $review->save();

            return $review->refresh();
        }, 3);
    }

    public function moderate(
        Review $review,
        User $moderator,
        string $action,
        int $expectedVersion,
        ?string $feedback,
    ): Review {
        return DB::transaction(function () use (
            $review,
            $moderator,
            $action,
            $expectedVersion,
            $feedback,
        ): Review {
            $locked = Review::query()
                ->lockForUpdate()
                ->findOrFail($review->getKey());

            if ((int) $locked->version !== $expectedVersion) {
                throw ValidationException::withMessages([
                    'review' => 'Ulasan telah berubah sejak halaman dibuka. Muat ulang agar keputusan tidak diterapkan pada versi lama.',
                ]);
            }

            $approved = $action === 'approve';
            $locked->fill([
                'status' => $approved ? ReviewStatus::Approved : ReviewStatus::Rejected,
                'is_approved' => $approved,
                'version' => $expectedVersion + 1,
                'approved_at' => $approved ? now() : null,
                'rejected_at' => $approved ? null : now(),
                'moderated_at' => now(),
                'moderated_by' => $moderator->getKey(),
                'moderation_feedback' => $approved ? null : trim((string) $feedback),
            ]);
            $locked->save();

            return $locked->refresh();
        }, 3);
    }

    /** @return array<string, mixed> */
    public function userPayload(Review $review): array
    {
        $status = $review->status instanceof ReviewStatus
            ? $review->status
            : ReviewStatus::from((string) $review->status);

        return [
            'id' => $review->id,
            'rating' => (float) $review->rating,
            'text' => $review->text,
            'status' => $status->value,
            'status_label' => $status->label(),
            'status_message' => match ($status) {
                ReviewStatus::Pending => 'Ulasan Anda sedang diperiksa sebelum ditayangkan.',
                ReviewStatus::Approved => 'Ulasan Anda telah tayang untuk publik.',
                ReviewStatus::Rejected => 'Perbaiki ulasan sesuai catatan moderator, lalu kirim kembali.',
            },
            'moderation_feedback' => $status === ReviewStatus::Rejected
                ? $review->moderation_feedback
                : null,
            'eligibility_label' => match ($review->eligibility_source) {
                'booking' => 'Reservasi terverifikasi',
                'membership' => 'Membership terverifikasi',
                default => 'Pengguna terverifikasi',
            },
            'version' => (int) $review->version,
            'submitted_at' => $review->submitted_at?->translatedFormat('d M Y, H:i'),
            'updated_at' => $review->updated_at?->translatedFormat('d M Y, H:i'),
            'published_at' => $review->approved_at?->translatedFormat('d M Y, H:i'),
        ];
    }
}
