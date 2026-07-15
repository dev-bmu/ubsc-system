import Navbar from "@/Components/Landing/Navbar";
import PricingHero from "@/Components/Pricing/PricingHero";
import PricingInfo from "@/Components/Pricing/PricingInfo";
import PricingFacilityList from "@/Components/Pricing/PricingFacilityList";
import PricingClassSection from "@/Components/Pricing/PricingClassSection";
import PricingAccordionSection from "@/Components/Pricing/PricingAccordionSection";
import AboutSectionContact from "@/Components/About/AboutSectionContact";
import Footer from "@/Components/Landing/Footer";
import HeroCurtainEdge from "@/Components/Landing/HeroCurtainEdge";
import { Head, usePage } from "@inertiajs/react";
import type { MembershipPlanItem, PageProps } from "@/types";

type PricingPageProps = PageProps<{
    facilities?: Array<{
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
    }>;
    membershipPlans?: MembershipPlanItem[];
}>;

export default function PricingPage() {
    const { facilities = [], membershipPlans = [] } =
        usePage<PricingPageProps>().props;
    return (
        <div className="min-h-screen bg-white">
            <Head>
                <title>Jadwal &amp; Paket Harga | UB Sport Center</title>
                <meta
                    name="description"
                    content="Pilih jadwal dan paket olahraga terbaik di UB Sport Center Malang."
                />
                <meta
                    property="og:title"
                    content="Jadwal & Paket Harga | UB Sport Center"
                />
                <meta
                    property="og:description"
                    content="Berbagai pilihan paket harga fleksibel dan terjangkau di UB Sport Center."
                />
                <meta
                    property="og:image"
                    content="/assets/images/gym-konten-1-olahraga-ub-sport-center.avif"
                />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
            </Head>
            <main className="relative">
                <Navbar activeSection="Pricing" />
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

            <div className="home-footer-reveal-root">
                <div className="home-footer-reveal-stage">
                    <AboutSectionContact
                        sectionNumber="05"
                        sectionTitle="Informasi"
                        sectionSubtitle="05 pricing page"
                    />
                </div>
                <div className="home-footer-reveal-footer">
                    <Footer />
                </div>
            </div>
        </div>
    );
}
