import '../css/app.css';
import './bootstrap';

import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot, hydrateRoot } from 'react-dom/client';

import type { PageProps } from "@/types";
import { AuthFlowProvider } from "@/Components/Landing/AuthFlowProvider";
import {
    registerImmediateScrollHandler,
    registerSmoothScrollHandler,
} from "@/lib/scrollCoordinator";
import { useEffect } from "react";
import Lenis from "lenis";
import React from "react";

const appName = import.meta.env.VITE_APP_NAME || 'UBSC';
const DESKTOP_SCROLL_LERP = 0.09;
const TOUCH_SCROLL_LERP = 0.115;
const TOUCH_INERTIA_LERP = 0.105;
const TOUCH_INERTIA_EXPONENT = 1.72;

const isIOS = () => {
    const userAgent = navigator.userAgent;
    return (
        /iP(?:hone|ad|od)/.test(userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
};

type ScrollDriver = "lenis-touch" | "lenis-wheel" | "native";

const addMediaQueryListener = (
    query: MediaQueryList,
    listener: () => void,
) => {
    if (typeof query.addEventListener === "function") {
        query.addEventListener("change", listener);
        return () => query.removeEventListener("change", listener);
    }

    query.addListener(listener);
    return () => query.removeListener(listener);
};

type AuthSessionState = {
    authenticated: boolean;
    user_id: number | string | null;
};

type ParsedAuthSessionState = {
    valid: boolean;
    userId: string | null;
};

const normalizeUserId = (userId: unknown): string | null =>
    userId === null || userId === undefined ? null : String(userId);

const parseAuthSessionState = (value: unknown): ParsedAuthSessionState => {
    if (!value || typeof value !== "object") {
        return { valid: false, userId: null };
    }

    const state = value as Partial<AuthSessionState>;

    if (state.authenticated === false && state.user_id === null) {
        return { valid: true, userId: null };
    }

    if (
        state.authenticated === true &&
        (typeof state.user_id === "number" ||
            (typeof state.user_id === "string" &&
                state.user_id.trim().length > 0))
    ) {
        return { valid: true, userId: normalizeUserId(state.user_id) };
    }

    return { valid: false, userId: null };
};

const userIdFromPageProps = (pageProps: unknown): string | null => {
    if (!pageProps || typeof pageProps !== "object") return null;

    const auth = (pageProps as Partial<PageProps>).auth;

    return normalizeUserId(auth?.user?.id);
};

const AUTH_SYNC_CHANNEL = "ubsc-auth-session-v1";
const AUTH_SYNC_STORAGE_KEY = "ubsc:auth-session:signal";
const AUTH_RECONCILE_HEADER = "X-Auth-Reconcile";
const AUTH_SAFETY_POLL_MS = 30_000;

type AuthSyncSignal = {
    version: 1;
    id: string;
    source: string;
    reason: "boundary" | "bootstrap";
    sentAt: number;
};

const createSignalId = () => {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isAuthSyncSignal = (value: unknown): value is AuthSyncSignal => {
    if (!value || typeof value !== "object") return false;

    const signal = value as Partial<AuthSyncSignal>;

    return (
        signal.version === 1 &&
        typeof signal.id === "string" &&
        signal.id.length > 0 &&
        typeof signal.source === "string" &&
        signal.source.length > 0 &&
        (signal.reason === "boundary" || signal.reason === "bootstrap") &&
        typeof signal.sentAt === "number"
    );
};

/**
 * The server session is the only source of truth. BroadcastChannel and the
 * storage event merely wake other tabs; every signal is verified through the
 * non-cacheable session endpoint before any UI is changed.
 */
function AuthSessionSynchronizer({
    children,
    initialUserId,
}: {
    children: React.ReactNode;
    initialUserId: number | string | null;
}) {
    useEffect(() => {
        let disposed = false;
        let currentUserId = normalizeUserId(initialUserId);
        let activeRequest: AbortController | null = null;
        let requestGeneration = 0;
        let requestQueued = false;
        let authResetPending = false;
        let pendingBoundaryReset: { userId: string | null } | null = null;
        let historyTraversalPending = false;
        let historyFallbackTimer: number | null = null;
        let reconciliationTimer: number | null = null;
        let externalVisitsInFlight = 0;
        let channel: BroadcastChannel | null = null;
        const tabId = createSignalId();
        const seenSignalIds = new Set<string>();

        const rememberSignal = (signalId: string) => {
            seenSignalIds.add(signalId);

            if (seenSignalIds.size > 64) {
                const oldest = seenSignalIds.values().next().value;
                if (typeof oldest === "string") {
                    seenSignalIds.delete(oldest);
                }
            }
        };

        const resetPageForAuthBoundary = (nextUserId: string | null) => {
            if (disposed || authResetPending) return;

            if (externalVisitsInFlight > 0) {
                pendingBoundaryReset = { userId: nextUserId };
                return;
            }

            pendingBoundaryReset = null;
            authResetPending = true;
            requestQueued = false;
            router.clearHistory();

            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete("auth");
            nextUrl.searchParams.delete("account");

            router.visit(
                `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
                {
                    method: "get",
                    replace: true,
                    preserveState: false,
                    preserveScroll: true,
                    fresh: true,
                    async: true,
                    showProgress: false,
                    headers: {
                        [AUTH_RECONCILE_HEADER]: "1",
                    },
                    onSuccess: (page) => {
                        currentUserId = userIdFromPageProps(page.props);

                        /*
                         * If the session changed again while the fresh page
                         * was loading, queue another authoritative check.
                         */
                        if (currentUserId !== nextUserId) {
                            requestQueued = true;
                        }
                    },
                    onFinish: () => {
                        authResetPending = false;

                        if (pendingBoundaryReset) {
                            const pending = pendingBoundaryReset;
                            pendingBoundaryReset = null;
                            resetPageForAuthBoundary(pending.userId);
                            return;
                        }

                        if (externalVisitsInFlight === 0 && requestQueued) {
                            requestQueued = false;
                            window.setTimeout(() => void reconcileAuth(), 0);
                        }
                    },
                },
            );
        };

        const reconcileAuth = async () => {
            if (disposed || authResetPending) return;

            if (externalVisitsInFlight > 0) {
                requestQueued = true;
                return;
            }

            if (activeRequest) {
                requestQueued = true;
                return;
            }

            const controller = new AbortController();
            const generation = ++requestGeneration;
            activeRequest = controller;

            try {
                const response = await fetch("/auth/session-state", {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        Accept: "application/json",
                        "Cache-Control": "no-cache",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                    signal: controller.signal,
                });

                if (!response.ok) return;

                const contentType = response.headers.get("Content-Type") ?? "";
                if (!contentType.toLowerCase().includes("application/json")) {
                    return;
                }

                const state = parseAuthSessionState(await response.json());

                if (
                    disposed ||
                    controller.signal.aborted ||
                    generation !== requestGeneration ||
                    !state.valid
                ) {
                    return;
                }

                if (state.userId !== currentUserId) {
                    resetPageForAuthBoundary(state.userId);
                }
            } catch (error) {
                if (
                    !(error instanceof DOMException) ||
                    error.name !== "AbortError"
                ) {
                    // A transient network failure must never mutate local auth
                    // state. The next history/focus boundary will retry.
                }
            } finally {
                if (activeRequest === controller) {
                    activeRequest = null;
                }

                if (!disposed && requestQueued) {
                    if (externalVisitsInFlight === 0) {
                        requestQueued = false;
                        window.setTimeout(() => void reconcileAuth(), 0);
                    }
                }
            }
        };

        const scheduleReconciliation = (delay = 40, urgent = false) => {
            if (disposed) return;

            if (urgent) {
                requestGeneration += 1;
                activeRequest?.abort();
                activeRequest = null;

                if (externalVisitsInFlight > 0) {
                    router.cancelAll({
                        async: true,
                        prefetch: true,
                        sync: true,
                    });
                    externalVisitsInFlight = 0;
                }
            }

            if (reconciliationTimer !== null) {
                window.clearTimeout(reconciliationTimer);
            }

            reconciliationTimer = window.setTimeout(() => {
                reconciliationTimer = null;
                void reconcileAuth();
            }, delay);
        };

        const receiveSignal = (value: unknown) => {
            if (!isAuthSyncSignal(value)) return;
            if (value.source === tabId || seenSignalIds.has(value.id)) return;

            rememberSignal(value.id);
            scheduleReconciliation(0, value.reason === "boundary");
        };

        const publishSignal = (reason: AuthSyncSignal["reason"]) => {
            const signal: AuthSyncSignal = {
                version: 1,
                id: createSignalId(),
                source: tabId,
                reason,
                sentAt: Date.now(),
            };

            rememberSignal(signal.id);

            try {
                channel?.postMessage(signal);
            } catch {
                // The storage signal and lifecycle checks remain available.
            }

            try {
                window.localStorage.setItem(
                    AUTH_SYNC_STORAGE_KEY,
                    JSON.stringify(signal),
                );
            } catch {
                // Safari private mode can deny storage; BroadcastChannel and
                // focus/pageshow reconciliation still cover that browser.
            }
        };

        const handleStorage = (event: StorageEvent) => {
            if (
                event.key !== AUTH_SYNC_STORAGE_KEY ||
                typeof event.newValue !== "string"
            ) {
                return;
            }

            try {
                receiveSignal(JSON.parse(event.newValue));
            } catch {
                // Ignore malformed third-party/local development values.
            }
        };

        const clearHistoryFallback = () => {
            if (historyFallbackTimer !== null) {
                window.clearTimeout(historyFallbackTimer);
                historyFallbackTimer = null;
            }
        };

        const completeHistoryReconciliation = () => {
            if (!historyTraversalPending) return;

            historyTraversalPending = false;
            clearHistoryFallback();
            scheduleReconciliation(0);
        };

        const handlePopState = () => {
            historyTraversalPending = true;
            clearHistoryFallback();

            // Inertia emits `navigate` after it has restored/decrypted the
            // destination page. This fallback also covers malformed or legacy
            // history entries that cannot emit that event. It intentionally
            // does not consume the pending flag: a slow device may emit
            // `navigate` later, and that restored page must be checked again.
            historyFallbackTimer = window.setTimeout(() => {
                if (historyTraversalPending) {
                    scheduleReconciliation(0);
                }
            }, 500);
        };

        const stopNavigateListener = router.on("navigate", (event) => {
            const nextUserId = userIdFromPageProps(event.detail.page.props);
            const identityChanged = nextUserId !== currentUserId;
            currentUserId = nextUserId;

            if (identityChanged && !authResetPending) {
                publishSignal("boundary");
                resetPageForAuthBoundary(nextUserId);
            }

            completeHistoryReconciliation();
        });

        const stopStartListener = router.on("start", (event) => {
            if (
                event.detail.visit.headers?.[AUTH_RECONCILE_HEADER] === "1"
            ) {
                return;
            }

            externalVisitsInFlight += 1;
            requestQueued = true;
            requestGeneration += 1;
            activeRequest?.abort();
            activeRequest = null;

            if (reconciliationTimer !== null) {
                window.clearTimeout(reconciliationTimer);
                reconciliationTimer = null;
            }
        });

        const stopFinishListener = router.on("finish", (event) => {
            if (
                event.detail.visit.headers?.[AUTH_RECONCILE_HEADER] === "1"
            ) {
                return;
            }

            externalVisitsInFlight = Math.max(
                0,
                externalVisitsInFlight - 1,
            );

            if (externalVisitsInFlight === 0 && pendingBoundaryReset) {
                const pending = pendingBoundaryReset;
                pendingBoundaryReset = null;
                resetPageForAuthBoundary(pending.userId);
                return;
            }

            if (externalVisitsInFlight === 0 && requestQueued) {
                requestQueued = false;
                scheduleReconciliation(0);
            }
        });

        const handlePageShow = (event: PageTransitionEvent) => {
            scheduleReconciliation(event.persisted ? 0 : 40);
        };

        const handleFocus = () => {
            scheduleReconciliation(25);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                scheduleReconciliation(25);
            }
        };

        const handleOnline = () => scheduleReconciliation(0);

        if ("BroadcastChannel" in window) {
            channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
            channel.addEventListener("message", (event) =>
                receiveSignal(event.data),
            );
        }

        window.addEventListener("popstate", handlePopState);
        window.addEventListener("pageshow", handlePageShow);
        window.addEventListener("focus", handleFocus);
        window.addEventListener("online", handleOnline);
        window.addEventListener("storage", handleStorage);
        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );

        const safetyPoll = window.setInterval(() => {
            if (
                document.visibilityState === "visible" &&
                navigator.onLine
            ) {
                scheduleReconciliation(0);
            }
        }, AUTH_SAFETY_POLL_MS);

        /*
         * This catches a tab initially opened in the background and full-page
         * OAuth redirects, both of which can miss a normal Inertia transition.
         */
        scheduleReconciliation(0);
        const bootstrapSignalTimer = window.setTimeout(
            () => publishSignal("bootstrap"),
            0,
        );

        return () => {
            disposed = true;
            requestGeneration += 1;
            activeRequest?.abort();
            clearHistoryFallback();
            window.clearInterval(safetyPoll);
            window.clearTimeout(bootstrapSignalTimer);
            if (reconciliationTimer !== null) {
                window.clearTimeout(reconciliationTimer);
            }
            channel?.close();
            stopNavigateListener();
            stopStartListener();
            stopFinishListener();
            window.removeEventListener("popstate", handlePopState);
            window.removeEventListener("pageshow", handlePageShow);
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("storage", handleStorage);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, [initialUserId]);

    return <>{children}</>;
}

function LenisProvider({ children }: { children: React.ReactNode }) {

    useEffect(() => {
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        const directTouch = window.matchMedia(
            "(hover: none) and (pointer: coarse)",
        );
        const root = document.documentElement;
        let lenis: Lenis | null = null;
        let scrollDriver: ScrollDriver | null = null;
        let nativeSmoothFrame = 0;
        let restoreNativeScrollBehavior: (() => void) | null = null;

        const stopNativeSmoothScroll = () => {
            if (nativeSmoothFrame) {
                window.cancelAnimationFrame(nativeSmoothFrame);
                nativeSmoothFrame = 0;
            }

            restoreNativeScrollBehavior?.();
            restoreNativeScrollBehavior = null;
        };

        const unregisterImmediateScrollHandler =
            registerImmediateScrollHandler((top) => {
                stopNativeSmoothScroll();

                if (lenis) {
                    lenis.scrollTo(top, {
                        immediate: true,
                        force: true,
                    });
                    return;
                }

                const rootScrollBehavior = root.style.scrollBehavior;
                const bodyScrollBehavior = document.body.style.scrollBehavior;

                root.style.scrollBehavior = "auto";
                document.body.style.scrollBehavior = "auto";
                window.scrollTo({ top, behavior: "auto" });
                root.style.scrollBehavior = rootScrollBehavior;
                document.body.style.scrollBehavior = bodyScrollBehavior;
            });
        const unregisterSmoothScrollHandler = registerSmoothScrollHandler(
            (top, durationMs) => {
                stopNativeSmoothScroll();

                if (reducedMotion.matches) {
                    if (lenis) {
                        lenis.scrollTo(top, {
                            immediate: true,
                            force: true,
                        });
                    } else {
                        window.scrollTo({ top, behavior: "auto" });
                    }
                    return;
                }

                const destination = Math.max(0, top);

                if (lenis) {
                    lenis.scrollTo(destination, {
                        duration: durationMs / 1000,
                        easing: (progress) =>
                            1 - Math.pow(1 - progress, 4),
                        force: true,
                    });
                    return;
                }

                const startTop = window.scrollY;
                const distance = destination - startTop;
                const startedAt = performance.now();
                const rootScrollBehavior = root.style.scrollBehavior;
                const bodyScrollBehavior =
                    document.body.style.scrollBehavior;

                root.style.scrollBehavior = "auto";
                document.body.style.scrollBehavior = "auto";
                restoreNativeScrollBehavior = () => {
                    root.style.scrollBehavior = rootScrollBehavior;
                    document.body.style.scrollBehavior =
                        bodyScrollBehavior;
                };

                const animate = (now: number) => {
                    const progress = Math.min(
                        1,
                        (now - startedAt) / durationMs,
                    );
                    const eased = 1 - Math.pow(1 - progress, 4);

                    window.scrollTo({
                        top: startTop + distance * eased,
                        behavior: "auto",
                    });

                    if (progress < 1) {
                        nativeSmoothFrame =
                            window.requestAnimationFrame(animate);
                        return;
                    }

                    nativeSmoothFrame = 0;
                    restoreNativeScrollBehavior?.();
                    restoreNativeScrollBehavior = null;
                };

                nativeSmoothFrame = window.requestAnimationFrame(animate);
            },
        );

        const stopLenis = () => {
            lenis?.destroy();
            lenis = null;
        };

        const startLenis = (usesDirectTouch: boolean) => {
            const scrollLerp = usesDirectTouch
                ? TOUCH_SCROLL_LERP
                : DESKTOP_SCROLL_LERP;
            const supportsAutoToggle =
                typeof CSS !== "undefined" &&
                typeof CSS.supports === "function" &&
                CSS.supports("transition-behavior", "allow-discrete");

            lenis = new Lenis({
                lerp: scrollLerp,
                smoothWheel: true,
                syncTouch: usesDirectTouch,
                syncTouchLerp: TOUCH_INERTIA_LERP,
                touchInertiaExponent: TOUCH_INERTIA_EXPONENT,
                touchMultiplier: 1,
                wheelMultiplier: 1,
                orientation: "vertical",
                gestureOrientation: "vertical",
                autoRaf: true,
                autoResize: true,
                autoToggle: supportsAutoToggle,
                anchors: {
                    lerp: scrollLerp,
                },
                stopInertiaOnNavigate: true,
                overscroll: true,
                allowNestedScroll: false,
            });
        };

        const reconcileScrollDriver = () => {
            const nextDriver: ScrollDriver =
                reducedMotion.matches || isIOS()
                    ? "native"
                    : directTouch.matches
                      ? "lenis-touch"
                      : "lenis-wheel";

            if (nextDriver === scrollDriver) return;

            stopLenis();
            scrollDriver = nextDriver;
            root.dataset.scrollDriver = nextDriver;

            if (nextDriver !== "native") {
                startLenis(nextDriver === "lenis-touch");
            }
        };

        reconcileScrollDriver();
        const removeReducedMotionListener = addMediaQueryListener(
            reducedMotion,
            reconcileScrollDriver,
        );
        const removeDirectTouchListener = addMediaQueryListener(
            directTouch,
            reconcileScrollDriver,
        );

        return () => {
            removeReducedMotionListener();
            removeDirectTouchListener();
            unregisterImmediateScrollHandler();
            unregisterSmoothScrollHandler();
            stopNativeSmoothScroll();
            stopLenis();
            delete root.dataset.scrollDriver;
        };
    }, []);

    return <>{children}</>;
}

const redirectLoopbackAliasToCanonicalOrigin = () => {
    if (typeof window === "undefined") return false;

    const ziggy = (
        window as Window & {
            Ziggy?: { url?: string };
        }
    ).Ziggy;

    if (typeof ziggy?.url !== "string" || ziggy.url.trim() === "") {
        return false;
    }

    try {
        const current = new URL(window.location.href);
        const canonical = new URL(ziggy.url);
        const loopbackHosts = new Set([
            "localhost",
            "127.0.0.1",
            "::1",
            "[::1]",
        ]);

        if (
            current.origin === canonical.origin ||
            !loopbackHosts.has(current.hostname) ||
            !loopbackHosts.has(canonical.hostname)
        ) {
            return false;
        }

        window.location.replace(
            `${canonical.origin}${current.pathname}${current.search}${current.hash}`,
        );

        return true;
    } catch {
        return false;
    }
};

const bootApplication = () => createInertiaApp({
    title: (title) => title.includes(appName) ? title : `${title} - ${appName}`,

    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ),

    setup({ el, App, props }) {
        const initialPageProps = props.initialPage.props as Partial<PageProps> & {
            errors?: unknown;
        };
        const initialUserId = initialPageProps.auth?.user?.id ?? null;
        const tree = (
            <React.StrictMode>
                <AuthSessionSynchronizer initialUserId={initialUserId}>
                    <LenisProvider>
                        <AuthFlowProvider
                            initialAuthenticated={initialUserId !== null}
                            initialErrors={initialPageProps.errors}
                        >
                            <App {...props} />
                        </AuthFlowProvider>
                    </LenisProvider>
                </AuthSessionSynchronizer>
            </React.StrictMode>
        );

        if (el.hasChildNodes()) {
            hydrateRoot(el, tree);
        } else {
            createRoot(el).render(tree);
        }
    },

    progress: {
        color: '#4B5563',
    },
});

if (!redirectLoopbackAliasToCanonicalOrigin()) {
    void bootApplication();
}
