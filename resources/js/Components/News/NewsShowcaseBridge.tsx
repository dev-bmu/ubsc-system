import { useEffect, useRef, useState } from "react";
import CurvedLoop from "@/Components/Landing/CurvedLoop";
import person from "@/../assets/images/person.avif";
import bg from "@/../assets/images/bg-about.avif";

function useResponsiveCurve(mobile: number, desktop: number): number {
    const [curve, setCurve] = useState<number>(() =>
        typeof window !== "undefined" && window.innerWidth < 1280
            ? mobile
            : desktop,
    );

    useEffect(() => {
        const update = () =>
            setCurve(window.innerWidth < 1280 ? mobile : desktop);
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, [mobile, desktop]);

    return curve;
}

export default function NewsShowcaseBridge() {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const curveAmount = useResponsiveCurve(128, 124);
    const loopFontSize = useResponsiveCurve(112, 58);
    const loopSpeed = useResponsiveCurve(2.65, 1.5);

    useEffect(() => {
        if (isVisible) return;

        const node = rootRef.current;
        if (!node) return;

        if (!("IntersectionObserver" in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold: 0.18,
                rootMargin: "0px 0px -34% 0px",
            },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [isVisible]);

    return (
        <div
            ref={rootRef}
            className={`news-showcase-bridge news-about-media about-history-stage relative isolate ${
                isVisible ? "is-media-visible" : ""
            }`}
        >
            <div className="about-history-media relative isolate overflow-hidden">
                <img
                    src={bg}
                    alt=""
                    aria-hidden
                    className="about-history-media-bg absolute inset-0 h-full w-full object-cover object-center"
                    loading="lazy"
                    decoding="async"
                />
                <div className="absolute inset-0 z-0 bg-black/25" />
                <div
                    className="about-history-media-shine absolute inset-y-0 z-[1]"
                    aria-hidden="true"
                />
                <CurvedLoop
                    marqueeText={
                        "P   \u2726   UB   \u2726   SPORT   \u2726   CENTER   \u2726   UB   \u2726   "
                    }
                    speed={loopSpeed}
                    curveAmount={curveAmount}
                    fontSize={loopFontSize}
                    direction="left"
                    interactive
                    className="about-history-loop absolute top-1/2 z-10"
                />

                <div className="about-history-media-person-wrap pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                    <span
                        className="about-history-person-aura"
                        aria-hidden="true"
                    />
                    <img
                        src={person}
                        alt="UB Sport Center athlete"
                        className="about-history-media-person w-auto object-cover shadow-2xl"
                        loading="lazy"
                        decoding="async"
                    />
                </div>
            </div>
        </div>
    );
}
