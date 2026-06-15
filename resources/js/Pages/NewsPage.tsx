import Navbar from "@/Components/Landing/Navbar";
import NewsHero from "@/Components/News/NewsHero";
import type { NewsSlide } from "@/Components/News/NewsHero";
import ServicesSectionNews from "@/Components/News/ServicesSectionNews";
import ServicesSectionArtikel from "@/Components/News/ServicesSectionArtikel";
import Footer from "@/Components/Landing/Footer";
import { Head, usePage } from "@inertiajs/react";
import AboutSectionContact from "@/Components/About/AboutSectionContact";
import type { PageProps } from "@/types";

interface BackendNewsItem {
    id: string | number;
    title: string;
    slug: string;
    date: string;
    category: string;
    image: string;
    description?: string;
}

type NewsPageProps = PageProps<{
    news?: BackendNewsItem[];
}>;

export default function NewsPage() {
    const { news = [] } = usePage<NewsPageProps>().props;

    const heroSlides: NewsSlide[] = news.slice(0, 3).map((item) => ({
        id: item.id,
        badge: item.category,
        title: item.title,
        description: item.description ?? '',
        date: item.date,
        image: item.image || '/assets/images/comingsoon.avif',
    }));

    // Cast is safe — API only returns "Berita" or "Artikel" for category
    const beritaItems = news.filter((n) => n.category === 'Berita') as never[];
    const artikelItems = news.filter((n) => n.category === 'Artikel') as never[];

    return (
        <>
            <Head>
                <title>Berita | UB Sport Center</title>
                <meta
                    name="description"
                    content="Berita dan artikel terbaru dari UB Sport Center — pusat olahraga terkemuka di Malang."
                />
                <meta property="og:title" content="Berita | UB Sport Center" />
                <meta
                    property="og:description"
                    content="Berita dan artikel terbaru dari UB Sport Center."
                />
                <meta
                    property="og:image"
                    content="/assets/images/gym-konten-1-olahraga-ub-sport-center.avif"
                />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
            </Head>
            <main className="relative">
                <Navbar activeSection="News" />
                <NewsHero slides={heroSlides.length > 0 ? heroSlides : undefined} />
                <div id="news-content" />
                <ServicesSectionNews news={beritaItems} />
                <ServicesSectionArtikel articles={artikelItems} />
                <AboutSectionContact sectionNumber="03" sectionTitle="Informasi" sectionSubtitle="03 news page" />
            </main>
            <Footer />
        </>
    );
}
