import { useEffect, useRef } from "react";

interface FacilityTextMarqueeProps {
    text: string;
    words?: string[];
    className?: string;
}

const MARQUEE_ITEMS = Array(18).fill(null);

export default function FacilityTextMarquee({
    text,
    words,
    className = "",
}: FacilityTextMarqueeProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const groupRef = useRef<HTMLDivElement>(null);
    const positionRef = useRef(0);

    useEffect(() => {
        const track = trackRef.current;
        const group = groupRef.current;

        if (!track || !group) return;

        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = 0;
        let lastTime = performance.now();

        const getLoopWidth = () => group.scrollWidth;
        const render = () => {
            track.style.transform = `translate3d(${-positionRef.current}px, 0, 0)`;
        };
        const normalize = () => {
            const width = getLoopWidth();
            if (width <= 0) return;

            while (positionRef.current >= width) {
                positionRef.current -= width;
            }
        };
        const tick = (time: number) => {
            const delta = Math.min(0.04, (time - lastTime) / 1000);
            lastTime = time;

            if (!prefersReduced.matches) {
                positionRef.current += 44 * delta;
                normalize();
                render();
            }

            frame = window.requestAnimationFrame(tick);
        };
        const handleResize = () => {
            normalize();
            render();
        };
        const resizeObserver = new ResizeObserver(handleResize);

        resizeObserver.observe(group);
        handleResize();
        frame = window.requestAnimationFrame(tick);

        return () => {
            window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            track.style.removeProperty("transform");
        };
    }, []);

    const marqueeWords = words && words.length > 0 ? words : [text];

    const renderGroup = (key: string, hidden = false) => (
        <div
            ref={hidden ? undefined : groupRef}
            className="flex shrink-0 items-center gap-9 pr-9 sm:gap-12 sm:pr-12 md:gap-14 md:pr-14"
            aria-hidden={hidden || undefined}
        >
            {MARQUEE_ITEMS.map((_, index) => (
                <span
                    key={`${key}-${index}`}
                    className="facility-text-marquee__word shrink-0 font-clash text-[12px] font-semibold uppercase leading-none tracking-widest sm:text-[13px] lg:text-[16px]"
                >
                    {marqueeWords[index % marqueeWords.length]}
                </span>
            ))}
        </div>
    );

    return (
        <div
            className={`facility-text-marquee relative overflow-hidden border-b border-white/10 bg-black py-[14px] md:py-[18px] ${className}`}
        >
            <div ref={trackRef} className="flex w-max will-change-transform">
                {renderGroup("primary")}
                {renderGroup("secondary", true)}
                {renderGroup("tertiary", true)}
            </div>
        </div>
    );
}
