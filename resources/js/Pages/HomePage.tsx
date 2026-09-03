import Hero from "@/Components/Landing/Hero";
import {
    HomepageEntranceProvider,
    useHomepageEntranceSignal,
} from "@/Components/Landing/HomepageEntranceContext";
import HomepageMediaPrimer from "@/Components/Landing/HomepageMediaPrimer";
import Navbar from "@/Components/Landing/Navbar";
import SectionTwo from "@/Components/Landing/SectionTwo";
import SectionThree from "@/Components/Landing/SectionThree";
import SectionFour from "@/Components/Landing/SectionFour";
import SectionFive from "@/Components/Landing/SectionFive";
import SectionSix from "@/Components/Landing/SectionSix";
import SectionSeven from "@/Components/Landing/SectionSeven";
import DeferredSectionEight from "@/Components/Landing/DeferredSectionEight";
import Footer from "@/Components/Landing/Footer";
import SeoHead from "@/Components/SeoHead";
import { usePage } from "@inertiajs/react";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import type { MembershipPlanItem, PageProps } from "@/types";
import type { PublicFacilityReservation } from "@/lib/facilityReservation";
import type { CarouselImage } from "@/Components/Landing/ImageCarousel";
import type { SponsorItem } from "@/Components/Landing/LogoMarquee";
import type { NewsItem } from "@/Components/Landing/NewsCard";
import type { ReelItem } from "@/Components/Landing/ReelCard";
import type {
    PublicTestimonial,
    PublicReview,
} from "@/Components/Landing/SectionSeven";

interface HomeFacility {
    id: number;
    name: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    price_range?: string | null;
    reservation?: PublicFacilityReservation | null;
}

type HomeProps = PageProps<{
    heroImageUrl: string;
    membershipPlans?: MembershipPlanItem[];
    promos?: CarouselImage[];
    sponsors?: SponsorItem[];
    news?: NewsItem[];
    reels?: ReelItem[];
    testimonials?: PublicTestimonial[];
    reviews?: PublicReview[];
    facilities?: HomeFacility[];
}>;

function FlashToast() {
    const { flash } = usePage<HomeProps>().props;
    const message = flash?.success ?? flash?.error ?? null;
    const isError = !flash?.success && !!flash?.error;

    const [visible, setVisible] = useState(!!message);

    useEffect(() => {
        if (!message) return;
        setVisible(true);
        const t = setTimeout(() => setVisible(false), 5000);
        return () => clearTimeout(t);
    }, [message]);

    if (!visible || !message) return null;

    return (
        <div
            className={`fixed bottom-6 left-1/2 z-[500] -translate-x-1/2 flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-2xl shadow-black/40 animate-fade-in-up bg-[#0d1422] ${
                isError ? "border-rose-500/25" : "border-emerald-500/25"
            }`}
        >
            {isError ? (
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-400" />
            ) : (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
            )}
            <p className="font-bdo text-sm font-medium text-white">{message}</p>
            <button
                type="button"
                onClick={() => setVisible(false)}
                className="ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/70"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

function HomepageHero({ heroImageUrl }: { heroImageUrl: string }) {
    const signalEntranceReady = useHomepageEntranceSignal();

    return (
        <Hero
            heroImageSource={heroImageUrl}
            onEntranceReady={signalEntranceReady}
        />
    );
}

export default function HomePage() {
    const {
        heroImageUrl,
        membershipPlans,
        promos,
        sponsors,
        news,
        reels,
        testimonials,
        reviews,
        facilities = [],
    } = usePage<HomeProps>().props;
    return (
        <HomepageEntranceProvider>
            <SeoHead />
            <HomepageMediaPrimer />
            <main className="landing-page-canvas relative">
                <Navbar activeSection="Home" />
                <div className="home-hero-section-reveal">
                    <HomepageHero heroImageUrl={heroImageUrl} />
                    <div className="home-section-two-curtain">
                        <SectionTwo
                            membershipPlans={membershipPlans}
                            promos={promos}
                            sponsors={sponsors}
                        />
                    </div>
                </div>
                <div className="home-post-section-two-flow">
                    <SectionThree />
                    <SectionFour facilities={facilities} />
                    <div className="home-post-section-four-flow">
                        <SectionFive news={news} reels={reels} />
                        <SectionSix facilities={facilities} />
                        <SectionSeven
                            testimonials={testimonials}
                            reviews={reviews}
                        />
                    </div>
                </div>
            </main>
            <div className="home-footer-reveal-root homepage-footer-reveal-root">
                <div className="home-footer-reveal-stage">
                    <DeferredSectionEight />
                </div>
                <div className="home-footer-reveal-footer">
                    <Footer />
                </div>
            </div>
            <FlashToast />
        </HomepageEntranceProvider>
    );
}
