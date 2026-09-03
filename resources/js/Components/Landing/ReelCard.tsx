import {
    type CSSProperties,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    Maximize2,
    Minimize2,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Volume2,
    VolumeX,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════════
   REEL CARD — Cinematic Video Player with BLOB-BASED SEEKING
   ════════════════════════════════════════════════════════════════════

   Why blob?  The dev/prod server may not support HTTP Range requests.
   Without Range support the browser cannot seek to un-buffered
   positions and falls back to 0.  By fetching the entire file as a
   Blob and playing from a blob: URL the full file is in memory and
   every position is instantly seekable.

   For short reels (≤ 60 s, typically < 10 MB) the download finishes
   in 1–3 seconds.  A spinner is shown during that time.

   ════════════════════════════════════════════════════════════════════ */

export interface ReelItem {
    id: string | number;
    thumbnail?: string;
    title: string;
    date: string;
    videoUrl?: string;
    isActive?: boolean;
}

type WebkitFullscreenVideo = HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean;
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
};

interface ReelCardProps {
    item: ReelItem;
    featured?: boolean;
    active?: boolean;
    priority?: boolean;
    entranceIndex?: number;
    dateLabel?: string;
    dateYear?: string | null;
    onActivate?: () => void;
    onMove?: (direction: number) => void;
    playRequest?: number;
    interactionReady?: boolean;
    fluidSize?: boolean;
}

