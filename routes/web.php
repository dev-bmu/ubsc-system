<?php

use App\Http\Controllers\Admin\BookingController;
use App\Http\Controllers\Admin\InfoBannerController;
use App\Http\Controllers\Admin\RoleController;
use App\Models\InfoBanner;
use App\Models\SystemSetting;
use App\Http\Controllers\Admin\ScheduleController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\FacilityCategoryController;
use App\Http\Controllers\Admin\FinanceReportController;
use App\Http\Controllers\Admin\MembershipController;
use App\Http\Controllers\Admin\MembershipPlanController;
use App\Http\Controllers\Admin\NotificationController;
use App\Http\Controllers\Admin\TransactionController;
use App\Http\Controllers\Admin\FacilityController;
use App\Http\Controllers\Admin\FacilityPriceController;
use App\Http\Controllers\Admin\FacilityUnitController;
use App\Http\Controllers\Admin\IdentityQueueController;
use App\Http\Controllers\Admin\NewsCategoryController;
use App\Http\Controllers\Admin\NewsController;
use App\Http\Controllers\Admin\PromoCarouselController;
use App\Http\Controllers\Admin\ReelController;
use App\Http\Controllers\Admin\SponsorLogoController;
use App\Http\Controllers\Admin\TestimonialController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\Public\PublicBookingController;
use App\Http\Controllers\Public\PublicFacilityController;
use App\Http\Controllers\Public\PublicNewsController;
use App\Http\Controllers\Public\ReviewController;
use App\Http\Resources\Public\FacilityResource;
use App\Http\Middleware\RedirectStaffFromPublic;
use App\Models\Booking;
use App\Models\Facility;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Review;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', [HomeController::class, 'index'])->middleware([RedirectStaffFromPublic::class, 'throttle:60,1']);

Route::get('/about', function () {
    return Inertia::render('AboutPage');
})->middleware(RedirectStaffFromPublic::class)->name('about');

Route::get('/news', [PublicNewsController::class, 'index'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('news');

Route::get('/pricing', function () {
    return Inertia::render('PricingPage', [
        'membershipPlans' => MembershipPlan::where('is_active', true)
            ->withCount([
                'memberships as active_members_count' => fn ($q) => $q->where('status', 'active'),
            ])
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($p) => [
                'id'              => $p->id,
                'name'            => $p->name,
                'description'     => $p->description,
                'public_badge'    => $p->public_badge,
                'savings_label'   => $p->savings_label,
                'cta_label'       => $p->cta_label,
                'card_image_url'  => $p->card_image_url,
                'price'           => $p->price,
                'duration_months' => $p->duration_months,
                'features'        => $p->features ?? [],
                'is_active'       => $p->is_active,
                'sort_order'      => $p->sort_order,
                'active_members_count' => $p->active_members_count,
            ]),
        'facilities' => FacilityResource::collection(
            Facility::active()
                ->with(['category', 'prices'])
                ->orderBy('sort_order')
                ->get()
        )->resolve(),
    ]);
})->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])->name('pricing');

Route::get('/facilities', [PublicFacilityController::class, 'index'])
    ->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])
    ->name('facility');

