<?php

namespace App\Http\Controllers;

use App\Http\Resources\Public\FacilityResource;
use App\Http\Resources\Public\NewsResource;
use App\Http\Resources\Public\PromoCarouselResource;
use App\Http\Resources\Public\ReelResource;
use App\Http\Resources\Public\SponsorLogoResource;
use App\Models\Facility;
use App\Models\MembershipPlan;
use App\Models\News;
use App\Models\PromoCarousel;
use App\Models\Reel;
use App\Models\Review;
use App\Models\SponsorLogo;
use App\Models\Testimonial;
use Inertia\Inertia;
use Inertia\Response;

class HomeController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('HomePage', [
            'heroImageUrl' => $this->heroImageUrl(),
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
            'promos' => PromoCarouselResource::collection(
                PromoCarousel::active()->ordered()->get()
            )->resolve(),
            'sponsors' => SponsorLogoResource::collection(
                SponsorLogo::active()->ordered()->get()
            )->resolve(),
            'news' => NewsResource::collection(
                News::published()->with('category')->latest('published_at')->take(7)->get()
            )->resolve(),
            'reels' => ReelResource::collection(
                Reel::active()->latest()->take(8)->get()
            )->resolve(),
            'facilities' => FacilityResource::collection(
                Facility::active()->with('category', 'prices')->orderBy('sort_order')->get()
            )->resolve(),
            'testimonials' => Testimonial::active()->ordered()->with('media')->get()->map(fn ($t) => [
                'id' => $t->id,
                'image' => $t->imageUrl(),
                'quote' => $t->quote,
                'authorName' => $t->author_name,
                'authorRole' => $t->author_role,
                'authorLogo' => $t->logoUrl(),
            ])->values()->all(),
            'reviews' => Review::approved()->latest()->take(10)->get()->map(fn ($r) => [
                'id' => $r->id,
                'reviewer_name' => $r->reviewer_name ?? 'Guest',
                'rating' => $r->rating,
                'text' => $r->text,
            ])->values()->all(),
        ]);
    }

    private function heroImageUrl(): string
    {
        $source = '/assets/hero/Hero.avif';
        $path = public_path('assets/hero/Hero.avif');

        if (! is_file($path)) {
            return $source.'?v=missing';
        }

        $fingerprint = sha1_file($path) ?: (string) filemtime($path);

        return $source.'?v='.rawurlencode($fingerprint);
    }

}
