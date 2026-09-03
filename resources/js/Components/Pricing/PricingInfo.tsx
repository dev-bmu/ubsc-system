import MembershipModal from "@/Components/Landing/MembershipModal";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import {
    FALLBACK_MEMBERSHIP_PLANS,
    MembershipPlanCarousel,
} from "@/Components/Landing/SectionTwo";
import type { MembershipPlanItem } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PricingSectionHeadline from "./PricingSectionHeadline";
import "./PricingInfo.css";

const PRICING_MEMBERSHIP_HEADING =
    "Temukan ritme terbaik untuk rutinitas latihan Anda bersama fasilitas modern yang lengkap, program latihan terarah, serta membership yang fleksibel sesuai dengan kebutuhan Anda.";

function PricingMembershipHeadline() {
    return (
        <PricingSectionHeadline mobileNatural>
            {PRICING_MEMBERSHIP_HEADING}
        </PricingSectionHeadline>
    );
}

const STATS_DATA = [
    { label: "Jadwal Latihan", value: "Fleksibel 24 Jam" },
    { label: "Paket Membership", value: "Mulai dari 150K / Bulan" },
    { label: "Cabang Tersedia", value: "1 Lokasi Aktif" },
];

function PricingResultsLabel({ mobile = false }: { mobile?: boolean }) {
    return (
        <div
            className={`pricing-membership__results-label${mobile ? " pricing-membership__results-label--mobile" : ""
                }`}
        >
            <span
                aria-hidden="true"
                className="pricing-membership__results-label-mark"
            />
            <span
                aria-label="Program overview"
                className="pricing-membership__results-label-title font-bdo font-medium"
            >
                (Overview)
            </span>
        </div>
    );
}

const SECTION_CONTAINER_CLASS =
    "mx-auto max-w-8xl px-[clamp(1.5rem,4.5vw,5.5rem)]";
const BODY_TEXT_CLASS =
    "font-bdo text-[clamp(0.8rem,0.8vw,0.875rem)] font-normal leading-relaxed text-gray-500 lg:text-[clamp(0.75rem,0.8vw,0.875rem)]";
const RESULT_ROW_CLASS =
    "pricing-membership__result-row border-b";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)]  pb-10 pt-10 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";
const MEMBERSHIP_CARD_FALLBACK_IMAGE =
    "/assets/images/poster-gym-konten-program-ub-sport-center.avif";
const OVERVIEW_REFERENCE_VIEWPORT_WIDTH = 1536;
const OVERVIEW_REFERENCE_LIFT_RATIO = 0.15;
const OVERVIEW_REFERENCE_BLEND_RANGE = 96;

const preparedMembershipImages = new Set<string>();
const membershipImagePreparationTasks = new Map<string, Promise<void>>();

type IdleSchedulerWindow = Window & {
    requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
};

const prepareMembershipImage = (source: string) => {
    if (!source || typeof Image === "undefined") return Promise.resolve();
    if (preparedMembershipImages.has(source)) return Promise.resolve();

    const pendingTask = membershipImagePreparationTasks.get(source);
    if (pendingTask) return pendingTask;

    const task = new Promise<void>((resolve) => {
        const image = new Image();
        image.decoding = "async";
        image.fetchPriority = "low";

        const finish = () => {
            preparedMembershipImages.add(source);
            membershipImagePreparationTasks.delete(source);
            image.onload = null;
            image.onerror = null;
            resolve();
        };

        image.onload = () => {
            if (typeof image.decode !== "function") {
                finish();
                return;
            }

            image.decode().catch(() => undefined).finally(finish);
        };
        image.onerror = finish;
        image.src = source;
    });

    membershipImagePreparationTasks.set(source, task);
    return task;
};

interface Props {
    membershipPlans?: MembershipPlanItem[];
}

