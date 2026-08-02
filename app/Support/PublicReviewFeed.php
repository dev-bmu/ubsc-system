<?php

namespace App\Support;

use App\Models\Review;

final class PublicReviewFeed
{
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
        return Review::approved()
            ->with('user:id,name,avatar,email_verified_at')
            ->latest()
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
                    'authorDate' => $review->created_at->format('d M Y'),
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
        $reviews = $this->reviews();
        $total = count($reviews);
        $averageRating = $total > 0
            ? round(array_sum(array_column($reviews, 'rating')) / $total, 1)
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
}
