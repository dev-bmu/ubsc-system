import { useState } from "react";

interface SectionActionLinkProps {
    href?: string;
    label: string;
    theme?: "dark" | "light";
}

export default function SectionActionLink({
    href = "/coming-soon",
    label,
    theme = "dark",
}: SectionActionLinkProps) {
    const [hovered, setHovered] = useState(false);
    const foreground = theme === "dark" ? "text-white" : "text-black";
    const border = theme === "dark" ? "border-white/35" : "border-black/35";

    return (
        <a
            href={href}
            className={`group relative block cursor-pointer select-none overflow-hidden border-b py-1 ${border}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
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
                    transition:
                        "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                }}
            />

            <span className="pointer-events-none relative z-10 flex w-full items-center justify-between gap-4">
                <span
                    className={`font-bdo text-[13px] font-medium leading-tight sm:text-[15px] xl:text-[clamp(1.25rem,1.55vw,1.875rem)] ${foreground} group-hover:text-white`}
                >
                    {label}
                </span>
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 72 72"
                    fill="none"
                    aria-hidden="true"
                    className={`shrink-0 xl:h-[30px] xl:w-[30px] ${foreground} group-hover:text-white`}
                >
                    <path
                        d="M24 36H53"
                        stroke="currentColor"
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M42 22L56 36L42 50"
                        stroke="currentColor"
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M29 32.8C32.6 34.9 36 35.8 40 36"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.48"
                    />
                </svg>
            </span>
        </a>
    );
}
