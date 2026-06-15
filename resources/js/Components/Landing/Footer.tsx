import { useState } from "react";
import ig from "../../../assets/icons/ig.svg";
import x from "../../../assets/icons/x.svg";
import tiktok from "../../../assets/icons/tiktok.svg";
import facebook from "../../../assets/icons/fb.svg";
import UpRight from "@/../assets/icons/UpRight.svg";

const NAV_LINKS = [
    { label: "Home", number: "01", href: "/" },
    { label: "About", number: "02", href: "/about" },
    { label: "News", number: "03", href: "/news" },
    { label: "Facilities", number: "04", href: "/facilities" },
    { label: "Pricing", number: "05", href: "/pricing" },
    { label: "Booking", number: "06", href: "/booking" },
];

const SOCIAL_LINKS = [
    {
        label: "Instagram",
        href: "https://www.instagram.com/ubsportcenter/",
        icon: ig,
    },
    { label: "Twitter/X", href: "https://x.com/ubsportcenter", icon: x },
    {
        label: "Tiktok",
        href: "https://www.tiktok.com/@ubsportcenter",
        icon: tiktok,
    },
    {
        label: "Facebook",
        href: "https://www.facebook.com/sportcenterub/",
        icon: facebook,
    },
];

export default function Footer() {
    const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
    const [ctaHovered, setCtaHovered] = useState(false);
    const [rotated, setRotated] = useState(false);

    return (
        <footer
            className="relative w-full overflow-hidden pt-28 text-white"
            style={{
                background: "#252525",
            }}
        >
            <div className="mx-auto w-full px-6 sm:px-10 xl:px-16">
                <div className="mb-16 grid grid-cols-1 gap-12 xl:grid-cols-12 xl:gap-8">
                    <div className="xl:col-span-7">
                        <h2 className="font-semibold mb-12 text-[clamp(1.5rem,2.7vw,52px)] leading-tight tracking-[-0.021em]">
                            Ingin Menjalin Kemitraan?{" "}
                            <br className="hidden xl:block" />
                            Mari Terhubung dengan Kami
                            <span className="inline-block h-3 w-3 translate-y-[-0.15em] rounded-sm bg-blue-500 ml-2 align-bottom" />
                        </h2>

                        <a
                            href="https://api.whatsapp.com/send/?phone=6285280809080&text=Halo+UB+Sport+Center+%F0%9F%A4%9D%0A%0APerkenalkan%2C+saya+ingin+mengajukan+kerja+sama%2Fkemitraan+dengan+UB+Sport+Center.+Saya+tertarik+untuk+mendiskusikan+kemungkinan+kolaborasi+yang+dapat+memberikanx+manfaat+bagi+kedua+belah+pihak.%0A%0AApakah+saya+bisa+mendapatkan+informasi+mengenai+prosedur+atau+pihak+yang+dapat+dihubungi+untuk+membahas+peluang+kemitraan+tersebut%3F%0A%0ATerima+kasih+atas+perhatian+dan+waktunya.+Saya+menantikan+kesempatan+untuk+berdiskusi+lebih+lanjut+%F0%9F%98%8A&type=phone_number&app_absent=0"
                            className="relative block w-full max-w-xs cursor-pointer select-none overflow-hidden border-b border-white/35 py-1"
                            onMouseEnter={() => setCtaHovered(true)}
                            onMouseLeave={() => setCtaHovered(false)}
                        >
                            <span
                                aria-hidden
                                className="pointer-events-none absolute bg-accent-red"
                                style={{
                                    top: "-50%",
                                    left: "-5%",
                                    right: "-5%",
                                    bottom: "-50%",
                                    transform: ctaHovered
                                        ? "skewY(-5deg) translateY(0%)"
                                        : "skewY(-5deg) translateY(130%)",
                                    transition:
                                        "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                                    zIndex: 0,
                                }}
                            />
                            <span className="pointer-events-none relative z-10 flex w-full items-center justify-between">
                                <span className="font-bdo text-[clamp(1rem,1.04vw,20px)] font-medium leading-tight tracking-tight text-white">
                                    Hubungi kami
                                </span>
                                <span
                                    className="flex flex-shrink-0 items-center justify-center"
                                    style={{
                                        transform: ctaHovered
                                            ? "rotate(0deg)"
                                            : "rotate(-50deg)",
                                        transition:
                                            "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                                    }}
                                >
                                    <FooterArrow />
                                </span>
                            </span>
                        </a>
                    </div>

                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:col-span-5">
                        <div>
                            <h3 className="font-bdo mb-4 text-[clamp(0.875rem,0.94vw,18px)] font-semibold">
                                <span className="xl:hidden">Lokasi</span>
                                <span className="hidden xl:inline">Alamat</span>
                            </h3>
                            <p className="font-bdo max-w-[220px] text-sm leading-relaxed text-white font-regular">
                                Jl. Terusan Cibogo No.1, <br />
                                Penanggungan, Kec. Klojen, <br />
                                Kota Malang, Jawa Timur 65113
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bdo mb-4 text-[clamp(0.875rem,0.94vw,18px)] font-semibold">
                                Kontak
                            </h3>
                            <div className="flex flex-col gap-1 text-white">
                                <a
                                    href="tel:03415799155"
                                    className="font-bdo text-sm transition hover:underline hover:underline-offset-4"
                                >
                                    (0341) 579955
                                </a>
                                <a
                                    href="https://api.whatsapp.com/send/?phone=6285280809080&"
                                    className="font-bdo text-sm transition hover:underline hover:underline-offset-4"
                                >
                                    0852 8080 9080
                                </a>
                                <a
                                    href="mailto:contact@ubsportcenter.co.id"
                                    className="font-bdo text-sm transition hover:underline hover:underline-offset-4"
                                >
                                    contact@ubsportcenter.co.id
                                </a>
                            </div>
                        </div>

                        <div className="sm:col-span-2">
                            <h3 className="font-bdo mb-4 text-[clamp(0.875rem,0.94vw,18px)] font-semibold">
                                Sosial Media
                            </h3>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4 xl:flex xl:flex-nowrap xl:items-center xl:gap-14">
                                {SOCIAL_LINKS.map((s) => (
                                    <a
                                        key={s.label}
                                        href={s.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onMouseEnter={() => setRotated(true)}
                                        onMouseLeave={() => setRotated(false)}
                                        className="font-bdo font-regular flex items-center gap-2 text-sm text-white transition hover:text-gray-300"
                                    >
                                        <img
                                            src={s.icon}
                                            alt={s.label}
                                            className={`
                                                        w-3.5 xs:w-4
                                                        transition-transform duration-500 ease-in-out
                                                        ${rotated ? "rotate-[55deg]" : "rotate-[5deg]"}
                                                        group-hover:[filter:grayscale(1)_brightness(0)]
                                                        `}
                                            onError={(e) => {
                                                // hide broken icon gracefully
                                                (
                                                    e.currentTarget as HTMLImageElement
                                                ).style.display = "none";
                                            }}
                                        />
                                        {s.label}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <nav aria-label="Footer navigation" className="mb-12">
                    {/* Desktop */}
                    <div className="hidden items-center justify-between xl:flex">
                        {NAV_LINKS.map((link) => (
                            <a
                                key={link.label}
                                href={link.href}
                                className="font-clash text-[clamp(0.875rem,0.83vw,16px)] font-medium text-white transition hover:text-gray-300"
                            >
                                {link.label}
                                <sup className="ml-0.5 text-[10px] text-gray-500">
                                    {link.number}
                                </sup>
                            </a>
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-x-2 gap-y-6 xl:hidden">
                        {NAV_LINKS.map((link) => (
                            <a
                                key={link.label}
                                href={link.href}
                                className="font-clash text-sm font-medium text-white transition hover:text-gray-300"
                            >
                                {link.label}
                                <sup className="ml-0.5 text-[10px] text-gray-500">
                                    {link.number}
                                </sup>
                            </a>
                        ))}
                    </div>
                </nav>

                <hr className="mb-8 border-white/45" />

                <div className="xl:mb-12 hidden items-center justify-between xl:flex">
                    <span className="text-sm lg:text-base font-light text-white">
                        01/{" "}
                        <span className="font-medium text-white">homepage</span>
                    </span>

                    <p className="font-bdo font-light text-center text-sm lg:text-base text-white">
                        <span className="mr-1 text-red-500">©</span>
                        2026 PT. Brawijaya Multi Usaha All rights reserved.
                    </p>

                    <ScrollUpButton onClick={scrollToTop} />
                </div>

                <div className="mb-3 lg:mb-12 flex flex-col gap-1 xl:hidden">
                    <p className="font-bdo text-sm text-gray-400">
                        <span className="mr-1 text-red-500">©</span>
                        2026 PT. Brawijaya Multi Usaha.
                    </p>
                    <div className="flex items-center justify-between">
                        <span className="font-clash text-sm text-gray-400">
                            01/{" "}
                            <span className="font-medium text-white">
                                homepage
                            </span>
                        </span>
                        <ScrollUpButton onClick={scrollToTop} />
                    </div>
                </div>
            </div>

            <div className="mt-auto w-full relative">
                <div className="w-full relative px-6 pb-3 xl:px-16 xl:pb-12 overflow-hidden ">
                    {/* Video Layer */}
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="none"
                        className="w-full h-full select-none object-cover object-center"
                    >
                        <source
                            src="/assets/reels/Footer.mp4"
                            type="video/mp4"
                        />
                    </video>
                </div>
            </div>
        </footer>
    );
}

function FooterArrow() {
    return (
        <svg width={28} height={28} viewBox="0 0 64 64" fill="none">
            <path
                d="M12 32H52M52 32L34 14M52 32L34 50"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ScrollUpButton({ onClick }: { onClick: () => void }) {
    return (
        <div className="group flex items-center">
            <button
                type="button"
                onClick={onClick}
                aria-label="Scroll to top"
                className="flex items-center justify-center rounded-full border border-white/40 px-5 py-1.5 sm:px-8 sm:py-2.5 text-white transition-all duration-300 group-hover:bg-white group-hover:text-black"
            >
                <span className="font-bdo text-[0.75rem] sm:text-base font-light tracking-wide whitespace-nowrap">
                    Scroll up
                </span>
            </button>

            <span className="-ml-[1px] flex h-8 w-8 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-white/40 transition-all duration-300 group-hover:bg-white">
                <img
                    src={UpRight}
                    alt="Scroll Up"
                    className="w-2 xs:w-4 transition-transform duration-500 ease-in-out rotate-[5deg] group-hover:rotate-[-55deg] group-hover:[filter:grayscale(1)_brightness(0)]"
                />
            </span>
        </div>
    );
}