import heroImage from "@/../assets/images/bg-herobooking.avif";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import MembershipModal from "@/Components/Landing/MembershipModal";
import type { MembershipPlanItem } from "@/types";
import { ArrowRight as AccentArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import BeamsBackground from "./BeamsBackground";
import "./BookingHero.css";

const HERO_IMAGE_PRIORITY = { fetchpriority: "high" } as const;

const MARQUEE_PRIMARY = ["RESERVASI", "FASILITAS"];
const MARQUEE_SECONDARY = ["RESERVASI", "FASILITAS"];
const MARQUEE_TONES = ["adaptive", "spectrum", "glaze"] as const;

function MarqueeSet({
    phrases,
    duplicate = false,
}: {
    phrases: string[];
    duplicate?: boolean;
}) {
    return (
        <span className="booking-hero__marquee-set" aria-hidden={duplicate}>
            {phrases.map((phrase, index) => (
                <span
                    className="booking-hero__marquee-item"
                    key={`${phrase}-${index}`}
                >
                    <span className="booking-hero__marquee-word">{phrase}</span>
                </span>
            ))}
        </span>
    );
}

function MarqueeRow({
    phrases,
    reverse = false,
    layer,
    tone,
}: {
    phrases: string[];
    reverse?: boolean;
    layer: "rear" | "front";
    tone: (typeof MARQUEE_TONES)[number];
}) {
    return (
        <div
            className={`booking-hero__marquee-stage booking-hero__marquee-stage--${layer} booking-hero__marquee-stage--${tone}`}
            aria-hidden="true"
        >
            <div
                className={`booking-hero__marquee ${reverse ? "booking-hero__marquee--reverse" : ""}`}
            >
                <div className="booking-hero__marquee-track">
                    <MarqueeSet phrases={phrases} />
                    <MarqueeSet phrases={phrases} duplicate />
                </div>
            </div>
        </div>
    );
}

function BookingMembershipCta({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            className="booking-hero__arena-cta"
            onClick={onClick}
            data-membership-plan-entry
        >
            <span className="booking-hero__arena-cta-fill" aria-hidden="true" />
            <span className="booking-hero__arena-cta-content">
                <span>Daftar Membership</span>
                <span
                    className="booking-hero__arena-cta-arrow"
                    aria-hidden="true"
                >
                    <AccentArrowRight />
                </span>
            </span>
        </button>
    );
}

export function ChronoHalo({ layer }: { layer: "rear" | "front" }) {
    const isRear = layer === "rear";

    return (
        <svg
            className={`booking-hero__halo booking-hero__halo--${layer}`}
            viewBox="0 0 1200 540"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
        >
            <defs>
                <linearGradient
                    id={`booking-halo-${layer}`}
                    x1={isRear ? "90" : "1110"}
                    y1={isRear ? "352" : "310"}
                    x2={isRear ? "1120" : "110"}
                    y2={isRear ? "278" : "360"}
                    gradientUnits="userSpaceOnUse"
                >
                    <stop offset="0" stopColor="#0c3547" stopOpacity="0.08" />
                    <stop offset="0.2" stopColor="#4f9eb9" stopOpacity="0.54" />
                    <stop offset="0.48" stopColor="#e6efec" stopOpacity="0.94" />
                    <stop offset="0.72" stopColor="#63b3c8" stopOpacity="0.58" />
                    <stop offset="1" stopColor="#0b2f40" stopOpacity="0.06" />
                </linearGradient>
                <linearGradient
                    id={`booking-halo-glint-${layer}`}
                    x1="208"
                    y1="438"
                    x2="1012"
                    y2="120"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop offset="0" stopColor="#5aa8be" stopOpacity="0" />
                    <stop offset="0.42" stopColor="#eff6f2" stopOpacity="0.88" />
                    <stop offset="0.58" stopColor="#8bcbd8" stopOpacity="0.68" />
                    <stop offset="1" stopColor="#256d89" stopOpacity="0" />
                </linearGradient>
            </defs>

            {isRear ? (
                <>
                    <path
                        className="booking-hero__halo-aura"
                        pathLength="1"
                        stroke={`url(#booking-halo-${layer})`}
                        d="M96 338C151 133 382 35 646 47C913 59 1087 170 1117 308"
                    />
                    <path
                        className="booking-hero__halo-line booking-hero__halo-line--main"
                        pathLength="1"
                        stroke={`url(#booking-halo-${layer})`}
                        d="M96 338C151 133 382 35 646 47C913 59 1087 170 1117 308"
                    />
                    <path
                        className="booking-hero__halo-line booking-hero__halo-line--echo"
                        pathLength="1"
                        stroke={`url(#booking-halo-glint-${layer})`}
                        d="M139 321C206 158 405 77 642 82C875 86 1033 173 1078 293"
                    />
                    <path
                        className="booking-hero__halo-meridian booking-hero__halo-meridian--rear"
                        pathLength="1"
                        stroke={`url(#booking-halo-glint-${layer})`}
                        d="M199 439C395 396 560 292 683 166C780 66 874 24 1004 83"
                    />
                </>
            ) : (
                <>
                    <path
                        className="booking-hero__halo-aura"
                        pathLength="1"
                        stroke={`url(#booking-halo-${layer})`}
                        d="M1117 308C1091 442 888 510 635 496C371 482 158 421 96 338"
                    />
                    <path
                        className="booking-hero__halo-line booking-hero__halo-line--main"
                        pathLength="1"
                        stroke={`url(#booking-halo-${layer})`}
                        d="M1117 308C1091 442 888 510 635 496C371 482 158 421 96 338"
                    />
                    <path
                        className="booking-hero__halo-line booking-hero__halo-line--echo"
                        pathLength="1"
                        stroke={`url(#booking-halo-glint-${layer})`}
                        d="M1078 326C1023 426 850 470 638 461C427 452 254 409 139 351"
                    />
                    <path
                        className="booking-hero__halo-meridian booking-hero__halo-meridian--front"
                        pathLength="1"
                        stroke={`url(#booking-halo-glint-${layer})`}
                        d="M199 439C395 396 560 292 683 166"
                    />
                    <path
                        className="booking-hero__halo-sweep"
                        pathLength="1"
                        stroke={`url(#booking-halo-glint-${layer})`}
                        d="M1117 308C1091 442 888 510 635 496C371 482 158 421 96 338C151 133 382 35 646 47C913 59 1087 170 1117 308"
                    />
                    <g className="booking-hero__halo-station">
                        <circle cx="936" cy="458" r="3.8" />
                        <circle cx="936" cy="458" r="10.5" />
                    </g>
                </>
            )}
        </svg>
    );
}

export default function BookingHero({
    membershipPlans = [],
}: {
    membershipPlans?: MembershipPlanItem[];
}) {
    const sectionRef = useRef<HTMLElement | null>(null);
    const [membershipModalOpen, setMembershipModalOpen] = useState(false);
    const defaultPlanId =
        membershipPlans.find((plan) => plan.is_primary)?.id ??
        membershipPlans[0]?.id ??
        null;
    const [selectedMembershipPlanId, setSelectedMembershipPlanId] = useState<
        number | null
    >(defaultPlanId);

    useEffect(() => {
        if (
            selectedMembershipPlanId !== null &&
            membershipPlans.some(
                (plan) => plan.id === selectedMembershipPlanId,
            )
        ) {
            return;
        }
        setSelectedMembershipPlanId(defaultPlanId);
    }, [defaultPlanId, membershipPlans, selectedMembershipPlanId]);

    const requestMembershipModalOpen = useCallback((planId?: number | null) => {
        if (
            planId !== undefined &&
            planId !== null &&
            membershipPlans.some((plan) => plan.id === planId)
        ) {
            setSelectedMembershipPlanId(planId);
        }

        const entry = sectionRef.current?.querySelector<HTMLElement>(
            "[data-membership-plan-entry]",
        );
        entry?.scrollIntoView({ behavior: "auto", block: "center" });
        window.requestAnimationFrame(() => setMembershipModalOpen(true));
    }, [membershipPlans]);

    return (
        <>
            <section
                ref={sectionRef}
                className="booking-hero"
                id="booking-hero"
                data-section
                aria-labelledby="booking-hero-title"
            >
            <BeamsBackground
                className="booking-hero__beams"
                beamColor="#15678D"
                speed={0.55}
            />

            <h1 className="booking-hero__sr-title" id="booking-hero-title">
                Reservasi arena UB Sport Center
            </h1>

            <div className="booking-hero__atmosphere" aria-hidden="true" />

            <div className="booking-hero__edge-field" aria-hidden="true">
                <span className="booking-hero__edge-wing booking-hero__edge-wing--left" />
                <span className="booking-hero__edge-wing booking-hero__edge-wing--right" />
            </div>

            {MARQUEE_TONES.map((tone) => (
                <MarqueeRow
                    phrases={MARQUEE_SECONDARY}
                    layer="rear"
                    tone={tone}
                    key={`upper-${tone}`}
                />
            ))}

            <ChronoHalo layer="rear" />

            <div className="booking-hero__focus">
                <span className="booking-hero__focus-rail booking-hero__focus-rail--top" />
                <span className="booking-hero__focus-rail booking-hero__focus-rail--bottom" />

                <figure className="booking-hero__portrait">
                    <img
                        className="booking-hero__portrait-base"
                        src={heroImage}
                        alt="Atlet berlari dalam sesi latihan di UB Sport Center"
                        width="1920"
                        height="2050"
                        decoding="async"
                        {...HERO_IMAGE_PRIORITY}
                    />
                    <img
                        className="booking-hero__portrait-shift"
                        src={heroImage}
                        alt=""
                        aria-hidden="true"
                        width="1920"
                        height="2050"
                        decoding="async"
                    />
                    <span className="booking-hero__portrait-tone" aria-hidden="true" />
                </figure>

                <BookingMembershipCta
                    onClick={() => requestMembershipModalOpen()}
                />
            </div>

            {MARQUEE_TONES.map((tone) => (
                <MarqueeRow
                    phrases={MARQUEE_PRIMARY}
                    reverse
                    layer="front"
                    tone={tone}
                    key={`lower-${tone}`}
                />
            ))}

            <ChronoHalo layer="front" />

            <div className="booking-hero__pricing-row page-hero-bottom">
                <HeroBottomBar
                    variant="transparent"
                    sectionNumber="06/"
                    sectionLabel="bookingpage"
                    description="UB Sport Center - Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama."
                    targetId="booking-content"
                    showVideo={false}
                    lineInset
                    sectionInset
                    mobileCopySmaller
                    mobileCopyLockRight
                />
            </div>
            </section>
            <MembershipModal
                isOpen={membershipModalOpen}
                onClose={() => setMembershipModalOpen(false)}
                onRequestOpen={requestMembershipModalOpen}
                plans={membershipPlans}
                selectedPlanId={selectedMembershipPlanId}
                onSelectedPlanChange={(plan) =>
                    setSelectedMembershipPlanId(plan.id)
                }
            />
        </>
    );
}
