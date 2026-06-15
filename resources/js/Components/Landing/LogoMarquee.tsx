import { type PointerEvent, useEffect, useRef } from "react";

export interface SponsorItem {
    id: number | string;
    name: string;
    img: string;
    link?: string | null;
}

const FALLBACK_LOGOS: SponsorItem[] = [
    { id: 1, name: "B1", img: "/assets/icons/B1.png" },
    { id: 2, name: "Mo-Fruits", img: "/assets/icons/Mo-Fruits.png" },
    { id: 3, name: "ExtraJoss", img: "/assets/icons/ExtraJoss.png" },
    { id: 4, name: "AYO", img: "/assets/icons/AYO.png" },
    { id: 5, name: "SC-Mart", img: "/assets/icons/SC-Mart.png" },
];

interface LogoMarqueeProps {
    sponsors?: SponsorItem[];
    density?: "default" | "compact";
    label?: string;
}

export default function LogoMarquee({
    sponsors,
    density = "default",
    label,
}: LogoMarqueeProps) {
    const logos =
        sponsors && sponsors.filter((item) => item.img).length > 0
            ? sponsors.filter((item) => item.img)
            : FALLBACK_LOGOS;
    const repeatCount = Math.max(1, Math.ceil(10 / logos.length));
    const marqueeLogos = Array.from({ length: repeatCount }).flatMap(
        () => logos,
    );
    const isCompact = density === "compact";
    const baseSpeed = isCompact ? 42 : 48;
    const hoverSpeed = isCompact ? 16 : 20;
    const railRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const groupRef = useRef<HTMLDivElement>(null);
    const targetSpeedRef = useRef(baseSpeed);
    const positionRef = useRef(0);
    const isDraggingRef = useRef(false);
    const didDragRef = useRef(false);
    const lastPointerXRef = useRef(0);

    useEffect(() => {
        targetSpeedRef.current = baseSpeed;
    }, [baseSpeed]);

    useEffect(() => {
        const rail = railRef.current;
        const track = trackRef.current;
        const group = groupRef.current;

        if (!rail || !track || !group) return;

        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        let animationFrame = 0;
        let lastTime = performance.now();
        let currentSpeed = baseSpeed;

        const loopWidth = () => group.scrollWidth;
        const normalizePosition = () => {
            const width = loopWidth();

            if (width <= 0) return;

            while (positionRef.current >= width) {
                positionRef.current -= width;
            }

            while (positionRef.current < 0) {
                positionRef.current += width;
            }
        };
        const renderPosition = () => {
            track.style.transform = `translate3d(${-positionRef.current}px, 0, 0)`;
        };
        const tick = (time: number) => {
            const delta = Math.min(0.04, (time - lastTime) / 1000);
            lastTime = time;
            currentSpeed += (targetSpeedRef.current - currentSpeed) * Math.min(1, delta * 5);

            if (!prefersReduced.matches && !isDraggingRef.current) {
                positionRef.current += currentSpeed * delta;
                normalizePosition();
                renderPosition();
            }

            animationFrame = window.requestAnimationFrame(tick);
        };
        const handleResize = () => {
            normalizePosition();
            renderPosition();
        };
        const initialFrame = window.requestAnimationFrame(handleResize);
        const resizeObserver = new ResizeObserver(handleResize);

        resizeObserver.observe(group);
        animationFrame = window.requestAnimationFrame(tick);

        return () => {
            window.cancelAnimationFrame(initialFrame);
            window.cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
        };
    }, [baseSpeed, marqueeLogos.length]);

    const moveTrackBy = (deltaX: number) => {
        const track = trackRef.current;
        const group = groupRef.current;
        const width = group?.scrollWidth ?? 0;

        if (!track || width <= 0) return;

        positionRef.current -= deltaX;

        while (positionRef.current >= width) {
            positionRef.current -= width;
        }

        while (positionRef.current < 0) {
            positionRef.current += width;
        }

        track.style.transform = `translate3d(${-positionRef.current}px, 0, 0)`;
    };

    const handlePointerEnter = () => {
        targetSpeedRef.current = hoverSpeed;
    };
    const handlePointerLeave = () => {
        targetSpeedRef.current = baseSpeed;
    };
    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        const rail = railRef.current;
        if (!rail) return;

        isDraggingRef.current = true;
        didDragRef.current = false;
        lastPointerXRef.current = event.clientX;
        rail.classList.add("sponsor-logo-rail--dragging");
        rail.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;

        const delta = event.clientX - lastPointerXRef.current;
        if (Math.abs(delta) > 4) didDragRef.current = true;

        lastPointerXRef.current = event.clientX;
        moveTrackBy(delta);
    };
    const endPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
        const rail = railRef.current;

        if (!rail || !isDraggingRef.current) return;

        isDraggingRef.current = false;
        rail.classList.remove("sponsor-logo-rail--dragging");

        if (rail.hasPointerCapture(event.pointerId)) {
            rail.releasePointerCapture(event.pointerId);
        }

        window.setTimeout(() => {
            didDragRef.current = false;
        }, 90);
    };
    const renderLogo = (logo: SponsorItem, index: number, group: string) => {
        const isInteractiveGroup = group === "secondary";

        return (
            <a
                key={`${group}-${logo.id}-${index}`}
                href={logo.link ?? undefined}
                target={logo.link ? "_blank" : undefined}
                rel={logo.link ? "noopener noreferrer" : undefined}
                tabIndex={isInteractiveGroup ? undefined : -1}
                aria-hidden={isInteractiveGroup ? undefined : true}
                aria-label={isInteractiveGroup ? logo.name : undefined}
                className={`flex h-[118px] w-[210px] shrink-0 items-center justify-center bg-[#F7F7F7] px-8 transition hover:bg-[#F1F1F1] sm:h-[150px] sm:w-[260px] ${
                    isCompact
                        ? "xl:h-[176px] xl:w-[232px] xl:px-6"
                        : "xl:h-[220px] xl:w-[290px]"
                }`}
                onClick={(event) => {
                    if (!didDragRef.current) return;

                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                <img
                    src={logo.img}
                    alt={isInteractiveGroup ? logo.name : ""}
                    className={`h-auto w-auto max-w-[60%] object-contain grayscale ${
                        isCompact ? "max-h-[42px]" : "max-h-[52px]"
                    }`}
                    draggable={false}
                    loading="lazy"
                />
            </a>
        );
    };

    const marquee = (
        <div
            ref={railRef}
            className="sponsor-logo-rail"
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointerDrag}
            onPointerCancel={endPointerDrag}
        >
            <div ref={trackRef} className="sponsor-logo-track flex w-max">
                <div ref={groupRef} className="flex shrink-0 gap-2 pr-2" aria-hidden>
                    {marqueeLogos.map((logo, index) =>
                        renderLogo(logo, index, "primary"),
                    )}
                </div>
                <div className="flex shrink-0 gap-2 pr-2">
                    {marqueeLogos.map((logo, index) =>
                        renderLogo(logo, index, "secondary"),
                    )}
                </div>
                <div className="flex shrink-0 gap-2 pr-2" aria-hidden>
                    {marqueeLogos.map((logo, index) =>
                        renderLogo(logo, index, "tertiary"),
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <section className={`w-full overflow-hidden bg-white ${isCompact ? "pb-5" : "pb-6"}`}>
            <style>{`
                .sponsor-logo-rail {
                    cursor: grab;
                    overflow: hidden;
                    overscroll-behavior-x: contain;
                    touch-action: pan-y;
                    user-select: none;
                }
                .sponsor-logo-rail--dragging {
                    cursor: grabbing;
                }
                .sponsor-logo-track {
                    transform: translateZ(0);
                }
            `}</style>
            {label ? (
                <div className="grid items-center gap-8 lg:grid-cols-[minmax(10rem,13.5rem)_minmax(0,1fr)]">
                    <p className="font-bdo text-[clamp(0.88rem,0.95vw,1rem)] font-semibold uppercase leading-none tracking-[-0.04em] text-[#242424]">
                        {label}
                    </p>
                    <div className="min-w-0 overflow-hidden">
                        {marquee}
                    </div>
                </div>
            ) : (
                marquee
            )}
        </section>
    );
}
