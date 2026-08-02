<?php

use App\Http\Controllers\Admin\AdminBrandAssetController;
use App\Http\Controllers\Admin\BookingController;
use App\Http\Controllers\Admin\FacilityCategoryController;
use App\Http\Controllers\Admin\FacilityController;
use App\Http\Controllers\Admin\FacilityPriceController;
use App\Http\Controllers\Admin\FacilityUnitController;
use App\Http\Controllers\Admin\FinanceReportController;
use App\Http\Controllers\Admin\GalleryBatchController;
use App\Http\Controllers\Admin\GalleryBulkController;
use App\Http\Controllers\Admin\GalleryController;
use App\Http\Controllers\Admin\GalleryCsvController;
use App\Http\Controllers\Admin\GalleryCurationController;
use App\Http\Controllers\Admin\GalleryItemController;
use App\Http\Controllers\Admin\GalleryLocationController;
use App\Http\Controllers\Admin\GallerySavedViewController;
use App\Http\Controllers\Admin\GalleryStatusController;
use App\Http\Controllers\Admin\GalleryUploadSessionController;
use App\Http\Controllers\Admin\IdentityQueueController;
use App\Http\Controllers\Admin\InfoBannerController;
use App\Http\Controllers\Admin\MembershipController;
use App\Http\Controllers\Admin\MembershipPlanController;
use App\Http\Controllers\Admin\NewsCategoryController;
use App\Http\Controllers\Admin\NewsController;
use App\Http\Controllers\Admin\NotificationController;
use App\Http\Controllers\Admin\PromoCarouselController;
use App\Http\Controllers\Admin\ReelController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\ScheduleController;
use App\Http\Controllers\Admin\SponsorLogoController;
use App\Http\Controllers\Admin\TestimonialController;
use App\Http\Controllers\Admin\TransactionController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\Public\FacilityGalleryController;
use App\Http\Controllers\Public\GalleryAnalyticsController;
use App\Http\Controllers\Public\GallerySitemapController;
use App\Http\Controllers\Public\InvoiceController;
use App\Http\Controllers\Public\MembershipCheckoutController;
use App\Http\Controllers\Public\MockPaymentController;
use App\Http\Controllers\Public\PublicBookingController;
use App\Http\Controllers\Public\PublicBranchController;
use App\Http\Controllers\Public\PublicCheckoutController;
use App\Http\Controllers\Public\PublicFacilityController;
use App\Http\Controllers\Public\PublicMembershipController;
use App\Http\Controllers\Public\PublicNewsController;
use App\Http\Controllers\Public\ReviewController;
use App\Http\Controllers\Public\SitemapController;
use App\Http\Controllers\User\UserMembershipController;
use App\Http\Controllers\User\UserPurchaseHistoryController;
use App\Http\Middleware\RedirectStaffFromPublic;
use App\Http\Resources\Public\FacilityResource;
use App\Models\Booking;
use App\Models\Facility;
use App\Models\InfoBanner;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Review;
use App\Models\SystemSetting;
use App\Models\Testimonial;
use App\Models\Transaction;
use App\Models\User;
use App\Services\BookingCalendarService;
use App\Support\PublicReviewFeed;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', [HomeController::class, 'index'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('home');

Route::get('/about', function () {
    return Inertia::render('AboutPage', [
        'testimonials' => Testimonial::active()->ordered()->with('media')->get()->map(fn ($t) => [
            'id' => $t->id,
            'image' => $t->imageUrl(),
            'quote' => $t->quote,
            'authorName' => $t->author_name,
            'authorRole' => $t->author_role,
            'authorLogo' => $t->logoUrl(),
        ])->values()->all(),
    ]);
})->middleware(RedirectStaffFromPublic::class)->name('about');

Route::redirect('/branches', '/about#about-branches')
    ->middleware(RedirectStaffFromPublic::class)
    ->name('branches');

