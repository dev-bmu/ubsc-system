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
        let viewportHeight = 1;
        let sectionTop = 0;
        let followStart = 0.22;
        let followHold = 0.62;
        let maxFollow = 0;
        let lastTravel = -1;
        let lastShape = -1;
        let lastFollow = Number.NaN;
        let postFlowReleased = false;
        const previousSection = section.previousElementSibling;

        const measure = () => {
            const viewportWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;
            viewportHeight =
                window.innerHeight ||
                document.documentElement.clientHeight ||
                1;
            sectionTop =
                section.getBoundingClientRect().top +
                (window.scrollY || document.documentElement.scrollTop || 0);

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
            maxFollow =
                Math.max(
                    0,
                    followHold * viewportHeight * followRatio - followInset,
                ) * Math.pow(holdShape, 0.68);

            root.style.height = `${viewportHeight}px`;
            needsMeasure = false;
        };

        const update = () => {
            frame = 0;
            if (!isNear && !needsMeasure) return;
            if (needsMeasure) measure();

            const scrollTop =
                window.scrollY || document.documentElement.scrollTop || 0;
            const rawTravel = Math.min(
                1,
                Math.max(
                    0,
                    (viewportHeight - (sectionTop - scrollTop)) /
                        viewportHeight,
                ),
            );
            const travel = scrollTop <= 1 ? 0 : rawTravel;
            const shape = Math.sin(travel * Math.PI);

            if (Math.abs(travel - lastTravel) > 0.0001) {
                root.style.transform = `translate3d(0, 0, 0) scaleY(${travel})`;
                lastTravel = travel;
            }

            if (Math.abs(shape - lastShape) > 0.0005) {
                steps.forEach((step, index) => {
                    const minimumHeight = CURTAIN_STEPS[index] / 100;
                    const scale = 1 - shape * (1 - minimumHeight);
                    step.style.transform = `translate3d(0, 0, 0) scaleY(${scale})`;
                });
                lastShape = shape;
            }

            const progress = Math.min(
                1,
                Math.max(0, (travel - followStart) / (followHold - followStart)),
            );
            const eased = progress * progress * (3 - 2 * progress);
            const follow = -maxFollow * eased;
            const followChanged =
                !Number.isFinite(lastFollow) ||
                Math.abs(follow - lastFollow) > 0.05;

            if (followChanged) {
                content.style.transform = `translate3d(0, ${follow}px, 0)`;
                lastFollow = follow;
            }

            if (!postFlow) return;

            if (progress >= 0.999) {
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
                ? new ResizeObserver(requestMeasure)
                : null;
        if (previousSection instanceof Element) {
            resizeObserver?.observe(previousSection);
        }

        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestMeasure, { passive: true });
        window.addEventListener("load", requestMeasure, { once: true });
        void document.fonts?.ready.then(requestMeasure);

        return () => {
            disposed = true;
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestMeasure);
            window.removeEventListener("load", requestMeasure);
            intersectionObserver?.disconnect();
            resizeObserver?.disconnect();
            content.style.removeProperty("transform");
            root.style.removeProperty("height");
            root.style.removeProperty("transform");
            steps.forEach((step) => step.style.removeProperty("transform"));
            postFlow?.style.removeProperty("transform");
            postFlow?.style.removeProperty("margin-top");
            postFlow?.style.removeProperty("will-change");
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [postFlowSelector]);

    return (
        <div
            ref={rootRef}
            className="section-two-curtain-edge"
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
