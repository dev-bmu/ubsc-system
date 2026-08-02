import GymTrafficBadge from "@/Components/Landing/GymTrafficBadge";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import ImageCarousel, {
    type CarouselImage,
} from "@/Components/Landing/ImageCarousel";
import LogoMarquee, {
    type SponsorItem,
} from "@/Components/Landing/LogoMarquee";
import MembershipModal from "@/Components/Landing/MembershipModal";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import SectionDivider from "@/Components/Landing/SectionDivider";
import SectionTwoStars from "@/Components/Landing/SectionTwoStars";
import type { MembershipPlanItem, MembershipPlanTier } from "@/types";
import useEmblaCarousel from "embla-carousel-react";
import { Plus, Crown } from "lucide-react";
import {
    type CSSProperties,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import "./MembershipPlanCard.css";

const MEMBERSHIP_TIER_LABELS: Record<MembershipPlanTier, string> = {
    hemat: "Hemat",
    favorit: "Favorit",
    performa: "Performa",
    eksklusif: "Eksklusif",
};

const MEMBERSHIP_TIER_RANK: Record<MembershipPlanTier, number> = {
    hemat: 0,
    favorit: 1,
    performa: 2,
    eksklusif: 3,
};

function normalizeMembershipTier(plan: MembershipPlanItem): MembershipPlanTier {
    const rawTier = String(
        (plan as MembershipPlanItem & { tier?: string | null }).tier ?? "",
    )
        .trim()
        .toLocaleLowerCase("id-ID");

    if (
        rawTier === "hemat" ||
        rawTier === "favorit" ||
        rawTier === "performa" ||
        rawTier === "eksklusif"
    ) {
        return rawTier;
    }

    return "favorit";
}

const DUMMY_IMAGES: CarouselImage[] = [
    {
        id: "1",
        src: "/assets/images/poster-gym-konten-program-ub-sport-center.avif",
        alt: "Modern gym program",
    },
    {
        id: "2",
        src: "/assets/images/poster-sepakbola-konten-program-ub-sport-center.avif",
        alt: "Daily training program",
    },
    {
        id: "3",
        src: "/assets/images/poster-basket-konten-program-ub-sport-center.avif",
        alt: "Court sport program",
    },
    {
        id: "4",
        src: "/assets/images/poster-mahal-konten-program-ub-sport-center.avif",
        alt: "Group fitness program",
    },
];

const FALLBACK_MEMBERSHIP_PLAN_BASE = {
    name: "Latihan Konsisten & Fleksibel",
    description:
        "Membership bulanan untuk akses latihan fleksibel dengan fasilitas modern UB Sport Center.",
    savings_label: "Hemat 20%",
    cta_label: "Mulai Membership",
    card_image_url: "/assets/images/poster-gym-konten-program-ub-sport-center.avif",
    price: 150000,
    compare_at_price: 187500,
    discount_percent: 20,
    duration_months: 1,
    features: [
        "Akses Gym 24 Jam",
        "Fasilitas Lengkap",
        "Jadwal Fleksibel",
        "1 Lokasi Aktif",
    ],
    is_active: true,
    active_members_count: 0,
} satisfies Omit<
    MembershipPlanItem,
    "id" | "tier" | "public_badge" | "is_primary" | "sort_order"
>;

export const FALLBACK_MEMBERSHIP_PLANS: MembershipPlanItem[] = [
    {
        ...FALLBACK_MEMBERSHIP_PLAN_BASE,
        id: 1,
        tier: "hemat",
        public_badge: "Hemat",
        is_primary: false,
        sort_order: 1,
    },
    {
        ...FALLBACK_MEMBERSHIP_PLAN_BASE,
        id: 2,
        tier: "favorit",
        public_badge: "Favorit",
        is_primary: true,
        sort_order: 2,
    },
    {
        ...FALLBACK_MEMBERSHIP_PLAN_BASE,
        id: 3,
        tier: "performa",
        public_badge: "Performa",
        is_primary: false,
        sort_order: 3,
    },
    {
        ...FALLBACK_MEMBERSHIP_PLAN_BASE,
        id: 4,
        tier: "eksklusif",
        public_badge: "Eksklusif",
        is_primary: false,
        sort_order: 4,
    },
];

const CURTAIN_STEPS = [
    100,
    76,
    52,
    64,
    88,
] as const;

interface SectionTwoProps {
    membershipPlans?: MembershipPlanItem[];
    promos?: CarouselImage[];
    sponsors?: SponsorItem[];
}

function formatPrice(amount: number) {
    return new Intl.NumberFormat("id-ID").format(amount);
}

function durationSuffix(months: number) {
    if (months === 12) return "Tahun";
    if (months === 1) return "Bulan";
    return `${months} Bulan`;
}

function durationLead(plan: MembershipPlanItem) {
    if (plan.duration_lead) return plan.duration_lead;
    if (plan.duration_months === 12) return "Membership tahunan untuk";
    if (plan.duration_months === 1) return "Membership bulanan untuk";
    return `Membership ${plan.duration_months} bulan untuk`;
}

function planFeatures(plan: MembershipPlanItem) {
    const features = plan.features?.filter(Boolean) ?? [];
    const fallback = ["Akses gym", "Program latihan", "Fasilitas modern", "Member support"];
    return features.length > 0 ? features : fallback;
}

function planDiscount(plan: MembershipPlanItem) {
    const price = Number(plan.price);
    const compareAtPrice = Number(plan.compare_at_price);

    if (!Number.isFinite(compareAtPrice) || compareAtPrice <= price) {
        return null;
    }

    return {
        compareAtPrice,
        percentage: Math.round(((compareAtPrice - price) / compareAtPrice) * 100),
    };
}

function SectionTwoCurtainEdge() {
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        const section = root?.closest("section") as HTMLElement | null;
        const content = section?.querySelector<HTMLElement>(
            ".section-two-curtain-content",
        );
        const postSectionFlow = document.querySelector<HTMLElement>(
            ".home-post-section-two-flow",
        );
        const curtainSteps = Array.from(
            root?.querySelectorAll<HTMLElement>(
                ".section-two-curtain-edge__step",
            ) ?? [],
        );

        if (!root || !section || !content || curtainSteps.length === 0) return;

        let frame = 0;
        let disposed = false;
        let needsMeasure = true;
        let isNearCurtain = true;
        let viewportWidth = 1;
        let viewportHeight = 1;
        let sectionTop = 0;
        let followStart = 0.22;
        let followHold = 0.62;
        let maxFollow = 0;
        let lightweightCurtain = false;
        let renderedTravel = 0;
        let hasRenderedTravel = false;
        let lastFrameTime = 0;
        let curtainTransitioning = false;
        let lastTravel = -1;
        const lastStepScales = curtainSteps.map(() => -1);
        let lastFollowOffset = Number.NaN;
        const measuredSibling = section.previousElementSibling;
        const heroReveal = section.closest<HTMLElement>(
            ".home-hero-section-reveal",
        );
        const isIOSWebKit =
            /iP(?:hone|ad|od)/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

        // Clear inline styles left by a hot reload of the previous, heavier
        // implementation before the first optimized frame is measured.
        postSectionFlow?.style.removeProperty("transform");
        postSectionFlow?.style.removeProperty("position");
        postSectionFlow?.style.removeProperty("top");
        postSectionFlow?.style.removeProperty("will-change");

        const measure = () => {
            viewportWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;
            viewportHeight =
                root.offsetHeight ||
                document.documentElement.clientHeight ||
                window.innerHeight ||
                1;
            sectionTop =
                section.getBoundingClientRect().top +
                Math.max(
                    0,
                    window.scrollY || document.documentElement.scrollTop || 0,
                );
            const isMobile = viewportWidth < 640;
            const isTabletPortrait =
                viewportWidth >= 640 &&
                viewportWidth < 1180 &&
                viewportHeight > viewportWidth;
            const isTabletLandscape =
                viewportWidth >= 900 &&
                viewportWidth < 1440 &&
                viewportHeight <= viewportWidth;
            const followRatio = isMobile
                ? 0.72
                : isTabletPortrait
                    ? 0.68
                    : isTabletLandscape
                        ? 0.7
                        : 0.78;
            const followInset = isMobile
                ? 150
                : isTabletPortrait
                    ? 190
                    : isTabletLandscape
                        ? 170
                        : 124;

            followStart = isMobile
                ? 0.18
                : isTabletPortrait || isTabletLandscape
                    ? 0.2
                    : 0.22;
            followHold = isMobile
                ? 0.58
                : isTabletPortrait || isTabletLandscape
                    ? 0.6
                    : 0.62;

            const holdShape = Math.sin(followHold * Math.PI);
            const measuredMaxFollow = Math.max(
                0,
                followHold * viewportHeight * followRatio - followInset,
            ) * Math.pow(holdShape, 0.68);
            const nextLightweightCurtain =
                isIOSWebKit && viewportWidth < 1180;
            if (nextLightweightCurtain !== lightweightCurtain) {
                hasRenderedTravel = false;
                lastFrameTime = 0;
            }
            lightweightCurtain = nextLightweightCurtain;
            maxFollow = lightweightCurtain ? 0 : measuredMaxFollow;

            // Pull later sections into the final resting position once, outside
            // the visible transition. The old implementation translated the
            // complete Sections 3-7 subtree on every frame, which forced an
            // enormous WebKit compositing surface on iPhone.
            section.style.marginBottom = maxFollow > 0 ? `${-maxFollow}px` : "0px";
            needsMeasure = false;
        };

        const update = (now = window.performance.now()) => {
            frame = 0;
            if (!isNearCurtain && !needsMeasure) return;
            if (needsMeasure) measure();

            const scrollTop = Math.max(
                0,
                window.scrollY || document.documentElement.scrollTop || 0,
            );
            const sectionViewportTop = sectionTop - scrollTop;
            const targetTravel = Math.min(
                1,
                Math.max(
                    0,
                    (viewportHeight - sectionViewportTop) / viewportHeight,
                ),
            );
            let travel = targetTravel;

            if (lightweightCurtain) {
                if (!hasRenderedTravel) {
                    renderedTravel = targetTravel;
                    hasRenderedTravel = true;
                } else {
                    const elapsed =
                        lastFrameTime > 0 && now - lastFrameTime < 80
                            ? Math.max(1, now - lastFrameTime)
                            : 1000 / 60;
                    const difference = targetTravel - renderedTravel;

                    if (Math.abs(difference) <= 0.00012) {
                        renderedTravel = targetTravel;
                    } else {
                        // WebKit's native momentum scroll can expose uneven
                        // scroll-event intervals. Sampling scrollY on every
                        // animation frame and easing only the tiny frame gap
                        // keeps the curtain visually locked to the gesture.
                        const response = difference > 0 ? 46 : 40;
                        const blend = 1 - Math.exp((-response * elapsed) / 1000);
                        renderedTravel += difference * blend;
                    }
                }

                travel = Math.min(1, Math.max(0, renderedTravel));
            } else {
                renderedTravel = targetTravel;
                hasRenderedTravel = true;
            }

            lastFrameTime = now;
            const shape = Math.sin(travel * Math.PI);

            if (Math.abs(travel - lastTravel) > 0.00008) {
                const pixelRatio = Math.min(
                    3,
                    window.devicePixelRatio || 1,
                );
                curtainSteps.forEach((step, index) => {
                    const minimumHeight = CURTAIN_STEPS[index] / 100;
                    const shapeScale = 1 - shape * (1 - minimumHeight);
                    let scale = travel * shapeScale;

                    if (lightweightCurtain) {
                        const visibleHeight = scale * viewportHeight;
                        scale =
                            Math.round(visibleHeight * pixelRatio) /
                            pixelRatio /
                            viewportHeight;
                    }

                    if (Math.abs(scale - lastStepScales[index]) <= 0.00004) {
                        return;
                    }

                    step.style.transform = `translate3d(0, 0, 0) scaleY(${scale})`;
                    lastStepScales[index] = scale;
                });
                lastTravel = travel;
            }

            const nextCurtainTransitioning =
                lightweightCurtain && travel > 0.001 && travel < 0.999;
            if (nextCurtainTransitioning !== curtainTransitioning) {
                curtainTransitioning = nextCurtainTransitioning;
                heroReveal?.classList.toggle(
                    "is-curtain-transitioning",
                    curtainTransitioning,
                );
            }

            const followProgress = Math.min(
                1,
                Math.max(0, (travel - followStart) / (followHold - followStart)),
            );
            const followEase =
                followProgress * followProgress * (3 - 2 * followProgress);
            const rawFollowOffset = -maxFollow * followEase;
            const pixelRatio = Math.min(3, window.devicePixelRatio || 1);
            const followOffset =
                Math.round(rawFollowOffset * pixelRatio) / pixelRatio;
            const followChanged =
                !Number.isFinite(lastFollowOffset) ||
                Math.abs(followOffset - lastFollowOffset) > 0.05;

            if (followChanged) {
                section.style.setProperty(
                    "--section-two-curtain-follow",
                    `${followOffset}px`,
                );
                if (lightweightCurtain) {
                    content.style.removeProperty("transform");
                    content.style.removeProperty("will-change");
                } else {
                    content.style.transform = `translate3d(0, ${followOffset}px, 0)`;
                    if (followProgress > 0.001 && followProgress < 0.999) {
                        content.style.willChange = "transform";
                    } else {
                        content.style.removeProperty("will-change");
                    }
                }
                lastFollowOffset = followOffset;
            }

            if (
                lightweightCurtain &&
                Math.abs(targetTravel - renderedTravel) > 0.00012
            ) {
                frame = window.requestAnimationFrame(update);
            } else {
                lastFrameTime = 0;
            }
        };

        const requestUpdate = () => {
            if (disposed || frame) return;
            frame = window.requestAnimationFrame(update);
        };

        const requestMeasure = () => {
            if (disposed) return;
            needsMeasure = true;
            requestUpdate();
        };

        const requestViewportMeasure = () => {
            if (disposed) return;
            const nextWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;

            // Safari emits resize events while its address bar expands and
            // collapses. Height-only remeasurement feeds that movement back
            // into the scroll-linked geometry and looks like page shaking.
            if (isIOSWebKit && Math.abs(nextWidth - viewportWidth) < 1) return;
            requestMeasure();
        };

        const proximityObserver =
            "IntersectionObserver" in window
                ? new IntersectionObserver(
                    ([entry]) => {
                        isNearCurtain = entry.isIntersecting;
                        if (isNearCurtain) {
                            requestMeasure();
                        }
                    },
                    { rootMargin: "100% 0px 100% 0px" },
                )
                : null;

        proximityObserver?.observe(section);

        const resizeObserver =
            "ResizeObserver" in window
                ? new ResizeObserver(requestViewportMeasure)
                : null;

        if (measuredSibling instanceof Element) {
            resizeObserver?.observe(measuredSibling);
        }

        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestViewportMeasure, { passive: true });
        window.addEventListener("load", requestMeasure, { once: true });
        void document.fonts?.ready.then(requestMeasure);

        return () => {
            disposed = true;
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestViewportMeasure);
            window.removeEventListener("load", requestMeasure);
            proximityObserver?.disconnect();
            resizeObserver?.disconnect();
            section.style.removeProperty("--section-two-curtain-follow");
            section.style.removeProperty("margin-bottom");
            content.style.removeProperty("transform");
            content.style.removeProperty("will-change");
            root.style.removeProperty("transform");
            curtainSteps.forEach((step, index) => {
                step.style.removeProperty("transform");
                lastStepScales[index] = -1;
            });
            heroReveal?.classList.remove("is-curtain-transitioning");
            postSectionFlow?.style.removeProperty("transform");
            postSectionFlow?.style.removeProperty("position");
            postSectionFlow?.style.removeProperty("top");
            postSectionFlow?.style.removeProperty("will-change");
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <div
            ref={rootRef}
            className="section-two-curtain-edge section-two-curtain-edge--direct-steps"
            aria-hidden="true"
        >
            {CURTAIN_STEPS.map((_, index) => (
                <span
                    key={index}
                    className="section-two-curtain-edge__step"
                    style={{
                        left: `calc(${(index * 100) / CURTAIN_STEPS.length}% - ${index === 0 ? 0 : 1}px)`,
                        width: `calc(${100 / CURTAIN_STEPS.length}% + 2px)`,
                    }}
                />
            ))}
        </div>
    );
}

