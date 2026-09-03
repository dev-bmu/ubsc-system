import {
    ArrowUpRight,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Clock3,
    Pencil,
    ShieldCheck,
    X,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useForm, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import type {
    PublicReviewSummary,
    UserExistingReview,
    UserReviewEligibility,
} from "@/Pages/BookingPage";
import BookingReviewCard, { type Review } from "./BookingReviewCard";
import ReviewAvatar from "./ReviewAvatar";
import ReviewRatingStars from "./ReviewRatingStars";
import { useAuthFlow } from "@/Components/Landing/AuthFlowProvider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import SectionDivider from "@/Components/Landing/SectionDivider";
import "./BookingReviewSection.css";

const RATING_OPTIONS = Array.from(
    { length: 10 },
    (_, index) => (index + 1) / 2,
);

const REVIEW_FEED_REFRESH_BASE_MS = 60_000;
const REVIEW_FEED_REFRESH_JITTER_MS = 20_000;

function ratingDescriptor(value: number): string {
    if (value <= 0) return "Pilih nilai pengalaman Anda";
    if (value <= 1) return "Perlu banyak perbaikan";
    if (value <= 2) return "Belum memuaskan";
    if (value <= 3) return "Cukup baik";
    if (value <= 4) return "Pengalaman yang baik";
    if (value < 5) return "Pengalaman yang sangat baik";

    return "Pengalaman yang luar biasa";
}

type BookingPageInertiaProps = PageProps<{
    can_review?: boolean;
    review_eligibility?: UserReviewEligibility | null;
    existing_review?: UserExistingReview | null;
    approved_reviews?: Review[];
    approved_reviews_summary?: PublicReviewSummary;
}>;

function formatCount(value: number): string {
    return String(value).padStart(2, "0");
}

const REVIEW_COUNT_UNITS = [
    { divisor: 1_000_000_000, suffix: "b" },
    { divisor: 1_000_000, suffix: "m" },
    { divisor: 1_000, suffix: "k" },
] as const;

function formatCompactReviewCount(value: number): string {
    const count = Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
    const unit = REVIEW_COUNT_UNITS.find(
        ({ divisor }) => count >= divisor,
    );

    if (!unit) return String(count);

    const floored = Math.floor(count / (unit.divisor / 10)) / 10;

    return `${floored}${unit.suffix}`;
}

function formatMarketingReviewCount(value: number): string {
    const count = Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;

    if (count < 1_000) return String(count);

    return `${formatCompactReviewCount(count)}+`;
}

function isReview(value: unknown): value is Review {
    if (!value || typeof value !== "object") return false;

    const review = value as Partial<Review>;

    return (
        typeof review.id === "string" &&
        typeof review.rating === "number" &&
        Number.isFinite(review.rating) &&
        review.rating >= 0.5 &&
        review.rating <= 5 &&
        typeof review.text === "string" &&
        typeof review.authorName === "string" &&
        typeof review.authorDate === "string" &&
        (typeof review.avatar === "string" ||
            review.avatar === null ||
            review.avatar === undefined) &&
        (typeof review.avatarFallback === "string" ||
            review.avatarFallback === null ||
            review.avatarFallback === undefined)
    );
}

function summarizeReviews(reviews: Review[]): PublicReviewSummary {
    return {
        total: reviews.length,
        averageRating:
            reviews.length > 0
                ? reviews.reduce((total, review) => total + review.rating, 0) /
                  reviews.length
                : null,
        avatars: reviews.slice(0, 4).map((review) => ({
            reviewId: review.id,
            authorName: review.authorName,
            avatar: review.avatar ?? review.avatarFallback ?? "",
            avatarFallback: review.avatarFallback ?? review.avatar ?? "",
        })),
    };
}

function isReviewSummary(value: unknown): value is PublicReviewSummary {
    if (!value || typeof value !== "object") return false;

    const summary = value as Partial<PublicReviewSummary>;

    return (
        typeof summary.total === "number" &&
        Number.isInteger(summary.total) &&
        summary.total >= 0 &&
        (summary.averageRating === null ||
            (typeof summary.averageRating === "number" &&
                Number.isFinite(summary.averageRating) &&
                summary.averageRating >= 0.5 &&
                summary.averageRating <= 5)) &&
        Array.isArray(summary.avatars) &&
        summary.avatars.every((avatar) =>
            Boolean(
                avatar &&
                    typeof avatar.reviewId === "string" &&
                    typeof avatar.authorName === "string" &&
                    typeof avatar.avatar === "string" &&
                    typeof avatar.avatarFallback === "string",
            ),
        )
    );
}

function reviewFeedFromPayload(
    payload: unknown,
): { reviews: Review[]; summary: PublicReviewSummary } | null {
    if (!payload || typeof payload !== "object") return null;

    const reviews = (payload as { reviews?: unknown }).reviews;
    if (!Array.isArray(reviews) || !reviews.every(isReview)) return null;

    const summary = (payload as { summary?: unknown }).summary;
    if (!isReviewSummary(summary) || summary.total < reviews.length) return null;

    return { reviews, summary };
}

function RatingSelector({
    value,
    onChange,
    disabled = false,
}: {
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}) {
    return (
        <fieldset className="booking-review-rating" disabled={disabled}>
            <legend className="booking-reviews__sr-only">Rating Anda</legend>
            <div
                className={`booking-review-rating__visual${
                    value > 0 ? " has-value" : ""
                }`}
                aria-live="polite"
                aria-atomic="true"
            >
                <ReviewRatingStars
                    key={value > 0 ? value : "empty"}
                    rating={value}
                    className="booking-review-rating__stars"
                    label={
                        value > 0
                            ? `Rating dipilih ${value.toFixed(1)} dari 5`
                            : "Belum ada rating yang dipilih"
                    }
                />
                <span>{ratingDescriptor(value)}</span>
            </div>
            <div className="booking-review-rating__head">
                <span>Rating</span>
                <strong>{value > 0 ? value.toFixed(1) : "—"} / 5.0</strong>
            </div>
            <div className="booking-review-rating__scale">
                {RATING_OPTIONS.map((rating) => (
                    <label
                        key={rating}
                        className={value === rating ? "is-active" : ""}
                    >
                        <input
                            type="radio"
                            name="rating"
                            value={rating}
                            checked={value === rating}
                            onChange={() => onChange(rating)}
                            aria-label={`${rating.toFixed(1)} dari 5`}
                        />
                        <span>{rating.toFixed(1)}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

function ReviewForm({
    existingReview,
    onClose,
}: {
    existingReview: UserExistingReview | null;
    onClose: () => void;
}) {
    const isEditing = Boolean(existingReview);
    const titleId = useId();
    const textareaId = useId();
    const textareaDescriptionId = useId();
    const { data, setData, post, processing, recentlySuccessful, errors } =
        useForm({
            rating: existingReview?.rating ?? 0,
            text: existingReview?.text ?? "",
        });

    const hasChanges =
        !existingReview ||
        data.rating !== existingReview.rating ||
        data.text.trim() !== existingReview.text.trim();
    const canSubmit =
        data.rating >= 0.5 &&
        data.text.trim().length >= 10 &&
        hasChanges;
    const workflowError = (errors as Record<string, string>).review;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        post(route("reviews.store"), { preserveScroll: true });
    };

    if (recentlySuccessful) {
        return (
            <div
                className="booking-review-form booking-review-form--success"
                role="status"
                aria-live="polite"
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Tutup konfirmasi ulasan"
                >
                    <X aria-hidden="true" />
                </button>
                <div>
                    <span>
                        <Check aria-hidden="true" />
                        Terkirim
                    </span>
                    <h3 data-review-form-title tabIndex={-1}>
                        Suara Anda sudah tercatat.
                    </h3>
                    <p>
                        Ulasan sedang melewati moderasi sebelum diterbitkan
                        untuk publik.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <form
            className="booking-review-form"
            onSubmit={handleSubmit}
            aria-labelledby={titleId}
        >
            <header>
                <div>
                    <span>(Ulasan member)</span>
                    <h3
                        id={titleId}
                        data-review-form-title
                        tabIndex={-1}
                    >
                        {isEditing
                            ? "Perbarui ulasan Anda"
                            : "Bagikan pengalaman Anda"}
                    </h3>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Tutup formulir ulasan"
                >
                    <X aria-hidden="true" />
                </button>
            </header>

            <div className="booking-review-form__fields">
                <RatingSelector
                    value={data.rating}
                    onChange={(rating) => setData("rating", rating)}
                    disabled={processing}
                />

                <div className="booking-review-form__message">
                    <div>
                        <label htmlFor={textareaId}>Ulasan</label>
                        <span>{formatCount(data.text.length)} / 1000</span>
                    </div>
                    <textarea
                        id={textareaId}
                        value={data.text}
                        onChange={(event) => setData("text", event.target.value)}
                        rows={6}
                        maxLength={1000}
                        disabled={processing}
                        placeholder="Ceritakan pengalaman Anda menggunakan fasilitas UB Sport Center..."
                        aria-invalid={Boolean(errors.text)}
                        aria-describedby={textareaDescriptionId}
                    />
                    <div
                        id={textareaDescriptionId}
                        className="booking-review-form__meta"
                    >
                        <span>
                            {errors.text ??
                                "Minimal 10 karakter, maksimal 1000."}
                        </span>
                        <span>Dipublikasikan setelah moderasi.</span>
                    </div>
                </div>
            </div>

            {errors.rating && (
                <p className="booking-review-form__error" role="alert">
                    {errors.rating}
                </p>
            )}
            {workflowError && (
                <p className="booking-review-form__error" role="alert">
                    {workflowError}
                </p>
            )}

            <footer>
                <p>
                    {isEditing
                        ? hasChanges
                            ? "Versi baru akan ditinjau kembali sebelum diterbitkan."
                            : "Ubah rating atau isi ulasan sebelum memperbarui."
                        : "Identitas member menjaga setiap ulasan tetap dapat dipercaya."}
                </p>
                <button type="submit" disabled={!canSubmit || processing}>
                    <span>
                        {processing
                            ? "Menyimpan..."
                            : isEditing
                              ? "Perbarui ulasan"
                              : "Kirim ulasan"}
                    </span>
                    <ArrowUpRight aria-hidden="true" />
                </button>
            </footer>
        </form>
    );
}

function UserReviewPanel({
    review,
    userName,
    canEdit,
    onEdit,
}: {
    review: UserExistingReview;
    userName: string;
    canEdit: boolean;
    onEdit: () => void;
}) {
    const statusIcon =
        review.status === "approved" ? (
            <ShieldCheck aria-hidden="true" />
        ) : review.status === "rejected" ? (
            <CircleAlert aria-hidden="true" />
        ) : (
            <Clock3 aria-hidden="true" />
        );

    return (
        <article
            className={`booking-user-review booking-user-review--${review.status}`}
            aria-labelledby="booking-user-review-title"
        >
            <header className="booking-user-review__header">
                <div className="booking-user-review__identity">
                    <span aria-hidden="true">
                        {userName.trim().charAt(0).toUpperCase() || "U"}
                    </span>
                    <div>
                        <small>Ulasan Anda</small>
                        <h3 id="booking-user-review-title">{userName}</h3>
                    </div>
                </div>
                <span className="booking-user-review__status">
                    {statusIcon}
                    {review.status_label}
                </span>
            </header>

            <div className="booking-user-review__body">
                <div className="booking-user-review__rating">
                    <ReviewRatingStars
                        rating={review.rating}
                        label={`Rating Anda ${review.rating.toFixed(1)} dari 5`}
                    />
                    <strong>{review.rating.toFixed(1)} / 5.0</strong>
                </div>
                <p>{review.text}</p>
                {review.status === "rejected" && review.moderation_feedback && (
                    <aside className="booking-user-review__feedback">
                        <span>Catatan moderator</span>
                        <p>{review.moderation_feedback}</p>
                    </aside>
                )}
            </div>

            <footer className="booking-user-review__footer">
                <div>
                    <span>{review.eligibility_label}</span>
                    <time>{review.submitted_at ?? review.updated_at ?? "Baru dikirim"}</time>
                    <small>{review.status_message}</small>
                </div>
                <button
                    type="button"
                    data-booking-user-review-action
                    onClick={onEdit}
                    disabled={!canEdit}
                >
                    <Pencil aria-hidden="true" />
                    {canEdit ? "Edit ulasan" : "Akses edit terkunci"}
                </button>
            </footer>
        </article>
    );
}

export default function BookingReviewSection() {
    const {
        auth,
        can_review,
        review_eligibility,
        existing_review,
        approved_reviews = [],
        approved_reviews_summary,
    } = usePage<BookingPageInertiaProps>().props;
    const user = auth.user;
    const { openAuth } = useAuthFlow();
    const [reviews, setReviews] = useState<Review[]>(approved_reviews);
    const [reviewSummary, setReviewSummary] = useState<PublicReviewSummary>(
        approved_reviews_summary ?? summarizeReviews(approved_reviews),
    );
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [composerOpen, setComposerOpen] = useState(false);
    const [feedStatus, setFeedStatus] = useState<
        "idle" | "connected" | "offline" | "error"
    >("idle");
    const reviewsRef = useRef<Review[]>(approved_reviews);
    const selectedIndexRef = useRef(0);
    const feedRequestRef = useRef<AbortController | null>(null);
    const feedEtagRef = useRef<string | null>(null);
    const requestedIndexRef = useRef<number | null>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const composerTriggerRef = useRef<HTMLButtonElement>(null);

    const requestReviewAuthentication = useCallback(() => {
        const returnUrl = new URL(window.location.href);
        returnUrl.hash = "booking-reviews";
        openAuth({
            view: "login",
            returnTo: `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`,
        });
    }, [openAuth]);

    const applyReviews = useCallback(
        (nextReviews: Review[], nextSummary?: PublicReviewSummary) => {
            const activeReviewId =
                reviewsRef.current[selectedIndexRef.current]?.id ?? null;
            const preservedIndex = activeReviewId
                ? nextReviews.findIndex(
                      (review) => review.id === activeReviewId,
                  )
                : -1;
            const nextIndex = preservedIndex >= 0 ? preservedIndex : 0;

            reviewsRef.current = nextReviews;
            selectedIndexRef.current = nextIndex;
            setSelectedIndex(nextIndex);
            setReviews(nextReviews);
            setReviewSummary(nextSummary ?? summarizeReviews(nextReviews));
        },
        [],
    );

    useEffect(() => {
        applyReviews(approved_reviews, approved_reviews_summary);
    }, [approved_reviews, approved_reviews_summary, applyReviews]);

    useEffect(() => {
        selectedIndexRef.current = selectedIndex;
    }, [selectedIndex]);

    const refreshReviewFeed = useCallback(async () => {
        if (
            typeof document === "undefined" ||
            document.visibilityState === "hidden" ||
            feedRequestRef.current
        ) {
            return;
        }

        const controller = new AbortController();
        feedRequestRef.current = controller;

        try {
            const headers: Record<string, string> = {
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
            };

            if (feedEtagRef.current) {
                headers["If-None-Match"] = feedEtagRef.current;
            }

            const response = await fetch("/booking/reviews/feed", {
                method: "GET",
                headers,
                credentials: "same-origin",
                cache: "no-store",
                signal: controller.signal,
            });

            if (response.status === 304) {
                setFeedStatus("connected");
                return;
            }

            if (!response.ok) {
                throw new Error(`Review feed returned ${response.status}`);
            }

            const nextFeed = reviewFeedFromPayload(await response.json());
            if (!nextFeed) {
                throw new Error("Review feed payload is invalid");
            }

            feedEtagRef.current = response.headers.get("ETag");
            applyReviews(nextFeed.reviews, nextFeed.summary);
            setFeedStatus("connected");
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            setFeedStatus(
                typeof navigator !== "undefined" && !navigator.onLine
                    ? "offline"
                    : "error",
            );
        } finally {
            if (feedRequestRef.current === controller) {
                feedRequestRef.current = null;
            }
        }
    }, [applyReviews]);

    useEffect(() => {
        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") {
                void refreshReviewFeed();
            }
        };
        const refreshWhenOnline = () => {
            void refreshReviewFeed();
        };
        const markOffline = () => {
            setFeedStatus("offline");
        };
        let disposed = false;
        let pollId: number | null = null;
        const scheduleRefresh = () => {
            if (disposed) return;

            const jitter = Math.floor(
                Math.random() * REVIEW_FEED_REFRESH_JITTER_MS,
            );

            pollId = window.setTimeout(async () => {
                await refreshReviewFeed();
                if (!disposed) scheduleRefresh();
            }, REVIEW_FEED_REFRESH_BASE_MS + jitter);
        };

        void refreshReviewFeed();
        scheduleRefresh();
        document.addEventListener("visibilitychange", refreshWhenVisible);
        window.addEventListener("focus", refreshWhenVisible);
        window.addEventListener("online", refreshWhenOnline);
        window.addEventListener("offline", markOffline);

        return () => {
            disposed = true;
            if (pollId !== null) window.clearTimeout(pollId);
            document.removeEventListener(
                "visibilitychange",
                refreshWhenVisible,
            );
            window.removeEventListener("focus", refreshWhenVisible);
            window.removeEventListener("online", refreshWhenOnline);
            window.removeEventListener("offline", markOffline);
            feedRequestRef.current?.abort();
            feedRequestRef.current = null;
        };
    }, [refreshReviewFeed]);

    const canDrag = reviews.length > 1;
    const reviewTotal = Math.max(reviewSummary.total, reviews.length);
    const averageRating = reviewSummary.averageRating ?? 0;
    const summaryReviews = reviews.slice(0, 3);
    const remainingReviewCount = Math.max(
        0,
        reviewTotal - summaryReviews.length,
    );
    const reviewSignature = reviews.map((review) => review.id).join(":");
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        loop: false,
        slidesToScroll: 1,
        watchDrag: canDrag,
    });
    const needsEmailVerification =
        review_eligibility?.reason === "email_unverified";

    const syncCarousel = useCallback(() => {
        if (!emblaApi) return;
        const snapIndex = emblaApi.selectedScrollSnap();
        const snapCount = emblaApi.scrollSnapList().length;
        const requestedIndex = requestedIndexRef.current;
        const reviewIndex =
            requestedIndex ??
            (snapCount > 1 && snapIndex === snapCount - 1
                ? Math.max(0, reviews.length - 1)
                : snapIndex);

        requestedIndexRef.current = null;
        setSelectedIndex(reviewIndex);
    }, [emblaApi, reviews.length]);

    useEffect(() => {
        if (!emblaApi) return;

        syncCarousel();
        emblaApi.on("select", syncCarousel);
        emblaApi.on("reInit", syncCarousel);

        return () => {
            emblaApi.off("select", syncCarousel);
            emblaApi.off("reInit", syncCarousel);
        };
    }, [emblaApi, syncCarousel]);

    useEffect(() => {
        if (selectedIndex < reviews.length) return;
        setSelectedIndex(0);
        emblaApi?.scrollTo(0, true);
    }, [emblaApi, reviews.length, selectedIndex]);

    useEffect(() => {
        if (!composerOpen) return;
        requestAnimationFrame(() => {
            composerRef.current
                ?.querySelector<HTMLElement>("[data-review-form-title]")
                ?.focus({ preventScroll: true });
        });
    }, [composerOpen]);

    useEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;

        if (composerOpen) {
            composer.removeAttribute("inert");
        } else {
            composer.setAttribute("inert", "");
        }
    }, [composerOpen, user, can_review]);

    const selectReview = useCallback(
        (index: number) => {
            const snapCount = emblaApi?.scrollSnapList().length ?? 0;
            const targetSnap = Math.min(index, Math.max(0, snapCount - 1));
            requestedIndexRef.current = index;
            setSelectedIndex(index);
            emblaApi?.scrollTo(targetSnap);
            requestAnimationFrame(() => {
                if (requestedIndexRef.current === index) {
                    requestedIndexRef.current = null;
                }
            });
        },
        [emblaApi],
    );

    useEffect(() => {
        if (!emblaApi) return;

        const index = Math.min(
            selectedIndexRef.current,
            Math.max(0, reviewsRef.current.length - 1),
        );
        requestedIndexRef.current = index;
        emblaApi.reInit();
        const snapCount = emblaApi.scrollSnapList().length;
        emblaApi.scrollTo(Math.min(index, Math.max(0, snapCount - 1)), true);
    }, [emblaApi, reviewSignature]);

    const closeComposer = useCallback(() => {
        composerTriggerRef.current?.focus({ preventScroll: true });
        setComposerOpen(false);
    }, []);

    const openComposer = useCallback(() => {
        setComposerOpen(true);
    }, []);

    const handleCarouselKeyDown = (
        event: React.KeyboardEvent<HTMLDivElement>,
    ) => {
        if (reviews.length < 2) return;

        let nextIndex = selectedIndex;
        if (event.key === "ArrowRight") {
            nextIndex = Math.min(reviews.length - 1, selectedIndex + 1);
        } else if (event.key === "ArrowLeft") {
            nextIndex = Math.max(0, selectedIndex - 1);
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = reviews.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        selectReview(nextIndex);
    };

    return (
        <section
            id="booking-reviews"
            className="booking-reviews"
            aria-labelledby="booking-reviews-heading"
        >
            <h2
                id="booking-reviews-heading"
                className="booking-reviews__sr-only"
            >
                Apa Kata Mereka
            </h2>
            <div className="booking-reviews__divider-shell mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)] pb-10 sm:pb-20 xl:pb-16">
                <SectionDivider
                    number="02"
                    title="Apa Kata Mereka"
                    subtitle="06 bookingpage"
                    theme="light"
                    lineWeight="hairline"
                />
            </div>

            <div className="booking-reviews__shell">
                <div className="booking-reviews__board">
                    <aside
                        className="booking-review-score"
                        aria-label="Ringkasan rating member"
                    >
                        <header>
                            <span className="booking-review-score__kicker">
                                <span
                                    className="section-label-diamond"
                                    aria-hidden="true"
                                />
                                <ScrollTextReveal
                                    delay={80}
                                    className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                                >
                                    Semua Ulasan
                                </ScrollTextReveal>
                            </span>
                            <span>{formatCount(reviewTotal)} /</span>
                        </header>

                        <div className="booking-review-score__value">
                            <strong>
                                <span className="booking-review-score__number">
                                    {reviews.length > 0
                                        ? averageRating.toFixed(1)
                                        : "—"}
                                </span>
                                {reviews.length > 0 && (
                                    <small aria-hidden="true">/5</small>
                                )}
                            </strong>
                            {reviews.length > 0 ? (
                                <div className="booking-review-score__proof">
                                    <div
                                        className="booking-review-score__avatars"
                                        aria-label={`${summaryReviews.length} foto profil pengguna terbaru`}
                                    >
                                        {summaryReviews.map(
                                            (review, index) => (
                                                <ReviewAvatar
                                                    key={review.id}
                                                    authorName={
                                                        review.authorName
                                                    }
                                                    avatar={review.avatar}
                                                    avatarFallback={
                                                        review.avatarFallback
                                                    }
                                                    eager={index < 3}
                                                />
                                            ),
                                        )}
                                        {remainingReviewCount > 0 && (
                                            <span
                                                className="booking-review-score__more"
                                                aria-label={`${remainingReviewCount} pengguna lainnya`}
                                            >
                                                +
                                                {formatCompactReviewCount(
                                                    remainingReviewCount,
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    <div className="booking-review-score__trust">
                                        <ReviewRatingStars
                                            rating={averageRating}
                                            className="booking-review-stars--score"
                                            label={`Rata-rata ${averageRating.toFixed(1)} dari 5`}
                                        />
                                        <p
                                            aria-label={`Dipercaya oleh ${reviewTotal} pengguna`}
                                        >
                                            Dipercaya oleh{" "}
                                            <strong>
                                                {formatMarketingReviewCount(
                                                    reviewTotal,
                                                )}{" "}
                                                pengguna
                                            </strong>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="booking-review-score__empty">
                                    Belum ada pengalaman yang diterbitkan.
                                </p>
                            )}
                            <span
                                className="booking-reviews__sr-only"
                                aria-live="polite"
                            >
                                {reviewTotal > 0
                                    ? `Rata-rata ${averageRating.toFixed(1)} dari 5 berdasarkan ${reviewTotal} ulasan. ${
                                          feedStatus === "connected"
                                              ? "Data ulasan tersinkron."
                                              : ""
                                      }`
                                    : "Belum ada rating pengguna."}
                            </span>
                        </div>

                        <footer className="booking-review-score__footer">
                            <div
                                className="booking-review-score__controls"
                                aria-label="Navigasi ulasan"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        selectReview(
                                            Math.max(0, selectedIndex - 1),
                                        )
                                    }
                                    disabled={
                                        reviews.length < 2 ||
                                        selectedIndex === 0
                                    }
                                    aria-label="Ulasan sebelumnya"
                                >
                                    <ChevronLeft aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    className={
                                        reviews.length > 1 &&
                                        selectedIndex === 0
                                            ? "is-forward-cue"
                                            : undefined
                                    }
                                    onClick={() =>
                                        selectReview(
                                            Math.min(
                                                reviews.length - 1,
                                                selectedIndex + 1,
                                            ),
                                        )
                                    }
                                    disabled={
                                        reviews.length < 2 ||
                                        selectedIndex === reviews.length - 1
                                    }
                                    aria-label="Ulasan berikutnya"
                                >
                                    <ChevronRight aria-hidden="true" />
                                </button>
                            </div>

                            <div className="booking-review-score__contribute">
                                {!user ? (
                                    <ReservasiButton
                                        label="Tuliskan Ulasan"
                                        ariaLabel="Masuk untuk menuliskan ulasan"
                                        onClick={requestReviewAuthentication}
                                        size="review"
                                    />
                                ) : !can_review ? (
                                    <ReservasiButton
                                        label={
                                            needsEmailVerification
                                                ? "Verifikasi Email"
                                                : "Mulai Reservasi"
                                        }
                                        ariaLabel={
                                            review_eligibility?.message ??
                                            "Selesaikan reservasi atau miliki membership untuk menuliskan ulasan"
                                        }
                                        href={
                                            needsEmailVerification
                                                ? route("verification.notice")
                                                : "#booking-finder"
                                        }
                                        size="review"
                                    />
                                ) : (
                                    <ReservasiButton
                                        label="Tuliskan Ulasan"
                                        ariaLabel={
                                            existing_review
                                                ? "Perbarui ulasan Anda"
                                                : "Tuliskan ulasan Anda"
                                        }
                                        size="review"
                                        buttonRef={composerTriggerRef}
                                        ariaExpanded={composerOpen}
                                        ariaControls="booking-review-composer"
                                        onClick={
                                            composerOpen
                                                ? closeComposer
                                                : openComposer
                                        }
                                    />
                                )}
                            </div>

                            <span
                                className="booking-reviews__sr-only"
                                aria-live="polite"
                            >
                                {reviews.length > 0
                                    ? `Ulasan ${selectedIndex + 1} dari ${
                                          reviews.length
                                      }`
                                    : "Belum ada ulasan"}
                            </span>
                        </footer>
                    </aside>

                    <div
                        className="booking-reviews__viewport"
                        ref={reviews.length > 0 ? emblaRef : undefined}
                        role="region"
                        aria-roledescription="carousel"
                        aria-label="Ulasan member UB Sport Center"
                        tabIndex={reviews.length > 0 ? 0 : undefined}
                        onKeyDown={handleCarouselKeyDown}
                    >
                        {reviews.length > 0 ? (
                            <div className="booking-reviews__track">
                                {reviews.map((review, index) => (
                                    <div
                                        key={review.id}
                                        className="booking-reviews__slide"
                                    >
                                        <BookingReviewCard
                                            review={review}
                                            index={index}
                                            total={reviews.length}
                                            isActive={index === selectedIndex}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <article
                                className="booking-review-card booking-review-card--empty"
                                role="group"
                                aria-label="Belum ada ulasan"
                            >
                                <header className="booking-review-card__meta">
                                    <span>(Member / 00)</span>
                                    <span>— / 5.0</span>
                                </header>
                                <blockquote>
                                    <p>
                                        Suara pertama akan membuka indeks
                                        pengalaman member UB Sport Center.
                                    </p>
                                </blockquote>
                                <footer>
                                    <span>
                                        <strong>Belum terpublikasi</strong>
                                        <time>Menunggu member pertama</time>
                                    </span>
                                    <small>Indeks terbuka</small>
                                </footer>
                            </article>
                        )}
                    </div>
                </div>

                {user && existing_review && (
                    <UserReviewPanel
                        review={existing_review}
                        userName={user.name}
                        canEdit={Boolean(can_review)}
                        onEdit={openComposer}
                    />
                )}

                {user && can_review && (
                    <div
                        id="booking-review-composer"
                        ref={composerRef}
                        className={`booking-reviews__composer ${
                            composerOpen ? "is-open" : "is-closed"
                        }`}
                        aria-hidden={!composerOpen}
                    >
                        <div className="booking-reviews__composer-clip">
                            <ReviewForm
                                existingReview={existing_review ?? null}
                                onClose={closeComposer}
                            />
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
