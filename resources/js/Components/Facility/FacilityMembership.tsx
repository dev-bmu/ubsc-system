import { type ReactNode, useEffect, useRef, useState } from "react";
import LogoMarquee from "@/Components/Landing/LogoMarquee";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import SectionDivider from "@/Components/Landing/SectionDivider";
import FacilitySectionLabel from "./FacilitySectionLabel";
import "./FacilityMembership.css";

const MEMBERSHIP_COPY =
    "Daftarkan diri Anda sekarang dan rasakan pengalaman berolahraga yang sesungguhnya. Pilih paket membership yang sesuai dengan target dan jadwal Anda di UB Sport Center.";

const MEMBERSHIP_HEADING =
    "Bergabunglah dengan komunitas olahraga terbaik dan capai target Anda. Kami sedia program terstruktur - semua di satu tempat.";

function MembershipHeadline() {
    return (
        <h2
            className="home-section-heading facility-membership__heading section-two-headline-weight max-w-[1100px] text-left font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-[980px] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:max-w-[1120px] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
        >
            <ScrollTextReveal
                split="lines"
                delay={110}
                stagger={95}
                className="facility-membership__heading-reveal"
            >
                {MEMBERSHIP_HEADING}
            </ScrollTextReveal>
        </h2>
    );
}

function MembershipObjectReveal({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    const elementRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        if (!("IntersectionObserver" in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold: 0.08,
                rootMargin: "160px 0px -5% 0px",
            },
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={elementRef}
            className={`facility-membership__object-reveal ${isVisible ? "is-visible" : ""
                } ${className}`}
        >
            {children}
        </div>
    );
}

function MembershipVisual() {
    return (
        <MembershipObjectReveal className="facility-membership__visual">
            <figure>
                <div className="facility-membership__media">
                    <img
                        src="/assets/images/gym-konten-2-olahraga-ub-sport-center.avif"
                        alt="UB Sport Center membership"
                        width="960"
                        height="432"
                        loading="lazy"
                        decoding="async"
                    />
                    <span
                        className="facility-membership__media-wash"
                        aria-hidden="true"
                    />
                    <span
                        className="facility-membership__media-marker"
                        aria-hidden="true"
                    />
                    <span className="facility-membership__media-index font-bdo">
                        01 / MEMBER
                    </span>
                    <span
                        className="facility-membership__media-line"
                        aria-hidden="true"
                    />
                </div>
                <figcaption className="font-bdo">
                    <span>Built for progress</span>
                    <span>UBSC / Malang</span>
                </figcaption>
            </figure>
        </MembershipObjectReveal>
    );
}

export default function FacilityMembership() {
    return (
        <section className="facility-membership" id="facility-membership">
            <div className="facility-membership__divider">
                <SectionDivider
                    number="01"
                    title="Fasilitas Gym"
                    subtitle="04 facilitypage"
                    theme="light"
                />
            </div>

            <div className="facility-membership__shell">
                <div className="facility-membership__masthead">
                    <FacilitySectionLabel className="facility-membership__label">
                        Program Membership
                    </FacilitySectionLabel>

                    <div className="facility-membership__meta font-bdo">
                        <span>01 / Membership</span>
                        <span>UB Sport Center / 2026</span>
                    </div>
                </div>

                <div className="facility-membership__composition">
                    <MembershipVisual />

                    <div className="facility-membership__content">
                        <span
                            className="facility-membership__watermark font-clash"
                            aria-hidden="true"
                        >
                            MEMBERSHIP
                        </span>

                        <MembershipHeadline />

                        <MembershipObjectReveal className="facility-membership__details">
                            <MembershipObjectReveal className="facility-membership__action">
                                <span className="facility-membership__action-label font-bdo">
                                    Your next movement
                                </span>
                                <ReservasiButton
                                    label="Daftar Sekarang"
                                    href="#"
                                    size="compact"
                                />
                            </MembershipObjectReveal>

                            <MembershipObjectReveal
                                className="facility-membership__index-rail font-bdo"
                            >
                                <span
                                    className="facility-membership__index-label"
                                    aria-hidden="true"
                                >
                                    Membership
                                </span>
                                <i
                                    className="facility-membership__index-datum"
                                    aria-hidden="true"
                                />
                                <span
                                    className="facility-membership__index-code"
                                    aria-hidden="true"
                                >
                                    <span>Program</span>
                                    <strong>01</strong>
                                </span>
                            </MembershipObjectReveal>

                            <div className="facility-membership__copy">
                                <ScrollTextReveal
                                    as="p"
                                    split="words"
                                    delay={160}
                                    stagger={11}
                                    className="font-bdo"
                                >
                                    {MEMBERSHIP_COPY}
                                </ScrollTextReveal>

                                <div
                                    className="facility-membership__copy-meta font-bdo"
                                    aria-hidden="true"
                                >
                                    <span>Membership / UBSC</span>
                                    <span>Malang / 2026</span>
                                </div>
                            </div>
                        </MembershipObjectReveal>
                    </div>
                </div>

                <div className="facility-membership__sponsors">
                    <LogoMarquee
                        density="compact"
                        label="/SUPPORTED BY"
                        variant="facilityMembership"
                    />
                </div>
            </div>
        </section>
    );
}
