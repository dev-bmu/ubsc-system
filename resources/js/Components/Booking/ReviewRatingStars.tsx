import SectionTwoStars from "@/Components/Landing/SectionTwoStars";

interface ReviewRatingStarsProps {
    rating: number;
    className?: string;
    label?: string;
}

export default function ReviewRatingStars({
    rating,
    className = "",
    label,
}: ReviewRatingStarsProps) {
    const safeRating = Number.isFinite(rating)
        ? Math.max(0, Math.min(5, rating))
        : 0;

    return (
        <SectionTwoStars
            rating={safeRating}
            className={`booking-review-stars ${className}`.trim()}
            label={label ?? `${safeRating.toFixed(1)} dari 5`}
            accentColor="#ff4b2b"
        />
    );
}
