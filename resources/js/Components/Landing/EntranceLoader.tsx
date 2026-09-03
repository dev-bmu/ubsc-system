import {
    type CSSProperties,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";

import "./EntranceLoader.css";

interface EntranceLoaderProps {
    ready?: boolean;
    skipIntro?: boolean;
    onComplete: () => void;
    onExitStart?: () => void;
    onEntranceReady?: () => void;
    onRegistrationReveal?: () => void;
    onContentReveal?: () => void;
}

type LoaderPhase = "intro" | "cascade" | "fade" | "done";

interface CanvasGrid {
    cellSize: number;
    columns: number;
    rows: number;
    bandHalfWidth: number;
    profileHalfSpan: number;
    inset: number;
    squareSize: number;
    lineWidth: number;
    thresholds: Float64Array;
    rowMinThresholds: Float64Array;
    rowMaxThresholds: Float64Array;
    noiseB: Float64Array;
    noiseC: Float64Array;
    fillMode: Uint8Array;
}

interface CanvasSurface {
    context: CanvasRenderingContext2D | null;
    width: number;
    height: number;
    pixelRatio: number;
    grid: CanvasGrid;
    opaqueBaseReady: boolean;
    cascadeInitialized: boolean;
    previousFirstBandRow: number;
    previousLastBandRow: number;
}

interface CanvasMetrics {
    width: number;
    height: number;
    pixelRatio: number;
}

const MIN_INTRO_MS = 1480;
const MAX_READY_WAIT_MS = 4500;
const CASCADE_DURATION_MS = 1480;
const INTENT_CASCADE_DURATION_MS = 1020;
const CASCADE_FALLBACK_MS = 1900;
const REDUCED_INTRO_MS = 260;
const REDUCED_FADE_MS = 220;
const ENTRANCE_SYNC_PROGRESS = 0.55;
const REGISTRATION_REVEAL_PROGRESS = 0.7;
const CONTENT_REVEAL_PROGRESS = 0.98;
const INTRO_TAGLINE_WORDS = ["Train.", "Play.", "Recover.", "Belong."];
const INTRO_META_ITEMS = ["Training", "Court", "Membership"];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (value: number): number => {
    const clamped = clamp01(value);
    return clamped * clamped * (3 - 2 * clamped);
};

const M_CASCADE_ANCHORS = [0, 1, 0, 1, 0] as const;

const mCascadeProfile = (normalizedX: number): number => {
    const position = clamp01(normalizedX) * 4;
    const segment = Math.min(3, Math.floor(position));
    const localProgress = position - segment;
    const shapedProgress =
        localProgress * 0.38 + smoothstep(localProgress) * 0.62;

    return (
        M_CASCADE_ANCHORS[segment] +
        (M_CASCADE_ANCHORS[segment + 1] -
            M_CASCADE_ANCHORS[segment]) *
            shapedProgress
    );
};

const cellNoise = (column: number, row: number, seed: number): number => {
    let value =
        Math.imul(column + 1, 374761393) ^
        Math.imul(row + 1, 668265263) ^
        Math.imul(seed + 1, 1274126177);

    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};

const canvasSurfaces = new WeakMap<HTMLCanvasElement, CanvasSurface>();

function measureCanvas(canvas: HTMLCanvasElement): CanvasMetrics {
    const parentRect = canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(1, Math.round(parentRect?.width ?? window.innerWidth));
    const height = Math.max(
        1,
        Math.round(parentRect?.height ?? window.innerHeight),
    );
    const requestedPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    // Preserve the original 1.5x output through Full HD, while preventing QHD
    // and 4K screens from allocating an oversized full-screen canvas surface.
    const bitmapBudgetRatio = Math.max(
        1,
        Math.sqrt(4_700_000 / (width * height)),
    );

    return {
        width,
        height,
        pixelRatio: Math.min(requestedPixelRatio, bitmapBudgetRatio),
    };
}

function createCascadeGrid(width: number, height: number): CanvasGrid {
    const cellSize = Math.max(7, Math.min(11, Math.round(width / 180)));
    const columns = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const cellCount = columns * rows;
    const thresholds = new Float64Array(cellCount);
    const rowMinThresholds = new Float64Array(rows);
    const rowMaxThresholds = new Float64Array(rows);
    const noiseB = new Float64Array(cellCount);
    const noiseC = new Float64Array(cellCount);
    const fillMode = new Uint8Array(cellCount);
    // Keep the M legible on a wide desktop without letting it become too deep
    // on a portrait phone. The profile is baked once into the threshold field,
    // so the per-frame renderer remains as lean as the original cascade.
    const mDepth = Math.min(
        0.18,
        Math.max(0.115, (width / Math.max(1, height)) * 0.072),
    );

    for (let row = 0; row < rows; row += 1) {
        const rowOffset = row * columns;
        let rowMinimum = Number.POSITIVE_INFINITY;
        let rowMaximum = Number.NEGATIVE_INFINITY;

        for (let column = 0; column < columns; column += 1) {
            const index = rowOffset + column;
            const noiseA = cellNoise(column, row, 0);
            const secondaryNoise = cellNoise(column, row, 1);
            const tertiaryNoise = cellNoise(column, row, 2);
            const normalizedX = (column + 0.5) / columns;
            const mOffset =
                (mCascadeProfile(normalizedX) - 0.5) * mDepth;
            const wave =
                (noiseA - 0.5) * 0.07 +
                Math.sin(column * 0.43 + row * 0.08) * 0.012;
            const threshold = (row + 0.5) / rows - mOffset + wave;

            thresholds[index] = threshold;
            rowMinimum = Math.min(rowMinimum, threshold);
            rowMaximum = Math.max(rowMaximum, threshold);
            noiseB[index] = secondaryNoise;
            noiseC[index] = tertiaryNoise;
            fillMode[index] = noiseA > 0.48 ? 1 : 0;
        }

        rowMinThresholds[row] = rowMinimum;
        rowMaxThresholds[row] = rowMaximum;
    }

    const inset = Math.max(1.25, cellSize * 0.17);

    return {
        cellSize,
        columns,
        rows,
        bandHalfWidth: 0.15,
        profileHalfSpan: mDepth * 0.5,
        inset,
        squareSize: Math.max(2, cellSize - inset * 2),
        lineWidth: Math.max(1, cellSize * 0.105),
        thresholds,
        rowMinThresholds,
        rowMaxThresholds,
        noiseB,
        noiseC,
        fillMode,
    };
}

function resizeCanvas(canvas: HTMLCanvasElement): CanvasSurface {
    const cached = canvasSurfaces.get(canvas);
    if (cached) {
        return cached;
    }

    const { width, height, pixelRatio } = measureCanvas(canvas);
    const bitmapWidth = Math.round(width * pixelRatio);
    const bitmapHeight = Math.round(height * pixelRatio);

    if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }

    const context = canvas.getContext("2d", { alpha: true });
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const surface: CanvasSurface = {
        context,
        width,
        height,
        pixelRatio,
        grid: createCascadeGrid(width, height),
        opaqueBaseReady: false,
        cascadeInitialized: false,
        previousFirstBandRow: -1,
        previousLastBandRow: -1,
    };

    canvasSurfaces.set(canvas, surface);
    return surface;
}

