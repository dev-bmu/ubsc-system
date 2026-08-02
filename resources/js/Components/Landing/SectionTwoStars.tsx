import { useId } from "react";

const STAR_OFFSETS = [0, 26, 52, 78, 104] as const;
const STAR_PATH =
    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

interface SectionTwoStarsProps {
    rating?: number;
    className?: string;
    label?: string;
    baseColor?: string;
    accentColor?: string;
}

export default function SectionTwoStars({
    rating = 5,
    className,
    label,
    baseColor = "rgba(17, 17, 17, 0.14)",
    accentColor,
}: SectionTwoStarsProps) {
    const safeRating = Number.isFinite(rating)
        ? Math.max(0, Math.min(5, rating))
        : 0;
    const id = useId().replace(/:/g, "");
    const gradientId = `section-two-stars-gradient-${id}`;
    const clipId = `section-two-stars-clip-${id}`;

    return (
        <svg
            viewBox="0 0 128 24"
            width="128"
            height="24"
            className={className}
            role={label ? "img" : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            <defs>
                <linearGradient
                    id={gradientId}
                    x1="0"
                    x2="128"
                    y1="0"
                    y2="24"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop stopColor={accentColor ?? "#15678D"} />
                    <stop
                        offset="0.46"
                        stopColor={accentColor ?? "#0B4A72"}
                    />
                    <stop
                        offset="1"
                        stopColor={accentColor ?? "#002244"}
                    />
                </linearGradient>
                <clipPath id={clipId}>
                    <rect
                        width={(safeRating / 5) * 128}
                        height="24"
                        x="0"
                        y="0"
                    />
                </clipPath>
            </defs>

            <g
                className="section-two-stars__base"
                fill={baseColor}
                aria-hidden="true"
            >
                {STAR_OFFSETS.map((offset) => (
                    <path
                        key={offset}
                        transform={`translate(${offset} 0)`}
                        d={STAR_PATH}
                    />
                ))}
            </g>

            <g
                className="section-two-stars__fill"
                clipPath={`url(#${clipId})`}
                fill={`url(#${gradientId})`}
                aria-hidden="true"
            >
                {STAR_OFFSETS.map((offset) => (
                    <path
                        key={offset}
                        transform={`translate(${offset} 0)`}
                        d={STAR_PATH}
                    />
                ))}
            </g>
        </svg>
    );
}