Route::get('/branches/{slug}', function (string $slug) {
    // Static branch data — replace with Branch model when available
    $branches = [
        'ubsc-veteran' => [
            'id'               => 1,
            'title'            => 'UB Sport Center Veteran',
            'slug'             => 'ubsc-veteran',
            'category_badge'   => 'Pusat Kebugaran Utama',
            'description'      => "UB Sport Center Veteran merupakan pusat kebugaran utama yang berlokasi strategis di kawasan Veteran, Malang. Fasilitas ini menyediakan berbagai jenis peralatan gym modern, studio kelas kelompok, dan area latihan fungsional yang dirancang untuk memenuhi kebutuhan olahraga seluruh kalangan.\n\nDengan suasana yang nyaman dan dukungan pelatih profesional, UB Sport Center Veteran menjadi pilihan utama bagi mahasiswa dan masyarakat umum yang ingin menjalani gaya hidup sehat dan aktif. Tersedia berbagai program latihan mulai dari yoga, zumba, hingga kelas kekuatan dan ketahanan.",
            'gmaps_embed_url'  => 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3947.8!2d112.615!3d-7.965!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sUB+Sport+Center!5e0!3m2!1sen!2sid!4v1',
            'address'          => 'Jl. Veteran, Ketawanggede, Kec. Lowokwaru, Kota Malang, Jawa Timur 65145',
            'contact'          => '+62 341 123 4567',
            'operating_hours'  => 'Senin – Minggu, 06.00 – 21.00 WIB',
            'images_array'     => [
                '/assets/images/ub-sport-center-kantor-pusat-malang.avif',
                '/assets/images/fasilitas-bulutangkis-ub-sport-center.avif',
            ],
        ],
        'ubsc-dieng' => [
            'id'               => 2,
            'title'            => 'UB Sport Center Dieng',
            'slug'             => 'ubsc-dieng',
            'category_badge'   => 'Cabang Arena Terbuka',
            'description'      => "UB Sport Center Dieng merupakan cabang arena terbuka yang menawarkan fasilitas olahraga outdoor berkualitas di kawasan Dieng, Malang. Dengan lapangan luas dan pemandangan yang asri, cabang ini cocok untuk berbagai aktivitas olahraga mulai dari sepak bola, voli, hingga lari.\n\nFasilitas ini dilengkapi dengan tribun, area parkir luas, dan musholla. Cocok untuk kegiatan komunitas, turnamen, maupun latihan rutin.",
            'gmaps_embed_url'  => 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3947.5!2d112.61!3d-7.97!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sUB+Sport+Center+Dieng!5e0!3m2!1sen!2sid!4v1',
            'address'          => 'Jl. Dieng, Kota Malang, Jawa Timur',
            'contact'          => '+62 341 765 4321',
            'operating_hours'  => 'Senin – Minggu, 06.00 – 18.00 WIB',
            'images_array'     => [
                '/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif',
            ],
        ],
    ];

    $branchItem = $branches[$slug] ?? null;
    abort_unless($branchItem, 404);

    $otherBranches = collect($branches)
        ->reject(fn ($b) => $b['slug'] === $slug)
        ->map(fn ($b) => [
            'id'      => $b['id'],
            'title'   => $b['title'],
            'slug'    => $b['slug'],
            'address' => $b['address'],
            'image'   => $b['images_array'][0] ?? '/assets/images/comingsoon.avif',
        ])
        ->values()
        ->all();

    return Inertia::render('Branches/Show', [
        'branchItem'    => $branchItem,
        'otherBranches' => $otherBranches,
    ]);
})->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])->name('branches.show');

Route::get('/booking', function () {
    $user           = auth()->user();
    $canReview      = $user && Booking::where('user_id', $user->id)->where('status', 'completed')->exists();
    $existingReview = $user ? Review::where('user_id', $user->id)->first() : null;

    return Inertia::render('BookingPage', [
        'facilities' => FacilityResource::collection(
            Facility::active()->with(['category', 'prices', 'units.media'])->orderBy('sort_order')->get()
        )->resolve(),
        'can_review'       => $canReview,
        'existing_review'  => $existingReview ? [
            'id'     => $existingReview->id,
            'rating' => (float) $existingReview->rating,
            'text'   => $existingReview->text,
        ] : null,
        'approved_reviews' => Review::approved()->with('user')->latest()->get()->map(fn ($r) => [
            'id'         => (string) $r->id,
            'rating'     => (float) $r->rating,
            'text'       => $r->text,
            'authorName' => $r->reviewer_name ?? $r->user?->name ?? 'Pengguna',
            'authorDate' => $r->created_at->format('d M Y'),
            'avatar'     => $r->user?->avatar
                ? '/storage/' . $r->user->avatar
                : '/assets/icons/ulasan-malang-tennis-academy-ubsc.avif',
        ])->values()->all(),
    ]);
})->middleware([RedirectStaffFromPublic::class, 'throttle:60,1'])->name('booking');

Route::get('/booking/slots', [PublicBookingController::class, 'slots'])
    ->middleware('throttle:120,1')
    ->name('booking.slots');

Route::get('/coming-soon', function () {
    return Inertia::render('ComingSoon');
})->middleware(RedirectStaffFromPublic::class)->name('coming-soon');

// ─── Staff Portal Auth ────────────────────────────────────────────────────────

// ─── Profile & User Endpoints ─────────────────────────────────────────────────