function fmt(sec: number): string {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ReelCard({
    item,
    featured = false,
    active = featured,
    priority = false,
    entranceIndex = 0,
    dateLabel,
    dateYear,
    onActivate,
    onMove,
    playRequest = 0,
    interactionReady = true,
    fluidSize = false,
}: ReelCardProps) {

    /* ── state ─────────────────────────────────────────────────────── */
    const [blobSrc,      setBlobSrc]      = useState<string | null>(null);
    const [isLoading,    setIsLoading]    = useState(false); // fetching blob
    const [isPlaying,    setIsPlaying]    = useState(false);
    const [isMuted,      setIsMuted]      = useState(false);
    const [isBuffering,  setIsBuffering]  = useState(false);
    const [progress,     setProgress]     = useState(0);     // 0–100
    const [currentTime,  setCurrentTime]  = useState(0);
    const [duration,     setDuration]     = useState(0);
    const [showControls, setShowControls] = useState(false);
    const [thumbVisible, setThumbVisible] = useState(true);
    const [seekFlash,    setSeekFlash]    = useState<"left" | "right" | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    /* ── refs ───────────────────────────────────────────────────────── */
    const videoRef     = useRef<HTMLVideoElement>(null);
    const cardRef      = useRef<HTMLDivElement>(null);
    const scrubBarRef  = useRef<HTMLDivElement>(null);
    const playbackSequenceRef = useRef(0);
    const handledPlayRequestRef = useRef(0);

    const hasStartedRef       = useRef(false); // true after first tap
    const shouldPlayWhenReadyRef = useRef(false);
    const scrubbingRef        = useRef(false);
    const wasPlayingRef       = useRef(false); // was playing before scrub
    const suppressClickRef    = useRef(false);
    const pendingSeekRef      = useRef(0);     // seek delta to apply after metadata loads
    const prevActiveRef       = useRef(active);
    const abortRef            = useRef<AbortController | null>(null);
    const pointerStartRef     = useRef<{ x: number; y: number } | null>(null);
    const dragResetTimerRef   = useRef<number>(0);

    const hideTimer      = useRef<number>(0);
    const tapTimer       = useRef<number>(0);
    const seekFlashTmr   = useRef<number>(0);
    const lastTapTime    = useRef(0);
    const lastTapX       = useRef(0);

    /* ── controls auto-hide ────────────────────────────────────────── */
    const scheduleHide = useCallback(() => {
        window.clearTimeout(hideTimer.current);
        if (scrubbingRef.current) return;
        hideTimer.current = window.setTimeout(() => setShowControls(false), 2600);
    }, []);

    const revealControls = useCallback(() => {
        setShowControls(true);
        scheduleHide();
    }, [scheduleHide]);

    /* ── cleanup ───────────────────────────────────────────────────── */
    useEffect(() => {
        return () => {
            window.clearTimeout(hideTimer.current);
            window.clearTimeout(tapTimer.current);
            window.clearTimeout(seekFlashTmr.current);
            window.clearTimeout(dragResetTimerRef.current);
            abortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        return () => {
            if (blobSrc?.startsWith("blob:")) {
                URL.revokeObjectURL(blobSrc);
            }
        };
    }, [blobSrc]);

    /* ── revoke blob URL on unmount ─────────────────────────────────── */
    /* ── fullscreen sync ──────────────────────────────────────────── */
    useEffect(() => {
        const video = videoRef.current;
        const sync = () => setIsFullscreen(document.fullscreenElement === cardRef.current);
        const beginWebkitFullscreen = () => setIsFullscreen(true);
        const endWebkitFullscreen = () => setIsFullscreen(false);
        document.addEventListener("fullscreenchange", sync);
        video?.addEventListener("webkitbeginfullscreen", beginWebkitFullscreen);
        video?.addEventListener("webkitendfullscreen", endWebkitFullscreen);
        return () => {
            document.removeEventListener("fullscreenchange", sync);
            video?.removeEventListener("webkitbeginfullscreen", beginWebkitFullscreen);
            video?.removeEventListener("webkitendfullscreen", endWebkitFullscreen);
        };
    }, []);

    /* ── deactivation ─────────────────────────────────────────────── */
    useEffect(() => {
        const was = prevActiveRef.current;
        prevActiveRef.current = active;
        if (was && !active) {
            const fullscreenVideo = videoRef.current as WebkitFullscreenVideo | null;
            if (document.fullscreenElement === cardRef.current) {
                void document.exitFullscreen?.();
            } else if (fullscreenVideo?.webkitDisplayingFullscreen) {
                fullscreenVideo.webkitExitFullscreen?.();
            }
            abortRef.current?.abort();
            abortRef.current = null;
            shouldPlayWhenReadyRef.current = false;
            playbackSequenceRef.current += 1;
            window.clearTimeout(tapTimer.current);
            lastTapTime.current = 0;
            if (!blobSrc) {
                hasStartedRef.current = false;
                setIsLoading(false);
                setIsBuffering(false);
            }
            const video = videoRef.current;
            video?.pause();
            if (video) {
                try {
                    video.currentTime = 0;
                } catch {
                    // The element may not have loaded metadata yet.
                }
            }
            setCurrentTime(0);
            setProgress(0);
            setIsPlaying(false);
            setThumbVisible(true);
        }
    }, [active, blobSrc]);

    /* ── auto-pause off-screen ────────────────────────────────────── */
    useEffect(() => {
        const el = cardRef.current;
        if (!el || !("IntersectionObserver" in window)) return;
        const io = new IntersectionObserver(
            ([e]) => { if (e && !e.isIntersecting) videoRef.current?.pause(); },
            { threshold: 0.5 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    const runAfterCardTransition = useCallback(
        (task: () => void) => {
            const sequence = ++playbackSequenceRef.current;
            requestAnimationFrame(() => {
                const run = () => {
                    if (sequence === playbackSequenceRef.current && active) task();
                };
                const card = cardRef.current;
                if (!card) return;
                const animations = card
                    .getAnimations()
                    .filter((animation) => animation.playState !== "finished");

                if (animations.length === 0) {
                    run();
                    return;
                }

                void Promise.all(
                    animations.map((animation) =>
                        animation.finished.catch(() => undefined),
                    ),
                ).then(run);
            });
        },
        [active],
    );

    /* ═══════════════════════════════════════════════════════════════
       START VIDEO — fetch as blob, then play from blob URL
       ═══════════════════════════════════════════════════════════════ */
    const startVideo = useCallback(() => {
        shouldPlayWhenReadyRef.current = true;
        if (hasStartedRef.current) {
            // Already loaded → just resume
            runAfterCardTransition(() => {
                void videoRef.current?.play().catch(() => {});
            });
            return;
        }
        hasStartedRef.current = true;
        const url = item.videoUrl;
        if (!url) return;

        setIsLoading(true);
        setIsBuffering(true);
        runAfterCardTransition(() => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            fetch(url, { signal: controller.signal })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(
                            `Video request failed: ${response.status}`,
                        );
                    }
                    return response.blob();
                })
                .then((blob) => {
                    if (controller.signal.aborted) return;
                    setBlobSrc(URL.createObjectURL(blob));
                })
                .catch(() => {
                    if (controller.signal.aborted) return;
                    setBlobSrc(url);
                });
        });
    }, [item.videoUrl, runAfterCardTransition]);

    /* ── auto-play once blobSrc is set ───────────────────────────── */
    useEffect(() => {
        if (!blobSrc || !shouldPlayWhenReadyRef.current) return;
        const vid = videoRef.current;
        if (!vid) return;
        const t = window.setTimeout(() => {
            if (active && shouldPlayWhenReadyRef.current) {
                void vid.play().catch(() => setIsBuffering(false));
            }
        }, 60);
        return () => window.clearTimeout(t);
    }, [active, blobSrc]);

    useEffect(() => {
        if (
            !playRequest ||
            playRequest === handledPlayRequestRef.current
        ) {
            return;
        }
        handledPlayRequestRef.current = playRequest;
        const video = videoRef.current;
        if (video) video.muted = false;
        setIsMuted(false);
        startVideo();
    }, [playRequest, startVideo]);

    /* ═══════════════════════════════════════════════════════════════
       SEEK — guaranteed to work because blob is fully in memory
       ═══════════════════════════════════════════════════════════════ */
    const seekToTime = useCallback((seconds: number) => {
        const vid = videoRef.current;
        if (!vid || !isFinite(vid.duration) || vid.duration <= 0) return;
        const clamped = Math.max(0, Math.min(vid.duration - 0.1, seconds));
        vid.currentTime = clamped;
        setCurrentTime(clamped);
        setProgress((clamped / vid.duration) * 100);
        setShowControls(true);
        if (!scrubbingRef.current) scheduleHide();
    }, [scheduleHide]);

    const seekBySeconds = useCallback((delta: number) => {
        const vid = videoRef.current;
        if (!vid || !isFinite(vid.duration) || vid.duration <= 0) {
            pendingSeekRef.current += delta;
            return;
        }
        seekToTime(vid.currentTime + delta);
    }, [seekToTime]);

    /* ── scrub bar pointer handlers ──────────────────────────────── */
    const seekFromPointer = useCallback((clientX: number, bar: Element) => {
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const vid = videoRef.current;
        if (!vid || !isFinite(vid.duration) || vid.duration <= 0) return;
        const t = ratio * vid.duration;
        vid.currentTime = t;
        setCurrentTime(t);
        setProgress(ratio * 100);
    }, []);

    const onScrubDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        suppressClickRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubbingRef.current = true;
        wasPlayingRef.current = Boolean(videoRef.current && !videoRef.current.paused);
        videoRef.current?.pause();
        window.clearTimeout(hideTimer.current);
        setShowControls(true);
        seekFromPointer(e.clientX, e.currentTarget);
    }, [seekFromPointer]);

    const onScrubMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!scrubbingRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        seekFromPointer(e.clientX, e.currentTarget);
    }, [seekFromPointer]);

    const onScrubUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (!scrubbingRef.current) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        scrubbingRef.current = false;
        if (wasPlayingRef.current) {
            void videoRef.current?.play().catch(() => {});
        }
        wasPlayingRef.current = false;
        scheduleHide();
        window.setTimeout(() => { suppressClickRef.current = false; }, 60);
    }, [scheduleHide]);

    /* ── seek flash indicator ─────────────────────────────────────── */
    const flashSeek = useCallback((dir: "left" | "right") => {
        setSeekFlash(dir);
        window.clearTimeout(seekFlashTmr.current);
        seekFlashTmr.current = window.setTimeout(() => setSeekFlash(null), 600);
    }, []);

    /* ── toggle play/pause ────────────────────────────────────────── */
    const togglePlayback = useCallback(() => {
        if (!interactionReady) {
            onActivate?.();
            revealControls();
            return;
        }
        if (!hasStartedRef.current) { startVideo(); return; }
        const vid = videoRef.current;
        if (!vid) return;
        if (vid.paused) {
            if (!active) {
                startVideo();
                revealControls();
                return;
            }
            if (vid.ended) vid.currentTime = 0;
            void vid.play().catch(() => setIsBuffering(false));
        } else {
            vid.pause();
        }
        revealControls();
    }, [active, interactionReady, onActivate, revealControls, startVideo]);

    /* ── fullscreen ───────────────────────────────────────────────── */
    const toggleFullscreenFromCard = useCallback(() => {
        const card = cardRef.current;
        const vid = videoRef.current as WebkitFullscreenVideo | null;
        if (document.fullscreenElement === card) void document.exitFullscreen?.();
        else if (vid?.webkitDisplayingFullscreen) vid.webkitExitFullscreen?.();
        else if (card?.requestFullscreen) void card.requestFullscreen();
        else vid?.webkitEnterFullscreen?.();
        revealControls();
    }, [revealControls]);

    const toggleFullscreen = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        toggleFullscreenFromCard();
    }, [toggleFullscreenFromCard]);

    const handleCardTap = useCallback((clientX: number) => {
        const now = Date.now();

        if (!active || !interactionReady) {
            lastTapTime.current = 0;
            onActivate?.();
            return;
        }

        if (now - lastTapTime.current < 280 && Math.abs(clientX - lastTapX.current) < 120) {
            window.clearTimeout(tapTimer.current);
            lastTapTime.current = 0;
            const rect = cardRef.current?.getBoundingClientRect();
            const isRight = rect ? clientX > rect.left + (rect.width * 0.65) : true;
            const isLeft = rect ? clientX < rect.left + (rect.width * 0.35) : false;

            if (!isLeft && !isRight) {
                toggleFullscreenFromCard();
                return;
            }

            const delta = isRight ? 10 : -10;
            seekBySeconds(delta);
            if (!hasStartedRef.current) startVideo();
            flashSeek(isRight ? "right" : "left");
            return;
        }

        lastTapTime.current = now;
        lastTapX.current = clientX;
        window.clearTimeout(tapTimer.current);
        tapTimer.current = window.setTimeout(() => {
            lastTapTime.current = 0;
            togglePlayback();
        }, 280);
    }, [active, flashSeek, interactionReady, onActivate, seekBySeconds, startVideo, toggleFullscreenFromCard, togglePlayback]);

    /* ── single / double tap ──────────────────────────────────────── */
    /* ── keyboard ─────────────────────────────────────────────────── */
    const handleKeyboard = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault(); e.stopPropagation();
            onMove?.(e.key === "ArrowRight" ? 1 : -1);
        }
    }, [onMove]);

    /* ── mute ─────────────────────────────────────────────────────── */
    const toggleMute = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const vid = videoRef.current;
        if (!vid) return;
        vid.muted = !vid.muted;
        setIsMuted(vid.muted);
        revealControls();
    }, [revealControls]);

    /* ── video events ─────────────────────────────────────────────── */
    const onTimeUpdate = useCallback(() => {
        if (scrubbingRef.current) return; // never override user's scrub
        const vid = videoRef.current;
        if (!vid) return;
        setCurrentTime(vid.currentTime);
        if (vid.duration > 0) setProgress((vid.currentTime / vid.duration) * 100);
    }, []);

    const onLoadedMetadata = useCallback(() => {
        const vid = videoRef.current;
        if (!vid || !isFinite(vid.duration) || vid.duration <= 0) return;
        setDuration(vid.duration);

        // Apply pending seek from double-tap before video was loaded
        const delta = pendingSeekRef.current;
        pendingSeekRef.current = 0;
        if (delta !== 0) {
            const next = Math.max(0, Math.min(vid.duration - 0.1, vid.currentTime + delta));
            vid.currentTime = next;
            setCurrentTime(next);
            setProgress((next / vid.duration) * 100);
        }
    }, []);

    const onWaiting  = useCallback(() => setIsBuffering(true), []);
    const onCanPlay  = useCallback(() => {
        setIsLoading(false);
        setIsBuffering(false);
    }, []);
    const onPlaying  = useCallback(() => {
        setIsPlaying(true);
        setIsBuffering(false);
        window.setTimeout(() => setThumbVisible(false), 180);
        revealControls();
    }, [revealControls]);
    const onPause    = useCallback(() => { setIsPlaying(false); revealControls(); }, [revealControls]);
    const onEnded    = useCallback(() => {
        const vid = videoRef.current;
        if (active && vid) {
            vid.currentTime = 0;
            setCurrentTime(0);
            setProgress(0);
            void vid.play().catch(() => setIsPlaying(false));
            return;
        }
        setIsPlaying(false);
        if (vid) { setCurrentTime(vid.duration); setProgress(100); }
        setShowControls(true);
        window.clearTimeout(hideTimer.current);
    }, [active]);

    useEffect(() => {
        const releasePointer = () => {
            pointerStartRef.current = null;
            if (!suppressClickRef.current) return;
            window.clearTimeout(dragResetTimerRef.current);
            dragResetTimerRef.current = window.setTimeout(() => {
                suppressClickRef.current = false;
            }, 0);
        };

        window.addEventListener("pointerup", releasePointer, true);
        window.addEventListener("pointercancel", releasePointer, true);
        return () => {
            window.removeEventListener("pointerup", releasePointer, true);
            window.removeEventListener("pointercancel", releasePointer, true);
        };
    }, []);

    /* ── size ──────────────────────────────────────────────────────── */
    const sizeClass = fluidSize
        ? "h-full w-full"
        : active
          ? "h-[283px] w-[165px] sm:h-[598px] sm:w-[345px] xl:h-[604px] xl:w-[360px]"
          : "h-[238px] w-[140px] sm:h-[486px] sm:w-[280px] xl:h-[551px] xl:w-[328px]";

    const ctrlVisible = showControls || !isPlaying;

    /* ═════════════════════════  RENDER  ═════════════════════════════ */
    return (
        <div
            ref={cardRef}
            tabIndex={0}
            role="group"
            aria-label={`${item.title}. Tekan panah kiri atau kanan untuk memilih video lain.`}
            className={[
                "reels-reveal reels-reveal--card group relative flex-shrink-0 cursor-pointer select-none",
                "overflow-hidden rounded-[5px] bg-neutral-900 xl:rounded-[10px]",
                fluidSize
                    ? "transition-[box-shadow,border-radius] duration-500 ease-out"
                    : "transition-[width,height,box-shadow,border-radius] duration-[620ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                sizeClass,
            ].join(" ")}
            style={{
                "--reel-delay": `${390 + entranceIndex * 85}ms`,
            } as CSSProperties}
            onClick={(e) => {
                e.stopPropagation();
                if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                handleCardTap(e.clientX);
            }}
            onPointerDownCapture={(event) => {
                const target = event.target;
                if (
                    target instanceof Element &&
                    target.closest("[data-reel-control]")
                ) {
                    return;
                }
                pointerStartRef.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerMoveCapture={(event) => {
                const start = pointerStartRef.current;
                if (!start) return;
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
                    suppressClickRef.current = true;
                }
            }}
            onPointerUpCapture={() => {
                pointerStartRef.current = null;
                if (!suppressClickRef.current) return;
                window.clearTimeout(dragResetTimerRef.current);
                dragResetTimerRef.current = window.setTimeout(() => {
                    suppressClickRef.current = false;
                }, 0);
            }}
            onPointerCancelCapture={() => {
                pointerStartRef.current = null;
                suppressClickRef.current = false;
            }}
            onMouseMove={revealControls}
            onMouseEnter={revealControls}
            onMouseLeave={() => { if (!scrubbingRef.current) scheduleHide(); }}
            onKeyDown={handleKeyboard}
        >
            {/* ── Video element ── */}
            {item.videoUrl && (
                <video
                    ref={videoRef}
                    src={blobSrc ?? undefined}
                    playsInline
                    controls={false}
                    muted={isMuted}
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover"
                    onTimeUpdate={onTimeUpdate}
                    onLoadedMetadata={onLoadedMetadata}
                    onWaiting={onWaiting}
                    onCanPlay={onCanPlay}
                    onSeeked={onCanPlay}
                    onPlaying={onPlaying}
                    onPause={onPause}
                    onEnded={onEnded}
                />
            )}

            {/* ── Thumbnail ── */}
            {item.thumbnail && (
                <img
                    src={item.thumbnail}
                    alt={item.title}
                    loading={priority ? "eager" : "lazy"}
                    decoding="async"
                    {...{
                        fetchpriority: priority ? "high" : "low",
                    }}
                    width={720}
                    height={1280}
                    draggable={false}
                    className={[
                        "pointer-events-none absolute inset-0 h-full w-full object-cover",
                        "transition-opacity duration-[800ms] ease-in-out",
                        thumbVisible ? "opacity-100" : "opacity-0",
                    ].join(" ")}
                />
            )}

            {/* ── Date label ── */}
            {dateLabel && (
                <div className="pointer-events-none absolute bottom-[12px] right-[12px] z-20 text-right font-bdo text-[8px] uppercase tracking-[0.08em] text-white/55 sm:bottom-[14px] sm:right-[14px] sm:text-[9px]">
                    {dateLabel}
                    {dateYear && <span className="ml-1 font-light text-white/30">{dateYear}</span>}
                </div>
            )}

            {/* ── Vignette + bottom gradient ── */}
            <div
                className="pointer-events-none absolute inset-0 z-[5]"
                style={{ background: "radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,0.16) 100%)" }}
                aria-hidden="true"
            />
            <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 z-[6] h-28"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.04) 68%, transparent 100%)" }}
                aria-hidden="true"
            />

            {/* ── Seek flash: LEFT −10s ── */}
            <div className={[
                "pointer-events-none absolute inset-y-0 left-0 z-40 flex w-1/2 items-center justify-center transition-opacity duration-200",
                seekFlash === "left" ? "opacity-100" : "opacity-0",
            ].join(" ")}>
                <div className="flex flex-col items-center gap-1 rounded-full bg-black/60 px-3.5 py-3">
                    <RotateCcw size={16} className="text-white" strokeWidth={1.8} />
                    <span className="font-bdo text-[9px] font-semibold text-white">10s</span>
                </div>
            </div>

            {/* ── Seek flash: RIGHT +10s ── */}
            <div className={[
                "pointer-events-none absolute inset-y-0 right-0 z-40 flex w-1/2 items-center justify-center transition-opacity duration-200",
                seekFlash === "right" ? "opacity-100" : "opacity-0",
            ].join(" ")}>
                <div className="flex flex-col items-center gap-1 rounded-full bg-black/60 px-3.5 py-3">
                    <RotateCw size={16} className="text-white" strokeWidth={1.8} />
                    <span className="font-bdo text-[9px] font-semibold text-white">10s</span>
                </div>
            </div>

            {/* ── Center play/pause / loading spinner ── */}
            <div className={[
                "pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                ctrlVisible ? "opacity-100 scale-100" : "opacity-0 scale-110",
            ].join(" ")}>
                {(isBuffering || isLoading) ? (
                    <div className="h-10 w-10 animate-spin rounded-full border-[2.5px] border-white/20 border-t-white/90" />
                ) : (
                    <div className={[
                        "flex h-14 w-14 items-center justify-center text-white drop-shadow-[0_2px_9px_rgba(0,0,0,0.36)] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-16 sm:w-16",
                        ctrlVisible ? "scale-100 opacity-100" : "scale-75 opacity-0",
                    ].join(" ")}>
                        {isPlaying
                            ? <Pause size={active ? 34 : 28} fill="white" />
                            : <Play  size={active ? 38 : 32} fill="white" strokeWidth={1.5} className="ml-1" />
                        }
                    </div>
                )}
            </div>

            {/* ── Mute button ── */}
            <button
                type="button"
                data-reel-control
                aria-label={isMuted ? "Aktifkan suara" : "Matikan suara"}
                onClick={toggleMute}
                className={[
                    "absolute right-2.5 top-2.5 z-30 flex h-8 w-8 items-center justify-center rounded-full",
                    "bg-black/40 ring-1 ring-white/10 transition-[opacity,transform,background-color] duration-300",
                    blobSrc && ctrlVisible ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1.5",
                ].join(" ")}
            >
                {isMuted ? <VolumeX size={13} className="text-white/65" /> : <Volume2 size={13} className="text-white/65" />}
            </button>

            {/* ══════════════════════════════════════════════════════════
                BOTTOM CONTROLS — only after blob is loaded
                ══════════════════════════════════════════════════════════ */}
            {blobSrc && (
                <div
                    data-reel-control
                    className={[
                        "absolute bottom-0 left-0 right-0 z-30 px-3 pb-3",
                        "transition-[opacity,transform] duration-300 ease-out",
                        ctrlVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5",
                    ].join(" ")}
                >
                    {/* Row: play + time + fullscreen */}
                    <div data-reel-control className="mb-1.5 flex items-center gap-2 text-white">
                        <button
                            type="button"
                            data-reel-control
                            aria-label={isPlaying ? "Jeda" : "Putar"}
                            onClick={(e) => { e.stopPropagation(); togglePlayback(); }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                        >
                            {isPlaying
                                ? <Pause size={12} fill="currentColor" />
                                : <Play  size={13} fill="currentColor" className="ml-px" />
                            }
                        </button>
                        <span className="font-bdo text-[9px] font-medium tabular-nums text-white/65">{fmt(currentTime)}</span>
                        <span className="font-bdo text-[9px] text-white/25">/</span>
                        <span className="font-bdo text-[9px] font-medium tabular-nums text-white/35">{fmt(duration)}</span>
                        <button
                            type="button"
                            data-reel-control
                            aria-label={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
                            onClick={toggleFullscreen}
                            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                        </button>
                    </div>

                    {/* ────────────────────────────────────────────────
                        CUSTOM DIV SCRUB BAR
                        • setPointerCapture → all move/up stay on bar
                        • touchAction:none → no browser scroll
                        • stopPropagation → Embla can't steal drag
                        ──────────────────────────────────────────────── */}
                    <div
                        ref={scrubBarRef}
                        data-reel-control
                        role="slider"
                        aria-label="Posisi video"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress)}
                        className="relative h-[3px] w-full cursor-pointer rounded-full bg-white/15 transition-[height] duration-150 hover:h-[5px]"
                        style={{ touchAction: "none" }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={onScrubDown}
                        onPointerMove={onScrubMove}
                        onPointerUp={onScrubUp}
                        onPointerCancel={(e) => {
                            e.stopPropagation();
                            scrubbingRef.current = false;
                            wasPlayingRef.current = false;
                            scheduleHide();
                        }}
                    >
                        {/* Fill */}
                        <div
                            className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white/85"
                            style={{ width: `${progress}%` }}
                        />
                        {/* Thumb dot */}
                        <div
                            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md"
                            style={{ left: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ── Tap hint ── */}
        </div>
    );
}
