<?php

namespace App\Support;

use App\Models\Review;
use Illuminate\Support\Facades\Cache;
use Throwable;

final class PublicReviewFeed
{
    public const CACHE_KEY = 'public-review-feed:v2';

    private const MAX_VISIBLE_REVIEWS = 48;

    private const CACHE_SECONDS = 15;

    /**
     * Neutral portrait fallbacks served and resized by Unsplash's image CDN.
     *
     * @var list<string>
     */
    private const FALLBACK_AVATARS = [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&crop=faces&fit=crop&h=160&q=76&w=160',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&crop=faces&fit=crop&h=160&q=76&w=160',
        'https://images.unsplash.com/photo-1600481176431-47ad2ab2745d?auto=format&crop=faces&fit=crop&h=160&q=76&w=160',
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&crop=faces&fit=crop&h=160&q=76&w=160',
    ];

    /**
     * @return list<array{
     *     id: string,
     *     rating: float,
     *     text: string,
     *     authorName: string,
     *     authorDate: string,
     *     avatar: string,
     *     avatarFallback: string,
     *     hasProfileAvatar: bool,
     *     isVerifiedUser: bool
     * }>
     */
    public function reviews(): array
    {
        return $this->payload()['reviews'];
    }

    public static function forgetCache(): void
    {
        try {
            Cache::forget(self::CACHE_KEY);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /** @return list<array<string, mixed>> */
    private function buildReviews(): array
    {
        return Review::approved()
            ->with('user:id,name,avatar,email_verified_at')
            ->orderByDesc('approved_at')
            ->orderByDesc('id')
            ->limit(self::MAX_VISIBLE_REVIEWS)
            ->get()
            ->values()
            ->map(function (Review $review): array {
                $fallbackAvatar = $this->fallbackAvatarFor($review);
                $profileAvatar = $review->user?->avatar_url;

                return [
                    'id' => (string) $review->id,
                    'rating' => (float) $review->rating,
                    'text' => $review->text,
                    'authorName' => $review->user?->name
                        ?? $review->reviewer_name
                        ?? 'Pengguna',
                    'authorDate' => ($review->approved_at ?? $review->created_at)
                        ->translatedFormat('d M Y'),
                    'avatar' => $profileAvatar ?: $fallbackAvatar,
                    'avatarFallback' => $fallbackAvatar,
                    'hasProfileAvatar' => (bool) $profileAvatar,
                    'isVerifiedUser' => (bool) $review->user?->hasVerifiedEmail(),
                ];
            })
            ->all();
    }

    /**
     * @return array{
     *     reviews: list<array<string, mixed>>,
     *     summary: array{
     *         total: int,
     *         averageRating: float|null,
     *         avatars: list<array{
     *             reviewId: string,
     *             authorName: string,
     *             avatar: string,
     *             avatarFallback: string
     *         }>
     *     }
     * }
     */
    public function payload(): array
    {
        if (app()->environment('testing')) {
            return $this->buildPayload();
        }

        try {
            $cachedPayload = Cache::get(self::CACHE_KEY);
        } catch (Throwable $exception) {
            report($exception);

            return $this->buildPayload();
        }

        if ($this->isValidPayload($cachedPayload)) {
            return $cachedPayload;
        }

        $payload = $this->buildPayload();

        try {
            Cache::put(
                self::CACHE_KEY,
                $payload,
                now()->addSeconds(self::CACHE_SECONDS),
            );
        } catch (Throwable $exception) {
            report($exception);
        }

        return $payload;
    }

    /** @return array<string, mixed> */
    private function buildPayload(): array
    {
        $reviews = $this->buildReviews();
        $aggregate = Review::approved()
            ->selectRaw('COUNT(*) as total, AVG(rating) as average_rating')
            ->first();
        $total = (int) ($aggregate?->total ?? 0);
        $averageRating = $total > 0
            ? round((float) $aggregate?->average_rating, 1)
            : null;

        return [
            'reviews' => $reviews,
            'summary' => [
                'total' => $total,
                'averageRating' => $averageRating,
                'avatars' => array_map(
                    static fn (array $review): array => [
                        'reviewId' => $review['id'],
                        'authorName' => $review['authorName'],
                        'avatar' => $review['avatar'],
                        'avatarFallback' => $review['avatarFallback'],
                    ],
                    array_slice($reviews, 0, 4),
                ),
            ],
        ];
    }

    private function fallbackAvatarFor(Review $review): string
    {
        $index = max(0, ((int) $review->getKey()) - 1)
            % count(self::FALLBACK_AVATARS);

        return self::FALLBACK_AVATARS[$index];
    }

    private function isValidPayload(mixed $payload): bool
    {
        if (! is_array($payload)
            || ! isset($payload['reviews'], $payload['summary'])
            || ! is_array($payload['reviews'])
            || ! is_array($payload['summary'])) {
            return false;
        }

        $reviewsAreValid = ! in_array(
            false,
            array_map(
                static fn (mixed $review): bool => is_array($review)
                && is_string($review['id'] ?? null)
                && is_numeric($review['rating'] ?? null)
                && (float) $review['rating'] >= 0.5
                && (float) $review['rating'] <= 5
                && is_string($review['text'] ?? null)
                && is_string($review['authorName'] ?? null)
                && is_string($review['authorDate'] ?? null)
                && is_string($review['avatar'] ?? null)
                && is_string($review['avatarFallback'] ?? null)
                && is_bool($review['hasProfileAvatar'] ?? null)
                && is_bool($review['isVerifiedUser'] ?? null),
                $payload['reviews'],
            ),
            true,
        );
        $summary = $payload['summary'];
        $total = $summary['total'] ?? null;
        $average = $summary['averageRating'] ?? null;
        $avatars = $summary['avatars'] ?? null;

        return $reviewsAreValid
            && is_int($total)
            && $total >= count($payload['reviews'])
            && ($average === null
                || (is_numeric($average) && (float) $average >= 0.5 && (float) $average <= 5))
            && is_array($avatars)
            && count($avatars) <= 4
            && ! in_array(
                false,
                array_map(
                    static fn (mixed $avatar): bool => is_array($avatar)
                    && is_string($avatar['reviewId'] ?? null)
                    && is_string($avatar['authorName'] ?? null)
                    && is_string($avatar['avatar'] ?? null)
                    && is_string($avatar['avatarFallback'] ?? null),
                    $avatars,
                ),
                true,
            );
    }
}
