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
    const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

    useEffect(() => {
        if (!onActiveIndexChange) return;

        let frame = 0;
        let activeIndex = -1;

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

        const requestUpdate = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate);

        return () => {
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestUpdate);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [cardOffset, onActiveIndexChange, topStart]);

    return (
        <div className={`relative flex flex-col ${className}`}>
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
