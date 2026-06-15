import Navbar from "@/Components/Landing/Navbar";
import FacilityHero from "@/Components/Facility/FacilityHero";
import FacilityMembership from "@/Components/Facility/FacilityMembership";
import FacilityListSection from "@/Components/Facility/FacilityListSection";
import FacilityClassSection from "@/Components/Facility/FacilityClassSection";
import type { ClassItem } from "@/Components/Facility/FacilityClassSection";
import type { FacilityItem } from "@/Components/Facility/FacilityListItem";
import AboutBranches from "@/Components/About/AboutBranches";
import SectionSeven from "@/Components/Landing/SectionSeven";
import AboutSectionContact from "@/Components/About/AboutSectionContact";
import Footer from "@/Components/Landing/Footer";
import { Head, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import FacilityOutdoorSection from "@/Components/Facility/FacilityOutdoorSection";

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
        }));

    const classFacilities: ClassItem[] = facilities
        .filter((f) => f.category === "Kelas & Kebugaran")
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            name: f.name,
            code: f.class_code ?? String(idx + 1).padStart(3, "0"),
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location ?? "Veteran",
            badgeCategory: "Kebugaran",
        }));

    return (
        <>
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
                <Navbar activeSection="Facilities" />
                <FacilityHero />
                <FacilityMembership />
                <FacilityListSection facilities={arenaFacilities} />
                <FacilityClassSection classes={classFacilities} />
                <FacilityOutdoorSection
                    sectionNumber="04"
                    sectionTitle="Fasilitas Outdoor"
                    // sectionSubtitle="04 facility page"
                    // facilities={
                    //     outdoorFacilities.length > 0
                    //         ? outdoorFacilities
                    //         : undefined
                    // }
                />
                <SectionSeven
                    sectionNumber="05"
                    sectionTitle="Testimoni"
                    sectionSubtitle="05 facility page"
                />
                <AboutSectionContact
                    sectionNumber="06"
                    sectionTitle="Informasi"
                    sectionSubtitle="06 facility page"
                />
            </main>
            <Footer />
        </>
    );
}