Route::middleware(['auth', 'verified', RedirectStaffFromPublic::class])->group(function () {
    Route::post('/reviews', [ReviewController::class, 'store'])->name('reviews.store');

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

    Route::get('/user/transactions', function () {
        $transactions = Transaction::where('user_id', auth()->id())
            ->with('transactionable')
            ->latest()
            ->take(20)
            ->get();

        $transactions->each(function ($t) {
            if ($t->transactionable instanceof Booking) {
                $t->transactionable->loadMissing('facility');
            } elseif ($t->transactionable instanceof Membership) {
                $t->transactionable->loadMissing('plan');
            }
        });

        return response()->json($transactions->map(fn ($t) => [
            'id'             => $t->id,
            'receipt_number' => $t->receipt_number,
            'xendit_invoice_id' => $t->xendit_invoice_id,
            'amount'         => $t->amount,
            'payment_status' => $t->payment_status,
            'checkout_url'   => $t->checkout_url,
            'paid_at'        => $t->paid_at?->toDateTimeString(),
            'created_at'     => $t->created_at->toDateTimeString(),
            'type'           => $t->transactionable instanceof Membership ? 'membership' : 'booking',
            'facility_name'  => $t->transactionable instanceof Booking
                ? ($t->transactionable->facility?->name ?? '-')
                : '-',
            'booking_date'   => $t->transactionable instanceof Booking
                ? $t->transactionable->booking_date
                : null,
            'membership_plan' => $t->transactionable instanceof Membership
                ? ($t->transactionable->plan?->name ?? 'Manual')
                : null,
            'membership_status' => $t->transactionable instanceof Membership
                ? $t->transactionable->status
                : null,
            'membership_period' => $t->transactionable instanceof Membership
                ? [
                    'start_date' => $t->transactionable->start_date?->format('Y-m-d'),
                    'end_date' => $t->transactionable->end_date?->format('Y-m-d'),
                ]
                : null,
        ]));
    })->name('user.transactions');
});

// ─── Admin ────────────────────────────────────────────────────────────────────

