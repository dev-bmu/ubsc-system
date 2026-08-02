type ImmediateScrollHandler = (top: number) => void;
type SmoothScrollHandler = (top: number, durationMs: number) => void;

let immediateScrollHandler: ImmediateScrollHandler | null = null;
let smoothScrollHandler: SmoothScrollHandler | null = null;

export function registerImmediateScrollHandler(
    handler: ImmediateScrollHandler,
): () => void {
    immediateScrollHandler = handler;

    return () => {
        if (immediateScrollHandler === handler) {
            immediateScrollHandler = null;
        }
    };
}

export function registerSmoothScrollHandler(
    handler: SmoothScrollHandler,
): () => void {
    smoothScrollHandler = handler;

    return () => {
        if (smoothScrollHandler === handler) {
            smoothScrollHandler = null;
        }
    };
}

export function scrollWindowToImmediate(top: number): void {
    if (immediateScrollHandler) {
        immediateScrollHandler(top);
        return;
    }

    const root = document.documentElement;
    const body = document.body;
    const rootScrollBehavior = root.style.scrollBehavior;
    const bodyScrollBehavior = body.style.scrollBehavior;

    root.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    window.scrollTo({ top, behavior: "auto" });
    root.style.scrollBehavior = rootScrollBehavior;
    body.style.scrollBehavior = bodyScrollBehavior;
}

export function scrollWindowToSmooth(
    top: number,
    durationMs = 680,
): void {
    if (smoothScrollHandler) {
        smoothScrollHandler(top, durationMs);
        return;
    }

    window.scrollTo({ top, behavior: "smooth" });
}
