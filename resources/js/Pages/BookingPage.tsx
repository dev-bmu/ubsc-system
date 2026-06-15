import Navbar from "@/Components/Landing/Navbar";
import BookingHero from "@/Components/Booking/BookingHero";
import BookingSection from "@/Components/Booking/BookingSection";
import BookingFacilitiesSection from "@/Components/Booking/BookingFacilitiesSection";
import BookingReviewSection from "@/Components/Booking/BookingReviewSection";
import AboutSectionContact from "@/Components/About/AboutSectionContact";
import Footer from "@/Components/Landing/Footer";
import { Head, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";

interface BookingFacilityProp {
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
    prices?: Array<{ id: number; user_category: string; label: string; price: number; notes?: string | null }>;
    units?: Array<{ id: number; name: string; image: string }>;
}

export interface UserExistingReview {
    id: number;
    rating: number;
    text: string;
}

type BookingPageProps = PageProps<{
    facilities?: BookingFacilityProp[];
    can_review?: boolean;
    existing_review?: UserExistingReview | null;
}>;

export default function BookingPage() {
    const { facilities = [] } = usePage<BookingPageProps>().props;
    return (
        <>
            <Head>
                <title>Booking | UB Sport Center</title>
                <meta
                    name="description"
                    content="Booking fasilitas olahraga terbaik di UB Sport Center Malang — gym, lapangan futsal, yoga, dan banyak lagi."
                />
                <meta property="og:title" content="Booking | UB Sport Center" />
                <meta
                    property="og:description"
                    content="Temukan fasilitas terbaik dan booking sesi latihan Anda dengan mudah di UB Sport Center."
                />
                <meta
                    property="og:image"
                    content="/assets/images/gym-konten-1-olahraga-ub-sport-center.avif"
                />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
            </Head>
            <main className="relative">
                <Navbar activeSection = "Booking"/>
                <BookingHero />
                <BookingSection facilities={facilities} />
                <BookingFacilitiesSection />
                <BookingReviewSection />
                <AboutSectionContact />
            </main>
            <Footer />
        </>
    );
}
