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
import { Head, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
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
        .filter((f) => f.category === "Lapangan & Arena")
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}.`,
            code: f.class_code
                ? `/${f.class_code}/`
                : `/Tertutup ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location ?? "Veteran",
            badgeType: f.venue_type ?? "Indoor Facility",
            slug: f.slug,
        }));

    const outdoorFacilities: OutdoorArenaItem[] = facilities
        .filter((facility) => {
            const searchable = `${facility.name} ${facility.venue_type ?? ""}`.toLowerCase();

            return [
                "outdoor",
                "arena luar",
                "terbuka",
                "sepak bola",
                "football",
                "voli",
            ].some((keyword) => searchable.includes(keyword));
        })
        .map((facility) => ({
            id: facility.id,
            name: facility.name,
            category: facility.venue_type ?? "Outdoor Facility",
            image:
                facility.image ||
                "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
            location: facility.location ?? "UB Sport Center",
            href: facility.slug ? `/facilities/${facility.slug}` : null,
            fallback:
                "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        }));

    return (
        <div className="min-h-screen bg-white">
            <Head>
                <title>Fasilitas | UB Sport Center</title>
                <meta
                    name="description"
                    content="Temukan fasilitas olahraga terlengkap di UB Sport Center Malang — gym, lapangan futsal, yoga, zumba, dan masih banyak lagi."
                />
                <meta
                    property="og:title"
                    content="Fasilitas | UB Sport Center"
                />
                <meta
                    property="og:description"
                    content="Fasilitas olahraga terlengkap di UB Sport Center Malang."
                />
                <meta
                    property="og:image"
                    content="/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif"
                />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
            </Head>
            <main className="relative">
                <Navbar activeSection="Facilities" />
                <FacilityHero />

                <section className="section-two-curtain relative z-[18] w-full overflow-x-clip bg-transparent">
                    <HeroCurtainEdge postFlowSelector=".facility-post-membership-flow" />
                    <div className="section-two-curtain-content relative z-10 bg-white">
                        <FacilityMembership />
                    </div>
                </section>

                <div className="facility-post-membership-flow bg-white">
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
