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
import { Head, usePage } from "@inertiajs/react";
import Footer from "@/Components/Landing/Footer";
import { useEffect } from "react";
import type { PageProps } from "@/types";
import type { PublicTestimonial } from "@/Components/Landing/SectionSeven";

export default function AboutPage() {
    const { testimonials } = usePage<
        PageProps<{ testimonials?: PublicTestimonial[] }>
    >().props;

    useEffect(() => {
        const previousBodyBackground = document.body.style.backgroundColor;
        const previousHtmlBackground =
            document.documentElement.style.backgroundColor;

        document.body.style.backgroundColor = "#ffffff";
        document.documentElement.style.backgroundColor = "#ffffff";

        return () => {
            document.body.style.backgroundColor = previousBodyBackground;
            document.documentElement.style.backgroundColor =
                previousHtmlBackground;
        };
    }, []);

    return (
        <div className="min-h-screen bg-white">
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
            <main className="about-page-canvas relative bg-white">
                <Navbar activeSection="About" />
                <AboutHero />
                <AboutHistory />
                <div className="about-post-history-flow bg-white">
                    <AboutBranches />
                    <AboutServices />
                    <FadeIn>
                        <AboutVisionMission />
                    </FadeIn>
                    <FadeIn>
                        <AboutSectionFaq />
                    </FadeIn>
                    <FadeIn>
                        <SectionSeven
                            testimonials={testimonials}
                            sectionNumber="06"
                            sectionTitle="Testimoni"
                            sectionSubtitle="02 aboutpage"
                        />
                    </FadeIn>
                    <FadeIn>
                        <AboutSectionContact />
                    </FadeIn>
                </div>
            </main>
            <div className="home-footer-reveal-root">
                <div className="home-footer-reveal-stage">
                    <AboutSectionMap />
                </div>
                <div className="home-footer-reveal-footer">
                    <Footer />
                </div>
            </div>
        </div>
    );
}