function hasCanvasSizeChanged(canvas: HTMLCanvasElement): boolean {
    const cached = canvasSurfaces.get(canvas);
    if (!cached) {
        return true;
    }

    const measured = measureCanvas(canvas);
    return (
        measured.width !== cached.width ||
        measured.height !== cached.height ||
        measured.pixelRatio !== cached.pixelRatio
    );
}

function invalidateCanvas(canvas: HTMLCanvasElement): void {
    canvasSurfaces.delete(canvas);
}

function releaseCanvas(canvas: HTMLCanvasElement | null): void {
    if (!canvas) {
        return;
    }

    invalidateCanvas(canvas);
    canvas.width = 1;
    canvas.height = 1;
}

function drawClosedCanvas(canvas: HTMLCanvasElement): void {
    const surface = resizeCanvas(canvas);
    const { context, width, height } = surface;

    if (!context) {
        return;
    }

    if (surface.opaqueBaseReady && !surface.cascadeInitialized) {
        return;
    }

    context.globalAlpha = 1;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#03070d";
    context.fillRect(0, 0, width, height);
    surface.opaqueBaseReady = true;
    surface.cascadeInitialized = false;
    surface.previousFirstBandRow = -1;
    surface.previousLastBandRow = -1;
}

function drawCascadeFrame(canvas: HTMLCanvasElement, progress: number): void {
    const surface = resizeCanvas(canvas);
    const { context, width, height, grid } = surface;

    if (!context) {
        return;
    }

    if (progress >= 1) {
        context.globalAlpha = 1;
        context.clearRect(0, 0, width, height);
        surface.opaqueBaseReady = false;
        surface.cascadeInitialized = false;
        surface.previousFirstBandRow = -1;
        surface.previousLastBandRow = -1;
        return;
    }

    const easedProgress = smoothstep(progress);
    const {
        cellSize,
        columns,
        rows,
        bandHalfWidth,
        profileHalfSpan,
        inset,
        squareSize,
        lineWidth,
        thresholds,
        rowMinThresholds,
        rowMaxThresholds,
        noiseB,
        noiseC,
        fillMode,
    } = grid;
    const frontStart = -0.18 - profileHalfSpan;
    const frontEnd = 1.18 + profileHalfSpan;
    const front = frontStart + easedProgress * (frontEnd - frontStart);
    const revealBoundary = front - bandHalfWidth;
    const bandBoundary = front + bandHalfWidth;
    let firstBandRow = 0;
    let lastBandRow = rows - 1;

    // The M profile means one horizontal row can be finished at the peaks but
    // still active inside both valleys. Use the precomputed row extrema instead
    // of assuming a straight horizontal front; this also prevents hard cuts at
    // either diagonal of the M.
    while (
        firstBandRow < rows &&
        rowMaxThresholds[firstBandRow] < revealBoundary
    ) {
        firstBandRow += 1;
    }

    while (
        lastBandRow >= firstBandRow &&
        rowMinThresholds[lastBandRow] > bandBoundary
    ) {
        lastBandRow -= 1;
    }

    if (firstBandRow > lastBandRow) {
        context.clearRect(0, 0, width, height);
        surface.opaqueBaseReady = false;
        surface.cascadeInitialized = false;
        surface.previousFirstBandRow = -1;
        surface.previousLastBandRow = -1;
        return;
    }

    const bandTop = Math.max(0, firstBandRow * cellSize);
    const bandBottom = Math.min(height, (lastBandRow + 1) * cellSize);
    const reversed =
        surface.cascadeInitialized &&
        (firstBandRow < surface.previousFirstBandRow ||
            lastBandRow < surface.previousLastBandRow);

    context.globalAlpha = 1;

    if (!surface.opaqueBaseReady || reversed) {
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#03070d";
        context.fillRect(0, 0, width, height);
        surface.opaqueBaseReady = true;

        if (bandTop > 0) {
            context.clearRect(0, 0, width, bandTop);
        }
    } else if (surface.cascadeInitialized) {
        const previousTop = Math.max(
            0,
            surface.previousFirstBandRow * cellSize,
        );
        if (bandTop > previousTop) {
            context.clearRect(0, previousTop, width, bandTop - previousTop);
        }
    } else if (bandTop > 0) {
        context.clearRect(0, 0, width, bandTop);
    }

    const repaintBottom =
        surface.cascadeInitialized && !reversed
            ? Math.min(
                  height,
                  (Math.max(surface.previousLastBandRow, lastBandRow) + 1) *
                      cellSize,
              )
            : bandBottom;

    context.fillStyle = "#03070d";
    context.fillRect(0, bandTop, width, Math.max(0, repaintBottom - bandTop));
    context.lineWidth = lineWidth;
    context.fillStyle = "#ff3b00";
    context.strokeStyle = "#ff3b00";

    for (let row = firstBandRow; row <= lastBandRow; row += 1) {
        const y = row * cellSize;

        if (rowMaxThresholds[row] < revealBoundary) {
            context.clearRect(0, y, columns * cellSize + 1, cellSize + 1);
            continue;
        }

        if (rowMinThresholds[row] > bandBoundary) {
            continue;
        }

        const rowOffset = row * columns;
        let clearStart = -1;
        let x = 0;

        for (let column = 0; column < columns; column += 1, x += cellSize) {
            const index = rowOffset + column;
            const distance = thresholds[index] - front;
            let shouldClear = false;
            let accentOpacity = 0;

            if (distance < -bandHalfWidth) {
                shouldClear = true;
            } else {
                const absoluteDistance = Math.abs(distance);
                if (absoluteDistance <= bandHalfWidth) {
                    const edgeStrength = 1 - absoluteDistance / bandHalfWidth;
                    shouldClear =
                        distance < 0 ||
                        noiseB[index] > 0.52 - edgeStrength * 0.18;

                    if (noiseC[index] >= 0.12 + (1 - edgeStrength) * 0.18) {
                        accentOpacity = 0.3 + edgeStrength * 0.7;
                    }
                }
            }

            if (shouldClear && clearStart === -1) {
                clearStart = column;
            }

            if (clearStart >= 0 && (!shouldClear || accentOpacity > 0)) {
                const clearEnd = shouldClear ? column + 1 : column;
                context.clearRect(
                    clearStart * cellSize,
                    y,
                    (clearEnd - clearStart) * cellSize + 1,
                    cellSize + 1,
                );
                clearStart = -1;
            }

            if (accentOpacity !== 0) {
                context.globalAlpha = accentOpacity;
                if (fillMode[index]) {
                    context.fillRect(
                        x + inset,
                        y + inset,
                        squareSize,
                        squareSize,
                    );
                } else {
                    context.strokeRect(
                        x + inset,
                        y + inset,
                        squareSize,
                        squareSize,
                    );
                }
            }
        }

        if (clearStart >= 0) {
            context.clearRect(
                clearStart * cellSize,
                y,
                (columns - clearStart) * cellSize + 1,
                cellSize + 1,
            );
        }
    }

    context.globalAlpha = 1;
    surface.cascadeInitialized = true;
    surface.previousFirstBandRow = firstBandRow;
    surface.previousLastBandRow = lastBandRow;
}

