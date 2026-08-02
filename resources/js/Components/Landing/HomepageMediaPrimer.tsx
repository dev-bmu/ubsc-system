import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import { useLayoutEffect, useRef } from "react";

type MediaTier = "warm" | "hot";

type NetworkInformationLike = {
    effectiveType?: string;
    saveData?: boolean;
};

type DecodePriority = 0 | 1;

type DecodeJob = {
    image: HTMLImageElement;
    key: string;
    priority: DecodePriority;
    resolve: () => void;
};

const MAX_CONCURRENT_DECODES = 2;
const MAX_REMEMBERED_DECODED_SOURCES = 160;
const DECODE_DEADLINE_MS = 2200;
const decodedSources = new Set<string>();
const pendingDecodePromises = new Map<string, Promise<void>>();
const pendingDecodeJobs = new Map<string, DecodeJob>();
const decodeQueue: DecodeJob[] = [];
let activeDecodeCount = 0;

function imageSourceKey(image: HTMLImageElement) {
    return (
        image.currentSrc ||
        image.getAttribute("src") ||
        image.getAttribute("srcset") ||
        ""
    ).trim();
}

function rememberDecodedSource(key: string) {
    decodedSources.add(key);

    if (decodedSources.size <= MAX_REMEMBERED_DECODED_SOURCES) return;

    const oldestKey = decodedSources.values().next().value;
    if (typeof oldestKey === "string") {
        decodedSources.delete(oldestKey);
    }
}

function runDecodeQueue() {
    while (
        activeDecodeCount < MAX_CONCURRENT_DECODES &&
        decodeQueue.length > 0
    ) {
        let nextIndex = decodeQueue.findIndex((job) => job.priority === 1);
        if (nextIndex < 0) nextIndex = 0;

        const [job] = decodeQueue.splice(nextIndex, 1);
        if (!job) continue;

        pendingDecodeJobs.delete(job.key);

        if (
            imageSourceKey(job.image) !== job.key ||
            !job.image.complete ||
            job.image.naturalWidth <= 0 ||
            typeof job.image.decode !== "function"
        ) {
            pendingDecodePromises.delete(job.key);
            job.resolve();
            continue;
        }

        activeDecodeCount += 1;

        let deadline = 0;
        const decodeResult = job.image
            .decode()
            .then(() => true)
            .catch(() => false);
        const deadlineResult = new Promise<boolean>((resolve) => {
            deadline = window.setTimeout(
                () => resolve(false),
                DECODE_DEADLINE_MS,
            );
        });

        void Promise.race([decodeResult, deadlineResult]).then((decoded) => {
            window.clearTimeout(deadline);
            pendingDecodePromises.delete(job.key);

            if (decoded && imageSourceKey(job.image) === job.key) {
                rememberDecodedSource(job.key);
            }

            activeDecodeCount = Math.max(0, activeDecodeCount - 1);
            job.resolve();
            runDecodeQueue();
        });
    }
}

function requestImageDecode(
    image: HTMLImageElement,
    tier: MediaTier,
): Promise<void> {
    const key = imageSourceKey(image);

    if (
        !key ||
        typeof image.decode !== "function" ||
        !image.complete ||
        image.naturalWidth <= 0
    ) {
        return Promise.resolve();
    }

    if (decodedSources.has(key)) {
        return Promise.resolve();
    }

    const existing = pendingDecodePromises.get(key);
    if (existing) {
        const queuedJob = pendingDecodeJobs.get(key);
        if (queuedJob && tier === "hot") {
            queuedJob.priority = 1;
        }
        return existing;
    }

    let resolveJob: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
        resolveJob = resolve;
    });
    const job: DecodeJob = {
        image,
        key,
        priority: tier === "hot" ? 1 : 0,
        resolve: resolveJob,
    };

    pendingDecodePromises.set(key, promise);
    pendingDecodeJobs.set(key, job);
    decodeQueue.push(job);
    runDecodeQueue();

    return promise;
}

const SECTION_SELECTOR = [
    "main.landing-page-canvas section",
    "main.about-page-canvas section",
    ".home-footer-reveal-root section",
    ".home-footer-reveal-root footer",
].join(", ");

