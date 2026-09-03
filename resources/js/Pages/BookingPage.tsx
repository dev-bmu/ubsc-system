import Navbar from "@/Components/Landing/Navbar";
import BookingHero from "@/Components/Booking/BookingHero";
import BookingSection from "@/Components/Booking/BookingSection";
import BookingFacilitiesSection from "@/Components/Booking/BookingFacilitiesSection";
import BookingReviewSection from "@/Components/Booking/BookingReviewSection";
import AboutSectionContact from "@/Components/About/AboutSectionContact";
import SectionSeven from "@/Components/Landing/SectionSeven";
import DeferredSectionEight from "@/Components/Landing/DeferredSectionEight";
import Footer from "@/Components/Landing/Footer";
import SeoHead from "@/Components/SeoHead";
import { usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import type { PublicTestimonial } from "@/Components/Landing/SectionSeven";
import type { BookingGalleryImage } from "@/Components/Booking/BookingFacilityGallery";
import type { MembershipPlanItem } from "@/types";
import type { PublicFacilityReservation } from "@/lib/facilityReservation";

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
    booking_gallery?: BookingGalleryImage[];
    reservation?: PublicFacilityReservation | null;
}

export interface UserExistingReview {
    id: number;
    rating: number;
    text: string;
    status: "pending" | "approved" | "rejected";
    status_label: string;
    status_message: string;
    moderation_feedback: string | null;
    eligibility_label: string;
    version: number;
    submitted_at: string | null;
    updated_at: string | null;
    published_at: string | null;
}

export interface UserReviewEligibility {
    eligible: boolean;
    reason:
        | "email_unverified"
        | "completed_booking"
        | "paid_membership"
        | "no_qualifying_activity";
    source: "booking" | "membership" | null;
    reference_id: number | null;
    label: string;
    message: string;
}

export interface PublicReviewSummary {
    total: number;
    averageRating: number | null;
    avatars: Array<{
        reviewId: string;
        authorName: string;
        avatar: string;
        avatarFallback: string;
    }>;
}

type BookingPageProps = PageProps<{
    facilities?: BookingFacilityProp[];
    booking_today?: string;
    booking_calendar?: unknown;
    can_review?: boolean;
    review_eligibility?: UserReviewEligibility | null;
    existing_review?: UserExistingReview | null;
    approved_reviews_summary?: PublicReviewSummary;
    testimonials?: PublicTestimonial[];
    membershipPlans?: MembershipPlanItem[];
}>;

export default function BookingPage() {
    const {
        facilities = [],
        booking_today: bookingToday,
        booking_calendar: bookingCalendar,
        testimonials,
        membershipPlans = [],
    } = usePage<BookingPageProps>().props;

    return (
        <>
            <SeoHead />
            <main className="booking-page-canvas relative">
                <Navbar activeSection="Booking" surface="media" />
                <BookingHero membershipPlans={membershipPlans} />
                <BookingSection
                    facilities={facilities}
                    bookingToday={bookingToday}
                    bookingCalendar={bookingCalendar}
                />
                <BookingReviewSection />
                <BookingFacilitiesSection facilities={facilities} />
                <SectionSeven
                    testimonials={testimonials}
                    sectionNumber="05"
                    sectionTitle="Testimoni"
                    sectionSubtitle="06 bookingpage"
                    dividerLineWeight="hairline"
                />
                <AboutSectionContact
                    sectionNumber="06"
                    sectionTitle="Informasi"
                    sectionSubtitle="06 bookingpage"
                    dividerLineWeight="hairline"
                />
            </main>
            <div className="home-footer-reveal-root booking-footer-reveal-root">
                <div className="home-footer-reveal-stage">
                    <DeferredSectionEight deferLoopAnimations />
                </div>
                <div className="home-footer-reveal-footer">
                    <Footer deferLoopAnimations />
                </div>
            </div>
        </>
    );
}
