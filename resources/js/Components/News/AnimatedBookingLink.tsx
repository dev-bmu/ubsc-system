import { type CSSProperties, useState } from "react";

const ArrowIcon: React.FC<{ size?: number }> = ({ size = 32 }) => (
    <svg
        width={size}
        height={size}
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

interface AnimatedBookingLinkProps {
    href?: string;
    label?: string;
    width?: CSSProperties["width"];
    className?: string;
    labelClassName?: string;
    arrowSize?: number;
}

export default function AnimatedBookingLink({
    href = "/coming-soon",
    label = "Booking sekarang juga!",
    width,
    className = "",
    labelClassName = "",
    arrowSize = 28,
}: AnimatedBookingLinkProps) {
    const [hovered, setHovered] = useState(false);

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
                <span className={`font-bdo font-medium text-lg xl:text-2xl leading-tight tracking-tight text-white ${labelClassName}`}>
                    {label}
                </span>
                <span
                    className="flex flex-shrink-0 items-center justify-center"
                    style={{
                        width: "clamp(28px, 2.5vw, 40px)",
                        height: "clamp(28px, 2.5vw, 40px)",
                        transform: hovered ? "rotate(0deg)" : "rotate(-45deg)",
                        transition:
                            "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                    }}
                >
                    <ArrowIcon size={arrowSize} />
                </span>
            </span>
        </a>
    );
}