export default function PricingSectionTwo({ membershipPlans }: Props) {
    const [membershipModalOpen, setMembershipModalOpen] = useState(false);
    const sectionRef = useRef<HTMLElement | null>(null);
    const desktopHeadlineRef = useRef<HTMLDivElement | null>(null);
    const desktopResultsRef = useRef<HTMLDivElement | null>(null);
    const desktopOverviewRef = useRef<HTMLDivElement | null>(null);
    const desktopCtaRef = useRef<HTMLDivElement | null>(null);
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

        const carousel = Array.from(
            sectionRef.current?.querySelectorAll<HTMLElement>(
                "[data-membership-plan-carousel]",
            ) ?? [],
        ).find((element) => element.getClientRects().length > 0);
        carousel?.scrollIntoView({ behavior: "auto", block: "center" });
        window.requestAnimationFrame(() => setMembershipModalOpen(true));
    }, [plans]);

    useEffect(() => {
        const search = new URLSearchParams(window.location.search);
        const registrationId = search.get("membership_registration");
        const requestedPlanId = Number(search.get("plan"));
        const validRequestedPlanId =
            Number.isFinite(requestedPlanId) &&
            requestedPlanId > 0 &&
            plans.some((plan) => plan.id === requestedPlanId)
                ? requestedPlanId
                : null;

        if (validRequestedPlanId !== null) {
            setSelectedMembershipPlanId(validRequestedPlanId);
        }
        if (registrationId && /^\d+$/.test(registrationId)) {
            requestMembershipModalOpen(validRequestedPlanId);
        }
    }, [plans, requestMembershipModalOpen]);
    const firstPlanImage = useMemo(() => {
        const firstPlan = [...plans].sort(
            (a, b) =>
                Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) ||
                a.price - b.price ||
                a.id - b.id,
        )[0];

        return firstPlan?.card_image_url || MEMBERSHIP_CARD_FALLBACK_IMAGE;
    }, [plans]);
    const [membershipMediaPrepared, setMembershipMediaPrepared] = useState(
        () => preparedMembershipImages.has(firstPlanImage),
    );

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || !firstPlanImage) {
            setMembershipMediaPrepared(true);
            return;
        }

        if (preparedMembershipImages.has(firstPlanImage)) {
            setMembershipMediaPrepared(true);
            return;
        }

        setMembershipMediaPrepared(false);

        const scheduler = window as IdleSchedulerWindow;
        let cancelled = false;
        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;

        const prepareImage = () => {
            void prepareMembershipImage(firstPlanImage).then(() => {
                if (!cancelled) setMembershipMediaPrepared(true);
            });
        };
        const schedulePreparation = (isImmediatelyNear: boolean) => {
            if (isImmediatelyNear) {
                prepareImage();
                return;
            }

            if (scheduler.requestIdleCallback) {
                idleHandle = scheduler.requestIdleCallback(prepareImage, {
                    timeout: 900,
                });
            } else {
                timeoutHandle = window.setTimeout(prepareImage, 90);
            }
        };

        if (typeof IntersectionObserver === "undefined") {
            schedulePreparation(true);
            return () => {
                cancelled = true;
            };
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                observer.disconnect();
                schedulePreparation(
                    entry.boundingClientRect.top <= window.innerHeight * 1.15,
                );
            },
            {
                rootMargin: `${Math.round(window.innerHeight * 1.45)}px 0px`,
                threshold: 0,
            },
        );

        observer.observe(section);

        return () => {
            cancelled = true;
            observer.disconnect();
            if (idleHandle !== null) {
                scheduler.cancelIdleCallback?.(idleHandle);
            }
            if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
        };
    }, [firstPlanImage]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        const targets = Array.from(
            section.querySelectorAll<HTMLElement>(
                "[data-pricing-info-reveal]",
            ),
        );
        const revealTarget = (target: HTMLElement) => {
            target.dataset.pricingInfoRevealed = "true";
        };
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion || typeof IntersectionObserver === "undefined") {
            targets.forEach(revealTarget);
            return;
        }

        const pendingTargets = new Set(
            targets.filter(
                (target) => target.dataset.pricingInfoRevealed !== "true",
            ),
        );
        let observer: IntersectionObserver | null = null;
        let scrollFrame = 0;
        let fallbackAttached = false;

        function detachFallback() {
            if (!fallbackAttached) return;
            window.removeEventListener("scroll", schedulePassedCheck);
            window.removeEventListener("resize", schedulePassedCheck);
            fallbackAttached = false;
        }

        function completeReveal(target: HTMLElement) {
            revealTarget(target);
            pendingTargets.delete(target);
            observer?.unobserve(target);
            if (pendingTargets.size === 0) detachFallback();
        }

        function revealPassedTargets() {
            scrollFrame = 0;
            pendingTargets.forEach((target) => {
                if (target.getBoundingClientRect().bottom <= 0) {
                    completeReveal(target);
                }
            });
        }

        function schedulePassedCheck() {
            if (scrollFrame !== 0 || pendingTargets.size === 0) return;
            scrollFrame = window.requestAnimationFrame(revealPassedTargets);
        }

        observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        completeReveal(entry.target as HTMLElement);
                    } else if (entry.boundingClientRect.bottom <= 0) {
                        completeReveal(entry.target as HTMLElement);
                    }
                });
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
        );

        targets.forEach((target) => {
            if (target.dataset.pricingInfoRevealed === "true") return;
            if (target.getBoundingClientRect().bottom <= 0) {
                completeReveal(target);
            } else {
                observer?.observe(target);
            }
        });

        if (pendingTargets.size > 0) {
            fallbackAttached = true;
            window.addEventListener("scroll", schedulePassedCheck, {
                passive: true,
            });
            window.addEventListener("resize", schedulePassedCheck, {
                passive: true,
            });
            schedulePassedCheck();
        }

        return () => {
            observer?.disconnect();
            window.cancelAnimationFrame(scrollFrame);
            detachFallback();
        };
    }, [plans.length]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        if (typeof IntersectionObserver === "undefined") {
            section.dataset.pricingInfoInView = "true";
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                section.dataset.pricingInfoInView = String(
                    Boolean(entry?.isIntersecting),
                );
            },
            { rootMargin: "0px", threshold: 0 },
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const headline = desktopHeadlineRef.current;
        const results = desktopResultsRef.current;
        const overview = desktopOverviewRef.current;
        const cta = desktopCtaRef.current;

        if (!headline || !results || !overview || !cta) return;

        const desktopQuery = window.matchMedia("(min-width: 1280px)");
        let frame = 0;
        let cancelled = false;

        const readTranslateY = (element: HTMLElement) => {
            let translateY = 0;
            let current: HTMLElement | null = element;

            while (current && current !== sectionRef.current) {
                const transform = window.getComputedStyle(current).transform;

                if (transform.startsWith("matrix3d(")) {
                    const values = transform
                        .slice(9, -1)
                        .split(",")
                        .map(Number);
                    translateY += values[13] || 0;
                } else if (transform.startsWith("matrix(")) {
                    const values = transform
                        .slice(7, -1)
                        .split(",")
                        .map(Number);
                    translateY += values[5] || 0;
                }

                current = current.parentElement;
            }

            return translateY;
        };

        const getLayoutBox = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect();
            const translateY = readTranslateY(element);

            return {
                top: rect.top - translateY,
                bottom: rect.bottom - translateY,
                height: rect.height,
            };
        };

        const updateOverviewPosition = () => {
            frame = 0;

            if (!desktopQuery.matches) {
                overview.style.removeProperty(
                    "--pricing-membership-overview-offset",
                );
                return;
            }

            const summary = results.querySelector<HTMLElement>(
                ".pricing-membership__summary",
            );
            const visibleHeadline =
                headline.querySelector<HTMLElement>(
                    ".pricing-membership__heading-reveal > .ubsc-text-reveal__line-ghost",
                ) ??
                headline.querySelector<HTMLElement>(
                    ".pricing-membership__heading",
                ) ??
                headline;
            const headlineBox = getLayoutBox(visibleHeadline);
            const overviewBox = getLayoutBox(overview);
            const ctaBox = getLayoutBox(cta);
            const summaryBox = summary ? getLayoutBox(summary) : null;
            const topBoundary = headlineBox.bottom;
            const bottomBoundary = Math.min(
                ctaBox.top,
                summaryBox?.top ?? Number.POSITIVE_INFINITY,
            );
            const availableHeight = bottomBoundary - topBoundary;
            const headlineFontSize = Number.parseFloat(
                window.getComputedStyle(visibleHeadline).fontSize,
            );
            const opticalCorrection = Number.isFinite(headlineFontSize)
                ? headlineFontSize * 0.14
                : 0;
            const viewportDistance = Math.abs(
                window.innerWidth - OVERVIEW_REFERENCE_VIEWPORT_WIDTH,
            );
            const referenceBlend = Math.max(
                0,
                1 - viewportDistance / OVERVIEW_REFERENCE_BLEND_RANGE,
            );
            const easedReferenceBlend =
                referenceBlend * referenceBlend * (3 - 2 * referenceBlend);
            const requestedPositionLift =
                overviewBox.height *
                OVERVIEW_REFERENCE_LIFT_RATIO *
                easedReferenceBlend;

            if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
                overview.style.removeProperty(
                    "--pricing-membership-overview-offset",
                );
                return;
            }

            const targetCenter =
                topBoundary +
                availableHeight / 2 -
                opticalCorrection -
                requestedPositionLift;
            const overviewCenter = overviewBox.top + overviewBox.height / 2;
            const offset = targetCenter - overviewCenter;
            const roundedOffset = Math.round(offset * 100) / 100;

            overview.style.setProperty(
                "--pricing-membership-overview-offset",
                `${roundedOffset}px`,
            );
        };

        const scheduleOverviewPosition = () => {
            if (frame !== 0 || cancelled) return;
            frame = window.requestAnimationFrame(updateOverviewPosition);
        };

        const resizeObserver =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(scheduleOverviewPosition);

        [headline, results, overview, cta].forEach((element) =>
            resizeObserver?.observe(element),
        );
        window.addEventListener("resize", scheduleOverviewPosition, {
            passive: true,
        });
        desktopQuery.addEventListener?.("change", scheduleOverviewPosition);
        void document.fonts?.ready.then(scheduleOverviewPosition);
        scheduleOverviewPosition();

        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", scheduleOverviewPosition);
            desktopQuery.removeEventListener?.(
                "change",
                scheduleOverviewPosition,
            );
        };
    }, []);

    return (
        <section
            ref={sectionRef}
            className="overflow-x-clip bg-white"
            id="pricing-info"
            data-pricing-loop-region="true"
            data-pricing-info-motion="ready"
            data-pricing-info-in-view="false"
            data-pricing-info-media-prepared={membershipMediaPrepared}
        >
            <div
                className={SECTION_DIVIDER_WRAP_CLASS}
                data-pricing-info-reveal="divider"
            >
                <SectionDivider
                    number="01"
                    title="Paket Membersip"
                    subtitle="05 pricingpage"
                    theme="light"
                />
            </div>

            <div className={`${SECTION_CONTAINER_CLASS} pb-10 xl:pb-20`}>
                <div className="flex flex-col gap-4 xl:hidden">
                    <div
                        className="flex items-center gap-4"
                        data-pricing-info-reveal="label"
                    >
                        <span className="section-label-diamond" />
                        <ScrollTextReveal className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]">
                            Program Membership
                        </ScrollTextReveal>
                    </div>

                    <div data-pricing-info-reveal="headline">
                        <PricingMembershipHeadline />
                    </div>

                    <div
                        className="pricing-membership__card pricing-membership__card--mobile mx-auto my-6 w-full max-w-[380px]"
                        data-pricing-info-reveal="card"
                    >
                        <MembershipPlanCarousel
                            plans={plans}
                            eagerFirstImage={membershipMediaPrepared}
                            selectedPlanId={selectedMembershipPlanId}
                            onSelectPlan={(plan) =>
                                requestMembershipModalOpen(plan.id)
                            }
                        />
                    </div>

                    <div data-pricing-info-reveal="cta">
                        <ReservasiButton
                            label="Daftar Sekarang"
                            onClick={() => requestMembershipModalOpen()}
                        />
                    </div>

                    <div
                        className="mt-2 flex flex-col"
                        data-pricing-info-reveal="results"
                    >
                        <PricingResultsLabel mobile />
                        {STATS_DATA.map((stat) => (
                            <div
                                key={stat.label}
                                className="flex items-center justify-between border-b border-gray-200/80 py-3 last:border-b-0"
                            >
                                <span className="font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-black">
                                    {stat.label}
                                </span>
                                <span className="pl-3 text-right font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-gray-500">
                                    {stat.value}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div data-pricing-info-reveal="summary">
                        <ScrollTextReveal
                            as="p"
                            split="words"
                            delay={150}
                            className={BODY_TEXT_CLASS}
                        >
                            UB Sport Center hadir untuk mendukung gaya hidup aktif
                            Anda dengan fasilitas olahraga modern, instruktur
                            profesional, dan program membership yang dirancang untuk
                            semua kalangan di Kota Malang.
                        </ScrollTextReveal>
                    </div>
                </div>

                <div className="hidden xl:grid xl:grid-cols-12 xl:items-stretch xl:gap-x-10">
                    <div className="flex flex-col items-start xl:col-span-4">
                        <div
                            className="flex items-center gap-4"
                            data-pricing-info-reveal="label"
                        >
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]">
                                Program Membership
                            </ScrollTextReveal>
                        </div>

                        <div
                            className="pricing-membership__card mt-[clamp(2.5rem,3.2vw,3.75rem)] w-full max-w-[420px] flex-shrink-0"
                            data-pricing-info-reveal="card"
                        >
                            <MembershipPlanCarousel
                                plans={plans}
                                eagerFirstImage={membershipMediaPrepared}
                                selectedPlanId={selectedMembershipPlanId}
                                onSelectPlan={(plan) =>
                                    requestMembershipModalOpen(plan.id)
                                }
                            />
                        </div>
                    </div>

                    <div className="pricing-membership__desktop-content flex flex-col items-start gap-0 self-stretch xl:col-span-8">
                        <div
                            ref={desktopHeadlineRef}
                            className="w-full"
                            data-pricing-info-reveal="headline"
                        >
                            <PricingMembershipHeadline />
                        </div>

                        <div
                            ref={desktopResultsRef}
                            className="pricing-membership__results grid w-full flex-1"
                        >
                            <div
                                ref={desktopOverviewRef}
                                className="pricing-membership__overview-group"
                            >
                                <PricingResultsLabel />

                                <div
                                    className="pricing-membership__results-list"
                                    data-pricing-info-reveal="results"
                                >
                                    {STATS_DATA.map((stat, index) => (
                                        <div
                                            key={stat.label}
                                            className={RESULT_ROW_CLASS}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="pricing-membership__result-index font-bdo"
                                            >
                                                {String(index + 1).padStart(
                                                    2,
                                                    "0",
                                                )}
                                            </span>
                                            <span className="pricing-membership__result-label font-bdo font-medium">
                                                {stat.label}
                                            </span>
                                            <span className="pricing-membership__result-value text-right font-bdo font-medium">
                                                {stat.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div
                                ref={desktopCtaRef}
                                className="pricing-membership__cta"
                                data-pricing-info-reveal="cta"
                            >
                                <ReservasiButton
                                    label="Daftar Sekarang"
                                    onClick={() => requestMembershipModalOpen()}
                                />
                            </div>

                            <ScrollTextReveal
                                as="p"
                                split="words"
                                delay={150}
                                className={`${BODY_TEXT_CLASS} pricing-membership__summary`}
                            >
                                UB Sport Center hadir untuk mendukung gaya hidup
                                aktif Anda dengan fasilitas olahraga modern,
                                instruktur profesional, dan program membership
                                yang dirancang untuk semua kalangan di Kota
                                Malang.
                            </ScrollTextReveal>
                        </div>
                    </div>
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
