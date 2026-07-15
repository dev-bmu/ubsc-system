import GymTrafficBadge from "@/Components/Landing/GymTrafficBadge";
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
import type { MembershipPlanItem } from "@/types";
import useEmblaCarousel from "embla-carousel-react";
import { Plus } from "lucide-react";
import {
    type CSSProperties,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

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

export const FALLBACK_MEMBERSHIP_PLANS: MembershipPlanItem[] = [
    {
        id: 0,
        name: "Design Agencies & Team",
        description:
            "Paket membership gym fleksibel untuk latihan rutin dengan akses fasilitas modern.",
        public_badge: "Business & Team",
        savings_label: "Hemat 20%",
        cta_label: "Membership",
        card_image_url: "/assets/images/poster-gym-konten-program-ub-sport-center.avif",
        price: 250000,
        duration_months: 1,
        features: ["Beginner", "Warga UB 25K", "Umum 23K", "Akses Gym"],
        is_active: true,
        sort_order: 0,
        active_members_count: 0,
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

const StarRating = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 128 24"
        width="128"
        height="24"
        className={className}
        aria-hidden
    >
        <defs>
            <linearGradient
                id="section-two-stars-gradient"
                x1="0"
                x2="128"
                y1="0"
                y2="24"
                gradientUnits="userSpaceOnUse"
            >
                <stop stopColor="#15678D" />
                <stop offset="0.46" stopColor="#0B4A72" />
                <stop offset="1" stopColor="#002244" />
            </linearGradient>
        </defs>
        {[0, 26, 52, 78, 104].map((offset) => (
            <path
                key={offset}
                fill="url(#section-two-stars-gradient)"
                transform={`translate(${offset} 0)`}
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            />
        ))}
    </svg>
);

function formatPrice(amount: number) {
    return new Intl.NumberFormat("id-ID").format(amount);
}

function durationSuffix(months: number) {
    if (months === 12) return "Tahun";
    if (months === 1) return "Bulan";
    return `${months} Bulan`;
}

function planFeatures(plan: MembershipPlanItem) {
    const features = plan.features?.filter(Boolean) ?? [];
    const fallback = ["Akses gym", "Program latihan", "Fasilitas modern", "Member support"];
    return (features.length > 0 ? features : fallback).slice(0, 4);
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
        let viewportHeight = 1;
        let sectionTop = 0;
        let followStart = 0.22;
        let followHold = 0.62;
        let maxFollow = 0;
        let lastTravel = -1;
        let lastShape = -1;
        let lastFollowOffset = Number.NaN;
        let postFlowReleased = false;
        const mainEl = postSectionFlow?.parentElement;
        const measuredSibling = section.previousElementSibling;

        const measure = () => {
            const viewportWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;
            viewportHeight =
                window.innerHeight ||
                document.documentElement.clientHeight ||
                1;
            sectionTop =
                section.getBoundingClientRect().top +
                (window.scrollY || document.documentElement.scrollTop || 0);
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
            maxFollow = Math.max(
                0,
                followHold * viewportHeight * followRatio - followInset,
            ) * Math.pow(holdShape, 0.68);

            root.style.height = `${viewportHeight}px`;

            // Keep the document height stable while the following content moves.
            // Changing this margin on every scroll frame caused scroll feedback and jank.
            if (mainEl) mainEl.style.marginBottom = `${-maxFollow}px`;
            needsMeasure = false;
        };

        const update = () => {
            frame = 0;
            if (!isNearCurtain && !needsMeasure) return;
            if (needsMeasure) measure();

            const scrollTop =
                window.scrollY || document.documentElement.scrollTop || 0;
            const sectionViewportTop = sectionTop - scrollTop;
            const travel = Math.min(
                1,
                Math.max(
                    0,
                    (viewportHeight - sectionViewportTop) / viewportHeight,
                ),
            );
            const shape = Math.sin(travel * Math.PI);

            if (Math.abs(travel - lastTravel) > 0.0001) {
                root.style.transform = `translate3d(0, 0, 0) scaleY(${travel})`;
                lastTravel = travel;
            }

            if (Math.abs(shape - lastShape) > 0.0005) {
                curtainSteps.forEach((step, index) => {
                    const minimumHeight = CURTAIN_STEPS[index] / 100;
                    const scale = 1 - shape * (1 - minimumHeight);
                    step.style.transform = `translate3d(0, 0, 0) scaleY(${scale})`;
                });
                lastShape = shape;
            }

            const followProgress = Math.min(
                1,
                Math.max(0, (travel - followStart) / (followHold - followStart)),
            );
            const followEase =
                followProgress * followProgress * (3 - 2 * followProgress);
            const followOffset = -maxFollow * followEase;
            const followChanged =
                !Number.isFinite(lastFollowOffset) ||
                Math.abs(followOffset - lastFollowOffset) > 0.05;

            if (followChanged) {
                section.style.setProperty(
                    "--section-two-curtain-follow",
                    `${followOffset}px`,
                );
                content.style.transform = `translate3d(0, ${followOffset}px, 0)`;
                lastFollowOffset = followOffset;
            }

            if (postSectionFlow) {
                // Release the large downstream layer as soon as its movement is
                // complete, while Section Three is still outside the viewport.
                // Waiting until the section boundary caused a visible one-frame
                // stall when the browser had to rebuild the whole page layer.
                const shouldReleaseSticky = followProgress >= 0.999;

                if (shouldReleaseSticky) {
                    if (!postFlowReleased || followChanged) {
                        postSectionFlow.style.removeProperty("transform");
                        postSectionFlow.style.position = "relative";
                        postSectionFlow.style.top = `${followOffset}px`;
                    }
                    postFlowReleased = true;
                } else {
                    const modeChanged = postFlowReleased;
                    if (modeChanged) {
                        postSectionFlow.style.removeProperty("position");
                        postSectionFlow.style.removeProperty("top");
                    }
                    if (modeChanged || followChanged) {
                        // GPU movement is retained only while the curtain is active.
                        // Releasing it afterwards keeps sticky cards working on iOS.
                        postSectionFlow.style.willChange = "transform";
                        postSectionFlow.style.transform = `translate3d(0, ${followOffset}px, 0)`;
                    }
                    postFlowReleased = false;
                }

                if (
                    followProgress <= 0.001 ||
                    followProgress >= 0.999
                ) {
                    postSectionFlow.style.removeProperty("will-change");
                }
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
                ? new ResizeObserver(requestMeasure)
                : null;

        if (measuredSibling instanceof Element) {
            resizeObserver?.observe(measuredSibling);
        }

        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestMeasure, { passive: true });
        window.addEventListener("load", requestMeasure, { once: true });
        void document.fonts?.ready.then(requestMeasure);

        return () => {
            disposed = true;
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestMeasure);
            window.removeEventListener("load", requestMeasure);
            proximityObserver?.disconnect();
            resizeObserver?.disconnect();
            section.style.removeProperty("--section-two-curtain-follow");
            content.style.removeProperty("transform");
            root.style.removeProperty("height");
            root.style.removeProperty("transform");
            curtainSteps.forEach((step) =>
                step.style.removeProperty("transform"),
            );
            postSectionFlow?.style.removeProperty("transform");
            postSectionFlow?.style.removeProperty("position");
            postSectionFlow?.style.removeProperty("top");
            postSectionFlow?.style.removeProperty("will-change");
            mainEl?.style.removeProperty("margin-bottom");
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <div
            ref={rootRef}
            className="section-two-curtain-edge"
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
    const desktopLines = [
        "Area gym ini dirancang sebagai ruang",
        "latihan yang nyaman dan fungsional untuk",
        "mendukung, latihan kekuatan, dan kardio",
        "bagi seluruh pengguna UB Sport Center\u00ae.",
    ];
    const mobileLines = [
        "Area gym ini dirancang",
        "sebagai ruang latihan",
        "yang nyaman dan",
        "fungsional untuk",
        "mendukung, latihan",
        "kekuatan, dan kardio",
        "bagi seluruh pengguna",
        "UB Sport Center\u00ae.",
    ];
    const compactMobileLines = [
        "Area gym ini",
        "dirancang sebagai",
        "ruang latihan yang",
        "nyaman dan",
        "fungsional untuk",
        "mendukung, latihan",
        "kekuatan, dan kardio",
        "bagi seluruh",
        "pengguna UB Sport",
        "Center\u00ae.",
    ];

    const renderLines = (
        lines: string[],
        firstLineClassName: string,
        className = "",
    ) => (
        <span aria-hidden className={className}>
            {lines.map((line, index) => (
                <span key={`${line}-${index}`} className="block overflow-visible">
                    <ScrollTextReveal
                        delay={110 + index * 95}
                        className={`-mb-[0.14em] pb-[0.14em] pr-[0.08em] whitespace-nowrap ${
                            index === 0 ? firstLineClassName : ""
                        }`}
                    >
                        {line}
                    </ScrollTextReveal>
                </span>
            ))}
        </span>
    );

    return (
        <h2
            aria-label={headline}
            className="section-two-headline-weight max-w-[1100px] text-left font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-[980px] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:max-w-[1120px] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
        >
            {renderLines(
                compactMobileLines,
                "pl-[clamp(3rem,13vw,4.85rem)]",
                "block sm:hidden",
            )}
            {renderLines(
                mobileLines,
                "pl-[clamp(4.25rem,13vw,7rem)]",
                "hidden sm:block md:hidden",
            )}
            {renderLines(
                desktopLines,
                "pl-[clamp(5.25rem,13vw,8.75rem)]",
                "hidden md:block lg:hidden",
            )}
            {renderLines(
                desktopLines,
                "pl-[clamp(6rem,13vw,8.75rem)]",
                "hidden lg:block xl:hidden",
            )}
            {renderLines(
                desktopLines,
                "pl-[clamp(4.5rem,7vw,6.25rem)] min-[1440px]:pl-[8.75rem]",
                "hidden xl:block",
            )}
        </h2>
    );
}

export function MembershipPlanCarousel({ plans }: { plans: MembershipPlanItem[] }) {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        loop: plans.length > 1,
    });
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [snapCount, setSnapCount] = useState(plans.length);

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

    return (
        <div className="w-full">
            <div ref={emblaRef} className="overflow-hidden">
                <div className="flex">
                    {plans.map((plan, index) => (
                        <div key={plan.id} className="min-w-0 flex-[0_0_100%]">
                            <MembershipPlanCard
                                plan={plan}
                                eager={index === 0}
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
                                    className={`absolute inset-0 rounded-full transition duration-500 ${
                                        selectedIndex === index
                                            ? "scale-95 bg-[#FF0000]/12 shadow-[0_0_12px_rgba(255,0,0,0.16)]"
                                            : "scale-75 bg-transparent"
                                    }`}
                                />
                                <span
                                    className={`relative rounded-full transition duration-500 ${
                                        selectedIndex === index
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

function MembershipPlanCard({
    plan,
    eager,
}: {
    plan: MembershipPlanItem;
    eager: boolean;
}) {
    const image =
        plan.card_image_url ||
        "/assets/images/poster-gym-konten-program-ub-sport-center.avif";
    const features = planFeatures(plan);
    const badge = plan.public_badge || "Membership Plan";
    const savings = plan.savings_label || "Paket Aktif";
    const cta = plan.cta_label || "Membership";
    const formattedPrice = formatPrice(plan.price);
    const priceScale = Math.max(
        0.72,
        Math.min(1, 7 / Math.max(formattedPrice.length, 7)),
    );

    return (
        <article className="overflow-hidden rounded-[5px]">
            <div className="relative h-[124px] overflow-hidden rounded-[5px] bg-slate-100 sm:h-[140px] md:h-[152px] xl:h-[78px]">
                <img
                    src={image}
                    alt={plan.name}
                    className="h-full w-full object-cover object-[center_45%]"
                    loading={eager ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority="low"
                    width={960}
                    height={320}
                    draggable={false}
                />
            </div>

            <div
                className="mt-3 overflow-hidden rounded-[5px] bg-[#061322] text-white xl:mt-3"
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 72% 42%, rgba(74, 179, 228, 0.72), transparent 25%), radial-gradient(circle at 58% 78%, rgba(15, 92, 146, 0.58), transparent 31%), linear-gradient(135deg, #061322 0%, #082D4B 48%, #02070D 100%)",
                }}
            >
                <div className="m-2.5 min-h-[218px] rounded-[5px] bg-white px-3.5 py-3.5 text-black shadow-[0_18px_45px_rgba(0,0,0,0.16)] sm:m-3 sm:min-h-[232px] sm:px-5 sm:py-[18px] md:min-h-[240px] md:px-6 xl:m-[10px] xl:min-h-[202px] xl:px-5 xl:py-[14px]">
                    <div className="relative flex flex-col gap-3 sm:block sm:pr-32 xl:pr-[90px]">
                        <div className="max-w-[320px] xl:max-w-[256px]">
                            <ScrollTextReveal
                                as="p"
                                delay={80}
                                className="font-bdo text-[16px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[20px] md:text-[22px] xl:whitespace-nowrap xl:text-[18px]"
                            >
                                Best monthly Plan for
                            </ScrollTextReveal>
                            <ScrollTextReveal
                                as="h3"
                                delay={150}
                                className="mt-1 font-bdo text-[18px] font-medium leading-[1.04] tracking-[-0.045em] text-[#15678D] sm:text-[21px] md:text-[22px] xl:whitespace-nowrap xl:text-[18px]"
                            >
                                {plan.name}
                            </ScrollTextReveal>
                        </div>
                        <span className="inline-flex w-fit rounded-full bg-[#EAF7FF] px-3 py-1 font-bdo text-[9px] font-medium text-[#15678D] sm:absolute sm:right-0 sm:top-1 sm:bg-transparent sm:px-0 sm:py-0 sm:text-[12px] xl:text-[9px]">
                            <ScrollTextReveal delay={210}>{badge}</ScrollTextReveal>
                        </span>
                    </div>

                    <div className="mt-7 flex flex-col gap-5 sm:mt-9 sm:flex-row sm:items-end sm:justify-between xl:mt-12 xl:gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex max-w-full flex-nowrap items-end gap-1 overflow-visible whitespace-nowrap">
                                <ScrollTextReveal
                                    delay={260}
                                    className="pb-1 font-bdo text-[12px] font-semibold sm:text-[13px] xl:text-[11px]"
                                >
                                    Rp
                                </ScrollTextReveal>
                                <ScrollTextReveal
                                    delay={300}
                                    className="max-w-full pr-[0.24em] font-clash text-[calc(clamp(27px,6.9vw,37px)*var(--membership-price-scale))] font-semibold leading-none tracking-[-0.07em] sm:text-[calc(clamp(31px,5.4vw,37px)*var(--membership-price-scale))] md:text-[calc(clamp(32px,4.5vw,40px)*var(--membership-price-scale))] xl:text-[calc(clamp(27px,2.1vw,32px)*var(--membership-price-scale))]"
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
                                    className="pb-1 font-bdo text-[10px] font-semibold sm:text-[13px] xl:text-[11px]"
                                >
                                    {`/${durationSuffix(plan.duration_months)}`}
                                </ScrollTextReveal>
                            </div>
                            <span className="mt-4 inline-flex rounded-full bg-[#D8FFD5] px-4 py-1.5 font-bdo text-[11px] font-light text-[#15803D] sm:mt-5 sm:px-5 sm:py-2 sm:text-xs xl:mt-4 xl:px-4 xl:py-1.5 xl:text-[10px]">
                                <ScrollTextReveal delay={410}>{savings}</ScrollTextReveal>
                            </span>
                        </div>

                        <a
                            href="/pricing"
                            className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-[12px] bg-black px-6 font-bdo text-sm font-light text-white shadow-[0_14px_26px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-[#FF0000] sm:w-auto sm:px-8 xl:h-9 xl:rounded-[11px] xl:px-6 xl:text-[11px]"
                        >
                            <ScrollTextReveal delay={470}>{cta}</ScrollTextReveal>
                        </a>
                    </div>
                </div>

                <div className="grid min-h-0 grid-cols-1 gap-2.5 px-4 pb-5 pt-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3.5 sm:px-6 sm:pb-7 sm:pt-6 xl:min-h-[139px] xl:gap-x-7 xl:gap-y-3.5 xl:px-5 xl:pb-7 xl:pt-9">
                    {features.map((feature, index) => (
                        <div
                            key={`${feature}-${index}`}
                            className="relative flex items-center gap-2 px-0 py-3 font-bdo text-[11px] font-medium text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.72)_16%,rgba(148,163,184,0.42)_58%,rgba(255,255,255,0))] last:after:hidden sm:bg-transparent sm:p-0 sm:after:hidden xl:gap-2 xl:text-[9px]"
                        >
                            <Plus className="h-2.5 w-2.5 shrink-0" />
                            <ScrollTextReveal delay={170 + index * 55}>
                                {feature}
                            </ScrollTextReveal>
                        </div>
                    ))}
                </div>
            </div>
        </article>
    );
}

export default function SectionTwo({
    membershipPlans,
    promos,
    sponsors,
}: SectionTwoProps) {
    const sectionRef = useRef<HTMLElement>(null);
    const [membershipModalOpen, setMembershipModalOpen] = useState(false);
    const plans = useMemo(
        () =>
            membershipPlans && membershipPlans.length > 0
                ? membershipPlans
                : FALLBACK_MEMBERSHIP_PLANS,
        [membershipPlans],
    );

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

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
    }, []);

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
                            outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                            contentClassName="px-3"
                        />
                    </div>

                    <div className="mt-12 grid gap-12 md:mt-14 lg:mt-16 xl:mt-14 xl:grid-cols-[clamp(360px,27vw,422px)_minmax(0,1fr)] xl:gap-[clamp(3.75rem,5.2vw,7.25rem)] 2xl:grid-cols-[clamp(390px,24vw,470px)_minmax(0,1fr)] 2xl:gap-[clamp(5rem,6vw,9rem)]">
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
                                    className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] xl:text-[1.25rem]"
                                >
                                    Gabung Member Sekarang
                                </ScrollTextReveal>
                            </div>

                            <MembershipPlanCarousel plans={plans} />
                        </div>

                        <div className="order-1 flex min-w-0 flex-col xl:order-2 xl:w-full">
                            <div className="mb-8 flex items-center gap-4 xl:hidden">
                                <span className="section-label-diamond" />
                                <ScrollTextReveal
                                    delay={80}
                                    className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]"
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
                                            setMembershipModalOpen(true)
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
                                        className="font-bdo text-[clamp(1.08rem,1.36vw,1.42rem)] font-medium tracking-[-0.04em]"
                                    >
                                        Jadwal
                                    </ScrollTextReveal>
                                    <ScrollTextReveal
                                        as="p"
                                        split="words"
                                        delay={140}
                                        stagger={10}
                                        className="mt-5 max-w-[500px] font-bdo text-[clamp(0.9rem,1.04vw,1.08rem)] font-normal leading-[1.32] tracking-[-0.02em] text-black/50 xl:mt-4 xl:max-w-none"
                                    >
                                        UB Sport Center buka setiap hari pukul 06.00 - 21.00 dengan pilihan paket bulanan dan tahunan yang fleksibel serta akses fasilitas lengkap untuk mendukung kebutuhan latihan Anda.
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
                                        className="font-bdo text-[clamp(1.08rem,1.36vw,1.42rem)] font-medium tracking-[-0.04em]"
                                    >
                                        Maskulin
                                    </ScrollTextReveal>
                                    <ScrollTextReveal
                                        as="p"
                                        split="words"
                                        delay={230}
                                        stagger={10}
                                        className="mt-5 max-w-[540px] font-bdo text-[clamp(0.9rem,1.04vw,1.08rem)] font-normal leading-[1.32] tracking-[-0.02em] text-black/50 xl:mt-4 xl:max-w-none"
                                    >
                                        Temukan paket membership terbaik dengan fasilitas modern dan program latihan profesional untuk membantu Anda mencapai target kebugaran secara maksimal dan berkelanjutan.
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
                                <StarRating className="h-5 w-[108px] drop-shadow-[0_8px_14px_rgba(0,34,68,0.18)] lg:h-[23px] lg:w-[124px] xl:h-[18px] xl:w-[98px]" />
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
            />
        </section>
    );
}
