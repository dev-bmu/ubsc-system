import { useEffect, useId, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { usePage } from "@inertiajs/react";
import ig from "../../../assets/icons/ig.svg";
import tiktok from "../../../assets/icons/tiktok.svg";

const NAV_LINKS = [
    { label: "Home", number: "01", href: "/", pageLabel: "homepage" },
    {
        label: "About",
        number: "02",
        href: "/about",
        pageLabel: "aboutpage",
        matchPaths: ["/about", "/branches"],
    },
    { label: "News", number: "03", href: "/news", pageLabel: "newspage" },
    {
        label: "Facilities",
        number: "04",
        href: "/facilities",
        pageLabel: "facilitypage",
        matchPaths: ["/facilities"],
    },
    {
        label: "Pricing",
        number: "05",
        href: "/pricing",
        pageLabel: "pricingpage",
    },
    {
        label: "Booking",
        number: "06",
        href: "/booking",
        pageLabel: "bookingpage",
    },
];

const SOCIAL_LINKS = [
    {
        label: "Instagram",
        href: "https://www.instagram.com/ubsportcenter/",
        icon: ig,
    },
    {
        label: "Threads",
        href: "https://www.threads.com/@ubsportcenter",
        icon: "threads",
    },
    {
        label: "Tiktok",
        href: "https://www.tiktok.com/@ubsportcenter",
        icon: tiktok,
    },
    {
        label: "Twitter/X",
        href: "https://x.com/ubsportcenter",
        icon: "x",
    },
];

const ADDRESS_MAP_URL =
    "https://www.google.com/maps/place/UB+Sport+Center/@-7.9561269,112.6189626,18z/data=!4m12!1m5!3m4!2zN8KwNTcnMTguMyJTIDExMsKwMzcnMDYuNCJF!8m2!3d-7.9550876!4d112.6184389!3m5!1s0x2e7882788af472d9:0x12f8cee690772ec5!8m2!3d-7.955132!4d112.618489!16s%2Fg%2F11ckv5zn2f?entry=ttu&g_ep=EgoyMDI2MDYyOS4wIKXMDSoASAFQAw%3D%3D";

const FOOTER_TAP_PREVIEW_MS = 535;

function normalizePath(path: string) {
    const cleanPath = path.split(/[?#]/)[0] || "/";
    return cleanPath === "/" ? "/" : cleanPath.replace(/\/+$/, "");
}

function linkMatchesPath(
    link: (typeof NAV_LINKS)[number],
    currentPath: string,
) {
    const paths = link.matchPaths ?? [link.href];

    return paths.some((path) => {
        if (path === "/") return currentPath === "/";
        return currentPath === path || currentPath.startsWith(`${path}/`);
    });
}

function isFooterTapPreviewDevice() {
    return (
        typeof window !== "undefined" &&
        (window.innerWidth < 1280 ||
            window.matchMedia("(hover: none), (pointer: coarse)").matches)
    );
}

function isPlainPrimaryClick(event: ReactMouseEvent<HTMLElement>) {
    return (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
    );
}

function runFooterTapPreview<T extends HTMLElement>(
    event: ReactMouseEvent<T>,
    action: () => void,
    options: {
        onStart?: () => void;
        onEnd?: () => void;
    } = {},
) {
    if (!isPlainPrimaryClick(event) || !isFooterTapPreviewDevice()) {
        return false;
    }

    event.preventDefault();

    const element = event.currentTarget;
    if (element.dataset.footerTapPending === "true") {
        return true;
    }

    element.dataset.footerTapPending = "true";
    element.classList.add("is-touch-active");
    options.onStart?.();

    window.setTimeout(() => {
        element.classList.remove("is-touch-active");
        delete element.dataset.footerTapPending;
        options.onEnd?.();
        action();
    }, FOOTER_TAP_PREVIEW_MS);

    return true;
}

function handleFooterAnchorTap(
    event: ReactMouseEvent<HTMLAnchorElement>,
    options?: {
        onStart?: () => void;
        onEnd?: () => void;
    },
) {
    const href = event.currentTarget.href;

    return runFooterTapPreview(
        event,
        () => {
            window.location.assign(href);
        },
        options,
    );
}

export default function Footer({
    className = "",
    deferLoopAnimations = false,
}: {
    className?: string;
    deferLoopAnimations?: boolean;
}) {
    const { url } = usePage();
    const currentPath = normalizePath(url);
    const activeLink =
        NAV_LINKS.find((link) => linkMatchesPath(link, currentPath)) ??
        NAV_LINKS[0];
    const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
    const [ctaHovered, setCtaHovered] = useState(false);
    const [footerVideoActive, setFooterVideoActive] = useState(false);
    const [footerVideoReady, setFooterVideoReady] = useState(false);
    const footerVideoStageRef = useRef<HTMLDivElement>(null);
    const footerVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const stage = footerVideoStageRef.current;
        if (!stage || footerVideoActive) return;

        if (!("IntersectionObserver" in window)) {
            setFooterVideoActive(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setFooterVideoActive(true);
                observer.disconnect();
            },
            {
                // Percentage root margins are resolved from viewport width.
                // Use viewport height so a tall phone gets the same lead time
                // as desktop during a fast scroll or restored scroll position.
                rootMargin: `${Math.round(
                    Math.max(
                        document.documentElement.clientHeight,
                        window.innerHeight || 0,
                    ) * 1.15,
                )}px 0px`,
                threshold: 0,
            },
        );
        observer.observe(stage);
        return () => observer.disconnect();
    }, [footerVideoActive]);

    useEffect(() => {
        const video = footerVideoRef.current;
        if (!video || !footerVideoActive) return;

        const markReady = () => {
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                setFooterVideoReady(true);
            }
        };
        const markWaitingForFrame = () => {
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                setFooterVideoReady(false);
            }
        };

        markReady();
        video.preload = "auto";
        if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
            video.load();
        }
        video.play().catch(() => {
            // The decoded first frame remains visible if autoplay is deferred.
        });
        video.addEventListener("loadstart", markWaitingForFrame);
        video.addEventListener("emptied", markWaitingForFrame);
        video.addEventListener("loadeddata", markReady);
        video.addEventListener("canplay", markReady);

        return () => {
            video.removeEventListener("loadstart", markWaitingForFrame);
            video.removeEventListener("emptied", markWaitingForFrame);
            video.removeEventListener("loadeddata", markReady);
            video.removeEventListener("canplay", markReady);
        };
    }, [footerVideoActive]);

    return (
        <footer
            data-pricing-loop-region={
                deferLoopAnimations ? "true" : undefined
            }
            className={`site-footer relative w-full overflow-hidden pt-10 md:pt-12 lg:pt-16 text-white ${className}`}
            style={{
                background: "#252525",
            }}
        >
            <div className="site-footer__shell mx-auto w-full">
                <div className="mb-16 grid grid-cols-1 gap-12 xl:grid-cols-12 xl:gap-8">
                    <div className="xl:col-span-7">
                        <h2 className="font-semibold mb-12 text-[clamp(1.35rem,2.43vw,46.8px)] leading-[1.12] tracking-[-0.021em]">
                            <span className="block">
                                Ingin Menjalin Kemitraan?
                            </span>
                            <span className="mt-2 block">
                                Mari Terhubung dengan Kami
                                <span className="site-footer__heading-accent inline-block h-3 w-3 translate-y-[-0.15em] rounded-sm bg-blue-500 ml-2 align-bottom" />
                            </span>
                        </h2>

                        <a
                            href="https://api.whatsapp.com/send/?phone=6285280809080&text=Halo+UB+Sport+Center+%F0%9F%A4%9D%0A%0APerkenalkan%2C+saya+ingin+mengajukan+kerja+sama%2Fkemitraan+dengan+UB+Sport+Center.+Saya+tertarik+untuk+mendiskusikan+kemungkinan+kolaborasi+yang+dapat+memberikanx+manfaat+bagi+kedua+belah+pihak.%0A%0AApakah+saya+bisa+mendapatkan+informasi+mengenai+prosedur+atau+pihak+yang+dapat+dihubungi+untuk+membahas+peluang+kemitraan+tersebut%3F%0A%0ATerima+kasih+atas+perhatian+dan+waktunya.+Saya+menantikan+kesempatan+untuk+berdiskusi+lebih+lanjut+%F0%9F%98%8A&type=phone_number&app_absent=0"
                            className="relative block w-full max-w-xs cursor-pointer select-none overflow-hidden border-b border-white/35 py-1"
                            onClick={(event) =>
                                handleFooterAnchorTap(event, {
                                    onStart: () => setCtaHovered(true),
                                    onEnd: () => setCtaHovered(false),
                                })
                            }
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

                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:col-span-5 xl:w-max xl:justify-self-end">
                        <div>
                            <h3 className="font-bdo mb-4 text-[clamp(0.875rem,0.94vw,18px)] font-semibold">
                                <span className="xl:hidden">Lokasi</span>
                                <span className="hidden xl:inline">Alamat</span>
                            </h3>
                            <a
                                href={ADDRESS_MAP_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="footer-text-link font-bdo block max-w-[220px] text-sm font-light leading-relaxed"
                                onClick={handleFooterAnchorTap}
                            >
                                Jl. Terusan Cibogo No.1, <br />
                                Penanggungan, Kec. Klojen, <br />
                                Kota Malang, Jawa Timur 65113
                            </a>
                        </div>

                        <div>
                            <h3 className="font-bdo mb-4 text-[clamp(0.875rem,0.94vw,18px)] font-semibold">
                                Kontak
                            </h3>
                            <div className="flex flex-col gap-1 text-white/82">
                                <a
                                    href="tel:03415799155"
                                    className="footer-text-link font-bdo w-max text-sm font-light"
                                    onClick={handleFooterAnchorTap}
                                >
                                    (0341) 5799155
                                </a>
                                <a
                                    href="https://api.whatsapp.com/send/?phone=6285280809080&"
                                    className="footer-text-link font-bdo w-max text-sm font-light"
                                    onClick={handleFooterAnchorTap}
                                >
                                    0852 8080 9080
                                </a>
                                <a
                                    href="mailto:contact@ubsportcenter.co.id"
                                    className="footer-text-link font-bdo w-max text-sm font-light"
                                    onClick={handleFooterAnchorTap}
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
                                        className="footer-social-link font-bdo text-sm font-light"
                                        onClick={handleFooterAnchorTap}
                                    >
                                        <span
                                            className="footer-social-icon"
                                            data-icon={s.icon}
                                        >
                                            {s.icon === "threads" ? (
                                                <ThreadsIcon className="h-full w-full" />
                                            ) : s.icon === "x" ? (
                                                <XFormerlyTwitterIcon className="h-full w-full" />
                                            ) : (
                                                <img
                                                    src={s.icon}
                                                    alt={s.label}
                                                    className="h-full w-full object-contain"
                                                    onError={(e) => {
                                                        (
                                                            e.currentTarget as HTMLImageElement
                                                        ).style.display = "none";
                                                    }}
                                                />
                                            )}
                                        </span>
                                        <span
                                            className="footer-social-label"
                                            data-label={s.label}
                                        >
                                            <span className="footer-social-label-text">
                                                {s.label}
                                            </span>
                                        </span>
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
                            <FooterNavLink
                                key={link.label}
                                link={link}
                                isActive={link === activeLink}
                                className="text-[clamp(0.875rem,0.83vw,16px)]"
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-x-2 gap-y-6 xl:hidden">
                        {NAV_LINKS.map((link) => (
                            <FooterNavLink
                                key={link.label}
                                link={link}
                                isActive={link === activeLink}
                                className="text-sm"
                            />
                        ))}
                    </div>
                </nav>

                <div
                    className="footer-divider-line hidden xl:block"
                    aria-hidden="true"
                />

                <div className="footer-bottom-bar hidden min-h-[100px] grid-cols-[minmax(152px,0.72fr)_minmax(360px,1fr)_minmax(220px,0.72fr)] items-center gap-6 py-6 xl:grid">
                    <div className="flex items-center gap-2">
                        <span className="font-bdo text-[16px] font-light leading-none text-white">
                            {activeLink.number}/
                        </span>
                        <span className="font-bdo text-[16px] font-medium leading-none text-white">
                            {activeLink.pageLabel}
                        </span>
                    </div>

                    <p className="font-bdo text-center text-sm font-light text-white lg:text-base">
                        <span className="footer-copyright-mark mr-1">
                            &copy;
                        </span>
                        2026 PT. Brawijaya Multi Usaha All rights reserved.
                    </p>

                    <div className="flex justify-end">
                        <ScrollUpButton onClick={scrollToTop} />
                    </div>
                </div>

                <div className="footer-mobile-prototype-strip xl:hidden">
                    <div
                        className="footer-divider-line footer-mobile-divider"
                        aria-hidden="true"
                    />

                    <div className="footer-mobile-bottom">
                        <div className="footer-mobile-copygroup">
                            <p className="footer-mobile-copyright">
                                <span className="footer-copyright-mark">
                                    &copy;
                                </span>
                                <span className="footer-mobile-copyright-text">
                                    2026 PT. Brawijaya Multi Usaha.
                                </span>
                            </p>
                            <div className="footer-mobile-page">
                                <span>{activeLink.number}/</span>
                                <span className="footer-mobile-page-name">
                                    {activeLink.pageLabel}
                                </span>
                            </div>
                        </div>
                        <div className="footer-mobile-scroll">
                            <ScrollUpButton onClick={scrollToTop} />
                        </div>
                    </div>
                </div>

                <div
                    ref={footerVideoStageRef}
                    className="footer-video-stage mt-auto w-full relative"
                >
                    <div className="w-full relative overflow-hidden pb-3 xl:pb-12">
                        {/* Video Layer */}
                        <video
                            ref={footerVideoRef}
                            autoPlay={footerVideoActive}
                            loop
                            muted
                            playsInline
                            preload={footerVideoActive ? "auto" : "none"}
                            onLoadedData={() => setFooterVideoReady(true)}
                            onCanPlay={() => setFooterVideoReady(true)}
                            className={`footer-video-media h-full w-full select-none object-cover object-center transition-opacity duration-500 ease-out ${
                                footerVideoReady ? "opacity-100" : "opacity-0"
                            }`}
                        >
                            <source
                                src="/assets/reels/Footer.mp4"
                                type="video/mp4"
                            />
                        </video>
                    </div>
                </div>
            </div>
        </footer>
    );
}

