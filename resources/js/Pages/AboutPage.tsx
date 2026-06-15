import Navbar from "@/Components/Landing/Navbar";
import FadeIn from "@/Components/Landing/FadeIn";
import SectionSeven from "@/Components/Landing/SectionSeven";
import AboutHero from "@/Components/About/AboutHero";
import AboutHistory from "@/Components/About/AboutHistory";
import AboutBranches from "@/Components/About/AboutBranches";
import AboutServices from "@/Components/About/AboutServices";
import AboutVisionMission from "@/Components/About/AboutVisionMission";
import AboutSectionFaq from "@/Components/About/AboutSectionFaq";
import AboutSectionContact from "@/Components/About/AboutSectionContact";
import AboutSectionMap from "@/Components/About/AboutSectionMap";
import { Head } from "@inertiajs/react";
import Footer from "@/Components/Landing/Footer";

export default function AboutPage() {
    return (
        <>
            <Head>
                <title>Tentang Kami | UB Sport Center</title>
                <meta
                    name="description"
                    content="Pelajari sejarah, visi, dan perkembangan UB Sport Center — pusat olahraga terkemuka di Malang yang melayani sivitas akademika dan masyarakat umum."
                />
                <meta
                    property="og:title"
                    content="Tentang Kami | UB Sport Center"
                />
                <meta
                    property="og:description"
                    content="Pelajari sejarah, visi, dan perkembangan UB Sport Center — pusat olahraga terkemuka di Malang."
                />
                <meta property="og:image" content="/assets/images/gym-konten-1-olahraga-ub-sport-center.avif" />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
            </Head>
            <main className="relative">
                <Navbar activeSection="About" />
                <AboutHero />
                <FadeIn>
                    <AboutHistory />
                </FadeIn>
                <AboutBranches />
                <FadeIn>
                    <AboutServices />
                </FadeIn>
                <FadeIn>
                    <AboutVisionMission />
                </FadeIn>
                <FadeIn>
                    <AboutSectionFaq />
                </FadeIn>
                <FadeIn>
                    <SectionSeven />
                </FadeIn>
                <FadeIn>
                    <AboutSectionContact />
                </FadeIn>
                <AboutSectionMap />
            </main>
            <Footer />
        </>
    );
}
