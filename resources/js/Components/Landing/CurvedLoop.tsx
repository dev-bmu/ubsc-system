import { useRef, useEffect, useState, useMemo, useId } from "react";

interface CurvedLoopProps {
    marqueeText?: string;
    speed?: number;
    className?: string;
    curveAmount?: number;
    direction?: "left" | "right";
    interactive?: boolean;
}

export default function CurvedLoop({
    marqueeText = "UB * SPORT CENTER * ",
    speed = 2,
    className,
    curveAmount = 200,
    direction = "left",
    interactive = true,
}: CurvedLoopProps) {
    const uniqueId = useId();
    const pathId = `curved-loop-path-${uniqueId.replace(/:/g, "")}`;

    const offsetRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const lastXRef = useRef(0);
    const dragVelocityRef = useRef(0);

    const [offset, setOffset] = useState(0);

    const singleTextWidth = useMemo(() => {
        return marqueeText.length * 55;
    }, [marqueeText]);

    const repeatCount = useMemo(() => {
        const viewportWidth = 1440;
        const needed = Math.ceil((viewportWidth * 2) / singleTextWidth) + 2;
        return Math.max(needed, 4);
    }, [singleTextWidth]);

    const totalText = useMemo(
        () => marqueeText.repeat(repeatCount),
        [marqueeText, repeatCount]
    );

    const loopWidth = singleTextWidth * repeatCount;

    useEffect(() => {
        const step = direction === "left" ? -speed : speed;

        const animate = () => {
            if (!isDraggingRef.current) {
                offsetRef.current += step;
            } else {
                offsetRef.current += dragVelocityRef.current;
                dragVelocityRef.current *= 0.95;
            }

            // Wrap offset to prevent unbounded growth
            const wrapAt = singleTextWidth;
            if (offsetRef.current <= -wrapAt) offsetRef.current += wrapAt;
            if (offsetRef.current >= wrapAt) offsetRef.current -= wrapAt;

            setOffset(offsetRef.current);
            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [speed, direction, singleTextWidth]);

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
            className={className}
            style={{
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
                    fontSize: "4.5rem",
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
                <text>
                    <textPath
                        href={`#${pathId}`}
                        startOffset={`${offset}px`}
                        style={{ whiteSpace: "pre" }}
                    >
                        {totalText}
                    </textPath>
                </text>
            </svg>
        </div>
    );
}
