import ReviewAvatar from "./ReviewAvatar";
import ReviewRatingStars from "./ReviewRatingStars";

export interface Review {
    id: string;
    rating: number;
    text: string;
    authorName: string;
    authorDate: string;
    avatar?: string | null;
    avatarFallback?: string | null;
    hasProfileAvatar?: boolean;
    isVerifiedUser?: boolean;
}

interface BookingReviewCardProps {
    review: Review;
    index: number;
    total: number;
    isActive: boolean;
}

function formatIndex(value: number): string {
    return String(value).padStart(2, "0");
}

function getQuoteScale(text: string): string {
    if (text.length > 300) return "booking-review-card--compact";
    if (text.length > 170) return "booking-review-card--medium";
    return "";
}

export default function BookingReviewCard({
    review,
    index,
    total,
    isActive,
}: BookingReviewCardProps) {
    const canOverflow = review.text.length > 170;

    return (
        <article
            id={`booking-review-panel-${review.id}`}
            className={`booking-review-card ${
                isActive ? "is-active" : ""
            } ${getQuoteScale(review.text)}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`Ulasan ${index + 1} dari ${total}`}
            aria-current={isActive ? "true" : undefined}
        >
            <header className="booking-review-card__meta">
                <span>(Member / {formatIndex(index + 1)})</span>
                <span>{review.rating.toFixed(1)} / 5.0</span>
            </header>

            <blockquote
                tabIndex={canOverflow ? (isActive ? 0 : -1) : undefined}
                aria-describedby={
                    canOverflow
                        ? `booking-review-scroll-hint-${review.id}`
                        : undefined
                }
            >
                <p>{review.text}</p>
            </blockquote>
            {canOverflow && (
                <span
                    id={`booking-review-scroll-hint-${review.id}`}
                    className="booking-reviews__sr-only"
                >
                    Gulir di dalam teks ulasan untuk membaca seluruh isinya.
                </span>
            )}

            <footer>
                <div className="booking-review-card__identity">
                    <ReviewAvatar
                        authorName={review.authorName}
                        avatar={review.avatar}
                        avatarFallback={review.avatarFallback}
                    />
                    <span>
                        <strong>{review.authorName}</strong>
                        <time>{review.authorDate}</time>
                    </span>
                </div>
                <div className="booking-review-card__verification">
                    <ReviewRatingStars
                        rating={review.rating}
                        className="booking-review-stars--card"
                    />
                    <small>Pengguna terverifikasi</small>
                </div>
            </footer>
        </article>
    );
}
