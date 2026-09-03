<?php

namespace Tests\Feature;

use App\Enums\ReviewStatus;
use App\Models\Booking;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\Membership;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class ReviewWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_a_completed_booking_or_paid_membership_unlocks_reviews(): void
    {
        $ineligible = User::factory()->create();

        $this->actingAs($ineligible)
            ->from(route('booking'))
            ->post(route('reviews.store'), $this->payload())
            ->assertRedirect(route('booking'))
            ->assertSessionHasErrors('review');

        $this->assertDatabaseMissing('reviews', ['user_id' => $ineligible->id]);

        $bookingUser = User::factory()->create();
        $this->completedBooking($bookingUser);

        $this->actingAs($bookingUser)
            ->from(route('booking'))
            ->post(route('reviews.store'), $this->payload('Reservasi selesai dan pelayanannya sangat baik.'))
            ->assertRedirect(route('booking'))
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('reviews', [
            'user_id' => $bookingUser->id,
            'status' => ReviewStatus::Pending->value,
            'eligibility_source' => 'booking',
            'is_approved' => false,
        ]);

        $membershipUser = User::factory()->create();
        $membership = $this->membership($membershipUser, 'expired', 'PAID');

        $this->actingAs($membershipUser)
            ->from(route('booking'))
            ->post(route('reviews.store'), $this->payload('Membership saya sudah selesai dan pengalamannya memuaskan.'))
            ->assertRedirect(route('booking'))
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('reviews', [
            'user_id' => $membershipUser->id,
            'status' => ReviewStatus::Pending->value,
            'eligibility_source' => 'membership',
            'eligibility_reference_id' => $membership->id,
        ]);
    }

    public function test_an_effectively_finished_confirmed_booking_unlocks_review_without_waiting_for_lifecycle_reconciliation(): void
    {
        $finishedUser = User::factory()->create();
        $finishedBooking = $this->bookingEvidence(
            $finishedUser,
            status: 'confirmed',
            date: today()->subDay()->toDateString(),
        );

        $this->actingAs($finishedUser)
            ->post(route('reviews.store'), $this->payload('Jadwal telah selesai dan ulasan dapat langsung dikirim.'))
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('reviews', [
            'user_id' => $finishedUser->id,
            'eligibility_source' => 'booking',
            'eligibility_reference_id' => $finishedBooking->id,
        ]);
        $this->assertSame('confirmed', $finishedBooking->fresh()->status);

        $futureUser = User::factory()->create();
        $futureBooking = $this->bookingEvidence(
            $futureUser,
            status: 'confirmed',
            date: today()->addDay()->toDateString(),
        );

        $this->actingAs($futureUser)
            ->post(route('reviews.store'), $this->payload('Jadwal belum berlangsung sehingga ulasan harus ditolak.'))
            ->assertSessionHasErrors('review');

        $this->assertDatabaseMissing('reviews', ['user_id' => $futureUser->id]);
    }

    public function test_a_same_day_booking_unlocks_review_only_after_its_end_time(): void
    {
        $this->travelTo(Carbon::create(
            2026,
            7,
            26,
            10,
            0,
            0,
            (string) config('app.timezone', 'Asia/Jakarta'),
        ));

        $finishedUser = User::factory()->create();
        $finishedBooking = $this->bookingEvidence(
            $finishedUser,
            status: 'confirmed',
            date: today()->toDateString(),
            startTime: '08:00',
            endTime: '10:00',
        );

        $this->actingAs($finishedUser)
            ->post(route('reviews.store'), $this->payload('Jadwal hari ini sudah tepat berakhir dan dapat diulas.'))
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('reviews', [
            'user_id' => $finishedUser->id,
            'eligibility_reference_id' => $finishedBooking->id,
        ]);

        $ongoingUser = User::factory()->create();
        $this->bookingEvidence(
            $ongoingUser,
            status: 'confirmed',
            date: today()->toDateString(),
            startTime: '09:00',
            endTime: '10:01',
        );

        $this->actingAs($ongoingUser)
            ->post(route('reviews.store'), $this->payload('Jadwal yang belum berakhir tidak boleh diulas lebih awal.'))
            ->assertSessionHasErrors('review');

        $this->assertDatabaseMissing('reviews', ['user_id' => $ongoingUser->id]);
    }

    public function test_unpaid_or_cancelled_membership_never_unlocks_reviews(): void
    {
        $user = User::factory()->create();
        $this->membership($user, 'active', 'UNPAID');

        $this->actingAs($user)
            ->post(route('reviews.store'), $this->payload())
            ->assertSessionHasErrors('review');

        $this->assertDatabaseMissing('reviews', ['user_id' => $user->id]);

        $paidButCancelled = User::factory()->create();
        $this->membership($paidButCancelled, 'cancelled', 'PAID');

        $this->actingAs($paidButCancelled)
            ->post(route('reviews.store'), $this->payload())
            ->assertSessionHasErrors('review');

        $this->assertDatabaseMissing('reviews', ['user_id' => $paidButCancelled->id]);
    }

    public function test_verified_email_is_required_and_the_booking_page_explains_it(): void
    {
        $user = User::factory()->unverified()->create();
        $this->completedBooking($user);

        $this->actingAs($user)
            ->get(route('booking'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('can_review', false)
                ->where('review_eligibility.reason', 'email_unverified')
                ->where('review_eligibility.label', 'Verifikasi akun diperlukan')
                ->where('existing_review', null));

        $this->actingAs($user)
            ->post(route('reviews.store'), $this->payload())
            ->assertRedirect(route('verification.notice'));

        $this->assertDatabaseMissing('reviews', ['user_id' => $user->id]);
    }

    public function test_one_account_can_only_edit_its_single_review_and_edit_resets_moderation(): void
    {
        $user = User::factory()->create();
        $this->completedBooking($user);

        $this->actingAs($user)->post(route('reviews.store'), $this->payload());
        $review = Review::where('user_id', $user->id)->sole();

        $admin = $this->staffWithPermissions(['manage-cms']);
        $this->actingAs($admin)
            ->patch(route('admin.reviews.moderate', $review), [
                'action' => 'approve',
                'expected_version' => 1,
                'feedback' => null,
            ])
            ->assertSessionHasNoErrors();

        $approved = $review->fresh();
        $this->assertSame(ReviewStatus::Approved, $approved->status);
        $this->assertSame(2, $approved->version);
        $this->assertNotNull($approved->approved_at);

        $this->actingAs($user)
            ->post(route('reviews.store'), $this->payload('Ini adalah versi baru yang wajib melalui validasi ulang.'))
            ->assertSessionHasNoErrors();

        $updated = $review->fresh();
        $this->assertSame($review->id, $updated->id);
        $this->assertSame(1, Review::where('user_id', $user->id)->count());
        $this->assertSame(ReviewStatus::Pending, $updated->status);
        $this->assertSame(3, $updated->version);
        $this->assertFalse($updated->is_approved);
        $this->assertNull($updated->approved_at);
        $this->assertNull($updated->moderated_at);
        $this->assertNull($updated->moderated_by);
    }

    public function test_identical_submission_is_idempotent_and_never_resets_an_approved_review(): void
    {
        $user = User::factory()->create();
        $this->completedBooking($user);
        $payload = $this->payload('Isi identik tidak boleh membuat versi semu atau moderasi ulang.');

        $this->actingAs($user)->post(route('reviews.store'), $payload);
        $review = Review::where('user_id', $user->id)->sole();
        $firstSubmittedAt = $review->submitted_at?->toISOString();

        $this->actingAs($user)
            ->post(route('reviews.store'), $payload)
            ->assertSessionHasNoErrors();

        $pending = $review->fresh();
        $this->assertSame(1, $pending->version);
        $this->assertSame($firstSubmittedAt, $pending->submitted_at?->toISOString());

        $admin = $this->staffWithPermissions(['manage-cms']);
        $this->actingAs($admin)->patch(route('admin.reviews.moderate', $review), [
            'action' => 'approve',
            'expected_version' => 1,
            'feedback' => null,
        ]);

        $this->actingAs($user)
            ->post(route('reviews.store'), $payload)
            ->assertSessionHasNoErrors();

        $approved = $review->fresh();
        $this->assertSame(ReviewStatus::Approved, $approved->status);
        $this->assertTrue($approved->is_approved);
        $this->assertSame(2, $approved->version);
        $this->assertNotNull($approved->approved_at);
        $this->assertSame(1, Review::where('user_id', $user->id)->count());
    }

    public function test_database_unique_constraint_is_the_final_guard_against_duplicate_user_reviews(): void
    {
        $user = User::factory()->create();

        Review::create([
            'user_id' => $user->id,
            'rating' => 4.5,
            'text' => 'Ulasan pertama yang sah dan tersimpan.',
            'is_approved' => false,
        ]);

        $this->expectException(QueryException::class);

        Review::create([
            'user_id' => $user->id,
            'rating' => 5,
            'text' => 'Ulasan kedua tidak boleh lolos unique constraint.',
            'is_approved' => false,
        ]);
    }

    public function test_direct_model_content_edit_cannot_bypass_moderation_reset(): void
    {
        $user = User::factory()->create();
        $review = Review::create([
            'user_id' => $user->id,
            'rating' => 5,
            'text' => 'Versi yang telah disetujui moderator.',
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
            'version' => 4,
            'approved_at' => now(),
            'moderated_at' => now(),
            'moderated_by' => User::factory()->create()->id,
        ]);

        $review->update([
            'rating' => 3.5,
            'text' => 'Isi berubah melalui model dan wajib ditinjau kembali.',
        ]);

        $fresh = $review->fresh();
        $this->assertSame(ReviewStatus::Pending, $fresh->status);
        $this->assertSame(5, $fresh->version);
        $this->assertFalse($fresh->is_approved);
        $this->assertNull($fresh->approved_at);
        $this->assertNull($fresh->moderated_at);
        $this->assertNull($fresh->moderated_by);

        $this->getJson(route('booking.reviews.feed'))
            ->assertOk()
            ->assertJsonCount(0, 'reviews');
    }

    public function test_direct_status_changes_cannot_leave_conflicting_moderation_metadata(): void
    {
        $moderator = User::factory()->create();
        $review = Review::create([
            'reviewer_name' => 'Pengguna Status',
            'rating' => 5,
            'text' => 'Metadata status harus selalu konsisten dan tidak saling bertentangan.',
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
            'version' => 2,
            'rejected_at' => now(),
            'moderated_at' => now(),
            'moderated_by' => $moderator->id,
            'moderation_feedback' => 'Perbaiki isi ulasan.',
        ]);

        $review->update(['status' => ReviewStatus::Approved]);
        $approved = $review->fresh();

        $this->assertTrue($approved->is_approved);
        $this->assertNotNull($approved->approved_at);
        $this->assertNull($approved->rejected_at);
        $this->assertNull($approved->moderation_feedback);

        $approved->update(['is_approved' => false]);
        $pending = $approved->fresh();

        $this->assertSame(ReviewStatus::Pending, $pending->status);
        $this->assertFalse($pending->is_approved);
        $this->assertNull($pending->approved_at);
        $this->assertNull($pending->rejected_at);
        $this->assertNull($pending->moderated_at);
        $this->assertNull($pending->moderated_by);
        $this->assertNull($pending->moderation_feedback);
    }

    public function test_legacy_reviews_without_an_account_can_coexist(): void
    {
        foreach (['Pengguna Satu', 'Pengguna Dua'] as $name) {
            Review::create([
                'reviewer_name' => $name,
                'rating' => 5,
                'text' => "Ulasan lama dari {$name} tetap dapat dipertahankan.",
                'is_approved' => true,
            ]);
        }

        $this->assertSame(2, Review::whereNull('user_id')->count());
    }

    public function test_rejection_requires_feedback_and_is_visible_only_to_its_owner(): void
    {
        $user = User::factory()->create();
        $this->completedBooking($user);
        $this->actingAs($user)->post(route('reviews.store'), $this->payload());
        $review = Review::where('user_id', $user->id)->sole();
        $admin = $this->staffWithPermissions(['manage-cms']);

        $this->actingAs($admin)
            ->patch(route('admin.reviews.moderate', $review), [
                'action' => 'reject',
                'expected_version' => 1,
                'feedback' => '',
            ])
            ->assertSessionHasErrors('feedback');

        $feedback = 'Mohon hapus nomor telepon dan fokus pada pengalaman fasilitas.';
        $this->actingAs($admin)
            ->patch(route('admin.reviews.moderate', $review), [
                'action' => 'reject',
                'expected_version' => 1,
                'feedback' => $feedback,
            ])
            ->assertSessionHasNoErrors();

        $rejected = $review->fresh();
        $this->assertSame(ReviewStatus::Rejected, $rejected->status);
        $this->assertSame($feedback, $rejected->moderation_feedback);
        $this->assertNotNull($rejected->moderated_at);
        $this->assertSame($admin->id, $rejected->moderated_by);

        $this->actingAs($user)
            ->getJson(route('booking.reviews.feed'))
            ->assertOk()
            ->assertJsonCount(0, 'reviews');

        $this->actingAs($user)
            ->get(route('booking'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('existing_review.status', 'rejected')
                ->where('existing_review.moderation_feedback', $feedback)
                ->where('can_review', true));
    }

    public function test_stale_admin_decision_cannot_approve_a_newer_user_revision(): void
    {
        $user = User::factory()->create();
        $this->completedBooking($user);
        $this->actingAs($user)->post(route('reviews.store'), $this->payload('Versi satu untuk antrean moderator.'));
        $review = Review::where('user_id', $user->id)->sole();
        $staleVersion = $review->version;

        $this->actingAs($user)->post(route('reviews.store'), $this->payload('Versi dua menggantikan isi versi pertama.'));
        $this->assertSame(2, $review->fresh()->version);

        $admin = $this->staffWithPermissions(['manage-cms']);
        $this->actingAs($admin)
            ->patch(route('admin.reviews.moderate', $review), [
                'action' => 'approve',
                'expected_version' => $staleVersion,
                'feedback' => null,
            ])
            ->assertSessionHasErrors('review');

        $fresh = $review->fresh();
        $this->assertSame(ReviewStatus::Pending, $fresh->status);
        $this->assertFalse($fresh->is_approved);
        $this->assertSame('Versi dua menggantikan isi versi pertama.', $fresh->text);
    }

    public function test_staff_without_cms_permission_is_rejected_before_moderation_validation(): void
    {
        Role::firstOrCreate(['name' => 'Staff Central', 'guard_name' => 'web']);
        $staff = User::factory()->create();
        $staff->assignRole('Staff Central');
        $review = Review::create([
            'reviewer_name' => 'Pengguna Antrean',
            'rating' => 5,
            'text' => 'Ulasan ini hanya boleh diputuskan petugas yang berwenang.',
            'is_approved' => false,
        ]);

        $this->actingAs($staff)
            ->patch(route('admin.reviews.moderate', $review), [])
            ->assertForbidden();

        $this->assertSame(ReviewStatus::Pending, $review->fresh()->status);
        $this->assertSame(1, $review->fresh()->version);
    }

    public function test_review_text_rejects_html_and_rating_precision_outside_half_steps(): void
    {
        $user = User::factory()->create();
        $this->completedBooking($user);

        $this->actingAs($user)
            ->post(route('reviews.store'), [
                'rating' => 4.3,
                'text' => '<script>alert("xss")</script> Pengalaman fasilitas.',
            ])
            ->assertSessionHasErrors(['rating', 'text']);

        $this->assertDatabaseMissing('reviews', ['user_id' => $user->id]);
    }

    public function test_public_feed_is_bounded_but_keeps_exact_global_summary(): void
    {
        foreach (range(1, 49) as $index) {
            Review::create([
                'reviewer_name' => "Pengguna {$index}",
                'rating' => $index === 49 ? 1 : 5,
                'text' => "Pengalaman terverifikasi nomor {$index} di UB Sport Center.",
                'status' => ReviewStatus::Approved,
                'is_approved' => true,
                'approved_at' => now()->subSeconds(50 - $index),
            ]);
        }

        $this->getJson(route('booking.reviews.feed'))
            ->assertOk()
            ->assertJsonCount(48, 'reviews')
            ->assertJsonPath('summary.total', 49)
            ->assertJsonPath('summary.averageRating', 4.9);
    }

    public function test_admin_moderation_queue_is_server_paginated_filterable_and_globally_counted(): void
    {
        foreach (range(1, 10) as $index) {
            Review::create([
                'reviewer_name' => "Review Publik {$index}",
                'rating' => 5,
                'text' => "Pengalaman publik terverifikasi nomor {$index}.",
                'status' => ReviewStatus::Approved,
                'is_approved' => true,
            ]);
        }

        foreach (range(1, 2) as $index) {
            Review::create([
                'reviewer_name' => "Antrean Khusus {$index}",
                'rating' => 4.5,
                'text' => "Ulasan antrean khusus moderator nomor {$index}.",
                'status' => ReviewStatus::Pending,
                'is_approved' => false,
            ]);
        }

        $admin = $this->staffWithPermissions(['manage-cms']);

        $this->actingAs($admin)
            ->get(route('admin.testimonials.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Testimonials/Index')
                ->has('reviews.data', 8)
                ->where('reviews.total', 12)
                ->where('reviews.current_page', 1)
                ->where('review_stats.total', 12)
                ->where('review_stats.pending', 2)
                ->where('review_stats.approved', 10)
                ->where('review_stats.rejected', 0));

        $this->actingAs($admin)
            ->get(route('admin.testimonials.index', [
                'review_status' => 'pending',
                'review_search' => 'Antrean Khusus',
            ]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->has('reviews.data', 2)
                ->where('reviews.total', 2)
                ->where('review_filters.search', 'Antrean Khusus')
                ->where('review_filters.status', 'pending')
                ->where('review_stats.total', 12));
    }

    /** @return array{rating: float, text: string} */
    private function payload(string $text = 'Fasilitas sangat nyaman dan proses reservasi berjalan lancar.'): array
    {
        return ['rating' => 4.5, 'text' => $text];
    }

    private function completedBooking(User $user): Booking
    {
        return $this->bookingEvidence(
            $user,
            status: 'completed',
            date: today()->subDay()->toDateString(),
        );
    }

    private function bookingEvidence(
        User $user,
        string $status,
        string $date,
        string $startTime = '08:00',
        string $endTime = '09:00',
    ): Booking {
        $category = FacilityCategory::firstOrCreate(
            ['slug' => 'arena-review'],
            ['name' => 'Arena Review'],
        );
        $facility = Facility::firstOrCreate(
            ['slug' => 'lapangan-review'],
            [
                'facility_category_id' => $category->id,
                'name' => 'Lapangan Review',
                'is_active' => true,
            ],
        );

        return Booking::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'facility_id' => $facility->id,
            'booking_date' => $date,
            'start_time' => $startTime,
            'end_time' => $endTime,
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => $status,
        ]);
    }

    private function membership(User $user, string $status, string $paymentStatus): Membership
    {
        $membership = Membership::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'start_date' => today()->subMonth(),
            'end_date' => today()->addMonth(),
            'status' => $status,
            'created_via' => 'test',
        ]);
        $membership->transaction()->create([
            'user_id' => $user->id,
            'amount' => 250000,
            'payment_status' => $paymentStatus,
            'paid_at' => $paymentStatus === 'PAID' ? now() : null,
        ]);

        return $membership;
    }

    /** @param array<int, string> $permissions */
    private function staffWithPermissions(array $permissions): User
    {
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $role = Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'web']);
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }
}
