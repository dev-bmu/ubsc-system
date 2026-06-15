import { useState } from "react";

const Arrow: React.FC<{ size?: number }> = ({ size = 56 }) => (
    <svg
        width={size}
        height={size}
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

export default function HeroContent() {
    const [hovered, setHovered] = useState(false);

    return (
        <div className="ubsc-hero-copy flex max-w-sm flex-col items-end gap-0 lg:mt-1 lg:max-w-xl lg:pt-14">
            <div className="ubsc-hero-star mt-6 flex h-20 w-20 items-center justify-center self-end lg:mt-0 lg:h-24 lg:w-20">
                <img
                    src="/assets/hero/star.png"
                    alt="Decorative mesh"
                    className="h-full w-full object-contain opacity-90"
                />
            </div>

            <div className="ubsc-hero-copy-stair">
                <div className="ubsc-hero-copy-stair-lines flex w-full flex-col gap-1">
                    <p className="ubsc-hero-copy-line ubsc-hero-copy-step ubsc-hero-copy-step--1 font-bdo text-[clamp(0.875rem,1.25vw,24px)] leading-relaxed text-white/70 xl:pl-[110px]">
                        <span className="ubsc-hero-copy-text">
                            Selamat Datang di UB Sport Center,
                        </span>
                    </p>

                    <p className="ubsc-hero-copy-line ubsc-hero-copy-step ubsc-hero-copy-step--2 font-bdo text-[clamp(0.875rem,1.25vw,24px)] leading-relaxed text-white/70 xl:pl-[60px]">
                        <span className="ubsc-hero-copy-text">
                            pusat fasilitas{" "}
                            <span className="font-medium text-white">
                                olahraga modern
                            </span>
                        </span>
                    </p>

                    <p className="ubsc-hero-copy-line ubsc-hero-copy-step ubsc-hero-copy-step--3 font-bdo text-[clamp(0.875rem,1.25vw,24px)] font-medium leading-relaxed text-white xl:pl-[20px]">
                        <span className="ubsc-hero-copy-text">
                            untuk gaya hidup aktif Anda.
                        </span>
                    </p>
                </div>

                <a
                    href="/coming-soon"
                    className="ubsc-hero-cta relative cursor-pointer select-none overflow-hidden border-b border-white/35 py-1 lg:w-full"
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
                            zIndex: 0,
                        }}
                    />

                    <span className="pointer-events-none relative z-10 mr-36 flex w-full items-center justify-between lg:mr-0">
                        <span className="font-bdo text-[clamp(0.875rem,1.25vw,24px)] font-medium leading-tight text-white">
                            Booking sekarang juga!
                        </span>

                        <span
                            className="flex flex-shrink-0 items-center justify-center"
                            style={{
                                width: "clamp(32px, 3vw, 48px)",
                                height: "clamp(32px, 3vw, 48px)",
                                transform: hovered
                                    ? "rotate(0deg)"
                                    : "rotate(-45deg)",
                                transition:
                                    "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                            }}
                        >
                            <Arrow size={32} />
                        </span>
                    </span>
                </a>
            </div>
        </div>
    );
}