function SectionTwoHeadline() {
    const headline =
        "Area gym ini dirancang sebagai ruang latihan yang nyaman dan fungsional untuk mendukung, latihan kekuatan, dan kardio bagi seluruh pengguna UB Sport Center\u00ae.";

    return (
        <h2
            className="home-section-heading home-section-two-headline section-two-headline-weight max-w-[1100px] text-left font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-[980px] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:max-w-[1120px] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
        >
            <ScrollTextReveal
                split="lines"
                delay={110}
                stagger={95}
                className="home-section-two-headline-reveal"
            >
                {headline}
            </ScrollTextReveal>
        </h2>
    );
}

interface MembershipPlanCarouselProps {
    plans: MembershipPlanItem[];
    onSelectPlan?: (plan: MembershipPlanItem) => void;
    selectedPlanId?: number | null;
    eagerFirstImage?: boolean;
}

export function MembershipPlanCarousel({
    plans,
    onSelectPlan,
    selectedPlanId = null,
    eagerFirstImage = true,
}: MembershipPlanCarouselProps) {
    const orderedPlans = useMemo(
        () =>
            [...plans].sort(
                (a, b) =>
                    MEMBERSHIP_TIER_RANK[normalizeMembershipTier(a)] -
                        MEMBERSHIP_TIER_RANK[normalizeMembershipTier(b)] ||
                    a.sort_order - b.sort_order ||
                    a.price - b.price ||
                    a.id - b.id,
            ),
        [plans],
    );
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        slidesToScroll: 1,
        dragFree: false,
        skipSnaps: false,
        loop: false,
        duration: 20,
        dragThreshold: 10,
    });
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [snapCount, setSnapCount] = useState(orderedPlans.length);

    const onSelect = useCallback(() => {
        if (!emblaApi) return;
        setSelectedIndex(emblaApi.selectedScrollSnap());
        setSnapCount(emblaApi.scrollSnapList().length);
    }, [emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;
        onSelect();
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);

        return () => {
            emblaApi.off("select", onSelect);
            emblaApi.off("reInit", onSelect);
        };
    }, [emblaApi, onSelect]);

    useEffect(() => {
        if (!emblaApi || selectedPlanId === null) return;
        const nextIndex = orderedPlans.findIndex(
            (plan) => plan.id === selectedPlanId,
        );
        if (nextIndex < 0 || nextIndex === emblaApi.selectedScrollSnap()) return;
        emblaApi.scrollTo(nextIndex);
    }, [emblaApi, orderedPlans, selectedPlanId]);

    if (orderedPlans.length === 0) {
        return (
            <div
                role="status"
                className="flex min-h-[24rem] w-full flex-col justify-end border-y border-black/12 px-1 py-6 text-left"
                data-membership-plan-empty
            >
                <span className="section-label-diamond mb-5" />
                <p className="font-bdo text-[clamp(1.35rem,2vw,2rem)] font-medium leading-[0.98] tracking-[-0.055em] text-black">
                    Paket membership sedang disiapkan.
                </p>
                <p className="mt-3 max-w-[22rem] font-bdo text-[12px] leading-[1.45] text-black/48">
                    Tim UB Sport Center sedang menyiapkan penawaran terbaru.
                    Silakan kembali beberapa saat lagi.
                </p>
            </div>
        );
    }

    return (
        <div className="membership-plan-carousel w-full" data-membership-plan-carousel>
            <div ref={emblaRef} className="membership-plan-carousel__viewport">
                <div className="membership-plan-carousel__track">
                    {orderedPlans.map((plan, index) => (
                        <div
                            key={plan.id}
                            className="membership-plan-carousel__slide"
                        >
                            <MembershipPlanCard
                                plan={plan}
                                eager={eagerFirstImage && index <= 1}
                                isActive={selectedIndex === index}
                                staticText={index !== 0}
                                onSelectPlan={onSelectPlan}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {snapCount > 1 && (
                <div className="mt-2.5 flex items-center justify-center">
                    <div className="inline-flex items-center gap-1">
                        {Array.from({ length: snapCount }).map((_, index) => (
                            <button
                                key={index}
                                type="button"
                                onClick={() => emblaApi?.scrollTo(index)}
                                className="group relative flex h-3 w-3 items-center justify-center rounded-full outline-none transition"
                                aria-label={`Lihat paket ${index + 1}`}
                            >
                                <span
                                    className={`absolute inset-0 rounded-full transition duration-500 ${selectedIndex === index
                                        ? "scale-95 bg-[#FF0000]/12 shadow-[0_0_12px_rgba(255,0,0,0.16)]"
                                        : "scale-75 bg-transparent"
                                        }`}
                                />
                                <span
                                    className={`relative rounded-full transition duration-500 ${selectedIndex === index
                                        ? "h-2 w-2 scale-100 bg-[#FF0000] shadow-[0_0_9px_rgba(255,0,0,0.38)]"
                                        : "h-1.5 w-1.5 scale-90 bg-slate-400/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8),0_2px_7px_rgba(15,23,42,0.11)] group-hover:scale-100 group-hover:bg-slate-500/80"
                                        }`}
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const MembershipPlanCard = memo(function MembershipPlanCard({
    plan,
    eager,
    isActive,
    staticText,
    onSelectPlan,
}: {
    plan: MembershipPlanItem;
    eager: boolean;
    isActive: boolean;
    staticText: boolean;
    onSelectPlan?: (plan: MembershipPlanItem) => void;
}) {
    const image =
        plan.card_image_url ||
        "/assets/images/poster-gym-konten-program-ub-sport-center.avif";
    const tier = normalizeMembershipTier(plan);
    const features = planFeatures(plan);
    const badge = MEMBERSHIP_TIER_LABELS[tier];
    const discount = planDiscount(plan);
    const savings = discount
        ? `Hemat ${discount.percentage}%`
        : plan.savings_label || "Paket Aktif";
    const cta = plan.cta_label || "Mulai Membership";
    const formattedPrice = formatPrice(plan.price);
    const formattedCompareAtPrice = discount
        ? formatPrice(discount.compareAtPrice)
        : null;
    const priceScale = Math.max(
        0.72,
        Math.min(1, 7 / Math.max(formattedPrice.length, 7)),
    );

    return (
        <article
            className="group overflow-hidden rounded-[5px]"
            data-membership-plan-card
            data-membership-tier={tier}
            data-membership-slide-active={isActive ? "true" : "false"}
            data-membership-text-static={staticText ? "true" : "false"}
            aria-label={`${plan.name}, ${formattedCompareAtPrice ? `harga normal Rp ${formattedCompareAtPrice}, ` : ""}harga membership Rp ${formattedPrice} per ${durationSuffix(plan.duration_months)}`}
        >
            <div className="membership-plan-card__media relative h-[78px] overflow-hidden rounded-[5px] bg-slate-100 sm:h-[140px] md:h-[152px] xl:h-[78px]">
                <img
                    src={image}
                    alt={plan.name}
                    className="h-full w-full object-cover object-[center_45%] transition-transform duration-700 ease-out group-hover:scale-[1.025]"
                    loading={eager ? "eager" : "lazy"}
                    decoding="async"
                    width={960}
                    height={320}
                    draggable={false}
                />
            </div>

            <div
                className="membership-plan-card__shell mt-3 overflow-hidden rounded-[5px] text-white transition-[box-shadow,transform] duration-500 ease-out group-hover:-translate-y-0.5 xl:mt-3"
            >
                <div className="membership-plan-card__main relative m-2.5 min-h-[218px] overflow-hidden rounded-[5px] bg-white px-3.5 py-3.5 text-black shadow-[0_18px_45px_rgba(0,0,0,0.16)] sm:m-3 sm:min-h-[232px] sm:px-5 sm:py-[18px] md:min-h-[240px] md:px-6 xl:m-[10px] xl:min-h-[202px] xl:px-5 xl:py-[14px]">
                    <span
                        aria-hidden="true"
                        className="membership-plan-card__accent absolute left-0 top-0 h-[2px] w-[clamp(3rem,18%,4.5rem)]"
                    />
                    <div className="membership-plan-card__header relative flex flex-col gap-3 sm:block sm:pr-32 xl:pr-[84px]">
                        <div className="max-w-[360px] xl:max-w-[280px]">
                            <ScrollTextReveal
                                as="p"
                                delay={80}
                                staticReveal={staticText}
                                className="membership-plan-card__title-line font-bdo text-black/72"
                            >
                                {durationLead(plan)}
                            </ScrollTextReveal>
                            <ScrollTextReveal
                                as="h3"
                                delay={150}
                                staticReveal={staticText}
                                className="membership-plan-card__title-line membership-plan-card__title-line--tier mt-1 font-bdo"
                            >
                                {plan.name}
                            </ScrollTextReveal>
                        </div>
                        <span
                            className="membership-plan-favorite inline-flex w-fit items-center gap-[6.9px] rounded-[5px] px-1.5 py-0.5 font-bdo text-[10.35px] font-semibold sm:absolute sm:right-0 sm:top-1 sm:text-[12.65px] xl:text-[10.35px]"
                            aria-label={`Paket membership ${badge}`}
                        >
                            <Crown
                                aria-hidden="true"
                                className="membership-plan-favorite-icon shrink-0"
                                fill="none"
                                strokeWidth={2.2}
                            />
                            <ScrollTextReveal
                                delay={210}
                                staticReveal={staticText}
                                className="membership-plan-favorite-text"
                            >
                                {badge}
                            </ScrollTextReveal>
                        </span>
                    </div>

                    <div
                        className={`membership-plan-card__purchase flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between xl:gap-3 ${discount
                            ? "mt-5 sm:mt-7 xl:mt-8"
                            : "mt-7 sm:mt-9 xl:mt-12"
                            }`}
                    >
                        <div className="min-w-0 flex-1">
                            {formattedCompareAtPrice && (
                                <div className="membership-plan-price-origin">
                                    <ScrollTextReveal
                                        delay={240}
                                        staticReveal={staticText}
                                    >
                                        Harga normal
                                    </ScrollTextReveal>
                                    <span className="membership-plan-price-origin__price">
                                        <ScrollTextReveal
                                            delay={270}
                                            staticReveal={staticText}
                                            className="membership-plan-price-origin__prefix"
                                        >
                                            Rp
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            delay={285}
                                            staticReveal={staticText}
                                            className="membership-plan-price-origin__value"
                                        >
                                            {formattedCompareAtPrice}
                                        </ScrollTextReveal>
                                    </span>
                                </div>
                            )}
                            <div className="flex max-w-full flex-nowrap items-baseline gap-0 overflow-visible whitespace-nowrap">
                                <ScrollTextReveal
                                    delay={260}
                                    staticReveal={staticText}
                                    className="membership-plan-price-affix mr-1 shrink-0 font-bdo text-[11px] font-semibold leading-none sm:text-[13px] xl:text-[11px]"
                                >
                                    Rp
                                </ScrollTextReveal>
                                <ScrollTextReveal
                                    delay={300}
                                    staticReveal={staticText}
                                    className="membership-plan-price-value max-w-full pr-[0.04em] font-clash text-[calc(clamp(27px,6.9vw,37px)*var(--membership-price-scale))] font-[650] leading-none tracking-[-0.07em] sm:text-[calc(clamp(31px,5.4vw,37px)*var(--membership-price-scale))] md:text-[calc(clamp(32px,4.5vw,40px)*var(--membership-price-scale))] xl:text-[calc(clamp(27px,2.1vw,32px)*var(--membership-price-scale))]"
                                    style={
                                        {
                                            "--membership-price-scale": priceScale,
                                        } as CSSProperties
                                    }
                                >
                                    {formattedPrice}
                                </ScrollTextReveal>
                                <ScrollTextReveal
                                    delay={350}
                                    staticReveal={staticText}
                                    className="membership-plan-price-affix ml-px shrink-0 font-bdo text-[11px] font-semibold leading-none sm:text-[13px] xl:text-[11px]"
                                >
                                    {`/${durationSuffix(plan.duration_months)}`}
                                </ScrollTextReveal>
                            </div>
                            <span className="membership-plan-card__savings mt-4 inline-flex rounded-full bg-[#CFFFC9] px-3.5 py-1.5 font-bdo text-[11px] font-semibold text-[#168C3D] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:mt-5 sm:px-4 sm:py-2 sm:text-xs xl:mt-4 xl:px-3.5 xl:py-1.5 xl:text-[10px]">
                                <ScrollTextReveal
                                    delay={410}
                                    staticReveal={staticText}
                                >
                                    {savings}
                                </ScrollTextReveal>
                            </span>
                        </div>

                        {onSelectPlan ? (
                            <button
                                type="button"
                                onClick={() => onSelectPlan(plan)}
                                className="membership-plan-cta relative inline-flex h-11 w-full shrink-0 items-center justify-center overflow-hidden rounded-full border border-black px-6 font-bdo text-sm font-semibold text-white sm:w-auto sm:px-7 xl:h-10 xl:px-6 xl:text-[11px]"
                            >
                                <span
                                    aria-hidden="true"
                                    className="membership-plan-cta__accent"
                                />
                                <ScrollTextReveal
                                    delay={470}
                                    staticReveal={staticText}
                                    className="relative z-10"
                                >
                                    {cta}
                                </ScrollTextReveal>
                            </button>
                        ) : (
                            <a
                                href="/pricing"
                                className="membership-plan-cta relative inline-flex h-11 w-full shrink-0 items-center justify-center overflow-hidden rounded-full border border-black px-6 font-bdo text-sm font-semibold text-white sm:w-auto sm:px-7 xl:h-10 xl:px-6 xl:text-[11px]"
                            >
                                <span
                                    aria-hidden="true"
                                    className="membership-plan-cta__accent"
                                />
                                <ScrollTextReveal
                                    delay={470}
                                    staticReveal={staticText}
                                    className="relative z-10"
                                >
                                    {cta}
                                </ScrollTextReveal>
                            </a>
                        )}
                    </div>
                </div>

                <div className="membership-plan-features grid min-h-0 grid-cols-1 gap-2.5 border-t border-white/10 px-4 pb-5 pt-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3.5 sm:px-6 sm:pb-7 sm:pt-6 xl:min-h-[139px]">
                    {features.map((feature, index) => (
                        <div
                            key={`${feature}-${index}`}
                            className="membership-plan-feature relative grid min-w-0 grid-cols-[12px_minmax(0,1fr)] items-center gap-x-2 px-0 py-3 font-bdo text-[11px] font-medium leading-[1.25] text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.72)_16%,rgba(148,163,184,0.42)_58%,rgba(255,255,255,0))] last:after:hidden sm:bg-transparent sm:p-0 sm:after:hidden"
                        >
                            <Plus className="membership-plan-feature__icon h-2.5 w-2.5 shrink-0" />
                            <ScrollTextReveal
                                delay={170 + index * 55}
                                staticReveal={staticText || isActive}
                                className="membership-plan-feature__label"
                            >
                                {feature}
                            </ScrollTextReveal>
                        </div>
                    ))}
                </div>
            </div>
        </article>
    );
});

export default function SectionTwo({
    membershipPlans,
    promos,
    sponsors,
}: SectionTwoProps) {
    const sectionRef = useRef<HTMLElement>(null);
    const entranceReady = useHomepageEntranceReady();
    const [membershipModalOpen, setMembershipModalOpen] = useState(false);
    const plans = useMemo(
        () =>
            membershipPlans && membershipPlans.length > 0
                ? membershipPlans
                : import.meta.env.DEV
                  ? FALLBACK_MEMBERSHIP_PLANS
                  : [],
        [membershipPlans],
    );
    const defaultPlanId = useMemo(
        () => plans.find((plan) => plan.is_primary)?.id ?? plans[0]?.id ?? null,
        [plans],
    );
    const [selectedMembershipPlanId, setSelectedMembershipPlanId] = useState<
        number | null
    >(defaultPlanId);

    useEffect(() => {
        if (
            selectedMembershipPlanId !== null &&
            plans.some((plan) => plan.id === selectedMembershipPlanId)
        ) {
            return;
        }
        setSelectedMembershipPlanId(defaultPlanId);
    }, [defaultPlanId, plans, selectedMembershipPlanId]);

    const requestMembershipModalOpen = useCallback((planId?: number | null) => {
        if (
            planId !== undefined &&
            planId !== null &&
            plans.some((plan) => plan.id === planId)
        ) {
            setSelectedMembershipPlanId(planId);
        }

        const carousel = sectionRef.current?.querySelector<HTMLElement>(
            "[data-membership-plan-carousel]",
        );
        carousel?.scrollIntoView({ behavior: "auto", block: "center" });
        window.requestAnimationFrame(() => setMembershipModalOpen(true));
    }, [plans]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || !entranceReady) return;

        const elements = Array.from(
            section.querySelectorAll<HTMLElement>(
                "[data-section-two-reveal]",
            ),
        );

        const reveal = (element: HTMLElement) => {
            element.classList.add("is-visible");
        };

        if (
            !("IntersectionObserver" in window) ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            elements.forEach(reveal);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    reveal(entry.target as HTMLElement);
                    observer.unobserve(entry.target);
                });
            },
            {
                threshold: 0.035,
                rootMargin: "0px 0px -3% 0px",
            },
        );

        elements.forEach((element) => observer.observe(element));

        return () => observer.disconnect();
    }, [entranceReady]);

    return (
        <section
            ref={sectionRef}
            id="about"
            className="section-two-curtain relative overflow-x-clip bg-white text-black"
        >
            <SectionTwoCurtainEdge />
            <div className="section-two-curtain-content relative z-10">
                <div className="mx-auto px-[clamp(1.5rem,4.5vw,5.5rem)] pb-16 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14">
                    <div>
                        <SectionDivider
                            number="01"
                            title="Fasilitas Gym"
                            subtitle="01 homepage"
                            theme="light"
                            outerClassName="home-section-two-divider -mx-[clamp(0rem,1.65vw,2rem)]"
                            contentClassName="home-section-two-divider-content px-3"
                        />
                    </div>

                    <div className="mt-12 grid gap-12 md:mt-14 lg:mt-16 xl:mt-14 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-[clamp(3.75rem,5.2vw,7.25rem)] 2xl:gap-[clamp(5rem,6vw,9rem)]">
                        <div
                            data-section-two-reveal
                            className="section-two-object-reveal section-two-object-reveal--left order-2 flex min-w-0 flex-col xl:order-1"
                            style={
                                {
                                    "--section-two-reveal-delay": "90ms",
                                } as CSSProperties
                            }
                        >
                            <div className="hidden items-center gap-4 xl:mb-6 xl:flex xl:gap-3">
                                <span className="section-label-diamond" />
                                <ScrollTextReveal
                                    delay={80}
                                    className="home-section-anchor home-section-two-member-label font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] xl:text-[1.25rem]"
                                >
                                    Gabung Member Sekarang
                                </ScrollTextReveal>
                            </div>

                            <div className="mx-auto w-full max-w-[380px] xl:mx-0 xl:max-w-[420px]">
                                <MembershipPlanCarousel
                                    plans={plans}
                                    selectedPlanId={selectedMembershipPlanId}
                                    onSelectPlan={(plan) =>
                                        requestMembershipModalOpen(plan.id)
                                    }
                                />
                            </div>
                        </div>

                        <div className="order-1 flex min-w-0 flex-col xl:order-2 xl:w-full">
                            <div className="mb-8 flex items-center gap-4 xl:hidden">
                                <span className="section-label-diamond" />
                                <ScrollTextReveal
                                    delay={80}
                                    className="home-section-anchor home-section-two-member-label font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]"
                                >
                                    Gabung Member Sekarang
                                </ScrollTextReveal>
                            </div>

                            <SectionTwoHeadline />

                            <div className="mt-12 flex flex-col gap-5 md:flex-row md:items-center md:justify-between xl:mt-[4.8rem] xl:max-w-[980px] 2xl:max-w-[1120px]">
                                <div
                                    data-section-two-reveal
                                    className="section-two-object-reveal section-two-object-reveal--left"
                                >
                                    <ReservasiButton
                                        label="Daftar Sekarang"
                                        onClick={() =>
                                            requestMembershipModalOpen()
                                        }
                                    />
                                </div>
                                <div
                                    data-section-two-reveal
                                    className="section-two-object-reveal section-two-object-reveal--right md:ml-auto"
                                    style={
                                        {
                                            "--section-two-reveal-delay":
                                                "90ms",
                                        } as CSSProperties
                                    }
                                >
                                    <GymTrafficBadge
                                        animate
                                        disableHover
                                        className="!mt-0 md:!mt-0 xl:!mt-0"
                                    />
                                </div>
                            </div>

                            <div className="mt-14 grid gap-10 md:grid-cols-2 xl:mt-[4.8rem] xl:max-w-[980px] xl:gap-[clamp(3rem,4.2vw,5.5rem)] 2xl:max-w-[1120px]">
                                <div
                                    data-section-two-reveal
                                    className="section-two-object-reveal"
                                >
                                    <ScrollTextReveal
                                        as="h3"
                                        delay={70}
                                        className="font-bdo text-[clamp(1.08rem,1.36vw,1.42rem)] font-medium tracking-[-0.04em] xl:text-[clamp(0.97296066rem,1.22520972vw,1.27926309rem)]"
                                    >
                                        Jadwal
                                    </ScrollTextReveal>
                                    <ScrollTextReveal
                                        as="p"
                                        split="words"
                                        delay={140}
                                        stagger={10}
                                        className="mt-5 max-w-[500px] font-bdo text-[clamp(0.9rem,1.04vw,1.08rem)] font-normal leading-[1.32] tracking-[-0.02em] text-black/50 xl:mt-4 xl:max-w-none xl:text-[clamp(0.81080055rem,0.93692508vw,0.97296066rem)]"
                                    >
                                        UB Sport Center buka setiap hari pukul 06.00 - 22.00 dengan pilihan paket bulanan dan tahunan yang fleksibel serta akses fasilitas lengkap untuk mendukung kebutuhan latihan Anda.
                                    </ScrollTextReveal>
                                </div>
                                <div
                                    data-section-two-reveal
                                    className="section-two-object-reveal"
                                    style={
                                        {
                                            "--section-two-reveal-delay":
                                                "100ms",
                                        } as CSSProperties
                                    }
                                >
                                    <ScrollTextReveal
                                        as="h3"
                                        delay={160}
                                        className="font-bdo text-[clamp(1.08rem,1.36vw,1.42rem)] font-medium tracking-[-0.04em] xl:text-[clamp(0.97296066rem,1.22520972vw,1.27926309rem)]"
                                    >
                                        Maskulin
                                    </ScrollTextReveal>
                                    <ScrollTextReveal
                                        as="p"
                                        split="words"
                                        delay={230}
                                        stagger={10}
                                        className="mt-5 max-w-[540px] font-bdo text-[clamp(0.9rem,1.04vw,1.08rem)] font-normal leading-[1.32] tracking-[-0.02em] text-black/50 xl:mt-4 xl:max-w-none xl:text-[clamp(0.81080055rem,0.93692508vw,0.97296066rem)]"
                                    >
                                        Temukan paket membership terbaik dengan fasilitas modern dan program latihan profesional untuk membantu Anda mencapai target kebugaran secara maksimal.
                                    </ScrollTextReveal>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        data-section-two-reveal
                        className="section-two-object-reveal section-two-object-reveal--media mt-20 xl:mt-[5.6rem]"
                    >
                        <ImageCarousel images={promos ?? DUMMY_IMAGES} density="compact" />
                    </div>

                    <div className="relative mt-[clamp(2.4rem,2.96vw,3.6rem)] grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(288px,0.72fr)] lg:items-center xl:gap-6">
                        <div
                            data-section-two-reveal
                            className="section-two-object-reveal section-two-object-reveal--left min-w-0"
                        >
                            <ScrollTextReveal
                                as="h2"
                                split="words"
                                delay={80}
                                stagger={18}
                                className="font-bdo text-[clamp(2.04rem,2.32vw,2.9rem)] font-semibold leading-none tracking-[-0.07em] text-black xl:whitespace-nowrap"
                            >
                                Jelajahi Program Kami
                            </ScrollTextReveal>
                        </div>
                        <div className="flex items-center justify-start lg:pointer-events-none lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:justify-center">
                            <span
                                data-section-two-reveal
                                className="section-two-object-reveal section-two-object-reveal--scale block"
                                style={
                                    {
                                        "--section-two-reveal-delay": "80ms",
                                    } as CSSProperties
                                }
                            >
                                <SectionTwoStars className="h-5 w-[108px] drop-shadow-[0_8px_14px_rgba(0,34,68,0.18)] lg:h-[23px] lg:w-[124px] xl:h-[18px] xl:w-[98px]" />
                            </span>
                        </div>
                        <div
                            data-section-two-reveal
                            className="section-two-object-reveal section-two-object-reveal--right lg:justify-self-end"
                            style={
                                {
                                    "--section-two-reveal-delay": "130ms",
                                } as CSSProperties
                            }
                        >
                            <p className="max-w-[470px] font-bdo text-[clamp(0.9rem,1.06vw,1.16rem)] font-medium leading-[1.55] tracking-[-0.035em] text-black/55 xl:max-w-[376px]">
                                <ScrollTextReveal delay={120}>
                                    Fasilitas gym lengkap
                                </ScrollTextReveal>
                                <br />
                                <ScrollTextReveal delay={190}>
                                    Aktivitas latihan harian di pusat olahraga
                                </ScrollTextReveal>
                            </p>
                        </div>
                    </div>
                </div>

                <div
                    data-section-two-reveal
                    className="section-two-object-reveal section-two-object-reveal--marquee"
                >
                    <LogoMarquee sponsors={sponsors} density="compact" />
                </div>
            </div>
            <MembershipModal
                isOpen={membershipModalOpen}
                onClose={() => setMembershipModalOpen(false)}
                onRequestOpen={requestMembershipModalOpen}
                plans={plans}
                selectedPlanId={selectedMembershipPlanId}
                onSelectedPlanChange={(plan) =>
                    setSelectedMembershipPlanId(plan.id)
                }
            />
        </section>
    );
}
