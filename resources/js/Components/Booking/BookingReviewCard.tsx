export interface Review {
    id: string;
    rating: number;
    text: string;
    authorName: string;
    authorDate: string;
    avatar: string;
}

function StarDisplay({ rating }: { rating: number }) {
    return (
        <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => {
                const isFull = i + 1 <= rating;
                const isHalf = !isFull && i + 0.5 <= rating;
                return (
                    <div key={i} className="relative w-4 h-4 flex-shrink-0">
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="absolute inset-0 fill-current text-gray-300">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        {(isFull || isHalf) && (
                            <div
                                className="absolute inset-0 overflow-hidden"
                                style={{ width: isFull ? "100%" : "50%" }}
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="fill-current text-[#005B96]">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function BookingReviewCard({ review }: { review: Review }) {
    return (
        <div className="flex flex-col gap-4 w-[300px] xl:w-[380px] flex-shrink-0 rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2">
                <StarDisplay rating={review.rating} />
                <span className="font-bdo text-sm text-gray-500">
                    {review.rating} / 5
                </span>
            </div>

            <p className="font-bdo font-light text-sm leading-relaxed text-gray-800">
                {review.text}
            </p>

            <div className="flex items-center gap-4 mt-2">
                <img
                    src={review.avatar}
                    alt={review.authorName}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
                <div className="flex flex-col">
                    <span className="font-bdo font-medium text-sm text-black">
                        {review.authorName}
                    </span>
                    <span className="font-bdo font-light text-xs text-gray-500">
                        {review.authorDate}
                    </span>
                </div>
            </div>
        </div>
    );
}
