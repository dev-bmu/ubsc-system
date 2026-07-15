import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

type RevealTag = "span" | "p" | "h1" | "h2" | "h3" | "div";
type RevealSplit = "block" | "words" | "lines";

interface ScrollTextRevealProps {
    as?: RevealTag;
    children: string;
    className?: string;
    split?: RevealSplit;
    delay?: number;
    stagger?: number;
    amount?: number;
    rootMargin?: string;
    style?: CSSProperties;
    triggerOnMount?: boolean;
    trackingEm?: number;
}

interface MeasuredLine {
    text: string;
    top: number;
    left: number;
    width: number;
    height: number;
}

export default function ScrollTextReveal({
    as: Tag = "span",
    children,
    className = "",
    split = "block",
    delay = 0,
    stagger = 18,
    amount = 0.35,
    rootMargin = "0px 0px -14% 0px",
    style: customStyle,
    triggerOnMount = false,
    trackingEm,
}: ScrollTextRevealProps) {
    const rootRef = useRef<HTMLElement | null>(null);
    const measureRef = useRef<HTMLSpanElement | null>(null);
    const [hasEntered, setHasEntered] = useState(false);
    const [lines, setLines] = useState<MeasuredLine[]>([]);
    const tokens = useMemo(() => children.split(/(\s+)/), [children]);
    const revealStyle = {
        ...customStyle,
        "--ubsc-text-delay": `${delay}ms`,
        ...(trackingEm
            ? { "--ubsc-text-tracking": `${trackingEm}em` }
            : {}),
    } as CSSProperties;

    const renderTrackedText = (text: string, keyPrefix: string): ReactNode => {
        if (!trackingEm) return text;

        return text.split(/(\s+)/).map((token, tokenIndex) => {
            if (token.length === 0) return null;

            if (token.trim() === "") {
                return (
                    <span
                        key={`${keyPrefix}-space-${tokenIndex}`}
                        className="ubsc-text-reveal__tracking-space"
                    >
                        {token}
                    </span>
                );
            }

            return (
                <span
                    key={`${keyPrefix}-word-${tokenIndex}`}
                    className="ubsc-text-reveal__tracking-word"
                >
                    {Array.from(token).map((glyph, glyphIndex) => (
                        <span
                            key={`${keyPrefix}-${tokenIndex}-${glyphIndex}`}
                            className="ubsc-text-reveal__tracking-glyph"
                        >
                            {glyph}
                        </span>
                    ))}
                </span>
            );
        });
    };

    const measureLines = useCallback(() => {
        const root = rootRef.current;
        const measure = measureRef.current;

        if (!root || !measure || split !== "lines") return;

        const rootRect = root.getBoundingClientRect();
        const wordNodes = Array.from(
            measure.querySelectorAll<HTMLElement>("[data-ubsc-line-word]"),
        );

        const nextLines: Array<MeasuredLine & { bottom: number; right: number }> = [];

        wordNodes.forEach((node) => {
            const rect = node.getBoundingClientRect();
            const text = node.textContent ?? "";

            if (rect.width <= 0 || rect.height <= 0 || text.trim() === "") return;

            const top = rect.top - rootRect.top;
            const left = rect.left - rootRect.left;
            const right = rect.right - rootRect.left;
            const bottom = rect.bottom - rootRect.top;
            const line = nextLines.find(
                (item) => Math.abs(item.top - top) <= Math.max(2, rect.height * 0.28),
            );

            if (line) {
                line.text = `${line.text} ${text}`;
                line.top = Math.min(line.top, top);
                line.left = Math.min(line.left, left);
                line.right = Math.max(line.right, right);
                line.bottom = Math.max(line.bottom, bottom);
                line.width = line.right - line.left;
                line.height = line.bottom - line.top;
                return;
            }

            nextLines.push({
                text,
                top,
                left,
                right,
                bottom,
                width: right - left,
                height: bottom - top,
            });
        });

        setLines(
            nextLines
                .sort((a, b) => a.top - b.top)
                .map(({ bottom: _bottom, right: _right, ...line }) => ({
                    ...line,
                    height: line.height * 1.24,
                    width: line.width + 24,
                })),
        );
    }, [split]);

    useEffect(() => {
        const node = rootRef.current;
        if (!node || hasEntered || triggerOnMount) return;

        if (!("IntersectionObserver" in window)) {
            setHasEntered(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setHasEntered(true);
                observer.disconnect();
            },
            { threshold: amount, rootMargin },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [amount, hasEntered, rootMargin, triggerOnMount]);

    useEffect(() => {
        if (split !== "lines") return;

        measureLines();

        const onResize = () => measureLines();
        window.addEventListener("resize", onResize);

        const observer =
            "ResizeObserver" in window
                ? new ResizeObserver(() => measureLines())
                : null;

        if (rootRef.current) observer?.observe(rootRef.current);

        document.fonts?.ready.then(measureLines).catch(() => {});

        return () => {
            window.removeEventListener("resize", onResize);
            observer?.disconnect();
        };
    }, [measureLines, split]);

    useEffect(() => {
        if (!triggerOnMount || hasEntered) return;

        let secondFrame = 0;
        const firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
                setHasEntered(true);
            });
        });

        return () => {
            window.cancelAnimationFrame(firstFrame);
            if (secondFrame) window.cancelAnimationFrame(secondFrame);
        };
    }, [hasEntered, triggerOnMount]);

    const content = (() => {
        if (split === "lines") {
            return (
                <>
                    <span className="ubsc-text-reveal__line-ghost" aria-hidden>
                        {renderTrackedText(children, "ghost")}
                    </span>
                    <span
                        ref={measureRef}
                        className="ubsc-text-reveal__line-measure"
                        aria-hidden
                    >
                        {tokens.map((token, index) => {
                            if (token.trim() === "") {
                                return renderTrackedText(
                                    token,
                                    `measure-space-${index}`,
                                );
                            }

                            return (
                                <span
                                    key={`${token}-${index}`}
                                    data-ubsc-line-word
                                >
                                    {renderTrackedText(
                                        token,
                                        `measure-word-${index}`,
                                    )}
                                </span>
                            );
                        })}
                    </span>
                    <span className="ubsc-text-reveal__line-overlay" aria-hidden>
                        {lines.map((line, index) => (
                            <span
                                key={`${line.text}-${index}`}
                                className="ubsc-text-reveal__line-clip"
                                style={
                                    {
                                        top: `${line.top}px`,
                                        left: `${line.left}px`,
                                        width: `${line.width}px`,
                                        height: `${line.height}px`,
                                        "--ubsc-line-delay": `${delay + index * stagger}ms`,
                                    } as CSSProperties
                                }
                            >
                                <span className="ubsc-text-reveal__line">
                                    {renderTrackedText(
                                        line.text,
                                        `line-${index}`,
                                    )}
                                </span>
                            </span>
                        ))}
                    </span>
                </>
            );
        }

        if (split === "block") {
            return <span className="ubsc-text-reveal__block">{children}</span>;
        }

        let wordIndex = 0;

        return tokens.map((token, index): ReactNode => {
            if (token.trim() === "") return token;

            const currentIndex = wordIndex;
            wordIndex += 1;

            return (
                <span
                    key={`${token}-${index}`}
                    className="ubsc-text-reveal__word-clip"
                    style={{
                        "--ubsc-word-delay": `${delay + currentIndex * stagger}ms`,
                    } as CSSProperties}
                >
                    <span className="ubsc-text-reveal__word">{token}</span>
                </span>
            );
        });
    })();

    return (
        <Tag
            ref={(node) => {
                rootRef.current = node;
            }}
            aria-label={split === "lines" ? children : undefined}
            className={`ubsc-text-reveal ubsc-text-reveal--${split} ${
                hasEntered ? "is-visible" : ""
            } ${className}`}
            style={revealStyle}
        >
            {content}
        </Tag>
    );
}