Route::middleware([
    'auth',
    'role:Administrator|Manager|Finance|Staff Front Office|Staff Central',
])
    ->prefix('ubsc-staff')
    ->name('admin.')
    ->group(function () {

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
            Route::get('',           [MembershipPlanController::class, 'index'])->name('index');
            Route::post('',          [MembershipPlanController::class, 'store'])->name('store');
            Route::patch('{plan}',   [MembershipPlanController::class, 'update'])->name('update');
            Route::delete('{plan}',  [MembershipPlanController::class, 'destroy'])->name('destroy');
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
            $now              = now();
            $prevMonth        = $now->month === 1 ? 12 : $now->month - 1;
            $prevYear         = $now->month === 1 ? $now->year - 1 : $now->year;
            $currentRevenue   = (int) Transaction::where('payment_status', 'PAID')
                ->whereMonth('paid_at', $now->month)
                ->whereYear('paid_at', $now->year)
                ->where('paid_at', '<=', $now)
                ->sum('amount');
            $lastMonthRevenue = (int) Transaction::where('payment_status', 'PAID')->whereMonth('paid_at', $prevMonth)->whereYear('paid_at', $prevYear)->sum('amount');
            $revenueTrend = match(true) {
                $lastMonthRevenue > 0 => round((($currentRevenue - $lastMonthRevenue) / $lastMonthRevenue) * 100, 1),
                $currentRevenue > 0  => 100.0,
                default              => 0.0,
            };

            // Daily revenue array for the current month (full IDR, one value per day)
            $daysInMonth    = (int) $now->daysInMonth;
            $dailyRaw       = Transaction::where('payment_status', 'PAID')
                ->whereMonth('paid_at', $now->month)
                ->whereYear('paid_at', $now->year)
                ->where('paid_at', '<=', $now)
                ->selectRaw('DAY(paid_at) as day, SUM(amount) as total')
                ->groupBy('day')
                ->pluck('total', 'day');
            $dailyRevenue = array_map(
                fn($d) => (int) ($dailyRaw[$d] ?? 0),
                range(1, $daysInMonth),
            );

            // Today's occupancy per active facility
            // Operating window = 15 hours = 900 minutes
            $operatingMinutes = 900;
            $todayBookings    = Booking::with('facility')
                ->whereDate('booking_date', today())
                ->whereIn('status', ['confirmed', 'pending'])
                ->get();

            $activeFacilities = Facility::where('is_active', true)->get(['id', 'name']);
            $COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
            $occupancyData = $activeFacilities->values()->map(function ($facility, $idx) use ($todayBookings, $operatingMinutes, $COLORS) {
                $booked = $todayBookings
                    ->where('facility_id', $facility->id)
                    ->sum(fn($b) => \Carbon\Carbon::parse($b->start_time)->diffInMinutes(\Carbon\Carbon::parse($b->end_time)));
                return [
                    'name'  => $facility->name,
                    'pct'   => (int) min(100, round($booked / $operatingMinutes * 100)),
                    'color' => $COLORS[$idx % count($COLORS)],
                ];
            })->all();

            // Combined recent activity feed (last 8 events)
            $recentBookings = Booking::with('facility')
                ->latest()
                ->take(5)
                ->get()
                ->map(fn($b) => [
                    'id'       => $b->id,
                    'type'     => 'booking',
                    'title'    => 'Reservasi Baru',
                    'subtitle' => ($b->customer_name ?? $b->user?->name ?? 'Guest') . ' · ' . ($b->facility?->name ?? '-'),
                    'time'     => $b->created_at->diffForHumans(),
                ]);

            $recentMemberships = Membership::with('user')
                ->latest()
                ->take(3)
                ->get()
                ->map(fn($m) => [
                    'id'       => $m->id,
                    'type'     => 'membership',
                    'title'    => 'Membership Baru',
                    'subtitle' => $m->customer_name ?? $m->user?->name ?? 'Guest',
                    'time'     => $m->created_at->diffForHumans(),
                ]);

            $recentPayments = Transaction::where('payment_status', 'PAID')
                ->with(['user', 'transactionable'])
                ->orderByDesc('paid_at')
                ->take(5)
                ->get()
                ->map(fn($t) => [
                    'id'       => $t->id,
                    'type'     => 'payment',
                    'title'    => 'Pembayaran Diterima',
                    'subtitle' => 'Rp ' . number_format($t->amount, 0, ',', '.') . ' · '
                        . ($t->user?->name ?? $t->transactionable?->customer_name ?? 'Guest'),
                    'time'     => $t->paid_at?->diffForHumans() ?? '-',
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
                    'pendingIdentities'  => User::where('identity_status', 'pending')->count(),
                    'activeFacilities'   => $activeFacilities->count(),
                    'todaysBookings'     => Booking::where('booking_date', today())->whereIn('status', ['pending', 'confirmed'])->count(),
                    'totalRevenue'       => $currentRevenue,
                    'activeMemberships'  => Membership::where('status', 'active')->count(),
                ],
                'revenueTrend'      => $revenueTrend,
                'dailyRevenue'      => $dailyRevenue,
                'daysInMonth'       => $daysInMonth,
                'currentDayInMonth' => (int) $now->day,
                'currentMonthLabel' => $now->translatedFormat('M Y'),
                'occupancyData'     => array_values($occupancyData),
                'recentActivity'    => $recentActivity,
                'gym_traffic'       => SystemSetting::get('gym_traffic', 'Low Occupancy'),
                'info_banners'      => InfoBanner::ordered()->get()->map(fn ($b) => [
                    'id'         => $b->id,
                    'message'    => $b->message,
                    'is_active'  => $b->is_active,
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

            $facility->load(['prices' => fn ($query) => $query->orderBy('sort_order')]);
            return Inertia::render('Admin/Facilities/Pricing', [
                'facility' => ['id' => $facility->id, 'name' => $facility->name],
                'prices'   => $facility->prices->map(fn ($p) => [
                    'id'               => $p->id,
                    'user_category'    => $p->user_category,
                    'label'            => $p->label,
                    'price'            => $p->price,
                    'duration_minutes' => $p->duration_minutes ?? 60,
                    'schedule_type'    => $p->schedule_type,
                    'applicable_days'  => $p->applicable_days,
                    'starts_at'        => $p->starts_at ? substr($p->starts_at, 0, 5) : null,
                    'ends_at'          => $p->ends_at ? substr($p->ends_at, 0, 5) : null,
                    'starts_on'        => $p->starts_on?->format('Y-m-d'),
                    'ends_on'          => $p->ends_on?->format('Y-m-d'),
                    'notes'            => $p->notes,
                    'sort_order'       => $p->sort_order,
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

        // System Settings
        Route::put('settings/gym-traffic', function (\Illuminate\Http\Request $request) {
            $request->validate(['value' => ['required', 'in:Low Occupancy,Medium Occupancy,High Occupancy,We Are Close']]);
            SystemSetting::set('gym_traffic', $request->value);
            return back();
        })->name('settings.gym-traffic.update');

        // Info Banners (mutation-only; index rendered inside admin.news.index)
        Route::post('info-banners',               [InfoBannerController::class, 'store'])   ->name('info-banners.store');
        Route::put('info-banners/{infoBanner}',   [InfoBannerController::class, 'update'])  ->name('info-banners.update');
        Route::delete('info-banners/{infoBanner}',[InfoBannerController::class, 'destroy']) ->name('info-banners.destroy');
        Route::post('info-banners/reorder',       [InfoBannerController::class, 'reorder']) ->name('info-banners.reorder');

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
