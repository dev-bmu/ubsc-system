import { type ReactNode, useEffect, useRef } from "react";

interface NewsRevealProps {
    children: ReactNode;
    className?: string;
    /** Kept for compatibility with existing call sites. */
    delayMs?: number;
}

export default function NewsReveal({
    children,
    className = "",
    delayMs = 0,
}: NewsRevealProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;

        if (!("IntersectionObserver" in window)) {
            node.classList.add("is-prepared", "is-in");
            return;
        }

        const prepareObserver = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                node.classList.add("is-prepared");
                prepareObserver.disconnect();
            },
            { threshold: 0.01, rootMargin: "1200px 0px 1200px 0px" },
        );

        const activeObserver = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                window.requestAnimationFrame(() => {
                    node.classList.add("is-in");
                });
                activeObserver.disconnect();
            },
            { threshold: 0.01, rootMargin: "180px 0px -4% 0px" },
        );

        prepareObserver.observe(node);
        activeObserver.observe(node);

        return () => {
            prepareObserver.disconnect();
            activeObserver.disconnect();
        };
    }, []);

    return (
        <div
            ref={ref}
            className={`news-reveal ${className}`.trim()}
            style={
                delayMs
                    ? ({
                          "--news-reveal-delay": `${delayMs}ms`,
                      } as React.CSSProperties)
                    : undefined
            }
        >
            {children}
        </div>
    );
}
