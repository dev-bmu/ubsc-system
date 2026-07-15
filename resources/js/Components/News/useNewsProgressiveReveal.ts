import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

const REVEAL_SELECTOR = "[data-news-reveal]";
const useIsoLayoutEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function useNewsProgressiveReveal<T extends HTMLElement>(
    containerRef: RefObject<T>,
    resetKey?: unknown,
    forceResetKey?: unknown,
) {
    const forceResetRef = useRef(forceResetKey);

    useIsoLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const items = Array.from(
            container.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
        );

        if (items.length === 0) return;

        const shouldForceReset = !Object.is(
            forceResetRef.current,
            forceResetKey,
        );
        forceResetRef.current = forceResetKey;

        if (shouldForceReset) {
            items.forEach((item) => {
                if (item.dataset.newsRevealReset === "keep") return;
                item.classList.remove("is-news-prepared", "is-news-visible");
            });
        }

        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        const pendingItems = items.filter(
            (item) => !item.classList.contains("is-news-visible"),
        );

        const getRevealOrder = (item: HTMLElement, fallback: number) =>
            Number(item.dataset.newsRevealOrder ?? fallback);
        const orderedPendingItems = [...pendingItems].sort(
            (first, second) =>
                getRevealOrder(first, 0) - getRevealOrder(second, 0),
        );

        orderedPendingItems.forEach((item, index) => {
            item.classList.remove("is-news-prepared", "is-news-visible");
            const explicitDelay = item.dataset.newsRevealDelay;
            const order = getRevealOrder(item, index);
            const delay =
                explicitDelay !== undefined
                    ? Number(explicitDelay)
                    : Math.min(index * 58 + Math.max(order, 0) * 12, 680);

            item.style.setProperty("--news-reveal-delay", `${delay}ms`);
        });

        if (reduceMotion || !("IntersectionObserver" in window)) {
            pendingItems.forEach((item) => {
                item.classList.add("is-news-prepared", "is-news-visible");
            });
            return;
        }

        if (pendingItems.length === 0) return;

        const revealTimers: number[] = [];

        const prepareObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const target = entry.target as HTMLElement;
                    target.classList.add("is-news-prepared");
                    prepareObserver.unobserve(target);
                });
            },
            {
                threshold: 0.01,
                rootMargin: "900px 0px 900px 0px",
            },
        );

        const visibleObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const target = entry.target as HTMLElement;
                    const delay = Number.parseFloat(
                        target.style.getPropertyValue("--news-reveal-delay"),
                    );

                    const revealTimer = window.setTimeout(
                        () => {
                            window.requestAnimationFrame(() => {
                                target.style.setProperty(
                                    "--news-reveal-delay",
                                    "0ms",
                                );
                                target.classList.add(
                                    "is-news-prepared",
                                    "is-news-visible",
                                );
                            });
                        },
                        Number.isFinite(delay) ? delay : 0,
                    );

                    revealTimers.push(revealTimer);

                    visibleObserver.unobserve(target);
                });
            },
            {
                threshold: 0.01,
                rootMargin: "140px 0px -7% 0px",
            },
        );

        pendingItems.forEach((item) => {
            prepareObserver.observe(item);
            visibleObserver.observe(item);
        });

        return () => {
            prepareObserver.disconnect();
            visibleObserver.disconnect();
            revealTimers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [containerRef, resetKey, forceResetKey]);
}
