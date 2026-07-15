import { type CSSProperties, useState } from "react";

const ArrowIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
    <svg
        className={className}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12 32H52M52 32L34 14M52 32L34 50"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const HeroArrowIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
    <svg
        className={className}
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M24 36H53"
            stroke="white"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M42 22L56 36L42 50"
            stroke="white"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M29 32.8C32.6 34.9 36 35.8 40 36"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.48"
        />
    </svg>
);

interface AnimatedBookingLinkProps {
    href?: string;
    label?: string;
    width?: CSSProperties["width"];
    className?: string;
    textClassName?: string;
    arrowVariant?: "default" | "hero";
}

export default function AnimatedBookingLink({
    href = "#news-content",
    label = "Lihat selengkapnya",
    width,
    className = "",
    textClassName = "text-md xl:text-2xl",
    arrowVariant = "default",
}: AnimatedBookingLinkProps) {
    const [hovered, setHovered] = useState(false);
    const usesHeroArrow = arrowVariant === "hero";

    return (
        <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`relative block w-full cursor-pointer select-none overflow-hidden border-b border-white/35 py-1 ${className}`}
            style={{ width }}
            aria-label={label}
        >
            <span
                aria-hidden
                className="pointer-events-none absolute bg-accent-red"
                style={{
                    top: "-50%",
                    left: "-5%",
                    right: "-5%",
                    bottom: "-50%",
                    transform: hovered
                        ? "skewY(-5deg) translateY(0%)"
                        : "skewY(-5deg) translateY(130%)",
                    transition: "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                    zIndex: 0,
                }}
            />

            <span className="pointer-events-none relative z-10 flex w-full items-center justify-between">
                <span
                    className={`font-bdo font-medium leading-tight tracking-tight text-white ${textClassName}`}
                >
                    {label}
                </span>
                <span
                    className="flex flex-shrink-0 items-center justify-center"
                    style={{
                        width: usesHeroArrow
                            ? "clamp(32px, 3vw, 48px)"
                            : "clamp(22px, 2.5vw, 40px)",
                        height: usesHeroArrow
                            ? "clamp(32px, 3vw, 48px)"
                            : "clamp(22px, 2.5vw, 40px)",
                        transform: hovered ? "rotate(0deg)" : "rotate(-45deg)",
                        transition:
                            "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                    }}
                >
                    {usesHeroArrow ? (
                        <HeroArrowIcon className="h-8 w-8" />
                    ) : (
                        <ArrowIcon className="h-[18px] w-[18px] xl:h-7 xl:w-7" />
                    )}
                </span>
            </span>
        </a>
    );
}