function FooterNavLink({
    link,
    isActive,
    className = "",
}: {
    link: (typeof NAV_LINKS)[number];
    isActive: boolean;
    className?: string;
}) {
    return (
        <a
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={`footer-kinetic-nav-link ${
                isActive ? "is-active" : ""
            } font-clash font-medium ${className}`}
            onClick={handleFooterAnchorTap}
        >
            <span className="footer-knav-label">
                <span className="footer-knav-primary">{link.label}</span>
                <span className="footer-knav-clone" aria-hidden="true">
                    {link.label}
                </span>
            </span>
            <sup className="footer-knav-number">
                <span className="footer-knav-num-primary">{link.number}</span>
                <span className="footer-knav-num-clone" aria-hidden="true">
                    {link.number}
                </span>
            </sup>
        </a>
    );
}

function XFormerlyTwitterIcon({ className = "" }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1200 1227"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <path
                fill="currentColor"
                d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"
            />
        </svg>
    );
}

function ThreadsIcon({ className = "" }: { className?: string }) {
    const maskId = `threads-mask-${useId().replace(/:/g, "")}`;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 192 192"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <defs>
                <mask id={maskId} maskUnits="userSpaceOnUse">
                    <rect width="192" height="192" rx="42" fill="white" />
                    <path
                        fill="black"
                        transform="translate(28.8 28.8) scale(0.7)"
                        d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.194 47.292 9.642 32.788 28.08 19.882 44.485 13.224 67.315 13.001 95.932L13 96v.067c.224 28.617 6.882 51.447 19.788 67.854C47.292 182.358 68.882 191.806 96.957 192h.113c24.96-.173 42.554-6.708 57.048-21.189 18.963-18.945 18.392-42.692 12.142-57.27-4.484-10.454-13.033-18.945-24.723-24.553ZM98.44 129.507c-10.44.588-21.286-4.098-21.82-14.135-.397-7.442 5.296-15.746 22.461-16.735 1.966-.114 3.895-.169 5.79-.169 6.235 0 12.068.606 17.371 1.765-1.978 24.702-13.58 28.713-23.802 29.274Z"
                    />
                </mask>
            </defs>
            <rect width="192" height="192" rx="42" fill="currentColor" mask={`url(#${maskId})`} />
        </svg>
    );
}

