import Navbar from "@/Components/Landing/Navbar";
import FacilityHero from "@/Components/Facility/FacilityHero";
import FacilityMembership from "@/Components/Facility/FacilityMembership";
import FacilityGallerySection from "@/Components/Facility/FacilityGallerySection";
import ExclusiveFacilitiesSection from "@/Components/Facility/ExclusiveFacilitiesSection";
import OutdoorArenaShowcase, {
    type OutdoorArenaItem,
} from "@/Components/Facility/OutdoorArenaShowcase";
import type { FacilityItem } from "@/Components/Facility/FacilityListItem";
import Footer from "@/Components/Landing/Footer";
import HeroCurtainEdge from "@/Components/Landing/HeroCurtainEdge";
import SeoHead from "@/Components/SeoHead";
import { usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import { isOutdoorFacility } from "@/lib/facilityClassification";
import {
    facilityReservationDestination,
    type PublicFacilityReservation,
} from "@/lib/facilityReservation";
import { useEffect, useRef } from "react";

interface BackendFacility {
    id: number;
    name: string;
    slug: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    display_metadata?: Record<string, unknown> | null;
    reservation?: PublicFacilityReservation | null;
}

type FacilityPageProps = PageProps<{
    facilities?: BackendFacility[];
    categories?: { id: number; name: string; slug: string }[];
}>;

export default function FacilityPage() {
    const { facilities = [] } = usePage<FacilityPageProps>().props;
    const footerRevealRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = footerRevealRef.current;
        const stage = root?.querySelector<HTMLElement>(
            ".home-footer-reveal-stage",
        );

        if (!root || !stage) return;

        let frame = 0;
        const measure = () => {
            frame = 0;
            const stickyTop = Math.min(
                0,
                window.innerHeight - stage.getBoundingClientRect().height,
            );
            root.style.setProperty(
                "--facility-footer-stage-top",
                `${stickyTop}px`,
            );
        };
        const requestMeasure = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(measure);
        };
        const resizeObserver = new ResizeObserver(requestMeasure);

        resizeObserver.observe(stage);
        window.addEventListener("resize", requestMeasure, { passive: true });
        requestMeasure();
        void document.fonts?.ready.then(requestMeasure);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", requestMeasure);
            if (frame) window.cancelAnimationFrame(frame);
            root.style.removeProperty("--facility-footer-stage-top");
        };
    }, []);

    const arenaFacilities: FacilityItem[] = facilities
        .filter(
            (f) =>
                f.category === "Lapangan & Arena" &&
                !isOutdoorFacility(f),
        )
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}.`,
            code: f.class_code
                ? `/${f.class_code}/`
                : `/Tertutup ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location ?? "Veteran",
            badgeType: "Arena Dalam",
            slug: f.slug,
            reservation: f.reservation,
        }));

    const outdoorFacilities: OutdoorArenaItem[] = facilities
        .filter(isOutdoorFacility)
        .map((facility) => {
            const destination = facilityReservationDestination(
                facility.reservation,
                facility.name,
                facility.location,
            );

            return {
                id: facility.id,
                name: facility.name,
                category: facility.venue_type ?? "Outdoor Facility",
                image:
                    facility.image ||
                    "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
                location: facility.location ?? "UB Sport Center",
                href: destination.href,
                target: destination.target,
                fallback:
                    "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
            };
        });

    return (
        <div className="min-h-screen bg-white">
            <SeoHead />
            <main className="facility-page-canvas relative">
                <Navbar activeSection="Facilities" />
                <FacilityHero />

                <section className="section-two-curtain relative z-[18] w-full overflow-x-clip bg-transparent">
                    <HeroCurtainEdge postFlowSelector=".facility-post-membership-flow" />
                    <div className="section-two-curtain-content relative z-10 bg-white">
                        <FacilityMembership />
                    </div>
                </section>

                <div className="facility-post-membership-flow relative z-[2] bg-white">
                    <FacilityGallerySection facilities={arenaFacilities} />
                    <ExclusiveFacilitiesSection />
                </div>
            </main>

            <div
                ref={footerRevealRef}
                className="home-footer-reveal-root facility-footer-reveal-root"
            >
                <div className="home-footer-reveal-stage">
                    <OutdoorArenaShowcase
                        facilities={
                            outdoorFacilities.length > 0
                                ? outdoorFacilities
                                : undefined
                        }
                    />
                </div>
                <div className="home-footer-reveal-footer">
                    <Footer />
                </div>
            </div>
        </div>
    );
}
