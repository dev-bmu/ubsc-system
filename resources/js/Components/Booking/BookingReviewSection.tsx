import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import { CheckCircle, ChevronLeft, ChevronRight, MessageSquareQuote, Star } from "lucide-react";
import { useForm, usePage } from "@inertiajs/react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import BookingReviewCard, { type Review } from "./BookingReviewCard";
import type { PageProps } from "@/types";
import type { UserExistingReview } from "@/Pages/BookingPage";
import { cn } from "@/lib/utils";

// ── Fallback data (shown when no approved reviews exist yet) ──────────────────

const DUMMY_REVIEWS: Review[] = [];

// ── StarSelector (0.5 increment half-star support) ────────────────────────────

function StarSelector({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    const [hovered, setHovered] = useState(0);
    const display = hovered || value;

    const resolveValue = (
        e: React.MouseEvent<HTMLButtonElement>,
        i: number,
    ): number => {
        const rect = e.currentTarget.getBoundingClientRect();
        return e.clientX - rect.left < rect.width / 2 ? i - 0.5 : i;
    };

    return (
        <div
            className="flex items-center gap-1"
            onMouseLeave={() => setHovered(0)}
        >
            {[1, 2, 3, 4, 5].map((i) => {
                const isFull = display >= i;
                const isHalf = !isFull && display >= i - 0.5;
                return (
                    <button
                        key={i}
                        type="button"
                        onMouseMove={(e) => setHovered(resolveValue(e, i))}
                        onClick={(e) => onChange(resolveValue(e, i))}
                        className="relative flex-shrink-0 w-[26px] h-[26px] transition-transform hover:scale-110 active:scale-95"
                        aria-label={`${i} bintang`}
                    >
                        <Star
                            size={26}
                            className="absolute inset-0 fill-transparent text-gray-300 transition-colors duration-150"
                        />
                        {(isFull || isHalf) && (
                            <div
                                className="absolute inset-0 overflow-hidden"
                                style={{ width: isFull ? "100%" : "50%" }}
                            >
                                <Star
                                    size={26}
                                    className="fill-[#0B1E3B] text-[#0B1E3B]"
                                />
                            </div>
                        )}
                    </button>
                );
            })}
            {value > 0 && (
                <span className="ml-2 font-bdo text-sm text-gray-500 tabular-nums">
                    {value} / 5
                </span>
            )}
        </div>
    );
}

// ── ReviewForm ────────────────────────────────────────────────────────────────

function ReviewForm({
    existingReview,
}: {
    existingReview: UserExistingReview | null;
}) {
    const isEditing = !!existingReview;

    const { data, setData, post, processing, recentlySuccessful, errors } =
        useForm({
            rating: existingReview?.rating ?? 0,
            text: existingReview?.text ?? "",
        });

    const canSubmit = data.rating >= 0.5 && data.text.trim().length >= 10;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route("reviews.store"), { preserveScroll: true });
    };

    if (recentlySuccessful) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4"
            >
                <CheckCircle
                    size={18}
                    className="mt-0.5 flex-shrink-0 text-emerald-600"
                />
                <p className="font-bdo text-sm leading-relaxed text-emerald-700">
                    Berhasil! Ulasan Anda sedang menunggu moderasi admin.
                </p>
            </motion.div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Star rating */}
            <div className="flex flex-col gap-2">
                <label className="font-bdo text-[11px] font-medium uppercase tracking-widest text-gray-400">
                    Rating Anda
                </label>
                <StarSelector
                    value={data.rating}
                    onChange={(v) => setData("rating", v)}
                />
                {errors.rating && (
                    <p className="font-bdo text-xs text-rose-500">
                        {errors.rating}
                    </p>
                )}
            </div>

            {/* Textarea */}
            <div className="flex flex-col gap-2">
                <label className="font-bdo text-[11px] font-medium uppercase tracking-widest text-gray-400">
                    Ulasan
                </label>
                <textarea
                    value={data.text}
                    onChange={(e) => setData("text", e.target.value)}
                    rows={5}
                    maxLength={1000}
                    placeholder="Ceritakan pengalaman Anda menggunakan fasilitas UB Sport Center…"
                    className={cn(
                        "w-full resize-none rounded-xl border bg-[#F9F9F9] px-4 py-3",
                        "font-bdo text-sm leading-relaxed text-gray-800 placeholder-gray-400",
                        "transition-all duration-200 focus:bg-white focus:outline-none",
                        "focus:border-[#0B1E3B] focus:ring-2 focus:ring-[#0B1E3B]/8",
                        errors.text ? "border-rose-300" : "border-gray-200",
                    )}
                />
                <div className="flex items-center justify-between">
                    <p className="font-bdo text-xs text-gray-400">
                        {errors.text ?? "Minimal 10 karakter"}
                    </p>
                    <span className="font-bdo text-xs tabular-nums text-gray-400">
                        {data.text.length}/1000
                    </span>
                </div>
            </div>

            {/* Submit */}
            <button
                type="submit"
                disabled={!canSubmit || processing}
                className={cn(
                    "w-full rounded-xl py-3.5 font-clash text-sm font-semibold transition-all duration-200",
                    canSubmit && !processing
                        ? "bg-[#0B1E3B] text-white hover:bg-[#0E2444] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                        : "cursor-not-allowed bg-gray-100 text-gray-400",
                )}
            >
                {processing
                    ? "Menyimpan…"
                    : isEditing
                      ? "Perbarui Ulasan"
                      : "Kirim Ulasan"}
            </button>

            {isEditing && (
                <p className="font-bdo text-center text-[11px] text-gray-400">
                    Ulasan sebelumnya aktif — perubahan akan menunggu moderasi
                    ulang.
                </p>
            )}
        </form>
    );
}

