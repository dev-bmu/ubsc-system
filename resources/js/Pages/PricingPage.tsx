import Navbar from "@/Components/Landing/Navbar";
import PricingHero from "@/Components/Pricing/PricingHero";
import PricingInfo from "@/Components/Pricing/PricingInfo";
import PricingFacilityList from "@/Components/Pricing/PricingFacilityList";
import PricingClassSection from "@/Components/Pricing/PricingClassSection";
import PricingAccordionSection from "@/Components/Pricing/PricingAccordionSection";
import "@/Components/Pricing/PricingFacilities.css";
import NewsShowcaseBridge from "@/Components/News/NewsShowcaseBridge";
import DeferredSectionEight from "@/Components/Landing/DeferredSectionEight";
import Footer from "@/Components/Landing/Footer";
import HeroCurtainEdge from "@/Components/Landing/HeroCurtainEdge";
import SeoHead from "@/Components/SeoHead";
import { usePage } from "@inertiajs/react";
import { useEffect, useRef } from "react";
import type { MembershipPlanItem, PageProps } from "@/types";

const PRICING_LOOP_IDLE_DELAY = 50;
const PRICING_LOOP_ACTIVITY_EVENT = "pricing-loop-activity";

type PricingLoopMode = "paused" | "settling" | "running";

type PricingPageProps = PageProps<{
    facilities?: Array<{
        id: number;
        name: string;
        description?: string | null;
        slug: string;
        image: string;
        category: string;
        location?: string | null;
        venue_type?: string | null;
        active_slots?: Record<string, string[]> | null;
        class_code?: string | null;
        rating?: number | null;
        display_metadata?: Record<string, unknown> | null;
        prices?: Array<{
            id?: number;
            user_category?: string | null;
            label?: string | null;
            price?: number | string | null;
            duration_minutes?: number | null;
            schedule_type?: string | null;
            applicable_days?: string[] | null;
            starts_at?: string | null;
            ends_at?: string | null;
            starts_on?: string | null;
            ends_on?: string | null;
            notes?: string | null;
        }>;
        units?: Array<{
            id: number;
            name: string;
            image?: string | null;
            use_custom_schedule?: boolean | null;
            active_slots?: Record<string, string[]> | null;
            use_custom_pricing?: boolean | null;
            prices?: Array<{
                id?: number;
                user_category?: string | null;
                label?: string | null;
                price?: number | string | null;
                duration_minutes?: number | null;
                schedule_type?: string | null;
                applicable_days?: string[] | null;
                starts_at?: string | null;
                ends_at?: string | null;
                starts_on?: string | null;
                ends_on?: string | null;
                notes?: string | null;
            }>;
        }>;
        price_range?: string | null;
    }>;
    membershipPlans?: MembershipPlanItem[];
}>;

