import { AnimatePresence, motion } from "framer-motion";
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";

const FALLBACK_IMAGE = "/assets/images/comingsoon.avif";
const PREVIEW_MEDIA_QUERY =
    "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PREVIEW_MARGIN = 14;
const CURSOR_GAP = 24;
const FOLLOW_DAMPING = 15;
const LEAVE_DELAY_MS = 90;

const preparedImages = new Map<string, Promise<string | null>>();

export interface BookingCursorPreviewItem {
    id: string;
    image: string;
    title: string;
    code: string;
}

interface PointerPosition {
    x: number;
    y: number;
    pointerType: string;
}

export interface BookingCursorPreviewHandle {
    show: (
        item: BookingCursorPreviewItem,
        pointer: PointerPosition,
    ) => void;
    hide: (immediate?: boolean) => void;
}

interface BookingCursorPreviewProps {
    sources: string[];
}

interface ResolvedPreview extends BookingCursorPreviewItem {
    resolvedImage: string | null;
}

interface Point {
    x: number;
    y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

function prepareImage(source: string): Promise<string | null> {
    const normalizedSource = source || FALLBACK_IMAGE;
    const cached = preparedImages.get(normalizedSource);
    if (cached) return cached;

    const request = new Promise<string | null>((resolve) => {
        const image = new Image();
        image.decoding = "async";

        image.onload = () => {
            const finish = () => resolve(normalizedSource);

            if (typeof image.decode !== "function") {
                finish();
                return;
            }

            void image.decode().then(finish, finish);
        };

        image.onerror = () => {
            if (normalizedSource === FALLBACK_IMAGE) {
                resolve(null);
                return;
            }

            void prepareImage(FALLBACK_IMAGE).then(resolve);
        };

        image.src = normalizedSource;
    });

    preparedImages.set(normalizedSource, request);
    return request;
}

const BookingCursorPreview = forwardRef<
    BookingCursorPreviewHandle,
    BookingCursorPreviewProps
>(function BookingCursorPreview({ sources }, ref) {
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const [isSupported, setIsSupported] = useState(false);
    const [activePreview, setActivePreview] =
        useState<ResolvedPreview | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    const previewRef = useRef<HTMLDivElement>(null);
    const mediaRef = useRef<HTMLDivElement>(null);
    const activePreviewRef = useRef<ResolvedPreview | null>(null);
    const requestedKeyRef = useRef("");
    const requestTokenRef = useRef(0);
    const targetPointerRef = useRef<Point | null>(null);
    const currentPositionRef = useRef<Point>({ x: 0, y: 0 });
    const previewSizeRef = useRef(0);
    const frameRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef(0);
    const leaveTimerRef = useRef<number | null>(null);
    const visibleRef = useRef(false);

    const cancelLeave = useCallback(() => {
        if (leaveTimerRef.current === null) return;
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
    }, []);

    const cancelFollower = useCallback(() => {
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        lastFrameTimeRef.current = 0;
    }, []);

    const getFollowerTarget = useCallback((pointer: Point): Point => {
        const element = previewRef.current;
        if (!element) return pointer;

        const visualViewport = window.visualViewport;
        const viewportLeft = visualViewport?.offsetLeft ?? 0;
        const viewportTop = visualViewport?.offsetTop ?? 0;
        const viewportWidth = visualViewport?.width ?? window.innerWidth;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const viewportRight = viewportLeft + viewportWidth;
        const viewportBottom = viewportTop + viewportHeight;

        let size = previewSizeRef.current;
        if (size <= 0) {
            size = element.getBoundingClientRect().width;
            previewSizeRef.current = size;
        }

        const rightPlacement = pointer.x + CURSOR_GAP;
        const leftPlacement = pointer.x - CURSOR_GAP - size;
        const hasRoomOnRight =
            rightPlacement + size <= viewportRight - PREVIEW_MARGIN;
        const x = clamp(
            hasRoomOnRight ? rightPlacement : leftPlacement,
            viewportLeft + PREVIEW_MARGIN,
            Math.max(
                viewportLeft + PREVIEW_MARGIN,
                viewportRight - size - PREVIEW_MARGIN,
            ),
        );
        const y = clamp(
            pointer.y - size * 0.5,
            viewportTop + PREVIEW_MARGIN,
            Math.max(
                viewportTop + PREVIEW_MARGIN,
                viewportBottom - size - PREVIEW_MARGIN,
            ),
        );

        return { x, y };
    }, []);

    const writePosition = useCallback((point: Point, lag: Point) => {
        if (previewRef.current) {
            previewRef.current.style.transform = `translate3d(${point.x.toFixed(
                2,
            )}px, ${point.y.toFixed(2)}px, 0)`;
        }

        if (mediaRef.current) {
            const parallaxX = clamp(lag.x * -0.035, -5.5, 5.5);
            const parallaxY = clamp(lag.y * -0.035, -5.5, 5.5);
            mediaRef.current.style.transform = `translate3d(${parallaxX.toFixed(
                2,
            )}px, ${parallaxY.toFixed(2)}px, 0) scale(1.06)`;
        }
    }, []);

    const runFollower = useCallback(
        (timestamp: number) => {
            frameRef.current = null;
            const pointer = targetPointerRef.current;

            if (!pointer || !visibleRef.current) {
                lastFrameTimeRef.current = 0;
                return;
            }

            const destination = getFollowerTarget(pointer);
            const current = currentPositionRef.current;
            const deltaTime = lastFrameTimeRef.current
                ? Math.min((timestamp - lastFrameTimeRef.current) / 1000, 0.064)
                : 1 / 60;
            const progress = 1 - Math.exp(-FOLLOW_DAMPING * deltaTime);

            current.x += (destination.x - current.x) * progress;
            current.y += (destination.y - current.y) * progress;
            lastFrameTimeRef.current = timestamp;

            const lag = {
                x: destination.x - current.x,
                y: destination.y - current.y,
            };
            writePosition(current, lag);

            if (Math.abs(lag.x) > 0.08 || Math.abs(lag.y) > 0.08) {
                frameRef.current = window.requestAnimationFrame(runFollower);
                return;
            }

            currentPositionRef.current = destination;
            writePosition(destination, { x: 0, y: 0 });
            lastFrameTimeRef.current = 0;
        },
        [getFollowerTarget, writePosition],
    );

    const scheduleFollower = useCallback(() => {
        if (frameRef.current !== null || !visibleRef.current) return;
        frameRef.current = window.requestAnimationFrame(runFollower);
    }, [runFollower]);

    const snapToPointer = useCallback(
        (pointer: Point) => {
            const destination = getFollowerTarget(pointer);
            currentPositionRef.current = destination;
            writePosition(destination, { x: 0, y: 0 });
        },
        [getFollowerTarget, writePosition],
    );

    const dismiss = useCallback(
        (invalidateRequest = true) => {
            cancelLeave();
            cancelFollower();

            if (invalidateRequest) {
                requestTokenRef.current += 1;
                requestedKeyRef.current = "";
            }

            visibleRef.current = false;
            setIsVisible(false);
        },
        [cancelFollower, cancelLeave],
    );

    const showPreview = useCallback(
        (item: BookingCursorPreviewItem, pointer: PointerPosition) => {
            if (
                !isSupported ||
                pointer.pointerType !== "mouse" ||
                !Number.isFinite(pointer.x) ||
                !Number.isFinite(pointer.y)
            ) {
                return;
            }

            cancelLeave();
            targetPointerRef.current = { x: pointer.x, y: pointer.y };

            if (!visibleRef.current) {
                snapToPointer(targetPointerRef.current);
            } else {
                scheduleFollower();
            }

            const requestKey = `${item.id}:${item.image}`;
            const current = activePreviewRef.current;
            if (
                current?.id === item.id &&
                current.image === item.image
            ) {
                requestedKeyRef.current = requestKey;
                visibleRef.current = true;
                setIsVisible(true);
                scheduleFollower();
                return;
            }

            if (requestedKeyRef.current === requestKey) {
                scheduleFollower();
                return;
            }

            requestedKeyRef.current = requestKey;
            const token = requestTokenRef.current + 1;
            requestTokenRef.current = token;

            void prepareImage(item.image).then((resolvedImage) => {
                if (
                    requestTokenRef.current !== token ||
                    requestedKeyRef.current !== requestKey
                ) {
                    return;
                }

                const resolvedPreview = { ...item, resolvedImage };
                activePreviewRef.current = resolvedPreview;
                setActivePreview(resolvedPreview);
                visibleRef.current = true;
                setIsVisible(true);
                snapToPointer(targetPointerRef.current ?? {
                    x: pointer.x,
                    y: pointer.y,
                });
                scheduleFollower();
            });
        },
        [
            cancelLeave,
            isSupported,
            scheduleFollower,
            snapToPointer,
        ],
    );

    useImperativeHandle(
        ref,
        () => ({
            show: showPreview,
            hide: (immediate = false) => {
                cancelLeave();

                if (immediate) {
                    dismiss();
                    return;
                }

                leaveTimerRef.current = window.setTimeout(() => {
                    leaveTimerRef.current = null;
                    dismiss();
                }, LEAVE_DELAY_MS);
            },
        }),
        [cancelLeave, dismiss, showPreview],
    );

    useEffect(() => {
        setPortalTarget(document.body);

        const hoverQuery = window.matchMedia(PREVIEW_MEDIA_QUERY);
        const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
        const updateSupport = () => {
            const nextSupported = hoverQuery.matches && !motionQuery.matches;
            setIsSupported(nextSupported);
            if (!nextSupported) dismiss();
        };

        updateSupport();
        hoverQuery.addEventListener("change", updateSupport);
        motionQuery.addEventListener("change", updateSupport);

        return () => {
            hoverQuery.removeEventListener("change", updateSupport);
            motionQuery.removeEventListener("change", updateSupport);
        };
    }, [dismiss]);

    useEffect(() => {
        if (!isSupported) return;

        const warmSources = Array.from(new Set(sources.filter(Boolean))).slice(
            0,
            6,
        );
        const timer = window.setTimeout(() => {
            warmSources.forEach((source) => {
                void prepareImage(source);
            });
        }, 160);

        return () => window.clearTimeout(timer);
    }, [isSupported, sources]);

    useEffect(() => {
        if (!isSupported) return;

        const hideForViewportChange = () => dismiss();
        const handleVisibilityChange = () => {
            if (document.hidden) dismiss();
        };
        const handleResize = () => {
            previewSizeRef.current = 0;
            dismiss();
        };

        window.addEventListener("blur", hideForViewportChange);
        window.addEventListener("resize", handleResize, { passive: true });
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("blur", hideForViewportChange);
            window.removeEventListener("resize", handleResize);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, [dismiss, isSupported]);

    useEffect(
        () => () => {
            cancelLeave();
            cancelFollower();
            requestTokenRef.current += 1;
        },
        [cancelFollower, cancelLeave],
    );

    if (!portalTarget || !isSupported) return null;

    return createPortal(
        <div
            ref={previewRef}
            className={`booking-cursor-preview${
                isVisible ? " is-visible" : ""
            }`}
            aria-hidden="true"
        >
            <div className="booking-cursor-preview__frame">
                <div
                    ref={mediaRef}
                    className="booking-cursor-preview__media"
                >
                    <AnimatePresence initial={false}>
                        {activePreview?.resolvedImage ? (
                            <motion.img
                                key={`${activePreview.id}:${activePreview.resolvedImage}`}
                                src={activePreview.resolvedImage}
                                alt=""
                                draggable={false}
                                decoding="async"
                                initial={{ opacity: 0, scale: 1.055 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.985 }}
                                transition={{
                                    duration: 0.18,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                onError={() => {
                                    setActivePreview((current) => {
                                        if (
                                            current?.id !== activePreview.id
                                        ) {
                                            return current;
                                        }

                                        const failedPreview = {
                                            ...current,
                                            resolvedImage: null,
                                        };
                                        activePreviewRef.current =
                                            failedPreview;
                                        return failedPreview;
                                    });
                                }}
                            />
                        ) : (
                            activePreview && (
                                <motion.span
                                    key={`${activePreview.id}:fallback`}
                                    className="booking-cursor-preview__fallback"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <small>
                                        {activePreview.code.replace(/\//g, "")}
                                    </small>
                                    <strong>
                                        {activePreview.title.replace(/^\/+/, "")}
                                    </strong>
                                </motion.span>
                            )
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>,
        portalTarget,
    );
});

export default BookingCursorPreview;
