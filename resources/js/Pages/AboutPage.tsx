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
import EntranceLoader from "@/Components/Landing/EntranceLoader";
import { HomepageEntranceProvider } from "@/Components/Landing/HomepageEntranceContext";
import HomepageMediaPrimer from "@/Components/Landing/HomepageMediaPrimer";
import SeoHead from "@/Components/SeoHead";
import { usePage } from "@inertiajs/react";
import Footer from "@/Components/Landing/Footer";
import { useCallback, useEffect, useState } from "react";
import type { PageProps } from "@/types";
import type { PublicTestimonial } from "@/Components/Landing/SectionSeven";

export default function AboutPage() {
    const { testimonials } =
        usePage<PageProps<{ testimonials?: PublicTestimonial[] }>>().props;
    const [entranceReady, setEntranceReady] = useState(false);
    const [heroMediaReady, setHeroMediaReady] = useState(false);
    const handleEntranceReady = useCallback(() => {
        setEntranceReady(true);
    }, []);
    const handleHeroMediaReady = useCallback(() => {
        setHeroMediaReady(true);
    }, []);
    const handleLoaderComplete = useCallback(() => {}, []);

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
        <HomepageEntranceProvider ready={entranceReady}>
            <div className="min-h-screen bg-white">
                <SeoHead />
                <HomepageMediaPrimer />
                <EntranceLoader
                    ready={heroMediaReady}
                    skipIntro
                    onEntranceReady={handleEntranceReady}
                    onComplete={handleLoaderComplete}
                />
                <main className="about-page-canvas relative bg-white">
                    <Navbar activeSection="About" />
                    <AboutHero onMediaReady={handleHeroMediaReady} />
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
                <div className="home-footer-reveal-root about-footer-reveal-root">
                    <div className="home-footer-reveal-stage">
                        <AboutSectionMap />
                    </div>
                    <div className="home-footer-reveal-footer">
                        <Footer />
                    </div>
                </div>
            </div>
        </HomepageEntranceProvider>
    );
}