function FooterArrow() {
    return (
        <svg
            width={27}
            height={27}
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

function FooterScrollArrow({ className = "" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-hidden="true"
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
    );
}

function ScrollUpButton({ onClick }: { onClick: () => void }) {
    const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
        if (runFooterTapPreview(event, onClick)) {
            return;
        }

        onClick();
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label="Scroll to top"
            className="footer-scroll-button group flex shrink-0 items-center"
        >
            <span className="footer-scroll-pill flex h-8 items-center justify-center whitespace-nowrap rounded-full border border-white/70 px-4 font-bdo text-[12px] font-light leading-none text-white transition-colors duration-300 group-hover:border-white group-hover:bg-white group-hover:text-[rgba(2,5,11,0.52)] md:h-10 md:px-6 md:text-[15px] lg:text-[16px]">
                Scroll up
            </span>
            <span className="footer-scroll-circle -ml-px flex h-8 w-8 items-center justify-center rounded-full border border-white/70 text-white transition-colors duration-300 group-hover:border-white group-hover:bg-white group-hover:text-[rgba(2,5,11,0.52)] md:h-10 md:w-10">
                <span className="footer-scroll-icon flex h-[18px] w-[18px] rotate-[-45deg] items-center justify-center transition-transform duration-500 ease-out group-hover:rotate-[-88deg] md:h-5 md:w-5">
                    <FooterScrollArrow className="h-full w-full" />
                </span>
            </span>
        </button>
    );
}
