import { Children, type ReactNode, useEffect, useRef } from "react";

export interface ScrollStackItemProps {
    children: ReactNode;
    itemClassName?: string;
}

export function ScrollStackItem({ children, itemClassName = "" }: ScrollStackItemProps) {
    return <div className={`w-full overflow-hidden  ${itemClassName}`}>{children}</div>;
}

export interface ScrollStackProps {
    children: ReactNode;
    cardOffset?: number;
    topStart?: number;
    itemGap?: string;
    lastItemGap?: string;
    stackScaleStep?: number;
    className?: string;
    onActiveIndexChange?: (index: number) => void;
}

export default function ScrollStack({
    children,
    cardOffset = 0,
    topStart = 80,
    itemGap = "clamp(3rem, 6vh, 5rem)",
    lastItemGap,
    stackScaleStep = 0,
    className = "",
    onActiveIndexChange,
}: ScrollStackProps) {
    const items = Children.toArray(children);
    const rootRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

    useEffect(() => {
        if (!onActiveIndexChange) return;

        const root = rootRef.current;
        if (!root) return;

        let frame = 0;
        let activeIndex = -1;
        let isNearViewport = true;
        let isPageVisible = document.visibilityState !== "hidden";

        const update = () => {
            frame = 0;
            const activationLine = topStart + Math.max(cardOffset, 2);
            let nextIndex = 0;

            itemRefs.current.forEach((item, index) => {
                if (item && item.getBoundingClientRect().top <= activationLine) {
                    nextIndex = index;
                }
            });

            if (nextIndex !== activeIndex) {
                activeIndex = nextIndex;
                onActiveIndexChange(nextIndex);
            }
        };

        const requestUpdate = (force = false) => {
            if (!isPageVisible || (!force && !isNearViewport)) return;
            if (frame) return;
            frame = window.requestAnimationFrame(update);
        };
        const handleScroll = () => requestUpdate();
        const handleResize = () => requestUpdate();
        const handleVisibilityChange = () => {
            isPageVisible = document.visibilityState !== "hidden";

            if (!isPageVisible) {
                if (frame) window.cancelAnimationFrame(frame);
                frame = 0;
                return;
            }

            requestUpdate();
        };
        const observer =
            "IntersectionObserver" in window
                ? new IntersectionObserver(
                      ([entry]) => {
                          isNearViewport = entry?.isIntersecting ?? true;
                          if (isNearViewport) requestUpdate(true);
                      },
                      {
                          rootMargin: "1000px 0px",
                          threshold: 0,
                      },
                  )
                : null;

        if (isPageVisible) update();
        observer?.observe(root);
        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleResize);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            observer?.disconnect();
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleResize);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [cardOffset, onActiveIndexChange, topStart]);

    return (
        <div ref={rootRef} className={`relative flex flex-col ${className}`}>
            {items.map((child, i) => (
                <div
                    key={i}
                    ref={(element) => {
                        itemRefs.current[i] = element;
                    }}
                    style={{
                        position: "sticky",
                        top: `${topStart + i * cardOffset}px`,
                        zIndex: i + 1,
                        transform:
                            stackScaleStep > 0
                                ? `scale(${1 - (items.length - 1 - i) * stackScaleStep})`
                                : undefined,
                        transformOrigin: "top center",
                        marginBottom:
                            i === items.length - 1
                                ? (lastItemGap ?? itemGap)
                                : itemGap,
                    }}
                >
                    {child}
                </div>
            ))}
        </div>
    );
}
