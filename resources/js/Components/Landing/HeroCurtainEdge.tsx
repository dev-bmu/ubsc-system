import { useEffect, useRef } from "react";

const CURTAIN_STEPS = [100, 76, 52, 64, 88] as const;

export default function HeroCurtainEdge({
    postFlowSelector,
}: {
    postFlowSelector?: string;
}) {
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        const section = root?.closest("section") as HTMLElement | null;
        const content = section?.querySelector<HTMLElement>(
            ".section-two-curtain-content",
        );
        const postFlow = postFlowSelector
            ? document.querySelector<HTMLElement>(postFlowSelector)
            : null;
        const steps = Array.from(
            root?.querySelectorAll<HTMLElement>(
                ".section-two-curtain-edge__step",
            ) ?? [],
        );

        if (!root || !section || !content || steps.length === 0) return;

        let frame = 0;
        let disposed = false;
        let needsMeasure = true;
        let isNear = true;
        let viewportWidth = 1;
        let viewportHeight = 1;
        let sectionTop = 0;
        let followStart = 0.22;
        let followHold = 0.62;
        let maxFollow = 0;
        let lightweightCurtain = false;
        let renderedTravel = 0;
        let hasRenderedTravel = false;
        let lastFrameTime = 0;
        let lastTravel = -1;
        const lastStepScales = steps.map(() => -1);
        let lastFollow = Number.NaN;
        let postFlowReleased = false;
        const previousSection = section.previousElementSibling;
        const isIOSWebKit =
            /iP(?:hone|ad|od)/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

        // Remove inline state left behind by hot reloads of the legacy,
        // nested-transform implementation before taking the first measure.
        postFlow?.style.removeProperty("transform");
        postFlow?.style.removeProperty("margin-top");
        postFlow?.style.removeProperty("will-change");

        const measure = () => {
            viewportWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;

            // Let 100svh resolve again after a real width/orientation change.
            // Height-only Safari resize events are filtered before this point.
            root.style.removeProperty("height");
            viewportHeight =
                root.offsetHeight ||
                document.documentElement.clientHeight ||
                window.innerHeight ||
                1;
            sectionTop =
                section.getBoundingClientRect().top +
                Math.max(
                    0,
                    window.scrollY || document.documentElement.scrollTop || 0,
                );

            const mobile = viewportWidth < 640;
            const tabletPortrait =
                viewportWidth >= 640 &&
                viewportWidth < 1180 &&
                viewportHeight > viewportWidth;
            const tabletLandscape =
                viewportWidth >= 900 &&
                viewportWidth < 1440 &&
                viewportHeight <= viewportWidth;
            const followRatio = mobile
                ? 0.72
                : tabletPortrait
                  ? 0.68
                  : tabletLandscape
                    ? 0.7
                    : 0.78;
            const followInset = mobile
                ? 150
                : tabletPortrait
                  ? 190
                  : tabletLandscape
                    ? 170
                    : 124;

            followStart = mobile
                ? 0.18
                : tabletPortrait || tabletLandscape
                  ? 0.2
                  : 0.22;
            followHold = mobile
                ? 0.58
                : tabletPortrait || tabletLandscape
                  ? 0.6
                  : 0.62;

            const holdShape = Math.sin(followHold * Math.PI);
            const measuredMaxFollow =
                Math.max(
                    0,
                    followHold * viewportHeight * followRatio - followInset,
                ) * Math.pow(holdShape, 0.68);
            const nextLightweightCurtain =
                isIOSWebKit && viewportWidth < 1180;

            if (nextLightweightCurtain !== lightweightCurtain) {
                hasRenderedTravel = false;
                lastFrameTime = 0;
            }

            lightweightCurtain = nextLightweightCurtain;
            maxFollow = lightweightCurtain ? 0 : measuredMaxFollow;

            root.style.height = `${viewportHeight}px`;
            needsMeasure = false;
        };

        const update = (now = window.performance.now()) => {
            frame = 0;
            if (!isNear && !needsMeasure) return;
            if (needsMeasure) measure();

            const scrollTop = Math.max(
                0,
                window.scrollY || document.documentElement.scrollTop || 0,
            );
            const sectionViewportTop = sectionTop - scrollTop;
            const rawTargetTravel = Math.min(
                1,
                Math.max(
                    0,
                    (viewportHeight - sectionViewportTop) / viewportHeight,
                ),
            );
            const targetTravel = scrollTop <= 1 ? 0 : rawTargetTravel;
            let travel = targetTravel;

            if (lightweightCurtain) {
                if (!hasRenderedTravel) {
                    renderedTravel = travel;
                    hasRenderedTravel = true;
                } else {
                    const elapsed =
                        lastFrameTime > 0 && now - lastFrameTime < 80
                            ? Math.max(1, now - lastFrameTime)
                            : 1000 / 60;
                    const difference = travel - renderedTravel;

                    if (Math.abs(difference) <= 0.00012) {
                        renderedTravel = travel;
                    } else {
                        // Native momentum scrolling on WebKit can publish scroll
                        // events unevenly. Continue sampling scrollY every frame
                        // and only interpolate the small gap between samples.
                        const response = difference > 0 ? 46 : 40;
                        const blend = 1 - Math.exp((-response * elapsed) / 1000);
                        renderedTravel += difference * blend;
                    }
                }

                travel = Math.min(1, Math.max(0, renderedTravel));
            } else {
                renderedTravel = travel;
                hasRenderedTravel = true;
            }

            lastFrameTime = now;
            const shape = Math.sin(travel * Math.PI);

            if (Math.abs(travel - lastTravel) > 0.00008) {
                const pixelRatio = Math.min(3, window.devicePixelRatio || 1);
                steps.forEach((step, index) => {
                    const minimumHeight = CURTAIN_STEPS[index] / 100;
                    const shapeScale = 1 - shape * (1 - minimumHeight);
                    let scale = travel * shapeScale;

                    if (lightweightCurtain) {
                        const visibleHeight = scale * viewportHeight;
                        scale =
                            Math.round(visibleHeight * pixelRatio) /
                            pixelRatio /
                            viewportHeight;
                    }

                    if (Math.abs(scale - lastStepScales[index]) <= 0.00004) {
                        return;
                    }

                    step.style.transform = `translate3d(0, 0, 0) scaleY(${scale})`;
                    lastStepScales[index] = scale;
                });
                lastTravel = travel;
            }

            const progress = Math.min(
                1,
                Math.max(0, (travel - followStart) / (followHold - followStart)),
            );
            const eased = progress * progress * (3 - 2 * progress);
            const rawFollow = -maxFollow * eased;
            const pixelRatio = Math.min(3, window.devicePixelRatio || 1);
            const follow = Math.round(rawFollow * pixelRatio) / pixelRatio;
            const followChanged =
                !Number.isFinite(lastFollow) ||
                Math.abs(follow - lastFollow) > 0.05;

            if (followChanged) {
                if (lightweightCurtain) {
                    content.style.removeProperty("transform");
                    content.style.removeProperty("will-change");
                } else {
                    content.style.transform = `translate3d(0, ${follow}px, 0)`;
                    if (progress > 0.001 && progress < 0.999) {
                        content.style.willChange = "transform";
                    } else {
                        content.style.removeProperty("will-change");
                    }
                }
                lastFollow = follow;
            }

            if (postFlow) {
                if (lightweightCurtain) {
                    postFlow.style.removeProperty("transform");
                    postFlow.style.removeProperty("margin-top");
                    postFlow.style.removeProperty("will-change");
                    postFlowReleased = false;
                } else if (progress >= 0.999) {
                    if (!postFlowReleased || followChanged) {
                        postFlow.style.removeProperty("transform");
                        postFlow.style.marginTop = `${follow}px`;
                    }
                    postFlowReleased = true;
                } else {
                    const modeChanged = postFlowReleased;
                    if (modeChanged) {
                        postFlow.style.removeProperty("margin-top");
                    }
                    if (modeChanged || followChanged) {
                        postFlow.style.willChange = "transform";
                        postFlow.style.transform = `translate3d(0, ${follow}px, 0)`;
                    }
                    postFlowReleased = false;
                }

                if (progress <= 0.001 || progress >= 0.999) {
                    postFlow.style.removeProperty("will-change");
                }
            }

            if (
                lightweightCurtain &&
                Math.abs(targetTravel - renderedTravel) > 0.00012
            ) {
                frame = window.requestAnimationFrame(update);
            } else {
                lastFrameTime = 0;
            }
        };

        const requestUpdate = () => {
            if (disposed || frame) return;
            frame = window.requestAnimationFrame(update);
        };
        const requestMeasure = () => {
            if (disposed) return;
            needsMeasure = true;
            requestUpdate();
        };
        const requestViewportMeasure = () => {
            if (disposed) return;
            const nextWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;

            // Safari changes innerHeight while the address bar opens/closes.
            // Feeding those height-only events back into section geometry is
            // what makes the page appear to shake during native scrolling.
            if (isIOSWebKit && Math.abs(nextWidth - viewportWidth) < 1) return;
            requestMeasure();
        };

        const intersectionObserver =
            "IntersectionObserver" in window
                ? new IntersectionObserver(
                      ([entry]) => {
                          isNear = entry.isIntersecting;
                          if (isNear) requestMeasure();
                      },
                      { rootMargin: "100% 0px 100% 0px" },
                  )
                : null;
        intersectionObserver?.observe(section);

        const resizeObserver =
            "ResizeObserver" in window
                ? new ResizeObserver(requestViewportMeasure)
                : null;
        if (previousSection instanceof Element) {
            resizeObserver?.observe(previousSection);
        }

        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestViewportMeasure, {
            passive: true,
        });
        window.addEventListener("load", requestMeasure, { once: true });
        void document.fonts?.ready.then(requestMeasure);

        return () => {
            disposed = true;
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestViewportMeasure);
            window.removeEventListener("load", requestMeasure);
            intersectionObserver?.disconnect();
            resizeObserver?.disconnect();
            content.style.removeProperty("transform");
            content.style.removeProperty("will-change");
            root.style.removeProperty("height");
            root.style.removeProperty("transform");
            steps.forEach((step, index) => {
                step.style.removeProperty("transform");
                lastStepScales[index] = -1;
            });
            postFlow?.style.removeProperty("transform");
            postFlow?.style.removeProperty("margin-top");
            postFlow?.style.removeProperty("will-change");
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [postFlowSelector]);

    return (
        <div
            ref={rootRef}
            className="section-two-curtain-edge section-two-curtain-edge--direct-steps"
            aria-hidden="true"
        >
            {CURTAIN_STEPS.map((_, index) => (
                <span
                    key={index}
                    className="section-two-curtain-edge__step"
                    style={{
                        left: `calc(${(index * 100) / CURTAIN_STEPS.length}% - ${index === 0 ? 0 : 1}px)`,
                        width: `calc(${100 / CURTAIN_STEPS.length}% + 2px)`,
                    }}
                />
            ))}
        </div>
    );
}