const MEDIA_SELECTOR = "img, video";
const BACKGROUND_CANDIDATE_SELECTOR = [
    "[style*='background']",
    "[class*='background']",
    "[class*='media']",
    "[class*='poster']",
    "[class*='image']",
].join(", ");
const SMOOTH_REVEAL_SELECTOR = [
    "[data-home-media-reveal]",
    "[data-page-media-reveal]",
    "[data-membership-plan-card] .membership-plan-card__media > img",
    ".section-two-object-reveal--media figure img",
    ".sponsor-logo-rail img",
    ".section-three-card-media img",
    "#facility-content img",
    "#facility-classes [id^='class-section-'] img",
    "#facility-outdoor .facility-outdoor-scroller img",
    ".reels-reveal--card > img",
    ".news-card-shell img",
    "#pricing img",
    ".testimonial-slide-reveal--media > img",
    ".testimonial-identity-avatar-reveal img",
    ".about-history-media-bg",
    ".about-history-media-person",
    ".about-service-card-image",
    ".about-vision-image",
    "#about-faq img",
    ".about-contact-media-image",
    "#about-map .section-eight-background img",
    "#about-map .section-eight-entrance-reveal--portrait > img",
    "#about-map .section-eight-popup-media > img",
].join(", ");

const REVEAL_DURATION_MS = 460;
const REVEAL_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function getConnection() {
    return (
        navigator as Navigator & {
            connection?: NetworkInformationLike;
        }
    ).connection;
}

function ownsMedia(section: HTMLElement, media: Element) {
    return media.closest<HTMLElement>("section, footer") === section;
}

function mediaDistanceFromViewport(element: Element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = Math.max(
        document.documentElement.clientWidth,
        window.innerWidth || 0,
    );
    const viewportHeight = Math.max(
        document.documentElement.clientHeight,
        window.innerHeight || 0,
    );

    const horizontalDistance =
        rect.right < 0
            ? -rect.right
            : rect.left > viewportWidth
              ? rect.left - viewportWidth
              : 0;
    const verticalDistance =
        rect.bottom < 0
            ? -rect.bottom
            : rect.top > viewportHeight
              ? rect.top - viewportHeight
              : 0;

    return {
        area: Math.max(0, rect.width) * Math.max(0, rect.height),
        score: verticalDistance * 4 + horizontalDistance,
    };
}

function extractBackgroundUrls(backgroundImage: string) {
    const urls: string[] = [];
    const pattern = /url\((?:"([^"]+)"|'([^']+)'|([^'")]+))\)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(backgroundImage)) !== null) {
        const url = (match[1] ?? match[2] ?? match[3] ?? "").trim();
        if (url && !url.startsWith("data:") && !url.startsWith("blob:")) {
            urls.push(url);
        }
    }

    return urls;
}

/**
 * Starts image/video work shortly before a public landing section is needed.
 *
 * This component intentionally renders nothing. It only coordinates media that
 * belongs to the currently visible section and its nearest neighbours, keeping
 * distant sections lazy.
 */