Route::get('/branches/{slug}', [PublicBranchController::class, 'show'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('branches.show');

Route::get('/news', [PublicNewsController::class, 'index'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('news');

Route::get('/news-feed', [PublicNewsController::class, 'feed'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:120,1'])
    ->name('news.feed');

Route::get('/news/{slug}', [PublicNewsController::class, 'show'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('news.show');

Route::get('/pricing', function () {
    return Inertia::render('PricingPage', [
        'membershipPlans' => MembershipPlan::where('is_active', true)
            ->with('media')
            ->withCount([
                'memberships as active_members_count' => fn ($q) => $q
                    ->where('status', 'active')
                    ->whereDate('start_date', '<=', today())
                    ->whereDate('end_date', '>=', today()),
            ])
            ->orderByTier()
            ->orderBy('sort_order')
            ->orderBy('price')
            ->orderBy('id')
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'description' => $p->description,
                'tier' => $p->tier,
                'public_badge' => $p->public_badge,
                'savings_label' => $p->savings_label,
                'cta_label' => $p->cta_label,
                'card_image_url' => $p->cardImageUrl(),
                'price' => $p->price,
                'compare_at_price' => $p->compare_at_price,
                'discount_percent' => $p->discountPercentage(),
                'duration_months' => $p->duration_months,
                'duration_label' => $p->durationLabel(),
                'duration_lead' => $p->durationLead(),
                'features' => $p->features ?? [],
                'is_active' => $p->is_active,
                'is_primary' => $p->is_primary,
                'sort_order' => $p->sort_order,
                'active_members_count' => $p->active_members_count,
            ]),
        'facilities' => FacilityResource::collection(
            Facility::active()
                ->with([
                    'category',
                    'prices' => fn ($query) => $query
                        ->orderBy('sort_order')
                        ->orderBy('id'),
                    'units' => fn ($query) => $query
                        ->where('is_active', true)
                        ->orderBy('id'),
                    'units.prices' => fn ($query) => $query
                        ->orderBy('sort_order')
                        ->orderBy('id'),
                ])
                ->orderBy('sort_order')
                ->get()
        )->resolve(),
    ]);
})->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])->name('pricing');

Route::get('/facilities', [PublicFacilityController::class, 'index'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('facility');

Route::get('/facilities/gallery', [FacilityGalleryController::class, 'index'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:90,1'])
    ->name('gallery.index');
Route::get('/facilities/gallery/media/{galleryItem}', [FacilityGalleryController::class, 'media'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:120,1'])
    ->whereUuid('galleryItem')
    ->name('gallery.media');
Route::post('/facilities/gallery/events', [GalleryAnalyticsController::class, 'store'])
    ->middleware('throttle:120,1')
    ->name('gallery.events');
Route::get('/facilities/gallery/{section}', [FacilityGalleryController::class, 'section'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:90,1'])
    ->where('section', 'indoor|eksklusif|outdoor')
    ->name('gallery.section');

Route::get('/facilities/{slug}', [PublicFacilityController::class, 'show'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('facilities.show');

Route::get('/galeri-fasilitas', fn () => redirect()->route('gallery.index', request()->query(), 301));
Route::get('/galeri-fasilitas/media/{galleryItem}', fn (string $galleryItem) => redirect()->route(
    'gallery.media',
    [...request()->query(), 'galleryItem' => $galleryItem],
    301,
))->whereUuid('galleryItem');
Route::get('/galeri-fasilitas/{section}', fn (string $section) => redirect()->route(
    'gallery.section',
    [...request()->query(), 'section' => $section],
    301,
))->where('section', 'indoor|eksklusif|outdoor');
Route::post('/galeri-fasilitas/events', [GalleryAnalyticsController::class, 'store'])
    ->middleware('throttle:120,1');

Route::get('/sitemap.xml', [SitemapController::class, 'index'])->name('gallery.sitemap.index');
Route::get('/sitemap-pages.xml', [SitemapController::class, 'pages'])->name('sitemap.pages');
Route::get('/sitemap-news.xml', [SitemapController::class, 'news'])->name('sitemap.news');
Route::get('/sitemap-facilities.xml', [SitemapController::class, 'facilities'])->name('sitemap.facilities');
Route::get('/sitemap-gallery-pages.xml', [GallerySitemapController::class, 'pages'])->name('gallery.sitemap.pages');
Route::get('/sitemap-gallery-images.xml', [GallerySitemapController::class, 'images'])->name('gallery.sitemap.images');
Route::get('/sitemap-gallery-videos.xml', [GallerySitemapController::class, 'videos'])->name('gallery.sitemap.videos');

Route::get('/booking', function (
    PublicReviewFeed $reviewFeed,
    BookingCalendarService $bookingCalendar,
) {
    $user = auth()->user();
    $canReview = $user && Booking::where('user_id', $user->id)->where('status', 'completed')->exists();
    $existingReview = $user ? Review::where('user_id', $user->id)->first() : null;
    $calendarMetadata = $bookingCalendar->metadata();

    return Inertia::render('BookingPage', [
        'membershipPlans' => MembershipPlan::where('is_active', true)
            ->with('media')
            ->withCount([
                'memberships as active_members_count' => fn ($q) => $q
                    ->where('status', 'active')
                    ->whereDate('start_date', '<=', today())
                    ->whereDate('end_date', '>=', today()),
            ])
            ->orderByTier()
            ->orderBy('sort_order')
            ->orderBy('price')
            ->orderBy('id')
            ->get()
            ->map(fn ($plan) => [
                'id' => $plan->id,
                'name' => $plan->name,
                'description' => $plan->description,
                'tier' => $plan->tier,
                'public_badge' => $plan->public_badge,
                'savings_label' => $plan->savings_label,
                'cta_label' => $plan->cta_label,
                'card_image_url' => $plan->cardImageUrl(),
                'price' => $plan->price,
                'compare_at_price' => $plan->compare_at_price,
                'discount_percent' => $plan->discountPercentage(),
                'duration_months' => $plan->duration_months,
                'duration_label' => $plan->durationLabel(),
                'duration_lead' => $plan->durationLead(),
                'features' => $plan->features ?? [],
                'is_active' => $plan->is_active,
                'is_primary' => $plan->is_primary,
                'sort_order' => $plan->sort_order,
                'active_members_count' => $plan->active_members_count,
            ]),
        'facilities' => FacilityResource::collection(
            Facility::visibleInBookingDirectory()
                ->with(['category', 'prices', 'media', 'units.media'])
                ->orderBy('sort_order')
                ->get()
        )->resolve(),
        'booking_today' => $calendarMetadata['window']['min_date'],
        'booking_calendar' => $calendarMetadata,
        'can_review' => $canReview,
        'existing_review' => $existingReview ? [
            'id' => $existingReview->id,
            'rating' => (float) $existingReview->rating,
            'text' => $existingReview->text,
        ] : null,
        'approved_reviews' => $reviewFeed->reviews(),
        'testimonials' => Testimonial::active()->ordered()->with('media')->get()->map(fn ($t) => [
            'id' => $t->id,
            'image' => $t->imageUrl(),
            'quote' => $t->quote,
            'authorName' => $t->author_name,
            'authorRole' => $t->author_role,
            'authorLogo' => $t->logoUrl(),
        ])->values()->all(),
    ]);
})->middleware(RedirectStaffFromPublic::class)->name('booking');

Route::get('/booking/reviews/feed', [ReviewController::class, 'index'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:120,1'])
    ->name('booking.reviews.feed');

Route::get('/booking/availability', [PublicBookingController::class, 'availability'])
    ->middleware('throttle:booking-availability')
    ->name('booking.availability');

Route::get('/booking/slots', [PublicBookingController::class, 'slots'])
    ->middleware('throttle:booking-slots')
    ->name('booking.slots');

Route::get(
    '/invoice/booking/{bookingOrder}/verify',
    [InvoiceController::class, 'verify'],
)
    ->middleware(['signed', 'throttle:30,1'])
    ->name('checkout.booking.invoice.verify');

Route::get(
    '/invoice/membership/{membership}/verify',
    [InvoiceController::class, 'verifyMembership'],
)
    ->middleware(['signed', 'throttle:30,1'])
    ->name('checkout.membership.invoice.verify');

Route::get('/coming-soon', function () {
    return Inertia::render('ComingSoon');
})->middleware(RedirectStaffFromPublic::class)->name('coming-soon');

// ─── Staff Portal Auth ────────────────────────────────────────────────────────

// ─── Profile & User Endpoints ─────────────────────────────────────────────────

Route::middleware(['auth', 'verified', RedirectStaffFromPublic::class])->group(function () {
    Route::post('/reviews', [ReviewController::class, 'store'])->name('reviews.store');

    Route::post('/checkout/booking', [PublicCheckoutController::class, 'store'])
        ->middleware('throttle:booking-checkout')
        ->name('checkout.booking.store');
    Route::get('/checkout/booking/{bookingOrder}', [PublicCheckoutController::class, 'show'])
        ->name('checkout.booking.show');
    Route::post('/checkout/booking/{bookingOrder}/pay', [MockPaymentController::class, 'pay'])
        ->middleware('throttle:booking-payment')
        ->name('checkout.booking.mock-pay');
    Route::get('/checkout/booking/{bookingOrder}/success', [PublicCheckoutController::class, 'success'])
        ->name('checkout.booking.success');
    Route::get('/checkout/booking/{bookingOrder}/invoice.pdf', [InvoiceController::class, 'booking'])
        ->name('checkout.booking.invoice');

    Route::get('/checkout/membership/{membership}', [MembershipCheckoutController::class, 'show'])
        ->name('checkout.membership.show');
    Route::post('/checkout/membership/{membership}/pay', [MembershipCheckoutController::class, 'pay'])
        ->middleware('throttle:10,1')
        ->name('checkout.membership.pay');
    Route::get('/checkout/membership/{membership}/success', [MembershipCheckoutController::class, 'success'])
        ->name('checkout.membership.success');
    Route::get('/checkout/membership/{membership}/invoice.pdf', [InvoiceController::class, 'membership'])
        ->name('checkout.membership.invoice');

    Route::post('/membership/registrations', [PublicMembershipController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('membership.registrations.store');
    Route::get('/membership/registrations/{membership}', [PublicMembershipController::class, 'show'])
        ->middleware('throttle:60,1')
        ->name('membership.registrations.show');
    Route::post('/membership/registrations/{membership}/pay', [PublicMembershipController::class, 'pay'])
        ->middleware('throttle:10,1')
        ->name('membership.registrations.pay');

    Route::get('/profile', function (Request $request) {
        if ($request->user()?->hasAnyRole([
            'Administrator',
            'Manager',
            'Finance',
            'Staff Central',
            'Staff Front Office',
        ])) {
            return redirect()->route('admin.dashboard');
        }

        return redirect('/');
    })->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('/user/transactions', [UserPurchaseHistoryController::class, 'index'])
        ->name('user.transactions');
    Route::get('/user/membership', [UserMembershipController::class, 'show'])
        ->name('user.membership');
});

// ─── Admin ────────────────────────────────────────────────────────────────────

Route::middleware([
    'auth',
    'role:Administrator|Manager|Finance|Staff Front Office|Staff Central',
])
    ->prefix('ubsc-staff')
    ->name('admin.')
    ->group(function () {

        Route::get('brand/ubsc-pro-logo', AdminBrandAssetController::class)
            ->name('brand.logo');

        Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
        Route::post('notifications/read', [NotificationController::class, 'markRead'])->name('notifications.read');
        Route::post('notifications/clear-read', [NotificationController::class, 'clearRead'])->name('notifications.clear-read');

        // Bookings
        Route::get('bookings', [BookingController::class, 'index'])->name('bookings.index');
        Route::post('bookings', [BookingController::class, 'store'])->name('bookings.store');
        Route::patch('bookings/{booking}', [BookingController::class, 'update'])->name('bookings.update');
        Route::delete('bookings/{booking}', [BookingController::class, 'destroy'])->name('bookings.destroy');

        // Membership Plans (must precede {membership} wildcard routes)
        Route::prefix('memberships/plans')->name('memberships.plans.')->group(function () {
            Route::get('', [MembershipPlanController::class, 'index'])->name('index');
            Route::post('', [MembershipPlanController::class, 'store'])->name('store');
            Route::patch('{plan}', [MembershipPlanController::class, 'update'])->name('update');
            Route::delete('{plan}', [MembershipPlanController::class, 'destroy'])->name('destroy');
        });

        // Memberships
        Route::get('memberships', [MembershipController::class, 'index'])->name('memberships.index');
        Route::post('memberships', [MembershipController::class, 'store'])->name('memberships.store');
        Route::post('memberships/{membership}/renew', [MembershipController::class, 'renew'])->name('memberships.renew');
        Route::patch('memberships/{membership}', [MembershipController::class, 'update'])->name('memberships.update');
        Route::delete('memberships/{membership}', [MembershipController::class, 'destroy'])->name('memberships.destroy');

        // Transactions
        Route::post('transactions/{transaction}/simulate-pay', [TransactionController::class, 'simulatePay'])
            ->name('transactions.simulate-pay');

        // Finance & Analytics
        Route::get('finance', [FinanceReportController::class, 'index'])->name('finance.index');

        // Dashboard
        Route::get('/', function () {
            $now = now();
            $prevMonth = $now->month === 1 ? 12 : $now->month - 1;
            $prevYear = $now->month === 1 ? $now->year - 1 : $now->year;
            $currentRevenue = (int) Transaction::where('payment_status', 'PAID')
                ->whereMonth('paid_at', $now->month)
                ->whereYear('paid_at', $now->year)
                ->where('paid_at', '<=', $now)
                ->sum('amount');
            $lastMonthRevenue = (int) Transaction::where('payment_status', 'PAID')->whereMonth('paid_at', $prevMonth)->whereYear('paid_at', $prevYear)->sum('amount');
            $revenueTrend = match (true) {
                $lastMonthRevenue > 0 => round((($currentRevenue - $lastMonthRevenue) / $lastMonthRevenue) * 100, 1),
                $currentRevenue > 0 => 100.0,
                default => 0.0,
            };

            // Daily revenue array for the current month (full IDR, one value per day)
            $daysInMonth = (int) $now->daysInMonth;
            $dailyRaw = Transaction::where('payment_status', 'PAID')
                ->whereMonth('paid_at', $now->month)
                ->whereYear('paid_at', $now->year)
                ->where('paid_at', '<=', $now)
                ->selectRaw('DAY(paid_at) as day, SUM(amount) as total')
                ->groupBy('day')
                ->pluck('total', 'day');
            $dailyRevenue = array_map(
                fn ($d) => (int) ($dailyRaw[$d] ?? 0),
                range(1, $daysInMonth),
            );

            // Today's occupancy per active facility
            // Operating window = 15 hours = 900 minutes
            $operatingMinutes = 900;
            $todayBookings = Booking::with('facility')
                ->whereDate('booking_date', today())
                ->whereIn('status', ['confirmed', 'pending'])
                ->get();

            $activeFacilities = Facility::where('is_active', true)->get(['id', 'name']);
            $COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
            $occupancyData = $activeFacilities->values()->map(function ($facility, $idx) use ($todayBookings, $operatingMinutes, $COLORS) {
                $booked = $todayBookings
                    ->where('facility_id', $facility->id)
                    ->sum(fn ($b) => \Carbon\Carbon::parse($b->start_time)->diffInMinutes(\Carbon\Carbon::parse($b->end_time)));

                return [
                    'name' => $facility->name,
                    'pct' => (int) min(100, round($booked / $operatingMinutes * 100)),
                    'color' => $COLORS[$idx % count($COLORS)],
                ];
            })->all();

            // Combined recent activity feed (last 8 events)
            $recentBookings = Booking::with('facility')
                ->latest()
                ->take(5)
                ->get()
                ->map(fn ($b) => [
                    'id' => $b->id,
                    'type' => 'booking',
                    'title' => 'Reservasi Baru',
                    'subtitle' => ($b->customer_name ?? $b->user?->name ?? 'Guest').' · '.($b->facility?->name ?? '-'),
                    'time' => $b->created_at->diffForHumans(),
                ]);

            $recentMemberships = Membership::with('user')
                ->latest()
                ->take(3)
                ->get()
                ->map(fn ($m) => [
                    'id' => $m->id,
                    'type' => 'membership',
                    'title' => 'Membership Baru',
                    'subtitle' => $m->customer_name ?? $m->user?->name ?? 'Guest',
                    'time' => $m->created_at->diffForHumans(),
                ]);

            $recentPayments = Transaction::where('payment_status', 'PAID')
                ->with(['user', 'transactionable'])
                ->orderByDesc('paid_at')
                ->take(5)
                ->get()
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'type' => 'payment',
                    'title' => 'Pembayaran Diterima',
                    'subtitle' => 'Rp '.number_format($t->amount, 0, ',', '.').' · '
                        .($t->user?->name ?? $t->transactionable?->customer_name ?? 'Guest'),
                    'time' => $t->paid_at?->diffForHumans() ?? '-',
                ]);

            $recentActivity = $recentBookings
                ->concat($recentMemberships)
                ->concat($recentPayments)
                ->sortByDesc('time')
                ->take(8)
                ->values()
                ->all();

            return Inertia::render('Admin/Dashboard', [
                'stats' => [
                    'pendingIdentities' => User::where('identity_status', 'pending')->count(),
                    'activeFacilities' => $activeFacilities->count(),
                    'todaysBookings' => Booking::where('booking_date', today())->whereIn('status', ['pending', 'confirmed'])->count(),
                    'totalRevenue' => $currentRevenue,
                    'activeMemberships' => Membership::effectiveAt()->count(),
                ],
                'revenueTrend' => $revenueTrend,
                'dailyRevenue' => $dailyRevenue,
                'daysInMonth' => $daysInMonth,
                'currentDayInMonth' => (int) $now->day,
                'currentMonthLabel' => $now->translatedFormat('M Y'),
                'occupancyData' => array_values($occupancyData),
                'recentActivity' => $recentActivity,
                'gym_traffic' => SystemSetting::get('gym_traffic', 'Low Occupancy'),
                'info_banners' => InfoBanner::ordered()->get()->map(fn ($b) => [
                    'id' => $b->id,
                    'message' => $b->message,
                    'is_active' => $b->is_active,
                    'sort_order' => $b->sort_order,
                ])->values()->all(),
            ]);
        })->name('dashboard');

        // Identity Queue
        Route::get('identity', [IdentityQueueController::class, 'index'])
            ->name('identity.index');
        Route::patch('identity/{user}/verify', [IdentityQueueController::class, 'verify'])
            ->name('identity.verify');
        Route::get('identity/{user}/document', [IdentityQueueController::class, 'document'])
            ->name('identity.document');

        // Facility Categories (JSON API consumed by the Index page)
        Route::get('facility-categories', [FacilityCategoryController::class, 'index'])
            ->name('facility-categories.index');
        Route::post('facility-categories', [FacilityCategoryController::class, 'store'])
            ->name('facility-categories.store');
        Route::put('facility-categories/{facilityCategory}', [FacilityCategoryController::class, 'update'])
            ->name('facility-categories.update');
        Route::delete('facility-categories/{facilityCategory}', [FacilityCategoryController::class, 'destroy'])
            ->name('facility-categories.destroy');
        Route::post('facility-categories/reorder', [FacilityCategoryController::class, 'reorder'])
            ->name('facility-categories.reorder');

        // Facilities
        Route::get('facilities', [FacilityController::class, 'index'])
            ->name('facilities.index');
        Route::get('facilities/create', [FacilityController::class, 'create'])
            ->name('facilities.create');
        Route::post('facilities', [FacilityController::class, 'store'])
            ->name('facilities.store');
        Route::post('facilities/reorder', [FacilityController::class, 'reorder'])
            ->name('facilities.reorder');
        Route::get('facilities/{facility}/edit', [FacilityController::class, 'edit'])
            ->name('facilities.edit');
        Route::put('facilities/{facility}', [FacilityController::class, 'update'])
            ->name('facilities.update');
        Route::delete('facilities/{facility}', [FacilityController::class, 'destroy'])
            ->name('facilities.destroy');

        // Facility Units
        Route::get('facilities/{facility}/units', [FacilityUnitController::class, 'index'])
            ->name('facilities.units.index');
        Route::post('facilities/{facility}/units', [FacilityUnitController::class, 'store'])
            ->name('facilities.units.store');
        Route::put('facility-units/{facilityUnit}', [FacilityUnitController::class, 'update'])
            ->name('facility-units.update');
        Route::delete('facility-units/{facilityUnit}', [FacilityUnitController::class, 'destroy'])
            ->name('facility-units.destroy');

        // Facility Pricing
        Route::get('facilities/{facility}/pricing', function (Facility $facility) {
            abort_unless(
                auth()->user()?->can('manage-pricing') || auth()->user()?->can('manage-facilities'),
                403,
            );

            $facility->load([
                'category',
                'prices' => fn ($query) => $query->orderBy('sort_order'),
            ]);

            return Inertia::render('Admin/Facilities/Pricing', [
                'facility' => [
                    'id' => $facility->id,
                    'name' => $facility->name,
                    'category' => $facility->category?->name,
                    'venue_type' => $facility->venue_type,
                ],
                'prices' => $facility->prices->map(fn ($p) => [
                    'id' => $p->id,
                    'user_category' => $p->user_category,
                    'label' => $p->label,
                    'price' => $p->price,
                    'duration_minutes' => $p->duration_minutes ?? 60,
                    'schedule_type' => $p->schedule_type,
                    'applicable_days' => $p->applicable_days,
                    'starts_at' => $p->starts_at ? substr($p->starts_at, 0, 5) : null,
                    'ends_at' => $p->ends_at ? substr($p->ends_at, 0, 5) : null,
                    'starts_on' => $p->starts_on?->format('Y-m-d'),
                    'ends_on' => $p->ends_on?->format('Y-m-d'),
                    'notes' => $p->notes,
                    'sort_order' => $p->sort_order,
                ])->values()->all(),
            ]);
        })->name('facilities.pricing');
        Route::post('facilities/{facility}/pricing/sync', [FacilityPriceController::class, 'sync'])
            ->name('facilities.pricing.sync');

        // Settings — Schedule Control (Administrator only)
        Route::get('settings/schedules', [ScheduleController::class, 'index'])->name('settings.schedules');
        Route::post('settings/schedules/toggle', [ScheduleController::class, 'toggle'])->name('settings.schedules.toggle');
        Route::post('settings/schedules/update-dates', [ScheduleController::class, 'updateClosedDates'])->name('settings.schedules.update-dates');
        Route::post('settings/schedules/quick-open-next', [ScheduleController::class, 'quickOpenNext'])->name('settings.schedules.quick-open-next');

        // Settings — Role & Access
        Route::get('settings/roles', [RoleController::class, 'index'])->name('settings.roles');
        Route::put('settings/roles/{role}', [RoleController::class, 'update'])->name('settings.roles.update');

        // Settings — Internal User Directory (readable by staff; mutations enforced as Administrator only)
        Route::get('settings/users', [UserController::class, 'index'])->name('settings.users');
        Route::post('settings/users', [UserController::class, 'store'])->name('settings.users.store');
        Route::put('settings/users/{user}', [UserController::class, 'update'])->name('settings.users.update');
        Route::delete('settings/users/{user}', [UserController::class, 'destroy'])->name('settings.users.destroy');

        // Facility media
        Route::post('facilities/{facility}/hero', [FacilityController::class, 'updateHero'])
            ->name('facilities.hero.update');
        Route::post('facilities/{facility}/gallery', [FacilityController::class, 'addGallery'])
            ->name('facilities.gallery.add');
        Route::delete('facilities/gallery/{media}', [FacilityController::class, 'destroyGalleryMedia'])
            ->name('facilities.gallery.destroy');

        // Standalone facility gallery
        Route::prefix('content/facility-gallery')->name('gallery.')->group(function () {
            Route::get('', [GalleryController::class, 'index'])->name('index');
            Route::post('batches', [GalleryBatchController::class, 'store'])->name('batches.store');
            Route::patch('batches/{galleryUploadBatch}/finalize', [GalleryBatchController::class, 'finalize'])
                ->name('batches.finalize');
            Route::post('upload-sessions', [GalleryUploadSessionController::class, 'store'])
                ->middleware('throttle:60,1')
                ->name('upload-sessions.store');
            Route::put('upload-sessions/{galleryUploadSession}/chunks/{index}', [GalleryUploadSessionController::class, 'chunk'])
                ->whereNumber('index')
                ->middleware('throttle:600,1')
                ->name('upload-sessions.chunks.store');
            Route::post('upload-sessions/{galleryUploadSession}/complete', [GalleryUploadSessionController::class, 'complete'])
                ->middleware('throttle:30,1')
                ->name('upload-sessions.complete');
            Route::delete('upload-sessions/{galleryUploadSession}', [GalleryUploadSessionController::class, 'destroy'])
                ->name('upload-sessions.destroy');
            Route::post('bulk', [GalleryBulkController::class, 'store'])
                ->middleware('throttle:30,1')
                ->name('bulk.store');
            Route::get('export', [GalleryCsvController::class, 'export'])->name('csv.export');
            Route::post('import', [GalleryCsvController::class, 'import'])
                ->middleware('throttle:10,1')
                ->name('csv.import');
            Route::post('duplicates', [GalleryItemController::class, 'duplicate'])->name('duplicates');
            Route::post('items', [GalleryItemController::class, 'store'])->name('items.store');
            Route::put('items/{galleryItem}', [GalleryItemController::class, 'update'])->name('items.update');
            Route::delete('items/{galleryItem}', [GalleryItemController::class, 'destroy'])->name('items.destroy');
            Route::post('items/{galleryItem}/retry', [GalleryItemController::class, 'retry'])->name('items.retry');
            Route::post('items/{galleryItem}/submit', [GalleryStatusController::class, 'submit'])->name('items.submit');
            Route::post('items/{galleryItem}/publish', [GalleryStatusController::class, 'publish'])->name('items.publish');
            Route::post('items/{galleryItem}/schedule', [GalleryStatusController::class, 'schedule'])->name('items.schedule');
            Route::post('items/{galleryItem}/unpublish', [GalleryStatusController::class, 'unpublish'])->name('items.unpublish');
            Route::post('items/{galleryItem}/draft', [GalleryStatusController::class, 'draft'])->name('items.draft');
            Route::post('items/{galleryItem}/review', [GalleryStatusController::class, 'review'])->name('items.review');

            Route::get('sections/{gallerySection}/candidates', [GalleryCurationController::class, 'candidates'])
                ->name('sections.candidates');
            Route::put('sections/{gallerySection}/curation', [GalleryCurationController::class, 'update'])
                ->name('sections.curation');
            Route::post('sections/{gallerySection}/activate', [GalleryCurationController::class, 'activate'])
                ->name('sections.activate');
            Route::post('sections/{gallerySection}/deactivate', [GalleryCurationController::class, 'deactivate'])
                ->name('sections.deactivate');

            Route::post('locations', [GalleryLocationController::class, 'store'])->name('locations.store');
            Route::put('locations/{galleryLocation}', [GalleryLocationController::class, 'update'])
                ->name('locations.update');
            Route::post('saved-views', [GallerySavedViewController::class, 'store'])->name('saved-views.store');
            Route::delete('saved-views/{gallerySavedView}', [GallerySavedViewController::class, 'destroy'])
                ->name('saved-views.destroy');
        });

        // System Settings
        Route::put('settings/gym-traffic', function (\Illuminate\Http\Request $request) {
            $request->validate(['value' => ['required', 'in:Low Occupancy,Medium Occupancy,High Occupancy,We Are Close']]);
            SystemSetting::set('gym_traffic', $request->value);

            return back();
        })->name('settings.gym-traffic.update');

        // Info Banners (mutation-only; index rendered inside admin.news.index)
        Route::post('info-banners', [InfoBannerController::class, 'store'])->name('info-banners.store');
        Route::put('info-banners/{infoBanner}', [InfoBannerController::class, 'update'])->name('info-banners.update');
        Route::delete('info-banners/{infoBanner}', [InfoBannerController::class, 'destroy'])->name('info-banners.destroy');
        Route::post('info-banners/reorder', [InfoBannerController::class, 'reorder'])->name('info-banners.reorder');

        // News Categories
        Route::post('news-categories', [NewsCategoryController::class, 'store'])
            ->name('news-categories.store');
        Route::put('news-categories/{newsCategory}', [NewsCategoryController::class, 'update'])
            ->name('news-categories.update');
        Route::delete('news-categories/{newsCategory}', [NewsCategoryController::class, 'destroy'])
            ->name('news-categories.destroy');

        // News
        Route::get('news', [NewsController::class, 'index'])->name('news.index');
        Route::get('news/create', [NewsController::class, 'create'])->name('news.create');
        Route::post('news', [NewsController::class, 'store'])->name('news.store');
        Route::get('news/{news}/edit', [NewsController::class, 'edit'])->name('news.edit');
        Route::put('news/{news}', [NewsController::class, 'update'])->name('news.update');
        Route::delete('news/{news}', [NewsController::class, 'destroy'])->name('news.destroy');

        // Promo Carousel
        Route::get('promo', [PromoCarouselController::class, 'index'])->name('promo.index');
        Route::post('promo', [PromoCarouselController::class, 'store'])->name('promo.store');
        Route::post('promo/reorder', [PromoCarouselController::class, 'reorder'])->name('promo.reorder');
        Route::put('promo/{promoCarousel}', [PromoCarouselController::class, 'update'])->name('promo.update');
        Route::delete('promo/{promoCarousel}', [PromoCarouselController::class, 'destroy'])->name('promo.destroy');

        // Sponsors
        Route::get('sponsors', [SponsorLogoController::class, 'index'])->name('sponsors.index');
        Route::post('sponsors', [SponsorLogoController::class, 'store'])->name('sponsors.store');
        Route::post('sponsors/reorder', [SponsorLogoController::class, 'reorder'])->name('sponsors.reorder');
        Route::put('sponsors/{sponsorLogo}', [SponsorLogoController::class, 'update'])->name('sponsors.update');
        Route::delete('sponsors/{sponsorLogo}', [SponsorLogoController::class, 'destroy'])->name('sponsors.destroy');

        // Reels
        Route::get('reels', [ReelController::class, 'index'])->name('reels.index');
        Route::post('reels', [ReelController::class, 'store'])->name('reels.store');
        Route::put('reels/{reel}', [ReelController::class, 'update'])->name('reels.update');
        Route::delete('reels/{reel}', [ReelController::class, 'destroy'])->name('reels.destroy');

        // Testimonials
        Route::get('testimonials', [TestimonialController::class, 'index'])->name('testimonials.index');
        Route::post('testimonials', [TestimonialController::class, 'store'])->name('testimonials.store');
        Route::post('testimonials/reorder', [TestimonialController::class, 'reorder'])->name('testimonials.reorder');
        Route::put('testimonials/{testimonial}', [TestimonialController::class, 'update'])->name('testimonials.update');
        Route::delete('testimonials/{testimonial}', [TestimonialController::class, 'destroy'])->name('testimonials.destroy');

        // Reviews (managed via Testimonials page)
        Route::post('reviews/{review}/toggle-approve', [TestimonialController::class, 'toggleApprove'])->name('reviews.toggle-approve');
        Route::delete('reviews/{review}', [TestimonialController::class, 'destroyReview'])->name('reviews.destroy');
    });

require __DIR__.'/auth.php';