export default function EntranceLoader({
    ready = false,
    skipIntro = false,
    onComplete,
    onExitStart,
    onEntranceReady,
    onRegistrationReveal,
    onContentReveal,
}: EntranceLoaderProps) {
    const [phase, setPhase] = useState<LoaderPhase>("intro");
    const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
    const loaderRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const progressBarRef = useRef<HTMLSpanElement>(null);
    const mountedAtRef = useRef(0);
    const exitQueuedRef = useRef(false);
    const exitStartedRef = useRef(false);
    const pendingScrollIntentRef = useRef(false);
    const readyRef = useRef(ready);
    const queueRafRef = useRef(0);
    const phaseRafRef = useRef(0);
    const completedRef = useRef(false);
    const reducedMotionRef = useRef(false);
    const cascadeDurationRef = useRef(CASCADE_DURATION_MS);
    const onCompleteRef = useRef(onComplete);
    const onExitStartRef = useRef(onExitStart);
    const onEntranceReadyRef = useRef(onEntranceReady);
    const onRegistrationRevealRef = useRef(onRegistrationReveal);
    const onContentRevealRef = useRef(onContentReveal);
    const entranceReadySentRef = useRef(false);
    const registrationRevealSentRef = useRef(false);
    const contentRevealSentRef = useRef(false);
    const isVisible = portalHost !== null && phase !== "done";

    onCompleteRef.current = onComplete;
    onExitStartRef.current = onExitStart;
    onEntranceReadyRef.current = onEntranceReady;
    onRegistrationRevealRef.current = onRegistrationReveal;
    onContentRevealRef.current = onContentReveal;
    readyRef.current = ready;

    const signalEntranceReady = useCallback(() => {
        if (entranceReadySentRef.current) {
            return;
        }

        entranceReadySentRef.current = true;
        onEntranceReadyRef.current?.();
    }, []);

    const signalContentReveal = useCallback(() => {
        if (contentRevealSentRef.current) {
            return;
        }

        contentRevealSentRef.current = true;
        onContentRevealRef.current?.();
    }, []);

    const signalRegistrationReveal = useCallback(() => {
        if (registrationRevealSentRef.current) {
            return;
        }

        registrationRevealSentRef.current = true;
        onRegistrationRevealRef.current?.();
    }, []);

    const finish = useCallback(() => {
        if (completedRef.current) {
            return;
        }

        completedRef.current = true;
        signalEntranceReady();
        signalRegistrationReveal();
        signalContentReveal();
        if (progressBarRef.current) {
            progressBarRef.current.style.transform = "scaleX(1)";
        }
        loaderRef.current?.setAttribute("aria-valuenow", "100");
        releaseCanvas(canvasRef.current);
        setPhase("done");
        onCompleteRef.current();
    }, [
        signalContentReveal,
        signalEntranceReady,
        signalRegistrationReveal,
    ]);

    const beginExit = useCallback(
        (reason: "automatic" | "scroll-intent" = "automatic") => {
            if (reason === "scroll-intent" && !readyRef.current) {
                pendingScrollIntentRef.current = true;
                return;
            }

            if (
                exitQueuedRef.current ||
                exitStartedRef.current ||
                completedRef.current
            ) {
                return;
            }

            if (reason === "scroll-intent") {
                cascadeDurationRef.current = INTENT_CASCADE_DURATION_MS;
                pendingScrollIntentRef.current = false;
            }

            loaderRef.current?.style.setProperty(
                "--loader-handoff-duration",
                `${Math.round(cascadeDurationRef.current * 0.46)}ms`,
            );

            exitQueuedRef.current = true;
            exitStartedRef.current = true;
            onExitStartRef.current?.();

            if (reducedMotionRef.current) {
                if (progressBarRef.current) {
                    progressBarRef.current.style.transform = "scaleX(1)";
                }
                loaderRef.current?.setAttribute("aria-valuenow", "100");
            } else if (progressBarRef.current) {
                // The intro owns the first 32%; the live cascade continues
                // from that exact value without restarting the progress line.
                progressBarRef.current.style.transform = "scaleX(0.32)";
            }

            queueRafRef.current = window.requestAnimationFrame(() => {
                queueRafRef.current = 0;
                phaseRafRef.current = window.requestAnimationFrame(() => {
                    phaseRafRef.current = 0;
                    exitQueuedRef.current = false;

                    if (completedRef.current) {
                        return;
                    }

                    if (reducedMotionRef.current) {
                        signalEntranceReady();
                        signalRegistrationReveal();
                        signalContentReveal();
                        setPhase("fade");
                    } else {
                        setPhase("cascade");
                    }
                });
            });
        },
        [
            signalContentReveal,
            signalEntranceReady,
            signalRegistrationReveal,
        ],
    );

    useLayoutEffect(() => {
        setPortalHost(document.body);
        mountedAtRef.current = performance.now();
        reducedMotionRef.current = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
    }, []);

    useEffect(() => {
        if (!skipIntro || !portalHost || phase !== "intro") {
            return;
        }

        const elapsed = performance.now() - mountedAtRef.current;

        if (ready) {
            beginExit();
            return;
        }

        const timeout = window.setTimeout(
            beginExit,
            Math.max(0, MAX_READY_WAIT_MS - elapsed),
        );

        return () => window.clearTimeout(timeout);
    }, [beginExit, phase, portalHost, ready, skipIntro]);

    useEffect(() => {
        if (skipIntro || !portalHost || phase !== "intro") {
            return;
        }

        const minimumIntro = reducedMotionRef.current
            ? REDUCED_INTRO_MS
            : MIN_INTRO_MS;
        const elapsed = performance.now() - mountedAtRef.current;

        if (!ready) {
            return;
        }

        const exitReason = pendingScrollIntentRef.current
            ? "scroll-intent"
            : "automatic";
        const timeout = window.setTimeout(
            () => beginExit(exitReason),
            Math.max(0, minimumIntro - elapsed),
        );

        return () => {
            window.clearTimeout(timeout);
        };
    }, [beginExit, phase, portalHost, ready, skipIntro]);

    useEffect(() => {
        if (skipIntro || !portalHost || phase !== "intro" || ready) {
            return;
        }

        const elapsed = performance.now() - mountedAtRef.current;
        const timeout = window.setTimeout(
            beginExit,
            Math.max(0, MAX_READY_WAIT_MS - elapsed),
        );

        return () => window.clearTimeout(timeout);
    }, [beginExit, phase, portalHost, ready, skipIntro]);

    useEffect(() => {
        const canvas = canvasRef.current;

        return () => {
            window.cancelAnimationFrame(queueRafRef.current);
            window.cancelAnimationFrame(phaseRafRef.current);
            releaseCanvas(canvas);
        };
    }, []);

    useLayoutEffect(() => {
        if (!isVisible) {
            return;
        }

        const body = document.body;
        const app = document.getElementById("app");
        const previousBusy = body.getAttribute("aria-busy");
        const previousAriaHidden = app?.getAttribute("aria-hidden") ?? null;
        const previousInert = app?.getAttribute("inert") ?? null;
        const previousPointerEvents = app?.style.pointerEvents ?? "";
        const previousInertProperty = app?.inert ?? false;

        body.setAttribute("aria-busy", "true");

        if (app) {
            app.inert = true;
            app.setAttribute("inert", "");
            app.setAttribute("aria-hidden", "true");
            app.style.pointerEvents = "none";
        }

        return () => {
            if (previousBusy === null) {
                body.removeAttribute("aria-busy");
            } else {
                body.setAttribute("aria-busy", previousBusy);
            }

            if (app) {
                app.inert = previousInertProperty;
                app.style.pointerEvents = previousPointerEvents;

                if (previousInert === null) {
                    app.removeAttribute("inert");
                } else {
                    app.setAttribute("inert", previousInert);
                }

                if (previousAriaHidden === null) {
                    app.removeAttribute("aria-hidden");
                } else {
                    app.setAttribute("aria-hidden", previousAriaHidden);
                }
            }
        };
    }, [isVisible]);

    useEffect(() => {
        if (skipIntro || !isVisible || phase !== "intro") {
            return;
        }

        let touchY: number | null = null;
        const scrollKeys = new Set([
            "ArrowDown",
            "ArrowUp",
            "PageDown",
            "PageUp",
            " ",
            "End",
            "Home",
        ]);
        const activate = () => beginExit("scroll-intent");
        const handleWheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaY) >= 2) {
                activate();
            }
        };
        const handleTouchStart = (event: TouchEvent) => {
            touchY = event.touches[0]?.clientY ?? null;
        };
        const handleTouchMove = (event: TouchEvent) => {
            const nextY = event.touches[0]?.clientY;
            if (
                touchY !== null &&
                nextY !== undefined &&
                Math.abs(nextY - touchY) >= 4
            ) {
                activate();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                !scrollKeys.has(event.key)
            ) {
                return;
            }

            const target = event.target as HTMLElement | null;
            if (
                target?.isContentEditable ||
                target?.matches("input, textarea, select, button, a[href]")
            ) {
                return;
            }

            activate();
        };

        window.addEventListener("wheel", handleWheel, {
            capture: true,
            passive: true,
        });
        window.addEventListener("touchstart", handleTouchStart, {
            capture: true,
            passive: true,
        });
        window.addEventListener("touchmove", handleTouchMove, {
            capture: true,
            passive: true,
        });
        window.addEventListener("keydown", handleKeyDown, true);

        return () => {
            window.removeEventListener("wheel", handleWheel, true);
            window.removeEventListener("touchstart", handleTouchStart, true);
            window.removeEventListener("touchmove", handleTouchMove, true);
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [beginExit, isVisible, phase, skipIntro]);

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (
            !canvas ||
            phase === "done" ||
            (phase !== "intro" && phase !== "fade")
        ) {
            return;
        }

        drawClosedCanvas(canvas);
    }, [phase, portalHost]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || phase === "done") {
            return;
        }

        let animationFrame = 0;
        let resizeFrame = 0;
        let resizePending = false;
        let latestProgress = phase === "cascade" ? 0 : -1;

        const applyResize = () => {
            resizePending = false;
            if (hasCanvasSizeChanged(canvas)) {
                invalidateCanvas(canvas);
            }
        };

        const handleResize = () => {
            resizePending = true;
            if (phase === "cascade" || resizeFrame) {
                return;
            }

            resizeFrame = window.requestAnimationFrame(() => {
                resizeFrame = 0;
                applyResize();
                drawClosedCanvas(canvas);
            });
        };

        window.addEventListener("resize", handleResize, {
            passive: true,
        });
        window.visualViewport?.addEventListener("resize", handleResize, {
            passive: true,
        });

        if (phase === "cascade") {
            const startedAt = performance.now();
            let lastPercentage = -1;

            const render = (now: number) => {
                if (completedRef.current) {
                    return;
                }

                if (resizePending) {
                    applyResize();
                }

                const elapsed = now - startedAt;
                latestProgress = clamp01(elapsed / cascadeDurationRef.current);
                drawCascadeFrame(canvas, latestProgress);

                const visualProgress = 0.32 + latestProgress * 0.68;
                const percentage = Math.round(visualProgress * 100);

                if (elapsed <= 190 && progressBarRef.current) {
                    progressBarRef.current.style.transform = `scaleX(${visualProgress})`;
                }

                if (visualProgress >= ENTRANCE_SYNC_PROGRESS) {
                    signalEntranceReady();
                }

                if (visualProgress >= REGISTRATION_REVEAL_PROGRESS) {
                    signalRegistrationReveal();
                }

                if (visualProgress >= CONTENT_REVEAL_PROGRESS) {
                    signalContentReveal();
                }

                if (percentage !== lastPercentage) {
                    lastPercentage = percentage;

                    loaderRef.current?.setAttribute(
                        "aria-valuenow",
                        `${percentage}`,
                    );
                }

                if (latestProgress >= 1) {
                    finish();
                    return;
                }

                animationFrame = window.requestAnimationFrame(render);
            };

            animationFrame = window.requestAnimationFrame(render);
        }

        return () => {
            window.cancelAnimationFrame(animationFrame);
            window.cancelAnimationFrame(resizeFrame);
            window.removeEventListener("resize", handleResize);
            window.visualViewport?.removeEventListener("resize", handleResize);
        };
    }, [
        finish,
        phase,
        signalContentReveal,
        signalEntranceReady,
        signalRegistrationReveal,
    ]);

    useEffect(() => {
        if (phase === "fade") {
            const timeout = window.setTimeout(finish, REDUCED_FADE_MS);
            return () => window.clearTimeout(timeout);
        }

        if (phase === "cascade") {
            const timeout = window.setTimeout(finish, CASCADE_FALLBACK_MS);
            return () => window.clearTimeout(timeout);
        }
    }, [finish, phase]);

    if (!portalHost || phase === "done") {
        return null;
    }

    return createPortal(
        <div
            ref={loaderRef}
            className={`ubsc-pixel-loader ubsc-pixel-loader--${phase}${skipIntro ? " ubsc-pixel-loader--skip-intro" : ""}`}
            role="progressbar"
            aria-label="Memuat UB Sport Center"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={32}
        >
            <canvas
                ref={canvasRef}
                className="ubsc-pixel-loader__canvas"
                aria-hidden="true"
            />

            {!skipIntro && (
                <>
                    <div
                        className="ubsc-pixel-loader__intro-backdrop"
                        aria-hidden="true"
                    />
                    <div
                        className="ubsc-pixel-loader__intro-grain"
                        aria-hidden="true"
                    />

                    <div
                        className="ubsc-pixel-loader__intro-frame"
                        aria-hidden="true"
                    >
                        <span className="ubsc-pixel-loader__intro-frame-line ubsc-pixel-loader__intro-frame-line--top" />
                        <span className="ubsc-pixel-loader__intro-frame-line ubsc-pixel-loader__intro-frame-line--right" />
                        <span className="ubsc-pixel-loader__intro-frame-line ubsc-pixel-loader__intro-frame-line--bottom" />
                        <span className="ubsc-pixel-loader__intro-frame-line ubsc-pixel-loader__intro-frame-line--left" />
                    </div>

                    <div className="ubsc-pixel-loader__intro-stage">
                        <div className="ubsc-pixel-loader__intro-logo-wrap">
                            <img
                                src="/assets/brand/ubsc-logo-640.webp"
                                alt="UB Sport Center"
                                className="ubsc-pixel-loader__intro-logo"
                                width={640}
                                height={320}
                                decoding="sync"
                                draggable={false}
                                {...{ fetchpriority: "high" }}
                            />
                            <span
                                className="ubsc-pixel-loader__intro-logo-glow"
                                aria-hidden="true"
                            />
                        </div>

                        <span
                            className="ubsc-pixel-loader__intro-line"
                            aria-hidden="true"
                        />

                        <div
                            className="ubsc-pixel-loader__intro-tagline"
                            aria-hidden="true"
                        >
                            {INTRO_TAGLINE_WORDS.map((word, index) => (
                                <span
                                    key={word}
                                    style={
                                        {
                                            "--loader-word-index": index,
                                        } as CSSProperties
                                    }
                                >
                                    {word}
                                </span>
                            ))}
                        </div>

                        <div
                            className="ubsc-pixel-loader__intro-meta"
                            aria-hidden="true"
                        >
                            {INTRO_META_ITEMS.map((item, index) => (
                                <span
                                    key={item}
                                    style={
                                        {
                                            "--loader-meta-index": index,
                                        } as CSSProperties
                                    }
                                >
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div
                        className="ubsc-pixel-loader__intro-progress"
                        aria-hidden="true"
                    >
                        <span ref={progressBarRef} />
                    </div>
                </>
            )}
        </div>,
        portalHost,
    );
}
