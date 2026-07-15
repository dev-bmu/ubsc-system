import {
    type HTMLAttributes,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";

interface CurvedLoopProps extends HTMLAttributes<HTMLDivElement> {
    marqueeText?: string;
    speed?: number;
    className?: string;
    curveAmount?: number;
    direction?: "left" | "right";
    interactive?: boolean;
    fontSize?: number | string;
}

export default function CurvedLoop({
    marqueeText = "UB * SPORT CENTER * ",
    speed = 2,
    className,
    curveAmount = 200,
    direction = "left",
    interactive = true,
    fontSize = "4.5rem",
    style,
    ...rest
}: CurvedLoopProps) {
    const uniqueId = useId();
    const pathId = `curved-loop-path-${uniqueId.replace(/:/g, "")}`;

    const rootRef = useRef<HTMLDivElement | null>(null);
    const offsetRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const lastXRef = useRef(0);
    const dragVelocityRef = useRef(0);
    const measureRef = useRef<SVGTextElement | null>(null);
    const textPathRef = useRef<SVGTextPathElement | null>(null);

    const [isInView, setIsInView] = useState(false);
    const [measuredTextWidth, setMeasuredTextWidth] = useState(0);

    useEffect(() => {
        const node = rootRef.current;
        if (!node) return;

        if (!("IntersectionObserver" in window)) {
            setIsInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => setIsInView(Boolean(entry?.isIntersecting)),
            {
                threshold: 0,
                rootMargin: "1200px 0px",
            },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isInView) return;

        const measure = () => {
            const width = measureRef.current?.getComputedTextLength() ?? 0;
            if (width > 0) {
                setMeasuredTextWidth((current) =>
                    Math.abs(current - width) < 0.5 ? current : width,
                );
            }
        };

        measure();
        document.fonts?.ready.then(measure).catch(() => undefined);
        window.addEventListener("resize", measure);

        return () => window.removeEventListener("resize", measure);
    }, [isInView, marqueeText]);

    const singleTextWidth = useMemo(() => {
        return measuredTextWidth || marqueeText.length * 55;
    }, [marqueeText, measuredTextWidth]);

    const repeatCount = useMemo(() => {
        const viewportWidth = 1440;
        const needed = Math.ceil((viewportWidth * 2) / singleTextWidth) + 2;
        return Math.max(needed, 4);
    }, [singleTextWidth]);

    const totalText = useMemo(
        () => marqueeText.repeat(repeatCount),
        [marqueeText, repeatCount]
    );

    useEffect(() => {
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (!isInView || reducedMotion) return;

        const step = direction === "left" ? -speed : speed;

        const animate = () => {
            if (!isDraggingRef.current) {
                offsetRef.current += step;
            } else {
                offsetRef.current += dragVelocityRef.current;
                dragVelocityRef.current *= 0.95;
            }

            // Wrap by the measured phrase width so the repeated text never jumps mid-loop.
            const wrapAt = singleTextWidth;
            if (wrapAt > 0) {
                offsetRef.current = ((offsetRef.current % wrapAt) + wrapAt) % wrapAt;
                if (direction === "left") offsetRef.current -= wrapAt;
            }

            textPathRef.current?.setAttribute(
                "startOffset",
                `${offsetRef.current}px`,
            );
            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [isInView, speed, direction, singleTextWidth]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!interactive) return;
        isDraggingRef.current = true;
        lastXRef.current = e.clientX;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!interactive || !isDraggingRef.current) return;
        const dx = e.clientX - lastXRef.current;
        dragVelocityRef.current = dx * 0.5;
        offsetRef.current += dx;
        lastXRef.current = e.clientX;
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
    };

    const pathD = `M-100,40 Q720,${40 + curveAmount} 1540,40`;

    return (
        <div
            {...rest}
            ref={rootRef}
            className={className}
            style={{
                ...style,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                overflow: "hidden",
                cursor: interactive ? "grab" : "default",
                userSelect: "none",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <svg
                viewBox="0 0 1440 120"
                style={{
                    width: "100%",
                    aspectRatio: "100 / 12",
                    fontSize,
                    fill: "white",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    fontFamily: "inherit",
                    overflow: "visible",
                }}
            >
                <defs>
                    <path id={pathId} d={pathD} />
                </defs>
                <text
                    ref={measureRef}
                    x="-9999"
                    y="-9999"
                    style={{ visibility: "hidden", whiteSpace: "pre" }}
                >
                    {marqueeText}
                </text>
                <text>
                    <textPath
                        ref={textPathRef}
                        href={`#${pathId}`}
                        startOffset="0px"
                        style={{ whiteSpace: "pre" }}
                    >
                        {totalText}
                    </textPath>
                </text>
            </svg>
        </div>
    );
}
