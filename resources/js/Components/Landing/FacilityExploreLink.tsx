import { useState } from "react";

interface FacilityExploreLinkProps {
    className?: string;
    href?: string;
    label?: string;
}

function FacilityExploreArrow({ size = 30 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 72 72"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M24 36H53"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M42 22L56 36L42 50"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default function FacilityExploreLink({
    className = "",
    href = "/facilities",
    label = "Lihat Fasilitas Lainnya",
}: FacilityExploreLinkProps) {
    const [hovered, setHovered] = useState(false);

    return (
        <a
            href={href}
            className={`relative block w-full max-w-[410px] cursor-pointer select-none overflow-hidden border-b border-white/70 pb-3 pt-1 ${className}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute bg-accent-red"
                style={{
                    inset: "-50% -5%",
                    transform: hovered
                        ? "skewY(-4deg) translateY(0%)"
                        : "skewY(-4deg) translateY(135%)",
                    transition:
                        "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                }}
            />
            <span className="pointer-events-none relative z-10 flex w-full items-center justify-between gap-5">
                <span className="font-bdo text-[clamp(1rem,1.25vw,1.5rem)] font-medium leading-tight tracking-[-0.035em] text-white">
                    {label}
                </span>
                <span
                    className="flex shrink-0 items-center justify-center text-white"
                    style={{
                        transform: hovered ? "rotate(0deg)" : "rotate(-45deg)",
                        transition:
                            "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                    }}
                >
                    <FacilityExploreArrow />
                </span>
            </span>
        </a>
    );
}