export default function HomepageMediaPrimer() {
    const entranceReady = useHomepageEntranceReady();
    const entranceReadyRef = useRef(entranceReady);

    useLayoutEffect(() => {
        entranceReadyRef.current = entranceReady;
    }, [entranceReady]);

    useLayoutEffect(() => {
        if (typeof window === "undefined") return;

        const connection = getConnection();
        const constrainedConnection =
            connection?.saveData === true ||
            connection?.effectiveType === "slow-2g" ||
            connection?.effectiveType === "2g";
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const warmImageBudget = constrainedConnection ? 2 : 4;
        const hotImageBudget = constrainedConnection ? 5 : 10;
        const warmBackgroundBudget = constrainedConnection ? 1 : 2;
        const hotBackgroundBudget = constrainedConnection ? 2 : 5;

        const sections = Array.from(
            document.querySelectorAll<HTMLElement>(SECTION_SELECTOR),
        ).filter(
            (section) =>
                section.isConnected &&
                !section.closest("nav") &&
                !section.closest('[role="dialog"]'),
        );

        if (sections.length === 0) return;

        const warmSections = new WeakSet<HTMLElement>();
        const hotSections = new WeakSet<HTMLElement>();
        const unsettledSections = new Set<HTMLElement>(sections);
        const mediaTier = new WeakMap<Element, number>();
        const decodeQueued = new WeakSet<HTMLImageElement>();
        const decodeListeners = new Map<
            HTMLImageElement,
            {
                load: () => void;
                error: () => void;
            }
        >();
        const revealArmed = new WeakSet<HTMLImageElement>();
        const revealGeneration = new WeakMap<HTMLImageElement, number>();
        const revealHolds = new Map<HTMLImageElement, Animation>();
        const revealAnimations = new Map<HTMLImageElement, Animation>();
        const revealListeners = new Map<
            HTMLImageElement,
            {
                load: () => void;
                error: () => void;
            }
        >();
        const fallbackRevealState = new WeakMap<
            HTMLImageElement,
            {
                opacity: string;
                transition: string;
                frame: number;
                timer: number;
            }
        >();
        const fallbackRevealImages = new Set<HTMLImageElement>();
        const backgroundPreloads = new Map<string, HTMLImageElement>();
        const mutationObservers = new Map<HTMLElement, MutationObserver>();

        let disposed = false;
        let sweepFrame = 0;
        const restorationTimers: number[] = [];

        const removeDecodeListeners = (image: HTMLImageElement) => {
            const listeners = decodeListeners.get(image);
            if (!listeners) return;

            image.removeEventListener("load", listeners.load);
            image.removeEventListener("error", listeners.error);
            decodeListeners.delete(image);
        };

        const queueDecode = (image: HTMLImageElement, tier: MediaTier) => {
            if (
                image.classList.contains("ubsc-hero-bg") ||
                typeof image.decode !== "function"
            ) {
                return;
            }

            if (decodeQueued.has(image)) {
                if (
                    tier === "hot" &&
                    image.complete &&
                    image.naturalWidth > 0
                ) {
                    void requestImageDecode(image, "hot");
                }
                return;
            }

            decodeQueued.add(image);

            const decode = () => {
                removeDecodeListeners(image);
                if (disposed || !image.isConnected) return;
                void requestImageDecode(image, tier);
            };
            const error = () => {
                removeDecodeListeners(image);
            };

            if (image.complete) {
                if (image.naturalWidth > 0) decode();
                return;
            }

            decodeListeners.set(image, { load: decode, error });
            image.addEventListener("load", decode, { once: true });
            image.addEventListener("error", error, { once: true });

            // Close the warm-cache race where the resource completes between
            // the synchronous check above and listener registration.
            if (image.complete) {
                if (image.naturalWidth > 0) {
                    decode();
                } else {
                    error();
                }
            }
        };

        const restoreFallbackReveal = (image: HTMLImageElement) => {
            const state = fallbackRevealState.get(image);
            if (!state) return;

            window.cancelAnimationFrame(state.frame);
            window.clearTimeout(state.timer);
            image.style.opacity = state.opacity;
            image.style.transition = state.transition;
            fallbackRevealState.delete(image);
            fallbackRevealImages.delete(image);
        };

        const removeRevealListeners = (image: HTMLImageElement) => {
            const listeners = revealListeners.get(image);
            if (!listeners) return;

            image.removeEventListener("load", listeners.load);
            image.removeEventListener("error", listeners.error);
            revealListeners.delete(image);
        };

        const cancelImageAnimations = (image: HTMLImageElement) => {
            revealHolds.get(image)?.cancel();
            revealHolds.delete(image);
            revealAnimations.get(image)?.cancel();
            revealAnimations.delete(image);
        };

        const armImageReveal = (image: HTMLImageElement) => {
            if (
                reducedMotion ||
                !image.matches(SMOOTH_REVEAL_SELECTOR) ||
                image.classList.contains("ubsc-hero-bg") ||
                image.closest(".ubsc-pixel-loader")
            ) {
                return;
            }

            if (revealArmed.has(image)) return;
            revealArmed.add(image);

            const generation = (revealGeneration.get(image) ?? 0) + 1;
            revealGeneration.set(image, generation);
            removeRevealListeners(image);
            cancelImageAnimations(image);
            restoreFallbackReveal(image);

            const explicitTargetOpacity = Number.parseFloat(
                image.dataset.pageMediaReveal ?? "",
            );
            const initialTargetOpacity = Number.isFinite(explicitTargetOpacity)
                ? explicitTargetOpacity
                : Number.parseFloat(window.getComputedStyle(image).opacity);
            if (
                !Number.isFinite(initialTargetOpacity) ||
                initialTargetOpacity <= 0.015
            ) {
                return;
            }

            const supportsWebAnimations = typeof image.animate === "function";
            const hold = supportsWebAnimations
                ? image.animate([{ opacity: 0.001 }, { opacity: 0.001 }], {
                      duration: 1,
                      easing: "linear",
                      fill: "both",
                  })
                : null;

            if (hold) {
                hold.pause();
                hold.currentTime = 0;
                revealHolds.set(image, hold);
            } else {
                fallbackRevealState.set(image, {
                    opacity: image.style.opacity,
                    transition: image.style.transition,
                    frame: 0,
                    timer: 0,
                });
                fallbackRevealImages.add(image);
                image.style.transition = "none";
                image.style.opacity = "0";
            }

            const resolveTargetOpacity = () => {
                const currentOpacity = Number.parseFloat(
                    window.getComputedStyle(image).opacity,
                );

                return Number.isFinite(currentOpacity) && currentOpacity > 0.015
                    ? currentOpacity
                    : initialTargetOpacity;
            };

            let resolving = false;
            const load = async () => {
                if (
                    resolving ||
                    revealGeneration.get(image) !== generation ||
                    !image.isConnected
                ) {
                    return;
                }
                resolving = true;

                const isStillCovered =
                    !entranceReadyRef.current ||
                    document.querySelector(".ubsc-pixel-loader") !== null;

                /*
                 * If the opaque loader still covers the page, release the
                 * authored image immediately and let decoding finish behind
                 * it. Replaying a 460ms image fade after the loader is exactly
                 * what made cached media look as if it had downloaded again.
                 */
                if (isStillCovered) {
                    removeRevealListeners(image);
                    cancelImageAnimations(image);
                    restoreFallbackReveal(image);
                    void requestImageDecode(image, "warm");
                    return;
                }

                await requestImageDecode(image, "hot");

                if (
                    disposed ||
                    revealGeneration.get(image) !== generation ||
                    !image.isConnected
                ) {
                    return;
                }

                removeRevealListeners(image);

                if (hold) {
                    hold.cancel();
                    revealHolds.delete(image);

                    // Read the authored opacity after releasing the hold, then
                    // start the reveal in the same task so no intermediate
                    // frame can flash. This also tracks entrance animations
                    // that advanced while the image was decoding.
                    const targetOpacity = resolveTargetOpacity();
                    const reveal = image.animate(
                        [{ opacity: 0.001 }, { opacity: targetOpacity }],
                        {
                            duration: REVEAL_DURATION_MS,
                            easing: REVEAL_EASING,
                            fill: "none",
                        },
                    );
                    revealAnimations.set(image, reveal);
                    reveal.addEventListener(
                        "finish",
                        () => {
                            if (revealAnimations.get(image) === reveal) {
                                revealAnimations.delete(image);
                            }
                        },
                        { once: true },
                    );
                    return;
                }

                const state = fallbackRevealState.get(image);
                if (!state) return;

                window.cancelAnimationFrame(state.frame);
                window.clearTimeout(state.timer);
                image.style.opacity = state.opacity;
                image.style.transition = state.transition;
                const targetOpacity = resolveTargetOpacity();

                // All writes happen before the next paint. The following
                // frame only starts the intentional opacity transition.
                image.style.transition = "none";
                image.style.opacity = "0";
                image.style.transition = state.transition
                    ? `${state.transition}, opacity ${REVEAL_DURATION_MS}ms ${REVEAL_EASING}`
                    : `opacity ${REVEAL_DURATION_MS}ms ${REVEAL_EASING}`;
                state.frame = window.requestAnimationFrame(() => {
                    image.style.opacity = `${targetOpacity}`;
                });
                state.timer = window.setTimeout(() => {
                    restoreFallbackReveal(image);
                }, REVEAL_DURATION_MS + 80);
            };

            const error = () => {
                if (revealGeneration.get(image) !== generation) return;
                removeRevealListeners(image);
                cancelImageAnimations(image);
                restoreFallbackReveal(image);
            };

            revealListeners.set(image, { load, error });
            image.addEventListener("load", load, { once: true });
            image.addEventListener("error", error, { once: true });

            // Cached images can finish before React's layout effects attach
            // their listeners. Resolve that path explicitly so the element
            // can never remain parked at opacity 0.001.
            if (image.complete) {
                if (image.naturalWidth > 0) {
                    void load();
                } else {
                    error();
                }
            }
        };

        const preloadBackground = (url: string, tier: MediaTier) => {
            const existing = backgroundPreloads.get(url);
            if (existing) {
                if (tier === "hot") {
                    existing.setAttribute("fetchpriority", "high");
                }
                return;
            }

            const preload = new Image();
            preload.decoding = "async";
            preload.setAttribute(
                "fetchpriority",
                tier === "hot"
                    ? "high"
                    : constrainedConnection
                      ? "low"
                      : "auto",
            );
            backgroundPreloads.set(url, preload);
            preload.src = url;
        };

        const promoteBackgrounds = (
            section: HTMLElement,
            tier: MediaTier,
            scope: ParentNode = section,
        ) => {
            const candidates = [
                ...(scope instanceof HTMLElement ? [scope] : []),
                ...Array.from(
                    scope.querySelectorAll<HTMLElement>(
                        BACKGROUND_CANDIDATE_SELECTOR,
                    ),
                ),
            ]
                .filter((element) => ownsMedia(section, element))
                .map((element) => ({
                    element,
                    ...mediaDistanceFromViewport(element),
                }))
                .filter(({ area }) => area > 256)
                .sort((left, right) => right.area - left.area);

            const budget =
                tier === "hot" ? hotBackgroundBudget : warmBackgroundBudget;
            const urls = new Set<string>();

            for (const { element } of candidates) {
                const backgroundImage =
                    window.getComputedStyle(element).backgroundImage;
                for (const url of extractBackgroundUrls(backgroundImage)) {
                    urls.add(url);
                    preloadBackground(url, tier);
                    if (urls.size >= budget) return;
                }
            }
        };

        const promoteImage = (
            image: HTMLImageElement,
            tier: MediaTier,
            hotIndex: number,
        ) => {
            armImageReveal(image);

            const nextTier = tier === "hot" ? 2 : 1;
            if ((mediaTier.get(image) ?? 0) >= nextTier) return;
            mediaTier.set(image, nextTier);

            image.loading = "eager";

            const priority =
                tier === "hot"
                    ? hotIndex < hotImageBudget
                        ? "high"
                        : "auto"
                    : constrainedConnection
                      ? "low"
                      : "auto";

            image.setAttribute("fetchpriority", priority);
            queueDecode(image, tier);
        };

        const promoteVideo = (video: HTMLVideoElement, tier: MediaTier) => {
            const nextTier = tier === "hot" ? 2 : 1;
            if ((mediaTier.get(video) ?? 0) >= nextTier) return;
            mediaTier.set(video, nextTier);

            video.preload =
                tier === "hot" && !constrainedConnection ? "auto" : "metadata";

            // Calling load() on playing media resets playback. Only wake a
            // genuinely empty, paused element.
            if (
                video.paused &&
                video.networkState === HTMLMediaElement.NETWORK_EMPTY
            ) {
                try {
                    video.load();
                } catch {
                    // Native media loading remains the fallback.
                }
            }
        };

        const promoteMedia = (
            section: HTMLElement,
            tier: MediaTier,
            scope: ParentNode = section,
        ) => {
            const imageBudget =
                tier === "hot" ? hotImageBudget : warmImageBudget;
            const candidates = Array.from(
                scope.querySelectorAll<HTMLImageElement>("img"),
            )
                .filter((image) => ownsMedia(section, image))
                .map((image) => ({
                    image,
                    key:
                        image.currentSrc ||
                        image.getAttribute("src") ||
                        image.getAttribute("srcset") ||
                        "",
                    ...mediaDistanceFromViewport(image),
                }))
                .filter(({ area }) => area > 16)
                .sort((left, right) => {
                    if (left.score !== right.score) {
                        return left.score - right.score;
                    }
                    return right.area - left.area;
                });

            // Arming is cheap and does not start a request. This guarantees
            // that even native lazy-loading or a carousel-driven request never
            // appears as a single-frame hard cut.
            candidates.forEach(({ image }) => armImageReveal(image));

            const selectedKeys = new Set<string>();
            let selectedWithoutSource = 0;

            for (const candidate of candidates) {
                const isNewSource = candidate.key
                    ? !selectedKeys.has(candidate.key)
                    : selectedWithoutSource < imageBudget;

                if (
                    isNewSource &&
                    selectedKeys.size + selectedWithoutSource >= imageBudget
                ) {
                    continue;
                }

                if (candidate.key) {
                    selectedKeys.add(candidate.key);
                } else {
                    selectedWithoutSource += 1;
                }

                promoteImage(
                    candidate.image,
                    tier,
                    selectedKeys.size + selectedWithoutSource - 1,
                );
            }

            Array.from(scope.querySelectorAll<HTMLVideoElement>("video"))
                .filter((video) => ownsMedia(section, video))
                .sort(
                    (left, right) =>
                        mediaDistanceFromViewport(left).score -
                        mediaDistanceFromViewport(right).score,
                )
                .slice(0, tier === "hot" ? 2 : 1)
                .forEach((video) => {
                    promoteVideo(video, tier);
                });

            promoteBackgrounds(section, tier, scope);
        };

        const observeInsertedMedia = (section: HTMLElement) => {
            if (mutationObservers.has(section)) return;

            const observer = new MutationObserver((records) => {
                const tier: MediaTier = hotSections.has(section)
                    ? "hot"
                    : "warm";

                for (const record of records) {
                    if (
                        record.type === "attributes" &&
                        record.target instanceof Element
                    ) {
                        const target = record.target;

                        // Image/video style changes are authored animation
                        // updates (parallax, hover, and this reveal itself).
                        // Treating them as new media creates a decode/reveal
                        // feedback loop, especially in the inline-style
                        // fallback used by older browsers.
                        if (
                            record.attributeName === "style" &&
                            (target instanceof HTMLImageElement ||
                                target instanceof HTMLVideoElement)
                        ) {
                            continue;
                        }

                        mediaTier.delete(target);

                        if (target instanceof HTMLImageElement) {
                            revealArmed.delete(target);
                            removeDecodeListeners(target);
                            decodeQueued.delete(target);
                            promoteImage(target, tier, 0);
                        } else if (target instanceof HTMLVideoElement) {
                            promoteVideo(target, tier);
                        } else {
                            promoteBackgrounds(section, tier, target);
                        }
                    }

                    for (const addedNode of Array.from(record.addedNodes)) {
                        if (!(addedNode instanceof Element)) continue;

                        if (
                            addedNode.matches(MEDIA_SELECTOR) &&
                            ownsMedia(section, addedNode)
                        ) {
                            if (addedNode instanceof HTMLImageElement) {
                                promoteImage(addedNode, tier, 0);
                            } else if (addedNode instanceof HTMLVideoElement) {
                                promoteVideo(addedNode, tier);
                            }
                        }

                        if (addedNode.childElementCount > 0) {
                            promoteMedia(section, tier, addedNode);
                        }
                    }
                }
            });

            observer.observe(section, {
                attributes: true,
                attributeFilter: ["src", "srcset", "poster", "style"],
                childList: true,
                subtree: true,
            });
            mutationObservers.set(section, observer);
        };

        const warmSection = (section: HTMLElement) => {
            if (warmSections.has(section)) return;
            warmSections.add(section);
            promoteMedia(section, "warm");
            observeInsertedMedia(section);
        };

        const heatSection = (section: HTMLElement) => {
            if (hotSections.has(section)) return;

            warmSection(section);
            hotSections.add(section);
            unsettledSections.delete(section);
            promoteMedia(section, "hot");
        };

        const viewportHeight = Math.max(
            document.documentElement.clientHeight,
            window.innerHeight || 0,
        );
        const warmDistance = Math.round(
            viewportHeight * (constrainedConnection ? 0.32 : 1.05),
        );
        const hotDistance = Math.round(
            viewportHeight * (constrainedConnection ? 0.04 : 0.14),
        );

        const warmObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        warmSection(entry.target as HTMLElement);
                        warmObserver.unobserve(entry.target);
                    }
                });
            },
            {
                root: null,
                rootMargin: `${warmDistance}px 0px`,
                threshold: 0,
            },
        );

        const hotObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        heatSection(entry.target as HTMLElement);
                        hotObserver.unobserve(entry.target);
                    }
                });
            },
            {
                root: null,
                rootMargin: `${hotDistance}px 0px`,
                threshold: 0.01,
            },
        );

        sections.forEach((section) => {
            warmObserver.observe(section);
            hotObserver.observe(section);
        });

        const sweep = () => {
            sweepFrame = 0;
            if (disposed || unsettledSections.size === 0) return;

            const height = Math.max(
                document.documentElement.clientHeight,
                window.innerHeight || 0,
            );
            const sweepWarmDistance =
                height * (constrainedConnection ? 0.32 : 1.05);
            const sweepHotDistance =
                height * (constrainedConnection ? 0.04 : 0.14);

            unsettledSections.forEach((section) => {
                if (!section.isConnected) return;

                const rect = section.getBoundingClientRect();
                if (
                    !warmSections.has(section) &&
                    rect.bottom >= -sweepWarmDistance &&
                    rect.top <= height + sweepWarmDistance
                ) {
                    warmSection(section);
                    warmObserver.unobserve(section);
                }

                if (
                    rect.bottom >= -sweepHotDistance &&
                    rect.top <= height + sweepHotDistance
                ) {
                    heatSection(section);
                    hotObserver.unobserve(section);
                }
            });
        };

        const requestSweep = () => {
            if (
                sweepFrame !== 0 ||
                disposed ||
                unsettledSections.size === 0
            ) {
                return;
            }
            sweepFrame = window.requestAnimationFrame(sweep);
        };

        window.addEventListener("scroll", requestSweep, { passive: true });
        window.addEventListener("resize", requestSweep, { passive: true });
        window.addEventListener("orientationchange", requestSweep, {
            passive: true,
        });
        window.addEventListener("pageshow", requestSweep, { passive: true });
        window.addEventListener("load", requestSweep, { passive: true });
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") requestSweep();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Run before the first paint, then cover the delayed scroll restoration
        // phases used by Safari/Chrome during hard refresh and BFCache restore.
        sweep();
        requestSweep();
        restorationTimers.push(
            window.setTimeout(requestSweep, 90),
            window.setTimeout(requestSweep, 260),
        );

        return () => {
            disposed = true;
            warmObserver.disconnect();
            hotObserver.disconnect();
            mutationObservers.forEach((observer) => observer.disconnect());
            mutationObservers.clear();
            revealListeners.forEach((listeners, image) => {
                image.removeEventListener("load", listeners.load);
                image.removeEventListener("error", listeners.error);
            });
            revealListeners.clear();
            decodeListeners.forEach((listeners, image) => {
                image.removeEventListener("load", listeners.load);
                image.removeEventListener("error", listeners.error);
            });
            decodeListeners.clear();
            revealHolds.forEach((animation) => animation.cancel());
            revealHolds.clear();
            revealAnimations.forEach((animation) => animation.cancel());
            revealAnimations.clear();
            fallbackRevealImages.forEach(restoreFallbackReveal);
            fallbackRevealImages.clear();
            backgroundPreloads.clear();

            window.removeEventListener("scroll", requestSweep);
            window.removeEventListener("resize", requestSweep);
            window.removeEventListener("orientationchange", requestSweep);
            window.removeEventListener("pageshow", requestSweep);
            window.removeEventListener("load", requestSweep);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
            restorationTimers.forEach((timer) => window.clearTimeout(timer));

            if (sweepFrame !== 0) {
                window.cancelAnimationFrame(sweepFrame);
            }
        };
    }, []);

    return null;
}