export default function PricingPage() {
    const { facilities = [], membershipPlans = [] } =
        usePage<PricingPageProps>().props;
    const pageRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const page = pageRef.current;
        if (!page) return;

        const regions = Array.from(
            page.querySelectorAll<HTMLElement>(
                '[data-pricing-loop-region="true"]',
            ),
        );
        if (regions.length === 0) return;

        const visibleRegions = new Set<HTMLElement>();
        const regionModes = new Map<HTMLElement, PricingLoopMode>(
            regions.map((region) => [region, "paused"]),
        );
        const cyclePausedTargets = new Map<
            HTMLElement,
            Map<Element, Set<string>>
        >();
        const iterationHandlers = new Map<
            HTMLElement,
            (event: AnimationEvent) => void
        >();
        let idleTimer = 0;
        let isScrolling = false;
        let fallbackFrame = 0;
        let scrollMonitorFrame = 0;
        let lastScrollPosition = window.scrollY;
        let lastMotionAt = 0;
        const hasIntersectionObserver =
            "IntersectionObserver" in window;
        const reducedMotionQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );

        const setRegionMode = (
            region: HTMLElement,
            mode: PricingLoopMode,
        ) => {
            regionModes.set(region, mode);
            region.dataset.pricingLoopState = mode;

            if (mode === "paused") {
                region.removeAttribute("data-pricing-loop-active");
            } else {
                region.dataset.pricingLoopActive = "true";
            }

            region.dispatchEvent(
                new CustomEvent(PRICING_LOOP_ACTIVITY_EVENT, {
                    detail: {
                        active: mode !== "paused",
                        mode,
                    },
                }),
            );
        };

        const clearCyclePausedTargets = (region: HTMLElement) => {
            cyclePausedTargets.get(region)?.forEach((attributes, target) => {
                attributes.forEach((attribute) =>
                    target.removeAttribute(attribute),
                );
            });
            cyclePausedTargets.get(region)?.clear();
        };

        const clearGracefulStops = (region: HTMLElement) => {
            clearCyclePausedTargets(region);
        };

        const hardPauseRegion = (region: HTMLElement) => {
            clearGracefulStops(region);
            setRegionMode(region, "paused");
        };

        const activateRegion = (region: HTMLElement) => {
            clearGracefulStops(region);
            setRegionMode(region, "running");
        };

        const finishCurrentCycles = (region: HTMLElement) => {
            if (regionModes.get(region) !== "running") return;

            clearGracefulStops(region);
            setRegionMode(region, "settling");
        };

        const animationIsInfinite = (
            target: Element,
            event: AnimationEvent,
        ) => {
            const pseudoElement = event.pseudoElement || null;
            const styles = window.getComputedStyle(target, pseudoElement);
            const names = styles.animationName
                .split(",")
                .map((value) => value.trim());
            const iterationCounts = styles.animationIterationCount
                .split(",")
                .map((value) => value.trim());

            return names.some(
                (name, index) =>
                    name === event.animationName &&
                    iterationCounts[index % iterationCounts.length] ===
                        "infinite",
            );
        };

        const cyclePauseAttribute = (pseudoElement: string) => {
            if (pseudoElement === "::before") {
                return "data-pricing-loop-cycle-paused-before";
            }
            if (pseudoElement === "::after") {
                return "data-pricing-loop-cycle-paused-after";
            }
            return "data-pricing-loop-cycle-paused-self";
        };

        regions.forEach((region) => {
            const handleAnimationIteration = (event: AnimationEvent) => {
                if (regionModes.get(region) !== "settling") return;

                const target = event.target;
                if (!(target instanceof Element) || !region.contains(target)) {
                    return;
                }
                if (!animationIsInfinite(target, event)) return;

                const attribute = cyclePauseAttribute(event.pseudoElement);
                target.setAttribute(attribute, "true");

                const pausedTargets =
                    cyclePausedTargets.get(region) ??
                    new Map<Element, Set<string>>();
                const attributes =
                    pausedTargets.get(target) ?? new Set<string>();
                attributes.add(attribute);
                pausedTargets.set(target, attributes);
                cyclePausedTargets.set(region, pausedTargets);
            };

            iterationHandlers.set(region, handleAnimationIteration);
            region.addEventListener(
                "animationiteration",
                handleAnimationIteration,
            );
        });

        const hardPauseAll = () => {
            regions.forEach(hardPauseRegion);
        };

        const canRunRegion = (region: HTMLElement) =>
            visibleRegions.has(region) &&
            region.dataset.navHidden !== "true";

        const resumeVisible = () => {
            idleTimer = 0;
            isScrolling = false;

            if (document.hidden || reducedMotionQuery.matches) return;

            visibleRegions.forEach((region) => {
                if (canRunRegion(region)) activateRegion(region);
            });
        };

        const scheduleResume = () => {
            window.clearTimeout(idleTimer);
            idleTimer = window.setTimeout(
                resumeVisible,
                PRICING_LOOP_IDLE_DELAY,
            );
        };

        const monitorScrollIdle = (time: number) => {
            const currentPosition = window.scrollY;

            if (Math.abs(currentPosition - lastScrollPosition) > 0.1) {
                lastScrollPosition = currentPosition;
                lastMotionAt = time;
            }

            if (time - lastMotionAt >= PRICING_LOOP_IDLE_DELAY) {
                scrollMonitorFrame = 0;
                resumeVisible();
                return;
            }

            scrollMonitorFrame = window.requestAnimationFrame(
                monitorScrollIdle,
            );
        };

        const handleScroll = () => {
            if (!isScrolling) {
                isScrolling = true;
                visibleRegions.forEach(finishCurrentCycles);
            }

            window.clearTimeout(idleTimer);
            idleTimer = 0;
            lastScrollPosition = window.scrollY;
            lastMotionAt = performance.now();

            if (!hasIntersectionObserver) {
                scheduleFallbackVisibility();
            }

            if (!scrollMonitorFrame) {
                scrollMonitorFrame = window.requestAnimationFrame(
                    monitorScrollIdle,
                );
            }
        };

        const handleVisibilityChange = () => {
            window.clearTimeout(idleTimer);
            idleTimer = 0;

            if (document.hidden) {
                isScrolling = false;
                window.cancelAnimationFrame(scrollMonitorFrame);
                scrollMonitorFrame = 0;
                hardPauseAll();
                return;
            }

            scheduleResume();
        };

        const handleMotionPreferenceChange = () => {
            window.clearTimeout(idleTimer);
            idleTimer = 0;

            if (reducedMotionQuery.matches) {
                window.cancelAnimationFrame(scrollMonitorFrame);
                scrollMonitorFrame = 0;
                isScrolling = false;
                hardPauseAll();
                return;
            }

            scheduleResume();
        };

        const isInViewport = (region: HTMLElement) => {
            const rect = region.getBoundingClientRect();
            return (
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < window.innerHeight &&
                rect.left < window.innerWidth
            );
        };

        const refreshFallbackVisibility = () => {
            fallbackFrame = 0;
            regions.forEach((region) => {
                if (isInViewport(region)) {
                    visibleRegions.add(region);
                } else {
                    visibleRegions.delete(region);
                    hardPauseRegion(region);
                }
            });
        };

        const scheduleFallbackVisibility = () => {
            if (fallbackFrame) return;
            fallbackFrame = window.requestAnimationFrame(
                refreshFallbackVisibility,
            );
        };

        hardPauseAll();

        let observer: IntersectionObserver | null = null;

        if (hasIntersectionObserver) {
            observer = new IntersectionObserver(
                (entries) => {
                    let enteredViewport = false;

                    entries.forEach((entry) => {
                        const region = entry.target as HTMLElement;

                        if (entry.isIntersecting) {
                            visibleRegions.add(region);
                            enteredViewport = true;
                            return;
                        }

                        visibleRegions.delete(region);
                        hardPauseRegion(region);
                    });

                    if (
                        enteredViewport &&
                        !isScrolling &&
                        !document.hidden
                    ) {
                        scheduleResume();
                    }
                },
                { rootMargin: "0px", threshold: 0.01 },
            );

            regions.forEach((region) => observer?.observe(region));
        } else {
            refreshFallbackVisibility();
            scheduleResume();
            window.addEventListener("resize", scheduleFallbackVisibility);
        }

        const navVisibilityObserver = new MutationObserver((entries) => {
            entries.forEach((entry) => {
                const region = entry.target as HTMLElement;
                if (!visibleRegions.has(region)) return;

                if (region.dataset.navHidden === "true") {
                    finishCurrentCycles(region);
                } else if (!isScrolling) {
                    scheduleResume();
                }
            });
        });

        regions.forEach((region) => {
            if (region.id !== "ubsc-nav-wrapper") return;
            navVisibilityObserver.observe(region, {
                attributes: true,
                attributeFilter: ["data-nav-hidden"],
            });
        });

        window.addEventListener("scroll", handleScroll, { passive: true });
        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );
        reducedMotionQuery.addEventListener(
            "change",
            handleMotionPreferenceChange,
        );

        return () => {
            observer?.disconnect();
            navVisibilityObserver.disconnect();
            window.clearTimeout(idleTimer);
            window.cancelAnimationFrame(fallbackFrame);
            window.cancelAnimationFrame(scrollMonitorFrame);
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", scheduleFallbackVisibility);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
            reducedMotionQuery.removeEventListener(
                "change",
                handleMotionPreferenceChange,
            );
            iterationHandlers.forEach((handler, region) =>
                region.removeEventListener(
                    "animationiteration",
                    handler,
                ),
            );
            hardPauseAll();
        };
    }, []);

    return (
        <div ref={pageRef} className="min-h-screen bg-white">
            <SeoHead />
            <main className="pricing-page-canvas relative">
                <Navbar activeSection="Pricing" deferLoopAnimations />
                <PricingHero />

                <section className="section-two-curtain relative z-[18] w-full overflow-x-clip bg-transparent">
                    <HeroCurtainEdge postFlowSelector=".pricing-post-info-flow" />
                    <div className="section-two-curtain-content relative z-10 bg-white">
                        <PricingInfo membershipPlans={membershipPlans} />
                    </div>
                </section>

                <div className="pricing-post-info-flow bg-white">
                    <PricingFacilityList facilities={facilities} />
                    <PricingClassSection facilities={facilities} />
                    <PricingAccordionSection facilities={facilities} />
                </div>
            </main>

            <div className="home-footer-reveal-root pricing-footer-reveal-root">
                <section
                    className="pricing-showcase-slot"
                    aria-label="UB Sport Center showcase"
                >
                    <NewsShowcaseBridge />
                </section>
                <div className="home-footer-reveal-stage">
                    <DeferredSectionEight deferLoopAnimations />
                </div>
                <div className="home-footer-reveal-footer">
                    <Footer deferLoopAnimations />
                </div>
            </div>
        </div>
    );
}
