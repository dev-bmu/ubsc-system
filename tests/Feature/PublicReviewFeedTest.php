<?php

namespace Tests\Feature;

use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PublicReviewFeedTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_public_feed_exposes_only_approved_reviews_with_normalized_profile_data(): void
    {
        $remoteAvatar = 'https://lh3.googleusercontent.com/a/profile-photo';

        $remoteUser = User::factory()->unverified()->create([
            'name' => 'Rani Prameswari',
            'avatar' => $remoteAvatar,
        ]);

        $localUser = User::factory()->create([
            'name' => 'Dimas Ardiansyah',
            'avatar' => 'avatars/dimas.jpg',
        ]);

        Carbon::setTestNow('2026-07-22 08:00:00');
        $remoteReview = Review::create([
            'user_id' => $remoteUser->id,
            'reviewer_name' => 'Nama lama yang tidak digunakan',
            'rating' => 4,
            'text' => 'Ulasan pengguna dengan avatar eksternal.',
            'is_approved' => true,
        ]);

        Carbon::setTestNow('2026-07-23 08:00:00');
        $localReview = Review::create([
            'user_id' => $localUser->id,
            'reviewer_name' => 'Nama lama pengguna lokal',
            'rating' => 5,
            'text' => 'Ulasan pengguna dengan avatar penyimpanan lokal.',
            'is_approved' => true,
        ]);

        Carbon::setTestNow('2026-07-24 08:00:00');
        $orphanReview = Review::create([
            'reviewer_name' => 'Pengguna Tamu',
            'rating' => 4.5,
            'text' => 'Ulasan lama tanpa akun yang masih ditampilkan.',
            'is_approved' => true,
        ]);

        Review::create([
            'reviewer_name' => 'Belum Disetujui',
            'rating' => 5,
            'text' => 'Ulasan ini belum boleh muncul di feed publik.',
            'is_approved' => false,
        ]);

        $response = $this->getJson(route('booking.reviews.feed'));

        $response
            ->assertOk()
            ->assertJsonCount(3, 'reviews')
            ->assertJsonPath('reviews.0.id', (string) $orphanReview->id)
            ->assertJsonPath('reviews.0.rating', 4.5)
            ->assertJsonPath('reviews.0.authorName', 'Pengguna Tamu')
            ->assertJsonPath('reviews.0.authorDate', '24 Jul 2026')
            ->assertJsonPath('reviews.0.hasProfileAvatar', false)
            ->assertJsonPath('reviews.0.isVerifiedUser', false)
            ->assertJsonPath('reviews.1.id', (string) $localReview->id)
            ->assertJsonPath('reviews.1.authorName', 'Dimas Ardiansyah')
            ->assertJsonPath('reviews.1.avatar', asset('storage/avatars/dimas.jpg'))
            ->assertJsonPath('reviews.1.hasProfileAvatar', true)
            ->assertJsonPath('reviews.1.isVerifiedUser', true)
            ->assertJsonPath('reviews.2.id', (string) $remoteReview->id)
            ->assertJsonPath('reviews.2.authorName', 'Rani Prameswari')
            ->assertJsonPath('reviews.2.avatar', $remoteAvatar)
            ->assertJsonPath('reviews.2.hasProfileAvatar', true)
            ->assertJsonPath('reviews.2.isVerifiedUser', false)
            ->assertJsonPath('summary.total', 3)
            ->assertJsonPath('summary.averageRating', 4.5)
            ->assertJsonCount(3, 'summary.avatars');

        $payload = $response->json();
        $cacheControl = $response->headers->get('Cache-Control');
        $fallbackAvatar = $payload['reviews'][0]['avatarFallback'];

        $this->assertNotNull($cacheControl);
        $this->assertStringContainsString('private', $cacheControl);
        $this->assertStringContainsString('no-cache', $cacheControl);
        $this->assertStringContainsString('must-revalidate', $cacheControl);
        $this->assertSame($fallbackAvatar, $payload['reviews'][0]['avatar']);
        $this->assertStringStartsWith('https://images.unsplash.com/photo-', $fallbackAvatar);
        $this->assertStringNotContainsString('fitness', strtolower($fallbackAvatar));
        $this->assertSame(
            array_map('strval', [$orphanReview->id, $localReview->id, $remoteReview->id]),
            array_column($payload['summary']['avatars'], 'reviewId'),
        );
        $this->assertNotContains(
            'Ulasan ini belum boleh muncul di feed publik.',
            array_column($payload['reviews'], 'text'),
        );
    }

    public function test_social_proof_summary_limits_avatar_stack_to_four_latest_reviews(): void
    {
        for ($index = 1; $index <= 6; $index++) {
            Carbon::setTestNow("2026-07-2{$index} 08:00:00");

            Review::create([
                'reviewer_name' => "Pengguna {$index}",
                'rating' => $index % 2 === 0 ? 4.5 : 5,
                'text' => "Ulasan publik nomor {$index} untuk menguji ringkasan.",
                'is_approved' => true,
            ]);
        }

        $response = $this->getJson(route('booking.reviews.feed'));

        $response
            ->assertOk()
            ->assertJsonCount(6, 'reviews')
            ->assertJsonPath('summary.total', 6)
            ->assertJsonPath('summary.averageRating', 4.8)
            ->assertJsonCount(4, 'summary.avatars')
            ->assertJsonPath('summary.avatars.0.authorName', 'Pengguna 6')
            ->assertJsonPath('summary.avatars.3.authorName', 'Pengguna 3');
    }

    public function test_etag_returns_not_modified_until_the_approved_feed_changes(): void
    {
        Review::create([
            'reviewer_name' => 'Pengguna Pertama',
            'rating' => 5,
            'text' => 'Ulasan pertama yang sudah disetujui untuk publik.',
            'is_approved' => true,
        ]);

        $firstResponse = $this->getJson(route('booking.reviews.feed'))->assertOk();
        $etag = $firstResponse->headers->get('ETag');

        $this->assertNotNull($etag);

        $this->withHeader('If-None-Match', $etag)
            ->getJson(route('booking.reviews.feed'))
            ->assertStatus(304)
            ->assertHeader('ETag', $etag)
            ->assertContent('');

        Review::create([
            'reviewer_name' => 'Pengguna Kedua',
            'rating' => 4.5,
            'text' => 'Ulasan kedua mengubah isi feed yang sudah disetujui.',
            'is_approved' => true,
        ]);

        $changedResponse = $this->withHeader('If-None-Match', $etag)
            ->getJson(route('booking.reviews.feed'))
            ->assertOk()
            ->assertJsonPath('summary.total', 2);

        $this->assertNotSame($etag, $changedResponse->headers->get('ETag'));
    }

    public function test_empty_feed_has_a_stable_zero_state(): void
    {
        $this->getJson(route('booking.reviews.feed'))
            ->assertOk()
            ->assertExactJson([
                'reviews' => [],
                'summary' => [
                    'total' => 0,
                    'averageRating' => null,
                    'avatars' => [],
                ],
            ]);
    }

    public function test_review_rating_schema_and_feed_preserve_half_star_values(): void
    {
        $this->assertContains(
            Schema::getColumnType('reviews', 'rating'),
            ['decimal', 'numeric'],
        );

        $review = Review::create([
            'reviewer_name' => 'Pengguna Setengah Bintang',
            'rating' => 3.5,
            'text' => 'Nilai setengah bintang harus tersimpan tanpa pembulatan.',
            'is_approved' => true,
        ]);

        $this->assertSame(3.5, $review->refresh()->rating);

        $this->getJson(route('booking.reviews.feed'))
            ->assertOk()
            ->assertJsonPath('reviews.0.rating', 3.5)
            ->assertJsonPath('summary.averageRating', 3.5);
    }

    public function test_staff_accounts_cannot_access_the_public_review_feed(): void
    {
        Role::firstOrCreate(['name' => 'Administrator', 'guard_name' => 'web']);

        $staff = User::factory()->create();
        $staff->assignRole('Administrator');

        $this->actingAs($staff)
            ->getJson(route('booking.reviews.feed'))
            ->assertForbidden();
    }
}