// ── BadgePill ─────────────────────────────────────────────────────────────────

function BadgePill() {
    return (
        <div className="inline-flex w-fit items-center gap-3 overflow-hidden rounded-xl border border-gray-100 bg-white p-1 pr-5 shadow-sm">
            <div className="flex h-12 w-14 items-center justify-center rounded-lg bg-gradient-to-tr from-[#002244] to-[#15678D]">
                <MessageSquareQuote size={18} className="text-white" />
            </div>
            <span className="font-bdo font-semibold text-[14px] text-black">
                Ulasan Member
            </span>
        </div>
    );
}

// ── Main section ──────────────────────────────────────────────────────────────

type BookingPageInertiaProps = PageProps<{
    can_review?: boolean;
    existing_review?: UserExistingReview | null;
    approved_reviews?: Review[];
}>;

export default function BookingReviewSection() {
    const {
        auth,
        can_review,
        existing_review,
        approved_reviews = [],
    } = usePage<BookingPageInertiaProps>().props;
    const user = auth.user;

    // Use real approved reviews; fall back to dummy data until reviews accumulate
    const reviews =
        approved_reviews.length > 0 ? approved_reviews : DUMMY_REVIEWS;
    const duplicatedReviews = [...reviews, ...reviews];

    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: true,
        align: "start",
        containScroll: "trimSnaps",
    });

    useEffect(() => {
        if (!emblaApi || reviews.length <= 1) return;

        const autoplay = window.setInterval(() => {
            emblaApi.scrollNext();
        }, 7000);

        return () => window.clearInterval(autoplay);
    }, [emblaApi, reviews.length]);

    const scrollPrev = useCallback(
        () => emblaApi && emblaApi.scrollPrev(),
        [emblaApi],
    );
    const scrollNext = useCallback(
        () => emblaApi && emblaApi.scrollNext(),
        [emblaApi],
    );

    return (
        <section className="w-full bg-[#F9F9F9] py-24 overflow-hidden">
            {/* Section divider */}
            <div className="mx-auto max-w-8xl px-6 sm   :px-10 lg:px-16 xl:px-24">
                <SectionDivider
                    number="03"
                    title="Ulasan"
                    subtitle="06 bookingpage"
                    theme="light"
                />
            </div>

            {/* ── STEP 1: Three-column section header ──────────────────────── */}
            <div className="mx-auto max-w-8xl px-6 mt-12 sm:px-10 lg:px-16 xl:px-24">
                <div className="flex flex-col gap-6 xl:flex-row xl:gap-16 xl:items-center">
                    {/* LEFT: small label badge */}
                    <div className="xl:w-64 xl:flex-shrink-0 flex items-center gap-2">
                        <span className="h-3 w-3 flex-shrink-0 rounded-sm bg-red-600" />
                        <span
                            className="font-bdo font-medium tracking-wide text-gray-900"
                            style={{ fontSize: "clamp(1rem, 1rem, 1.5rem)" }}
                        >
                            Fasilitas Kami
                        </span>
                    </div>

                    {/* CENTER: main heading */}
                    <div className="flex-1 min-w-0">
                        <h2
                            className="font-bdo font-medium leading-tight text-left md:text-center  text-black"
                            style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)" }}
                        >
                            Dukungan Penuh Untuk <br />
                            Setiap Cabang Olahraga
                        </h2>
                    </div>

                    {/* RIGHT: description */}
                    <div className="xl:w-56 xl:flex-shrink-0">
                        <p className="font-bdo text-sm leading-relaxed text-gray-500">
                            Kami menghadirkan berbagai pilihan fasilitas
                            olahraga indoor dan fitness untuk kenyamanan latihan
                            Anda.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Mobile: Embla swipe carousel ──────────────────────────────── */}
            <div className="xl:hidden mt-16 w-full">
                {/* Embla viewport */}
                <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex gap-4 pl-6">
                        {reviews.map((review, i) => (
                            <div
                                key={`${review.id}-${i}`}
                                className="flex-shrink-0 w-[85vw] sm:w-[45vw]"
                            >
                                <BookingReviewCard review={review} />
                            </div>
                        ))}
                    </div>
                </div>
                {/* Nav buttons — bottom right */}
                <div className="flex justify-end gap-2 px-6 mt-4">
                    <button
                        onClick={scrollPrev}
                        aria-label="Previous review"
                        className="flex size-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button
                        onClick={scrollNext}
                        aria-label="Next review"
                        className="flex size-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* ── Desktop: infinite marquee animation ───────────────────────── */}
            <div className="hidden xl:flex w-full relative mt-16">
                <motion.div
                    className="flex gap-8 pl-24 pointer-events-none"
                    animate={{ x: ["-50%", "0%"] }}
                    transition={{
                        repeat: Infinity,
                        ease: "linear",
                        duration: 35,
                    }}
                >
                    {duplicatedReviews.map((review, i) => (
                        <BookingReviewCard
                            key={`${review.id}-${i}`}
                            review={review}
                        />
                    ))}
                </motion.div>
            </div>

            {/* ── Three-column form layout ─────────────────────────────────── */}
            <div className="mx-auto px-6 mt-20 sm:px-10 lg:px-16 xl:px-24 flex flex-col gap-8 xl:flex-row xl:gap-32 xl:items-start">
                {/* LEFT — label pinned top, badge centered in remaining height */}
                <div className="xl:w-64 xl:flex-shrink-0 xl:self-stretch flex flex-col gap-6">
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 flex-shrink-0 rounded-sm bg-red-600" />
                        <span
                            className="font-bdo font-medium tracking-wide text-gray-900"
                            style={{ fontSize: "clamp(1rem, 1rem, 1.5rem)" }}
                        >
                            Suara Member UBSC
                        </span>
                    </div>

                    {/* Mobile-only heading */}
                    <div
                        className="xl:hidden font-bdo font-medium leading-tight text-black"
                        style={{ fontSize: "clamp(1.24rem, 4vw, 1.5rem)" }}
                    >
                        <h2>Bagikan Pengalaman</h2>
                        <h2>&amp; Masukan Anda</h2>
                    </div>

                    {/* Desktop pill badge — flex-1 centers it in the space below the label */}
                    <div className="hidden xl:flex flex-1 items-center">
                        <BadgePill />
                    </div>
                </div>

                {/* CENTER — review form states */}
                <div className="flex-1 min-w-0">
                    {!user ? (
                        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#0B1E3B]/5">
                                    <MessageSquareQuote
                                        size={16}
                                        className="text-[#0B1E3B]"
                                    />
                                </div>
                                <p className="font-bdo text-sm text-gray-700">
                                    Login untuk memberikan ulasan tentang
                                    fasilitas kami.
                                </p>
                            </div>
                            <a
                                href="/booking?auth=login"
                                className="w-full rounded-xl bg-[#0B1E3B] py-3 text-center font-clash text-sm font-semibold text-white transition-all hover:bg-[#0E2444] hover:-translate-y-0.5 hover:shadow-lg"
                            >
                                Login
                            </a>
                        </div>
                    ) : !can_review ? (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                            <Star
                                size={18}
                                className="mt-0.5 flex-shrink-0 fill-amber-400 text-amber-400"
                            />
                            <p className="font-bdo text-sm leading-relaxed text-amber-800">
                                Selesaikan pesanan pertama Anda untuk dapat
                                memberikan ulasan.
                            </p>
                        </div>
                    ) : (
                        <ReviewForm existingReview={existing_review ?? null} />
                    )}
                </div>

                {/* RIGHT — mobile pill + desktop heading */}
                <div className="xl:hidden">
                    <BadgePill />
                </div>
                <div className="hidden xl:flex xl:w-56 xl:flex-shrink-0 xl:self-center flex-col">
                    <h2 className="font-bdo font-medium text-[20px] leading-[1.4] text-black">
                        Bagikan Pengalaman &amp; Masukan Anda untuk Layanan yang
                        Lebih Baik
                    </h2>
                </div>
            </div>
        </section>
    );
}
